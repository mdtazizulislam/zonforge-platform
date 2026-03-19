import { signHmac } from '@zonforge/auth-utils'
import { encryptionConfig } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import type { AlertPriority, Severity } from '@zonforge/shared-types'

const log = createLogger({ service: 'alert-service:dispatchers' })

// ─────────────────────────────────────────────
// NOTIFICATION PAYLOAD (shared across channels)
// ─────────────────────────────────────────────

export interface NotificationPayload {
  alertId:       string
  tenantId:      string
  title:         string
  description:   string
  severity:      Severity
  priority:      AlertPriority
  mitreTactics:  string[]
  mitreTechniques: string[]
  recommendedActions: string[]
  affectedEntity?: string
  detectionGapMinutes?: number | null
  dashboardUrl:  string
  createdAt:     string
}

// ─────────────────────────────────────────────
// EMAIL DISPATCHER (SendGrid)
// ─────────────────────────────────────────────

export class EmailDispatcher {
  constructor(
    private readonly apiKey:    string | undefined,
    private readonly fromEmail: string,
  ) {}

  async send(
    toEmail:  string,
    payload:  NotificationPayload,
  ): Promise<boolean> {
    if (!this.apiKey) {
      log.warn('SendGrid API key not configured — email notification skipped')
      return false
    }

    const severityColor = this.getSeverityColor(payload.severity)
    const emoji         = this.getSeverityEmoji(payload.severity)

    const html = this.buildEmailHtml(payload, severityColor, emoji)
    const text = this.buildEmailText(payload, emoji)

    try {
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to:      [{ email: toEmail }],
            subject: `${emoji} [${payload.priority}] ${payload.title}`,
          }],
          from:     { email: this.fromEmail, name: 'ZonForge Sentinel' },
          content:  [
            { type: 'text/plain', value: text },
            { type: 'text/html',  value: html },
          ],
          tracking_settings: {
            click_tracking:  { enable: false },
            open_tracking:   { enable: false },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      })

      if (!resp.ok) {
        log.error({ status: resp.status, email: toEmail }, 'SendGrid delivery failed')
        return false
      }

      log.info({ email: toEmail, alertId: payload.alertId }, 'Email notification sent')
      return true

    } catch (err) {
      log.error({ err, email: toEmail }, 'Email dispatch error')
      return false
    }
  }

  private buildEmailHtml(
    p:     NotificationPayload,
    color: string,
    emoji: string,
  ): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>ZonForge Alert</title></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">

    <!-- Header -->
    <div style="background:${color};padding:20px 24px;">
      <div style="color:#fff;font-size:14px;font-weight:600;opacity:0.9;">ZonForge Sentinel</div>
      <div style="color:#fff;font-size:22px;font-weight:700;margin-top:4px;">${emoji} ${p.priority} Alert</div>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <h2 style="color:#111827;font-size:18px;margin:0 0 12px;">${this.escHtml(p.title)}</h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">${this.escHtml(p.description)}</p>

      <!-- Details -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:140px;">Severity</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;font-weight:600;">${p.severity.toUpperCase()}</td></tr>
        ${p.affectedEntity ? `<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Affected</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${this.escHtml(p.affectedEntity)}</td></tr>` : ''}
        ${p.mitreTechniques.length > 0 ? `<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;">MITRE</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${p.mitreTechniques.slice(0, 3).join(', ')}</td></tr>` : ''}
        ${p.detectionGapMinutes ? `<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;">MTTD</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${p.detectionGapMinutes} minutes</td></tr>` : ''}
      </table>

      <!-- Recommended Actions -->
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;margin-bottom:16px;border-radius:0 4px 4px 0;">
        <div style="font-size:13px;font-weight:600;color:#1e40af;margin-bottom:8px;">Recommended Actions</div>
        <ol style="margin:0;padding-left:20px;color:#374151;font-size:13px;line-height:1.8;">
          ${p.recommendedActions.slice(0, 5).map(a => `<li>${this.escHtml(a)}</li>`).join('')}
        </ol>
      </div>

      <!-- CTA -->
      <a href="${p.dashboardUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
        Investigate in Dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      ZonForge Sentinel | Alert ID: ${p.alertId} | ${new Date(p.createdAt).toUTCString()}
    </div>
  </div>
</body>
</html>`
  }

  private buildEmailText(p: NotificationPayload, emoji: string): string {
    return [
      `${emoji} [${p.priority}] ZonForge Sentinel Alert`,
      ``,
      `Title:    ${p.title}`,
      `Severity: ${p.severity.toUpperCase()}`,
      `Priority: ${p.priority}`,
      p.affectedEntity ? `Affected: ${p.affectedEntity}` : '',
      ``,
      p.description,
      ``,
      `Recommended Actions:`,
      ...p.recommendedActions.slice(0, 5).map((a, i) => `${i + 1}. ${a}`),
      ``,
      `Investigate: ${p.dashboardUrl}`,
      ``,
      `Alert ID: ${p.alertId}`,
    ].filter(l => l !== undefined).join('\n')
  }

  private getSeverityColor(sev: string): string {
    const map: Record<string, string> = {
      critical: '#DC2626', high: '#EA580C',
      medium:   '#D97706', low:  '#2563EB', info: '#6B7280',
    }
    return map[sev] ?? '#6B7280'
  }

  private getSeverityEmoji(sev: string): string {
    const map: Record<string, string> = {
      critical: '🚨', high: '🔴', medium: '🟠', low: '🟡', info: 'ℹ️',
    }
    return map[sev] ?? '⚠️'
  }

  private escHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}

// ─────────────────────────────────────────────
// SLACK DISPATCHER
// ─────────────────────────────────────────────

export class SlackDispatcher {
  async send(
    webhookUrl: string,
    payload:    NotificationPayload,
  ): Promise<boolean> {
    const severityColor = this.getSeverityHex(payload.severity)
    const emoji         = this.getSeverityEmoji(payload.severity)

    const body = {
      text:        `${emoji} *[${payload.priority}] ${payload.title}*`,
      attachments: [{
        color:  severityColor,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${emoji} ${payload.priority} | ${payload.severity.toUpperCase()}*\n${payload.title}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: payload.description.slice(0, 300),
            },
          },
          ...(payload.mitreTechniques.length > 0 ? [{
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*MITRE Techniques*\n${payload.mitreTechniques.slice(0, 3).join(', ')}` },
              ...(payload.detectionGapMinutes
                ? [{ type: 'mrkdwn', text: `*MTTD*\n${payload.detectionGapMinutes} minutes` }]
                : []),
            ],
          }] : []),
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Top Action:* ${payload.recommendedActions[0] ?? 'Review in dashboard'}`,
            },
          },
          {
            type: 'actions',
            elements: [{
              type:  'button',
              text:  { type: 'plain_text', text: '🔍 Investigate' },
              style: 'primary',
              url:   payload.dashboardUrl,
            }],
          },
          {
            type: 'context',
            elements: [{
              type: 'mrkdwn',
              text: `Alert ID: \`${payload.alertId}\` | ${new Date(payload.createdAt).toUTCString()}`,
            }],
          },
        ],
      }],
    }

    try {
      const resp = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10_000),
      })

      if (!resp.ok) {
        log.error({ status: resp.status }, 'Slack delivery failed')
        return false
      }

      log.info({ alertId: payload.alertId }, 'Slack notification sent')
      return true

    } catch (err) {
      log.error({ err }, 'Slack dispatch error')
      return false
    }
  }

  private getSeverityHex(sev: string): string {
    const map: Record<string, string> = {
      critical: '#DC2626', high: '#EA580C',
      medium: '#F59E0B', low: '#3B82F6', info: '#6B7280',
    }
    return map[sev] ?? '#6B7280'
  }

  private getSeverityEmoji(sev: string): string {
    const map: Record<string, string> = {
      critical: '🚨', high: '🔴', medium: '🟠', low: '🟡', info: 'ℹ️',
    }
    return map[sev] ?? '⚠️'
  }
}

// ─────────────────────────────────────────────
// WEBHOOK DISPATCHER (HMAC-signed outbound)
// ─────────────────────────────────────────────

export class WebhookDispatcher {
  async send(
    webhookUrl: string,
    payload:    NotificationPayload,
    secret:     string,
  ): Promise<boolean> {
    const bodyStr   = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = signHmac(
      `${timestamp}.${bodyStr}`,
      { secret },
    )

    try {
      const resp = await fetch(webhookUrl, {
        method:  'POST',
        headers: {
          'Content-Type':         'application/json',
          'X-ZonForge-Signature': `t=${timestamp},v1=${signature}`,
          'X-ZonForge-Event':     'alert.created',
          'X-Alert-Id':           payload.alertId,
        },
        body:   bodyStr,
        signal: AbortSignal.timeout(15_000),
      })

      if (!resp.ok) {
        log.error({ status: resp.status, url: webhookUrl }, 'Webhook delivery failed')
        return false
      }

      log.info({ alertId: payload.alertId, url: webhookUrl }, 'Webhook notification sent')
      return true

    } catch (err) {
      log.error({ err, url: webhookUrl }, 'Webhook dispatch error')
      return false
    }
  }
}
