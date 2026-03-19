import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3'
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'
import { createLogger } from '@zonforge/logger'

// ─────────────────────────────────────────────
// AWS CloudTrail S3 Reader
//
// Two modes:
//   1. SQS-triggered: S3 ObjectCreated events → SQS → collector
//   2. S3 polling:    list new objects since last cursor
// Mode 1 is preferred (real-time), Mode 2 is fallback
// ─────────────────────────────────────────────

const log = createLogger({ service: 'collector:cloudtrail:s3' })

export interface AwsAuthConfig {
  roleArn:   string
  region:    string
  s3Bucket:  string
  s3Prefix:  string
  sqsQueueUrl?: string   // if provided, use SQS mode
}

interface AwsCredentials {
  accessKeyId:     string
  secretAccessKey: string
  sessionToken:    string
  expiration:      Date
}

export class CloudTrailS3Reader {
  private credentials: AwsCredentials | null = null

  constructor(private readonly config: AwsAuthConfig) {}

  // ── Assume IAM role ───────────────────────

  private async getCredentials(): Promise<AwsCredentials> {
    if (this.credentials && this.credentials.expiration > new Date(Date.now() + 5 * 60_000)) {
      return this.credentials
    }

    const sts     = new STSClient({ region: this.config.region })
    const assumed = await sts.send(new AssumeRoleCommand({
      RoleArn:         this.config.roleArn,
      RoleSessionName: `zonforge-cloudtrail-${Date.now()}`,
      DurationSeconds: 3600,
    }))

    if (!assumed.Credentials?.AccessKeyId) {
      throw new Error('Failed to assume IAM role — check RoleArn and trust policy')
    }

    this.credentials = {
      accessKeyId:     assumed.Credentials.AccessKeyId,
      secretAccessKey: assumed.Credentials.SecretAccessKey!,
      sessionToken:    assumed.Credentials.SessionToken!,
      expiration:      assumed.Credentials.Expiration!,
    }

    log.debug({ roleArn: this.config.roleArn }, 'IAM role assumed')
    return this.credentials
  }

  private async getS3Client(): Promise<S3Client> {
    const creds = await this.getCredentials()
    return new S3Client({
      region:      this.config.region,
      credentials: {
        accessKeyId:     creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken:    creds.sessionToken,
      },
    })
  }

  private async getSqsClient(): Promise<SQSClient> {
    const creds = await this.getCredentials()
    return new SQSClient({
      region:      this.config.region,
      credentials: {
        accessKeyId:     creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken:    creds.sessionToken,
      },
    })
  }

  // ── Mode 1: SQS-triggered reading ────────

  async readViaSqs(maxMessages = 10): Promise<{
    records:           Array<Record<string, unknown>>
    receiptHandles:    string[]
  }> {
    if (!this.config.sqsQueueUrl) {
      throw new Error('SQS queue URL not configured')
    }

    const sqs = await this.getSqsClient()

    const resp = await sqs.send(new ReceiveMessageCommand({
      QueueUrl:            this.config.sqsQueueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds:     10,   // Long polling
      MessageAttributeNames: ['All'],
    }))

    const messages      = resp.Messages ?? []
    const records:       Array<Record<string, unknown>> = []
    const receiptHandles: string[] = []

    for (const msg of messages) {
      if (!msg.Body) continue

      try {
        const notification = JSON.parse(msg.Body) as {
          s3?: { object: { key: string }; bucket: { name: string } }
          Message?: string
        }

        // SNS-wrapped SQS message
        const s3Notification = notification.Message
          ? JSON.parse(notification.Message) as typeof notification
          : notification

        const s3Key  = s3Notification.s3?.object?.key
        if (!s3Key) continue

        const events = await this.readS3File(s3Key)
        records.push(...events)
        receiptHandles.push(msg.ReceiptHandle!)

      } catch (err) {
        log.error({ err, msgId: msg.MessageId }, 'Failed to process SQS message')
      }
    }

    return { records, receiptHandles }
  }

  async deleteMessages(receiptHandles: string[]): Promise<void> {
    if (!this.config.sqsQueueUrl || receiptHandles.length === 0) return

    const sqs = await this.getSqsClient()
    for (const handle of receiptHandles) {
      await sqs.send(new DeleteMessageCommand({
        QueueUrl:      this.config.sqsQueueUrl,
        ReceiptHandle: handle,
      }))
    }
  }

  // ── Mode 2: S3 polling (list + read new objects) ──

  async readViaS3Poll(
    since:    Date,
    maxFiles: number = 100,
  ): Promise<{
    records:    Array<Record<string, unknown>>
    lastKey:    string | null
    filesRead:  number
  }> {
    const s3     = await this.getS3Client()
    const prefix = this.buildPrefix(since)

    const records:  Array<Record<string, unknown>> = []
    let   filesRead = 0
    let   lastKey:  string | null = null
    let   ct:       string | undefined

    do {
      const list: ListObjectsV2CommandOutput = await s3.send(
        new ListObjectsV2Command({
          Bucket:            this.config.s3Bucket,
          Prefix:            prefix,
          MaxKeys:           50,
          ContinuationToken: ct,
        }),
      )

      for (const obj of list.Contents ?? []) {
        if (!obj.Key || filesRead >= maxFiles) break

        // Only read files newer than our cursor
        if (obj.LastModified && obj.LastModified <= since) continue

        try {
          const events = await this.readS3File(obj.Key)
          records.push(...events)
          lastKey = obj.Key
          filesRead++
        } catch (err) {
          log.error({ err, key: obj.Key }, 'Failed to read CloudTrail S3 file')
        }
      }

      ct = list.NextContinuationToken
    } while (ct && filesRead < maxFiles)

    return { records, lastKey, filesRead }
  }

  // ── Read and parse a single CloudTrail S3 file ──

  private async readS3File(
    key: string,
  ): Promise<Array<Record<string, unknown>>> {
    const s3   = await this.getS3Client()

    const obj  = await s3.send(new GetObjectCommand({
      Bucket: this.config.s3Bucket,
      Key:    key,
    }))

    if (!obj.Body) return []

    // CloudTrail files are gzip-compressed JSON
    const bytes = await obj.Body.transformToByteArray()

    let jsonStr: string
    if (key.endsWith('.gz')) {
      const { gunzipSync } = await import('zlib')
      jsonStr = gunzipSync(bytes).toString('utf-8')
    } else {
      jsonStr = Buffer.from(bytes).toString('utf-8')
    }

    const parsed = JSON.parse(jsonStr) as { Records?: Array<Record<string, unknown>> }

    if (!parsed.Records || !Array.isArray(parsed.Records)) {
      log.warn({ key }, 'CloudTrail file has no Records array')
      return []
    }

    log.debug({ key, count: parsed.Records.length }, 'CloudTrail file read')
    return parsed.Records
  }

  // ── Build S3 prefix for date-based partitioning ──

  private buildPrefix(since: Date): string {
    // CloudTrail path: AWSLogs/{accountId}/CloudTrail/{region}/{YYYY}/{MM}/{DD}/
    const y  = since.getUTCFullYear()
    const m  = String(since.getUTCMonth() + 1).padStart(2, '0')
    const d  = String(since.getUTCDate()).padStart(2, '0')
    const base = this.config.s3Prefix || 'AWSLogs'
    return `${base}/`   // Simplified — in production include account+region in path
  }
}
