import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'playbook-engine:executors' })

// ─────────────────────────────────────────────
// BASE TYPES
// ─────────────────────────────────────────────

export interface ActionContext {
  tenantId:       string
  alertId:        string
  executionId:    string
  affectedUserId?: string | null
  affectedIp?:    string | null
  affectedEmail?: string | null
  metadata:       Record<string, unknown>
}

export interface ActionResult {
  success:   boolean
  message:   string
  detail?:   Record<string, unknown>
  error?:    string
}

export interface ActionConfig {
  [key: string]: unknown
}

// ─────────────────────────────────────────────
// 1. DOCUMENT ONLY (safe mode — always succeeds)
// ─────────────────────────────────────────────

export async function executeDocumentOnly(
  _config: ActionConfig,
  ctx:     ActionContext,
): Promise<ActionResult> {
  return {
    success: true,
    message: `Playbook executed in document-only mode for alert ${ctx.alertId}`,
    detail: { mode: 'document_only', alertId: ctx.alertId },
  }
}

// ─────────────────────────────────────────────
// 2. DISABLE USER — Microsoft 365 / Entra ID
// ─────────────────────────────────────────────

export async function executeDisableUserM365(
  config: ActionConfig & { tenantDomain?: string },
  ctx:    ActionContext,
): Promise<ActionResult> {
  const userId = ctx.affectedUserId ?? ctx.affectedEmail
  if (!userId) {
    return { success: false, message: 'No user ID available for M365 disable action', error: 'MISSING_USER_ID' }
  }

  // Graph API credentials from connector config / secrets
  const clientId     = process.env['ZF_M365_CLIENT_ID']
  const clientSecret = process.env['ZF_M365_CLIENT_SECRET']
  const tenantDomain = config.tenantDomain as string ?? process.env['ZF_M365_TENANT_DOMAIN']

  if (!clientId || !clientSecret || !tenantDomain) {
    return { success: false, message: 'M365 credentials not configured', error: 'MISSING_CREDENTIALS' }
  }

  try {
    // 1. Get access token
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${tenantDomain}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     clientId,
          client_secret: clientSecret,
          scope:         'https://graph.microsoft.com/.default',
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    const tokenData = await tokenResp.json() as { access_token?: string }
    if (!tokenData.access_token) throw new Error('Failed to obtain access token')

    // 2. Disable account
    const patchResp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountEnabled: false }),
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!patchResp.ok) {
      const err = await patchResp.text()
      throw new Error(`Graph API error ${patchResp.status}: ${err}`)
    }

    // 3. Revoke all refresh tokens
    await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/revokeSignInSessions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(10_000),
      },
    )

    log.info({ userId, tenantId: ctx.tenantId }, 'M365 user disabled and sessions revoked')
    return {
      success: true,
      message: `User ${userId} disabled in Microsoft 365. All sessions revoked.`,
      detail: { userId, action: 'account_disabled', sessionsRevoked: true },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    log.error({ err, userId }, 'M365 user disable failed')
    return { success: false, message: `M365 disable failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// 3. DISABLE USER — Google Workspace
// ─────────────────────────────────────────────

export async function executeDisableUserGoogle(
  config: ActionConfig & { delegatedEmail?: string; customerId?: string },
  ctx:    ActionContext,
): Promise<ActionResult> {
  const userEmail = ctx.affectedEmail ?? ctx.affectedUserId
  if (!userEmail) {
    return { success: false, message: 'No email available for Google Workspace disable', error: 'MISSING_EMAIL' }
  }

  const serviceAccountKey = process.env['ZF_GOOGLE_SERVICE_ACCOUNT_KEY']
  const delegatedEmail    = config.delegatedEmail as string ?? process.env['ZF_GOOGLE_DELEGATED_EMAIL']

  if (!serviceAccountKey || !delegatedEmail) {
    return { success: false, message: 'Google Workspace credentials not configured', error: 'MISSING_CREDENTIALS' }
  }

  try {
    // Dynamic import googleapis
    const { google } = await import('googleapis')
    const keyData    = JSON.parse(serviceAccountKey) as { client_email: string; private_key: string }

    const auth = new google.auth.JWT({
      email:   keyData.client_email,
      key:     keyData.private_key,
      scopes:  ['https://www.googleapis.com/auth/admin.directory.user'],
      subject: delegatedEmail,
    })

    const admin = google.admin({ version: 'directory_v1', auth })

    await admin.users.update({
      userKey: userEmail,
      requestBody: { suspended: true },
    })

    log.info({ userEmail, tenantId: ctx.tenantId }, 'Google Workspace user suspended')
    return {
      success: true,
      message: `User ${userEmail} suspended in Google Workspace.`,
      detail: { userEmail, suspended: true },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message: `Google Workspace suspend failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// 4. BLOCK IP — Cloudflare WAF
// ─────────────────────────────────────────────

export async function executeBlockIpCloudflare(
  config: ActionConfig & { zoneId?: string; notes?: string },
  ctx:    ActionContext,
): Promise<ActionResult> {
  const ip = ctx.affectedIp
  if (!ip) {
    return { success: false, message: 'No IP address available to block', error: 'MISSING_IP' }
  }

  const apiToken = process.env['ZF_CLOUDFLARE_API_TOKEN']
  const zoneId   = config.zoneId as string ?? process.env['ZF_CLOUDFLARE_ZONE_ID']

  if (!apiToken || !zoneId) {
    return { success: false, message: 'Cloudflare credentials not configured', error: 'MISSING_CREDENTIALS' }
  }

  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/firewall/access_rules/rules`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode:          'block',
          configuration: { target: 'ip', value: ip },
          notes:         config.notes ?? `ZonForge Sentinel — blocked via playbook (alert: ${ctx.alertId})`,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )

    const data = await resp.json() as { success: boolean; result?: { id: string } }
    if (!data.success) throw new Error(`Cloudflare API returned success=false`)

    log.info({ ip, zoneId, ruleId: data.result?.id, tenantId: ctx.tenantId }, 'IP blocked via Cloudflare WAF')
    return {
      success: true,
      message: `IP ${ip} blocked at Cloudflare WAF (rule: ${data.result?.id})`,
      detail: { ip, ruleId: data.result?.id, provider: 'cloudflare' },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message: `Cloudflare block failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// 5. BLOCK IP — AWS WAF
// ─────────────────────────────────────────────

export async function executeBlockIpAwsWaf(
  config: ActionConfig & { ipSetId?: string; ipSetName?: string; scope?: string },
  ctx:    ActionContext,
): Promise<ActionResult> {
  const ip = ctx.affectedIp
  if (!ip) {
    return { success: false, message: 'No IP available for AWS WAF block', error: 'MISSING_IP' }
  }

  const ipSetId   = config.ipSetId   as string ?? process.env['ZF_AWS_WAF_IP_SET_ID']
  const ipSetName = config.ipSetName as string ?? process.env['ZF_AWS_WAF_IP_SET_NAME']
  const scope     = config.scope     as string ?? 'REGIONAL'

  if (!ipSetId || !ipSetName) {
    return { success: false, message: 'AWS WAF IP set not configured', error: 'MISSING_CONFIG' }
  }

  try {
    const { WAFV2Client, GetIPSetCommand, UpdateIPSetCommand } = await import('@aws-sdk/client-wafv2')
    const client = new WAFV2Client({ region: process.env['AWS_REGION'] ?? 'us-east-1' })

    // Get current IP set
    const getResp = await client.send(new GetIPSetCommand({
      Id: ipSetId, Name: ipSetName, Scope: scope as any,
    }))

    const existing = getResp.IPSet?.Addresses ?? []
    const cidr     = ip.includes('/') ? ip : `${ip}/32`

    if (existing.includes(cidr)) {
      return { success: true, message: `IP ${ip} already in AWS WAF block list`, detail: { ip, alreadyBlocked: true } }
    }

    // Add IP
    await client.send(new UpdateIPSetCommand({
      Id:        ipSetId,
      Name:      ipSetName,
      Scope:     scope as any,
      Addresses: [...existing, cidr],
      LockToken: getResp.LockToken,
    }))

    log.info({ ip, ipSetId, tenantId: ctx.tenantId }, 'IP blocked via AWS WAF')
    return {
      success: true,
      message: `IP ${ip} added to AWS WAF block list`,
      detail: { ip, cidr, ipSetId, provider: 'aws_waf' },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message: `AWS WAF block failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// 6. CREATE JIRA TICKET
// ─────────────────────────────────────────────

export async function executeCreateJiraTicket(
  config: ActionConfig & {
    jiraUrl:     string
    projectKey:  string
    issueType?:  string
    priority?:   string
    assignee?:   string
    labels?:     string[]
  },
  ctx: ActionContext,
): Promise<ActionResult> {
  const { jiraUrl, projectKey } = config
  const apiToken = process.env['ZF_JIRA_API_TOKEN']
  const email    = process.env['ZF_JIRA_EMAIL']

  if (!jiraUrl || !projectKey || !apiToken || !email) {
    return { success: false, message: 'Jira credentials not configured', error: 'MISSING_CONFIG' }
  }

  const summary = `[ZonForge] Security Alert — ${ctx.alertId.slice(0, 8)}`
  const description = [
    `*Alert ID:* ${ctx.alertId}`,
    `*Tenant:* ${ctx.tenantId}`,
    ctx.affectedUserId ? `*Affected User:* ${ctx.affectedUserId}` : '',
    ctx.affectedIp     ? `*Source IP:* ${ctx.affectedIp}` : '',
    `\nThis ticket was automatically created by ZonForge Sentinel playbook execution.`,
    `Review the alert at: ${process.env['ZONFORGE_API_URL']}/alerts/${ctx.alertId}`,
  ].filter(Boolean).join('\n')

  try {
    const resp = await fetch(`${jiraUrl.replace(/\/$/, '')}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project:   { key: projectKey },
          summary,
          description: {
            type:    'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
          },
          issuetype: { name: (config.issueType as string) ?? 'Bug' },
          priority:  { name: (config.priority  as string) ?? 'High' },
          labels:    [(config.labels as string[]) ?? ['security', 'zonforge']].flat(),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })

    const data = await resp.json() as { key?: string; id?: string }
    if (!resp.ok) throw new Error(`Jira API error: ${resp.status}`)

    log.info({ ticketKey: data.key, tenantId: ctx.tenantId }, 'Jira ticket created')
    return {
      success: true,
      message: `Jira ticket created: ${data.key}`,
      detail: { ticketKey: data.key, ticketId: data.id, url: `${jiraUrl}/browse/${data.key}` },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message: `Jira ticket creation failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// 7. CREATE SERVICENOW INCIDENT
// ─────────────────────────────────────────────

export async function executeCreateServiceNowIncident(
  config: ActionConfig & { instanceUrl: string; urgency?: number; impact?: number },
  ctx:    ActionContext,
): Promise<ActionResult> {
  const { instanceUrl } = config
  const username = process.env['ZF_SERVICENOW_USER']
  const password = process.env['ZF_SERVICENOW_PASSWORD']

  if (!instanceUrl || !username || !password) {
    return { success: false, message: 'ServiceNow credentials not configured', error: 'MISSING_CONFIG' }
  }

  try {
    const resp = await fetch(
      `${instanceUrl.replace(/\/$/, '')}/api/now/table/incident`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        body: JSON.stringify({
          short_description: `[ZonForge] Security Alert ${ctx.alertId.slice(0, 8)}`,
          description:       `Alert ID: ${ctx.alertId}\nTenant: ${ctx.tenantId}\nAffected: ${ctx.affectedUserId ?? ctx.affectedIp ?? 'Unknown'}\n\nAuto-created by ZonForge Sentinel.`,
          urgency:           config.urgency ?? 1,
          impact:            config.impact  ?? 1,
          category:          'Security',
          subcategory:       'Threat Detection',
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )

    const data = await resp.json() as { result?: { number?: string; sys_id?: string } }
    if (!resp.ok) throw new Error(`ServiceNow API error: ${resp.status}`)

    return {
      success: true,
      message: `ServiceNow incident created: ${data.result?.number}`,
      detail: { incidentNumber: data.result?.number, sysId: data.result?.sys_id },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message: `ServiceNow incident creation failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// 8. NOTIFY PAGERDUTY
// ─────────────────────────────────────────────

export async function executeNotifyPagerDuty(
  config: ActionConfig & { routingKey?: string; severity?: string },
  ctx:    ActionContext,
): Promise<ActionResult> {
  const routingKey = (config.routingKey as string) ?? process.env['PAGERDUTY_INTEGRATION_KEY']
  if (!routingKey) {
    return { success: false, message: 'PagerDuty routing key not configured', error: 'MISSING_KEY' }
  }

  try {
    const resp = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key:  routingKey,
        event_action: 'trigger',
        dedup_key:    `zonforge-${ctx.alertId}`,
        payload: {
          summary:   `ZonForge Security Alert — ${ctx.alertId.slice(0, 8)}`,
          severity:  (config.severity as string) ?? 'critical',
          source:    'ZonForge Sentinel',
          component: `tenant-${ctx.tenantId.slice(0, 8)}`,
          custom_details: {
            alert_id:   ctx.alertId,
            tenant_id:  ctx.tenantId,
            user_id:    ctx.affectedUserId,
            source_ip:  ctx.affectedIp,
            dashboard:  `${process.env['ZONFORGE_API_URL']}/alerts/${ctx.alertId}`,
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })

    const data = await resp.json() as { status?: string; dedup_key?: string }
    if (data.status !== 'success') throw new Error(`PagerDuty status: ${data.status}`)

    return {
      success: true,
      message: 'PagerDuty incident triggered',
      detail: { dedupKey: data.dedup_key, status: data.status },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message: `PagerDuty notification failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// 9. REQUIRE MFA RE-AUTHENTICATION (M365)
// ─────────────────────────────────────────────

export async function executeRequireMfaReauth(
  config: ActionConfig & { tenantDomain?: string },
  ctx:    ActionContext,
): Promise<ActionResult> {
  const userId = ctx.affectedUserId ?? ctx.affectedEmail
  if (!userId) {
    return { success: false, message: 'No user ID for MFA re-auth action', error: 'MISSING_USER_ID' }
  }

  const clientId     = process.env['ZF_M365_CLIENT_ID']
  const clientSecret = process.env['ZF_M365_CLIENT_SECRET']
  const tenantDomain = (config.tenantDomain as string) ?? process.env['ZF_M365_TENANT_DOMAIN']

  if (!clientId || !clientSecret || !tenantDomain) {
    return { success: false, message: 'M365 credentials not configured', error: 'MISSING_CREDENTIALS' }
  }

  try {
    // Get token
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${tenantDomain}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId, client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    )
    const { access_token } = await tokenResp.json() as { access_token?: string }
    if (!access_token) throw new Error('Token acquisition failed')

    // Revoke sign-in sessions (forces MFA on next login)
    await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/revokeSignInSessions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(10_000),
      },
    )

    return {
      success: true,
      message: `MFA re-authentication required for ${userId}. All sessions revoked.`,
      detail: { userId, action: 'sessions_revoked', mfaRequired: true },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, message: `MFA re-auth failed: ${msg}`, error: msg }
  }
}

// ─────────────────────────────────────────────
// EXECUTOR REGISTRY
// ─────────────────────────────────────────────

export type ActionType =
  | 'document_only'
  | 'disable_user_m365'
  | 'disable_user_google'
  | 'block_ip_cloudflare'
  | 'block_ip_aws_waf'
  | 'create_jira_ticket'
  | 'create_servicenow_incident'
  | 'notify_pagerduty'
  | 'notify_email'
  | 'notify_slack'
  | 'notify_webhook'
  | 'notify_sms'
  | 'notify_whatsapp'
  | 'require_mfa_reauthentication'

export const ACTION_EXECUTORS: Record<
  ActionType,
  (config: ActionConfig, ctx: ActionContext) => Promise<ActionResult>
> = {
  document_only:               executeDocumentOnly,
  disable_user_m365:           executeDisableUserM365,
  disable_user_google:         executeDisableUserGoogle,
  block_ip_cloudflare:         executeBlockIpCloudflare,
  block_ip_aws_waf:            executeBlockIpAwsWaf,
  create_jira_ticket:          executeCreateJiraTicket,
  create_servicenow_incident:  executeCreateServiceNowIncident,
  notify_pagerduty:            executeNotifyPagerDuty,
  notify_sms:                  executeNotifySms,
  notify_whatsapp:             executeNotifyWhatsApp,
  require_mfa_reauthentication: executeRequireMfaReauth,
  // Notification actions (delegated to alert-service)
  notify_email:    async () => ({ success: true, message: 'Email delegated to alert-service' }),
  notify_slack:    async () => ({ success: true, message: 'Slack delegated to alert-service' }),
  notify_webhook:  async () => ({ success: true, message: 'Webhook delegated to alert-service' }),
}

// ─────────────────────────────────────────────────────────────────────
// 9. NOTIFY SMS — Twilio
//
// Sends an SMS to one or more phone numbers when a security alert fires.
// Supports template variables: {{alert.title}}, {{alert.user}}, {{alert.ip}}
//
// Required env vars:
//   TWILIO_ACCOUNT_SID   — from console.twilio.com
//   TWILIO_AUTH_TOKEN    — from console.twilio.com
//   TWILIO_FROM_NUMBER   — your Twilio phone number (+1XXXXXXXXXX)
//
// Optional config:
//   to: string | string[]  — recipient phone number(s)
//   message: string        — custom message template
// ─────────────────────────────────────────────────────────────────────

export async function executeNotifySms(
  config: ActionConfig & {
    to?:      string | string[]
    message?: string
  },
  ctx: ActionContext,
): Promise<ActionResult> {
  const accountSid  = process.env['TWILIO_ACCOUNT_SID']
  const authToken   = process.env['TWILIO_AUTH_TOKEN']
  const fromNumber  = process.env['TWILIO_FROM_NUMBER']
  const defaultTo   = process.env['TWILIO_DEFAULT_TO']   // fallback recipient

  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      message: 'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.',
      error: 'MISSING_TWILIO_CONFIG',
    }
  }

  // Resolve recipients — config → env fallback
  const rawTo = config.to ?? defaultTo
  if (!rawTo) {
    return {
      success: false,
      message: 'No SMS recipient configured. Set TWILIO_DEFAULT_TO or pass "to" in playbook config.',
      error: 'MISSING_RECIPIENT',
    }
  }

  const recipients = Array.isArray(rawTo) ? rawTo : [rawTo]

  // Build message body
  const defaultTemplate =
    '🚨 [ZonForge] {{priority}} Alert: {{title}}\n' +
    'User: {{user}}\nIP: {{ip}}\n' +
    'Time: {{time}}\n' +
    'Investigate: https://app.zonforge.com/alerts/{{alertId}}'

  const template = (config.message as string | undefined) ?? defaultTemplate

  const body = template
    .replace('{{priority}}',  (ctx.metadata['priority']  as string) ?? 'P2')
    .replace('{{title}}',     (ctx.metadata['title']     as string) ?? 'Security Alert')
    .replace('{{user}}',      ctx.affectedUserId ?? ctx.affectedEmail ?? 'unknown')
    .replace('{{ip}}',        ctx.affectedIp ?? 'N/A')
    .replace('{{time}}',      new Date().toISOString())
    .replace('{{alertId}}',   ctx.alertId)

  const results: { to: string; success: boolean; sid?: string; error?: string }[] = []

  for (const to of recipients) {
    try {
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
          body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
          signal: AbortSignal.timeout(10_000),
        },
      )

      const data = await resp.json() as { sid?: string; status?: string; error_message?: string }

      if (resp.ok && data.sid) {
        results.push({ to, success: true, sid: data.sid })
        log.info({ to, sid: data.sid, alertId: ctx.alertId }, '📱 SMS sent via Twilio')
      } else {
        results.push({ to, success: false, error: data.error_message ?? 'Send failed' })
        log.warn({ to, error: data.error_message, alertId: ctx.alertId }, '⚠️ SMS send failed')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      results.push({ to, success: false, error: msg })
      log.error({ to, err, alertId: ctx.alertId }, '❌ SMS executor error')
    }
  }

  const successCount = results.filter(r => r.success).length
  const allSuccess   = successCount === recipients.length

  return {
    success: allSuccess,
    message: allSuccess
      ? `SMS sent to ${successCount} recipient(s)`
      : `SMS partially failed: ${successCount}/${recipients.length} delivered`,
    detail: { results, alertId: ctx.alertId, recipientCount: recipients.length },
  }
}

// ─────────────────────────────────────────────────────────────────────
// 10. NOTIFY WHATSAPP — Twilio WhatsApp Business API
//
// Sends a WhatsApp message via Twilio WhatsApp sandbox or approved number.
// Same Twilio credentials as SMS — only the "from" number changes.
//
// Setup:
//   Sandbox (dev/test): from = 'whatsapp:+14155238886'
//   Production:         from = 'whatsapp:+<your approved number>'
//
// Required env vars:
//   TWILIO_ACCOUNT_SID        — same as SMS
//   TWILIO_AUTH_TOKEN         — same as SMS
//   TWILIO_WHATSAPP_FROM      — 'whatsapp:+14155238886' (sandbox) or approved number
//
// Optional config:
//   to: string | string[]      — recipient WhatsApp numbers (format: +8801XXXXXXXXX)
//   message: string            — custom message template
// ─────────────────────────────────────────────────────────────────────

export async function executeNotifyWhatsApp(
  config: ActionConfig & {
    to?:      string | string[]
    message?: string
  },
  ctx: ActionContext,
): Promise<ActionResult> {
  const accountSid  = process.env['TWILIO_ACCOUNT_SID']
  const authToken   = process.env['TWILIO_AUTH_TOKEN']
  const fromWA      = process.env['TWILIO_WHATSAPP_FROM'] ?? 'whatsapp:+14155238886'
  const defaultTo   = process.env['TWILIO_WHATSAPP_DEFAULT_TO']

  if (!accountSid || !authToken) {
    return {
      success: false,
      message: 'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.',
      error: 'MISSING_TWILIO_CONFIG',
    }
  }

  const rawTo = config.to ?? defaultTo
  if (!rawTo) {
    return {
      success: false,
      message: 'No WhatsApp recipient configured. Set TWILIO_WHATSAPP_DEFAULT_TO or pass "to" in config.',
      error: 'MISSING_RECIPIENT',
    }
  }

  // Normalize recipients — auto-prefix whatsapp: if needed
  const rawList   = Array.isArray(rawTo) ? rawTo : [rawTo]
  const recipients = rawList.map(n => n.startsWith('whatsapp:') ? n : `whatsapp:${n}`)

  // Rich WhatsApp template (supports emojis and multi-line)
  const priority    = (ctx.metadata['priority']  as string) ?? 'P2'
  const title       = (ctx.metadata['title']     as string) ?? 'Security Alert'
  const affectedUser = ctx.affectedUserId ?? ctx.affectedEmail ?? 'unknown'
  const sourceIp    = ctx.affectedIp ?? 'N/A'
  const alertUrl    = `https://app.zonforge.com/alerts/${ctx.alertId}`

  const priorityEmoji: Record<string, string> = {
    P0: '🔴', P1: '🔴', P2: '🟠', P3: '🟡', P4: '🟢',
  }
  const emoji = priorityEmoji[priority] ?? '🟠'

  const defaultTemplate =
    `${emoji} *ZonForge Sentinel — ${priority} Alert*\n\n` +
    `*Alert:* {{title}}\n` +
    `*Affected User:* {{user}}\n` +
    `*Source IP:* {{ip}}\n` +
    `*Time:* {{time}}\n\n` +
    `🔍 Investigate: {{url}}\n` +
    `⚡ Action required within SLA window.`

  const template = (config.message as string | undefined) ?? defaultTemplate

  const body = template
    .replace('{{title}}', title)
    .replace('{{user}}',  affectedUser)
    .replace('{{ip}}',    sourceIp)
    .replace('{{time}}',  new Date().toLocaleString('en-GB', { timeZone: 'UTC', hour12: false }))
    .replace('{{url}}',   alertUrl)
    .replace('{{priority}}', priority)

  const results: { to: string; success: boolean; sid?: string; error?: string }[] = []

  for (const to of recipients) {
    try {
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
          body: new URLSearchParams({ To: to, From: fromWA, Body: body }),
          signal: AbortSignal.timeout(10_000),
        },
      )

      const data = await resp.json() as { sid?: string; status?: string; error_message?: string }

      if (resp.ok && data.sid) {
        results.push({ to, success: true, sid: data.sid })
        log.info({ to, sid: data.sid, alertId: ctx.alertId }, '💬 WhatsApp message sent via Twilio')
      } else {
        results.push({ to, success: false, error: data.error_message ?? 'Send failed' })
        log.warn({ to, error: data.error_message, alertId: ctx.alertId }, '⚠️ WhatsApp send failed')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      results.push({ to, success: false, error: msg })
      log.error({ to, err, alertId: ctx.alertId }, '❌ WhatsApp executor error')
    }
  }

  const successCount = results.filter(r => r.success).length
  const allSuccess   = successCount === recipients.length

  return {
    success: allSuccess,
    message: allSuccess
      ? `WhatsApp sent to ${successCount} recipient(s)`
      : `WhatsApp partially failed: ${successCount}/${recipients.length} delivered`,
    detail: { results, alertId: ctx.alertId, recipientCount: recipients.length },
  }
}
