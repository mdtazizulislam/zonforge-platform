import { Hono } from 'hono'
import {
  proxyTo,
  checkAllServices,
  type ServiceName,
} from '../proxy/service-proxy.js'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'api-gateway:proxy-routes' })

// ─────────────────────────────────────────────
// PROXY ROUTES
//
// Pattern: prefix → service → rewrite
//
// All routes here require auth middleware to have
// already run (applied in app root).
// ─────────────────────────────────────────────

export function createProxyRoutes(): Hono {
  const router = new Hono()

  // ─────────────────────────────────────────────
  // AUTH SERVICE — /v1/auth/*
  // ─────────────────────────────────────────────

  router.all('/v1/auth/*', async (ctx) => {
    const path = ctx.req.path
    return proxyTo(ctx, 'auth', path)
  })

  // ─────────────────────────────────────────────
  // TENANT SERVICE — /v1/tenants/* + /v1/admin/tenants/*
  // ─────────────────────────────────────────────

  router.all('/v1/tenants/*', async (ctx) => {
    return proxyTo(ctx, 'tenant', ctx.req.path)
  })

  router.all('/v1/admin/tenants/*', async (ctx) => {
    return proxyTo(ctx, 'tenant', ctx.req.path)
  })

  // ─────────────────────────────────────────────
  // INGESTION SERVICE — /v1/ingest/* + /v1/connectors/*
  // ─────────────────────────────────────────────

  router.all('/v1/ingest/*', async (ctx) => {
    return proxyTo(ctx, 'ingestion', ctx.req.path)
  })

  router.all('/v1/connectors/*', async (ctx) => {
    return proxyTo(ctx, 'ingestion', ctx.req.path)
  })

  router.all('/v1/connectors', async (ctx) => {
    return proxyTo(ctx, 'ingestion', ctx.req.path)
  })

  // ─────────────────────────────────────────────
  // THREAT INTEL — /v1/threat-intel/*
  // ─────────────────────────────────────────────

  router.all('/v1/threat-intel/*', async (ctx) => {
    return proxyTo(ctx, 'threatIntel', ctx.req.path)
  })

  // ─────────────────────────────────────────────
  // DETECTION ENGINE — /v1/detection/*
  // ─────────────────────────────────────────────

  router.get('/v1/detection/rules', async (ctx) => {
    return proxyTo(ctx, 'detection', '/rules')
  })

  router.get('/v1/detection/coverage', async (ctx) => {
    return proxyTo(ctx, 'detection', '/coverage')
  })

  router.all('/v1/detection/*', async (ctx) => {
    return proxyTo(ctx, 'detection', ctx.req.path)
  })

  // ─────────────────────────────────────────────
  // ALERTS — /v1/alerts/*
  // ─────────────────────────────────────────────

  router.all('/v1/alerts/*', async (ctx) => {
    return proxyTo(ctx, 'alert', ctx.req.path)
  })

  router.all('/v1/alerts', async (ctx) => {
    return proxyTo(ctx, 'alert', ctx.req.path)
  })

  // ─────────────────────────────────────────────
  // RISK SCORES — handled inline (local DB reads for low latency)
  // These are defined in risk.routes.ts
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // COMPLIANCE — handled inline in compliance.routes.ts
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // PLAYBOOKS — handled inline in playbook.routes.ts
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // PLATFORM HEALTH — /v1/platform/health
  // Aggregates all downstream service statuses
  // ─────────────────────────────────────────────

  router.get('/v1/platform/health', async (ctx) => {
    const statuses = await checkAllServices()
    const allHealthy = statuses.every(s => s.status === 'healthy')
    const anyDown    = statuses.some(s => s.status === 'down')

    const overall = allHealthy ? 'healthy'
      : anyDown   ? 'degraded'
      : 'degraded'

    return ctx.json({
      success: true,
      data: {
        overall,
        services:  statuses,
        timestamp: new Date(),
      },
    }, allHealthy ? 200 : 207)  // 207 Multi-Status when some are down
  })

  // ─────────────────────────────────────────────
  // ANOMALY BASELINES — /v1/anomaly/*
  // ─────────────────────────────────────────────

  router.post('/v1/anomaly/rebuild-baseline', async (ctx) => {
    const body = await ctx.req.json()
    const user = ctx.var.user
    return proxyTo(ctx, 'anomaly', '/internal/rebuild-baseline')
  })

  // ─────────────────────────────────────────────
  // ASSETS — /v1/assets/*
  // Handled inline for performance (local DB)
  // ─────────────────────────────────────────────

  router.get('/v1/assets', async (ctx) => {
    const user = ctx.var.user
    const { getDb, schema: s, eq, and } = await import('@zonforge/db-client')
    const db     = getDb()
    const limit  = Math.min(parseInt(ctx.req.query('limit') ?? '50', 10), 200)

    const assets = await db.select({
      id:              s.assets.id,
      name:            s.assets.name,
      assetType:       s.assets.type,
      isInternetFacing: s.assets.isInternetFacing,
      criticality:     s.assets.criticality,
      riskScore:       s.assets.riskScore,
      vulnCountCritical: s.assets.vulnCountCritical,
      vulnCountHigh:   s.assets.vulnCountHigh,
      lastSeenAt:      s.assets.lastSeenAt,
    })
      .from(s.assets)
      .where(eq(s.assets.tenantId, user.tenantId))
      .orderBy(s.assets.riskScore)
      .limit(limit)

    return ctx.json({ success: true, data: assets })
  })

  router.get('/v1/assets/:id', async (ctx) => {
    const user = ctx.var.user
    const { getDb, schema: s, eq, and } = await import('@zonforge/db-client')
    const db    = getDb()
    const asset = await db.select()
      .from(s.assets)
      .where(and(
        eq(s.assets.id, ctx.req.param('id')),
        eq(s.assets.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!asset[0]) {
      return ctx.json({ success: false,
        error: { code: 'NOT_FOUND', message: 'Asset not found' } }, 404)
    }

    return ctx.json({ success: true, data: asset[0] })
  })

  // ─────────────────────────────────────────────
  // AUDIT LOGS — /v1/audit-logs
  // Read-only, directly from DB for accuracy
  // ─────────────────────────────────────────────

  router.get('/v1/audit-logs', async (ctx) => {
    const user  = ctx.var.user
    const limit = Math.min(parseInt(ctx.req.query('limit') ?? '100', 10), 500)
    const from  = ctx.req.query('from')
      ? new Date(ctx.req.query('from')!)
      : new Date(Date.now() - 30 * 86_400_000)

    const { getDb, schema: s, eq, and, gte, desc } = await import('@zonforge/db-client')
    const db   = getDb()
    const logs = await db.select({
      id:           s.auditLogs.id,
      actorId:      s.auditLogs.actorId,
      actorEmail:   s.auditLogs.actorEmail,
      actorRole:    s.auditLogs.actorRole,
      actorIp:      s.auditLogs.actorIp,
      action:       s.auditLogs.action,
      resourceType: s.auditLogs.resourceType,
      resourceId:   s.auditLogs.resourceId,
      changes:      s.auditLogs.changes,
      createdAt:    s.auditLogs.createdAt,
    })
      .from(s.auditLogs)
      .where(and(
        eq(s.auditLogs.tenantId, user.tenantId),
        gte(s.auditLogs.createdAt, from),
      ))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(limit)

    return ctx.json({ success: true, data: logs })
  })

  // ─────────────────────────────────────────────
  // USERS — /v1/users/*
  // ─────────────────────────────────────────────

  router.all('/v1/users/*', async (ctx) => {
    return proxyTo(ctx, 'auth', ctx.req.path)
  })

  // ─────────────────────────────────────────────
  // CATCH-ALL — 404 for unmatched API paths
  // ─────────────────────────────────────────────

  router.all('/v1/*', (ctx) => {
    return ctx.json({
      success: false,
      error: {
        code:    'NOT_FOUND',
        message: `No API route found for ${ctx.req.method} ${ctx.req.path}`,
      },
    }, 404)
  })

  return router
}
