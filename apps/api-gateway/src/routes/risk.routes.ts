import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getDb, schema, RedisKeys, RedisTTL } from '@zonforge/db-client'
import {
  requirePermission, successResponse, errorResponse,
  parsePagination, buildPaginatedResponse,
} from '../middleware/core.middleware.js'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'api-gateway:risk' })

const AnalystOverrideSchema = z.object({
  newScore:      z.number().int().min(0).max(100),
  justification: z.string().min(10).max(1000),
})

export function createRiskRouter() {
  const router = new Hono()

  // ── GET /v1/risk/summary ──────────────────────────────────────
  // Org posture: scores, top risks, MTTD, connector health

  router.get(
    '/v1/risk/summary',
    requirePermission('risk:read'),
    async (ctx) => {
      const user  = ctx.var.user
      const redis = ctx.get('redis' as any)

      // Check cache first
      const cacheKey = RedisKeys.orgPosture(user.tenantId)
      if (redis) {
        const cached = await redis.get(cacheKey)
        if (cached) return successResponse(ctx, JSON.parse(cached))
      }

      // Fetch from risk-scoring-engine via internal HTTP
      try {
        const resp = await fetch(
          `${process.env['ZONFORGE_RISK_ENGINE_URL'] ?? 'http://localhost:3007'}/internal/score-org`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ tenantId: user.tenantId }),
            signal:  AbortSignal.timeout(5000),
          },
        )

        if (!resp.ok) throw new Error('Risk engine unavailable')
        const data = await resp.json() as { data: unknown }

        if (redis) {
          await redis.setex(cacheKey, RedisTTL.ORG_POSTURE, JSON.stringify(data.data))
        }

        return successResponse(ctx, data.data)
      } catch (err) {
        log.error({ err }, 'Risk summary fetch failed')

        // Fallback: return from DB
        const db = getDb()
        const posture = await db.select()
          .from(schema.orgPosture)
          .where(eq(schema.orgPosture.tenantId, user.tenantId))
          .limit(1)

        return successResponse(ctx, posture[0] ?? {
          postureScore: 50,
          openCriticalAlerts: 0,
          openHighAlerts: 0,
          avgUserRiskScore: 0,
          topRiskUserIds: [],
          topRiskAssetIds: [],
          connectorHealthScore: 100,
          mttdP50Minutes: null,
          calculatedAt: new Date(),
        })
      }
    },
  )

  // ── GET /v1/risk/users ────────────────────────────────────────
  // List users sorted by risk score

  router.get(
    '/v1/risk/users',
    requirePermission('risk:read'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()
      const { limit } = parsePagination(ctx, 50)

      const scores = await db.select({
        entityId:           schema.riskScores.entityId,
        score:              schema.riskScores.score,
        severity:           schema.riskScores.severity,
        confidenceBand:     schema.riskScores.confidenceBand,
        contributingSignals: schema.riskScores.contributingSignals,
        calculatedAt:       schema.riskScores.calculatedAt,
      })
        .from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId,   user.tenantId),
          eq(schema.riskScores.entityType, 'user'),
        ))
        .orderBy(desc(schema.riskScores.score))
        .limit(limit + 1)

      const paginated = buildPaginatedResponse(
        scores, limit,
        (s) => `${s.score}:${s.entityId}`,
      )

      return successResponse(ctx, paginated)
    },
  )

  // ── GET /v1/risk/users/:userId ────────────────────────────────
  // Full user risk profile with history + alerts

  router.get(
    '/v1/risk/users/:userId',
    requirePermission('risk:read'),
    async (ctx) => {
      const user   = ctx.var.user
      const userId = ctx.req.param('userId')
      const db     = getDb()

      if (!userId) {
        return errorResponse(ctx, 'BAD_REQUEST', 'userId is required', 400)
      }

      // Risk score
      const scores = await db.select()
        .from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId,   user.tenantId),
          eq(schema.riskScores.entityType, 'user'),
          eq(schema.riskScores.entityId,   userId),
        ))
        .limit(1)

      const riskScore = scores[0]
      if (!riskScore) {
        return errorResponse(ctx, 'NOT_FOUND', 'User risk score not found', 404)
      }

      // Recent alerts for this user
      const recentAlerts = await db.select({
        id:        schema.alerts.id,
        title:     schema.alerts.title,
        severity:  schema.alerts.severity,
        priority:  schema.alerts.priority,
        status:    schema.alerts.status,
        createdAt: schema.alerts.createdAt,
      })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId,      user.tenantId),
          eq(schema.alerts.affectedUserId, userId),
        ))
        .orderBy(desc(schema.alerts.createdAt))
        .limit(10)

      // User record (without sensitive fields)
      const users = await db.select({
        id:           schema.users.id,
        email:        schema.users.email,
        name:         schema.users.name,
        role:         schema.users.role,
        department:   schema.users.department,
        jobTitle:     schema.users.jobTitle,
        isContractor: schema.users.isContractor,
        privilegeGroups: schema.users.privilegeGroups,
        mfaEnabled:   schema.users.mfaEnabled,
        lastLoginAt:  schema.users.lastLoginAt,
        lastLoginIp:  schema.users.lastLoginIp,
      })
        .from(schema.users)
        .where(and(
          eq(schema.users.id,       userId),
          eq(schema.users.tenantId, user.tenantId),
        ))
        .limit(1)

      return successResponse(ctx, {
        riskScore,
        user:         users[0] ?? null,
        recentAlerts,
        alertCount:   recentAlerts.length,
      })
    },
  )

  // ── GET /v1/risk/assets ───────────────────────────────────────
  // List assets sorted by risk score

  router.get(
    '/v1/risk/assets',
    requirePermission('risk:read'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()
      const { limit } = parsePagination(ctx, 50)

      const internetOnly = ctx.req.query('internet_facing') === 'true'

      const baseQuery = db.select({
        entityId:       schema.riskScores.entityId,
        score:          schema.riskScores.score,
        severity:       schema.riskScores.severity,
        calculatedAt:   schema.riskScores.calculatedAt,
      })
        .from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId,   user.tenantId),
          eq(schema.riskScores.entityType, 'asset'),
        ))
        .orderBy(desc(schema.riskScores.score))
        .limit(limit + 1)

      const scores    = await baseQuery
      const paginated = buildPaginatedResponse(scores, limit, s => `${s.score}:${s.entityId}`)

      return successResponse(ctx, paginated)
    },
  )

  // ── GET /v1/risk/assets/:assetId ──────────────────────────────
  // Full asset risk profile

  router.get(
    '/v1/risk/assets/:assetId',
    requirePermission('risk:read'),
    async (ctx) => {
      const user    = ctx.var.user
      const assetId = ctx.req.param('assetId')
      const db      = getDb()

      if (!assetId) {
        return errorResponse(ctx, 'BAD_REQUEST', 'assetId is required', 400)
      }

      const scores = await db.select()
        .from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId,   user.tenantId),
          eq(schema.riskScores.entityType, 'asset'),
          eq(schema.riskScores.entityId,   assetId),
        ))
        .limit(1)

      if (!scores[0]) {
        return errorResponse(ctx, 'NOT_FOUND', 'Asset risk score not found', 404)
      }

      const assets = await db.select()
        .from(schema.assets)
        .where(and(
          eq(schema.assets.id,       assetId),
          eq(schema.assets.tenantId, user.tenantId),
        ))
        .limit(1)

      const vulns = await db.select()
        .from(schema.vulnerabilities)
        .where(and(
          eq(schema.vulnerabilities.assetId,  assetId),
          eq(schema.vulnerabilities.tenantId, user.tenantId),
        ))
        .orderBy(desc(schema.vulnerabilities.cvssScore))
        .limit(20)

      const activeAlerts = await db.select({
        id: schema.alerts.id,
        title: schema.alerts.title,
        severity: schema.alerts.severity,
        createdAt: schema.alerts.createdAt,
      })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId,       user.tenantId),
          eq(schema.alerts.affectedAssetId, assetId),
          eq(schema.alerts.status,         'open'),
        ))
        .limit(5)

      return successResponse(ctx, {
        riskScore:    scores[0],
        asset:        assets[0] ?? null,
        vulnerabilities: vulns,
        activeAlerts,
      })
    },
  )

  // ── PATCH /v1/risk/users/:userId/override ─────────────────────
  // Analyst manual score override

  router.patch(
    '/v1/risk/users/:userId/override',
    requirePermission('risk:read'),
    zValidator('json', AnalystOverrideSchema),
    async (ctx) => {
      const user   = ctx.var.user
      const userId = ctx.req.param('userId')
      const body   = ctx.req.valid('json')
      const db     = getDb()

      await db.update(schema.riskScores)
        .set({
          score:          body.newScore,
          severity:       scoreToSeverity(body.newScore),
          analystOverride: {
            previousScore: 0,   // filled by service in production
            newScore:      body.newScore,
            justification: body.justification,
            analystId:     user.id,
            analystEmail:  user.email,
            overriddenAt:  new Date(),
          },
          calculatedAt:   new Date(),
        })
        .where(and(
          eq(schema.riskScores.tenantId,   user.tenantId),
          eq(schema.riskScores.entityType, 'user'),
          eq(schema.riskScores.entityId,   userId),
        ))

      return successResponse(ctx, { overrideApplied: true })
    },
  )

  // ── GET /v1/metrics/mttd ──────────────────────────────────────

  router.get(
    '/v1/metrics/mttd',
    requirePermission('risk:read'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()

      const rows = await db.select({
        priority:           schema.alerts.priority,
        detectionGapMinutes: schema.alerts.detectionGapMinutes,
      })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, user.tenantId),
        ))
        .limit(1000)

      const byPriority: Record<string, number[]> = {}
      for (const row of rows) {
        if (!row.detectionGapMinutes) continue
        const arr = byPriority[row.priority] ?? []
        arr.push(row.detectionGapMinutes)
        byPriority[row.priority] = arr
      }

      const result: Record<string, { p50: number; p75: number; p95: number; count: number }> = {}
      for (const [priority, values] of Object.entries(byPriority)) {
        const sorted = values.sort((a, b) => a - b)
        result[priority] = {
          p50:   sorted[Math.floor(sorted.length * 0.50)] ?? 0,
          p75:   sorted[Math.floor(sorted.length * 0.75)] ?? 0,
          p95:   sorted[Math.floor(sorted.length * 0.95)] ?? 0,
          count: sorted.length,
        }
      }

      return successResponse(ctx, result)
    },
  )

  return router
}

function scoreToSeverity(score: number): string {
  if (score >= 85) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 50) return 'medium'
  if (score >= 25) return 'low'
  return 'info'
}
