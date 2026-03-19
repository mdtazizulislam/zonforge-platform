import { createLogger } from '@zonforge/logger'
import { OtxFeedIngestor } from '../feeds/otx.feed.js'
import {
  fetchUrlhausRecent,
  fetchMalwareBazaarRecent,
  fetchFeodoC2Ips,
} from '../feeds/abuse-ch.feed.js'
import type { IocStore } from './ioc-store.service.js'

const log = createLogger({ service: 'threat-intel:feed-orchestrator' })

// ─────────────────────────────────────────────
// FEED ORCHESTRATOR
//
// Coordinates all feed pulls every 6 hours.
// Order matters — higher confidence feeds run last
// so they overwrite lower confidence values.
//
// Pull order:
//   1. Feodo Tracker  (C2 IPs — small, fast)
//   2. URLhaus        (malicious URLs)
//   3. MalwareBazaar  (file hashes)
//   4. OTX pulses     (general threat intel — large)
// ─────────────────────────────────────────────

export interface FeedRefreshResult {
  feedsRun:     string[]
  totalFetched: number
  inserted:     number
  updated:      number
  skipped:      number
  purged:       number
  errors:       string[]
  durationMs:   number
  completedAt:  Date
}

export class FeedOrchestrator {
  private lastRefresh: Date | null = null

  constructor(
    private readonly store:  IocStore,
    private readonly otxKey: string | null,
  ) {}

  // ── Full refresh cycle ─────────────────────

  async refresh(): Promise<FeedRefreshResult> {
    const start  = Date.now()
    const result: FeedRefreshResult = {
      feedsRun:     [],
      totalFetched: 0,
      inserted:     0,
      updated:      0,
      skipped:      0,
      purged:       0,
      errors:       [],
      durationMs:   0,
      completedAt:  new Date(),
    }

    log.info('Starting threat intel feed refresh...')

    // ── 1. Feodo Tracker C2 IPs ──────────────

    try {
      const iocs  = await fetchFeodoC2Ips()
      const saved = await this.store.upsertBatch(iocs)
      result.feedsRun.push('feodo_tracker')
      result.totalFetched += iocs.length
      result.inserted     += saved.inserted
      result.updated      += saved.updated
      result.skipped      += saved.skipped
      log.info({ count: iocs.length }, '✅ Feodo Tracker complete')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Feodo fetch failed'
      result.errors.push(`feodo: ${msg}`)
      log.error({ err }, 'Feodo Tracker feed failed')
    }

    await delay(1000)

    // ── 2. URLhaus ────────────────────────────

    try {
      const iocs  = await fetchUrlhausRecent(2000)
      const saved = await this.store.upsertBatch(iocs)
      result.feedsRun.push('urlhaus')
      result.totalFetched += iocs.length
      result.inserted     += saved.inserted
      result.updated      += saved.updated
      result.skipped      += saved.skipped
      log.info({ count: iocs.length }, '✅ URLhaus complete')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'URLhaus fetch failed'
      result.errors.push(`urlhaus: ${msg}`)
      log.error({ err }, 'URLhaus feed failed')
    }

    await delay(1000)

    // ── 3. MalwareBazaar ──────────────────────

    try {
      const iocs  = await fetchMalwareBazaarRecent(200)
      const saved = await this.store.upsertBatch(iocs)
      result.feedsRun.push('malwarebazaar')
      result.totalFetched += iocs.length
      result.inserted     += saved.inserted
      result.updated      += saved.updated
      result.skipped      += saved.skipped
      log.info({ count: iocs.length }, '✅ MalwareBazaar complete')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'MalwareBazaar fetch failed'
      result.errors.push(`malwarebazaar: ${msg}`)
      log.error({ err }, 'MalwareBazaar feed failed')
    }

    await delay(1000)

    // ── 4. AlienVault OTX (if key configured) ─

    if (this.otxKey) {
      try {
        const otx   = new OtxFeedIngestor(this.otxKey)
        const since = this.lastRefresh ?? new Date(0)
        const iocs  = await otx.fetchPulsesSince(since)
        const saved = await this.store.upsertBatch(iocs)
        result.feedsRun.push('otx_alienvault')
        result.totalFetched += iocs.length
        result.inserted     += saved.inserted
        result.updated      += saved.updated
        result.skipped      += saved.skipped
        log.info({ count: iocs.length }, '✅ OTX AlienVault complete')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OTX fetch failed'
        result.errors.push(`otx: ${msg}`)
        log.error({ err }, 'OTX feed failed')
      }
    } else {
      log.warn('OTX API key not configured — skipping OTX feed')
    }

    // ── 5. Purge expired IOCs ─────────────────

    try {
      result.purged = await this.store.expireOldIocs()
    } catch (err) {
      log.error({ err }, 'IOC purge failed')
    }

    result.durationMs  = Date.now() - start
    result.completedAt = new Date()
    this.lastRefresh   = result.completedAt

    log.info({
      feedsRun:     result.feedsRun,
      totalFetched: result.totalFetched,
      inserted:     result.inserted,
      updated:      result.updated,
      skipped:      result.skipped,
      purged:       result.purged,
      errors:       result.errors.length,
      durationMs:   result.durationMs,
    }, '🎯 Threat intel refresh complete')

    return result
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
