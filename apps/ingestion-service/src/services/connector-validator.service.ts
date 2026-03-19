import { eq, and } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { decryptJson } from '@zonforge/auth-utils'
import { encryptionConfig } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import type {
  M365ConnectorConfig,
  AwsCloudTrailConfig,
  GoogleWorkspaceConfig,
} from '@zonforge/shared-types'

const log = createLogger({ service: 'ingestion-service:validator' })

// ─────────────────────────────────────────────
// CONNECTOR VALIDATOR
// Tests that a connector can actually reach its
// data source and fetch events. Called from:
//   GET /v1/connectors/:id/validate
// ─────────────────────────────────────────────

export interface ValidationResult {
  valid:       boolean
  status:      string
  message:     string
  latencyMs:   number
  sampleEventCount: number
  lastEventAt: Date | null
  errors:      string[]
}

export async function validateConnector(
  connectorId: string,
  tenantId:    string,
): Promise<ValidationResult> {
  const db = getDb()
  const start = Date.now()

  const rows = await db.select()
    .from(schema.connectors)
    .where(and(
      eq(schema.connectors.id,       connectorId),
      eq(schema.connectors.tenantId, tenantId),
    ))
    .limit(1)

  const connector = rows[0]
  if (!connector) {
    return {
      valid: false, status: 'error',
      message: 'Connector not found', latencyMs: 0,
      sampleEventCount: 0, lastEventAt: null, errors: ['Connector not found'],
    }
  }

  // Decrypt config
  let config: Record<string, unknown>
  try {
    config = decryptJson<Record<string, unknown>>(
      connector.configEncrypted,
      connector.configIv,
      encryptionConfig.key,
    )
  } catch {
    return {
      valid: false, status: 'error',
      message: 'Could not decrypt connector config',
      latencyMs: Date.now() - start,
      sampleEventCount: 0, lastEventAt: null,
      errors: ['Config decryption failed — re-authenticate connector'],
    }
  }

  try {
    switch (connector.type) {
      case 'm365_entra':
        return await validateM365(config as M365ConnectorConfig, start)
      case 'aws_cloudtrail':
        return await validateAwsCloudTrail(config as AwsCloudTrailConfig, start)
      case 'google_workspace':
        return await validateGoogleWorkspace(config as GoogleWorkspaceConfig, start)
      default:
        return {
          valid: true, status: 'unknown',
          message: `Validation not implemented for ${connector.type} — assuming OK`,
          latencyMs: Date.now() - start,
          sampleEventCount: 0, lastEventAt: null, errors: [],
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown validation error'
    log.error({ err, connectorId, type: connector.type }, 'Connector validation failed')
    return {
      valid: false, status: 'error', message: msg,
      latencyMs: Date.now() - start,
      sampleEventCount: 0, lastEventAt: null, errors: [msg],
    }
  }
}

// ── M365 / Entra ID validator ─────────────────

async function validateM365(
  config: M365ConnectorConfig,
  startMs: number,
): Promise<ValidationResult> {
  // Get OAuth token from Microsoft
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`

  const tokenResp = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     config.clientId,
      client_secret: config.clientSecret,
      scope:         'https://graph.microsoft.com/.default',
      grant_type:    'client_credentials',
    }).toString(),
  })

  if (!tokenResp.ok) {
    const err = await tokenResp.text()
    return {
      valid: false, status: 'auth_failed',
      message: `M365 OAuth failed: ${err}`,
      latencyMs: Date.now() - startMs,
      sampleEventCount: 0, lastEventAt: null,
      errors: [`HTTP ${tokenResp.status}: ${err}`],
    }
  }

  const { access_token } = await tokenResp.json() as { access_token: string }

  // Test API call — fetch last 1 sign-in event
  const graphResp = await fetch(
    'https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=1',
    { headers: { Authorization: `Bearer ${access_token}` } },
  )

  if (!graphResp.ok) {
    return {
      valid: false, status: 'api_error',
      message: `Graph API returned ${graphResp.status}`,
      latencyMs: Date.now() - startMs,
      sampleEventCount: 0, lastEventAt: null,
      errors: [`Graph API error: ${graphResp.status}`],
    }
  }

  const data = await graphResp.json() as { value: Array<{ createdDateTime: string }> }
  const lastEvent = data.value?.[0]

  return {
    valid: true, status: 'healthy',
    message: 'M365 connector authenticated and data accessible',
    latencyMs:        Date.now() - startMs,
    sampleEventCount: data.value?.length ?? 0,
    lastEventAt:      lastEvent ? new Date(lastEvent.createdDateTime) : null,
    errors: [],
  }
}

// ── AWS CloudTrail validator ──────────────────

async function validateAwsCloudTrail(
  config:  AwsCloudTrailConfig,
  startMs: number,
): Promise<ValidationResult> {
  // Use AWS SDK to test assume-role + S3 list
  const { STSClient, AssumeRoleCommand } = await import('@aws-sdk/client-sts')
  const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3')

  const sts = new STSClient({ region: config.region })

  const assumed = await sts.send(new AssumeRoleCommand({
    RoleArn:         config.roleArn,
    RoleSessionName: 'zonforge-validator',
    DurationSeconds: 900,
  }))

  if (!assumed.Credentials) {
    return {
      valid: false, status: 'auth_failed',
      message: 'Could not assume IAM role',
      latencyMs: Date.now() - startMs,
      sampleEventCount: 0, lastEventAt: null,
      errors: ['STS AssumeRole failed'],
    }
  }

  const baseCreds = {
    accessKeyId:     assumed.Credentials.AccessKeyId!,
    secretAccessKey: assumed.Credentials.SecretAccessKey!,
  }
  const s3 = new S3Client({
    region: config.region,
    credentials: assumed.Credentials.SessionToken
      ? { ...baseCreds, sessionToken: assumed.Credentials.SessionToken }
      : baseCreds,
  })

  const listed = await s3.send(new ListObjectsV2Command({
    Bucket:  config.s3Bucket,
    Prefix:  config.s3Prefix || 'AWSLogs/',
    MaxKeys: 1,
  }))

  return {
    valid: true, status: 'healthy',
    message: `CloudTrail S3 bucket accessible (${listed.KeyCount ?? 0} objects found)`,
    latencyMs:        Date.now() - startMs,
    sampleEventCount: listed.KeyCount ?? 0,
    lastEventAt:      listed.Contents?.[0]?.LastModified ?? null,
    errors: [],
  }
}

// ── Google Workspace validator ────────────────

async function validateGoogleWorkspace(
  config:  GoogleWorkspaceConfig,
  startMs: number,
): Promise<ValidationResult> {
  // Test Google Reports API with service account
  const { google } = await import('googleapis')

  const auth = new google.auth.JWT({
    email:   JSON.parse(config.serviceAccountKeyJson).client_email,
    key:     JSON.parse(config.serviceAccountKeyJson).private_key,
    scopes:  ['https://www.googleapis.com/auth/admin.reports.audit.readonly'],
    subject: config.delegatedEmail,
  })

  const admin = google.admin({ version: 'reports_v1', auth })

  const resp = await admin.activities.list({
    userKey:         'all',
    applicationName: 'login',
    maxResults:      1,
  })

  return {
    valid: true, status: 'healthy',
    message: 'Google Workspace Reports API accessible',
    latencyMs:        Date.now() - startMs,
    sampleEventCount: resp.data.items?.length ?? 0,
    lastEventAt:      resp.data.items?.[0]?.id?.time
      ? new Date(resp.data.items[0].id.time)
      : null,
    errors: [],
  }
}
