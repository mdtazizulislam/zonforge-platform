import { Worker, type Job } from 'bullmq'
import type { Redis } from 'ioredis'
import { createLogger } from '@zonforge/logger'
import { queueConfig } from '@zonforge/config'
import { RuleLoader, getDefaultRulesPath } from '../rules/rule-loader.js'
import { RuleEvaluator } from '../engine/rule-evaluator.js'
import { SignalEmitter } from '../engine/signal-emitter.js'
import {
  QUEUE_NAMES, createQueue, getQueueConnection,
} from '@zonforge/ingestion-service/queues'

const log = createLogger({ service: 'detection-engine:worker' })

// ─────────────────────────────────────────────
// DETECTION WORKER
//
// Two operational modes:
//
// Mode 1: Event-triggered (BullMQ consumer)
//   Consumes normalized events from zf:normalized-events
//   Evaluates rules relevant to the source type
//
// Mode 2: Scheduled sweep (setInterval)
//   Runs all rules against recent events every 5 minutes
//   Catches patterns that span multiple event batches
// ─────────────────────────────────────────────

export function createDetectionWorker(
  redis:         Redis,
  ruleLoader:    RuleLoader,
  ruleEvaluator: RuleEvaluator,
  signalEmitter: SignalEmitter,
): {
  worker:    Worker
  stopSweep: () => void
} {
  const connection = getQueueConnection({
    host:     redis.options.host ?? 'localhost',
    port:     redis.options.port ?? 6379,
    password: redis.options.password,
  })

  const detectionSignalsQueue = createQueue(QUEUE_NAMES.DETECTION_SIGNALS, connection)

  // ── Mode 1: Event-triggered worker ────────

  const worker = new Worker<{
    tenantId:    string
    sourceType:  string
    eventId:     string
    eventAction: string
    entityId:    string
    entityType:  string
    severity:    string
    eventTime:   string
    threatIntelMatched: boolean
  }>(
    QUEUE_NAMES.NORMALIZED_EVENTS,
    async (job) => {
      const { tenantId, sourceType } = job.data

      // Get rules for this source type
      const relevantRules = ruleLoader.getEnabledRulesForSourceType(sourceType)

      if (relevantRules.length === 0) return

      // Evaluate each relevant rule
      let totalMatches = 0
      for (const rule of relevantRules) {
        const matches = await ruleEvaluator.evaluate(rule, tenantId)
        if (matches.length > 0) {
          const result = await signalEmitter.emitBatch(matches)
          totalMatches += result.emitted
        }
      }

      if (totalMatches > 0) {
        log.info({
          tenantId,
          sourceType,
          eventId: job.data.eventId,
          matches: totalMatches,
        }, 'Detection matches emitted')
      }
    },
    {
      connection,
      concurrency: Math.max(2, Math.floor(queueConfig.concurrency / 2)),
      limiter: {
        max:      50,
        duration: 1000,
      },
    },
  )

  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id, tenantId: job?.data.tenantId },
      'Detection job failed')
  })

  worker.on('error', (err) => {
    log.error({ err }, 'Detection worker error')
  })

  log.info({
    queue:       QUEUE_NAMES.NORMALIZED_EVENTS,
    rules:       ruleLoader.getEnabledRules().length,
  }, '✅ Detection worker (event-triggered) started')

  // ── Mode 2: Scheduled sweep ────────────────
  // Runs all rules on a schedule — catches patterns
  // that can't be detected from single events

  let sweeping = false

  // Track tenants seen recently (for targeted sweep)
  const activeTenants = new Set<string>()
  worker.on('completed', (job) => {
    if (job.data.tenantId) activeTenants.add(job.data.tenantId)
  })

  const sweepInterval = setInterval(async () => {
    if (sweeping) return
    sweeping = true

    const tenantsToSweep = Array.from(activeTenants)
    activeTenants.clear()

    if (tenantsToSweep.length === 0) {
      sweeping = false
      return
    }

    log.debug({ tenants: tenantsToSweep.length }, 'Running scheduled detection sweep')

    const allRules = ruleLoader.getEnabledRules()

    for (const tenantId of tenantsToSweep) {
      for (const rule of allRules) {
        try {
          const matches = await ruleEvaluator.evaluate(rule, tenantId)
          if (matches.length > 0) {
            await signalEmitter.emitBatch(matches)
          }
        } catch (err) {
          log.error({ err, ruleId: rule.id, tenantId },
            'Scheduled sweep rule evaluation failed')
        }
      }
    }

    sweeping = false
  }, 5 * 60_000)   // Every 5 minutes

  log.info('✅ Detection sweep worker (scheduled) started — interval: 5 minutes')

  return {
    worker,
    stopSweep: () => {
      clearInterval(sweepInterval)
      log.info('Detection sweep worker stopped')
    },
  }
}
