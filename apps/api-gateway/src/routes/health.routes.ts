import { Hono } from 'hono'
import { eq, and, desc, count } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import {
  requirePermission, successResponse,
} from '../middleware/core.middleware.js'
import { PLAN_LIMITS } from '@zonforge/shared-types'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'api-gateway:health' })

export function createHealthRouter() {
  const router = new Hono()

  // ── GET /health ───────────────────────────────────────────────
  // Public health check

  router.get('/health', (ctx) => {
    return ctx.json({
      status:    'ok',
      service:   'zonforge-api-gateway',
      version:   process.env['npm_package_version'] ?? '0.1.0',
      timestamp: new Date().toISOString(),
    })
  })

  // ── GET /v1/health/pipeline ───────────────────────────────────
  // Connector health + ingestion pipeline lag

  router.get(
    '/v1/health/pipeline',
    requirePermission('tenant:read'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()

      // Connector health
      const connectors = await db.select({
        id:               schema.connectors.id,
        name:             schema.connectors.name,
        type:             schema.connectors.type,
        status:           schema.connectors.status,
        lastPollAt:       schema.connectors.lastPollAt,
        lastEventAt:      schema.connectors.lastEventAt,
        lastErrorAt:      schema.connectors.lastErrorAt,
        lastErrorMessage: schema.connectors.lastErrorMessage,
        consecutiveErrors: schema.connectors.consecutiveErrors,
        eventRatePerHour: schema.connectors.eventRatePerHour,
      })
        .from(schema.connectors)
        .where(eq(schema.connectors.tenantId, user.tenantId))

      const healthyCount  = connectors.filter(c => c.status === 'active' && c.consecutiveErrors === 0).length
      const degradedCount = connectors.filter(c => c.status === 'degraded' || c.consecutiveErrors > 0).length
      const errorCount    = connectors.filter(c => c.status === 'error').length

      // Queue metrics from Redis (via platform metrics key)
      const redis    = ctx.get('redis' as any)
      const queueMetrics: Record<string, unknown> = {}

      if (redis) {
        const queueNames = [
          'zf:raw-events',
          'zf:normalized-events',
          'zf:detection-signals',
          'zf:dlq:normalization',
        ]
        for (const name of queueNames) {
          const raw = await redis.get(`zf:platform:metrics:queue:${name}`)
          if (raw) {
            queueMetrics[name] = JSON.parse(raw)
          }
        }
      }

      return successResponse(ctx, {
        connectors: {
          total:    connectors.length,
          healthy:  healthyCount,
          degraded: degradedCount,
          error:    errorCount,
          details:  connectors,
        },
        queues: queueMetrics,
        summary: {
          overallStatus: errorCount > 0 ? 'error'
            : degradedCount > 0 ? 'degraded'
            : 'healthy',
        },
      })
    },
  )

  // ── GET /v1/billing/usage ─────────────────────────────────────

  router.get(
    '/v1/billing/usage',
    requirePermission('billing:*'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()

      // Connector count
      const connectorCount = await db.select({ cnt: count() })
        .from(schema.connectors)
        .where(eq(schema.connectors.tenantId, user.tenantId))

      // User count
      const userCount = await db.select({ cnt: count() })
        .from(schema.users)
        .where(and(
          eq(schema.users.tenantId, user.tenantId),
          eq(schema.users.status,   'active'),
        ))

      // Custom rules count
      const ruleCount = await db.select({ cnt: count() })
        .from(schema.detectionRules)
        .where(eq(schema.detectionRules.tenantId, user.tenantId))

      // Active alerts
      const alertCount = await db.select({ cnt: count() })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, user.tenantId),
          eq(schema.alerts.status,   'open'),
        ))

      // Plan limits
      const tenants = await db.select({ planTier: schema.tenants.planTier })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, user.tenantId))
        .limit(1)

      const planTier = tenants[0]?.planTier ?? 'starter'
      const limits   = PLAN_LIMITS[planTier as keyof typeof PLAN_LIMITS]

      return successResponse(ctx, {
        planTier,
        usage: {
          connectors:   { current: Number(connectorCount[0]?.cnt ?? 0), limit: limits.maxConnectors },
          users:        { current: Number(userCount[0]?.cnt ?? 0),       limit: limits.maxIdentities },
          customRules:  { current: Number(ruleCount[0]?.cnt ?? 0),       limit: limits.maxCustomRules },
          openAlerts:   { current: Number(alertCount[0]?.cnt ?? 0),      limit: null },
        },
        features: {
          llmNarratives:  limits.hasLlmNarratives,
          playbooks:      limits.hasPlaybooks,
          ssoIntegration: limits.hasSsoIntegration,
          byok:           limits.hasByok,
          apiAccess:      limits.hasApiAccess,
        },
        retentionDays: limits.retentionDays,
      })
    },
  )

  // ── GET /v1/billing/subscription ─────────────────────────────

  router.get(
    '/v1/billing/subscription',
    requirePermission('billing:*'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()

      const subs = await db.select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.tenantId, user.tenantId))
        .orderBy(desc(schema.subscriptions.createdAt))
        .limit(1)

      if (!subs[0]) {
        return successResponse(ctx, { status: 'no_subscription' })
      }

      return successResponse(ctx, subs[0])
    },
  )

  return router
}
