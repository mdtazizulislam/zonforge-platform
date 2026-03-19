import { v4 as uuidv4 } from 'uuid'
import { eq, and, gte, inArray } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import {
  ATTACK_CHAIN_PATTERNS,
  type AttackChainPattern,
  type PatternStep,
} from '../patterns/attack-chains.js'
import type { Redis } from 'ioredis'

const log = createLogger({ service: 'correlation-engine' })

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface DetectionSignalRecord {
  id:              string
  tenantId:        string
  ruleId:          string | null
  detectionType:   string
  entityType:      string
  entityId:        string
  confidence:      number
  severity:        string
  mitreTactics:    string[]
  mitreTechniques: string[]
  evidenceEventIds: string[]
  firstSignalTime: Date
  detectedAt:      Date
  metadata:        Record<string, unknown>
}

export interface CorrelatedFinding {
  id:                   string
  tenantId:             string
  patternId:            string
  patternName:          string
  entityId:             string
  entityType:           string
  severity:             string
  priority:             string
  compoundConfidence:   number
  completionPercent:    number
  matchedSteps:         string[]
  contributingSignals:  string[]   // signal IDs
  evidenceEventIds:     string[]
  mitreTactics:         string[]
  mitreTechniques:      string[]
  firstSignalTime:      Date
  lastSignalTime:       Date
  detectedAt:           Date
  recommendedActions:   string[]
  metadata:             Record<string, unknown>
}

// ─────────────────────────────────────────────
// CORRELATION ENGINE
// ─────────────────────────────────────────────

export class CorrelationEngine {
  constructor(private readonly redis: Redis) {}

  // ── Main correlation run ───────────────────

  async correlateForTenant(tenantId: string): Promise<CorrelatedFinding[]> {
    const db = getDb()

    // Load all unprocessed signals from last 72 hours
    const cutoff  = new Date(Date.now() - 72 * 60 * 60 * 1000)
    const signals = await db.select()
      .from(schema.detectionSignals)
      .where(and(
        eq(schema.detectionSignals.tenantId, tenantId),
        gte(schema.detectionSignals.detectedAt, cutoff),
      ))
      .orderBy(schema.detectionSignals.detectedAt)
      .limit(5000)

    if (signals.length === 0) return []

    // Group signals by entity (user or IP)
    const byEntity = this.groupByEntity(signals as DetectionSignalRecord[])

    const findings: CorrelatedFinding[] = []

    // Try each entity group against each pattern
    for (const [entityId, entitySignals] of byEntity) {
      for (const pattern of ATTACK_CHAIN_PATTERNS) {
        const finding = this.matchPattern(
          tenantId, entityId, entitySignals, pattern,
        )
        if (finding) findings.push(finding)
      }
    }

    return findings
  }

  // ── Group signals by entity ────────────────

  private groupByEntity(
    signals: DetectionSignalRecord[],
  ): Map<string, DetectionSignalRecord[]> {
    const map = new Map<string, DetectionSignalRecord[]>()

    for (const signal of signals) {
      const key = signal.entityId
      const arr = map.get(key) ?? []
      arr.push(signal)
      map.set(key, arr)
    }

    return map
  }

  // ── Pattern matching ───────────────────────

  private matchPattern(
    tenantId:  string,
    entityId:  string,
    signals:   DetectionSignalRecord[],
    pattern:   AttackChainPattern,
  ): CorrelatedFinding | null {
    const windowMs      = pattern.windowHours * 60 * 60 * 1000
    const now           = Date.now()
    const windowCutoff  = new Date(now - windowMs)

    // Only consider signals within the pattern's time window
    const inWindow = signals.filter(s => s.detectedAt >= windowCutoff)
    if (inWindow.length === 0) return null

    const matchedSteps:      string[] = []
    const matchedSignalIds:  string[] = []
    const matchedEvidence:   string[] = []
    let   totalWeight       = 0
    let   weightedConfidence = 0

    for (const step of pattern.steps) {
      const matching = this.findSignalsForStep(inWindow, step)

      if (matching.length > 0) {
        matchedSteps.push(step.stepId)
        for (const sig of matching) {
          matchedSignalIds.push(sig.id)
          matchedEvidence.push(...(sig.evidenceEventIds as string[]))
          weightedConfidence += sig.confidence * step.weight
          totalWeight        += step.weight
        }
      } else if (step.required) {
        // Required step not found — this entity does not match this pattern
        return null
      }
    }

    // Check completion threshold
    const totalStepWeight   = pattern.steps.reduce((s, step) => s + step.weight, 0)
    const completionPercent = totalWeight / totalStepWeight

    if (completionPercent < pattern.completionThreshold) return null

    // Compound confidence = pattern base × weighted signal confidence
    const normalizedConfidence = totalWeight > 0
      ? weightedConfidence / totalWeight
      : 0
    const compoundConfidence = Math.min(
      pattern.baseConfidence * 0.5 + normalizedConfidence * 0.5,
      0.98,
    )

    if (compoundConfidence < 0.60) return null   // confidence gate

    // Dedup check — avoid re-emitting same pattern for same entity within 24h
    const dedupKey = `zf:platform:correlation:${tenantId}:${pattern.id}:${entityId}`

    // Note: dedup check is async — done in emitter, not here
    // We return the finding and let the emitter handle dedup

    const entitySignal = inWindow[0]!
    const times        = inWindow.map(s => s.detectedAt.getTime())

    return {
      id:                 uuidv4(),
      tenantId,
      patternId:          pattern.id,
      patternName:        pattern.name,
      entityId,
      entityType:         entitySignal.entityType,
      severity:           pattern.severity,
      priority:           pattern.priority,
      compoundConfidence,
      completionPercent,
      matchedSteps,
      contributingSignals: [...new Set(matchedSignalIds)],
      evidenceEventIds:    [...new Set(matchedEvidence)].slice(0, 50),
      mitreTactics:        pattern.mitreTactics,
      mitreTechniques:     pattern.mitreTechniques,
      firstSignalTime:     new Date(Math.min(...times)),
      lastSignalTime:      new Date(Math.max(...times)),
      detectedAt:          new Date(),
      recommendedActions:  pattern.recommendedActions,
      metadata: {
        pattern_id:          pattern.id,
        matched_steps:       matchedSteps,
        completion_percent:  completionPercent,
        signal_count:        matchedSignalIds.length,
      },
    }
  }

  // ── Find signals matching a pattern step ───

  private findSignalsForStep(
    signals: DetectionSignalRecord[],
    step:    PatternStep,
  ): DetectionSignalRecord[] {
    return signals.filter(signal => {
      // Match by rule ID
      if (step.ruleIds && signal.ruleId) {
        if (step.ruleIds.includes(signal.ruleId)) return true
      }

      // Match by anomaly metric name
      if (step.metricNames) {
        const metricName = (signal.metadata as Record<string, unknown>)['metric_name']
        if (metricName && step.metricNames.includes(String(metricName))) return true
      }

      // Match by detection type
      if (step.detectionTypes) {
        if (step.detectionTypes.includes(signal.detectionType)) return true
      }

      // Match by MITRE technique
      if (step.mitreTechniques) {
        const techniques = signal.mitreTechniques as string[]
        if (techniques.some(t => step.mitreTechniques!.includes(t))) return true
      }

      // Match by severity
      if (step.severities) {
        if (step.severities.includes(signal.severity as any)) return true
      }

      return false
    })
  }

  // ── Save correlated finding ────────────────

  async saveFinding(finding: CorrelatedFinding): Promise<boolean> {
    // Dedup check
    const dedupKey = `zf:platform:correlation:${finding.tenantId}:${finding.patternId}:${finding.entityId}`
    const exists   = await this.redis.exists(dedupKey)
    if (exists) {
      log.debug({
        patternId: finding.patternId,
        entityId:  finding.entityId,
      }, 'Correlated finding deduplicated')
      return false
    }

    // Mark signals as correlated
    const db = getDb()
    if (finding.contributingSignals.length > 0) {
      await db.update(schema.detectionSignals)
        .set({ correlatedFindingId: finding.id })
        .where(inArray(schema.detectionSignals.id, finding.contributingSignals))
        .catch(() => {})   // Non-fatal
    }

    // Set dedup key (24h)
    await this.redis.setex(dedupKey, 86400, finding.id)

    log.info({
      findingId:      finding.id,
      patternId:      finding.patternId,
      patternName:    finding.patternName,
      tenantId:       finding.tenantId,
      entityId:       finding.entityId,
      severity:       finding.severity,
      confidence:     finding.compoundConfidence.toFixed(2),
      completionPct:  (finding.completionPercent * 100).toFixed(0) + '%',
      steps:          finding.matchedSteps,
    }, '🔗 Correlated finding generated')

    return true
  }
}
