import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { createLogger } from '@zonforge/logger'
import { QUEUE_NAMES, getQueueConnection } from '@zonforge/ingestion-service/queues'

const log = createLogger({ service: 'normalization-worker:lag-monitor' })

// ─────────────────────────────────────────────
// PIPELINE LAG MONITOR
//
// Tracks queue depths and lag metrics.
// Published to Prometheus via /metrics endpoint.
// Alerts if lag exceeds SLO thresholds.
// ─────────────────────────────────────────────

export interface PipelineMetrics {
  queue:          string
  waiting:        number
  active:         number
  completed:      number
  failed:         number
  delayed:        number
  lagEstimateMs:  number
  checkedAt:      Date
}

// SLO thresholds — alert if exceeded
const LAG_THRESHOLDS = {
  [QUEUE_NAMES.RAW_EVENTS]:        120_000,   // 2 minutes
  [QUEUE_NAMES.NORMALIZED_EVENTS]: 120_000,   // 2 minutes
  [QUEUE_NAMES.DETECTION_SIGNALS]: 300_000,   // 5 minutes
}

export async function startLagMonitor(redis: Redis): Promise<void> {
  const connection = getQueueConnection({
    host:     redis.options.host ?? 'localhost',
    port:     redis.options.port ?? 6379,
    password: redis.options.password,
  })

  const queues = [
    QUEUE_NAMES.RAW_EVENTS,
    QUEUE_NAMES.NORMALIZED_EVENTS,
    QUEUE_NAMES.DETECTION_SIGNALS,
    QUEUE_NAMES.DLQ_NORMALIZATION,
  ]

  setInterval(async () => {
    for (const name of queues) {
      try {
        const q       = new Queue(name, { connection })
        const waiting = await q.getWaitingCount()
        const active  = await q.getActiveCount()
        const failed  = await q.getFailedCount()
        const delayed = await q.getDelayedCount()

        // Estimate lag: assume 1000 events/second processing rate
        const lagEstimateMs = (waiting + active) * 1   // ms per event

        const metrics: PipelineMetrics = {
          queue:         name,
          waiting,
          active,
          completed:     0,   // not fetched for perf
          failed,
          delayed,
          lagEstimateMs,
          checkedAt:     new Date(),
        }

        // Store in Redis for /metrics endpoint
        await redis.setex(
          `zf:platform:metrics:queue:${name}`,
          120,
          JSON.stringify(metrics),
        )

        // Alert on SLO breach
        const threshold = LAG_THRESHOLDS[name as keyof typeof LAG_THRESHOLDS]
        if (threshold && lagEstimateMs > threshold) {
          log.error({ queue: name, lagMs: lagEstimateMs, threshold },
            '🚨 Pipeline SLO BREACHED — lag exceeds threshold')
        } else if (waiting > 1000) {
          log.warn({ queue: name, waiting },
            '⚠️  Queue depth high — processing may be slow')
        }

        // DLQ non-zero alert
        if (name.includes('dlq') && (waiting > 0 || failed > 0)) {
          log.error({ queue: name, waiting, failed },
            '🚨 DLQ has messages — immediate operator attention required')
        }

        await q.close()
      } catch (err) {
        log.error({ err, queue: name }, 'Lag monitor check failed')
      }
    }
  }, 30_000)   // Every 30 seconds

  log.info('✅ Pipeline lag monitor started')
}

// ── Prometheus-style metrics endpoint ─────────

export async function getMetrics(redis: Redis): Promise<string> {
  const lines: string[] = [
    '# HELP zonforge_queue_waiting Jobs waiting in queue',
    '# TYPE zonforge_queue_waiting gauge',
    '# HELP zonforge_queue_active Jobs currently being processed',
    '# TYPE zonforge_queue_active gauge',
    '# HELP zonforge_queue_failed Failed jobs count',
    '# TYPE zonforge_queue_failed gauge',
    '# HELP zonforge_queue_lag_ms Estimated processing lag in ms',
    '# TYPE zonforge_queue_lag_ms gauge',
  ]

  const queueNames = [
    QUEUE_NAMES.RAW_EVENTS,
    QUEUE_NAMES.NORMALIZED_EVENTS,
    QUEUE_NAMES.DETECTION_SIGNALS,
    QUEUE_NAMES.DLQ_NORMALIZATION,
  ]

  for (const name of queueNames) {
    const raw = await redis.get(`zf:platform:metrics:queue:${name}`)
    if (!raw) continue

    const m = JSON.parse(raw) as PipelineMetrics
    const label = `queue="${name}"`

    lines.push(
      `zonforge_queue_waiting{${label}} ${m.waiting}`,
      `zonforge_queue_active{${label}} ${m.active}`,
      `zonforge_queue_failed{${label}} ${m.failed}`,
      `zonforge_queue_lag_ms{${label}} ${m.lagEstimateMs}`,
    )
  }

  return lines.join('\n') + '\n'
}
