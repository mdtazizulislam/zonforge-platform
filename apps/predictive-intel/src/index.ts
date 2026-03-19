import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { eq, and, desc, gte } from 'drizzle-orm'
import { Redis }      from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { PredictiveEngine } from './forecaster/prediction-engine.js'
import {
  GetForecastSchema, AcknowledgePredictionSchema,
  KNOWN_CAMPAIGNS, INDUSTRY_THREAT_MAP,
} from './models/prediction.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'predictive-intel' })
const FORECAST_CACHE_TTL = 30 * 60   // 30 minutes

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error',   (e: unknown) => log.error({ err: e }, 'Redis error'))

  const engine = new PredictiveEngine()

  // ── Refresh forecast every 6 hours ────────────
  setInterval(async () => {
    try {
      const db = getDb()
      const tenants = await db.select({ id: schema.tenants.id, slug: schema.tenants.slug })
        .from(schema.tenants).where(eq(schema.tenants.status, 'active')).limit(500)

      for (const tenant of tenants) {
        const forecast = await engine.generateForecast(tenant.id, '72h')
        await redis.setex(
          `zf:predictive:${tenant.id}:72h`,
          FORECAST_CACHE_TTL,
          JSON.stringify(forecast),
        )
      }
      log.info({ count: tenants.length }, '⏰ Forecasts refreshed for all active tenants')
    } catch (err) {
      log.error({ err }, 'Scheduled forecast refresh failed')
    }
  }, 6 * 60 * 60_000)

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── GET /v1/predict/forecast ──────────────────

  app.get('/v1/predict/forecast', async (ctx) => {
    const user     = ctx.var.user
    const horizon  = (ctx.req.query('horizon') ?? '72h') as any
    const industry = ctx.req.query('industry') ?? 'general'
    const refresh  = ctx.req.query('refresh') === 'true'

    const cacheKey = `zf:predictive:${user.tenantId}:${horizon}`

    if (!refresh) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return ctx.json({ success: true, data: JSON.parse(cached), cached: true })
      }
    }

    const forecast = await engine.generateForecast(user.tenantId, horizon, industry)
    await redis.setex(cacheKey, FORECAST_CACHE_TTL, JSON.stringify(forecast))

    return ctx.json({ success: true, data: forecast, cached: false })
  })

  // ── GET /v1/predict/campaigns ─────────────────

  app.get('/v1/predict/campaigns', (ctx) => {
    const industry = ctx.req.query('industry')
    const campaigns = industry
      ? KNOWN_CAMPAIGNS.filter(c => c.active && c.targetIndustries.includes(industry))
      : KNOWN_CAMPAIGNS.filter(c => c.active)
    return ctx.json({ success: true, data: campaigns })
  })

  // ── GET /v1/predict/industry-context ──────────

  app.get('/v1/predict/industry-context', (ctx) => {
    const industry = ctx.req.query('industry') ?? 'general'
    const context  = INDUSTRY_THREAT_MAP[industry] ?? INDUSTRY_THREAT_MAP['general']!
    return ctx.json({ success: true, data: context })
  })

  // ── POST /v1/predict/acknowledge ──────────────

  app.post('/v1/predict/acknowledge',
    zValidator('json', AcknowledgePredictionSchema),
    async (ctx) => {
      const { predictionId, notes } = ctx.req.valid('json')
      // In production: update prediction acknowledgment in DB
      log.info({ predictionId, notes }, 'Prediction acknowledged')
      return ctx.json({ success: true, data: { acknowledged: true, predictionId } })
    })

  // ── GET /v1/predict/threat-score ─────────────

  app.get('/v1/predict/threat-score', async (ctx) => {
    const user   = ctx.var.user
    const cached = await redis.get(`zf:predictive:${user.tenantId}:72h`)

    if (cached) {
      const forecast = JSON.parse(cached)
      return ctx.json({ success: true, data: {
        overallScore:      forecast.overallThreatScore,
        overallLevel:      forecast.overallThreatLevel,
        topPrediction:     forecast.predictions?.[0] ?? null,
        predictionCount:   forecast.predictions?.length ?? 0,
        activeCampaigns:   forecast.activeCampaigns?.length ?? 0,
        lastUpdated:       forecast.generatedAt,
      }})
    }

    // Quick score without full forecast
    const score = await engine.collectSignals(user.tenantId)
    const level = score.length >= 4 ? 'elevated' : score.length >= 2 ? 'guarded' : 'low'
    return ctx.json({ success: true, data: {
      overallScore:    score.length * 20,
      overallLevel:    level,
      topPrediction:   null,
      predictionCount: 0,
      activeCampaigns: KNOWN_CAMPAIGNS.filter(c => c.active).length,
      lastUpdated:     new Date(),
    }})
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'predictive-intel', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3020', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`📡 ZonForge Predictive Threat Intelligence on port ${info.port}`)
    log.info(`   ${KNOWN_CAMPAIGNS.filter(c => c.active).length} active campaigns tracked`)
    log.info(`   ${Object.keys(INDUSTRY_THREAT_MAP).length} industry profiles`)
    log.info(`   Forecast refresh: every 6 hours`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down predictive intel...')
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Predictive intel failed to start')
  process.exit(1)
})
