import type { Context, Next } from 'hono'
import { verifyAccessToken, JwtVerificationError } from '@zonforge/auth-utils'
import { jwtConfig } from '@zonforge/config'
import { RedisKeys } from '@zonforge/db-client'
import { hasPermission, UnauthorizedError, ForbiddenError } from '@zonforge/auth-utils'
import type { UserRole } from '@zonforge/shared-types'
import { getRedis } from '../redis.js'

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// Extracts and validates JWT from Authorization header
// Sets ctx.var.user for use in route handlers
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
    requestId: string
  }
}

// ── Request ID middleware ─────────────────────

export async function requestIdMiddleware(ctx: Context, next: Next) {
  const { v4: uuidv4 } = await import('uuid')
  ctx.set('requestId', uuidv4())
  ctx.header('X-Request-Id', ctx.var.requestId)
  return next()
}

// ── JWT auth middleware ───────────────────────

export async function authMiddleware(ctx: Context, next: Next) {
  const authHeader = ctx.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return ctx.json({ success: false,
      error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const payload = await verifyAccessToken(token, jwtConfig)

    // Check JTI blocklist (logout / token revocation)
    const redis = getRedis()
    const blocked = await redis.get(RedisKeys.jwtBlocklist(payload.jti))
    if (blocked) {
      return ctx.json({ success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token has been revoked' } }, 401)
    }

    ctx.set('user', {
      id:       payload.sub,
      tenantId: payload.tid,
      role:     payload.role,
      email:    payload.email,
      region:   payload.region,
      jti:      payload.jti,
    })

    return next()
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return ctx.json({ success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }, 401)
    }
    throw err
  }
}

// ── Permission guard factory ──────────────────

export function requirePermission(permission: string) {
  return async (ctx: Context, next: Next) => {
    const user = ctx.var.user
    if (!user) {
      return ctx.json({ success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401)
    }
    if (!hasPermission(user.role, permission)) {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN',
                 message: `Role ${user.role} lacks permission: ${permission}` } }, 403)
    }
    return next()
  }
}

// ── Tenant isolation guard ────────────────────
// Ensures the requested tenantId param matches the authenticated user's tenant
// (unless PLATFORM_ADMIN)

export async function tenantGuard(ctx: Context, next: Next) {
  const user = ctx.var.user
  if (!user) {
    return ctx.json({ success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401)
  }

  if (user.role === 'PLATFORM_ADMIN') {
    await next()
    return
  }

  const paramTenantId = ctx.req.param('tenantId')
  if (paramTenantId && paramTenantId !== user.tenantId) {
    return ctx.json({ success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied to this tenant' } }, 403)
  }

  return next()
}

// ── Rate limit middleware ─────────────────────

export function rateLimitMiddleware(
  maxRequests: number,
  windowSeconds: number,
  keyFn: (ctx: Context) => string,
) {
  return async (ctx: Context, next: Next) => {
    const redis = getRedis()
    const key   = `zf:ratelimit:${keyFn(ctx)}:${Math.floor(Date.now() / (windowSeconds * 1000))}`

    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSeconds)

    ctx.header('X-RateLimit-Limit',     String(maxRequests))
    ctx.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)))

    if (count > maxRequests) {
      return ctx.json({ success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } }, 429)
    }

    return next()
  }
}
