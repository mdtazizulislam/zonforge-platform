import {
  BaseCollector,
  type CollectorConfig,
  type CollectorResult,
  type CursorState,
} from '../../collector-base/src/index.js'
import { M365GraphClient, type M365AuthConfig } from './services/graph.client.js'

// ─────────────────────────────────────────────
// M365 COLLECTOR
//
// Poll cycle:
//  1. Sign-in logs  (delta query — efficient, only new events)
//  2. Audit logs    (time-range query, multiple categories)
//  3. Risky users   (Identity Protection, if licensed)
//
// Cursor state: { deltaLink, lastProcessedAt }
// ─────────────────────────────────────────────

interface M365CursorState extends CursorState {
  signInDeltaLink?: string
}

export interface M365CollectorOptions {
  collectorConfig: CollectorConfig
  authConfig:      M365AuthConfig
}

export class M365Collector extends BaseCollector {
  private readonly graphClient: M365GraphClient
  private m365Cursor: M365CursorState

  constructor(options: M365CollectorOptions) {
    super(options.collectorConfig)
    this.graphClient = new M365GraphClient(options.authConfig)
    this.m365Cursor  = {
      lastProcessedAt: new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString(),
    }
  }

  protected async collect(): Promise<CollectorResult> {
    const allEvents: Array<Record<string, unknown>> = []
    const errors:    string[] = []

    const startDateTime = this.m365Cursor.lastProcessedAt
    const now           = new Date().toISOString()

    // ── 1. Sign-in logs (delta query) ─────────

    try {
      const signInResult = await this.graphClient.getSignInsDelta(
        this.m365Cursor.signInDeltaLink,
        this.m365Cursor.signInDeltaLink ? undefined : startDateTime,
      )

      allEvents.push(...signInResult.events)

      // Save delta link for next poll
      if (signInResult.deltaLink) {
        this.m365Cursor.signInDeltaLink = signInResult.deltaLink
      }

      this.log.debug({
        count: signInResult.events.length,
        hasDeltaLink: !!signInResult.deltaLink,
      }, 'Sign-in logs fetched')

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in fetch failed'
      errors.push(`sign-in: ${msg}`)
      this.log.error({ err }, 'Failed to fetch sign-in logs')
    }

    // ── 2. Audit logs (directory audits) ─────

    try {
      const auditEvents = await this.graphClient.getAuditLogs(
        startDateTime,
        now,
        ['UserManagement', 'RoleManagement', 'Application', 'Policy', 'GroupManagement'],
      )

      allEvents.push(...auditEvents)

      this.log.debug({ count: auditEvents.length }, 'Audit logs fetched')

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Audit fetch failed'
      errors.push(`audit: ${msg}`)
      this.log.error({ err }, 'Failed to fetch audit logs')
    }

    // ── 3. Service principal sign-ins ─────────

    try {
      const spSignIns = await this.graphClient.getServicePrincipalSignIns(startDateTime)

      // Tag service principal events so normalizer can handle them differently
      const tagged = spSignIns.map(e => ({ ...e, _zf_event_subtype: 'sp_signin' }))
      allEvents.push(...tagged)

      this.log.debug({ count: spSignIns.length }, 'Service principal sign-ins fetched')

    } catch (err) {
      // Non-fatal — SP sign-ins may not be licensed
      this.log.warn({ err }, 'Service principal sign-ins unavailable (may not be licensed)')
    }

    // ── 4. Submit batches to ingestion API ────

    let totalAccepted = 0
    let totalBatches  = 0

    if (allEvents.length > 0) {
      const result = await this.submitBatches(allEvents)
      totalAccepted = result.totalAccepted
      totalBatches  = result.totalBatches
    }

    // ── 5. Update cursor ───────────────────────

    const newCursor: M365CursorState = {
      ...this.m365Cursor,
      lastProcessedAt: now,
    }

    return {
      eventsCollected: allEvents.length,
      batchesSent:     totalBatches,
      errors,
      cursorState:     newCursor,
    }
  }

  protected async saveCursorState(state: CursorState): Promise<void> {
    this.m365Cursor = state as M365CursorState
    this.cursorState = state
  }
}
