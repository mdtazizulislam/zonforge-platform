import { google, type admin_reports_v1 } from 'googleapis'
import {
  BaseCollector,
  type CollectorConfig,
  type CollectorResult,
  type CursorState,
  sleep,
} from '@zonforge/collector-base'
import { createLogger } from '@zonforge/logger'

// ─────────────────────────────────────────────
// Google Workspace Reports API Collector
//
// Uses service account + domain-wide delegation
// Required OAuth scopes:
//   - https://www.googleapis.com/auth/admin.reports.audit.readonly
//   - https://www.googleapis.com/auth/admin.reports.usage.readonly
//
// Poll cycle: login + admin + drive + token apps
// ─────────────────────────────────────────────

const log = createLogger({ service: 'collector:google-workspace' })

export interface GoogleWorkspaceAuthConfig {
  serviceAccountKeyJson: string   // JSON string of service account key
  delegatedEmail:        string   // Super-admin to impersonate
  customerId:            string   // Google Workspace customer ID
}

// Applications to poll from Reports API
const REPORT_APPLICATIONS = [
  'login',
  'admin',
  'drive',
  'token',
  'groups',
  'groups_enterprise',
  'mobile',
] as const

type ReportApp = typeof REPORT_APPLICATIONS[number]

interface GoogleCursorState extends CursorState {
  pageTokens: Partial<Record<ReportApp, string>>
}

export class GoogleWorkspaceCollector extends BaseCollector {
  private readonly auth:     GoogleWorkspaceAuthConfig
  private gCursor: GoogleCursorState

  constructor(
    collectorConfig: CollectorConfig,
    authConfig:      GoogleWorkspaceAuthConfig,
  ) {
    super(collectorConfig)
    this.auth    = authConfig
    this.gCursor = {
      lastProcessedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      pageTokens:      {},
    }
  }

  // ── Build authenticated admin client ───────

  private buildAdminClient(): admin_reports_v1.Admin {
    const keyData = JSON.parse(this.auth.serviceAccountKeyJson) as {
      client_email: string
      private_key:  string
    }

    const jwtAuth = new google.auth.JWT({
      email:   keyData.client_email,
      key:     keyData.private_key,
      scopes:  [
        'https://www.googleapis.com/auth/admin.reports.audit.readonly',
        'https://www.googleapis.com/auth/admin.reports.usage.readonly',
      ],
      subject: this.auth.delegatedEmail,
    })

    return google.admin({ version: 'reports_v1', auth: jwtAuth })
  }

  // ── Fetch events for one application ──────

  private async fetchAppEvents(
    admin:   admin_reports_v1.Admin,
    app:     ReportApp,
    since:   Date,
    until:   Date,
  ): Promise<Array<Record<string, unknown>>> {
    const events: Array<Record<string, unknown>> = []
    let   pageToken: string | undefined = this.gCursor.pageTokens[app]

    const startTime = since.toISOString()
    const endTime   = until.toISOString()

    do {
      try {
        const params: admin_reports_v1.Params$Resource$Activities$List = {
          userKey:         'all',
          applicationName: app,
          startTime,
          endTime,
          maxResults:      1000,
          customerId:      this.auth.customerId,
          ...(pageToken ? { pageToken } : {}),
        }

        const resp = await admin.activities.list(params)

        const items = resp.data.items ?? []
        for (const item of items) {
          // Flatten: one event per item.events[] entry
          for (const event of item.events ?? []) {
            events.push({
              ...item,
              events:     [event],      // single event per record
              _app:       app,
              _eventName: event.name,
              _eventType: event.type,
            })
          }
        }

        pageToken = resp.data.nextPageToken ?? undefined

        // Rate limit: 2 req/second per app
        if (pageToken) await sleep(500)

      } catch (err: any) {
        // 403: likely insufficient permissions for this app
        if (err?.code === 403) {
          log.warn({ app, code: err.code }, `No access to ${app} reports — may require admin role`)
          break
        }
        // 429: quota exceeded
        if (err?.code === 429) {
          log.warn({ app }, 'Google Reports API quota exceeded — backing off 60s')
          await sleep(60_000)
          continue   // retry
        }
        throw err
      }
    } while (pageToken)

    // Save page token for next poll (resume pagination)
    delete this.gCursor.pageTokens[app]   // clear after full page exhausted

    return events
  }

  // ── Main collect ───────────────────────────

  protected async collect(): Promise<CollectorResult> {
    const admin  = this.buildAdminClient()
    const since  = new Date(this.gCursor.lastProcessedAt)
    const until  = new Date()
    const errors: string[] = []
    let   total  = 0

    for (const app of REPORT_APPLICATIONS) {
      try {
        const events = await this.fetchAppEvents(admin, app, since, until)

        if (events.length > 0) {
          const result = await this.submitBatches(events)
          total += result.totalAccepted
          log.debug({ app, count: events.length }, `${app} events submitted`)
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : `${app} fetch failed`
        errors.push(`${app}: ${msg}`)
        log.error({ err, app }, `Failed to fetch ${app} events`)
      }

      // Rate limit between applications
      await sleep(300)
    }

    // ── User usage reports (once per day) ─────

    const lastHours = (Date.now() - since.getTime()) / 3_600_000
    if (lastHours >= 23) {
      try {
        const yesterday = new Date(until)
        yesterday.setUTCDate(yesterday.getUTCDate() - 1)
        const dateStr = yesterday.toISOString().slice(0, 10)

        const usageResp = await admin.userUsageReport.get({
          userKey:    'all',
          date:       dateStr,
          maxResults: 500,
          customerId: this.auth.customerId,
        })

        const usageEvents = (usageResp.data.usageReports ?? []).map(r => ({
          ...r,
          _app:       'user_usage',
          _eventType: 'usage_report',
        }))

        if (usageEvents.length > 0) {
          await this.submitBatches(usageEvents)
          log.debug({ count: usageEvents.length, date: dateStr }, 'User usage reports submitted')
        }

      } catch (err) {
        log.warn({ err }, 'User usage report unavailable')
      }
    }

    // ── Update cursor ──────────────────────────

    const newCursor: GoogleCursorState = {
      lastProcessedAt: until.toISOString(),
      pageTokens:      this.gCursor.pageTokens,
    }

    return {
      eventsCollected: total,
      batchesSent:     Math.ceil(total / this.config.batchSize),
      errors,
      cursorState:     newCursor,
    }
  }

  protected override async saveCursorState(state: CursorState): Promise<void> {
    this.gCursor     = state as GoogleCursorState
    this.cursorState = state
  }
}

// ── Entry point ───────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Required env var missing: ${name}`)
  return v
}

async function start() {
  const collectorConfig: CollectorConfig = {
    tenantId:        requireEnv('ZF_TENANT_ID'),
    connectorId:     requireEnv('ZF_CONNECTOR_ID'),
    sourceType:      'google_workspace',
    pollIntervalMs:  parseInt(process.env['ZF_POLL_INTERVAL_MS'] ?? '300000', 10),
    batchSize:       parseInt(process.env['ZF_BATCH_SIZE'] ?? '500', 10),
    ingestionApiUrl: requireEnv('ZF_INGESTION_API_URL'),
    apiKey:          requireEnv('ZF_API_KEY'),
    hmacSecret:      requireEnv('ZF_HMAC_SECRET'),
  }

  const authConfig: GoogleWorkspaceAuthConfig = {
    serviceAccountKeyJson: requireEnv('ZF_GOOGLE_SERVICE_ACCOUNT_KEY'),
    delegatedEmail:        requireEnv('ZF_GOOGLE_DELEGATED_EMAIL'),
    customerId:            requireEnv('ZF_GOOGLE_CUSTOMER_ID'),
  }

  const collector = new GoogleWorkspaceCollector(collectorConfig, authConfig)

  log.info({
    tenantId:       collectorConfig.tenantId,
    connectorId:    collectorConfig.connectorId,
    delegatedEmail: authConfig.delegatedEmail,
    apps:           REPORT_APPLICATIONS,
  }, '🚀 Starting Google Workspace collector')

  await collector.start()

  const shutdown = async (sig: string) => {
    log.info({ sig }, 'Shutting down Google Workspace collector...')
    await collector.stop()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Google Workspace collector failed to start')
  process.exit(1)
})
