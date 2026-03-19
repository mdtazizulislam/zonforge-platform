import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { BillingService } from './services/billing.service.js'
import { createBillingRouter } from './routes/billing.routes.js'
import { authMiddleware, requestIdMiddleware } from '@zonforge/auth-utils'
import {
  runUsageSnapshot, checkUsageAlerts, checkTrialExpirations,
} from './workers/usage-snapshot.worker.js'

const log = createLogger({ service: 'billing-service' })

async function start() {
  // ── Database ────────────────────────────────
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  // ── Services ─────────────────────────────────
  const billing = new BillingService()

  // ── Cron jobs ─────────────────────────────────

  // Nightly usage snapshot at 1 AM UTC
  scheduleDailyCron('01:00', async () => {
    log.info('Running nightly usage snapshot...')
    await runUsageSnapshot(billing)
    await checkUsageAlerts(billing)
    await checkTrialExpirations()
  })

  // Trial expiry check every 6 hours
  setInterval(async () => {
    await checkTrialExpirations().catch(err =>
      log.error({ err }, 'Trial expiry check failed'),
    )
  }, 6 * 60 * 60_000)

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

  // Auth required on all /v1/* except public plan listing
  app.use('/v1/billing/subscription', authMiddleware)
  app.use('/v1/billing/usage', authMiddleware)
  app.use('/v1/billing/checkout', authMiddleware)
  app.use('/v1/billing/portal', authMiddleware)
  app.use('/v1/billing/cancel', authMiddleware)

  app.route('/', createBillingRouter(billing))

  app.get('/health', (ctx) => ctx.json({
    status:  'ok',
    service: 'billing-service',
    stripe:  !!process.env['ZONFORGE_STRIPE_SECRET_KEY'] ? 'configured' : 'mock mode',
    timestamp: new Date(),
  }))

  app.onError((err, ctx) => {
    log.error({ err }, 'Unhandled error')
    return ctx.json({ success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
  })

  const port = parseInt(process.env['PORT'] ?? '3010', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Billing Service on port ${info.port}`)
    log.info(`   Stripe: ${process.env['ZONFORGE_STRIPE_SECRET_KEY'] ? 'live' : 'mock mode'}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down billing service...')
    await closeDb()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

// ── Simple daily cron scheduler ───────────────

function scheduleDailyCron(time: string, fn: () => Promise<void>): void {
  const [targetHour, targetMin] = time.split(':').map(Number)

  function msUntilNext(): number {
    const now  = new Date()
    const next = new Date()
    next.setUTCHours(targetHour!, targetMin!, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    return next.getTime() - now.getTime()
  }

  function schedule() {
    setTimeout(async () => {
      await fn().catch(err => log.error({ err, time }, 'Cron job failed'))
      schedule()   // reschedule for next day
    }, msUntilNext())
  }

  schedule()
  log.info({ time }, 'Daily cron scheduled')
}

start().catch(err => {
  log.fatal({ err }, '❌ Billing service failed to start')
  process.exit(1)
})
