/**
 * ZonForge — Hono HTTP Middleware
 * Exported from @zonforge/auth-utils so services don't
 * cross-import from ../auth-service/
 *
 * Usage in any service:
 *   import { authMiddleware, requestIdMiddleware } from '@zonforge/auth-utils/middleware'
 */

import type { Context, Next } from 'hono'
import { jwtConfig as envJwtConfig } from '@zonforge/config'
import { verifyAccessToken, JwtVerificationError } from './jwt.js'
import { hasPermission } from './rbac.js'
import type { UserRole } from '@zonforge/shared-types'

// ─────────────────────────────────────────────
// Hono ContextVariableMap augmentation
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

// ── Request ID middleware ──────────────────────────────────

export async function requestIdMiddleware(ctx: Context, next: Next) {
  const { v4: uuidv4 } = await import('uuid')
  const id = uuidv4()
  ctx.set('requestId', id)
  ctx.header('X-Request-Id', id)
  await next()
}

// ── JWT auth middleware ────────────────────────────────────
// Reads JWT from Authorization: Bearer <token>
// Verifies signature and expiry using @zonforge/auth-utils
// Sets ctx.var.user for downstream handlers
// Optionally checks Redis blocklist (JTI revocation)

export function createAuthMiddleware(options?: {
  jwtSecret:       string
  redisBlocklistFn?: (jti: string) => Promise<boolean>
}) {
  return async function authMiddleware(ctx: Context, next: Next) {
    const authHeader = ctx.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return ctx.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Bearer token required' },
      }, 401)
    }

    const token = authHeader.slice(7)

    try {
      const jwtCfg = {
        ...envJwtConfig,
        secret: options?.jwtSecret
          ?? process.env['ZONFORGE_JWT_SECRET']
          ?? envJwtConfig.secret,
      }
      const payload = await verifyAccessToken(token, jwtCfg)

      // Optional: check JTI blocklist
      if (options?.redisBlocklistFn) {
        const blocked = await options.redisBlocklistFn(payload.jti)
        if (blocked) {
          return ctx.json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Token has been revoked' },
          }, 401)
        }
      }

      ctx.set('user', {
        id:       payload.sub,
        tenantId: payload.tid,
        role:     payload.role as UserRole,
        email:    payload.email,
        region:   payload.region ?? 'us-east-1',
        jti:      payload.jti,
      })

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
}

// Default pre-wired version using env var
export const authMiddleware = createAuthMiddleware()

// ── Permission guard ───────────────────────────────────────

export function requirePermission(permission: string) {
  return async (ctx: Context, next: Next) => {
    const user = ctx.var.user
    if (!user) {
      return ctx.json({ success: false, error: { code: 'UNAUTHORIZED' } }, 401)
    }
    if (!hasPermission(user.role, permission)) {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN', message: `Permission denied: ${permission}` } }, 403)
    }
    await next()
    return
  }
}

// ── Tenant isolation guard ─────────────────────────────────

export async function tenantGuard(ctx: Context, next: Next) {
  const user = ctx.var.user
  if (!user) return ctx.json({ success: false, error: { code: 'UNAUTHORIZED' } }, 401)
  if (user.role === 'PLATFORM_ADMIN') {
    await next()
    return
  }

  const paramTenantId = ctx.req.param('tenantId')
  if (paramTenantId && paramTenantId !== user.tenantId) {
    return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
  }
  await next()
  return
}

// ── Rate limit middleware ──────────────────────────────────

export function rateLimitMiddleware(
  maxRequests:   number,
  windowSeconds: number,
  keyFn:         (ctx: Context) => string,
) {
  return async (ctx: Context, next: Next) => {
    // Placeholder: rate limiting can be wired to Redis in a follow-up; do not block requests.
    void maxRequests
    void windowSeconds
    void keyFn
    await next()
    return
  }
}
