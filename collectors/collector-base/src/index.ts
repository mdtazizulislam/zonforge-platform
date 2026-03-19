import { v4 as uuidv4 } from 'uuid'
import { createLogger, logConnectorEvent } from '@zonforge/logger'
import { buildCollectorSignature } from '@zonforge/auth-utils'

// ─────────────────────────────────────────────
// ZonForge Sentinel — Base Collector
//
// All collectors extend BaseCollector.
// Provides:
//  - Poll lifecycle (start / stop / one-shot)
//  - Retry with exponential backoff
//  - Cursor-state persistence (last processed timestamp)
//  - Heartbeat to ingestion API
//  - Batch submission to ingestion API
// ─────────────────────────────────────────────

export interface CollectorConfig {
  tenantId:        string
  connectorId:     string
  sourceType:      string
  pollIntervalMs:  number      // e.g. 300_000 = 5 minutes
  batchSize:       number      // max events per batch
  ingestionApiUrl: string
  apiKey:          string      // HMAC signing key
  hmacSecret:      string
}

export interface CursorState {
  lastProcessedAt: string     // ISO timestamp
  lastEventId?:    string
  pageToken?:      string
  metadata?:       Record<string, unknown>
}

export interface CollectorResult {
  eventsCollected: number
  batchesSent:     number
  errors:          string[]
  cursorState:     CursorState
}

// ── Ingestion API client ──────────────────────

export class IngestionClient {
  private readonly log = createLogger({ service: 'collector:ingestion-client' })

  constructor(
    private readonly apiUrl:     string,
    private readonly apiKey:     string,
    private readonly hmacSecret: string,
  ) {}

  async sendBatch(
    tenantId:    string,
    connectorId: string,
    sourceType:  string,
    events:      Array<Record<string, unknown>>,
    batchId?:    string,
  ): Promise<{ accepted: number; duplicates: number; batchId: string }> {
    const bid    = batchId ?? uuidv4()
    const body   = {
      connectorId,
      sourceType,
      events,
      batchId: bid,
      collectedAt: new Date().toISOString(),
    }

    const bodyStr   = JSON.stringify(body)
    const signature = buildCollectorSignature(bodyStr, this.hmacSecret)

    const resp = await fetch(`${this.apiUrl}/v1/ingest/events`, {
      method:  'POST',
      headers: {
        'Content-Type':         'application/json',
        'X-Api-Key':            this.apiKey,
        'X-ZonForge-Signature': signature,
        'Idempotency-Key':      bid,
        'X-Request-Id':         uuidv4(),
      },
      body: bodyStr,
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new CollectorError(
        `Ingestion API error ${resp.status}: ${errText}`,
        resp.status,
      )
    }

    const result = await resp.json() as {
      success: boolean
      data: { accepted: number; duplicates: number; batchId: string }
    }

    this.log.debug({
      tenantId, batchId: bid,
      accepted:   result.data.accepted,
      duplicates: result.data.duplicates,
    }, 'Batch submitted')

    return result.data
  }
}

// ── Base Collector ────────────────────────────

export abstract class BaseCollector {
  protected readonly log:     ReturnType<typeof createLogger>
  protected readonly client:  IngestionClient
  protected cursorState:      CursorState
  private   pollTimer:        NodeJS.Timeout | null = null
  private   isRunning:        boolean = false

  constructor(protected readonly config: CollectorConfig) {
    this.log = createLogger({
      service: `collector:${config.sourceType}`,
    })
    this.client = new IngestionClient(
      config.ingestionApiUrl,
      config.apiKey,
      config.hmacSecret,
    )
    this.cursorState = {
      lastProcessedAt: new Date(
        Date.now() - 24 * 60 * 60 * 1000,   // default: look back 24h on first run
      ).toISOString(),
    }
  }

  // ── Lifecycle ─────────────────────────────

  async start(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true

    this.log.info({
      connectorId:    this.config.connectorId,
      pollIntervalMs: this.config.pollIntervalMs,
    }, `Starting collector: ${this.config.sourceType}`)

    // Run immediately, then on schedule
    await this.runOnce()

    this.pollTimer = setInterval(async () => {
      if (!this.isRunning) return
      await this.runOnce()
    }, this.config.pollIntervalMs)
  }

  async stop(): Promise<void> {
    this.isRunning = false
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.log.info({ connectorId: this.config.connectorId }, 'Collector stopped')
  }

  // ── Single poll cycle ─────────────────────

  async runOnce(): Promise<CollectorResult> {
    const start = Date.now()

    try {
      const result = await this.collectWithRetry()

      // Persist cursor state after success
      await this.saveCursorState(result.cursorState)

      logConnectorEvent(this.log, {
        tenantId:    this.config.tenantId,
        connectorId: this.config.connectorId,
        sourceType:  this.config.sourceType,
        action:      'poll_completed',
        eventCount:  result.eventsCollected,
        lagSeconds:  Math.floor((Date.now() - start) / 1000),
      })

      return result

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'

      logConnectorEvent(this.log, {
        tenantId:    this.config.tenantId,
        connectorId: this.config.connectorId,
        sourceType:  this.config.sourceType,
        action:      'poll_failed',
        errorMessage: msg,
      })

      await this.reportError(msg)

      return {
        eventsCollected: 0,
        batchesSent:     0,
        errors:          [msg],
        cursorState:     this.cursorState,
      }
    }
  }

  // ── Retry wrapper (3 attempts, exponential backoff) ──

  private async collectWithRetry(attempts = 3): Promise<CollectorResult> {
    for (let i = 0; i < attempts; i++) {
      try {
        return await this.collect()
      } catch (err) {
        if (i === attempts - 1) throw err
        const delay = Math.min(1000 * Math.pow(2, i), 30_000)
        this.log.warn({ attempt: i + 1, delay, err }, 'Retrying after error')
        await sleep(delay)
      }
    }
    throw new Error('Max retries exceeded')
  }

  // ── Abstract methods (implemented per source) ──

  /**
   * Fetch events from the data source since the last cursor.
   * Must call this.client.sendBatch() to submit events.
   * Must update this.cursorState at the end.
   */
  protected abstract collect(): Promise<CollectorResult>

  /**
   * Persist cursor state so the collector resumes correctly after restart.
   * Default: in-memory only. Override to persist to DB/Redis/file.
   */
  protected async saveCursorState(state: CursorState): Promise<void> {
    this.cursorState = state
  }

  /**
   * Report a poll error back to the ingestion service (connector health).
   */
  protected async reportError(message: string): Promise<void> {
    try {
      await fetch(
        `${this.config.ingestionApiUrl}/v1/connectors/${this.config.connectorId}/error`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key':    this.config.apiKey,
          },
          body: JSON.stringify({ message, reportedAt: new Date().toISOString() }),
          signal: AbortSignal.timeout(5_000),
        },
      )
    } catch {
      // Non-fatal
    }
  }

  // ── Batch helper ──────────────────────────

  protected async submitBatches(
    events:     Array<Record<string, unknown>>,
    batchSize?: number,
  ): Promise<{ totalAccepted: number; totalBatches: number }> {
    const size    = batchSize ?? this.config.batchSize
    let accepted  = 0
    let batches   = 0

    for (let i = 0; i < events.length; i += size) {
      const chunk  = events.slice(i, i + size)
      const result = await this.client.sendBatch(
        this.config.tenantId,
        this.config.connectorId,
        this.config.sourceType,
        chunk,
      )
      accepted += result.accepted
      batches++
    }

    return { totalAccepted: accepted, totalBatches: batches }
  }
}

// ── Helpers ───────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class CollectorError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(message)
    this.name = 'CollectorError'
  }
}
