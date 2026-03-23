import { eq, and, inArray, sql } from 'drizzle-orm'
import { v4 as uuid }       from 'uuid'
import type { Redis }       from 'ioredis'
import { getDb, schema }    from '@zonforge/db-client'
import { createLogger }     from '@zonforge/logger'
import {
  ACTION_EXECUTORS,
  type ActionContext,
  type ActionResult,
  type ActionType,
} from '../executors/action.executors.js'

const log = createLogger({ service: 'playbook-engine' })

// ─────────────────────────────────────────────
// PLAYBOOK TRIGGER EVALUATION
// ─────────────────────────────────────────────

export interface PlaybookAction {
  type:              ActionType
  config:            Record<string, unknown>
  requiresApproval:  boolean
  delaySeconds:      number
}

export interface PlaybookDefinition {
  id:                string
  tenantId:          string | null
  name:              string
  description:       string
  enabled:           boolean
  triggerSeverities: string[]
  triggerRuleIds:    string[]
  actions:           PlaybookAction[]
}

export interface AlertForTrigger {
  id:               string
  tenantId:         string
  severity:         string
  priority:         string
  findingId:        string
  affectedUserId?:  string | null
  affectedIp?:      string | null
  affectedEmail?:   string | null
  mitreTechniques:  string[]
  metadata:         Record<string, unknown>
}

type PlaybookExecutionStatus = 'pending_approval' | 'running' | 'completed' | 'failed' | 'cancelled'

// ─────────────────────────────────────────────
// PLAYBOOK ENGINE SERVICE
// ─────────────────────────────────────────────

export class PlaybookEngineService {
  constructor(private readonly redis: Redis) {}

  // ── Load enabled playbooks for a tenant ──────

  async loadPlaybooks(tenantId: string): Promise<PlaybookDefinition[]> {
    const db = getDb()

    const playbooks = await db.select()
      .from(schema.playbooks)
      .where(and(
        eq(schema.playbooks.enabled, true),
        // platform playbooks (tenantId=null) + tenant custom
        inArray(schema.playbooks.tenantId, [tenantId]),
      ))
      .limit(100)

    // Also get platform defaults (tenantId is null)
    const platformPlaybooks = await db.select()
      .from(schema.playbooks)
      .where(and(
        eq(schema.playbooks.enabled, true),
        eq(schema.playbooks.tenantId, null as any),
      ))
      .limit(50)

    return [...platformPlaybooks, ...playbooks].map(p => ({
      id:                p.id,
      tenantId:          p.tenantId,
      name:              p.name,
      description:       p.description,
      enabled:           p.enabled,
      triggerSeverities: (p.triggerSeverities as string[]) ?? [],
      triggerRuleIds:    (p.triggerRuleIds    as string[]) ?? [],
      actions:           (p.actions           as PlaybookAction[]) ?? [],
    }))
  }

  // ── Evaluate which playbooks trigger for an alert ─

  matchPlaybooks(
    alert:     AlertForTrigger,
    playbooks: PlaybookDefinition[],
  ): PlaybookDefinition[] {
    return playbooks.filter(pb => {
      // Severity match
      if (pb.triggerSeverities.length > 0) {
        if (!pb.triggerSeverities.includes(alert.severity)) return false
      }
      return true
    })
  }

  // ── Execute a single playbook ─────────────────

  async executePlaybook(
    playbook:    PlaybookDefinition,
    alert:       AlertForTrigger,
    triggeredBy: string,   // userId or 'auto'
  ): Promise<{
    executionId:   string
    playbookId:    string
    status:        PlaybookExecutionStatus
    actionsResult: Array<{ type: string; status: string; message: string }>
  }> {
    const executionId = uuid()
    const db          = getDb()
    const now         = new Date()

    const ctx: ActionContext = {
      tenantId:       alert.tenantId,
      alertId:        alert.id,
      executionId,
      ...(alert.affectedUserId !== undefined ? { affectedUserId: alert.affectedUserId } : {}),
      ...(alert.affectedIp !== undefined ? { affectedIp: alert.affectedIp } : {}),
      ...(alert.affectedEmail !== undefined ? { affectedEmail: alert.affectedEmail } : {}),
      metadata:       alert.metadata,
    }

    // Check if any actions require approval
    const requiresApproval = playbook.actions.some(a => a.requiresApproval)

    // Create execution record
    await db.insert(schema.playbookExecutions).values({
      id:               executionId,
      playbookId:       playbook.id,
      alertId:          alert.id,
      tenantId:         alert.tenantId,
      triggeredBy,
      status:           requiresApproval ? 'pending_approval' : 'running',
      actionsCompleted: [],
      approvedBy:       null,
      approvedAt:       null,
      completedAt:      null,
      createdAt:        now,
    })

    // Update playbook hit count
    await db.update(schema.playbooks)
      .set({ executionCount: sql`${schema.playbooks.executionCount} + 1`, lastExecutedAt: now })
      .where(eq(schema.playbooks.id, playbook.id))

    log.info({
      executionId,
      playbookId:    playbook.id,
      playbookName:  playbook.name,
      alertId:       alert.id,
      tenantId:      alert.tenantId,
      requiresApproval,
      triggeredBy,
    }, `Playbook execution started: ${playbook.name}`)

    if (requiresApproval) {
      return {
        executionId,
        playbookId: playbook.id,
        status:     'pending_approval',
        actionsResult: playbook.actions.map(a => ({
          type:    a.type,
          status:  'pending_approval',
          message: 'Awaiting analyst approval',
        })),
      }
    }

    // Execute actions sequentially
    const actionsResult: Array<{ type: string; status: string; message: string }> = []
    let overallStatus: PlaybookExecutionStatus = 'completed'

    for (const action of playbook.actions) {
      // Respect delay
      if (action.delaySeconds > 0) {
        await new Promise(r => setTimeout(r, action.delaySeconds * 1000))
      }

      const executor = ACTION_EXECUTORS[action.type]
      if (!executor) {
        actionsResult.push({
          type:    action.type,
          status:  'failed',
          message: `Unknown action type: ${action.type}`,
        })
        continue
      }

      let result: ActionResult
      try {
        result = await executor(action.config, ctx)
      } catch (err) {
        result = {
          success: false,
          message: `Executor threw: ${err instanceof Error ? err.message : 'Unknown'}`,
          error:   String(err),
        }
      }

      actionsResult.push({
        type:    action.type,
        status:  result.success ? 'success' : 'failed',
        message: result.message,
      })

      if (!result.success) {
        overallStatus = 'failed'
        log.error({
          executionId, actionType: action.type, error: result.error,
        }, `Playbook action failed: ${action.type}`)
      } else {
        log.info({
          executionId, actionType: action.type,
        }, `Playbook action succeeded: ${action.type}`)
      }
    }

    // Update execution record
    await db.update(schema.playbookExecutions)
      .set({
        status:           overallStatus,
        actionsCompleted: actionsResult,
        completedAt:      new Date(),
      })
      .where(eq(schema.playbookExecutions.id, executionId))

    // Audit log
    this.writeAuditEntry(alert.tenantId, executionId, playbook.id, triggeredBy, overallStatus)

    return { executionId, playbookId: playbook.id, status: overallStatus, actionsResult }
  }

  // ── Approve a pending execution ───────────────

  async approveExecution(
    executionId: string,
    tenantId:    string,
    analystId:   string,
  ): Promise<{ status: string; message: string }> {
    const db  = getDb()

    const rows = await db.select()
      .from(schema.playbookExecutions)
      .where(and(
        eq(schema.playbookExecutions.id,       executionId),
        eq(schema.playbookExecutions.tenantId, tenantId),
        eq(schema.playbookExecutions.status,   'pending_approval'),
      ))
      .limit(1)

    const execution = rows[0]
    if (!execution) {
      return { status: 'error', message: 'Execution not found or already processed' }
    }

    // Mark as approved
    await db.update(schema.playbookExecutions)
      .set({
        status:     'running',
        approvedBy: analystId,
        approvedAt: new Date(),
      })
      .where(eq(schema.playbookExecutions.id, executionId))

    // Load playbook and alert then re-execute
    const playbooks = await db.select()
      .from(schema.playbooks)
      .where(eq(schema.playbooks.id, execution.playbookId))
      .limit(1)

    const alerts = await db.select()
      .from(schema.alerts)
      .where(eq(schema.alerts.id, execution.alertId))
      .limit(1)

    const playbook = playbooks[0]
    const alert    = alerts[0]

    if (!playbook || !alert) {
      return { status: 'error', message: 'Associated playbook or alert not found' }
    }

    // Execute approved actions
    const pd: PlaybookDefinition = {
      id:                playbook.id,
      tenantId:          playbook.tenantId,
      name:              playbook.name,
      description:       playbook.description,
      enabled:           playbook.enabled,
      triggerSeverities: (playbook.triggerSeverities as string[]) ?? [],
      triggerRuleIds:    (playbook.triggerRuleIds    as string[]) ?? [],
      // Strip requiresApproval so actions run immediately
      actions:           ((playbook.actions as PlaybookAction[]) ?? []).map(a => ({
        ...a, requiresApproval: false,
      })),
    }

    const alertForTrigger: AlertForTrigger = {
      id:              alert.id,
      tenantId:        alert.tenantId,
      severity:        alert.severity,
      priority:        alert.priority,
      findingId:       alert.findingId ?? '',
      affectedUserId:  alert.affectedUserId,
      affectedIp:      alert.affectedIp,
      affectedEmail:   null,
      mitreTechniques: (alert.mitreTechniques as string[]) ?? [],
      metadata:        {},
    }

    const result = await this.executePlaybook(pd, alertForTrigger, analystId)

    log.info({ executionId, analystId, status: result.status }, 'Playbook approved and executed')
    return { status: result.status, message: `Playbook approved and ${result.status}` }
  }

  // ── List executions for a tenant ─────────────

  async listExecutions(tenantId: string, limit = 50) {
    const db = getDb()
    return db.select()
      .from(schema.playbookExecutions)
      .where(eq(schema.playbookExecutions.tenantId, tenantId))
      .orderBy(schema.playbookExecutions.createdAt)
      .limit(limit)
  }

  // ── Auto-trigger on new alert ─────────────────

  async autoTriggerForAlert(alert: AlertForTrigger): Promise<number> {
    const playbooks = await this.loadPlaybooks(alert.tenantId)
    const matched   = this.matchPlaybooks(alert, playbooks)

    let triggered = 0
    for (const pb of matched) {
      try {
        await this.executePlaybook(pb, alert, 'auto')
        triggered++
      } catch (err) {
        log.error({ err, playbookId: pb.id, alertId: alert.id }, 'Auto-trigger failed')
      }
    }

    if (triggered > 0) {
      log.info({ triggered, alertId: alert.id, tenantId: alert.tenantId },
        `${triggered} playbooks auto-triggered`)
    }

    return triggered
  }

  // ── Audit log helper ──────────────────────────

  private writeAuditEntry(
    tenantId: string, executionId: string,
    playbookId: string, actorId: string, status: PlaybookExecutionStatus,
  ): void {
    // Fire and forget
    import('@zonforge/db-client').then(({ getDb: db, schema: s }) => {
      db().insert(s.auditLogs).values({
        id:           uuid(),
        tenantId,
        actorId:      actorId === 'auto' ? null : actorId,
        action:       'playbook.executed' as any,
        resourceType: 'playbook_execution',
        resourceId:   executionId,
        changes:      { playbookId, status },
        metadata:     {},
        previousHash: null,
        hash:         uuid(),   // simplified — real chain in audit-export service
        createdAt:    new Date(),
      }).catch(() => {})
    }).catch(() => {})
  }
}
