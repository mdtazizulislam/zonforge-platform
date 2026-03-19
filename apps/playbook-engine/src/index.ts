import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { z }          from 'zod'
import { Worker }     from 'bullmq'
import Redis          from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { PlaybookEngineService, type AlertForTrigger } from './services/playbook.service.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'
import {
  QUEUE_NAMES, createQueue, getQueueConnection,
} from '../ingestion-service/src/queues.js'
import { eq, desc } from 'drizzle-orm'

const log = createLogger({ service: 'playbook-engine' })

const CreatePlaybookSchema = z.object({
  name:              z.string().min(1).max(200),
  description:       z.string().max(1000),
  triggerSeverities: z.array(z.string()).default([]),
  triggerRuleIds:    z.array(z.string()).default([]),
  actions:           z.array(z.object({
    type:             z.string(),
    config:           z.record(z.unknown()).default({}),
    requiresApproval: z.boolean().default(false),
    delaySeconds:     z.number().int().min(0).max(3600).default(0),
  })).min(1),
  enabled:           z.boolean().default(true),
})

const ExecutePlaybookSchema = z.object({
  alertId: z.string().uuid(),
  notes:   z.string().max(500).optional(),
})

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
  redis.on('error',   (e) => log.error({ err: e }, 'Redis error'))

  const service    = new PlaybookEngineService(redis)
  const connection = getQueueConnection(redisConfig)

  // ── BullMQ worker: auto-trigger on new alerts ──

  const worker = new Worker<{
    alertId:    string
    tenantId:   string
    severity:   string
    priority:   string
    findingId:  string
    affectedUserId?: string
    affectedIp?: string
    mitreTechniques: string[]
    metadata: Record<string, unknown>
  }>(
    QUEUE_NAMES.ALERT_NOTIFICATIONS,
    async (job) => {
      const d = job.data
      if (!['P1', 'P2'].includes(d.priority)) return   // auto-trigger P1/P2 only

      const alert: AlertForTrigger = {
        id:              d.alertId,
        tenantId:        d.tenantId,
        severity:        d.severity,
        priority:        d.priority,
        findingId:       d.findingId ?? '',
        affectedUserId:  d.affectedUserId ?? null,
        affectedIp:      d.affectedIp    ?? null,
        affectedEmail:   null,
        mitreTechniques: d.mitreTechniques ?? [],
        metadata:        d.metadata ?? {},
      }

      await service.autoTriggerForAlert(alert)
    },
    { connection, concurrency: 5 },
  )

  worker.on('error', err => log.error({ err }, 'Playbook worker error'))

  // ── HTTP API ───────────────────────────────────

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({
    origin: ['http://localhost:5173', 'https://app.zonforge.com'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── GET /v1/playbooks ──────────────────────────

  app.get('/v1/playbooks', async (ctx) => {
    const user      = ctx.var.user
    const db        = getDb()
    const playbooks = await db.select()
      .from(schema.playbooks)
      .where(eq(schema.playbooks.tenantId, user.tenantId))
      .orderBy(desc(schema.playbooks.createdAt))
      .limit(100)

    return ctx.json({ success: true, data: playbooks })
  })

  // ── POST /v1/playbooks ─────────────────────────

  app.post('/v1/playbooks', zValidator('json', CreatePlaybookSchema), async (ctx) => {
    const user = ctx.var.user
    const body = ctx.req.valid('json')
    const db   = getDb()

    const [pb] = await db.insert(schema.playbooks).values({
      id:                require('uuid').v4(),
      tenantId:          user.tenantId,
      name:              body.name,
      description:       body.description,
      triggerSeverities: body.triggerSeverities,
      triggerRuleIds:    body.triggerRuleIds,
      actions:           body.actions,
      enabled:           body.enabled,
      executionCount:    0,
      lastExecutedAt:    null,
      createdAt:         new Date(),
      updatedAt:         new Date(),
    }).returning()

    return ctx.json({ success: true, data: pb }, 201)
  })

  // ── POST /v1/playbooks/:id/execute ────────────

  app.post('/v1/playbooks/:id/execute',
    zValidator('json', ExecutePlaybookSchema),
    async (ctx) => {
      const user       = ctx.var.user
      const playbookId = ctx.req.param('id')
      const { alertId } = ctx.req.valid('json')
      const db          = getDb()

      // Load playbook
      const [pb] = await db.select()
        .from(schema.playbooks)
        .where(eq(schema.playbooks.id, playbookId))
        .limit(1)

      if (!pb) {
        return ctx.json({ success: false,
          error: { code: 'NOT_FOUND', message: 'Playbook not found' } }, 404)
      }

      // Load alert
      const [alert] = await db.select()
        .from(schema.alerts)
        .where(eq(schema.alerts.id, alertId))
        .limit(1)

      if (!alert) {
        return ctx.json({ success: false,
          error: { code: 'NOT_FOUND', message: 'Alert not found' } }, 404)
      }

      const alertForTrigger: AlertForTrigger = {
        id:             alert.id,
        tenantId:       alert.tenantId,
        severity:       alert.severity,
        priority:       alert.priority,
        findingId:      alert.findingId ?? '',
        affectedUserId: alert.affectedUserId,
        affectedIp:     alert.affectedIp,
        affectedEmail:  null,
        mitreTechniques: (alert.mitreTechniques as string[]) ?? [],
        metadata:       {},
      }

      const pd = {
        id:                pb.id,
        tenantId:          pb.tenantId,
        name:              pb.name,
        description:       pb.description,
        enabled:           pb.enabled,
        triggerSeverities: (pb.triggerSeverities as string[]) ?? [],
        triggerRuleIds:    (pb.triggerRuleIds    as string[]) ?? [],
        actions:           (pb.actions           as any[])   ?? [],
      }

      const result = await service.executePlaybook(pd, alertForTrigger, user.id)
      return ctx.json({ success: true, data: result })
    })

  // ── POST /v1/playbook-executions/:id/approve ──

  app.post('/v1/playbook-executions/:id/approve', async (ctx) => {
    const user        = ctx.var.user
    const executionId = ctx.req.param('id')

    const result = await service.approveExecution(executionId, user.tenantId, user.id)
    return ctx.json({ success: result.status !== 'error', data: result })
  })

  // ── GET /v1/playbook-executions ───────────────

  app.get('/v1/playbook-executions', async (ctx) => {
    const user   = ctx.var.user
    const limit  = parseInt(ctx.req.query('limit') ?? '50', 10)
    const result = await service.listExecutions(user.tenantId, limit)
    return ctx.json({ success: true, data: result })
  })

  app.get('/health', (ctx) => ctx.json({
    status: 'ok', service: 'playbook-engine', timestamp: new Date(),
    actions: Object.keys((await import('./executors/action.executors.js')).ACTION_EXECUTORS),
  }))

  const port = parseInt(process.env['PORT'] ?? '3009', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Playbook Engine on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down playbook engine...')
    await worker.close()
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Playbook engine failed to start')
  process.exit(1)
})
