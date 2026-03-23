import { eq, and, gte, desc } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type { TriggerEvent, TriggerConfidence } from '../models/honeypot.js'

const log = createLogger({ service: 'deception-grid:monitor' })

// ─────────────────────────────────────────────
// TRIGGER MONITOR
//
// Processes incoming honeypot trigger events.
//
// Key properties:
//   - ZERO false positives — any trigger is attacker
//   - Immediate P1 alert generation
//   - Full trigger context preserved
//   - Attacker IP tracked across triggers
// ─────────────────────────────────────────────

export class TriggerMonitor {

  // ── Process a trigger event ───────────────────

  async processTrigger(
    trackingToken: string,
    triggerType:   string,
    sourceIp?:     string,
    userAgent?:    string,
    requestPath?:  string,
    rawRequest?:   Record<string, unknown>,
  ): Promise<{ alertId: string | null; honeypotName: string }> {
    const db = getDb()

    // Find honeypot by tracking token
    const honeypots = await db.select()
      .from(schema.honeypots)
      .where(eq(schema.honeypots.trackingToken, trackingToken))
      .limit(1)

    const honeypot = honeypots[0]
    if (!honeypot) {
      log.warn({ trackingToken }, 'Honeypot trigger for unknown token')
      return { alertId: null, honeypotName: 'Unknown' }
    }

    log.warn({
      honeypotId: honeypot.id, tenantId: honeypot.tenantId,
      type: honeypot.type, sourceIp, triggerType,
    }, `🍯 HONEYPOT TRIGGERED: ${honeypot.name}`)

    const triggerEvent: TriggerEvent = {
      honeypotId:    honeypot.id,
      tenantId:      honeypot.tenantId,
      triggeredAt:   new Date(),
      confidence:    'definite',
      triggerType,
      sourceIp,
      userAgent,
      requestPath,
      rawRequest,
    }

    // Update honeypot state
    await db.update(schema.honeypots)
      .set({
        status:             'triggered',
        triggeredAt:        new Date(),
        triggerCount:       (honeypot.triggerCount ?? 0) + 1,
        lastTriggerDetails: triggerEvent,
        updatedAt:          new Date(),
      })
      .where(eq(schema.honeypots.id, honeypot.id))

    // Record trigger event
    await db.insert(schema.honeypotTriggers).values({
      id:            uuid(),
      honeypotId:    honeypot.id,
      tenantId:      honeypot.tenantId,
      triggeredAt:   new Date(),
      confidence:    'definite',
      triggerType,
      sourceIp:      sourceIp ?? null,
      userAgent:     userAgent ?? null,
      requestPath:   requestPath ?? null,
      rawRequest:    rawRequest ?? {},
      alertId:       null,
      createdAt:     new Date(),
    })

    // Fire immediate P1 alert — ZERO false positives
    const alertId = await this.createHoneypotAlert(honeypot, triggerEvent)

    // Update trigger record with alert ID
    if (alertId) {
      await db.update(schema.honeypotTriggers)
        .set({ alertId })
        .where(and(
          eq(schema.honeypotTriggers.honeypotId, honeypot.id),
          eq(schema.honeypotTriggers.triggeredAt, triggerEvent.triggeredAt),
        ))
    }

    // Publish to Redis for AI SOC analyst auto-investigation
    try {
      const { Redis } = await import('ioredis')
      const publisher = new Redis({
        host:     process.env['REDIS_HOST'] ?? 'localhost',
        port:     parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
        password: process.env['REDIS_PASSWORD'] ?? undefined,
        maxRetriesPerRequest: 1,
      })
      await publisher.publish('zf:alerts:created', JSON.stringify({
        alertId, tenantId: honeypot.tenantId, priority: 'P1',
      }))
      await publisher.quit()
    } catch { /* non-fatal */ }

    return { alertId, honeypotName: honeypot.name }
  }

  // ── Create P1 alert for honeypot trigger ─────

  private async createHoneypotAlert(
    honeypot:     any,
    trigger:      TriggerEvent,
  ): Promise<string | null> {
    const db      = getDb()
    const alertId = uuid()

    const title = this.buildAlertTitle(honeypot.type, honeypot.name, trigger.sourceIp)
    const description = this.buildAlertDescription(honeypot, trigger)

    try {
      await db.insert(schema.alerts).values({
        id:          alertId,
        tenantId:    honeypot.tenantId,
        findingId:   `ZF-DECEPTION-${honeypot.id.slice(0,8).toUpperCase()}`,
        title,
        description,
        severity:    'critical',
        priority:    'P1',
        status:      'open',
        mitreTechniques: this.getMitreTechniques(honeypot.type),
        mitreTactics:    ['TA0009', 'TA0006'],
        affectedUserId:  null,
        affectedIp:      trigger.sourceIp ?? null,
        evidence: [{
          type:        'honeypot_trigger',
          honeypotType: honeypot.type,
          honeypotId:  honeypot.id,
          trackingToken: honeypot.trackingToken,
          triggerType: trigger.triggerType,
          sourceIp:    trigger.sourceIp,
          userAgent:   trigger.userAgent,
          requestPath: trigger.requestPath,
          confidence:  'definite',
          note:        'Honeypot triggers have ZERO false positive rate',
        }],
        metadata: {
          honeypotId:    honeypot.id,
          honeypotType:  honeypot.type,
          honeypotName:  honeypot.name,
          trackingToken: honeypot.trackingToken,
          triggerType:   trigger.triggerType,
          confidence:    'definite',
          falsePositiveRate: '0%',
        },
        firstSignalTime:      trigger.triggeredAt,
        mttdSlaBreached:     false,
        detectionGapMinutes: 0,
        createdAt:           new Date(),
        updatedAt:           new Date(),
      })

      log.warn({ alertId, honeypotId: honeypot.id, tenantId: honeypot.tenantId },
        `🚨 P1 HONEYPOT ALERT: ${title}`)

      return alertId
    } catch (err) {
      log.error({ err, honeypotId: honeypot.id }, 'Failed to create honeypot alert')
      return null
    }
  }

  // ── Alert title builder ────────────────────────

  private buildAlertTitle(type: string, name: string, ip?: string): string {
    const ipStr = ip ? ` from ${ip}` : ''
    switch (type) {
      case 'credential':    return `Stolen Credential Used${ipStr} — Honeypot Triggered`
      case 'aws_key':       return `Canary AWS Key Used${ipStr} — Credential Theft Confirmed`
      case 'api_token':     return `Canary API Token Access${ipStr} — Attacker Active`
      case 's3_bucket':     return `Fake S3 Bucket Accessed${ipStr} — Recon Detected`
      case 'user_account':  return `Ghost Admin Account Login Attempt${ipStr}`
      case 'dns_canary':    return `DNS Canary Resolved${ipStr} — Attacker Infrastructure Revealed`
      case 'oauth_client':  return `Canary OAuth Credentials Used${ipStr}`
      case 'db_record':     return `Database Canary Record Accessed — Data Theft Detected`
      default:              return `Honeypot Triggered: ${name}`
    }
  }

  // ── Alert description builder ─────────────────

  private buildAlertDescription(honeypot: any, trigger: TriggerEvent): string {
    return `DEFINITE THREAT — ZERO FALSE POSITIVE RATE\n\nHoneypot "${honeypot.name}" (${honeypot.type}) was accessed at ${trigger.triggeredAt.toISOString()}.\n\nThis is a decoy token that has NO legitimate use. Any access confirms an active threat actor.\n\nTrigger details:\n• Type: ${trigger.triggerType}\n• Source IP: ${trigger.sourceIp ?? 'Unknown'}\n• User Agent: ${trigger.userAgent ?? 'Unknown'}\n• Request Path: ${trigger.requestPath ?? 'Unknown'}\n\nImmediate containment recommended.`
  }

  // ── MITRE mapping ─────────────────────────────

  private getMitreTechniques(type: string): string[] {
    const map: Record<string, string[]> = {
      credential:   ['T1078', 'T1110'],
      aws_key:      ['T1552.005', 'T1078.004'],
      api_token:    ['T1552.001', 'T1528'],
      s3_bucket:    ['T1530'],
      user_account: ['T1078.003'],
      dns_canary:   ['T1071.004'],
      oauth_client: ['T1550.001'],
      db_record:    ['T1005', 'T1213'],
    }
    return map[type] ?? ['T1078']
  }

  // ── Grid stats ────────────────────────────────

  async getGridStats(tenantId: string): Promise<{
    total:    number
    active:   number
    triggered: number
    byType:   Record<string, number>
    recentTriggers: any[]
  }> {
    const db      = getDb()
    const cutoff  = new Date(Date.now() - 30 * 86_400_000)

    const [honeypots, triggers] = await Promise.all([
      db.select().from(schema.honeypots)
        .where(eq(schema.honeypots.tenantId, tenantId)),
      db.select().from(schema.honeypotTriggers)
        .where(and(
          eq(schema.honeypotTriggers.tenantId, tenantId),
          gte(schema.honeypotTriggers.triggeredAt, cutoff),
        ))
        .orderBy(desc(schema.honeypotTriggers.triggeredAt))
        .limit(20),
    ])

    const byType: Record<string, number> = {}
    for (const h of honeypots) {
      byType[h.type] = (byType[h.type] ?? 0) + 1
    }

    return {
      total:    honeypots.length,
      active:   honeypots.filter(h => h.status === 'active').length,
      triggered: honeypots.filter(h => h.status === 'triggered').length,
      byType,
      recentTriggers: triggers,
    }
  }
}
