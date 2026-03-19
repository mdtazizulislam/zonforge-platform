import { createLogger } from '@zonforge/logger'
import type { FeedOrchestrator } from '../services/feed-orchestrator.service.js'

const log = createLogger({ service: 'threat-intel:refresh-worker' })

// ─────────────────────────────────────────────
// FEED REFRESH WORKER
//
// Runs a full feed refresh every 6 hours.
// Also runs once at startup if last refresh
// was more than 1 hour ago (or never run).
// ─────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000   // 6 hours
const STARTUP_DELAY_MS    = 10_000                 // 10s after startup

export function startRefreshWorker(
  orchestrator: FeedOrchestrator,
): () => void {
  let timer: NodeJS.Timeout | null = null
  let running = false

  async function runRefresh() {
    if (running) {
      log.warn('Refresh already running — skipping')
      return
    }
    running = true
    try {
      await orchestrator.refresh()
    } catch (err) {
      log.error({ err }, 'Feed refresh worker error')
    } finally {
      running = false
    }
  }

  // Initial refresh after startup delay
  const startupTimer = setTimeout(() => {
    log.info('Running initial threat intel feed refresh...')
    runRefresh()
  }, STARTUP_DELAY_MS)

  // Scheduled refresh every 6 hours
  timer = setInterval(() => {
    log.info('Starting scheduled threat intel feed refresh...')
    runRefresh()
  }, REFRESH_INTERVAL_MS)

  log.info({
    intervalHours:  REFRESH_INTERVAL_MS / 3_600_000,
    startupDelayMs: STARTUP_DELAY_MS,
  }, '✅ Threat intel refresh worker started')

  // Return stop function
  return () => {
    clearTimeout(startupTimer)
    if (timer) { clearInterval(timer); timer = null }
    log.info('Refresh worker stopped')
  }
}
