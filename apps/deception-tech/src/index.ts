import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { Queue }      from 'bullmq'
import { v4 as uuid } from 'uuid'
import { eq, and, desc, gte } from 'drizzle-orm'
import { Redis } from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import {
  DeployHoneypotSchema, RECOMMENDED_GRID,
  generateHoneypotValue,
  type Honeypot, type HoneypotTrigger, type HoneypotGridSummary,
} from './models/honeypot.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'deception-tech' })

// ─────────────────────────────────────────────
// TRIGGER ALERT PUBLISHER
// ─────────────────────────────────────────────

async function publishTriggerAlert(
  trigger:  HoneypotTrigger,
  honeypot: Honeypot,
  redis:    Redis,
): Promise<void> {
  // Inject a CRITICAL alert into the ingestion pipeline
  const alertPayload = {
    tenantId:        trigger.tenantId,
    sourceType:      'deception_tech',
    eventAction:     'honeypot_triggered',
    eventCategory:   'deception',
    actorUserId:     trigger.actorUserId ?? 'unknown',
    actorIp:         trigger.actorIp ?? 'unknown',
    actorIpCountry:  trigger.actorCountry ?? 'unknown',
    outcome:         'success',
    eventTime:       trigger.triggeredAt.toISOString(),
    rawEvent: {
      honeypotId:      honeypot.id,
      honeypotName:    honeypot.name,
      honeypotType:    honeypot.type,
      triggerMethod:   trigger.triggerMethod,
      threatScore:     trigger.threatScore,
      isExternal:      trigger.isExternal,
      _deceptionTech:  true,
      _honeypotTriggered: true,
    },
    // Direct alert creation
    _createAlert: {
      title:     `🍯 HONEYPOT TRIGGERED: ${honeypot.name}`,
      severity:  honeypot.alertSeverity,
      priority:  honeypot.alertSeverity === 'critical' ? 'P1' : 'P2',
      ruleId:    'ZF-DECEPTION-001',
      narrative: `Honeypot "${honeypot.name}" (type: ${honeypot.type}) was accessed by ${trigger.actorUserId ?? trigger.actorIp ?? 'unknown actor'} from ${trigger.actorCountry ?? 'unknown location'}. This is a zero false-positive detection — any interaction with a honeypot indicates active attacker or insider threat activity.`,
    },
  }

  await redis.publish('zf:alerts:ingest', JSON.stringify(alertPayload))
  log.warn({ honeypotId: honeypot.id, honeypotName: honeypot.name, actorIp: trigger.actorIp }, '🍯 HONEYPOT TRIGGERED — alerting')
}

// ─────────────────────────────────────────────
// HONEYPOT DEPLOYER
// ─────────────────────────────────────────────

async function deployHoneypot(
  definition: Omit<Honeypot, 'id'|'tenantId'|'status'|'value'|'triggerCount'|'triggers'|'deployedAt'|'createdBy'|'lastTriggeredAt'|'retiredAt'>,
  tenantId:   string,
  createdBy:  string,
  tenantSlug: string,
  db: ReturnType<typeof getDb>,
): Promise<Honeypot> {
  const honeypotId = uuid()
  const value      = generateHoneypotValue(definition.type, tenantSlug)

  const honeypot: Honeypot = {
    id:           honeypotId,
    tenantId,
    name:         definition.name,
    type:         definition.type,
    status:       'active',
    placement:    definition.placement,
    value,
    description:  definition.description,
    tags:         definition.tags,
    triggerCount: 0,
    triggers:     [],
    deployedAt:   new Date(),
    createdBy,
    alertOnTrigger: definition.alertOnTrigger,
    alertSeverity:  definition.alertSeverity,
  }

  await db.insert(schema.honeypots).values({
    id:           honeypotId,
    tenantId,
    name:         honeypot.name,
    type:         honeypot.type,
    status:       'active',
    placement:    honeypot.placement,
    value:        honeypot.value,     // stored encrypted in production
    decoyValue:   honeypot.value,
    trackingToken: honeypotId,
    description:  honeypot.description,
    deployedTo:   honeypot.placement,
    tags:         honeypot.tags,
    triggerCount: 0,
    triggers:     [],
    alertOnTrigger: honeypot.alertOnTrigger,
    alertSeverity:  honeypot.alertSeverity,
    instructions: [],
    deployedAt:   honeypot.deployedAt,
    createdBy,
    createdAt:    new Date(),
    updatedAt:    new Date(),
  })

  log.info({ honeypotId, type: honeypot.type, placement: honeypot.placement, tenantId },
    `🍯 Honeypot deployed: ${honeypot.name}`)

  return honeypot
}

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3, enableReadyCheck: false,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error', e => log.error({ err: e }, 'Redis error'))

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/deception/deploy-grid ────────────
  // Deploy the recommended 10-honeypot grid

  app.post('/v1/deception/deploy-grid', async (ctx) => {
    const user = ctx.var.user
    if (!['TENANT_ADMIN', 'PLATFORM_ADMIN'].includes(user.role)) {
      return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    }
    const db = getDb()

    // Get tenant slug
    const [tenant] = await db.select({ slug: schema.tenants.slug })
      .from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1)
    const slug = tenant?.slug ?? user.tenantId.slice(0, 8)

    const deployed: Honeypot[] = []
    for (const def of RECOMMENDED_GRID) {
      try {
        const hp = await deployHoneypot(def, user.tenantId, user.id, slug, db)
        deployed.push(hp)
      } catch (err) {
        log.error({ err, name: def.name }, 'Failed to deploy honeypot')
      }
    }

    return ctx.json({ success: true, data: {
      deployed:  deployed.length,
      honeypots: deployed.map(h => ({ id: h.id, name: h.name, type: h.type, status: h.status })),
      message:   `${deployed.length} honeypots deployed across ${new Set(deployed.map(h => h.placement)).size} placements`,
    }})
  })

  // ── POST /v1/deception/honeypots ──────────────
  // Deploy a single custom honeypot

  app.post('/v1/deception/honeypots',
    zValidator('json', DeployHoneypotSchema),
    async (ctx) => {
      const user = ctx.var.user
      const body = ctx.req.valid('json')
      const db   = getDb()

      const [tenant] = await db.select({ slug: schema.tenants.slug })
        .from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)).limit(1)
      const slug = tenant?.slug ?? user.tenantId.slice(0, 8)

      const hp = await deployHoneypot({
        ...body,
        tags:           body.tags,
        alertOnTrigger: true,
        alertSeverity:  body.alertSeverity,
      }, user.tenantId, user.id, slug, db)

      return ctx.json({ success: true, data: hp }, 201)
    })

  // ── GET /v1/deception/honeypots ───────────────

  app.get('/v1/deception/honeypots', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const honeypots = await db.select()
      .from(schema.honeypots)
      .where(eq(schema.honeypots.tenantId, user.tenantId))
      .orderBy(desc(schema.honeypots.createdAt))
      .limit(100)

    // Mask actual values in API response
    const masked = honeypots.map(h => ({
      ...h,
      value: maskValue(h.value as string, h.type as string),
    }))

    return ctx.json({ success: true, data: masked })
  })

  // ── POST /v1/deception/trigger ────────────────
  // Called by external webhook receivers when a honeypot is touched

  app.post('/v1/deception/trigger', async (ctx) => {
    const body = await ctx.req.json() as {
      honeypotId:    string
      tenantId:      string
      actorIp?:      string
      actorUserId?:  string
      actorCountry?: string
      userAgent?:    string
      method?:       string
      context?:      Record<string, unknown>
    }
    const db = getDb()

    const [honeypot] = await db.select()
      .from(schema.honeypots)
      .where(and(
        eq(schema.honeypots.id, body.honeypotId),
        eq(schema.honeypots.tenantId, body.tenantId),
      ))
      .limit(1)

    if (!honeypot) {
      return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)
    }

    const trigger: HoneypotTrigger = {
      id:             uuid(),
      honeypotId:     honeypot.id,
      tenantId:       honeypot.tenantId,
      triggeredAt:    new Date(),
      ...(body.actorIp ? { actorIp: body.actorIp } : {}),
      ...(body.actorUserId ? { actorUserId: body.actorUserId } : {}),
      ...(body.actorCountry ? { actorCountry: body.actorCountry } : {}),
      ...(body.userAgent ? { actorUserAgent: body.userAgent } : {}),
      triggerMethod:  (body.method as any) ?? 'unknown',
      triggerContext: body.context ?? {},
      isExternal:     !body.actorIp?.startsWith('10.') && !body.actorIp?.startsWith('192.168.'),
      threatScore:    100,   // Honeypot triggers are always maximum threat score
    }

    // Update honeypot record
    const existingTriggers = (honeypot.triggers as HoneypotTrigger[]) ?? []
    await db.update(schema.honeypots)
      .set({
        status:          'triggered',
        triggerCount:    (honeypot.triggerCount ?? 0) + 1,
        lastTriggeredAt: trigger.triggeredAt,
        triggers:        [...existingTriggers.slice(-99), trigger],
        updatedAt:       new Date(),
      })
      .where(eq(schema.honeypots.id, honeypot.id))

    // Publish alert (zero false positive — always alert)
    await publishTriggerAlert(trigger, honeypot as any, redis)

    return ctx.json({ success: true, data: { triggerId: trigger.id, alertPublished: true } })
  })

  // ── GET /v1/deception/grid-summary ────────────

  app.get('/v1/deception/grid-summary', async (ctx) => {
    const user   = ctx.var.user
    const db     = getDb()
    const cutoff = new Date(Date.now() - 30 * 86_400_000)

    const honeypots = await db.select()
      .from(schema.honeypots)
      .where(eq(schema.honeypots.tenantId, user.tenantId))
      .limit(100)

    const allTriggers = (honeypots as any[]).flatMap(h =>
      ((h.triggers as HoneypotTrigger[]) ?? []).filter(t => new Date(t.triggeredAt) >= cutoff),
    )

    const coverageByType: Record<string, number> = {}
    for (const h of honeypots) {
      coverageByType[h.type as string] = (coverageByType[h.type as string] ?? 0) + 1
    }

    const summary: HoneypotGridSummary = {
      tenantId:        user.tenantId,
      totalHoneypots:  honeypots.length,
      activeCount:     honeypots.filter(h => h.status === 'active').length,
      triggeredCount:  honeypots.filter(h => h.status === 'triggered').length,
      triggersLast30d: allTriggers.length,
      zeroFalsePositives: true,   // By design — honeypots never produce FPs
      coverageByType:  coverageByType as any,
      topTriggers:     allTriggers.slice(-10).reverse(),
      riskSignals:     allTriggers.length > 0
        ? [`${allTriggers.length} honeypot touches in last 30d — active attacker likely present`]
        : ['No honeypot triggers — grid silent (good)'],
    }

    return ctx.json({ success: true, data: summary })
  })

  // ── DELETE /v1/deception/honeypots/:id ────────

  app.delete('/v1/deception/honeypots/:id', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    await db.update(schema.honeypots)
      .set({ status: 'retired', retiredAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(schema.honeypots.id, ctx.req.param('id')),
        eq(schema.honeypots.tenantId, user.tenantId),
      ))

    return ctx.json({ success: true, data: { retired: true } })
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'deception-tech', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3017', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🍯 ZonForge Deception Technology on port ${info.port}`)
    log.info(`   ${RECOMMENDED_GRID.length} recommended honeypot types`)
    log.info(`   Zero false-positive design`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down deception tech...')
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

function maskValue(value: string, type: string): string {
  if (!value) return '***'
  if (type === 'fake_ssh_key') return 'OPENSSH_PRIVATE_KEY_MASKED'
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}`
}

start().catch(err => {
  log.fatal({ err }, '❌ Deception tech failed to start')
  process.exit(1)
})
