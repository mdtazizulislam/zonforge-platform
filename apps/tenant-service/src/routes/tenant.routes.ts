import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  createTenant, getTenant, updateTenantSettings,
  suspendTenant, listTenants, getUsageSummary,
  checkPlanLimit, TenantError,
} from '../services/tenant.service.js'
import { getRedis } from '../redis.js'
import { TenantSettingsSchema } from '@zonforge/shared-types'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'tenant-service:routes' })

export const tenantRouter = new Hono()

// Auth middleware is applied in index.ts before routing

// ─────────────────────────────────────────────
// POST /v1/admin/tenants  (PLATFORM_ADMIN)
// ─────────────────────────────────────────────

const CreateTenantBody = z.object({
  name:     z.string().min(1).max(255),
  slug:     z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  planTier: z.enum(['starter', 'growth', 'business', 'enterprise', 'mssp']).default('starter'),
  region:   z.enum(['us-east-1', 'eu-west-1', 'ap-southeast-1']).default('us-east-1'),
  settings: TenantSettingsSchema.partial().optional(),
})

tenantRouter.post('/admin/tenants', zValidator('json', CreateTenantBody), async (ctx) => {
  const user = ctx.var.user
  if (user.role !== 'PLATFORM_ADMIN') {
    return ctx.json({ success: false,
      error: { code: 'FORBIDDEN', message: 'Platform admin access required' } }, 403)
  }

  const body = ctx.req.valid('json')
  try {
    const payload = {
      name: body.name,
      slug: body.slug,
      planTier: body.planTier,
      region: body.region,
      createdBy: user.id,
      ...(body.settings !== undefined ? { settings: body.settings } : {}),
    }
    const result = await createTenant({
      ...payload,
    })
    return ctx.json({ success: true, data: result, meta: meta(ctx) }, 201)
  } catch (err) {
    return handleError(ctx, err)
  }
})

// ─────────────────────────────────────────────
// GET /v1/tenants/:tenantId
// ─────────────────────────────────────────────

tenantRouter.get('/tenants/:tenantId', async (ctx) => {
  const user     = ctx.var.user
  const tenantId = ctx.req.param('tenantId')
  const redis    = getRedis()

  // Only allow access to own tenant (unless PLATFORM_ADMIN)
  if (user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
    return ctx.json({ success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
  }

  try {
    const tenant = await getTenant(tenantId, redis)
    return ctx.json({ success: true, data: sanitizeTenant(tenant), meta: meta(ctx) })
  } catch (err) {
    return handleError(ctx, err)
  }
})

// ─────────────────────────────────────────────
// PATCH /v1/tenants/:tenantId/settings
// ─────────────────────────────────────────────

tenantRouter.patch(
  '/tenants/:tenantId/settings',
  zValidator('json', TenantSettingsSchema.partial()),
  async (ctx) => {
    const user     = ctx.var.user
    const tenantId = ctx.req.param('tenantId')
    const redis    = getRedis()
    const ip       = ctx.req.header('CF-Connecting-IP') ?? 'unknown'

    if (user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
    }
    if (!['PLATFORM_ADMIN', 'TENANT_ADMIN'].includes(user.role)) {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN', message: 'Tenant admin access required' } }, 403)
    }

    const updates = ctx.req.valid('json')
    try {
      const normalizedUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined),
      ) as Partial<typeof TenantSettingsSchema._type>

      const settings = await updateTenantSettings(tenantId, normalizedUpdates, user.id, ip, redis)
      return ctx.json({ success: true, data: { settings }, meta: meta(ctx) })
    } catch (err) {
      return handleError(ctx, err)
    }
  }
)

// ─────────────────────────────────────────────
// POST /v1/admin/tenants/:tenantId/suspend
// ─────────────────────────────────────────────

tenantRouter.post('/admin/tenants/:tenantId/suspend', async (ctx) => {
  const user = ctx.var.user
  if (user.role !== 'PLATFORM_ADMIN') {
    return ctx.json({ success: false,
      error: { code: 'FORBIDDEN', message: 'Platform admin access required' } }, 403)
  }

  const tenantId = ctx.req.param('tenantId')
  const body     = await ctx.req.json().catch(() => ({})) as { reason?: string }
  const redis    = getRedis()

  await suspendTenant(tenantId, body.reason ?? 'No reason provided', user.id, redis)
  return ctx.json({ success: true, data: { suspended: true }, meta: meta(ctx) })
})

// ─────────────────────────────────────────────
// GET /v1/tenants/:tenantId/usage
// ─────────────────────────────────────────────

tenantRouter.get('/tenants/:tenantId/usage', async (ctx) => {
  const user     = ctx.var.user
  const tenantId = ctx.req.param('tenantId')
  const redis    = getRedis()

  if (user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
    return ctx.json({ success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403)
  }

  const summary = await getUsageSummary(tenantId, redis)
  return ctx.json({ success: true, data: summary, meta: meta(ctx) })
})

// ─────────────────────────────────────────────
// GET /v1/admin/tenants  (PLATFORM_ADMIN)
// ─────────────────────────────────────────────

tenantRouter.get('/admin/tenants', async (ctx) => {
  const user = ctx.var.user
  if (user.role !== 'PLATFORM_ADMIN') {
    return ctx.json({ success: false,
      error: { code: 'FORBIDDEN', message: 'Platform admin access required' } }, 403)
  }

  const limit  = parseInt(ctx.req.query('limit') ?? '50', 10)
  const cursor = ctx.req.query('cursor')

  const result = await listTenants(limit, cursor)
  return ctx.json({ success: true, data: result, meta: meta(ctx) })
})

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function sanitizeTenant(tenant: Record<string, unknown>) {
  const { kmsKeyArn, stripeCustomerId, ...safe } = tenant
  return safe
}

function meta(ctx: Context) {
  return { requestId: ctx.var.requestId ?? 'unknown', timestamp: new Date() }
}

function handleError(ctx: Context, err: unknown) {
  if (err instanceof TenantError) {
    const status = err.code === 'NOT_FOUND' ? 404
      : err.code === 'SLUG_TAKEN' ? 409
      : 400
    return ctx.json({ success: false,
      error: { code: err.code, message: err.message } }, status)
  }
  log.error({ err }, 'Unhandled tenant error')
  return ctx.json({ success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
}

import type { Context } from 'hono'
