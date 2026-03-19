import { Worker, type Job } from 'bullmq'
import type { Redis } from 'ioredis'
import {
  insertEvents, getClickHouse,
} from '@zonforge/db-client'
import { createLogger, logConnectorEvent } from '@zonforge/logger'
import { queueConfig } from '@zonforge/config'
import type { RawEventJobData } from '@zonforge/ingestion-service/queues'
import {
  QUEUE_NAMES, createQueue, getQueueConnection,
} from '@zonforge/ingestion-service/queues'
import { NormalizationService } from '../services/normalization.service.js'
import type { NormalizedEvent, RawEvent } from '@zonforge/event-schema'

const log = createLogger({ service: 'normalization-worker' })

// ─────────────────────────────────────────────
// NORMALIZATION WORKER
//
// Consumes: zf:raw-events queue
// For each job:
//   1. Deserialize raw event
//   2. Map to OCSF NormalizedEvent
//   3. Enrich with threat intel (hot cache)
//   4. Write to ClickHouse (async batch)
//   5. Publish to zf:normalized-events queue
//   6. On failure → send to DLQ
// ─────────────────────────────────────────────

// Batch write buffer — reduces ClickHouse write pressure
const BATCH_SIZE    = 100
const BATCH_TIMEOUT = 2000   // 2 seconds max wait

export function createNormalizationWorker(
  redis:                Redis,
  normalizationService: NormalizationService,
): Worker<RawEventJobData> {

  const connection  = {
    host:     redis.options.host ?? 'localhost',
    port:     redis.options.port ?? 6379,
    password: redis.options.password,
    tls:      (redis.options as any).tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }

  // Queue for publishing normalized events to detection pipeline
  const normalizedQueue = createQueue(QUEUE_NAMES.NORMALIZED_EVENTS, connection)

  // DLQ queue
  const dlqQueue = createQueue(QUEUE_NAMES.DLQ_NORMALIZATION, connection)

  // ── Batch buffer ──────────────────────────────
  let batch:    NormalizedEvent[] = []
  let batchTimer: NodeJS.Timeout | null = null

  async function flushBatch(): Promise<void> {
    if (batch.length === 0) return
    const toWrite = batch.splice(0, batch.length)

    try {
      await insertEvents(toWrite)
      log.info({ count: toWrite.length }, 'ClickHouse batch written')

      // Publish normalized event job IDs to detection queue
      const jobs = toWrite.map(e => ({
        name: `normalized:${e.eventId}`,
        data: {
          tenantId:    e.tenantId,
          connectorId: e.connectorId,
          eventId:     e.eventId,
          sourceType:  e.sourceType,
          eventAction: e.eventAction,
          entityId:    e.actorUserId ?? e.actorIp ?? 'unknown',
          entityType:  e.actorUserId ? 'user' : 'ip',
          severity:    mapSeverityId(e.ocsfSeverityId),
          eventTime:   e.eventTime.toISOString(),
          threatIntelMatched: e.threatIntelMatched,
        },
      }))

      await normalizedQueue.addBulk(jobs)

    } catch (err) {
      log.error({ err, count: toWrite.length }, 'ClickHouse batch write failed')
      // Put failed events back — will be retried via job retry mechanism
      batch.unshift(...toWrite)
      throw err
    }
  }

  function scheduleFlush(): void {
    if (batchTimer) return
    batchTimer = setTimeout(async () => {
      batchTimer = null
      await flushBatch().catch(err =>
        log.error({ err }, 'Scheduled flush failed'))
    }, BATCH_TIMEOUT)
  }

  // ── Worker ────────────────────────────────────

  const worker = new Worker<RawEventJobData>(
    QUEUE_NAMES.RAW_EVENTS,
    async (job: Job<RawEventJobData>) => {

      const { tenantId, connectorId, sourceType, eventId, payload, receivedAt } = job.data

      log.debug({ tenantId, sourceType, eventId }, 'Processing raw event')

      // 1. Build RawEvent
      const rawEvent: RawEvent = {
        eventId,
        tenantId,
        connectorId,
        sourceType,
        receivedAt: new Date(receivedAt),
        payload,
      }

      // 2. Normalize to OCSF
      const normalized = normalizationService.normalize(rawEvent)

      // 3. Threat intel hot-cache enrichment
      const enriched = await normalizationService.enrichWithThreatIntel(normalized, redis)

      // 4. Add to batch buffer
      batch.push(enriched)

      if (batch.length >= BATCH_SIZE) {
        if (batchTimer) { clearTimeout(batchTimer); batchTimer = null }
        await flushBatch()
      } else {
        scheduleFlush()
      }

    },
    {
      connection,
      concurrency: queueConfig.concurrency,
      maxStalledCount: 3,
      stalledInterval: 30_000,

      // Retry config
      settings: {
        backoffStrategy: (attemptsMade: number) =>
          Math.min(attemptsMade * 1000, 30_000),   // up to 30s
      },
    },
  )

  // ── Worker event handlers ─────────────────────

  worker.on('completed', (job) => {
    log.debug({ jobId: job.id, tenantId: job.data.tenantId },
      'Normalization job completed')
  })

  worker.on('failed', async (job, err) => {
    if (!job) return

    log.error({ err, jobId: job.id, tenantId: job.data.tenantId,
                sourceType: job.data.sourceType, attempts: job.attemptsMade },
      'Normalization job failed')

    // After max retries, send to DLQ with full context
    if (job.attemptsMade >= queueConfig.maxRetries) {
      await dlqQueue.add(`dlq:${job.id}`, {
        ...job.data,
        failureReason:  err.message,
        failedAt:       new Date().toISOString(),
        attemptsMade:   job.attemptsMade,
      })

      logConnectorEvent(log, {
        tenantId:    job.data.tenantId,
        connectorId: job.data.connectorId,
        sourceType:  job.data.sourceType,
        action:      'event_sent_to_dlq',
        errorMessage: err.message,
      })
    }
  })

  worker.on('error', (err) => {
    log.error({ err }, 'Worker error')
  })

  worker.on('stalled', (jobId) => {
    log.warn({ jobId }, 'Job stalled — will be retried')
  })

  log.info({
    queue:       QUEUE_NAMES.RAW_EVENTS,
    concurrency: queueConfig.concurrency,
  }, '✅ Normalization worker started')

  return worker
}

// ── DLQ Monitor Worker ────────────────────────
// Surfaces DLQ depth as a metric and alerts on non-zero

export function createDlqMonitorWorker(redis: Redis): void {
  setInterval(async () => {
    try {
      const queues = [
        QUEUE_NAMES.DLQ_RAW_EVENTS,
        QUEUE_NAMES.DLQ_NORMALIZATION,
        QUEUE_NAMES.DLQ_DETECTION,
      ]

      for (const queueName of queues) {
        const connection = {
          host: redis.options.host ?? 'localhost',
          port: redis.options.port ?? 6379,
          password: redis.options.password,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        }
        const q = createQueue(queueName as any, connection)
        const waiting = await q.getWaitingCount()
        const failed  = await q.getFailedCount()

        if (waiting > 0 || failed > 0) {
          log.warn({ queue: queueName, waiting, failed },
            '⚠️  DLQ has messages — requires operator attention')
        }

        await q.close()
      }
    } catch (err) {
      log.error({ err }, 'DLQ monitor check failed')
    }
  }, 60_000)   // Check every minute
}

// ── OCSF Severity ID → string ─────────────────

function mapSeverityId(id: number): string {
  const map: Record<number, string> = {
    0: 'info', 1: 'info', 2: 'low', 3: 'medium', 4: 'high', 5: 'critical', 6: 'critical',
  }
  return map[id] ?? 'info'
}
