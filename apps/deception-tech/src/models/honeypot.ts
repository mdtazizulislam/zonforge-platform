import { z } from 'zod'

// ─────────────────────────────────────────────
// DECEPTION TECHNOLOGY — DOMAIN TYPES
// ─────────────────────────────────────────────

export type HoneypotType =
  | 'credential'
  | 'aws_key'
  | 'api_token'
  | 's3_bucket'
  | 'user_account'
  | 'dns_canary'
  | 'oauth_client'
  | 'db_record'

export type HoneypotStatus = 'active' | 'triggered' | 'retired' | 'deploying'

export type HoneypotPlacement =
  | 'm365_sharepoint'   // Planted in SharePoint documents/configs
  | 'aws_parameter_store' // AWS Parameter Store fake secret
  | 'github_repo'       // Planted in repo config/env files
  | 'confluence_page'   // Planted in Confluence documentation
  | 'email_signature'   // Fake contact in email signature
  | 'slack_message'     // Posted in internal Slack channels
  | 'custom'

// ─────────────────────────────────────────────
// HONEYPOT
// ─────────────────────────────────────────────

export interface Honeypot {
  id:           string
  tenantId:     string
  name:         string
  type:         HoneypotType
  status:       HoneypotStatus
  placement:    HoneypotPlacement
  value:        string    // The actual decoy value (masked in API)
  description:  string
  tags:         string[]

  // Detection tracking
  triggerCount: number
  lastTriggeredAt?: Date | undefined
  triggers:     HoneypotTrigger[]

  // Lifecycle
  deployedAt:   Date
  retiredAt?:   Date | undefined
  createdBy:    string

  // Auto-alert config
  alertOnTrigger:  boolean
  alertSeverity:   'critical' | 'high' | 'medium'
}

// ─────────────────────────────────────────────
// TRIGGER EVENT
// ─────────────────────────────────────────────

export interface HoneypotTrigger {
  id:            string
  honeypotId:    string
  tenantId:      string
  triggeredAt:   Date

  // Who triggered it
  actorIp?:       string | undefined
  actorUserId?:   string | undefined
  actorCountry?:  string | undefined
  actorUserAgent?: string | undefined

  // How it was triggered
  triggerMethod:  'login_attempt' | 'api_call' | 'bucket_access' | 'dns_lookup'
                 | 'document_open' | 'email_sent' | 'http_request' | 'unknown'
  triggerContext: Record<string, unknown>

  // Derived intel
  isExternal:     boolean
  threatScore:    number     // 0–100
  linkedAlertId?: string | undefined
}

export type TriggerConfidence = 'definite' | 'high' | 'medium'

export interface TriggerEvent {
  honeypotId: string
  tenantId: string
  triggeredAt: Date
  confidence: TriggerConfidence
  triggerType: string
  sourceIp?: string | undefined
  userAgent?: string | undefined
  requestPath?: string | undefined
  rawRequest?: Record<string, unknown> | undefined
}

// ─────────────────────────────────────────────
// HONEYPOT GRID SUMMARY
// ─────────────────────────────────────────────

export interface HoneypotGridSummary {
  tenantId:       string
  totalHoneypots: number
  activeCount:    number
  triggeredCount: number
  triggersLast30d: number
  zeroFalsePositives: boolean
  coverageByType:  Record<HoneypotType, number>
  topTriggers:    HoneypotTrigger[]
  riskSignals:    string[]
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const DeployHoneypotSchema = z.object({
  name:         z.string().min(1).max(200),
  type:         z.enum([
    'credential','aws_key','api_token','s3_bucket',
    'user_account','dns_canary','oauth_client','db_record',
  ]),
  placement:    z.enum([
    'm365_sharepoint','aws_parameter_store','github_repo',
    'confluence_page','email_signature','slack_message','custom',
  ]),
  description:  z.string().max(500).default(''),
  tags:         z.array(z.string()).default([]),
  alertSeverity: z.enum(['critical','high','medium']).default('critical'),
})

// ─────────────────────────────────────────────
// HONEYPOT VALUE GENERATORS
//
// Generates realistic-looking decoy values
// that will alert on any use (zero false positives)
// ─────────────────────────────────────────────

export function generateHoneypotValue(type: HoneypotType, tenantSlug: string): string {
  const id = Math.random().toString(36).slice(2, 10)

  switch (type) {
    case 'credential':
      return `honeypot_svc_${tenantSlug}_${id}`    // username format
    case 'aws_key':
      return `zfhp_${id}${Math.random().toString(36).slice(2, 34)}`
    case 's3_bucket':
      return `${tenantSlug}-internal-backup-${id}`
    case 'user_account':
      return `svc.backup.admin.${id}@${tenantSlug}.internal`
    case 'db_record':
      return `db-backup-${id}.internal.${tenantSlug}.com`
    case 'api_token':
      return `zftok_${tenantSlug}_${id}_${Math.random().toString(36).slice(2, 12)}`
    case 'dns_canary':
      return `canary-${id}.${tenantSlug}.internal`
    case 'oauth_client':
      return `oauth-${tenantSlug}-${id}`
    default:
      return `honeypot-${id}`
  }
}

export const HONEYPOT_META: Record<HoneypotType, { description: string }> = {
  credential: { description: 'Username/password credential canary' },
  aws_key: { description: 'AWS access key canary' },
  api_token: { description: 'API token canary' },
  s3_bucket: { description: 'S3 bucket reference canary' },
  user_account: { description: 'User account canary' },
  dns_canary: { description: 'DNS canary token' },
  oauth_client: { description: 'OAuth client secret canary' },
  db_record: { description: 'Database record canary' },
}

// ─────────────────────────────────────────────
// RECOMMENDED HONEYPOT GRID
// 10 default honeypots per tenant
// ─────────────────────────────────────────────

export const RECOMMENDED_GRID: Array<Omit<Honeypot,
  'id'|'tenantId'|'status'|'value'|'triggerCount'|'triggers'|'deployedAt'|'createdBy'|'lastTriggeredAt'|'retiredAt'
>> = [
  {
    name:         'Fake Admin Credential',
    type:         'credential',
    placement:    'm365_sharepoint',
    description:  'Fake admin username/password planted in SharePoint IT runbook. Any login attempt = immediate compromise indicator.',
    tags:         ['credential', 'identity', 'high-value'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Fake AWS API Key',
    type:         'aws_key',
    placement:    'aws_parameter_store',
    description:  'Decommissioned-looking AWS key planted in legacy config. Any API call = credential theft indicator.',
    tags:         ['aws', 'cloud', 'api-key'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Fake S3 Backup Bucket',
    type:         's3_bucket',
    placement:    'github_repo',
    description:  'Fake S3 bucket name planted in old deployment scripts. Any access = attacker probing cloud resources.',
    tags:         ['s3', 'cloud', 'storage'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Fake Service Account',
    type:         'user_account',
    placement:    'confluence_page',
    description:  'Dormant admin account documented in Confluence "emergency access" page. Any login = insider threat or lateral movement.',
    tags:         ['identity', 'service-account'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Canary DNS Token',
    type:         'dns_canary',
    placement:    'm365_sharepoint',
    description:  'Document titled "Confidential M&A Strategy 2025" planted in SharePoint. Any open or download = data exfiltration.',
    tags:         ['document', 'canary', 'exfil'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
  {
    name:         'Database Canary Record',
    type:         'db_record',
    placement:    'aws_parameter_store',
    description:  'Decommissioned DB hostname in Parameter Store. Any connection attempt = lateral movement indicator.',
    tags:         ['database', 'lateral-movement'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
  {
    name:         'API Token Canary',
    type:         'api_token',
    placement:    'email_signature',
    description:  'Fake API token planted in communication channels and config snippets.',
    tags:         ['api', 'token'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
  {
    name:         'OAuth Client Canary',
    type:         'oauth_client',
    placement:    'slack_message',
    description:  'OAuth secret published as decoy. Any use indicates credential harvesting.',
    tags:         ['oauth', 'recon'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
]
