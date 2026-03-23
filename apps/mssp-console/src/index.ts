import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { Redis as IORedis } from 'ioredis'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { MsspConsoleService } from './services/mssp.service.js'
import { createMsspRouter }   from './routes/mssp.routes.js'
import {
  requestIdMiddleware,
  authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'mssp-console' })

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new IORedis({
    host:     redisConfig.host,
    port:     redisConfig.port,
    password: redisConfig.password,
    tls:      redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error',   (e: unknown) => log.error({ err: e }, 'Redis error'))

  const service = new MsspConsoleService(redis)

  // Cache warming on startup
  service.getOverview().catch(err =>
    log.warn({ err }, 'Overview pre-warm failed (non-fatal)'),
  )

  // Refresh overview every 5 minutes
  setInterval(() => {
    redis.del('zf:platform:mssp:overview').catch(() => {})
  }, 5 * 60_000)

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({
    origin:       ['http://localhost:5173', 'https://app.zonforge.com', 'https://admin.zonforge.com'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials:  true,
  }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  app.route('/', createMsspRouter(service))

  app.onError((err, ctx) => {
    log.error({ err }, 'Unhandled error')
    return ctx.json({ success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
  })

  const port = parseInt(process.env['PORT'] ?? '3011', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge MSSP Console on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down MSSP console...')
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ MSSP console failed to start')
  process.exit(1)
})
