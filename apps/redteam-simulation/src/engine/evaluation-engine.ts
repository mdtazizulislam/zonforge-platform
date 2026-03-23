import { eq, and, gte, inArray } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type {
  SimulationResult, DetectionObservation, SecurityScore,
  CategoryScore, ScenarioDefinition,
} from '../models/simulation-result.js'
import { scoreToGrade, GRADE_THRESHOLDS } from '../models/simulation-result.js'

const log = createLogger({ service: 'redteam:evaluation-engine' })

// ─────────────────────────────────────────────
// EVALUATION ENGINE
//
// After simulation events are injected, waits
// for the detection pipeline to process them
// (default: 30s), then checks whether expected
// detection rules fired.
//
// Checks in order:
//   1. Did any alert get created for this tenant
//      within the detection window?
//   2. Does any alert's ruleId match expected rules?
//   3. Does the severity match?
//   4. Calculate detection gap (injection → alert)
// ─────────────────────────────────────────────

const POLL_INTERVAL_MS = 3_000    // check every 3 seconds
const MAX_POLLS        = 15       // 15 × 3s = 45s max wait

export class EvaluationEngine {

  // ── Evaluate a completed simulation ──────────

  async evaluate(
    result:         SimulationResult,
    scenario:       ScenarioDefinition,
    detectionWindowMs?: number,
  ): Promise<SimulationResult> {
    const windowMs = detectionWindowMs ?? scenario.evaluation.detection_window_ms
    const evalStart = new Date()

    log.info({
      simId:    result.id,
      marker:   result.simulationMarker,
      windowMs,
    }, 'Starting detection evaluation')

    // Poll for alerts created after simulation started
    const detections = await this.pollForDetections(
      result.tenantId,
      result.simulationMarker,
      result.startedAt,
      windowMs,
      scenario.expected_detections,
    )

    // Match detected rules to expected rules
    const foundRuleIds = new Set(detections.map(d => d.ruleId))
    const gapRules     = scenario.expected_detections.filter(r => !foundRuleIds.has(r))
    const hitRules     = scenario.expected_detections.filter(r => foundRuleIds.has(r))

    const detectionRatePct = scenario.expected_detections.length > 0
      ? Math.round((hitRules.length / scenario.expected_detections.length) * 100)
      : 100

    // Determine evaluation status
    const passThreshold = scenario.evaluation.pass_threshold_pct
    const evaluationStatus =
      detectionRatePct >= 100               ? 'pass'
      : detectionRatePct >= passThreshold   ? 'partial'
      : Date.now() - evalStart.getTime() >= windowMs ? 'timeout'
      : 'fail'

    // Average detection gap
    const avgGapMs = detections.length > 0
      ? Math.round(detections.reduce((s, d) => s + d.detectionGapMs, 0) / detections.length)
      : undefined

    // Generate gaps and recommendations
    const gaps: string[] = []
    const recommendations: string[] = []

    for (const ruleId of gapRules) {
      gaps.push(`Detection rule ${ruleId} did not fire during ${scenario.name} simulation`)
      recommendations.push(`Review rule ${ruleId}: ensure it covers the simulated event pattern`)
    }

    if (evaluationStatus === 'fail') {
      recommendations.push(`Detection rate ${detectionRatePct}% is below threshold ${passThreshold}%`)
      recommendations.push('Consider adding more detection rules for this attack category')
    }

    if (avgGapMs !== undefined && avgGapMs > 60_000) {
      gaps.push(`Detection lag is high: ${Math.round(avgGapMs / 1000)}s average`)
      recommendations.push('Review normalization and detection pipeline performance')
    }

    const updated: SimulationResult = {
      ...result,
      status:            'completed',
      completedAt:       new Date(),
      durationMs:        Date.now() - result.startedAt.getTime(),
      detectionsFound:   detections.length,
      detections,
      evaluationStatus,
      detectionRatePct,
      gapRules,
      ...(avgGapMs !== undefined ? { detectionGapMs: avgGapMs } : {}),
      summary:           this.buildSummary(scenario.name, detectionRatePct, evaluationStatus, detections, gapRules),
      gaps,
      recommendations,
    }

    log.info({
      simId:            result.id,
      evaluationStatus,
      detectionRatePct,
      found:            detections.length,
      expected:         scenario.expected_detections.length,
      gaps:             gapRules,
    }, evaluationStatus === 'pass'
      ? `✅ SIMULATION PASS: ${scenario.name}`
      : `❌ SIMULATION ${evaluationStatus.toUpperCase()}: ${scenario.name}`,
    )

    return updated
  }

  // ── Poll DB for alerts matching simulation ────

  private async pollForDetections(
    tenantId:    string,
    simMarker:   string,
    injectionStart: Date,
    windowMs:    number,
    expectedRules: string[],
  ): Promise<DetectionObservation[]> {
    const db          = getDb()
    const deadline    = injectionStart.getTime() + windowMs
    const detections: DetectionObservation[] = []
    const foundRuleIds = new Set<string>()

    for (let poll = 0; poll < MAX_POLLS; poll++) {
      // Wait before checking (give pipeline time to process)
      await sleep(POLL_INTERVAL_MS)

      if (Date.now() > deadline) break

      // Check for alerts created after simulation started
      // that reference our simulation marker or match expected rule patterns
      const alerts = await db.select({
        id:         schema.alerts.id,
        findingId:  schema.alerts.findingId,
        severity:   schema.alerts.severity,
        createdAt:  schema.alerts.createdAt,
        metadata:   schema.alerts.metadata,
      })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, tenantId),
          gte(schema.alerts.createdAt, injectionStart),
        ))
        .limit(50)

      for (const alert of alerts) {
        const alertMeta = (alert.metadata as Record<string, unknown>) ?? {}

        // Match by simulation marker in metadata
        const isSimAlert = alertMeta['_simMarker'] === simMarker ||
                           alertMeta['simulationMarker'] === simMarker ||
                           String(alert.findingId ?? '').includes(simMarker)

        // Also match by expected rule patterns
        const ruleId = (alertMeta['ruleId'] as string) ?? alert.findingId ?? ''
        const matchesExpected = expectedRules.some(r =>
          ruleId.includes(r) || r.includes(ruleId),
        )

        if ((isSimAlert || matchesExpected) && !foundRuleIds.has(ruleId)) {
          foundRuleIds.add(ruleId)
          detections.push({
            ruleId,
            alertId:       alert.id,
            detectedAt:    alert.createdAt,
            severity:      alert.severity,
            detectionGapMs: Math.max(0, alert.createdAt.getTime() - injectionStart.getTime()),
            isExpected:    expectedRules.some(r => ruleId.includes(r) || r.includes(ruleId)),
          })

          log.info({ simId: simMarker, ruleId, severity: alert.severity },
            `  ✓ Detection confirmed: ${ruleId}`)
        }
      }

      // Stop polling early if all expected rules found
      if (foundRuleIds.size >= expectedRules.length) break
    }

    // If no detections found via DB, check ClickHouse signals
    // (detection engine may have emitted a signal without creating an alert)
    if (detections.length === 0) {
      const clickhouseDetections = await this.checkClickHouseSignals(
        tenantId, simMarker, injectionStart,
      )
      detections.push(...clickhouseDetections)
    }

    return detections
  }

  // ── Check ClickHouse for detection signals ───

  private async checkClickHouseSignals(
    tenantId:       string,
    simMarker:      string,
    injectionStart: Date,
  ): Promise<DetectionObservation[]> {
    const chHost = process.env['ZONFORGE_CLICKHOUSE_HOST'] ?? 'http://localhost:8123'

    try {
      const sql = `
        SELECT rule_id, signal_time, severity
        FROM detection_signals
        WHERE tenant_id = '${tenantId}'
          AND signal_time >= '${injectionStart.toISOString()}'
          AND (metadata LIKE '%${simMarker}%' OR simulation_marker = '${simMarker}')
        ORDER BY signal_time ASC
        LIMIT 50
        FORMAT JSON
      `

      const resp = await fetch(`${chHost}/?query=${encodeURIComponent(sql)}&readonly=1`, {
        signal: (() => {
          const c = new AbortController()
          setTimeout(() => c.abort(), 5000)
          return c.signal
        })(),
      })

      if (!resp.ok) return []

      const data = await resp.json() as { data?: Array<{ rule_id: string; signal_time: string; severity: string }> }
      return (data.data ?? []).map(row => ({
        ruleId:         row.rule_id,
        detectedAt:     new Date(row.signal_time),
        severity:       row.severity,
        detectionGapMs: Math.max(0, new Date(row.signal_time).getTime() - injectionStart.getTime()),
        isExpected:     true,
      }))
    } catch {
      return []   // ClickHouse unavailable — not fatal
    }
  }

  // ── Calculate security score for tenant ──────

  async calculateSecurityScore(tenantId: string): Promise<SecurityScore> {
    const db   = getDb()
    const cutoff = new Date(Date.now() - 30 * 86_400_000)   // last 30 days

    // Load simulation results from last 30 days
    const results = await db.select()
      .from(schema.simulationResults)
      .where(and(
        eq(schema.simulationResults.tenantId, tenantId),
        gte(schema.simulationResults.createdAt, cutoff),
      ))
      .orderBy(schema.simulationResults.createdAt)
      .limit(500)

    if (results.length === 0) {
      return {
        tenantId,
        overallScore:     0,
        overallGrade:     'F',
        categoryScores:   [],
        totalSimulations: 0,
        passRate:         0,
        criticalGaps:     ['No simulations run — security validation not configured'],
        lastCalculatedAt: new Date(),
        trend:            'stable',
      }
    }

    // Group by category
    const byCategory = new Map<string, typeof results>()
    for (const r of results) {
      const cat = (r.category as string) ?? 'unknown'
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push(r)
    }

    const categoryScores: CategoryScore[] = []

    for (const [category, catResults] of byCategory) {
      const passCount    = catResults.filter(r => r.evaluationStatus === 'pass').length
      const failCount    = catResults.filter(r => r.evaluationStatus === 'fail').length
      const partialCount = catResults.filter(r => r.evaluationStatus === 'partial').length

      const avgPct = catResults.length > 0
        ? Math.round(catResults.reduce((s, r) => s + (Number(r.detectionRatePct) ?? 0), 0) / catResults.length)
        : 0

      // Trend: compare first half vs second half of period
      const half    = Math.floor(catResults.length / 2)
      const firstHalf  = catResults.slice(0, half)
      const secondHalf = catResults.slice(half)

      const avgFirst  = firstHalf.length > 0
        ? firstHalf.reduce((s, r) => s + Number(r.detectionRatePct ?? 0), 0) / firstHalf.length
        : avgPct
      const avgSecond = secondHalf.length > 0
        ? secondHalf.reduce((s, r) => s + Number(r.detectionRatePct ?? 0), 0) / secondHalf.length
        : avgPct

      const trendDelta = Math.round(avgSecond - avgFirst)
      const trend = trendDelta > 3 ? 'improving'
        : trendDelta < -3 ? 'degrading'
        : 'stable'

      categoryScores.push({
        category,
        lastRunAt:       catResults[catResults.length - 1]!.createdAt,
        totalRuns:       catResults.length,
        passCount,
        failCount,
        partialCount,
        avgDetectionPct: avgPct,
        trend,
        trendDelta,
      })
    }

    // Overall score = weighted avg of category scores
    const overallScore = categoryScores.length > 0
      ? Math.round(categoryScores.reduce((s, c) => s + c.avgDetectionPct, 0) / categoryScores.length)
      : 0

    const passCount   = results.filter(r => r.evaluationStatus === 'pass').length
    const passRate    = results.length > 0 ? Math.round((passCount / results.length) * 100) : 0

    const criticalGaps = categoryScores
      .filter(c => c.avgDetectionPct < 70)
      .map(c => `${c.category} detection at ${c.avgDetectionPct}% (below 70% threshold)`)

    return {
      tenantId,
      overallScore,
      overallGrade:     scoreToGrade(overallScore),
      categoryScores,
      totalSimulations: results.length,
      passRate,
      criticalGaps,
      lastCalculatedAt: new Date(),
      trend: categoryScores.some(c => c.trend === 'degrading') ? 'degrading'
        : categoryScores.some(c => c.trend === 'improving') ? 'improving'
        : 'stable',
    }
  }

  // ── Summary builder ───────────────────────────

  private buildSummary(
    name:             string,
    pct:              number,
    status:           string,
    detections:       DetectionObservation[],
    gapRules:         string[],
  ): string {
    const detected = detections.map(d => d.ruleId).join(', ')
    const gaps     = gapRules.join(', ')

    if (status === 'pass') {
      return `${name}: All expected detections confirmed (${pct}%). Rules fired: ${detected}`
    }
    if (status === 'partial') {
      return `${name}: Partial detection (${pct}%). Detected: ${detected || 'none'}. Missing: ${gaps}`
    }
    return `${name}: Detection FAILED (${pct}%). Expected rules did not fire: ${gaps}`
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
