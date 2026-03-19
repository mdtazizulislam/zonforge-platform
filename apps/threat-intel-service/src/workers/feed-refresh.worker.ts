import { createLogger } from '@zonforge/logger'
import { env } from '@zonforge/config'
import { OtxFeedIngestor } from '../feeds/otx.feed.js'
import {
  fetchUrlhausRecent,
  fetchMalwareBazaarRecent,
  fetchFeodoC2Ips,
} from '../feeds/abuse-ch.feed.js'
import type { IocStore } from '../services/ioc-store.service.js'
import type { NormalizedIoc } from '../types.js'

// ─────────────────────────────────────────────
// FEED REFRESH WORKER
//
// Runs on schedule (default: every 6 hours)
// Fetches all feeds → normalizes → upserts to DB
// → rebuilds Redis hot-cache
// ─────────────────────────────────────────────

const log = createLogger({ service: 'threat-intel:feed-worker' })

export interface FeedRefreshResult {
  durationMs:      number
  totalIocs:       number
  byFeed:          Record<string, number>
  errors:          string[]
  cacheRebuilt:    boolean
}

export class FeedRefreshWorker {
  private isRunning = false
  private timer:     NodeJS.Timeout | null = null

  constructor(
    private readonly store:          IocStore,
    private readonly otxApiKey:      string,
    private readonly abuseIpDbKey:   string,
    private readonly intervalMs:     number = 6 * 60 * 60 * 1000,  // 6 hours
  ) {}

  // ── Start scheduled refresh ───────────────

  start(): void {
    log.info({ intervalMs: this.intervalMs }, 'Feed refresh worker starting')

    // Run immediately on startup
    this.runRefresh().catch(err =>
      log.error({ err }, 'Initial feed refresh failed'))

    this.timer = setInterval(() => {
      this.runRefresh().catch(err =>
        log.error({ err }, 'Scheduled feed refresh failed'))
    }, this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // ── Main refresh cycle ────────────────────

  async runRefresh(): Promise<FeedRefreshResult> {
    if (this.isRunning) {
      log.warn('Feed refresh already running — skipping this cycle')
      return {
        durationMs: 0, totalIocs: 0, byFeed: {},
        errors: ['Already running'], cacheRebuilt: false,
      }
    }

    this.isRunning = true
    const start    = Date.now()
    const byFeed:  Record<string, number> = {}
    const errors:  string[] = []
    const allIocs: NormalizedIoc[] = []

    log.info('🔄 Starting threat intel feed refresh')

    // ── Feed 1: Feodo C2 IPs (highest priority — always critical) ──

    try {
      const feodoIocs = await fetchFeodoC2Ips()
      allIocs.push(...feodoIocs)
      byFeed['feodo'] = feodoIocs.length
      log.info({ count: feodoIocs.length }, 'Feodo C2 fetch complete')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Feodo fetch failed'
      errors.push(`feodo: ${msg}`)
      log.error({ err }, 'Feodo fetch error')
    }

    // ── Feed 2: URLhaus malware URLs ──────────────────────────────

    try {
      const urlhausIocs = await fetchUrlhausRecent(24)
      allIocs.push(...urlhausIocs)
      byFeed['urlhaus'] = urlhausIocs.length
      log.info({ count: urlhausIocs.length }, 'URLhaus fetch complete')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'URLhaus fetch failed'
      errors.push(`urlhaus: ${msg}`)
      log.error({ err }, 'URLhaus fetch error')
    }

    // ── Feed 3: MalwareBazaar file hashes ─────────────────────────

    try {
      const bazaarIocs = await fetchMalwareBazaarRecent(24)
      allIocs.push(...bazaarIocs)
      byFeed['malwarebazaar'] = bazaarIocs.length
      log.info({ count: bazaarIocs.length }, 'MalwareBazaar fetch complete')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'MalwareBazaar fetch failed'
      errors.push(`malwarebazaar: ${msg}`)
      log.error({ err }, 'MalwareBazaar fetch error')
    }

    // ── Feed 4: AlienVault OTX (requires API key) ─────────────────

    if (this.otxApiKey) {
      try {
        const since  = new Date(Date.now() - 6 * 60 * 60 * 1000) // last 6 hours
        const otx    = new OtxFeedIngestor(this.otxApiKey)
        const otxIocs = await otx.fetchPulsesSince(since, 5)
        allIocs.push(...otxIocs)
        byFeed['otx'] = otxIocs.length
        log.info({ count: otxIocs.length }, 'OTX fetch complete')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'OTX fetch failed'
        errors.push(`otx: ${msg}`)
        log.error({ err }, 'OTX fetch error')
      }
    } else {
      log.warn('OTX API key not configured — skipping OTX feed')
      byFeed['otx'] = 0
    }

    // ── Upsert all IOCs to DB ─────────────────────────────────────

    let cacheRebuilt = false

    if (allIocs.length > 0) {
      try {
        const { inserted, updated } = await this.store.upsertBatch(allIocs)
        log.info({ inserted, updated, total: allIocs.length }, 'IOCs upserted to DB')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'DB upsert failed'
        errors.push(`db_upsert: ${msg}`)
        log.error({ err }, 'IOC DB upsert failed')
      }
    }

    // ── Expire old IOCs ───────────────────────────────────────────

    try {
      const expired = await this.store.expireOldIocs()
      if (expired > 0) log.info({ expired }, 'Old IOCs expired')
    } catch (err) {
      log.error({ err }, 'IOC expiration failed')
    }

    // ── Rebuild Redis hot-cache ───────────────────────────────────

    try {
      await this.store.rebuildHotCache()
      cacheRebuilt = true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cache rebuild failed'
      errors.push(`cache_rebuild: ${msg}`)
      log.error({ err }, 'Hot-cache rebuild failed')
    }

    this.isRunning   = false
    const durationMs = Date.now() - start

    const result: FeedRefreshResult = {
      durationMs,
      totalIocs:    allIocs.length,
      byFeed,
      errors,
      cacheRebuilt,
    }

    log.info(result, '✅ Feed refresh cycle complete')
    return result
  }
}
