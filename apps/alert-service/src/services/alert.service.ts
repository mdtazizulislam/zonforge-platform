import { v4 as uuidv4 } from 'uuid'
import { eq, and } from 'drizzle-orm'
import type { Redis } from 'ioredis'
import { getDb, schema } from '@zonforge/db-client'
import { RedisKeys, RedisTTL } from '@zonforge/db-client'
import { computeAuditHash } from '@zonforge/auth-utils'
import { createLogger } from '@zonforge/logger'
import type { AlertStatus, AlertPriority, Severity } from '@zonforge/shared-types'
import { SEVERITY_TO_PRIORITY } from '@zonforge/shared-types'

const log = createLogger({ service: 'alert-service' })

// ─────────────────────────────────────────────
// ALERT CREATION INPUT
// From: correlation-engine findings + rule signals
// ─────────────────────────────────────────────

export interface CreateAlertInput {
  tenantId:         string
  findingId:        string     // unique finding ID (dedup key)
  title:            string
  description:      string
  severity:         Severity
  evidenceEventIds: string[]
  mitreTactics:     string[]
  mitreTechniques:  string[]
  recommendedActions: string[]
  affectedUserId?:  string
  affectedAssetId?: string
  affectedIp?:      string
  firstSignalTime:  Date
  metadata?:        Record<string, unknown>
  // MTTD
  mttdSlaTargetMinutes?: number
}

export interface AlertCreatedResult {
  alertId:     string
  isNew:       boolean
  isDuplicate: boolean
}

// MTTD SLA targets by plan tier (minutes)
const MTTD_SLA: Record<string, Record<AlertPriority, number>> = {
  starter:    { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 },
  growth:     { P1: 60, P2: 240, P3: 1440, P4: 0, P5: 0 },
  business:   { P1: 30, P2: 120, P3: 720, P4: 0, P5: 0 },
  enterprise: { P1: 15, P2: 60,  P3: 480, P4: 0, P5: 0 },
  mssp:       { P1: 10, P2: 30,  P3: 240, P4: 0, P5: 0 },
}

// ─────────────────────────────────────────────
// ALERT SERVICE
// ─────────────────────────────────────────────

export class AlertService {
  constructor(private readonly redis: Redis) {}

  // ── Create alert (with dedup) ──────────────

  async createAlert(input: CreateAlertInput): Promise<AlertCreatedResult> {
    // 1. Deduplication: same finding within 24 hours
    const dedupKey = RedisKeys.alertDedup(input.tenantId, input.findingId)
    const existing = await this.redis.get(dedupKey)

    if (existing) {
      log.debug({
        findingId: input.findingId,
        tenantId:  input.tenantId,
      }, 'Alert deduplicated — finding already active')
      return { alertId: existing, isNew: false, isDuplicate: true }
    }

    const db       = getDb()
    const alertId  = uuidv4()
    const now      = new Date()
    const priority = SEVERITY_TO_PRIORITY[input.severity]

    // 2. Calculate MTTD gap
    const detectionGapMinutes = input.firstSignalTime
      ? Math.floor((now.getTime() - input.firstSignalTime.getTime()) / 60_000)
      : null

    // 3. Get tenant plan for MTTD SLA
    const tenants = await db.select({ planTier: schema.tenants.planTier })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, input.tenantId))
      .limit(1)

    const planTier  = tenants[0]?.planTier ?? 'starter'
    const slaTarget = MTTD_SLA[planTier]?.[priority] ?? 0
    const slaBreached = slaTarget > 0 && detectionGapMinutes !== null
      && detectionGapMinutes > slaTarget

    // 4. Build evidence items (simplified)
    const evidence = input.evidenceEventIds.slice(0, 20).map((eventId, i) => ({
      eventId,
      eventTime:    input.firstSignalTime,
      sourceType:   'unknown',
      eventCategory: 'unknown',
      eventAction:  'unknown',
      actorUserId:  input.affectedUserId ?? null,
      actorIp:      input.affectedIp     ?? null,
      targetAssetId: input.affectedAssetId ?? null,
      targetResource: null,
      outcome:      'unknown',
      description:  `Evidence event ${i + 1}`,
    }))

    // 5. Insert alert
    await db.insert(schema.alerts).values({
      id:                   alertId,
      tenantId:             input.tenantId,
      findingId:            input.findingId,
      title:                input.title,
      description:          input.description,
      severity:             input.severity,
      priority,
      status:               'open',
      evidence,
      llmNarrative:         null,
      llmNarrativeGeneratedAt: null,
      mitreTactics:         input.mitreTactics,
      mitreTechniques:      input.mitreTechniques,
      recommendedActions:   input.recommendedActions,
      affectedUserId:       input.affectedUserId ?? null,
      affectedAssetId:      input.affectedAssetId ?? null,
      affectedIp:           input.affectedIp     ?? null,
      assignedTo:           null,
      firstSignalTime:      input.firstSignalTime,
      detectionGapMinutes:  detectionGapMinutes,
      mttdSlaTargetMinutes: slaTarget > 0 ? slaTarget : null,
      mttdSlaBreached:      slaBreached,
      createdAt:            now,
      updatedAt:            now,
    })

    // 6. Set dedup key
    await this.redis.setex(dedupKey, RedisTTL.ALERT_DEDUP, alertId)

    // 7. Write audit log
    await this.writeAuditLog({
      tenantId:     input.tenantId,
      action:       'alert.created',
      resourceType: 'alert',
      resourceId:   alertId,
      changes: {
        severity: input.severity,
        priority,
        findingId: input.findingId,
      },
    })

    log.info({
      alertId,
      tenantId:  input.tenantId,
      severity:  input.severity,
      priority,
      slaBreached,
      detectionGapMinutes,
    }, `Alert created: ${input.title.slice(0, 60)}`)

    return { alertId, isNew: true, isDuplicate: false }
  }

  // ── Update alert status ────────────────────

  async updateAlertStatus(
    alertId:     string,
    tenantId:    string,
    status:      AlertStatus,
    analystId:   string,
    notes?:      string,
  ): Promise<void> {
    const db  = getDb()
    const now = new Date()

    const updates: Partial<typeof schema.alerts.$inferInsert> = {
      status,
      updatedAt: now,
    }

    if (status === 'resolved' || status === 'false_positive') {
      updates.resolvedAt = now
    }

    await db.update(schema.alerts)
      .set(updates)
      .where(and(
        eq(schema.alerts.id,       alertId),
        eq(schema.alerts.tenantId, tenantId),
      ))

    // Invalidate any cached data for this alert
    await this.redis.del(`zf:${tenantId}:alert:${alertId}`)

    await this.writeAuditLog({
      tenantId,
      actorId:      analystId,
      action:       'alert.status_changed',
      resourceType: 'alert',
      resourceId:   alertId,
      changes:      { status, notes },
    })
  }

  // ── Assign alert to analyst ────────────────

  async assignAlert(
    alertId:    string,
    tenantId:   string,
    analystId:  string,
    assignedBy: string,
  ): Promise<void> {
    const db = getDb()
    await db.update(schema.alerts)
      .set({
        assignedTo: analystId,
        assignedAt: new Date(),
        status:     'investigating',
        updatedAt:  new Date(),
      })
      .where(and(
        eq(schema.alerts.id,       alertId),
        eq(schema.alerts.tenantId, tenantId),
      ))

    await this.writeAuditLog({
      tenantId,
      actorId:      assignedBy,
      action:       'alert.assigned',
      resourceType: 'alert',
      resourceId:   alertId,
      changes:      { assignedTo: analystId },
    })
  }

  // ── Save analyst feedback ──────────────────

  async saveFeedback(
    alertId:   string,
    tenantId:  string,
    analystId: string,
    verdict:   'true_positive' | 'false_positive' | 'unclear',
    notes?:    string,
  ): Promise<void> {
    const db = getDb()
    await db.insert(schema.analystFeedback).values({
      id:         uuidv4(),
      alertId,
      tenantId,
      analystId,
      verdict,
      notes:      notes ?? null,
      createdAt:  new Date(),
    })

    // If false positive, suppress the alert
    if (verdict === 'false_positive') {
      await this.updateAlertStatus(alertId, tenantId, 'false_positive', analystId, notes)
    }

    await this.writeAuditLog({
      tenantId,
      actorId:      analystId,
      action:       'alert.feedback',
      resourceType: 'alert',
      resourceId:   alertId,
      changes:      { verdict, notes },
    })
  }

  // ── MTTD SLA breach monitor ────────────────

  async checkMttdSlaBreaches(tenantId: string): Promise<number> {
    const db      = getDb()
    const open    = await db.select({
      id:                   schema.alerts.id,
      priority:             schema.alerts.priority,
      mttdSlaTargetMinutes: schema.alerts.mttdSlaTargetMinutes,
      createdAt:            schema.alerts.createdAt,
    })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId,      tenantId),
        eq(schema.alerts.status,        'open'),
        eq(schema.alerts.mttdSlaBreached, false),
      ))
      .limit(500)

    let breached = 0
    const now    = Date.now()

    for (const alert of open) {
      if (!alert.mttdSlaTargetMinutes) continue
      const ageMinutes = (now - alert.createdAt.getTime()) / 60_000
      if (ageMinutes > alert.mttdSlaTargetMinutes) {
        await db.update(schema.alerts)
          .set({ mttdSlaBreached: true, updatedAt: new Date() })
          .where(eq(schema.alerts.id, alert.id))
        breached++
        log.warn({
          alertId:  alert.id,
          priority: alert.priority,
          ageMin:   Math.round(ageMinutes),
          slaMin:   alert.mttdSlaTargetMinutes,
        }, '⚠️  MTTD SLA breached')
      }
    }

    return breached
  }

  // ── Audit log helper ───────────────────────

  private async writeAuditLog(input: {
    tenantId: string; actorId?: string; action: string
    resourceType: string; resourceId?: string
    changes?: Record<string, unknown>
  }): Promise<void> {
    try {
      const db  = getDb()
      const id  = uuidv4()
      const now = new Date()

      const last = await db.select({ hash: schema.auditLogs.hash })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.tenantId, input.tenantId))
        .orderBy(schema.auditLogs.createdAt)
        .limit(1)

      const prevHash = last[0]?.hash ?? null
      const hash     = computeAuditHash(prevHash, id, input.tenantId, input.action, now)

      await db.insert(schema.auditLogs).values({
        id, tenantId: input.tenantId,
        actorId:      input.actorId ?? null,
        action:       input.action,
        resourceType: input.resourceType,
        resourceId:   input.resourceId ?? null,
        changes:      input.changes ?? null,
        metadata:     {},
        previousHash: prevHash,
        hash,
        createdAt:    now,
      })
    } catch {
      // Audit log failure is non-fatal
    }
  }
}
