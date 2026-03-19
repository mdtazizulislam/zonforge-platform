import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { RiskScoringService } from './services/risk-scoring.service.js'
import {
  QUEUE_NAMES, createQueue, getQueueConnection,
} from '@zonforge/ingestion-service/queues'

const log = createLogger({ service: 'risk-scoring-engine' })

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

  const scorer     = new RiskScoringService(redis)
  const connection = getQueueConnection(redisConfig)

  // ── BullMQ worker: triggered by alerts ────

  const worker = new Worker<{
    tenantId:      string
    affectedUserId?: string
    affectedAssetId?: string
    severity:      string
    findingId?:    string
    type?:         string
  }>(
    QUEUE_NAMES.ALERT_NOTIFICATIONS,
    async (job) => {
      const { tenantId, affectedUserId, affectedAssetId } = job.data

      // Score user if affected
      if (affectedUserId) {
        await scorer.scoreUser(tenantId, affectedUserId).catch(err =>
          log.error({ err }, 'User risk scoring failed'),
        )
      }

      // Score asset if affected
      if (affectedAssetId) {
        await scorer.scoreAsset(tenantId, affectedAssetId).catch(err =>
          log.error({ err }, 'Asset risk scoring failed'),
        )
      }

      // Recalculate org posture
      await scorer.scoreOrgPosture(tenantId).catch(err =>
        log.error({ err }, 'Org posture scoring failed'),
      )
    },
    { connection, concurrency: 10 },
  )

  worker.on('error', err => log.error({ err }, 'Risk scoring worker error'))

  // ── Nightly decay cron (2 AM UTC) ─────────

  const now       = new Date()
  const nextDecay = new Date()
  nextDecay.setUTCHours(2, 0, 0, 0)
  if (nextDecay <= now) nextDecay.setUTCDate(nextDecay.getUTCDate() + 1)

  const msUntilFirst = nextDecay.getTime() - now.getTime()

  setTimeout(() => {
    runDecayCycle(scorer)
    setInterval(() => runDecayCycle(scorer), 24 * 60 * 60_000)
  }, msUntilFirst)

  log.info({ nextDecayAt: nextDecay.toISOString() }, 'Decay cron scheduled')

  // ── Org posture recalculation (every 4h) ───

  setInterval(async () => {
    try {
      const db      = getDb()
      const tenants = await db.select({ id: schema.tenants.id })
        .from(schema.tenants)
        .where(eq(schema.tenants.status, 'active'))
        .limit(1000)

      for (const t of tenants) {
        await scorer.scoreOrgPosture(t.id).catch(() => {})
      }
    } catch (err) {
      log.error({ err }, 'Org posture sweep failed')
    }
  }, 4 * 60 * 60_000)

  // ── Health + API ────────────────────────────

  const app = new Hono()

  app.get('/health', ctx => ctx.json({
    status: 'ok', service: 'risk-scoring-engine', timestamp: new Date(),
  }))

  // Trigger manual score recalculation
  app.post('/internal/score-user', async ctx => {
    const body = await ctx.req.json() as { tenantId: string; userId: string }
    const result = await scorer.scoreUser(body.tenantId, body.userId)
    return ctx.json({ success: true, data: result })
  })

  app.post('/internal/score-asset', async ctx => {
    const body = await ctx.req.json() as { tenantId: string; assetId: string }
    const result = await scorer.scoreAsset(body.tenantId, body.assetId)
    return ctx.json({ success: true, data: result })
  })

  app.post('/internal/score-org', async ctx => {
    const body = await ctx.req.json() as { tenantId: string }
    const result = await scorer.scoreOrgPosture(body.tenantId)
    return ctx.json({ success: true, data: result })
  })

  const port = parseInt(process.env['PORT'] ?? '3007', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Risk Scoring Engine on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down...')
    await worker.close()
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

async function runDecayCycle(scorer: RiskScoringService) {
  try {
    const db      = getDb()
    const tenants = await db.select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.status, 'active'))
      .limit(1000)

    let totalUpdated = 0
    for (const t of tenants) {
      const updated = await scorer.runDecayForTenant(t.id).catch(() => 0)
      totalUpdated += updated
    }
    log.info({ updated: totalUpdated }, 'Nightly decay cycle complete')
  } catch (err) {
    log.error({ err }, 'Decay cycle failed')
  }
}

start().catch(err => {
  log.fatal({ err }, '❌ Risk scoring engine failed to start')
  process.exit(1)
})
