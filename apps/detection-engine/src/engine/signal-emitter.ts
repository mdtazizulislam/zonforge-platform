import { v4 as uuidv4 } from 'uuid'
import { Queue } from 'bullmq'
import { eq, sql } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger, logDetection } from '@zonforge/logger'
import { RedisKeys, RedisTTL } from '@zonforge/db-client'
import type { Redis } from 'ioredis'
import type { DetectionMatch } from './rule-evaluator.js'

const log = createLogger({ service: 'detection-engine:signal-emitter' })

// ─────────────────────────────────────────────
// SIGNAL EMITTER
//
// Takes a DetectionMatch and:
//  1. Deduplicates (same rule + entity within 24h)
//  2. Writes to detection_signals table (PostgreSQL)
//  3. Publishes to detection signals queue (BullMQ)
//  4. Updates rule hit metrics
// ─────────────────────────────────────────────

export class SignalEmitter {
  constructor(
    private readonly detectionQueue: Queue,
    private readonly redis:          Redis,
  ) {}

  async emit(match: DetectionMatch): Promise<{
    emitted:    boolean
    signalId:   string | null
    isDuplicate: boolean
  }> {
    // ── 1. Deduplication check ─────────────────

    const dedupKey = `zf:platform:detection:dedup:${match.tenantId}:${match.ruleId}:${match.entityId}`
    const isDuplicate = await this.redis.exists(dedupKey)

    if (isDuplicate) {
      log.debug({
        ruleId:   match.ruleId,
        entityId: match.entityId,
        tenantId: match.tenantId,
      }, 'Detection signal deduplicated — suppressing')
      return { emitted: false, signalId: null, isDuplicate: true }
    }

    // ── 2. Write to PostgreSQL ─────────────────

    const signalId = uuidv4()
    const now      = new Date()

    await getDb().insert(schema.detectionSignals).values({
      id:                  signalId,
      tenantId:            match.tenantId,
      ruleId:              match.ruleId,
      detectionType:       'rule',
      entityType:          match.entityType,
      entityId:            match.entityId,
      confidence:          match.confidence,
      severity:            match.severity,
      mitreTactics:        match.mitreTactics,
      mitreTechniques:     match.mitreTechniques,
      evidenceEventIds:    match.evidenceEventIds,
      firstSignalTime:     match.firstSignalTime,
      detectedAt:          now,
      correlatedFindingId: null,
      alertId:             null,
      metadata:            match.metadata,
      createdAt:           now,
    })

    // ── 3. Set dedup key (24h window) ──────────

    await this.redis.setex(dedupKey, 86400, signalId)

    // ── 4. Publish to detection queue ──────────

    await this.detectionQueue.add(
      `detection:${signalId}`,
      {
        signalId,
        tenantId:        match.tenantId,
        ruleId:          match.ruleId,
        ruleName:        match.ruleName,
        entityId:        match.entityId,
        entityType:      match.entityType,
        confidence:      match.confidence,
        severity:        match.severity,
        mitreTactics:    match.mitreTactics,
        mitreTechniques: match.mitreTechniques,
        evidenceEventIds: match.evidenceEventIds,
        firstSignalTime: match.firstSignalTime.toISOString(),
        metadata:        match.metadata,
      },
    )

    // ── 5. Update rule hit metrics ─────────────

    await getDb().update(schema.detectionRules)
      .set({
        hitCount:  sql`${schema.detectionRules.hitCount} + 1`,
        lastHitAt: now,
      })
      .where(eq(schema.detectionRules.id, match.ruleId))
      .catch(() => {})   // Non-fatal — rule may not be in DB (YAML-only)

    // ── 6. Log detection ───────────────────────

    logDetection(log, {
      tenantId:   match.tenantId,
      ruleId:     match.ruleId,
      ruleName:   match.ruleName,
      entityId:   match.entityId,
      entityType: match.entityType,
      severity:   match.severity,
      confidence: match.confidence,
      mitre:      match.mitreTechniques,
    })

    return { emitted: true, signalId, isDuplicate: false }
  }

  // Emit multiple matches efficiently
  async emitBatch(matches: DetectionMatch[]): Promise<{
    emitted:    number
    duplicates: number
  }> {
    let emitted    = 0
    let duplicates = 0

    for (const match of matches) {
      const result = await this.emit(match)
      if (result.isDuplicate) duplicates++
      else if (result.emitted) emitted++
    }

    return { emitted, duplicates }
  }
}
