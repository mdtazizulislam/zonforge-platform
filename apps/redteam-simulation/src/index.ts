import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { z }          from 'zod'
import { Queue }      from 'bullmq'
import { v4 as uuid } from 'uuid'
import { eq, and, desc, gte } from 'drizzle-orm'
import Redis          from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import {
  createSimulationWorker,
  createScheduler,
  SIMULATION_QUEUE_NAME,
} from './workers/simulation.worker.js'
import { ScenarioRunner }   from './engine/scenario-runner.js'
import { EvaluationEngine } from './engine/evaluation-engine.js'
import {
  RunSimulationSchema,
  SimulationQuerySchema,
} from './models/simulation-result.js'
import {
  requestIdMiddleware,
  authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'redteam-simulation' })

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

  // ── Load all available scenarios ─────────────
  const runner    = new ScenarioRunner(redis)
  const evaluator = new EvaluationEngine()
  const scenarios = await runner.loadAllScenarios()

  log.info({ count: scenarios.length, ids: scenarios.map(s => s.scenario) },
    `📚 Loaded ${scenarios.length} attack scenarios`)

  // ── Start simulation worker ───────────────────
  const worker = createSimulationWorker(redis)
  log.info('⚙️  Simulation worker started (concurrency: 2)')

  // ── Start scheduler (6-hour interval) ─────────
  if (env.ZONFORGE_ENV === 'production' || process.env['REDTEAM_SCHEDULER'] === 'true') {
    const tenantId  = process.env['REDTEAM_DEFAULT_TENANT_ID'] ?? ''
    const scenarioIds = scenarios.map(s => s.scenario)
    createScheduler(redis, tenantId, scenarioIds)
    log.info('⏰ 6-hour simulation scheduler started')
  }

  const simQueue = new Queue(SIMULATION_QUEUE_NAME, { connection: redis })

  // ─────────────────────────────────────────────
  // HTTP API
  // ─────────────────────────────────────────────

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({
    origin: ['http://localhost:5173', 'https://app.zonforge.com'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── GET /v1/redteam/scenarios ─────────────────

  app.get('/v1/redteam/scenarios', async (ctx) => {
    const all = await runner.loadAllScenarios()
    return ctx.json({
      success: true,
      data: all.map(s => ({
        id:               s.scenario,
        name:             s.name,
        description:      s.description,
        category:         s.category,
        severity:         s.severity,
        mitreTechniques:  s.mitre_techniques,
        expectedRules:    s.expected_detections,
        stepCount:        s.steps.length,
        totalEvents:      s.steps.reduce((sum, st) => sum + st.count, 0),
      })),
    })
  })

  // ── POST /v1/redteam/run-simulation ───────────

  app.post(
    '/v1/redteam/run-simulation',
    zValidator('json', RunSimulationSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { scenarioId, category, runAll, dryRun } = ctx.req.valid('json')

      // Require TENANT_ADMIN or PLATFORM_ADMIN
      if (!['TENANT_ADMIN', 'PLATFORM_ADMIN', 'SECURITY_ANALYST'].includes(user.role)) {
        return ctx.json({ success: false,
          error: { code: 'FORBIDDEN', message: 'Security Analyst role or higher required' } }, 403)
      }

      const all = await runner.loadAllScenarios()

      // Determine which scenarios to run
      let toRun = all
      if (scenarioId) {
        toRun = all.filter(s => s.scenario === scenarioId)
        if (toRun.length === 0) {
          return ctx.json({ success: false,
            error: { code: 'NOT_FOUND', message: `Scenario not found: ${scenarioId}` } }, 404)
        }
      } else if (category) {
        toRun = all.filter(s => s.category === category)
      } else if (!runAll) {
        // Default: run one random scenario
        toRun = [all[Math.floor(Math.random() * all.length)]!]
      }

      // Enqueue simulation jobs
      const jobs = await Promise.all(
        toRun.map(s =>
          simQueue.add(`manual-${s.scenario}`, {
            scenarioId:  s.scenario,
            tenantId:    user.tenantId,
            triggeredBy: user.id,
            dryRun:      dryRun ?? false,
          }, { priority: 1 })
        ),
      )

      return ctx.json({
        success: true,
        data: {
          queued:     jobs.length,
          jobIds:     jobs.map(j => j.id),
          scenarios:  toRun.map(s => s.scenario),
          dryRun:     dryRun ?? false,
          message:    `${jobs.length} simulation(s) queued. Results will be available in ~30-60 seconds.`,
        },
      }, 202)
    })

  // ── GET /v1/redteam/results ───────────────────

  app.get('/v1/redteam/results', async (ctx) => {
    const user  = ctx.var.user
    const db    = getDb()
    const query = SimulationQuerySchema.safeParse({
      limit:      ctx.req.query('limit'),
      status:     ctx.req.query('status'),
      category:   ctx.req.query('category'),
      scenarioId: ctx.req.query('scenarioId'),
    })

    const { limit, status, category, scenarioId } =
      query.success ? query.data : { limit: 20, status: undefined, category: undefined, scenarioId: undefined }

    const conditions = [eq(schema.simulationResults.tenantId, user.tenantId)]
    if (status)     conditions.push(eq(schema.simulationResults.status,   status))
    if (category)   conditions.push(eq(schema.simulationResults.category, category))
    if (scenarioId) conditions.push(eq(schema.simulationResults.scenarioId, scenarioId))

    const results = await db.select()
      .from(schema.simulationResults)
      .where(and(...conditions))
      .orderBy(desc(schema.simulationResults.createdAt))
      .limit(limit)

    return ctx.json({ success: true, data: results })
  })

  // ── GET /v1/redteam/results/:id ───────────────

  app.get('/v1/redteam/results/:id', async (ctx) => {
    const user   = ctx.var.user
    const db     = getDb()
    const [result] = await db.select()
      .from(schema.simulationResults)
      .where(and(
        eq(schema.simulationResults.id, ctx.req.param('id')),
        eq(schema.simulationResults.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!result) {
      return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)
    }
    return ctx.json({ success: true, data: result })
  })

  // ── GET /v1/redteam/security-score ───────────

  app.get('/v1/redteam/security-score', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    // Try cached score first
    const [cached] = await db.select()
      .from(schema.securityScores)
      .where(eq(schema.securityScores.tenantId, user.tenantId))
      .limit(1)

    if (cached && Date.now() - cached.calculatedAt.getTime() < 60 * 60_000) {
      return ctx.json({ success: true, data: cached })
    }

    // Recalculate
    const fresh = await evaluator.calculateSecurityScore(user.tenantId)
    return ctx.json({ success: true, data: fresh })
  })

  // ── GET /v1/redteam/gap-report ────────────────

  app.get('/v1/redteam/gap-report', async (ctx) => {
    const user   = ctx.var.user
    const db     = getDb()
    const cutoff = new Date(Date.now() - 30 * 86_400_000)

    const results = await db.select({
      scenarioId:      schema.simulationResults.scenarioId,
      scenarioName:    schema.simulationResults.scenarioName,
      category:        schema.simulationResults.category,
      evaluationStatus: schema.simulationResults.evaluationStatus,
      detectionRatePct: schema.simulationResults.detectionRatePct,
      gapRules:        schema.simulationResults.gapRules,
      recommendations: schema.simulationResults.recommendations,
      createdAt:       schema.simulationResults.createdAt,
    })
      .from(schema.simulationResults)
      .where(and(
        eq(schema.simulationResults.tenantId, user.tenantId),
        gte(schema.simulationResults.createdAt, cutoff),
        eq(schema.simulationResults.status, 'completed'),
      ))
      .orderBy(desc(schema.simulationResults.createdAt))
      .limit(200)

    // Aggregate gap report
    const gapsByRule   = new Map<string, number>()
    const failsByScenario = new Map<string, { name: string; pct: number; count: number }>()

    for (const r of results) {
      const gaps = (r.gapRules as string[]) ?? []
      for (const gap of gaps) {
        gapsByRule.set(gap, (gapsByRule.get(gap) ?? 0) + 1)
      }

      if (r.evaluationStatus !== 'pass') {
        const key  = r.scenarioId
        const prev = failsByScenario.get(key) ?? { name: r.scenarioName, pct: 0, count: 0 }
        failsByScenario.set(key, {
          name:  r.scenarioName,
          pct:   Math.round((prev.pct * prev.count + Number(r.detectionRatePct)) / (prev.count + 1)),
          count: prev.count + 1,
        })
      }
    }

    return ctx.json({
      success: true,
      data: {
        period:         '30 days',
        totalRuns:      results.length,
        passRate:       results.length > 0
          ? Math.round(results.filter(r => r.evaluationStatus === 'pass').length / results.length * 100)
          : 0,
        topGapRules:    [...gapsByRule.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([rule, count]) => ({ rule, failCount: count })),
        scenariosWithGaps: [...failsByScenario.entries()]
          .map(([id, v]) => ({ scenarioId: id, ...v }))
          .sort((a, b) => a.pct - b.pct),
        generatedAt:    new Date(),
      },
    })
  })

  // ── Health ────────────────────────────────────

  app.get('/health', async (ctx) => {
    const queueSize = await simQueue.count()
    return ctx.json({
      status:     'ok',
      service:    'redteam-simulation',
      scenarios:  scenarios.length,
      queueDepth: queueSize,
      timestamp:  new Date(),
    })
  })

  const port = parseInt(process.env['PORT'] ?? '3014', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Red Team Simulation on port ${info.port}`)
    log.info(`   Scenarios: ${scenarios.map(s => s.scenario).join(', ')}`)
    log.info(`   Safety: sandbox mode ACTIVE`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down red team service...')
    await worker.close()
    await runner.close()
    await simQueue.close()
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Red team simulation service failed to start')
  process.exit(1)
})
