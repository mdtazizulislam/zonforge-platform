import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'compliance-reports:siem' })

// ─────────────────────────────────────────────
// SIEM FORWARDER SERVICE
//
// Forwards ZonForge alerts/events to external SIEMs:
//   1. Splunk HTTP Event Collector (HEC)
//   2. Microsoft Sentinel (Log Analytics workspace)
//
// Both forward:
//   - Alerts (on creation / status change)
//   - Detection signals
//   - High-risk score changes
//   - Playbook execution results
// ─────────────────────────────────────────────

export interface SiemConfig {
  provider:   'splunk' | 'sentinel' | 'generic_syslog'
  enabled:    boolean
  // Splunk
  splunkHecUrl?:   string
  splunkHecToken?: string
  splunkIndex?:    string
  splunkSource?:   string
  // Sentinel
  sentinelWorkspaceId?:    string
  sentinelSharedKey?:      string
  sentinelLogType?:        string
  // Generic
  webhookUrl?:    string
  webhookHeaders?: Record<string, string>
}

export interface SiemEvent {
  eventType: 'alert' | 'signal' | 'risk_change' | 'playbook_execution'
  tenantId:  string
  timestamp: Date
  data:      Record<string, unknown>
}

// ─────────────────────────────────────────────
// SPLUNK HEC FORWARDER
// ─────────────────────────────────────────────

export async function forwardToSplunk(
  config: SiemConfig,
  events: SiemEvent[],
): Promise<{ forwarded: number; failed: number }> {
  if (!config.splunkHecUrl || !config.splunkHecToken) {
    return { forwarded: 0, failed: events.length }
  }

  let forwarded = 0
  let failed    = 0

  // Batch into chunks of 100
  const chunks = chunkArray(events, 100)

  for (const chunk of chunks) {
    const body = chunk.map(e => JSON.stringify({
      time:       Math.floor(e.timestamp.getTime() / 1000),
      host:       'zonforge-sentinel',
      source:     config.splunkSource ?? 'zonforge',
      sourcetype: `zonforge:${e.eventType}`,
      index:      config.splunkIndex ?? 'security',
      event:      {
        ...e.data,
        eventType: e.eventType,
        tenantId:  e.tenantId,
        _time:     e.timestamp.toISOString(),
      },
    })).join('\n')

    try {
      const resp = await fetch(config.splunkHecUrl, {
        method: 'POST',
        headers: {
          Authorization:  `Splunk ${config.splunkHecToken}`,
          'Content-Type': 'application/json',
          'X-Splunk-Request-Channel': crypto.randomUUID(),
        },
        body,
        signal: AbortSignal.timeout(15_000),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        log.error({ status: resp.status, errText }, 'Splunk HEC forwarding failed')
        failed += chunk.length
      } else {
        forwarded += chunk.length
        log.debug({ count: chunk.length }, 'Events forwarded to Splunk')
      }
    } catch (err) {
      log.error({ err }, 'Splunk HEC network error')
      failed += chunk.length
    }
  }

  return { forwarded, failed }
}

// ─────────────────────────────────────────────
// MICROSOFT SENTINEL FORWARDER
//
// Uses Log Analytics Data Collector API
// Docs: https://learn.microsoft.com/azure/azure-monitor/logs/data-collector-api
// ─────────────────────────────────────────────

export async function forwardToSentinel(
  config: SiemConfig,
  events: SiemEvent[],
): Promise<{ forwarded: number; failed: number }> {
  if (!config.sentinelWorkspaceId || !config.sentinelSharedKey) {
    return { forwarded: 0, failed: events.length }
  }

  const logType = config.sentinelLogType ?? 'ZonForgeSentinel'
  let forwarded = 0
  let failed    = 0

  // Sentinel accepts up to 30MB per request
  const chunks = chunkArray(events, 200)

  for (const chunk of chunks) {
    const body = JSON.stringify(chunk.map(e => ({
      TimeGenerated:    e.timestamp.toISOString(),
      EventType:        e.eventType,
      TenantId_s:       e.tenantId,
      Severity_s:       (e.data.severity as string) ?? 'info',
      Title_s:          (e.data.title  as string)  ?? e.eventType,
      Priority_s:       (e.data.priority as string) ?? '',
      Status_s:         (e.data.status  as string) ?? '',
      AffectedUser_s:   (e.data.affectedUserId as string) ?? '',
      SourceIp_s:       (e.data.affectedIp    as string) ?? '',
      MitreTechniques_s: JSON.stringify(e.data.mitreTechniques ?? []),
      AlertId_g:        (e.data.id as string) ?? '',
      RawData_s:        JSON.stringify(e.data),
    })))

    const date        = new Date().toUTCString()
    const contentLen  = Buffer.byteLength(body, 'utf8')
    const signature   = await buildSentinelSignature(
      config.sentinelSharedKey, date, contentLen, logType,
    )

    try {
      const resp = await fetch(
        `https://${config.sentinelWorkspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`,
        {
          method: 'POST',
          headers: {
            'Content-Type':   'application/json',
            'Log-Type':        logType,
            'Authorization':   signature,
            'x-ms-date':       date,
            'time-generated-field': 'TimeGenerated',
          },
          body,
          signal: AbortSignal.timeout(30_000),
        },
      )

      if (resp.status === 200) {
        forwarded += chunk.length
        log.debug({ count: chunk.length }, 'Events forwarded to Microsoft Sentinel')
      } else {
        const errText = await resp.text()
        log.error({ status: resp.status, errText }, 'Sentinel forwarding failed')
        failed += chunk.length
      }
    } catch (err) {
      log.error({ err }, 'Sentinel network error')
      failed += chunk.length
    }
  }

  return { forwarded, failed }
}

// ─────────────────────────────────────────────
// GENERIC WEBHOOK FORWARDER
// ─────────────────────────────────────────────

export async function forwardToWebhook(
  config: SiemConfig,
  events: SiemEvent[],
): Promise<{ forwarded: number; failed: number }> {
  if (!config.webhookUrl) return { forwarded: 0, failed: events.length }

  try {
    const resp = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.webhookHeaders },
      body:    JSON.stringify({ events, source: 'zonforge-sentinel' }),
      signal:  AbortSignal.timeout(15_000),
    })
    return resp.ok
      ? { forwarded: events.length, failed: 0 }
      : { forwarded: 0, failed: events.length }
  } catch {
    return { forwarded: 0, failed: events.length }
  }
}

// ─────────────────────────────────────────────
// MAIN DISPATCH
// ─────────────────────────────────────────────

export async function forwardEvents(
  config: SiemConfig,
  events: SiemEvent[],
): Promise<{ forwarded: number; failed: number }> {
  if (!config.enabled || events.length === 0) return { forwarded: 0, failed: 0 }

  switch (config.provider) {
    case 'splunk':        return forwardToSplunk(config, events)
    case 'sentinel':      return forwardToSentinel(config, events)
    case 'generic_syslog': return forwardToWebhook(config, events)
    default:
      log.warn({ provider: config.provider }, 'Unknown SIEM provider')
      return { forwarded: 0, failed: events.length }
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function buildSentinelSignature(
  sharedKey:  string,
  date:       string,
  contentLen: number,
  logType:    string,
): Promise<string> {
  const { createHmac } = await import('crypto')

  const stringToSign = `POST\n${contentLen}\napplication/json\nx-ms-date:${date}\n/api/logs`
  const key    = Buffer.from(sharedKey, 'base64')
  const hmac   = createHmac('sha256', key)
  hmac.update(stringToSign)
  const sig    = hmac.digest('base64')

  return `SharedKey ${sharedKey.split('/')[0]}:${sig}`
}
