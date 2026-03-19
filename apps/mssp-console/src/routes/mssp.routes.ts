import { Hono }       from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z }          from 'zod'
import { MsspConsoleService } from '../services/mssp.service.js'
import { createLogger } from '@zonforge/logger'
import type { Context } from 'hono'

const log = createLogger({ service: 'mssp-console:routes' })

// ─────────────────────────────────────────────
// MSSP CONSOLE ROUTES
//
// All routes require PLATFORM_ADMIN role.
// Tenant-level staff cannot access these.
// ─────────────────────────────────────────────

const BulkSuspendSchema = z.object({
  tenantIds: z.array(z.string().uuid()).min(1).max(100),
  reason:    z.string().min(5).max(500),
})

const WhiteLabelSchema = z.object({
  brandName:         z.string().max(100).optional(),
  brandLogoUrl:      z.string().url().optional(),
  brandPrimaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  customDomain:      z.string().max(255).optional(),
  supportEmail:      z.string().email().optional(),
})

export function createMsspRouter(service: MsspConsoleService) {
  const router = new Hono()

  // Guard: all MSSP routes require PLATFORM_ADMIN
  router.use('/v1/mssp/*', async (ctx, next) => {
    const user = ctx.var.user
    if (user?.role !== 'PLATFORM_ADMIN') {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN', message: 'PLATFORM_ADMIN access required' } }, 403)
    }
    await next()
  })

  // ── GET /v1/mssp/overview ─────────────────────
  // Full cross-tenant dashboard data

  router.get('/v1/mssp/overview', async (ctx) => {
    const overview = await service.getOverview()
    return ctx.json({ success: true, data: overview, meta: meta(ctx) })
  })

  // ── GET /v1/mssp/tenants ──────────────────────
  // Paginated tenant list with health summary

  router.get('/v1/mssp/tenants', async (ctx) => {
    const { getDb, schema, eq, desc, gte } = await import('@zonforge/db-client')
    const db     = getDb()
    const limit  = Math.min(parseInt(ctx.req.query('limit') ?? '50', 10), 200)
    const search = ctx.req.query('search')
    const status = ctx.req.query('status')
    const plan   = ctx.req.query('plan')

    const conditions: any[] = []
    if (status) conditions.push(eq(schema.tenants.status, status))
    if (plan)   conditions.push(eq(schema.tenants.planTier, plan))

    const tenants = await db.select({
      id:        schema.tenants.id,
      name:      schema.tenants.name,
      slug:      schema.tenants.slug,
      planTier:  schema.tenants.planTier,
      status:    schema.tenants.status,
      region:    schema.tenants.region,
      createdAt: schema.tenants.createdAt,
    })
      .from(schema.tenants)
      .orderBy(desc(schema.tenants.createdAt))
      .limit(limit)

    // Filter by search term
    const filtered = search
      ? tenants.filter(t =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.slug.toLowerCase().includes(search.toLowerCase()))
      : tenants

    return ctx.json({ success: true, data: filtered, meta: meta(ctx) })
  })

  // ── GET /v1/mssp/tenants/:id ──────────────────
  // Detailed tenant summary

  router.get('/v1/mssp/tenants/:id', async (ctx) => {
    const summary = await service.getTenantSummary(ctx.req.param('id'))
    if (!summary) {
      return ctx.json({ success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant not found' } }, 404)
    }
    return ctx.json({ success: true, data: summary, meta: meta(ctx) })
  })

  // ── POST /v1/mssp/tenants/:id/impersonate ──────
  // Generate short-lived admin token for tenant

  router.post('/v1/mssp/tenants/:id/impersonate', async (ctx) => {
    const tenantId = ctx.req.param('id')
    const adminId  = ctx.var.user.id

    const { signAccessToken, jwtConfig } = await import('@zonforge/auth-utils')
    const { getDb: db, schema: s, eq: dbEq } = await import('@zonforge/db-client')

    // Verify tenant exists
    const tenants = await db().select({ id: s.tenants.id })
      .from(s.tenants)
      .where(dbEq(s.tenants.id, tenantId))
      .limit(1)

    if (!tenants[0]) {
      return ctx.json({ success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant not found' } }, 404)
    }

    // Issue short-lived impersonation token (15 minutes only)
    const token = await signAccessToken({
      userId:         adminId,
      tenantId,
      role:           'TENANT_ADMIN',
      email:          ctx.var.user.email,
      jti:            `impersonate-${Date.now()}`,
      isImpersonation: true,
      originalAdminId: adminId,
    }, { ...jwtConfig, expiresIn: '15m' })

    log.warn({ adminId, tenantId }, '⚠️  MSSP admin impersonating tenant')

    return ctx.json({ success: true, data: {
      token,
      expiresIn: 900,  // 15 minutes
      tenantId,
      warning: 'This token grants TENANT_ADMIN access. All actions are audited.',
    }, meta: meta(ctx) })
  })

  // ── POST /v1/mssp/tenants/bulk-suspend ────────

  router.post(
    '/v1/mssp/tenants/bulk-suspend',
    zValidator('json', BulkSuspendSchema),
    async (ctx) => {
      const { tenantIds, reason } = ctx.req.valid('json')
      const actorId = ctx.var.user.id

      const result = await service.bulkSuspend(tenantIds, reason, actorId)
      return ctx.json({ success: true, data: result, meta: meta(ctx) })
    }
  )

  // ── PATCH /v1/mssp/tenants/:id/white-label ────

  router.patch(
    '/v1/mssp/tenants/:id/white-label',
    zValidator('json', WhiteLabelSchema),
    async (ctx) => {
      const tenantId = ctx.req.param('id')
      const config   = ctx.req.valid('json')

      await service.updateWhiteLabel(tenantId, config)
      return ctx.json({ success: true, data: { updated: true }, meta: meta(ctx) })
    }
  )

  // ── GET /v1/mssp/revenue ──────────────────────

  router.get('/v1/mssp/revenue', async (ctx) => {
    const days   = parseInt(ctx.req.query('days') ?? '30', 10)
    const report = await service.getRevenueReport(days)
    return ctx.json({ success: true, data: report, meta: meta(ctx) })
  })

  // ── GET /v1/mssp/alerts ───────────────────────
  // Cross-tenant alert feed (P1/P2 only)

  router.get('/v1/mssp/alerts', async (ctx) => {
    const { getDb, schema, and, eq, gte, desc, inArray } = await import('@zonforge/db-client')
    const db    = getDb()
    const limit = Math.min(parseInt(ctx.req.query('limit') ?? '50', 10), 200)

    const alerts = await db.select({
      id:        schema.alerts.id,
      tenantId:  schema.alerts.tenantId,
      title:     schema.alerts.title,
      severity:  schema.alerts.severity,
      priority:  schema.alerts.priority,
      status:    schema.alerts.status,
      createdAt: schema.alerts.createdAt,
      mttdSlaBreached: schema.alerts.mttdSlaBreached,
    })
      .from(schema.alerts)
      .where(and(
        inArray(schema.alerts.priority, ['P1', 'P2']),
        eq(schema.alerts.status, 'open'),
      ))
      .orderBy(desc(schema.alerts.createdAt))
      .limit(limit)

    // Enrich with tenant names
    const tenantIds  = [...new Set(alerts.map(a => a.tenantId))]
    const tenantRows = tenantIds.length > 0
      ? await db.select({ id: schema.tenants.id, name: schema.tenants.name })
          .from(schema.tenants)
          .where(inArray(schema.tenants.id, tenantIds))
      : []

    const tenantMap = new Map(tenantRows.map(t => [t.id, t.name]))
    const enriched  = alerts.map(a => ({
      ...a,
      tenantName: tenantMap.get(a.tenantId) ?? 'Unknown',
    }))

    return ctx.json({ success: true, data: enriched, meta: meta(ctx) })
  })

  // ── GET /v1/mssp/health ───────────────────────

  router.get('/v1/mssp/health', (ctx) => ctx.json({
    status: 'ok', service: 'mssp-console', timestamp: new Date(),
  }))

  return router
}

function meta(ctx: Context) {
  return { requestId: ctx.var.requestId ?? 'unknown', timestamp: new Date() }
}
