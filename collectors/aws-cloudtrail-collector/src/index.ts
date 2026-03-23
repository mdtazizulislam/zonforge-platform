import {
  BaseCollector,
  type CollectorConfig,
  type CollectorResult,
  type CursorState,
} from '@zonforge/collector-base'
import {
  CloudTrailS3Reader,
  type AwsAuthConfig,
} from './services/cloudtrail-s3.reader.js'
import { createLogger } from '@zonforge/logger'

// ─────────────────────────────────────────────
// AWS CloudTrail Collector
//
// Poll cycle:
//   If SQS URL configured → use SQS-triggered mode
//   Otherwise → S3 listing poll mode (5-minute interval)
// ─────────────────────────────────────────────

const log = createLogger({ service: 'collector:cloudtrail' })

interface CloudTrailCursorState extends CursorState {
  lastS3Key?: string
}

export class CloudTrailCollector extends BaseCollector {
  private readonly s3Reader:     CloudTrailS3Reader
  private ctCursor: CloudTrailCursorState

  constructor(
    collectorConfig: CollectorConfig,
    authConfig:      AwsAuthConfig,
  ) {
    super(collectorConfig)
    this.s3Reader = new CloudTrailS3Reader(authConfig)
    this.ctCursor = {
      lastProcessedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  protected async collect(): Promise<CollectorResult> {
    const errors:  string[] = []
    const since    = new Date(this.ctCursor.lastProcessedAt)
    const now      = new Date()
    let   allRecords: Array<Record<string, unknown>> = []
    let   receiptHandles: string[] = []

    // ── SQS mode (preferred) ───────────────────

    if ((this.config as any).sqsQueueUrl) {
      try {
        const result = await this.s3Reader.readViaSqs(10)
        allRecords     = result.records
        receiptHandles = result.receiptHandles

        log.debug({ count: allRecords.length }, 'CloudTrail events via SQS')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'SQS read failed'
        errors.push(msg)
        log.error({ err }, 'SQS read failed — falling back to S3 poll')
      }
    }

    // ── S3 poll mode (fallback or primary) ─────

    if (allRecords.length === 0 && errors.length === 0) {
      try {
        const result = await this.s3Reader.readViaS3Poll(since, 200)
        allRecords = result.records
        log.debug({
          count: allRecords.length,
          filesRead: result.filesRead,
        }, 'CloudTrail events via S3 poll')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'S3 poll failed'
        errors.push(msg)
        log.error({ err }, 'S3 poll failed')
      }
    }

    // ── Filter: only events newer than cursor ──

    const filtered = allRecords.filter(r => {
      const t = (r['eventTime'] as string) ?? ''
      return !t || new Date(t) > since
    })

    // ── Submit to ingestion API ────────────────

    let totalAccepted = 0
    let totalBatches  = 0

    if (filtered.length > 0) {
      const result = await this.submitBatches(filtered)
      totalAccepted = result.totalAccepted
      totalBatches  = result.totalBatches
    }

    // ── Delete processed SQS messages ──────────

    if (receiptHandles.length > 0) {
      await this.s3Reader.deleteMessages(receiptHandles).catch(err =>
        log.error({ err }, 'Failed to delete SQS messages'))
    }

    // ── Update cursor ──────────────────────────

    const newCursor: CloudTrailCursorState = {
      lastProcessedAt: now.toISOString(),
    }

    return {
      eventsCollected: filtered.length,
      batchesSent:     totalBatches,
      errors,
      cursorState:     newCursor,
    }
  }

  protected override async saveCursorState(state: CursorState): Promise<void> {
    this.ctCursor    = state as CloudTrailCursorState
    this.cursorState = state
  }
}

// ── Entry point ───────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Required env var missing: ${name}`)
  return v
}

async function start() {
  const collectorConfig: CollectorConfig = {
    tenantId:        requireEnv('ZF_TENANT_ID'),
    connectorId:     requireEnv('ZF_CONNECTOR_ID'),
    sourceType:      'aws_cloudtrail',
    pollIntervalMs:  parseInt(process.env['ZF_POLL_INTERVAL_MS'] ?? '300000', 10),
    batchSize:       parseInt(process.env['ZF_BATCH_SIZE'] ?? '500', 10),
    ingestionApiUrl: requireEnv('ZF_INGESTION_API_URL'),
    apiKey:          requireEnv('ZF_API_KEY'),
    hmacSecret:      requireEnv('ZF_HMAC_SECRET'),
  }

  const authConfig: AwsAuthConfig = {
    roleArn:      requireEnv('ZF_AWS_ROLE_ARN'),
    region:       process.env['ZF_AWS_REGION'] ?? 'us-east-1',
    s3Bucket:     requireEnv('ZF_AWS_CLOUDTRAIL_BUCKET'),
    s3Prefix:     process.env['ZF_AWS_CLOUDTRAIL_PREFIX'] ?? 'AWSLogs',
    ...(process.env['ZF_AWS_SQS_URL'] ? { sqsQueueUrl: process.env['ZF_AWS_SQS_URL'] } : {}),
  }

  const collector = new CloudTrailCollector(collectorConfig, authConfig)

  log.info({
    tenantId:    collectorConfig.tenantId,
    connectorId: collectorConfig.connectorId,
    bucket:      authConfig.s3Bucket,
    mode:        authConfig.sqsQueueUrl ? 'SQS' : 'S3-poll',
  }, '🚀 Starting AWS CloudTrail collector')

  await collector.start()

  const shutdown = async (sig: string) => {
    log.info({ sig }, 'Shutting down CloudTrail collector...')
    await collector.stop()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ CloudTrail collector failed to start')
  process.exit(1)
})
