import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { Redis } from 'ioredis'
import { Worker, type Job } from 'bullmq'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { AlertService } from './services/alert.service.js'
import { NotificationOrchestrator } from './services/notification-orchestrator.service.js'
import {
  LlmNarrativeService, createNarrativeWorker, setRedis,
} from './workers/llm-narrative.worker.js'
import { createAlertRouter } from './routes/alert.routes.js'
import { authMiddleware, requestIdMiddleware } from '@zonforge/auth-utils'
import {
  QUEUE_NAMES, createQueue, getQueueConnection,
} from '@zonforge/ingestion-service/queues'

const log = createLogger({ service: 'alert-service' })

async function start() {
  // ── Database ────────────────────────────────
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  // ── Redis ───────────────────────────────────
  const redis = new Redis({
    host:     redisConfig.host,
    port:     redisConfig.port,
    password: redisConfig.password,
    tls:      redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error',   (e: Error) => log.error({ err: e }, 'Redis error'))
  setRedis(redis)

  // ── Queues ──────────────────────────────────
  const connection      = getQueueConnection(redisConfig)
  const narrativeQueue  = createQueue(QUEUE_NAMES.LLM_NARRATIVES, connection)

  // ── Services ────────────────────────────────
  const alertService       = new AlertService(redis)
  const narrativeService   = new LlmNarrativeService()
  const notifyOrchestrator = new NotificationOrchestrator(narrativeQueue)

  // ── Alert notifications consumer ─────────────
  // Consumes from alert-notifications queue (filled by correlation-engine)

  const alertNotificationWorker = new Worker<{
    tenantId:          string
    findingId:         string
    patternId?:        string
    patternName?:      string
    entityId:          string
    entityType:        string
    severity:          string
    priority:          string
    compoundConfidence?: number
    matchedSteps?:     string[]
    evidenceEventIds:  string[]
    mitreTactics:      string[]
    mitreTechniques:   string[]
    firstSignalTime:   string
    recommendedActions: string[]
    metadata:          Record<string, unknown>
    type?:             string
    // From rule-based detection
    ruleName?:         string
    ruleId?:           string
    confidence?:       number
  }>(
    QUEUE_NAMES.ALERT_NOTIFICATIONS,
    async (job) => {
      const d = job.data

      const title = d.patternName
        ?? d.ruleName
        ?? `Security Detection — ${d.severity.toUpperCase()}`

      const description = d.patternName
        ? `Attack chain detected: ${d.patternName}. `
          + `${d.matchedSteps?.length ?? 0} correlated signals matched across ${d.evidenceEventIds.length} events.`
        : `Detection rule triggered: ${d.ruleName ?? 'anomaly'}. `
          + `Confidence: ${((d.confidence ?? d.compoundConfidence ?? 0.7) * 100).toFixed(0)}%.`

      const result = await alertService.createAlert({
        tenantId:           d.tenantId,
        findingId:          d.findingId,
        title,
        description,
        severity:           d.severity as any,
        evidenceEventIds:   d.evidenceEventIds,
        mitreTactics:       d.mitreTactics,
        mitreTechniques:    d.mitreTechniques,
        recommendedActions: d.recommendedActions,
        firstSignalTime:    new Date(d.firstSignalTime),
        ...(d.entityType === 'user' ? { affectedUserId: d.entityId } : {}),
        ...(d.entityType === 'ip' ? { affectedIp: d.entityId } : {}),
      })

      if (result.isNew) {
        await notifyOrchestrator.notify(result.alertId, d.tenantId)
      }
    },
    { connection, concurrency: 20 },
  )

  alertNotificationWorker.on('error', err =>
    log.error({ err }, 'Alert notification worker error'),
  )

  // ── LLM narrative worker ─────────────────────
  const narrativeWorker = createNarrativeWorker(narrativeService, connection)

  // ── MTTD SLA checker (every 5 min) ───────────
  const slaInterval = setInterval(async () => {
    try {
      const { getDb: db, schema: s, eq: dbEq } = await import('@zonforge/db-client')
      const tenants = await db().select({ id: s.tenants.id })
        .from(s.tenants)
        .where(dbEq(s.tenants.status, 'active'))
        .limit(500)
      for (const t of tenants) {
        await alertService.checkMttdSlaBreaches(t.id).catch(() => {})
      }
    } catch (err) {
      log.error({ err }, 'MTTD SLA check failed')
    }
  }, 5 * 60_000)

  // ── HTTP App ────────────────────────────────

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({
    origin: ['http://localhost:5173', 'https://app.zonforge.com'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    credentials: true,
  }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  app.route('/', createAlertRouter(alertService, notifyOrchestrator))

  app.get('/health', ctx => ctx.json({
    status: 'ok', service: 'alert-service',
    workers: {
      alertNotifications: !alertNotificationWorker.closing,
      llmNarrative:       !narrativeWorker.closing,
    },
    timestamp: new Date(),
  }))

  app.onError((err, ctx) => {
    log.error({ err }, 'Unhandled error')
    return ctx.json({ success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
  })

  const port = parseInt(process.env['PORT'] ?? '3008', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Alert Service on port ${info.port}`)
    log.info(`   LLM narratives: ${process.env['ZONFORGE_ANTHROPIC_API_KEY'] ? 'enabled' : 'template fallback'}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  // ── Graceful shutdown ────────────────────────
  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down...')
    clearInterval(slaInterval)
    await alertNotificationWorker.close()
    await narrativeWorker.close()
    await narrativeQueue.close()
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Alert service failed to start')
  process.exit(1)
})
