import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { Worker, Queue } from 'bullmq'
import { v4 as uuid } from 'uuid'
import { eq, and, desc } from 'drizzle-orm'
import { Redis }          from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { ProfileBuilder }  from './profiler/profile-builder.js'
import { DeviationScorer } from './scorer/deviation-scorer.js'
import {
  BuildProfileSchema, DeviationCheckSchema,
  type UserBehaviorProfile, type DeviationCheckResult,
} from './models/behavior.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'behavioral-ai' })

const PROFILE_QUEUE = 'zf-behavioral-profile-builds'
const PROFILE_TTL   = 6 * 60 * 60   // Redis cache: 6 hours

type AuthUser = {
  tenantId: string
}

function getAuthUser(ctx: any): AuthUser {
  return (ctx.var as any).user as AuthUser
}

// ─────────────────────────────────────────────
// PROFILE STORE (Redis-backed)
// ─────────────────────────────────────────────

class ProfileStore {
  constructor(private readonly redis: Redis) {}

  async get(tenantId: string, userId: string): Promise<UserBehaviorProfile | null> {
    const key    = `zf:behavioral:profile:${tenantId}:${userId}`
    const cached = await this.redis.get(key)
    return cached ? JSON.parse(cached) : null
  }

  async set(profile: UserBehaviorProfile): Promise<void> {
    const key = `zf:behavioral:profile:${profile.tenantId}:${profile.userId}`
    await this.redis.setex(key, PROFILE_TTL, JSON.stringify(profile))
  }

  async getAll(tenantId: string): Promise<string[]> {
    const pattern = `zf:behavioral:profile:${tenantId}:*`
    return this.redis.keys(pattern)
  }

  async invalidate(tenantId: string, userId: string): Promise<void> {
    await this.redis.del(`zf:behavioral:profile:${tenantId}:${userId}`)
  }
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

  const builder = new ProfileBuilder()
  const scorer  = new DeviationScorer()
  const store   = new ProfileStore(redis)
  const queue   = new Queue(PROFILE_QUEUE, { connection: bullmqConnection })

  // ── BullMQ Worker: builds/updates profiles ───

  const worker = new Worker<{
    tenantId:   string
    userId:     string
    userEmail:  string
    windowDays: number
  }>(
    PROFILE_QUEUE,
    async (job) => {
      const { tenantId, userId, userEmail, windowDays } = job.data
      log.debug({ tenantId, userId }, 'Building behavioral profile')

      const profile = await builder.buildUserProfile(tenantId, userId, userEmail, windowDays)
      await store.set(profile)

      log.info({
        tenantId, userId,
        confidence:  profile.confidence,
        dataPoints:  profile.dataPoints,
        isStable:    profile.isStable,
      }, `Profile built: ${userEmail} (confidence: ${profile.confidence}%)`)

      return { userId, confidence: profile.confidence }
    },
    { connection: bullmqConnection, concurrency: 5 },
  )

  worker.on('error', err => log.error({ err }, 'Profile worker error'))

  // ── Subscribe to ingestion events for real-time check ──

  const subscriber = redis.duplicate()
  await subscriber.subscribe('zf:events:normalized')

  subscriber.on('message', async (_chan, msg) => {
    try {
      const event = JSON.parse(msg) as {
        tenantId:    string
        actorUserId: string
        actorEmail?: string
        eventAction: string
        eventTime:   string
        actorIp?:    string
        actorIpCountry?: string
        rawEvent?:   Record<string, unknown>
      }

      if (!event.actorUserId || !event.tenantId) return

      // Load cached profile
      const profile = await store.get(event.tenantId, event.actorUserId)
      if (!profile || !profile.isStable) return

      // Build metrics from event
      const hour     = new Date(event.eventTime).getUTCHours()
      const isOffHours = hour < 6 || hour >= 22

      const req = {
        tenantId:  event.tenantId,
        userId:    event.actorUserId,
        userEmail: event.actorEmail ?? event.actorUserId,
        eventType: event.eventAction,
        metrics: {
          hour,
          country:     event.actorIpCountry ?? '',
          isOffHours,
          isAdminAction: event.eventAction.toLowerCase().includes('admin') ||
                         event.eventAction.toLowerCase().includes('role'),
        },
      }

      const result = scorer.scoreDeviation(req, profile)

      if (result.shouldAlert && result.anomalies.length > 0) {
        // Publish behavioral alert
        await redis.publish('zf:behavioral:anomaly', JSON.stringify({
          ...result,
          tenantId:  event.tenantId,
          detectedAt: new Date(),
        }))

        log.info({
          tenantId:    event.tenantId,
          userId:      event.actorUserId,
          anomalies:   result.anomalies.length,
          maxScore:    result.maxScore,
        }, `🧠 Behavioral anomaly: ${result.summary}`)
      }

    } catch { /* non-fatal */ }
  })

  // ── Schedule daily profile rebuilds ──────────

  const REBUILD_INTERVAL_MS = 24 * 60 * 60_000   // every 24 hours

  async function scheduleProfileBuilds(tenantId: string) {
    const users = await builder.getActiveUsers(tenantId, 30)
    log.info({ tenantId, userCount: users.length }, 'Scheduling profile builds')

    for (const { userId, email } of users) {
      await queue.add(`profile-${userId}`, {
        tenantId, userId, userEmail: email, windowDays: 30,
      }, { delay: Math.random() * 60_000 })   // stagger by up to 1 minute
    }
  }

  // ─────────────────────────────────────────────
  // REST API
  // ─────────────────────────────────────────────

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/behavioral/build-profiles ────────

  app.post('/v1/behavioral/build-profiles',
    zValidator('json', BuildProfileSchema),
    async (ctx) => {
      const user = getAuthUser(ctx)
      const { userId, windowDays, force } = ctx.req.valid('json')

      if (userId) {
        // Single user
        if (force) await store.invalidate(user.tenantId, userId)
        await queue.add(`profile-${userId}`, {
          tenantId: user.tenantId, userId, userEmail: userId, windowDays,
        }, { priority: 1 })
        return ctx.json({ success: true, data: { queued: 1, userId } })
      } else {
        // All users
        const users = await builder.getActiveUsers(user.tenantId, windowDays)
        for (const u of users) {
          await queue.add(`profile-${u.userId}`, {
            tenantId: user.tenantId, userId: u.userId, userEmail: u.email, windowDays,
          })
        }
        return ctx.json({ success: true, data: { queued: users.length } })
      }
    })

  // ── GET /v1/behavioral/profile/:userId ────────

  app.get('/v1/behavioral/profile/:userId', async (ctx) => {
    const user    = getAuthUser(ctx)
    const userId  = ctx.req.param('userId')

    let profile = await store.get(user.tenantId, userId)

    if (!profile) {
      // Build on demand
      const p = await builder.buildUserProfile(user.tenantId, userId, userId)
      await store.set(p)
      profile = p
    }

    // Strip internal details, expose clean summary
    return ctx.json({ success: true, data: {
      userId:      profile.userId,
      userEmail:   profile.userEmail,
      confidence:  profile.confidence,
      isStable:    profile.isStable,
      dataPoints:  profile.dataPoints,
      buildDate:   profile.buildDate,
      windowDays:  profile.windowDays,
      summary: {
        typicalHours:    `${profile.loginTime.typicalStart}:00–${profile.loginTime.typicalEnd}:00 UTC`,
        knownCountries:  profile.locations.knownCountries,
        primaryLocation: `${profile.locations.primaryCity}, ${profile.locations.primaryCountry}`,
        avgFilesPerDay:  profile.fileAccessVolume.mean,
        avgDownloadsPerDay: profile.downloadVolume.mean,
        offHoursRatio:   `${(profile.offHoursRatio * 100).toFixed(0)}%`,
        fileAccessP99:   profile.fileAccessVolume.p99,
        downloadP99:     profile.downloadVolume.p99,
      },
    }})
  })

  // ── POST /v1/behavioral/check ─────────────────
  // Real-time deviation check

  app.post('/v1/behavioral/check',
    zValidator('json', DeviationCheckSchema),
    async (ctx) => {
      const user = getAuthUser(ctx)
      const req  = ctx.req.valid('json')

      // Override tenantId with auth context
      req.tenantId = user.tenantId

      let profile = await store.get(user.tenantId, req.userId)
      if (!profile) {
        return ctx.json({ success: true, data: {
          userId:      req.userId,
          anomalies:   [],
          maxScore:    0,
          shouldAlert: false,
          summary:     'No behavioral baseline available yet',
        }})
      }

      const result = scorer.scoreDeviation(req as any, profile)
      return ctx.json({ success: true, data: result })
    })

  // ── GET /v1/behavioral/anomalies ──────────────
  // Recent behavioral anomalies for tenant

  app.get('/v1/behavioral/anomalies', async (ctx) => {
    const user  = getAuthUser(ctx)
    const limit = parseInt(ctx.req.query('limit') ?? '50', 10)

    // Anomalies stored in Redis sorted set
    const key    = `zf:behavioral:anomalies:${user.tenantId}`
    const raw    = await redis.lrange(key, 0, limit - 1)
    const items  = raw.map(r => JSON.parse(r)).filter(Boolean)

    return ctx.json({ success: true, data: items })
  })

  // ── GET /v1/behavioral/stats ──────────────────

  app.get('/v1/behavioral/stats', async (ctx) => {
    const user = getAuthUser(ctx)
    const keys = await store.getAll(user.tenantId)

    let stableProfiles = 0
    let totalConfidence = 0

    for (const key of keys.slice(0, 100)) {
      const raw = await redis.get(key)
      if (!raw) continue
      const p = JSON.parse(raw) as UserBehaviorProfile
      if (p.isStable) stableProfiles++
      totalConfidence += p.confidence
    }

    return ctx.json({ success: true, data: {
      totalProfiles:   keys.length,
      stableProfiles,
      avgConfidence:   keys.length > 0 ? Math.round(totalConfidence / keys.length) : 0,
      coveragePct:     keys.length > 0 ? Math.round((stableProfiles / keys.length) * 100) : 0,
    }})
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'behavioral-ai', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3020', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🧠 ZonForge Behavioral AI on port ${info.port}`)
    log.info(`   Profile cache TTL: ${PROFILE_TTL / 3600}h`)
    log.info(`   Real-time event scoring via Redis pub/sub`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down behavioral AI...')
    await worker.close()
    await queue.close()
    await subscriber.unsubscribe(); await subscriber.quit()
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Behavioral AI failed to start')
  process.exit(1)
})
