import type { Context, Next } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { eq, and } from 'drizzle-orm'
import { Redis } from 'ioredis'
import { verifyAccessToken, JwtVerificationError, hasPermission } from '@zonforge/auth-utils'
import { jwtConfig } from '@zonforge/config'
import { getDb, schema, RedisKeys, RedisTTL } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import { PLAN_LIMITS, type UserRole, type PlanTier } from '@zonforge/shared-types'

const log = createLogger({ service: 'api-gateway:middleware' })

// ─────────────────────────────────────────────
// Context type extensions
// ─────────────────────────────────────────────

declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id:       string
      tenantId: string
      role:     UserRole
      email:    string
      region:   string
      jti:      string
    }
    requestId:  string
    tenantPlan: PlanTier
  }
}

// ─────────────────────────────────────────────
// REQUEST ID
// ─────────────────────────────────────────────

export async function requestIdMiddleware(ctx: Context, next: Next) {
  const existing = ctx.req.header('X-Request-Id') ?? uuidv4()
  ctx.set('requestId', existing)
  ctx.header('X-Request-Id', existing)
  await next()
}

// ─────────────────────────────────────────────
// JWT AUTH MIDDLEWARE
// ─────────────────────────────────────────────

let _redis: Redis | null = null
export function setMiddlewareRedis(r: Redis) { _redis = r }
function getRedis(): Redis {
  if (!_redis) throw new Error('Redis not set in middleware')
  return _redis
}

export async function authMiddleware(ctx: Context, next: Next): Promise<void | Response> {
  const authHeader = ctx.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return ctx.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Bearer token required' },
    }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = await verifyAccessToken(token, jwtConfig)

    // Check JTI blocklist
    const redis    = getRedis()
    const blocked  = await redis.get(RedisKeys.jwtBlocklist(payload.jti))
    if (blocked) {
      return ctx.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token has been revoked' },
      }, 401)
    }

    ctx.set('user', {
      id:       payload.sub,
      tenantId: payload.tid,
      role:     payload.role,
      email:    payload.email,
      region:   payload.region,
      jti:      payload.jti,
    })

    // Cache tenant plan for downstream use
    const planKey  = RedisKeys.tenantPlan(payload.tid)
    const planTier = await redis.get(planKey) as PlanTier | null
    if (planTier) {
      ctx.set('tenantPlan', planTier)
    } else {
      const db      = getDb()
      const tenants = await db.select({ planTier: schema.tenants.planTier })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, payload.tid))
        .limit(1)
      const tier = (tenants[0]?.planTier ?? 'starter') as PlanTier
      ctx.set('tenantPlan', tier)
      await redis.setex(planKey, RedisTTL.TENANT_PLAN, tier)
    }

    await next()
    return
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return ctx.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      }, 401)
    }
    throw err
  }
}

// ─────────────────────────────────────────────
// PERMISSION GUARD
// ─────────────────────────────────────────────

export function requirePermission(permission: string) {
  return async (ctx: Context, next: Next): Promise<void | Response> => {
    const user = ctx.var.user
    if (!user) {
      return ctx.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401)
    }
    if (!hasPermission(user.role, permission)) {
      return ctx.json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Insufficient permissions: ${permission}` },
      }, 403)
    }
    await next()
    return
  }
}

// ─────────────────────────────────────────────
// TENANT ISOLATION GUARD
// Enforces that URL :tenantId matches JWT tenant
// ─────────────────────────────────────────────

export async function tenantIsolationGuard(ctx: Context, next: Next): Promise<void | Response> {
  const user          = ctx.var.user
  const paramTenantId = ctx.req.param('tenantId')

  if (user?.role === 'PLATFORM_ADMIN') {
    await next()
    return
  }

  if (paramTenantId && paramTenantId !== user?.tenantId) {
    return ctx.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied to this tenant' },
    }, 403)
  }

  await next()
  return
}

// ─────────────────────────────────────────────
// RATE LIMITER
// Per-tenant sliding window using Redis
// ─────────────────────────────────────────────

export function rateLimitMiddleware(
  maxPerMinute: number,
  keyFn: (ctx: Context) => string = (ctx) => ctx.var.user?.tenantId ?? ctx.req.header('CF-Connecting-IP') ?? 'unknown',
) {
  return async (ctx: Context, next: Next): Promise<void | Response> => {
    const redis    = getRedis()
    const windowMs = 60_000
    const key      = `zf:ratelimit:${keyFn(ctx)}:${Math.floor(Date.now() / windowMs)}`

    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 60)

    ctx.header('X-RateLimit-Limit',     String(maxPerMinute))
    ctx.header('X-RateLimit-Remaining', String(Math.max(0, maxPerMinute - count)))
    ctx.header('X-RateLimit-Reset',     String(Math.ceil(Date.now() / windowMs) * 60))

    if (count > maxPerMinute) {
      return ctx.json({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: `Rate limit: ${maxPerMinute} req/min` },
      }, 429)
    }

    await next()
    return
  }
}

// Per-plan rate limit factory
export function planRateLimitMiddleware() {
  return async (ctx: Context, next: Next): Promise<void | Response> => {
    const planTier = ctx.var.tenantPlan ?? 'starter'
    const limits   = PLAN_LIMITS[planTier]
    const rpm      = Math.floor(limits.maxEventsPerMinute / 10)   // query API limit

    const redis    = getRedis()
    const tenantId = ctx.var.user?.tenantId ?? 'unknown'
    const key      = `zf:ratelimit:api:${tenantId}:${Math.floor(Date.now() / 60_000)}`

    const count    = await redis.incr(key)
    if (count === 1) await redis.expire(key, 60)

    ctx.header('X-RateLimit-Limit',     String(rpm))
    ctx.header('X-RateLimit-Remaining', String(Math.max(0, rpm - count)))

    if (count > rpm) {
      return ctx.json({
        success: false,
        error: {
          code:    'RATE_LIMIT_EXCEEDED',
          message: `API rate limit (${rpm} req/min) exceeded for ${planTier} plan`,
        },
      }, 429)
    }

    await next()
    return
  }
}

// ─────────────────────────────────────────────
// FEATURE FLAG GUARD
// ─────────────────────────────────────────────

export function requireFeature(
  feature: keyof typeof PLAN_LIMITS['starter'],
) {
  return async (ctx: Context, next: Next): Promise<void | Response> => {
    const plan    = ctx.var.tenantPlan ?? 'starter'
    const allowed = PLAN_LIMITS[plan][feature]
    if (!allowed) {
      return ctx.json({
        success: false,
        error: {
          code:    'PLAN_LIMIT_EXCEEDED',
          message: `Feature "${String(feature)}" is not available on the ${plan} plan. Please upgrade.`,
        },
      }, 402)
    }
    await next()
    return
  }
}

// ─────────────────────────────────────────────
// PAGINATION HELPER
// ─────────────────────────────────────────────

export interface PaginationParams {
  limit:  number
  cursor: string | null
}

export function parsePagination(ctx: Context, defaultLimit = 50): PaginationParams {
  const limit  = Math.min(
    parseInt(ctx.req.query('limit') ?? String(defaultLimit), 10),
    200,
  )
  const cursor = ctx.req.query('cursor') ?? null
  return { limit, cursor }
}

export function buildPaginatedResponse<T>(
  items:    T[],
  limit:    number,
  getCursor: (item: T) => string,
): {
  items:      T[]
  nextCursor: string | null
  hasMore:    boolean
  totalCount: number
} {
  const hasMore    = items.length > limit
  const sliced     = hasMore ? items.slice(0, limit) : items
  const nextCursor = hasMore && sliced.length > 0
    ? getCursor(sliced[sliced.length - 1]!)
    : null

  return { items: sliced, nextCursor, hasMore, totalCount: sliced.length }
}

// ─────────────────────────────────────────────
// RESPONSE HELPERS
// ─────────────────────────────────────────────

export function successResponse(ctx: Context, data: unknown, status: 200 | 201 = 200) {
  return ctx.json({
    success: true,
    data,
    meta: {
      requestId: ctx.var.requestId,
      timestamp: new Date().toISOString(),
    },
  }, status)
}

export function errorResponse(
  ctx:     Context,
  code:    string,
  message: string,
  status:  400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 = 400,
) {
  return ctx.json({
    success: false,
    error: { code, message },
    meta: {
      requestId: ctx.var.requestId,
      timestamp: new Date().toISOString(),
    },
  }, status)
}
