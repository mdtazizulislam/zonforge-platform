import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { Worker, Queue } from 'bullmq'
import { v4 as uuid } from 'uuid'
import { eq, and, desc, gte } from 'drizzle-orm'
import { Redis }          from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { AiSocAnalystAgent }  from './agent/analyst-agent.js'
import {
  StartInvestigationSchema,
  ReviewInvestigationSchema,
} from './models/investigation.js'
import {
  requestIdMiddleware,
  authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'ai-soc-analyst' })

const INVESTIGATION_QUEUE = 'zf-ai-investigations'

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: null, enableReadyCheck: false,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error', (e: Error) => log.error({ err: e }, 'Redis error'))

  const bullmqConnection = {
    host:     redisConfig.host,
    port:     redisConfig.port,
    password: redisConfig.password,
    tls:      redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  }

  let agent: AiSocAnalystAgent | null = null
  try {
    agent = new AiSocAnalystAgent()
    log.info('✅ AI SOC Analyst agent initialized (claude-sonnet-4-6)')
  } catch (err) {
    log.warn({ err }, '⚠️  AI agent not available — investigations will queue without execution')
  }

  const queue = new Queue(INVESTIGATION_QUEUE, { connection: bullmqConnection })

  // ── BullMQ Worker ─────────────────────────────

  const worker = new Worker<{ alertId: string; tenantId: string; maxSteps: number; investigationId: string }>(
    INVESTIGATION_QUEUE,
    async (job) => {
      const { alertId, tenantId, maxSteps, investigationId } = job.data
      const db = getDb()

      log.info({ investigationId, alertId, tenantId }, '🔍 Starting AI investigation')

      // Update status to investigating
      await db.update((schema as any).investigations)
        .set({ status: 'investigating', updatedAt: new Date() })
        .where(eq((schema as any).investigations.id, investigationId))

      if (!agent) {
        await db.update((schema as any).investigations)
          .set({
            status: 'failed',
            executiveSummary: 'AI agent not configured. Set ANTHROPIC_API_KEY to enable autonomous investigation.',
            updatedAt: new Date(),
          })
          .where(eq((schema as any).investigations.id, investigationId))
        return
      }

      try {
        const result = await agent.investigate(alertId, tenantId, maxSteps)

        await db.update((schema as any).investigations)
          .set({
            status:           result.requiresHuman ? 'awaiting_approval' : 'completed',
            verdict:          result.verdict,
            confidence:       result.confidence,
            severityRec:      result.severityRec,
            requiresHuman:    result.requiresHuman,
            thoughts:         result.thoughts,
            evidence:         result.evidence,
            hypotheses:       result.hypotheses,
            executiveSummary: result.executiveSummary,
            detailedReport:   result.detailedReport,
            attackNarrative:  result.attackNarrative,
            iocList:          result.iocList,
            recommendations:  result.recommendations,
            agentModel:       result.agentModel,
            totalSteps:       result.totalSteps,
            totalTokens:      result.totalTokens,
            durationMs:       result.durationMs,
            completedAt:      result.completedAt,
            updatedAt:        new Date(),
          })
          .where(eq((schema as any).investigations.id, investigationId))

        log.info({
          investigationId, verdict: result.verdict,
          confidence: result.confidence, steps: result.totalSteps,
        }, `✅ Investigation complete: ${result.verdict}`)

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error({ err, investigationId }, 'Investigation failed')
        await db.update((schema as any).investigations)
          .set({ status: 'failed', executiveSummary: `Investigation failed: ${msg}`, updatedAt: new Date() })
          .where(eq((schema as any).investigations.id, investigationId))
      }
    },
    { connection: bullmqConnection, concurrency: 3 },
  )

  worker.on('error', err => log.error({ err }, 'Investigation worker error'))

  // ── Auto-investigate P1/P2 alerts ─────────────
  // Subscribe to alert creation events via Redis pub/sub

  const subscriber = redis.duplicate()
  await subscriber.subscribe('zf:alerts:created')

  subscriber.on('message', async (_channel, message) => {
    try {
      const { alertId, tenantId, priority } = JSON.parse(message) as {
        alertId: string; tenantId: string; priority: string
      }

      if (!['P1', 'P2'].includes(priority)) return

      log.info({ alertId, priority }, '🤖 Auto-triggering AI investigation for P1/P2 alert')

      const db = getDb()
      const investigationId = uuid()

      await db.insert((schema as any).investigations).values({
        id:              investigationId,
        tenantId,
        alertId,
        alertTitle:      '',
        alertSeverity:   '',
        status:          'queued',
        verdict:         null,
        confidence:      0,
        severityRec:     null,
        requiresHuman:   false,
        thoughts:        [],
        evidence:        [],
        hypotheses:      [],
        executiveSummary: '',
        detailedReport:  '',
        attackNarrative: '',
        iocList:         [],
        recommendations: [],
        agentModel:      'claude-sonnet-4-6',
        totalSteps:      0,
        totalTokens:     0,
        durationMs:      0,
        triggeredBy:     'auto',
        createdAt:       new Date(),
        updatedAt:       new Date(),
      })

      await queue.add(`investigate-${alertId}`, {
        alertId, tenantId, maxSteps: 10, investigationId,
      }, { priority: priority === 'P1' ? 1 : 2 })

    } catch (err) {
      log.error({ err, message }, 'Failed to auto-trigger investigation')
    }
  })

  // ─────────────────────────────────────────────
  // REST API
  // ─────────────────────────────────────────────

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], allowMethods: ['GET','POST','OPTIONS'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/investigations ───────────────────

  app.post('/v1/investigations',
    zValidator('json', StartInvestigationSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { alertId, maxSteps } = ctx.req.valid('json')
      const db = getDb()

      // Verify alert belongs to tenant
      const [alert] = await db.select({ id: schema.alerts.id, title: schema.alerts.title, severity: schema.alerts.severity })
        .from(schema.alerts)
        .where(and(eq(schema.alerts.id, alertId), eq(schema.alerts.tenantId, user.tenantId)))
        .limit(1)

      if (!alert) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

      const investigationId = uuid()

      await db.insert((schema as any).investigations).values({
        id:              investigationId,
        tenantId:        user.tenantId,
        alertId,
        alertTitle:      alert.title,
        alertSeverity:   alert.severity,
        status:          'queued',
        verdict:         null,
        confidence:      0,
        severityRec:     null,
        requiresHuman:   false,
        thoughts:        [],
        evidence:        [],
        hypotheses:      [],
        executiveSummary: '',
        detailedReport:  '',
        attackNarrative: '',
        iocList:         [],
        recommendations: [],
        agentModel:      'claude-sonnet-4-6',
        totalSteps:      0,
        totalTokens:     0,
        durationMs:      0,
        triggeredBy:     user.id,
        createdAt:       new Date(),
        updatedAt:       new Date(),
      })

      await queue.add(`investigate-${alertId}`, {
        alertId, tenantId: user.tenantId, maxSteps, investigationId,
      }, { priority: 1 })

      return ctx.json({ success: true, data: { investigationId, status: 'queued', message: 'Investigation queued. Typically completes in 30–90 seconds.' } }, 202)
    })

  // ── GET /v1/investigations ────────────────────

  app.get('/v1/investigations', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()
    const limit = parseInt(ctx.req.query('limit') ?? '20', 10)

    const results = await db.select()
      .from((schema as any).investigations)
      .where(eq((schema as any).investigations.tenantId, user.tenantId))
      .orderBy(desc((schema as any).investigations.createdAt))
      .limit(limit)

    return ctx.json({ success: true, data: results })
  })

  // ── GET /v1/investigations/:id ────────────────

  app.get('/v1/investigations/:id', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const [inv] = await db.select()
      .from((schema as any).investigations)
      .where(and(
        eq((schema as any).investigations.id, ctx.req.param('id')),
        eq((schema as any).investigations.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!inv) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)
    return ctx.json({ success: true, data: inv })
  })

  // ── POST /v1/investigations/:id/review ────────

  app.post('/v1/investigations/:id/review',
    zValidator('json', ReviewInvestigationSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { investigationId, verdict, notes } = ctx.req.valid('json')
      const db = getDb()

      await db.update((schema as any).investigations)
        .set({
          status:          'completed',
          humanVerdict:    verdict,
          humanNotes:      notes ?? null,
          humanReviewedBy: user.id,
          reviewedAt:      new Date(),
          updatedAt:       new Date(),
        })
        .where(and(
          eq((schema as any).investigations.id, investigationId),
          eq((schema as any).investigations.tenantId, user.tenantId),
        ))

      return ctx.json({ success: true, data: { reviewed: true, verdict } })
    })

  // ── GET /v1/investigations/stats ──────────────

  app.get('/v1/investigations/stats', async (ctx) => {
    const user   = ctx.var.user
    const db     = getDb()
    const cutoff = new Date(Date.now() - 30 * 86_400_000)

    const all = await db.select({
      verdict: (schema as any).investigations.verdict,
      status:  (schema as any).investigations.status,
    })
      .from((schema as any).investigations)
      .where(and(
        eq((schema as any).investigations.tenantId, user.tenantId),
        gte((schema as any).investigations.createdAt, cutoff),
      ))
      .limit(500)

    const tpCount  = all.filter(i => i.verdict === 'true_positive').length
    const fpCount  = all.filter(i => i.verdict === 'false_positive').length
    const pending  = all.filter(i => i.status === 'awaiting_approval').length
    const total    = all.length

    return ctx.json({ success: true, data: {
      totalInvestigations: total,
      truePositives:       tpCount,
      falsePositives:      fpCount,
      pendingReview:       pending,
      tpRate:              total > 0 ? Math.round((tpCount / total) * 100) : 0,
      fpRate:              total > 0 ? Math.round((fpCount / total) * 100) : 0,
      period:              '30 days',
    }})
  })

  app.get('/health', (ctx) => ctx.json({
    status: 'ok', service: 'ai-soc-analyst',
    agentReady: !!agent, queueName: INVESTIGATION_QUEUE, timestamp: new Date(),
  }))

  const port = parseInt(process.env['PORT'] ?? '3015', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge AI SOC Analyst on port ${info.port}`)
    log.info(`   Agent: ${agent ? 'claude-sonnet-4-6 ✅' : '⚠️  API key not set'}`)
    log.info(`   Auto-investigate: P1/P2 alerts via Redis pub/sub`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down AI SOC analyst...')
    await worker.close()
    await subscriber.unsubscribe()
    await subscriber.quit()
    await queue.close()
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ AI SOC Analyst failed to start')
  process.exit(1)
})
