import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { tenantRouter } from './routes/tenant.routes.js'
import { authMiddleware, requestIdMiddleware } from '@zonforge/auth-utils'
import { closeRedis } from './redis.js'

const log = createLogger({ service: 'tenant-service' })

const app = new Hono()

app.use('*', requestIdMiddleware)
app.use('*', cors({
  origin: ['http://localhost:5173', 'https://app.zonforge.com'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  credentials:  true,
}))
app.use('*', secureHeaders())

// All tenant routes require auth
app.use('/v1/*', authMiddleware)
app.route('/v1', tenantRouter)

app.get('/health', (ctx) => ctx.json({
  status: 'ok', service: 'tenant-service', timestamp: new Date(),
}))

app.notFound((ctx) => ctx.json({
  success: false,
  error: { code: 'NOT_FOUND', message: 'Route not found' }
}, 404))

app.onError((err, ctx) => {
  log.error({ err }, 'Unhandled error')
  return ctx.json({ success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
})

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const port = parseInt(process.env['PORT'] ?? '3101', 10)
  serve({ fetch: app.fetch, port }, (info) => {
    log.info({ port: info.port }, `🚀 ZonForge Tenant Service running on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })
}

async function shutdown(signal: string) {
  log.info({ signal }, 'Shutting down...')
  await closeDb()
  await closeRedis()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

start().catch((err) => {
  log.fatal({ err }, '❌ Tenant service failed to start')
  process.exit(1)
})
