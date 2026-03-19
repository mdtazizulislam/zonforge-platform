import Anthropic from '@anthropic-ai/sdk'
import { eq, and } from 'drizzle-orm'
import { Queue, Worker, type Job } from 'bullmq'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import { env } from '@zonforge/config'
import type { LlmNarrative } from '@zonforge/shared-types'
import {
  QUEUE_NAMES, createQueue, getQueueConnection,
} from '@zonforge/ingestion-service/queues'

const log = createLogger({ service: 'alert-service:llm-narrative' })

// ─────────────────────────────────────────────
// LLM NARRATIVE WORKER
//
// Generates natural-language investigation summaries
// for P1 and P2 alerts using Claude Sonnet.
//
// Output structure:
//   {
//     whatHappened:          "2-3 sentence summary"
//     whyItMatters:          "1-2 sentences on risk"
//     recommendedNextSteps:  ["step 1", "step 2", ...]
//     confidenceAssessment:  "why we're confident/uncertain"
//   }
//
// Fallback: template-based narrative if Anthropic API unavailable.
// Alert creation is NEVER blocked by LLM availability.
// ─────────────────────────────────────────────

export interface NarrativeJob {
  alertId:        string
  tenantId:       string
  alertTitle:     string
  severity:       string
  priority:       string
  entityType:     string
  entityId:       string
  mitreTactics:   string[]
  mitreTechniques: string[]
  evidenceCount:  number
  recommendedActions: string[]
  metadata:       Record<string, unknown>
}

const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_PROMPT = `You are ZonForge Sentinel, an AI security analyst assistant.
Your job is to generate concise, actionable investigation narratives for security alerts.

RULES:
- Write for a security analyst audience — precise, technical, clear
- Never speculate beyond the evidence provided
- Keep language direct and professional
- Prioritize actionability
- Never repeat the same information twice
- Output ONLY valid JSON — no markdown, no preamble

OUTPUT FORMAT (strict JSON):
{
  "whatHappened": "2-3 sentence description of the security event",
  "whyItMatters": "1-2 sentences on why this poses risk to the organization",
  "recommendedNextSteps": ["action 1", "action 2", "action 3"],
  "confidenceAssessment": "brief statement on signal confidence and any caveats"
}`

// ─────────────────────────────────────────────
// NARRATIVE GENERATOR
// ─────────────────────────────────────────────

export class LlmNarrativeService {
  private readonly client: Anthropic | null

  constructor() {
    const apiKey = process.env['ZONFORGE_ANTHROPIC_API_KEY']
    this.client  = apiKey ? new Anthropic({ apiKey }) : null

    if (!this.client) {
      log.warn('Anthropic API key not configured — LLM narratives will use template fallback')
    }
  }

  // ── Generate narrative for a single alert ──

  async generateNarrative(job: NarrativeJob): Promise<LlmNarrative> {
    if (!this.client) {
      return this.buildTemplateNarrative(job)
    }

    const userPrompt = this.buildPrompt(job)

    try {
      const message = await this.client.messages.create({
        model:      MODEL,
        max_tokens: 800,
        system:     SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const text = message.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')

      // Parse JSON — strip any accidental markdown fences
      const clean   = text.replace(/```json|```/g, '').trim()
      const parsed  = JSON.parse(clean) as {
        whatHappened:          string
        whyItMatters:          string
        recommendedNextSteps:  string[]
        confidenceAssessment:  string
      }

      log.debug({
        alertId: job.alertId,
        model:   MODEL,
      }, 'LLM narrative generated')

      return {
        whatHappened:         parsed.whatHappened,
        whyItMatters:         parsed.whyItMatters,
        recommendedNextSteps: parsed.recommendedNextSteps,
        confidenceAssessment: parsed.confidenceAssessment,
        generatedAt:          new Date(),
        modelUsed:            MODEL,
      }
    } catch (err) {
      log.warn({ err, alertId: job.alertId }, 'LLM narrative generation failed — using template')
      return this.buildTemplateNarrative(job)
    }
  }

  // ── Build prompt from alert context ───────

  private buildPrompt(job: NarrativeJob): string {
    const mitreContext = job.mitreTechniques.length > 0
      ? `MITRE ATT&CK: ${job.mitreTechniques.join(', ')} (${job.mitreTactics.join(', ')})`
      : 'MITRE ATT&CK: Unknown'

    return `Generate an investigation narrative for this security alert:

ALERT TITLE: ${job.alertTitle}
SEVERITY: ${job.severity.toUpperCase()}
PRIORITY: ${job.priority}
ENTITY TYPE: ${job.entityType}
ENTITY ID: ${job.entityId}
${mitreContext}
EVIDENCE EVENTS: ${job.evidenceCount} corroborating events
RECOMMENDED ACTIONS FROM DETECTION:
${job.recommendedActions.slice(0, 5).map((a, i) => `${i + 1}. ${a}`).join('\n')}

Generate a concise analyst narrative explaining what happened, why it matters,
what the analyst should investigate next, and your confidence assessment.
Output ONLY the JSON object described in the system prompt.`
  }

  // ── Template fallback (no API key / API down) ─

  private buildTemplateNarrative(job: NarrativeJob): LlmNarrative {
    const severityMap: Record<string, string> = {
      critical: 'a critical',
      high:     'a high-severity',
      medium:   'a medium-severity',
      low:      'a low-severity',
    }
    const sevLabel = severityMap[job.severity] ?? 'a'

    return {
      whatHappened: `${sevLabel} security event was detected for ${job.entityType} ${job.entityId}. `
        + `The detection rule identified ${job.evidenceCount} corroborating events `
        + `matching the pattern: "${job.alertTitle}". `
        + (job.mitreTechniques.length > 0
          ? `Associated MITRE ATT&CK techniques: ${job.mitreTechniques.join(', ')}.`
          : ''),
      whyItMatters:
        `This event pattern is associated with ${job.mitreTactics.join(' and ')} activity. `
        + `Without investigation and response, this could indicate an active attack or security incident.`,
      recommendedNextSteps: job.recommendedActions.slice(0, 5),
      confidenceAssessment:
        `Detection is based on ${job.evidenceCount} corroborating events. `
        + `Analyst review is required to confirm or dismiss this finding.`,
      generatedAt: new Date(),
      modelUsed:   'template-fallback',
    }
  }
}

// ─────────────────────────────────────────────
// BullMQ WORKER
// ─────────────────────────────────────────────

export function createNarrativeWorker(
  narrativeService: LlmNarrativeService,
  connection:       ReturnType<typeof getQueueConnection>,
): Worker<NarrativeJob> {
  const worker = new Worker<NarrativeJob>(
    QUEUE_NAMES.LLM_NARRATIVES,
    async (job: Job<NarrativeJob>) => {
      const { alertId, tenantId } = job.data

      // Acquire lock to prevent duplicate generation
      const lockKey = `zf:platform:llm:lock:${alertId}`
      const lock    = await getRedis().setex(lockKey, 120, '1')
      if (!lock) return   // already being generated

      try {
        const narrative = await narrativeService.generateNarrative(job.data)

        // Save to DB
        const db = getDb()
        await db.update(schema.alerts)
          .set({
            llmNarrative:           narrative,
            llmNarrativeGeneratedAt: narrative.generatedAt,
            updatedAt:              new Date(),
          })
          .where(and(
            eq(schema.alerts.id,       alertId),
            eq(schema.alerts.tenantId, tenantId),
          ))

        log.info({
          alertId,
          model: narrative.modelUsed,
        }, 'Narrative saved to alert')

      } finally {
        await getRedis().del(lockKey)
      }
    },
    {
      connection,
      concurrency: 3,    // 3 parallel LLM calls max
      limiter: {
        max:      10,    // max 10 LLM calls per minute (cost control)
        duration: 60_000,
      },
    },
  )

  worker.on('failed', (job, err) => {
    log.error({ err, alertId: job?.data.alertId }, 'Narrative job failed')
  })

  return worker
}

// Module-level Redis accessor (set at startup)
let _redis: import('ioredis').default | null = null
export function setRedis(r: import('ioredis').default) { _redis = r }
function getRedis() {
  if (!_redis) throw new Error('Redis not set in narrative worker')
  return _redis
}
