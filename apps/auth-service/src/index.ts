import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { authRouter } from './routes/auth.routes.js'
import { requestIdMiddleware } from './middleware/auth.middleware.js'
import { closeRedis } from './redis.js'

const log = createLogger({ service: 'auth-service' })

// ─────────────────────────────────────────────
// App Bootstrap
// ─────────────────────────────────────────────

const app = new Hono()

// ── Global middleware ─────────────────────────

app.use('*', requestIdMiddleware)

app.use('*', cors({
  origin: [
    'http://localhost:5173',     // Vite dev server
    'https://app.zonforge.com',
  ],
  allowMethods:  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders:  ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  credentials:   true,
  maxAge:        600,
}))

app.use('*', secureHeaders())

// ── Routes ────────────────────────────────────

app.route('/v1/auth', authRouter)

// ── 404 handler ───────────────────────────────

app.notFound((ctx) => ctx.json({
  success: false,
  error: { code: 'NOT_FOUND', message: `Route not found: ${ctx.req.method} ${ctx.req.path}` }
}, 404))

// ── Error handler ─────────────────────────────

app.onError((err, ctx) => {
  log.error({ err, path: ctx.req.path }, 'Unhandled error')
  return ctx.json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
  }, 500)
})

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────

async function start() {
  log.info('Initializing database connection...')
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const port = parseInt(process.env['PORT'] ?? '3100', 10)

  serve({ fetch: app.fetch, port }, (info) => {
    log.info({ port: info.port }, `🚀 ZonForge Auth Service running on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })
}

// ── Graceful shutdown ─────────────────────────

async function shutdown(signal: string) {
  log.info({ signal }, 'Shutting down gracefully...')
  await closeDb()
  await closeRedis()
  log.info('✅ Auth service shut down cleanly')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

start().catch((err) => {
  log.fatal({ err }, '❌ Auth service failed to start')
  process.exit(1)
})
