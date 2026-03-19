import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { v4 as uuidv4 } from 'uuid'
import { eq, and, sql } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { RedisKeys, RedisTTL } from '@zonforge/db-client'
import { verifyCollectorSignature } from '@zonforge/auth-utils'
import { encryptionConfig } from '@zonforge/config'
import { createLogger, logConnectorEvent } from '@zonforge/logger'
import { PLAN_LIMITS, type PlanTier } from '@zonforge/shared-types'
import type { RawEventJobData } from '../queues.js'

const log = createLogger({ service: 'ingestion-service' })

// ─────────────────────────────────────────────
// INGESTION SERVICE
// Responsibilities:
//  1. Validate HMAC signature from collector
//  2. Check tenant plan rate limit
//  3. Deduplicate events by event_id
//  4. Publish raw events to BullMQ queue
//  5. Update connector health stats
// ─────────────────────────────────────────────

export interface IngestBatchInput {
  tenantId:    string
  connectorId: string
  sourceType:  string
  events:      Array<Record<string, unknown>>
  batchId:     string
  signature:   string        // X-ZonForge-Signature header
  rawBody:     string        // Raw request body for HMAC verify
}

export interface IngestBatchResult {
  accepted:    number
  duplicates:  number
  rejected:    number
  batchId:     string
}

export class IngestionService {
  constructor(
    private readonly rawEventsQueue: Queue,
    private readonly redis:          Redis,
  ) {}

  // ── Main ingest method ──────────────────────

  async ingestBatch(input: IngestBatchInput): Promise<IngestBatchResult> {
    const db = getDb()

    // 1. Load connector + verify it belongs to tenant
    const connectors = await db.select()
      .from(schema.connectors)
      .where(and(
        eq(schema.connectors.id,       input.connectorId),
        eq(schema.connectors.tenantId, input.tenantId),
      ))
      .limit(1)

    const connector = connectors[0]
    if (!connector) {
      throw new IngestionError('Connector not found', 'CONNECTOR_NOT_FOUND', 404)
    }

    if (connector.status === 'paused') {
      throw new IngestionError('Connector is paused', 'CONNECTOR_PAUSED', 403)
    }

    // 2. Verify HMAC signature
    const isValidSig = verifyCollectorSignature(
      input.rawBody,
      input.signature,
      encryptionConfig.hmacSecret,
    )
    if (!isValidSig) {
      logConnectorEvent(log, {
        tenantId:     input.tenantId,
        connectorId:  input.connectorId,
        sourceType:   input.sourceType,
        action:       'signature_validation_failed',
        errorMessage: 'HMAC signature mismatch',
      })
      throw new IngestionError('Invalid signature', 'INVALID_SIGNATURE', 401)
    }

    // 3. Check plan rate limit
    await this.checkRateLimit(input.tenantId, input.events.length)

    // 4. Deduplicate and publish
    const results = await this.processEvents(input)

    // 5. Update connector health
    await this.updateConnectorHealth(input.connectorId, input.tenantId, results.accepted)

    // 6. Update usage counter in Redis
    const usageKey = RedisKeys.usageCounter(input.tenantId, 'events')
    await this.redis.incrby(usageKey, results.accepted)
    await this.redis.expireat(usageKey, this.getEndOfMonth())

    return results
  }

  // ── Process and enqueue events ──────────────

  private async processEvents(input: IngestBatchInput): Promise<IngestBatchResult> {
    let accepted   = 0
    let duplicates = 0
    let rejected   = 0

    const dedupKey = RedisKeys.eventDedup(input.tenantId, input.connectorId)
    const jobs: Array<{ name: string; data: RawEventJobData }> = []

    for (const rawEvent of input.events) {
      try {
        // Extract or generate event_id
        const vendorEventId = this.extractEventId(rawEvent, input.sourceType)
        const dedupField    = `${input.connectorId}:${vendorEventId}`

        // Check Redis dedup set
        const isDuplicate = await this.redis.sismember(dedupKey, dedupField)
        if (isDuplicate) {
          duplicates++
          continue
        }

        // Add to dedup set (TTL: 24h)
        await this.redis.sadd(dedupKey, dedupField)
        await this.redis.expire(dedupKey, RedisTTL.EVENT_DEDUP)

        const internalEventId = uuidv4()
        jobs.push({
          name: `raw-event:${internalEventId}`,
          data: {
            batchId:     input.batchId,
            tenantId:    input.tenantId,
            connectorId: input.connectorId,
            sourceType:  input.sourceType,
            eventId:     internalEventId,
            payload:     rawEvent,
            receivedAt:  new Date().toISOString(),
          },
        })

        accepted++
      } catch {
        rejected++
      }
    }

    // Bulk enqueue — more efficient than individual adds
    if (jobs.length > 0) {
      await this.rawEventsQueue.addBulk(jobs)
    }

    logConnectorEvent(log, {
      tenantId:    input.tenantId,
      connectorId: input.connectorId,
      sourceType:  input.sourceType,
      action:      'batch_ingested',
      eventCount:  accepted,
    })

    return { accepted, duplicates, rejected, batchId: input.batchId }
  }

  // ── Rate limit check ────────────────────────

  private async checkRateLimit(tenantId: string, eventCount: number): Promise<void> {
    // Get tenant plan from cache or DB
    const planKey   = RedisKeys.tenantPlan(tenantId)
    let planTier    = await this.redis.get(planKey) as PlanTier | null

    if (!planTier) {
      const db      = getDb()
      const tenants = await db.select({ planTier: schema.tenants.planTier })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1)
      planTier = (tenants[0]?.planTier ?? 'starter') as PlanTier
      await this.redis.setex(planKey, RedisTTL.TENANT_PLAN, planTier)
    }

    const limits = PLAN_LIMITS[planTier]

    // Sliding window: count events in last 60 seconds
    const rateKey   = RedisKeys.ingestionRate(tenantId)
    const current   = await this.redis.get(rateKey)
    const count     = parseInt(current ?? '0', 10)

    if (count + eventCount > limits.maxEventsPerMinute) {
      throw new IngestionError(
        `Rate limit exceeded: ${limits.maxEventsPerMinute} events/minute on ${planTier} plan`,
        'RATE_LIMIT_EXCEEDED',
        429,
      )
    }

    await this.redis.incrby(rateKey, eventCount)
    await this.redis.expire(rateKey, 60)
  }

  // ── Update connector health ─────────────────

  private async updateConnectorHealth(
    connectorId: string,
    tenantId:    string,
    eventCount:  number,
  ): Promise<void> {
    const db  = getDb()
    const now = new Date()

    await db.update(schema.connectors)
      .set({
        lastPollAt:          now,
        lastEventAt:         now,
        consecutiveErrors:   0,
        totalEventsIngested: sql`${schema.connectors.totalEventsIngested} + ${BigInt(eventCount)}`,
        updatedAt:           now,
      })
      .where(eq(schema.connectors.id, connectorId))

    // Update health cache
    await this.redis.setex(
      RedisKeys.connectorHealth(tenantId, connectorId),
      RedisTTL.CONNECTOR_HEALTH,
      JSON.stringify({ status: 'active', lastEventAt: now, eventCount }),
    )
  }

  // ── Extract vendor event ID ─────────────────

  private extractEventId(
    event:      Record<string, unknown>,
    sourceType: string,
  ): string {
    const idFields: Record<string, string[]> = {
      'm365_entra':           ['id'],
      'aws_cloudtrail':       ['eventID'],
      'google_workspace':     ['id.uniqueQualifier'],
      'azure_activity':       ['operationId'],
      'gcp_audit':            ['insertId'],
      'cloudflare_waf':       ['RayID'],
      'generic_webhook':      ['id', 'eventId', 'event_id'],
    }

    const fields = idFields[sourceType] ?? ['id', 'eventId']

    for (const field of fields) {
      const parts = field.split('.')
      let value: unknown = event
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[part]
        } else {
          value = undefined
          break
        }
      }
      if (value && typeof value === 'string') return value
    }

    // Fallback: hash of the event content
    const { createHash } = require('crypto')
    return createHash('sha256')
      .update(JSON.stringify(event))
      .digest('hex')
      .slice(0, 32)
  }

  // ── Helpers ─────────────────────────────────

  private getEndOfMonth(): number {
    const now = new Date()
    return Math.floor(
      new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() / 1000,
    )
  }
}

// ── Custom error ─────────────────────────────

export class IngestionError extends Error {
  constructor(
    message:            string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'IngestionError'
  }
}
