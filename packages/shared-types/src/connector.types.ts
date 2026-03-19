import { z } from 'zod'

// ─────────────────────────────────────────────
// CONNECTOR TYPES
// ─────────────────────────────────────────────

export const ConnectorTypeSchema = z.enum([
  'm365_entra',
  'aws_cloudtrail',
  'google_workspace',
  'azure_activity',
  'gcp_audit',
  'api_gateway_aws',
  'api_gateway_kong',
  'cloudflare_waf',
  'aws_waf',
  'generic_syslog',
  'generic_webhook',
  'vulnerability_scan_upload',
  'edr_crowdstrike',
  'edr_sentinelone',
])
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>

export const ConnectorStatusSchema = z.enum([
  'active',
  'degraded',
  'error',
  'paused',
  'pending_auth',
])
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>

export const ConnectorSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: ConnectorTypeSchema,
  status: ConnectorStatusSchema,
  config: z.record(z.unknown()),    // encrypted at rest
  pollIntervalMinutes: z.number().int().min(1).max(60).default(5),
  lastPollAt: z.date().nullable(),
  lastEventAt: z.date().nullable(),
  lastErrorAt: z.date().nullable(),
  lastErrorMessage: z.string().nullable(),
  eventRatePerHour: z.number().default(0),
  totalEventsIngested: z.bigint().default(0n),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Connector = z.infer<typeof ConnectorSchema>

export const ConnectorHealthSchema = z.object({
  connectorId: z.string().uuid(),
  status: ConnectorStatusSchema,
  lastPollAt: z.date().nullable(),
  lastEventAt: z.date().nullable(),
  eventRatePerHour: z.number(),
  lagMinutes: z.number(),           // minutes since last successful poll
  errorCount24h: z.number().int(),
  message: z.string().optional(),
})
export type ConnectorHealth = z.infer<typeof ConnectorHealthSchema>

// Per-type auth config schemas (stored encrypted)
export const M365ConnectorConfigSchema = z.object({
  tenantId: z.string(),             // Azure tenant ID (not ZonForge tenant)
  clientId: z.string(),
  clientSecret: z.string(),         // stored encrypted
  scopes: z.array(z.string()),
})
export type M365ConnectorConfig = z.infer<typeof M365ConnectorConfigSchema>

export const AwsCloudTrailConfigSchema = z.object({
  roleArn: z.string(),              // IAM role to assume
  region: z.string(),
  s3Bucket: z.string(),
  s3Prefix: z.string().default(''),
  sqsQueueUrl: z.string().optional(),
})
export type AwsCloudTrailConfig = z.infer<typeof AwsCloudTrailConfigSchema>

export const GoogleWorkspaceConfigSchema = z.object({
  serviceAccountKeyJson: z.string(), // stored encrypted
  delegatedEmail: z.string().email(),
  customerId: z.string(),
})
export type GoogleWorkspaceConfig = z.infer<typeof GoogleWorkspaceConfigSchema>
