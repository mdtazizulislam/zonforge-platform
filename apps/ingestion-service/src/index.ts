import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { Redis } from 'ioredis'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import {
  createQueue, getQueueConnection, QUEUE_NAMES,
} from './queues.js'
import { IngestionService } from './services/ingestion.service.js'
import { createIngestionRouter } from './routes/ingest.routes.js'

const log = createLogger({ service: 'ingestion-service' })

async function start() {
  // ── Database ────────────────────────────────
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  // ── Redis ───────────────────────────────────
  const redis = new Redis({
    host:     redisConfig.host,
    port:     redisConfig.port,
    ...(redisConfig.password != null && redisConfig.password !== ''
      ? { password: redisConfig.password }
      : {}),
    ...(redisConfig.tls ? { tls: {} } : {}),
    maxRetriesPerRequest: 3,
    retryStrategy: (t) => Math.min(t * 100, 3000),
  })
  redis.on('error', (e: Error) => log.error({ err: e }, 'Redis error'))
  log.info('✅ Redis connected')

  // ── BullMQ Queue ────────────────────────────
  const queueConn = getQueueConnection(redisConfig)
  const rawEventsQueue = createQueue(QUEUE_NAMES.RAW_EVENTS, queueConn)
  log.info('✅ BullMQ queue ready')

  // ── Service ─────────────────────────────────
  const ingestionService = new IngestionService(rawEventsQueue, redis)

  // ── Hono App ─────────────────────────────────
  const app = new Hono()

  app.use('*', cors({
    origin:        ['https://app.zonforge.com'],
    allowMethods:  ['GET', 'POST', 'OPTIONS'],
    allowHeaders:  ['Content-Type', 'Authorization', 'X-Api-Key',
                    'X-ZonForge-Signature', 'Idempotency-Key', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'],
  }))
  app.use('*', secureHeaders())

  app.route('/', createIngestionRouter(ingestionService))

  app.get('/health', (ctx) => ctx.json({
    status: 'ok', service: 'ingestion-service',
    queue: { name: QUEUE_NAMES.RAW_EVENTS },
    timestamp: new Date(),
  }))

  app.onError((err, ctx) => {
    log.error({ err }, 'Unhandled error')
    return ctx.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    }, 500)
  })

  // ── Server ───────────────────────────────────
  const port = parseInt(process.env['PORT'] ?? '3001', 10)
  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`🚀 ZonForge Ingestion Service on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  // ── Graceful shutdown ────────────────────────
  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down...')
    await rawEventsQueue.close()
    await redis.quit()
    await closeDb()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch((err) => {
  log.fatal({ err }, '❌ Ingestion service failed to start')
  process.exit(1)
})
