import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { v4 as uuid } from 'uuid'
import { eq, and, desc } from 'drizzle-orm'
import { Redis }      from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { generateHoneypot, generateStandardGrid } from './honeypots/honeypot-factory.js'
import { TriggerMonitor } from './monitors/trigger-monitor.js'
import {
  DeployHoneypotSchema, TriggerHoneypotSchema,
} from './models/honeypot.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'deception-grid' })

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: null, enableReadyCheck: false,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error', (e: unknown) => log.error({ err: e }, 'Redis error'))

  const monitor = new TriggerMonitor()
  const app     = new Hono()

  app.use('*', requestIdMiddleware)
  app.use('*', cors({
    origin: ['http://localhost:5173', 'https://app.zonforge.com'],
    allowMethods: ['GET','POST','DELETE','OPTIONS'],
    credentials: true,
  }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ─────────────────────────────────────────────
  // CANARY WEBHOOK (public — no auth)
  // Receives trigger callbacks from canary services
  // ─────────────────────────────────────────────

  app.post('/canary/trigger', zValidator('json', TriggerHoneypotSchema), async (ctx) => {
    const { trackingToken, triggerType, sourceIp, userAgent, requestPath, rawRequest } = ctx.req.valid('json')

    const result = await monitor.processTrigger(
      trackingToken, triggerType, sourceIp, userAgent, requestPath, rawRequest,
    )

    // Return generic 200 — don't leak info to attacker
    return ctx.json({ ok: true })
  })

  // DNS canary callback (GET — DNS logging services use GET)
  app.get('/canary/dns/:token', async (ctx) => {
    const token   = ctx.req.param('token')
    const sourceIp = ctx.req.header('CF-Connecting-IP') ?? ctx.req.header('X-Forwarded-For') ?? 'unknown'

    await monitor.processTrigger(token, 'dns_resolution', sourceIp, undefined, ctx.req.url)
    return ctx.text('', 200)
  })

  // ─────────────────────────────────────────────
  // AUTHENTICATED API
  // ─────────────────────────────────────────────

  // ── GET /v1/deception/honeypots ───────────────

  app.get('/v1/deception/honeypots', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const honeypots = await db.select()
      .from(schema.honeypots)
      .where(eq(schema.honeypots.tenantId, user.tenantId))
      .orderBy(desc(schema.honeypots.createdAt))
      .limit(100)

    return ctx.json({ success: true, data: honeypots })
  })

  // ── POST /v1/deception/honeypots ──────────────

  app.post('/v1/deception/honeypots',
    zValidator('json', DeployHoneypotSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { type, name, deployAll } = ctx.req.valid('json')
      const db   = getDb()

      const toGenerate = deployAll
        ? generateStandardGrid(user.tenantId)
        : [generateHoneypot(type, user.tenantId, name)]

      const created: any[] = []

      for (const gen of toGenerate) {
        const id = uuid()
        await db.insert(schema.honeypots).values({
          id,
          tenantId:           user.tenantId,
          type:               gen.type,
          name:               gen.name,
          description:        gen.description,
          status:             'active',
          decoyValue:         gen.decoyValue,
          trackingToken:      gen.trackingToken,
          deployedTo:         gen.deployedTo,
          instructions:       gen.instructions,
          triggeredAt:        null,
          triggerCount:       0,
          lastTriggerDetails: null,
          deployedAt:         new Date(),
          createdAt:          new Date(),
          updatedAt:          new Date(),
        })
        created.push({ id, type: gen.type, name: gen.name, decoyValue: gen.decoyValue, instructions: gen.instructions })
      }

      log.info({ tenantId: user.tenantId, count: created.length }, `🍯 ${created.length} honeypot(s) deployed`)

      return ctx.json({ success: true, data: { created, count: created.length } }, 201)
    })

  // ── DELETE /v1/deception/honeypots/:id ────────

  app.delete('/v1/deception/honeypots/:id', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    await db.update(schema.honeypots)
      .set({ status: 'decommissioned', updatedAt: new Date() })
      .where(and(
        eq(schema.honeypots.id, ctx.req.param('id')),
        eq(schema.honeypots.tenantId, user.tenantId),
      ))

    return ctx.json({ success: true, data: { decommissioned: true } })
  })

  // ── GET /v1/deception/triggers ────────────────

  app.get('/v1/deception/triggers', async (ctx) => {
    const user  = ctx.var.user
    const db    = getDb()
    const limit = parseInt(ctx.req.query('limit') ?? '50', 10)

    const triggers = await db.select()
      .from(schema.honeypotTriggers)
      .where(eq(schema.honeypotTriggers.tenantId, user.tenantId))
      .orderBy(desc(schema.honeypotTriggers.triggeredAt))
      .limit(limit)

    return ctx.json({ success: true, data: triggers })
  })

  // ── GET /v1/deception/stats ───────────────────

  app.get('/v1/deception/stats', async (ctx) => {
    const user  = ctx.var.user
    const stats = await monitor.getGridStats(user.tenantId)
    return ctx.json({ success: true, data: stats })
  })

  // ── POST /v1/deception/test-trigger ───────────
  // Simulate a trigger for testing (TENANT_ADMIN only)

  app.post('/v1/deception/test-trigger/:id', async (ctx) => {
    const user = ctx.var.user
    if (!['TENANT_ADMIN', 'PLATFORM_ADMIN'].includes(user.role)) {
      return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    }

    const db = getDb()
    const [hp] = await db.select({ trackingToken: schema.honeypots.trackingToken })
      .from(schema.honeypots)
      .where(and(
        eq(schema.honeypots.id, ctx.req.param('id')),
        eq(schema.honeypots.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!hp) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

    const result = await monitor.processTrigger(
      hp.trackingToken, 'test_trigger', '192.0.2.1', 'ZonForge Test Client', '/test',
      { test: true, triggeredBy: user.id },
    )

    return ctx.json({ success: true, data: { ...result, message: 'Test trigger fired — check alerts' } })
  })

  app.get('/health', (ctx) => ctx.json({
    status: 'ok', service: 'deception-grid', timestamp: new Date(),
    honeypotTypes: ['credential','aws_key','api_token','s3_bucket','user_account','dns_canary','oauth_client','db_record'],
  }))

  const port = parseInt(process.env['PORT'] ?? '3017', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Deception Grid on port ${info.port}`)
    log.info(`   Canary webhook: /canary/trigger`)
    log.info(`   DNS canary:     /canary/dns/:token`)
    log.info(`   Zero false positive guarantee: ACTIVE`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down deception grid...')
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Deception grid failed to start')
  process.exit(1)
})
