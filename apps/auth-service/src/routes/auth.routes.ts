import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  login, refreshTokens, logout,
  registerUser, setupMfa, confirmMfa,
  createApiKey, AuthError,
} from '../services/auth.service.js'
import {
  LoginBodySchema, RefreshBodySchema, RegisterBodySchema,
  ConfirmMfaBodySchema, CreateApiKeyBodySchema, ChangePasswordBodySchema,
} from '../validators/auth.validators.js'
import {
  authMiddleware, requirePermission, rateLimitMiddleware,
} from '../middleware/auth.middleware.js'
import { createLogger } from '@zonforge/logger'
import type { Context } from 'hono'
import type { UserRole } from '@zonforge/shared-types'

const log = createLogger({ service: 'auth-service:routes' })

export const authRouter = new Hono()

// ─────────────────────────────────────────────
// POST /v1/auth/login
// ─────────────────────────────────────────────

authRouter.post(
  '/login',
  rateLimitMiddleware(10, 60, ctx => ctx.req.header('CF-Connecting-IP') ?? ctx.req.header('X-Forwarded-For') ?? 'unknown'),
  zValidator('json', LoginBodySchema),
  async (ctx) => {
    const body      = ctx.req.valid('json')
    const ip        = ctx.req.header('CF-Connecting-IP') ?? ctx.req.header('X-Forwarded-For') ?? 'unknown'
    const userAgent = ctx.req.header('User-Agent') ?? 'unknown'

    try {
      const loginInput = {
        email: body.email,
        password: body.password,
        ip,
        userAgent,
        ...(body.totpCode ? { totpCode: body.totpCode } : {}),
      }
      const result = await login(loginInput)

      if (result.requiresMfa) {
        return ctx.json({ success: true, data: { requiresMfa: true,
          userId: result.user.id }, meta: meta(ctx) }, 200)
      }

      return ctx.json({ success: true, data: {
        accessToken:      result.accessToken,
        refreshToken:     result.refreshToken,
        accessExpiresAt:  result.accessExpiresAt,
        refreshExpiresAt: result.refreshExpiresAt,
        user:             result.user,
      }, meta: meta(ctx) }, 200)
    } catch (err) {
      return handleAuthError(ctx, err)
    }
  }
)

// ─────────────────────────────────────────────
// POST /v1/auth/refresh
// ─────────────────────────────────────────────

authRouter.post(
  '/refresh',
  rateLimitMiddleware(20, 60, ctx => ctx.req.header('CF-Connecting-IP') ?? 'unknown'),
  zValidator('json', RefreshBodySchema),
  async (ctx) => {
    const { refreshToken } = ctx.req.valid('json')
    const ip = ctx.req.header('CF-Connecting-IP') ?? 'unknown'

    try {
      const result = await refreshTokens(refreshToken, ip)
      return ctx.json({ success: true, data: result, meta: meta(ctx) }, 200)
    } catch (err) {
      return handleAuthError(ctx, err)
    }
  }
)

// ─────────────────────────────────────────────
// POST /v1/auth/logout
// ─────────────────────────────────────────────

authRouter.post('/logout', authMiddleware, async (ctx) => {
  const user = ctx.var.user
  const ip   = ctx.req.header('CF-Connecting-IP') ?? 'unknown'
  await logout(user.id, user.jti, ip)
  return ctx.json({ success: true, data: { message: 'Logged out' }, meta: meta(ctx) }, 200)
})

// ─────────────────────────────────────────────
// GET /v1/auth/me
// ─────────────────────────────────────────────

authRouter.get('/me', authMiddleware, async (ctx) => {
  const user = ctx.var.user
  return ctx.json({ success: true, data: {
    id:       user.id,
    email:    user.email,
    role:     user.role,
    tenantId: user.tenantId,
    region:   user.region,
  }, meta: meta(ctx) }, 200)
})

// ─────────────────────────────────────────────
// POST /v1/auth/users  (TENANT_ADMIN only)
// ─────────────────────────────────────────────

authRouter.post(
  '/users',
  authMiddleware,
  requirePermission('users:*'),
  zValidator('json', RegisterBodySchema),
  async (ctx) => {
    const body = ctx.req.valid('json')
    const user = ctx.var.user
    const ip   = ctx.req.header('CF-Connecting-IP') ?? 'unknown'

    try {
      const result = await registerUser({
        tenantId:  user.tenantId,
        email:     body.email,
        name:      body.name,
        password:  body.password,
        role:      body.role as UserRole,
        createdBy: user.id,
        ip,
      })
      return ctx.json({ success: true, data: result, meta: meta(ctx) }, 201)
    } catch (err) {
      return handleAuthError(ctx, err)
    }
  }
)

// ─────────────────────────────────────────────
// POST /v1/auth/mfa/setup
// ─────────────────────────────────────────────

authRouter.post('/mfa/setup', authMiddleware, async (ctx) => {
  const user = ctx.var.user
  const result = await setupMfa(user.id, user.tenantId)
  return ctx.json({ success: true, data: result, meta: meta(ctx) }, 200)
})

// ─────────────────────────────────────────────
// POST /v1/auth/mfa/confirm
// ─────────────────────────────────────────────

authRouter.post(
  '/mfa/confirm',
  authMiddleware,
  zValidator('json', ConfirmMfaBodySchema),
  async (ctx) => {
    const { totpCode } = ctx.req.valid('json')
    const user = ctx.var.user
    const ip   = ctx.req.header('CF-Connecting-IP') ?? 'unknown'

    try {
      await confirmMfa(user.id, totpCode, ip)
      return ctx.json({ success: true, data: { mfaEnabled: true }, meta: meta(ctx) }, 200)
    } catch (err) {
      return handleAuthError(ctx, err)
    }
  }
)

// ─────────────────────────────────────────────
// POST /v1/auth/api-keys
// ─────────────────────────────────────────────

authRouter.post(
  '/api-keys',
  authMiddleware,
  requirePermission('tenant:update'),
  zValidator('json', CreateApiKeyBodySchema),
  async (ctx) => {
    const body = ctx.req.valid('json')
    const user = ctx.var.user

    const result = await createApiKey(
      user.tenantId,
      body.name,
      body.role as UserRole,
      user.id,
      body.connectorId,
      body.expiresAt ? new Date(body.expiresAt) : undefined,
    )

    return ctx.json({ success: true, data: {
      rawKey:    result.rawKey,   // shown ONCE
      keyPrefix: result.keyPrefix,
      message:   'Save this key now — it will not be shown again',
    }, meta: meta(ctx) }, 201)
  }
)

// ─────────────────────────────────────────────
// GET /v1/auth/health
// ─────────────────────────────────────────────

authRouter.get('/health', (ctx) => {
  return ctx.json({ status: 'ok', service: 'auth-service', timestamp: new Date() })
})

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function meta(ctx: Context) {
  return { requestId: ctx.var.requestId ?? 'unknown', timestamp: new Date() }
}

function handleAuthError(ctx: Context, err: unknown) {
  if (err instanceof AuthError) {
    const status =
      err.code === 'INVALID_CREDENTIALS' ? 401
      : err.code === 'ACCOUNT_SUSPENDED'  ? 403
      : err.code === 'EMAIL_ALREADY_EXISTS' ? 409
      : err.code === 'INVALID_TOKEN' || err.code === 'TOKEN_REUSE_DETECTED' ? 401
      : 400

    return ctx.json({ success: false,
      error: { code: err.code, message: err.message } }, status)
  }
  log.error({ err }, 'Unhandled auth error')
  return ctx.json({ success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
}
