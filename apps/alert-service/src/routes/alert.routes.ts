import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, gte, inArray } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { AlertService } from '../services/alert.service.js'
import { NotificationOrchestrator } from '../services/notification-orchestrator.service.js'
import { createLogger } from '@zonforge/logger'
import type { Context } from 'hono'
import type { AlertPriority, AlertStatus, Severity } from '@zonforge/shared-types'

const log = createLogger({ service: 'alert-service:routes' })

const UpdateStatusSchema = z.object({
  status: z.enum(['investigating', 'resolved', 'suppressed', 'false_positive']),
  notes:  z.string().max(2000).optional(),
})

const FeedbackSchema = z.object({
  verdict: z.enum(['true_positive', 'false_positive', 'unclear']),
  notes:   z.string().max(2000).optional(),
})

const AssignSchema = z.object({
  analystId: z.string().uuid(),
})

export function createAlertRouter(
  alertService:    AlertService,
  notifyOrchestra: NotificationOrchestrator,
) {
  const router = new Hono()

  // ── GET /v1/alerts ────────────────────────────────────────────
  // List alerts with filters

  router.get('/v1/alerts', async (ctx) => {
    const user       = ctx.var.user
    const db         = getDb()
    const q          = ctx.req.query()

    const severities  = q['severity']?.split(',') ?? []
    const statuses    = q['status']?.split(',') ?? []
    const priorities  = q['priority']?.split(',') ?? []
    const limit       = Math.min(parseInt(q['limit'] ?? '50', 10), 200)
    const from        = q['from'] ? new Date(q['from']) : new Date(Date.now() - 30 * 86_400_000)

    const conditions = [
      eq(schema.alerts.tenantId, user.tenantId),
      gte(schema.alerts.createdAt, from),
    ]

    if (severities.length > 0) {
      conditions.push(inArray(schema.alerts.severity, severities as Severity[]))
    }
    if (statuses.length > 0) {
      conditions.push(inArray(schema.alerts.status, statuses as AlertStatus[]))
    }
    if (priorities.length > 0) {
      conditions.push(inArray(schema.alerts.priority, priorities as AlertPriority[]))
    }

    const alerts = await db.select({
      id:              schema.alerts.id,
      title:           schema.alerts.title,
      severity:        schema.alerts.severity,
      priority:        schema.alerts.priority,
      status:          schema.alerts.status,
      affectedUserId:  schema.alerts.affectedUserId,
      affectedIp:      schema.alerts.affectedIp,
      mitreTactics:    schema.alerts.mitreTactics,
      mitreTechniques: schema.alerts.mitreTechniques,
      detectionGapMinutes: schema.alerts.detectionGapMinutes,
      mttdSlaBreached: schema.alerts.mttdSlaBreached,
      assignedTo:      schema.alerts.assignedTo,
      createdAt:       schema.alerts.createdAt,
      updatedAt:       schema.alerts.updatedAt,
      resolvedAt:      schema.alerts.resolvedAt,
    })
      .from(schema.alerts)
      .where(and(...conditions))
      .orderBy(desc(schema.alerts.createdAt))
      .limit(limit)

    return ctx.json({ success: true, data: alerts, meta: meta(ctx) })
  })

  // ── GET /v1/alerts/:id ────────────────────────────────────────
  // Full alert detail with evidence + narrative

  router.get('/v1/alerts/:id', async (ctx) => {
    const user    = ctx.var.user
    const db      = getDb()
    const alertId = ctx.req.param('id')

    const alerts = await db.select()
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.id,       alertId),
        eq(schema.alerts.tenantId, user.tenantId),
      ))
      .limit(1)

    const alert = alerts[0]
    if (!alert) {
      return ctx.json({ success: false,
        error: { code: 'NOT_FOUND', message: 'Alert not found' } }, 404)
    }

    return ctx.json({ success: true, data: alert, meta: meta(ctx) })
  })

  // ── PATCH /v1/alerts/:id/status ───────────────────────────────

  router.patch(
    '/v1/alerts/:id/status',
    zValidator('json', UpdateStatusSchema),
    async (ctx) => {
      const user    = ctx.var.user
      const alertId = ctx.req.param('id')
      const { status, notes } = ctx.req.valid('json')

      await alertService.updateAlertStatus(
        alertId, user.tenantId, status, user.id, notes,
      )
      return ctx.json({ success: true, data: { updated: true }, meta: meta(ctx) })
    }
  )

  // ── POST /v1/alerts/:id/assign ────────────────────────────────

  router.post(
    '/v1/alerts/:id/assign',
    zValidator('json', AssignSchema),
    async (ctx) => {
      const user    = ctx.var.user
      const alertId = ctx.req.param('id')
      const { analystId } = ctx.req.valid('json')

      await alertService.assignAlert(alertId, user.tenantId, analystId, user.id)
      return ctx.json({ success: true, data: { assigned: true }, meta: meta(ctx) })
    }
  )

  // ── POST /v1/alerts/:id/feedback ──────────────────────────────

  router.post(
    '/v1/alerts/:id/feedback',
    zValidator('json', FeedbackSchema),
    async (ctx) => {
      const user    = ctx.var.user
      const alertId = ctx.req.param('id')
      const { verdict, notes } = ctx.req.valid('json')

      await alertService.saveFeedback(
        alertId, user.tenantId, user.id, verdict, notes,
      )
      return ctx.json({ success: true, data: { feedback_saved: true }, meta: meta(ctx) })
    }
  )

  // ── POST /internal/alerts (from correlation/detection engines) ─

  router.post('/internal/alerts', async (ctx) => {
    const body = await ctx.req.json() as {
      tenantId:         string
      findingId:        string
      title:            string
      description:      string
      severity:         string
      evidenceEventIds: string[]
      mitreTactics:     string[]
      mitreTechniques:  string[]
      recommendedActions: string[]
      affectedUserId?:  string
      affectedAssetId?: string
      affectedIp?:      string
      firstSignalTime:  string
    }

    const result = await alertService.createAlert({
      ...body,
      severity:       body.severity as any,
      firstSignalTime: new Date(body.firstSignalTime),
    })

    if (result.isNew) {
      // Dispatch notifications asynchronously
      notifyOrchestra.notify(result.alertId, body.tenantId).catch(err =>
        log.error({ err, alertId: result.alertId }, 'Notification dispatch failed'),
      )
    }

    return ctx.json({
      success: true,
      data:    result,
    }, result.isNew ? 201 : 200)
  })

  return router
}

function meta(ctx: Context) {
  return { requestId: ctx.var.requestId ?? 'unknown', timestamp: new Date() }
}
