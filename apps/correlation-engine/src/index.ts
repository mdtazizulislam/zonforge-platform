import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Redis } from 'ioredis'
import { Worker, type Job } from 'bullmq'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { CorrelationEngine } from './engine/correlation.engine.js'
import {
  QUEUE_NAMES, createQueue, getQueueConnection,
} from '@zonforge/ingestion-service/queues'
import { ATTACK_CHAIN_PATTERNS } from './patterns/attack-chains.js'

const log = createLogger({ service: 'correlation-engine' })

// ─────────────────────────────────────────────
// CORRELATION WORKER
//
// Triggered by detection signals in the queue.
// Batches tenants and runs correlation every 5 min.
// Also runs on-demand when a P1 signal arrives.
// ─────────────────────────────────────────────

const activeTenants = new Set<string>()

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

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

  const engine     = new CorrelationEngine(redis)
  const connection = getQueueConnection(redisConfig)
  const alertQueue = createQueue(QUEUE_NAMES.ALERT_NOTIFICATIONS, connection)

  // ── Event-triggered worker ─────────────────

  const worker = new Worker<{
    tenantId:  string
    signalId:  string
    severity:  string
    entityId:  string
  }>(
    QUEUE_NAMES.DETECTION_SIGNALS,
    async (job) => {
      const { tenantId, severity } = job.data
      activeTenants.add(tenantId)

      // For P1/P2 signals — correlate immediately
      if (['critical', 'high'].includes(severity)) {
        await runCorrelation(tenantId, engine, alertQueue)
      }
    },
    { connection, concurrency: 5 },
  )

  worker.on('error', err => log.error({ err }, 'Worker error'))

  // ── Scheduled correlation sweep (every 5 min) ─

  const sweepInterval = setInterval(async () => {
    const tenants = Array.from(activeTenants)
    activeTenants.clear()

    for (const tenantId of tenants) {
      await runCorrelation(tenantId, engine, alertQueue).catch(err =>
        log.error({ err, tenantId }, 'Correlation sweep failed'),
      )
    }
  }, 5 * 60_000)

  // ── Health HTTP server ──────────────────────

  const app = new Hono()

  app.get('/health', ctx => ctx.json({
    status:   'ok',
    service:  'correlation-engine',
    patterns: ATTACK_CHAIN_PATTERNS.length,
    timestamp: new Date(),
  }))

  app.get('/patterns', ctx => ctx.json({
    success: true,
    data:    ATTACK_CHAIN_PATTERNS.map(p => ({
      id:         p.id,
      name:       p.name,
      severity:   p.severity,
      windowHours: p.windowHours,
      steps:      p.steps.length,
      threshold:  p.completionThreshold,
    })),
  }))

  const port = parseInt(process.env['PORT'] ?? '3006', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Correlation Engine on port ${info.port}`)
    log.info(`   Patterns loaded: ${ATTACK_CHAIN_PATTERNS.length}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down...')
    clearInterval(sweepInterval)
    await worker.close()
    await alertQueue.close()
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

async function runCorrelation(
  tenantId:   string,
  engine:     CorrelationEngine,
  alertQueue: ReturnType<typeof createQueue>,
): Promise<void> {
  const findings = await engine.correlateForTenant(tenantId)

  for (const finding of findings) {
    const saved = await engine.saveFinding(finding)
    if (!saved) continue

    // Publish to alert notifications queue
    await alertQueue.add(`correlation:${finding.id}`, {
      findingId:          finding.id,
      tenantId:           finding.tenantId,
      type:               'correlated_finding',
      patternId:          finding.patternId,
      patternName:        finding.patternName,
      entityId:           finding.entityId,
      entityType:         finding.entityType,
      severity:           finding.severity,
      priority:           finding.priority,
      compoundConfidence: finding.compoundConfidence,
      matchedSteps:       finding.matchedSteps,
      evidenceEventIds:   finding.evidenceEventIds,
      mitreTactics:       finding.mitreTactics,
      mitreTechniques:    finding.mitreTechniques,
      firstSignalTime:    finding.firstSignalTime.toISOString(),
      recommendedActions: finding.recommendedActions,
      metadata:           finding.metadata,
    })
  }
}

start().catch(err => {
  log.fatal({ err }, '❌ Correlation engine failed to start')
  process.exit(1)
})
