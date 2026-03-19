import { Queue, type ConnectionOptions } from 'bullmq'
import type { RawEvent } from '@zonforge/event-schema'

// ─────────────────────────────────────────────
// ZonForge Sentinel — BullMQ Queue Definitions
//
// Queue names are FIXED — changing breaks workers
// All queues use the same Redis connection
// ─────────────────────────────────────────────

export const QUEUE_NAMES = {
  RAW_EVENTS:          'zf-raw-events',
  NORMALIZED_EVENTS:   'zf-normalized-events',
  DETECTION_SIGNALS:   'zf-detection-signals',
  ALERT_NOTIFICATIONS: 'zf-alert-notifications',
  LLM_NARRATIVES:      'zf-llm-narratives',
  THREAT_INTEL_ENRICH: 'zf-threat-intel-enrich',
  PLAYBOOK_EXECUTIONS: 'zf-playbook-executions',
  CONNECTOR_POLL:      'zf-connector-poll',
  // Dead-letter queues
  DLQ_RAW_EVENTS:      'zf-dlq-raw-events',
  DLQ_NORMALIZATION:   'zf-dlq-normalization',
  DLQ_DETECTION:       'zf-dlq-detection',
  DLQ_NOTIFICATIONS:   'zf-dlq-notifications',
} as const

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES]

// ── Job payloads ──────────────────────────────

export interface RawEventJobData {
  batchId:     string
  tenantId:    string
  connectorId: string
  sourceType:  string
  eventId:     string
  payload:     Record<string, unknown>
  receivedAt:  string   // ISO string
}

export interface NormalizedEventJobData {
  tenantId:    string
  connectorId: string
  events:      Array<{
    eventId:     string
    sourceType:  string
    normalizedAt: string
  }>
}

export interface DetectionSignalJobData {
  tenantId:   string
  signalId:   string
  ruleId?:    string
  entityId:   string
  entityType: string
  confidence: number
  severity:   string
  mitreTactics:    string[]
  mitreTechniques: string[]
  evidenceEventIds: string[]
  firstSignalTime: string
  metadata:   Record<string, unknown>
}

export interface LlmNarrativeJobData {
  alertId:      string
  tenantId:     string
  alertTitle:   string
  severity:     string
  entityType:   string
  entityId:     string
  evidenceSummary: string
  mitreTactics: string[]
  mitreTechniques: string[]
}

// ── Queue factory ─────────────────────────────

export function createQueue(
  name: QueueName,
  connection: ConnectionOptions,
): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100, age: 3600 },   // keep last 100 completed
      removeOnFail:     { count: 50,  age: 86400 },  // keep last 50 failed for 24h
      attempts:         3,
      backoff: {
        type:  'exponential',
        delay: 1000,   // 1s, 2s, 4s
      },
    },
  })
}

// ── Default Redis connection for queues ───────

/** Accepts `redisConfig` from @zonforge/config (may include `password: undefined`). */
export function getQueueConnection(config: {
  host:     string
  port:     number
  password: string | undefined
  tls?:     boolean
}): ConnectionOptions {
  return {
    host: config.host,
    port: config.port,
    ...(config.password != null && config.password !== ''
      ? { password: config.password }
      : {}),
    ...(config.tls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,   // Required for BullMQ
    enableReadyCheck: false,
  }
}
