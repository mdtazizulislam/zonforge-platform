import Anthropic from '@anthropic-ai/sdk'
import { createLogger } from '@zonforge/logger'
import { EvidenceCollector } from '../tools/evidence-collector.js'
import {
  ANALYST_TOOLS,
  type AgentThought, type EvidenceItem, type InvestigationResult,
  type Verdict, type SeverityRecommendation, type ToolName,
} from '../models/investigation.js'
import { v4 as uuid } from 'uuid'

const log = createLogger({ service: 'ai-soc-analyst:agent' })

// ─────────────────────────────────────────────
// AI SOC ANALYST AGENT
//
// Agentic investigation loop using Claude tool use:
//   1. Receives alert context
//   2. Forms initial hypotheses
//   3. Calls investigation tools iteratively
//   4. Builds evidence chain
//   5. Reaches verdict with confidence score
//   6. Writes detailed investigation report
//
// Model: claude-sonnet-4-6 (balanced speed/quality)
// Max steps: configurable (default 10)
// ─────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `You are an elite Tier-3 Security Operations Center (SOC) analyst with 15 years of incident response experience. You work for ZonForge Sentinel, an AI-powered cybersecurity platform.

Your mission: Independently investigate security alerts to determine if they represent real threats (True Positive) or benign activity (False Positive).

## Your Investigation Process

1. **ORIENT**: Read the alert carefully. Identify the who/what/when/where.
2. **HYPOTHESIZE**: Form 2-3 competing hypotheses (attack vs. benign explanations).
3. **INVESTIGATE**: Use your tools methodically to gather evidence for each hypothesis.
4. **ANALYZE**: Weigh evidence for and against each hypothesis.
5. **CONCLUDE**: Reach a verdict with confidence level.
6. **REPORT**: Write a clear, concise investigation report.

## Investigation Tools Available
Use these tools to gather evidence. Think carefully about which tools to call and in what order.

## Verdict Options
- **true_positive**: Confirmed malicious activity. Real attack.
- **false_positive**: Benign activity. No threat.
- **true_positive_benign**: Attack pattern but authorized (pen test, admin action).
- **insufficient_evidence**: Cannot determine — escalate.
- **escalate**: Requires human analyst with specialized knowledge.

## Output Format
After investigation, provide a JSON block at the end:

\`\`\`json
{
  "verdict": "<one of the verdict options>",
  "confidence": <0-100>,
  "severity_recommendation": "<critical|high|medium|low|info>",
  "requires_human_review": <true|false>,
  "executive_summary": "<2-3 sentence summary>",
  "attack_narrative": "<detailed description of what happened or why it's benign>",
  "ioc_list": ["<ip>", "<email>", "<domain>", ...],
  "recommendations": ["<action 1>", "<action 2>", ...]
}
\`\`\`

## Rules
- Be objective and evidence-based
- Do not jump to conclusions without tool evidence
- Acknowledge uncertainty honestly
- A false positive costs analyst time; a missed true positive enables breaches
- Always check IP reputation for external IPs
- Always check related alerts for pattern recognition
- Always check user risk score for context`

export class AiSocAnalystAgent {
  private readonly client: Anthropic

  constructor() {
    const apiKey = process.env['ZONFORGE_ANTHROPIC_API_KEY'] ?? process.env['ANTHROPIC_API_KEY']
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured — AI SOC Analyst requires Anthropic API access')
    }
    this.client = new Anthropic({ apiKey })
  }

  // ── Main investigation entry point ───────────

  async investigate(
    alertId:    string,
    tenantId:   string,
    maxSteps:   number = 10,
  ): Promise<Omit<InvestigationResult, 'id' | 'tenantId' | 'alertId' | 'status' | 'humanReviewedBy' | 'humanVerdict' | 'humanNotes' | 'reviewedAt'>> {
    const startedAt = new Date()
    const collector = new EvidenceCollector(tenantId)
    const thoughts:  AgentThought[] = []
    const evidence:  EvidenceItem[] = []
    let   totalTokens = 0
    let   step        = 0

    // ── Fetch initial alert context ───────────

    const { result: alertData } = await collector.dispatch('get_alert_details', { alert_id: alertId })
    const alert = alertData as any

    const initialUserMessage = `
## Security Alert Investigation Request

**Alert ID:** ${alertId}
**Title:** ${alert?.title ?? 'Unknown Alert'}
**Severity:** ${alert?.severity ?? 'unknown'}
**Priority:** ${alert?.priority ?? 'unknown'}
**Status:** ${alert?.status ?? 'open'}
**Created:** ${alert?.createdAt ?? 'unknown'}

**Affected Entity:** ${alert?.affectedUserId ?? 'unknown'}
**Source IP:** ${alert?.affectedIp ?? 'none'}

**MITRE Techniques:** ${JSON.stringify(alert?.mitreTechniques ?? [])}
**Evidence:** ${JSON.stringify(alert?.evidence ?? [])}

Please investigate this alert thoroughly and determine if it is a true positive or false positive. Use your available tools to gather evidence before reaching a conclusion.
    `.trim()

    // ── Agentic loop ──────────────────────────

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: initialUserMessage },
    ]

    let response: Anthropic.Message | null = null

    while (step < maxSteps) {
      step++

      log.debug({ step, maxSteps, alertId }, 'Agent step')

      response = await this.client.messages.create({
        model:       'claude-sonnet-4-6',
        max_tokens:  4096,
        system:      AGENT_SYSTEM_PROMPT,
        tools:       ANALYST_TOOLS as any,
        messages,
      } as any) as Anthropic.Message

      totalTokens += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

      // Parse response content
      for (const block of response.content as any[]) {
        if (block.type === 'text') {
          thoughts.push({
            step,
            type:      'reasoning',
            content:   block.text,
            timestamp: new Date(),
            tokensUsed: response.usage?.output_tokens,
          })
        } else if (block.type === 'tool_use') {
          const toolName  = block.name as ToolName
          const toolInput = block.input as Record<string, unknown>

          thoughts.push({
            step,
            type:      'tool_call',
            content:   `Calling tool: ${toolName}`,
            toolName,
            toolInput,
            timestamp: new Date(),
          })

          log.debug({ toolName, input: toolInput }, '  🔧 Tool call')

          // Execute tool
          let toolResult: unknown
          let toolError:  string | null = null

          try {
            const { result, evidence: ev } = await collector.dispatch(toolName, toolInput)
            toolResult = result
            evidence.push(ev)

            thoughts.push({
              step,
              type:       'observation',
              content:    `Tool ${toolName} returned ${JSON.stringify(result).slice(0, 200)}…`,
              toolName,
              toolOutput: result,
              timestamp:  new Date(),
            })
          } catch (err) {
            toolError  = err instanceof Error ? err.message : String(err)
            toolResult = { error: toolError }
            log.warn({ toolName, err }, 'Tool call failed')
          }

          // Add to conversation
          messages.push({ role: 'assistant', content: response.content })
          messages.push({
            role: 'user',
            content: [{
              type:        'tool_result',
              tool_use_id: block.id,
              content:     JSON.stringify(toolResult),
            }] as any,
          })
        }
      }

      // Stop if agent is done (no tool calls)
      if ((response as any).stop_reason === 'end_turn') break

      // Add assistant message for next iteration (if we continue)
      if ((response as any).stop_reason !== 'end_turn') {
        messages.push({ role: 'assistant', content: response.content })
      }
    }

    // ── Parse final verdict from last text block ─

    const finalText = response?.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('\n') ?? ''

    const { verdict, confidence, severityRec, requiresHuman,
            executiveSummary, attackNarrative, iocList, recommendations,
            hypotheses } = this.parseVerdict(finalText, alert)

    const durationMs = Date.now() - startedAt.getTime()

    const detailedReport = this.buildDetailedReport(
      alert, verdict, confidence, evidence, thoughts, attackNarrative, recommendations,
    )

    log.info({
      alertId, verdict, confidence, steps: step, tokens: totalTokens, durationMs,
    }, `🔍 Investigation complete: ${verdict} (${confidence}% confidence)`)

    return {
      alertTitle:       alert?.title ?? alertId,
      alertSeverity:    alert?.severity ?? 'unknown',
      verdict,
      confidence,
      severityRec,
      requiresHuman,
      thoughts,
      hypotheses,
      evidence,
      executiveSummary,
      detailedReport,
      attackNarrative,
      iocList,
      recommendations,
      agentModel:       'claude-sonnet-4-6',
      totalSteps:       step,
      totalTokens,
      durationMs,
      startedAt,
      completedAt:      new Date(),
    }
  }

  // ── Parse JSON verdict from agent response ────

  private parseVerdict(text: string, alert: any): {
    verdict:          Verdict
    confidence:       number
    severityRec:      SeverityRecommendation
    requiresHuman:    boolean
    executiveSummary: string
    attackNarrative:  string
    iocList:          string[]
    recommendations:  string[]
    hypotheses:       string[]
  } {
    // Extract JSON block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]!) as any
        return {
          verdict:          parsed.verdict ?? 'insufficient_evidence',
          confidence:       parsed.confidence ?? 50,
          severityRec:      parsed.severity_recommendation ?? alert?.severity ?? 'medium',
          requiresHuman:    parsed.requires_human_review ?? parsed.confidence < 70,
          executiveSummary: parsed.executive_summary ?? '',
          attackNarrative:  parsed.attack_narrative ?? '',
          iocList:          parsed.ioc_list ?? [],
          recommendations:  parsed.recommendations ?? [],
          hypotheses:       [],
        }
      } catch { /* fall through to defaults */ }
    }

    // Fallback: infer from text
    const lowerText = text.toLowerCase()
    const verdict: Verdict = lowerText.includes('true positive') ? 'true_positive'
      : lowerText.includes('false positive') ? 'false_positive'
      : 'insufficient_evidence'

    return {
      verdict,
      confidence:       50,
      severityRec:      (alert?.severity as SeverityRecommendation) ?? 'medium',
      requiresHuman:    true,
      executiveSummary: text.slice(0, 300),
      attackNarrative:  text.slice(0, 1000),
      iocList:          [],
      recommendations:  ['Manual analyst review required'],
      hypotheses:       [],
    }
  }

  // ── Build detailed markdown report ───────────

  private buildDetailedReport(
    alert:           any,
    verdict:         Verdict,
    confidence:      number,
    evidence:        EvidenceItem[],
    thoughts:        AgentThought[],
    narrative:       string,
    recommendations: string[],
  ): string {
    const verdictEmoji = verdict === 'true_positive' ? '🔴 TRUE POSITIVE'
      : verdict === 'false_positive' ? '🟢 FALSE POSITIVE'
      : verdict === 'true_positive_benign' ? '🟡 AUTHORIZED ACTIVITY'
      : '⚪ INSUFFICIENT EVIDENCE'

    const tpEvidence = evidence.filter(e => e.supportsTP)
    const fpEvidence = evidence.filter(e => e.supportsFP)

    return `# AI SOC Analyst Investigation Report

## ${verdictEmoji}
**Confidence:** ${confidence}%
**Alert:** ${alert?.title ?? 'Unknown'}
**Severity:** ${alert?.severity?.toUpperCase()}

---

## Attack Narrative

${narrative}

---

## Evidence Supporting TRUE POSITIVE (${tpEvidence.length} items)

${tpEvidence.map(e => `### ${e.title}\n${e.description}`).join('\n\n') || '_No TP-supporting evidence found_'}

---

## Evidence Supporting FALSE POSITIVE (${fpEvidence.length} items)

${fpEvidence.map(e => `### ${e.title}\n${e.description}`).join('\n\n') || '_No FP-supporting evidence found_'}

---

## Investigation Steps (${thoughts.filter(t => t.type === 'tool_call').length} tools used)

${thoughts
  .filter(t => t.type === 'tool_call' || t.type === 'observation')
  .slice(0, 20)
  .map((t, i) => `${i + 1}. **${t.toolName ?? t.type}**: ${t.content.slice(0, 200)}`)
  .join('\n')}

---

## Recommendations

${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---
_Generated by ZonForge AI SOC Analyst · claude-sonnet-4-6 · ${new Date().toISOString()}_
`
  }
}
