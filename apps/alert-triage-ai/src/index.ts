import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { eq, and, desc, gte, count } from 'drizzle-orm'
import { Redis }          from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { requestIdMiddleware, authMiddleware } from '@zonforge/auth-utils'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const log = createLogger({ service: 'alert-triage-ai' })

// ─────────────────────────────────────────────
// DYNAMIC ALERT PRIORITY SCORER
//
// Replaces static P1/P2/P3/P4 with AI-computed
// urgency score 0–100 based on:
//
//   Asset Criticality    (25%) — how important is the target?
//   Threat Intelligence  (20%) — is the source IP known bad?
//   Behavioral Context   (20%) — is this unusual for the user?
//   Blast Radius         (15%) — how many users/systems at risk?
//   Dwell Time           (10%) — how long has attacker been present?
//   Remediation Urgency  (10%) — how fast must analyst act?
//
// Output: urgencyScore + dynamic priority + "focus here" annotation
// ─────────────────────────────────────────────

export interface TriageFactors {
  // Inputs (0–100 each)
  assetCriticality:    number    // 100 = CEO device, 0 = printer
  threatIntelScore:    number    // 100 = known APT, 0 = clean IP
  behavioralDeviation: number    // from Behavioral AI anomaly score
  blastRadius:         number    // estimated number of at-risk entities
  dwellTimeMinutes:    number    // how long attack has been ongoing
  slaRemainingMinutes: number    // how long until SLA breach

  // Context
  isSlaBreached:       boolean
  isHighPrivUser:      boolean
  hasMitreTechnique:   boolean
  attackChainLength:   number    // correlated events count
  relatedAlertCount:   number    // related open alerts
}

export interface TriageResult {
  alertId:         string
  urgencyScore:    number    // 0–100 computed score
  dynamicPriority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'
  originalPriority: string
  changed:          boolean  // did priority change?

  factors:          TriageFactors
  topReasons:       string[]   // 3 human-readable reasons
  analystGuidance:  string     // what to do first
  estimatedMinutes: number     // time to investigate
  scoredAt:         Date
}

// ─────────────────────────────────────────────
// ASSET CRITICALITY REGISTRY
// ─────────────────────────────────────────────

const ASSET_CRITICALITY_RULES = [
  { pattern: /ceo|cto|ciso|cfo|vp|director|board/i,  score: 100 },
  { pattern: /admin|administrator|tenant.admin/i,      score: 95 },
  { pattern: /security|infosec|soc/i,                  score: 85 },
  { pattern: /finance|payroll|treasury/i,              score: 80 },
  { pattern: /engineer|developer|devops/i,             score: 65 },
  { pattern: /svc-|service|bot@/i,                     score: 70 },
  { pattern: /test|staging|demo/i,                     score: 20 },
]

function getAssetCriticality(userId?: string | null, targetAsset?: string | null): number {
  const entity = (userId ?? '') + (targetAsset ?? '')
  if (!entity) return 50  // default medium

  for (const rule of ASSET_CRITICALITY_RULES) {
    if (rule.pattern.test(entity)) return rule.score
  }
  return 50
}

// ─────────────────────────────────────────────
// BLAST RADIUS ESTIMATOR
// ─────────────────────────────────────────────

function estimateBlastRadius(alert: any): number {
  const techniques: string[] = (alert.mitreTechniques ?? []) as string[]

  // Techniques with high blast radius
  const highBlastTechniques = ['T1078', 'T1110', 'T1021', 'T1098', 'T1136']
  const hasHighBlast = techniques.some(t => highBlastTechniques.includes(t))

  if (alert.severity === 'critical' && hasHighBlast) return 90
  if (alert.severity === 'high'     && hasHighBlast) return 70
  if (alert.severity === 'critical')                  return 60
  if (alert.severity === 'high')                      return 45
  if (alert.severity === 'medium')                    return 25
  return 10
}

// ─────────────────────────────────────────────
// MAIN TRIAGE SCORER
// ─────────────────────────────────────────────

async function scoreAlert(
  alert:   any,
  tenantId: string,
  db:       ReturnType<typeof getDb>,
): Promise<TriageResult> {

  // ── Factor computation ────────────────────────

  const assetCriticality = getAssetCriticality(alert.affectedUserId, alert.affectedAssetId)
  const blastRadius      = estimateBlastRadius(alert)

  // Threat intel score from existing IOC cache
  let threatIntelScore = 0
  if (alert.affectedIp) {
    const iocRows = await db.select({ confidence: schema.threatIntelIocs.confidence })
      .from(schema.threatIntelIocs)
      .where(and(
        eq(schema.threatIntelIocs.iocValue, alert.affectedIp),
        eq(schema.threatIntelIocs.iocType, 'ip'),
      ))
      .limit(3)

    if (iocRows.length > 0) {
      threatIntelScore = Math.round(
        Math.max(...iocRows.map(r => Number(r.confidence) * 100)),
      )
    }
  }

  // Behavioral deviation from Behavioral AI service
  let behavioralDeviation = 0
  const behavioralKey = `zf:behavioral:latest-score:${tenantId}:${alert.affectedUserId}`
  // Would query behavioral AI in production — use alert-embedded score
  if ((alert.metadata as any)?._behavioralScore) {
    behavioralDeviation = (alert.metadata as any)._behavioralScore
  }

  // Dwell time
  const createdAt          = new Date(alert.createdAt)
  const dwellTimeMinutes   = Math.round((Date.now() - createdAt.getTime()) / 60_000)

  // SLA
  const slaTargetMinutes = alert.priority === 'P1' ? 15 : alert.priority === 'P2' ? 60 : 240
  const slaRemainingMinutes = Math.max(0, slaTargetMinutes - dwellTimeMinutes)
  const isSlaBreached    = slaRemainingMinutes === 0

  // Related alerts
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000)
  const relatedRows = await db.select({ cnt: count() })
    .from(schema.alerts)
    .where(and(
      eq(schema.alerts.tenantId, tenantId),
      eq(schema.alerts.affectedUserId, alert.affectedUserId ?? ''),
      gte(schema.alerts.createdAt, cutoff),
    ))
  const relatedAlertCount = Math.max(0, Number(relatedRows[0]?.cnt ?? 0) - 1)

  const factors: TriageFactors = {
    assetCriticality,
    threatIntelScore,
    behavioralDeviation,
    blastRadius,
    dwellTimeMinutes,
    slaRemainingMinutes,
    isSlaBreached,
    isHighPrivUser:     assetCriticality >= 80,
    hasMitreTechnique:  ((alert.mitreTechniques as string[]) ?? []).length > 0,
    attackChainLength:  alert.correlationChainLength ?? 1,
    relatedAlertCount,
  }

  // ── Urgency score (weighted formula) ─────────

  const urgencyScore = Math.round(
    assetCriticality    * 0.25 +
    threatIntelScore    * 0.20 +
    behavioralDeviation * 0.20 +
    blastRadius         * 0.15 +
    Math.min(100, dwellTimeMinutes / 2) * 0.10 +   // caps at 200min = 100
    (isSlaBreached ? 100 : Math.max(0, 100 - slaRemainingMinutes / slaTargetMinutes * 100)) * 0.10,
  )

  // ── Dynamic priority assignment ───────────────

  const dynamicPriority: TriageResult['dynamicPriority'] =
    urgencyScore >= 90 ? 'P0' :
    urgencyScore >= 75 ? 'P1' :
    urgencyScore >= 55 ? 'P2' :
    urgencyScore >= 35 ? 'P3' : 'P4'

  const originalPriority = alert.priority ?? 'P3'
  const changed = dynamicPriority !== originalPriority

  // ── Top reasons ───────────────────────────────

  const reasons: Array<[number, string]> = [
    [assetCriticality,    `Asset criticality: ${assetCriticality}/100 (${assetCriticality >= 80 ? 'high-privilege user' : 'standard user'})`],
    [threatIntelScore,    `Threat intel: ${threatIntelScore > 0 ? `Source IP has ${threatIntelScore}% malicious confidence` : 'IP clean'}`],
    [behavioralDeviation, `Behavioral: ${behavioralDeviation > 0 ? `${behavioralDeviation}% deviation from baseline` : 'within normal range'}`],
    [blastRadius,         `Blast radius: ${blastRadius}/100 (${blastRadius >= 70 ? 'high lateral risk' : 'contained'})`],
    [dwellTimeMinutes > 30 ? 60 : 0, `Dwell time: ${dwellTimeMinutes}min ${dwellTimeMinutes > 30 ? '⚠ extended' : ''}`],
    [relatedAlertCount * 20, `Related alerts: ${relatedAlertCount} in 24h`],
    [isSlaBreached ? 100 : 0, isSlaBreached ? '⚠ SLA already breached' : ''],
  ]

  const topReasons = reasons
    .filter(([score, text]) => score > 30 && text)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .map(([, text]) => text)

  // ── Analyst guidance ──────────────────────────

  let analystGuidance = ''
  if (dynamicPriority === 'P0' || dynamicPriority === 'P1') {
    analystGuidance = `IMMEDIATE: ${isSlaBreached ? 'SLA breached — ' : ''}${threatIntelScore > 60 ? 'Known malicious source. ' : ''}${assetCriticality >= 80 ? 'High-privilege account at risk. ' : ''}Investigate now.`
  } else if (dynamicPriority === 'P2') {
    analystGuidance = `Within ${slaRemainingMinutes}min: Review ${relatedAlertCount > 1 ? `alongside ${relatedAlertCount} related alerts` : 'alert context'}.`
  } else {
    analystGuidance = 'Queue for scheduled review. Low urgency.'
  }

  const estimatedMinutes = dynamicPriority === 'P0' ? 5 : dynamicPriority === 'P1' ? 15 : dynamicPriority === 'P2' ? 30 : 60

  return {
    alertId:          alert.id,
    urgencyScore,
    dynamicPriority,
    originalPriority,
    changed,
    factors,
    topReasons,
    analystGuidance,
    estimatedMinutes,
    scoredAt:         new Date(),
  }
}

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
  })

  // Subscribe to new alert events → auto-score
  const subscriber = redis.duplicate()
  await subscriber.subscribe('zf:alerts:created')

  subscriber.on('message', async (_chan, msg) => {
    try {
      const { alertId, tenantId } = JSON.parse(msg)
      const db = getDb()

      const [alert] = await db.select()
        .from(schema.alerts)
        .where(and(eq(schema.alerts.id, alertId), eq(schema.alerts.tenantId, tenantId)))
        .limit(1)

      if (!alert) return

      const result = await scoreAlert(alert, tenantId, db)

      // Store triage result
      await redis.setex(`zf:triage:${tenantId}:${alertId}`, 3600, JSON.stringify(result))

      // If priority changed significantly, republish
      if (result.changed && ['P0','P1'].includes(result.dynamicPriority)) {
        await redis.publish('zf:alerts:escalated', JSON.stringify({
          alertId, tenantId,
          newPriority:  result.dynamicPriority,
          urgencyScore: result.urgencyScore,
          guidance:     result.analystGuidance,
        }))
        log.info({ alertId, urgencyScore: result.urgencyScore, priority: result.dynamicPriority },
          `⚡ Alert re-prioritized: ${result.originalPriority} → ${result.dynamicPriority}`)
      }
    } catch (err) {
      log.error({ err }, 'Alert triage failed')
    }
  })

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── GET /v1/triage/:alertId ───────────────────

  app.get('/v1/triage/:alertId', async (ctx) => {
    const user    = ctx.var.user
    const alertId = ctx.req.param('alertId')

    // Check cache first
    const cached = await redis.get(`zf:triage:${user.tenantId}:${alertId}`)
    if (cached) return ctx.json({ success: true, data: JSON.parse(cached) })

    // Score on demand
    const db = getDb()
    const [alert] = await db.select()
      .from(schema.alerts)
      .where(and(eq(schema.alerts.id, alertId), eq(schema.alerts.tenantId, user.tenantId)))
      .limit(1)

    if (!alert) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

    const result = await scoreAlert(alert, user.tenantId, db)
    await redis.setex(`zf:triage:${user.tenantId}:${alertId}`, 3600, JSON.stringify(result))
    return ctx.json({ success: true, data: result })
  })

  // ── GET /v1/triage/queue ──────────────────────
  // AI-sorted alert queue

  app.get('/v1/triage/queue', async (ctx) => {
    const user  = ctx.var.user
    const db    = getDb()
    const limit = parseInt(ctx.req.query('limit') ?? '30', 10)

    const openAlerts = await db.select()
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId, user.tenantId),
        eq(schema.alerts.status, 'open'),
      ))
      .orderBy(desc(schema.alerts.createdAt))
      .limit(limit)

    // Score all and sort by urgency
    const triaged = await Promise.all(
      openAlerts.map(async (a) => {
        const cached = await redis.get(`zf:triage:${user.tenantId}:${a.id}`)
        if (cached) return { alert: a, triage: JSON.parse(cached) as TriageResult }
        const triage = await scoreAlert(a, user.tenantId, db)
        await redis.setex(`zf:triage:${user.tenantId}:${a.id}`, 3600, JSON.stringify(triage))
        return { alert: a, triage }
      }),
    )

    triaged.sort((a, b) => b.triage.urgencyScore - a.triage.urgencyScore)

    return ctx.json({ success: true, data: triaged.map(t => ({
      ...t.alert,
      aiUrgencyScore:    t.triage.urgencyScore,
      aiPriority:        t.triage.dynamicPriority,
      priorityChanged:   t.triage.changed,
      analystGuidance:   t.triage.analystGuidance,
      topReasons:        t.triage.topReasons,
      estimatedMinutes:  t.triage.estimatedMinutes,
    })) })
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'alert-triage-ai', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3021', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`⚡ ZonForge Alert Triage AI on port ${info.port}`)
    log.info(`   Factors: asset criticality, threat intel, behavioral, blast radius, dwell time, SLA`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down triage AI...')
    await subscriber.unsubscribe(); await subscriber.quit()
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => { log.fatal({ err }, '❌ Alert Triage AI failed'); process.exit(1) })
