import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Redis } from 'ioredis'
import { initClickHouse, closeClickHouse } from '@zonforge/db-client'
import { clickhouseConfig, redisConfig, queueConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { NormalizationService } from './services/normalization.service.js'
import {
  createNormalizationWorker,
  createDlqMonitorWorker,
} from './workers/normalization.worker.js'
import {
  startLagMonitor,
  getMetrics,
} from './services/lag-monitor.service.js'

const log = createLogger({ service: 'normalization-worker' })

async function start() {
  // ── ClickHouse ──────────────────────────────
  initClickHouse(clickhouseConfig)
  log.info('✅ ClickHouse connected')

  // ── Redis ───────────────────────────────────
  const redis = new Redis({
    host:     redisConfig.host,
    port:     redisConfig.port,
    password: redisConfig.password,
    tls:      redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error',   (e: Error) => log.error({ err: e }, 'Redis error'))

  // ── Services ────────────────────────────────
  const normalizationService = new NormalizationService()

  // ── Workers ─────────────────────────────────
  const worker = createNormalizationWorker(redis, normalizationService)

  // ── DLQ Monitor ─────────────────────────────
  createDlqMonitorWorker(redis)

  // ── Lag Monitor ─────────────────────────────
  await startLagMonitor(redis)

  // ── Metrics + Health HTTP server ─────────────
  const app = new Hono()

  app.get('/health', (ctx) => ctx.json({
    status:  'ok',
    service: 'normalization-worker',
    worker:  { running: !worker.closing },
    timestamp: new Date(),
  }))

  app.get('/metrics', async (ctx) => {
    const metrics = await getMetrics(redis)
    ctx.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    return ctx.text(metrics)
  })

  const port = parseInt(process.env['PORT'] ?? '3002', 10)
  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`🚀 ZonForge Normalization Worker running on port ${info.port}`)
    log.info(`   Concurrency: ${queueConfig.concurrency}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  // ── Graceful shutdown ────────────────────────
  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down normalization worker...')
    await worker.close()
    await closeClickHouse()
    await redis.quit()
    log.info('✅ Normalization worker shut down cleanly')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch((err) => {
  log.fatal({ err }, '❌ Normalization worker failed to start')
  process.exit(1)
})
