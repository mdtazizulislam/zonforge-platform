import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb, schema } from '@zonforge/db-client'
import {
  requirePermission, requireFeature,
  successResponse, errorResponse,
} from '../middleware/core.middleware.js'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'api-gateway:playbooks' })

const ExecutePlaybookSchema = z.object({
  alertId: z.string().uuid(),
  notes:   z.string().max(500).optional(),
})

export function createPlaybookRouter() {
  const router = new Hono()

  // ── GET /v1/playbooks ─────────────────────────────────────────

  router.get(
    '/v1/playbooks',
    requirePermission('playbooks:read'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()

      // Return platform defaults + tenant custom
      const playbooks = await db.select({
        id:             schema.playbooks.id,
        name:           schema.playbooks.name,
        description:    schema.playbooks.description,
        triggerSeverities: schema.playbooks.triggerSeverities,
        actions:        schema.playbooks.actions,
        enabled:        schema.playbooks.enabled,
        executionCount: schema.playbooks.executionCount,
        lastExecutedAt: schema.playbooks.lastExecutedAt,
        isCustom:       schema.playbooks.tenantId,
      })
        .from(schema.playbooks)
        .where(eq(schema.playbooks.enabled, true))

      return successResponse(ctx, playbooks)
    },
  )

  // ── POST /v1/playbooks/:id/execute ───────────────────────────

  router.post(
    '/v1/playbooks/:id/execute',
    requirePermission('playbooks:execute'),
    requireFeature('hasPlaybooks'),
    zValidator('json', ExecutePlaybookSchema),
    async (ctx) => {
      const user       = ctx.var.user
      const playbookId = ctx.req.param('id')
      const { alertId, notes } = ctx.req.valid('json')
      const db = getDb()

      // Load playbook
      const playbooks = await db.select()
        .from(schema.playbooks)
        .where(and(
          eq(schema.playbooks.id,      playbookId),
          eq(schema.playbooks.enabled, true),
        ))
        .limit(1)

      const playbook = playbooks[0]
      if (!playbook) {
        return errorResponse(ctx, 'NOT_FOUND', 'Playbook not found', 404)
      }

      // Verify alert belongs to tenant
      const alerts = await db.select({ id: schema.alerts.id })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.id,       alertId),
          eq(schema.alerts.tenantId, user.tenantId),
        ))
        .limit(1)

      if (!alerts[0]) {
        return errorResponse(ctx, 'NOT_FOUND', 'Alert not found', 404)
      }

      // Check if any action requires approval
      const actions     = (playbook.actions as Array<{ type: string; requiresApproval?: boolean }>) ?? []
      const needsApproval = actions.some(a => a.requiresApproval)
      const execId      = uuidv4()
      const status      = needsApproval ? 'pending_approval' : 'running'

      // Create execution record
      await db.insert(schema.playbookExecutions).values({
        id:               execId,
        playbookId,
        alertId,
        tenantId:         user.tenantId,
        triggeredBy:      user.id,
        status,
        actionsCompleted: [],
        approvedBy:       needsApproval ? null : user.id,
        approvedAt:       needsApproval ? null : new Date(),
        createdAt:        new Date(),
      })

      // Update playbook stats
      await db.update(schema.playbooks)
        .set({
          executionCount: (playbook.executionCount ?? 0) + 1,
          lastExecutedAt: new Date(),
          updatedAt:      new Date(),
        })
        .where(eq(schema.playbooks.id, playbookId))

      log.info({
        executionId: execId,
        playbookId,
        alertId,
        needsApproval,
        triggeredBy: user.id,
      }, 'Playbook execution created')

      return successResponse(ctx, {
        executionId:    execId,
        status,
        requiresApproval: needsApproval,
        message: needsApproval
          ? 'Execution pending approval from a second analyst'
          : 'Playbook execution started',
      }, 201)
    },
  )

  // ── GET /v1/playbooks/executions ─────────────────────────────

  router.get(
    '/v1/playbooks/executions',
    requirePermission('playbooks:read'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()

      const executions = await db.select()
        .from(schema.playbookExecutions)
        .where(eq(schema.playbookExecutions.tenantId, user.tenantId))
        .orderBy(schema.playbookExecutions.createdAt)
        .limit(50)

      return successResponse(ctx, executions)
    },
  )

  return router
}
