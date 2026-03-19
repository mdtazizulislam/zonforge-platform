import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { Redis } from 'ioredis'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { IocStore } from './services/ioc-store.service.js'
import { FeedRefreshWorker } from './workers/feed-refresh.worker.js'
import { createThreatIntelRouter } from './routes/threat-intel.routes.js'

const log = createLogger({ service: 'threat-intel-service' })

async function start() {
  // ── PostgreSQL ──────────────────────────────
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  // ── Redis ───────────────────────────────────
  const redis = new Redis({
    host:     redisConfig.host,
    port:     redisConfig.port,
    password: redisConfig.password,
    tls:      redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (t) => Math.min(t * 100, 3000),
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error',   (e: Error) => log.error({ err: e }, 'Redis error'))

  // ── Services ────────────────────────────────
  const store = new IocStore(redis)

  const otxApiKey    = process.env['ZONFORGE_OTX_API_KEY']    ?? ''
  const abuseIpDbKey = process.env['ZONFORGE_ABUSEIPDB_API_KEY'] ?? ''

  // Refresh interval: 6h production, 1h in dev for faster testing
  const refreshIntervalMs = env.ZONFORGE_ENV === 'production'
    ? 6 * 60 * 60 * 1000
    : 60 * 60 * 1000

  const feedWorker = new FeedRefreshWorker(
    store, otxApiKey, abuseIpDbKey, refreshIntervalMs,
  )

  // ── Start feed refresh worker ────────────────
  feedWorker.start()

  // ── Hono App ─────────────────────────────────
  const app = new Hono()

  app.use('*', cors({
    origin:        ['https://app.zonforge.com'],
    allowMethods:  ['GET', 'POST', 'OPTIONS'],
    allowHeaders:  ['Content-Type', 'X-Admin-Key', 'X-Request-Id'],
  }))

  app.route('/', createThreatIntelRouter(store, feedWorker))

  app.onError((err, ctx) => {
    log.error({ err }, 'Unhandled error')
    return ctx.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    }, 500)
  })

  // ── Server ───────────────────────────────────
  const port = parseInt(process.env['PORT'] ?? '3005', 10)
  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`🚀 ZonForge Threat Intel Service on port ${info.port}`)
    log.info(`   Feed refresh interval: ${refreshIntervalMs / 1000 / 60} minutes`)
    log.info(`   OTX: ${otxApiKey ? '✅ configured' : '⚠️ not configured'}`)
    log.info(`   AbuseIPDB: ${abuseIpDbKey ? '✅ configured' : '⚠️ not configured'}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  // ── Graceful shutdown ────────────────────────
  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down threat intel service...')
    feedWorker.stop()
    await closeDb()
    await redis.quit()
    log.info('✅ Threat intel service shut down cleanly')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch((err) => {
  log.fatal({ err }, '❌ Threat intel service failed to start')
  process.exit(1)
})
