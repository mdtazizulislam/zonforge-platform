import { eq } from 'drizzle-orm'
import { Queue } from 'bullmq'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import { env } from '@zonforge/config'
import {
  EmailDispatcher,
  SlackDispatcher,
  WebhookDispatcher,
  type NotificationPayload,
} from '../dispatchers/notification.dispatchers.js'
import { QUEUE_NAMES } from '@zonforge/ingestion-service/queues'
import type { NarrativeJob } from '../workers/llm-narrative.worker.js'
import type { AlertPriority, Severity } from '@zonforge/shared-types'

const log = createLogger({ service: 'alert-service:notification-orchestrator' })

// Priorities that get LLM narratives automatically
const AUTO_NARRATIVE_PRIORITIES: AlertPriority[] = ['P1', 'P2']

// ─────────────────────────────────────────────
// NOTIFICATION ORCHESTRATOR
//
// For each new alert:
//  1. Load tenant notification settings
//  2. Build NotificationPayload
//  3. Dispatch to configured channels
//  4. Queue LLM narrative generation
//  5. Track delivery results
// ─────────────────────────────────────────────

export class NotificationOrchestrator {
  private readonly email:   EmailDispatcher
  private readonly slack:   SlackDispatcher
  private readonly webhook: WebhookDispatcher

  constructor(private readonly narrativeQueue: Queue) {
    this.email   = new EmailDispatcher(
      process.env['ZONFORGE_SENDGRID_API_KEY'],
      process.env['ZONFORGE_SENDGRID_FROM_EMAIL'] ?? 'alerts@zonforge.com',
    )
    this.slack   = new SlackDispatcher()
    this.webhook = new WebhookDispatcher()
  }

  // ── Dispatch notifications for a new alert ─

  async notify(alertId: string, tenantId: string): Promise<{
    email:   boolean
    slack:   boolean
    webhook: boolean
    narrative: boolean
  }> {
    const db = getDb()

    // Load alert
    const alerts = await db.select()
      .from(schema.alerts)
      .where(eq(schema.alerts.id, alertId))
      .limit(1)

    const alert = alerts[0]
    if (!alert) return { email: false, slack: false, webhook: false, narrative: false }

    // Load tenant settings
    const tenants = await db.select({ settings: schema.tenants.settings })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)

    const settings = tenants[0]?.settings as Record<string, unknown> ?? {}

    const dashboardUrl = `${env.ZONFORGE_API_URL}/alerts/${alertId}`

    const affectedEntity = alert.affectedUserId
      ? `user:${alert.affectedUserId.slice(0, 8)}...`
      : alert.affectedIp
        ? `ip:${alert.affectedIp}`
        : undefined

    const payload: NotificationPayload = {
      alertId,
      tenantId,
      title:         alert.title,
      description:   alert.description,
      severity:      alert.severity as Severity,
      priority:      alert.priority as AlertPriority,
      mitreTactics:  (alert.mitreTactics as string[])   ?? [],
      mitreTechniques: (alert.mitreTechniques as string[]) ?? [],
      recommendedActions: (alert.recommendedActions as string[]) ?? [],
      dashboardUrl,
      createdAt:     alert.createdAt.toISOString(),
      ...(affectedEntity !== undefined ? { affectedEntity } : {}),
    }
    if (alert.detectionGapMinutes !== undefined) {
      payload.detectionGapMinutes = alert.detectionGapMinutes
    }

    const results = { email: false, slack: false, webhook: false, narrative: false }

    // ── Email ──────────────────────────────────

    const notificationEmail = settings['notificationEmail'] as string | undefined
    if (notificationEmail) {
      results.email = await this.email.send(notificationEmail, payload)
    }

    // ── Slack ──────────────────────────────────

    const slackWebhook = settings['notificationSlackWebhook'] as string | undefined
    if (slackWebhook) {
      results.slack = await this.slack.send(slackWebhook, payload)
    }

    // ── Webhook ────────────────────────────────

    const outboundWebhook = settings['notificationWebhook'] as string | undefined
    if (outboundWebhook) {
      const secret  = process.env['ZONFORGE_HMAC_SECRET'] ?? ''
      results.webhook = await this.webhook.send(outboundWebhook, payload, secret)
    }

    // ── LLM Narrative (P1 + P2 auto-generate) ─

    if (AUTO_NARRATIVE_PRIORITIES.includes(alert.priority as AlertPriority)) {
      const evidence = (alert.evidence as Array<{ eventId: string }>) ?? []

      const narrativeJob: NarrativeJob = {
        alertId,
        tenantId,
        alertTitle:      alert.title,
        severity:        alert.severity as Severity,
        priority:        alert.priority as AlertPriority,
        entityType:      alert.affectedUserId ? 'user' : 'asset',
        entityId:        alert.affectedUserId ?? alert.affectedIp ?? 'unknown',
        mitreTactics:    (alert.mitreTactics as string[])   ?? [],
        mitreTechniques: (alert.mitreTechniques as string[]) ?? [],
        evidenceCount:   evidence.length,
        recommendedActions: (alert.recommendedActions as string[]) ?? [],
        metadata:        {},
      }

      await this.narrativeQueue.add(`narrative:${alertId}`, narrativeJob, {
        priority:  alert.priority === 'P1' ? 1 : 2,
        delay:     0,
        attempts:  2,
      })
      results.narrative = true
    }

    log.info({
      alertId,
      priority: alert.priority,
      channels: Object.entries(results)
        .filter(([, v]) => v)
        .map(([k]) => k),
    }, 'Alert notifications dispatched')

    return results
  }
}
