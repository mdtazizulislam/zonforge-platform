import { z } from 'zod'

// ─────────────────────────────────────────────
// DECEPTION TECHNOLOGY — DOMAIN TYPES
// ─────────────────────────────────────────────

export type HoneypotType =
  | 'fake_credential'        // username/password pair that nobody should use
  | 'fake_api_key'           // API key that triggers on any use
  | 'fake_s3_bucket'         // AWS S3 bucket name planted in configs
  | 'fake_admin_account'     // AD/Entra user account nobody should log into
  | 'fake_database_server'   // DB hostname that nobody should query
  | 'fake_ssh_key'           // Private key planted in scripts/config files
  | 'fake_webhook_url'       // URL endpoint that logs any caller
  | 'fake_internal_service'  // Fake microservice URL planted in env vars
  | 'canary_document'        // Document that phones home if opened
  | 'canary_email'           // Email address nobody should contact

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
  lastTriggeredAt?: Date
  triggers:     HoneypotTrigger[]

  // Lifecycle
  deployedAt:   Date
  retiredAt?:   Date
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
  actorIp?:       string
  actorUserId?:   string
  actorCountry?:  string
  actorUserAgent?: string

  // How it was triggered
  triggerMethod:  'login_attempt' | 'api_call' | 'bucket_access' | 'dns_lookup'
                 | 'document_open' | 'email_sent' | 'http_request' | 'unknown'
  triggerContext: Record<string, unknown>

  // Derived intel
  isExternal:     boolean
  threatScore:    number     // 0–100
  linkedAlertId?: string
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
    'fake_credential','fake_api_key','fake_s3_bucket','fake_admin_account',
    'fake_database_server','fake_ssh_key','fake_webhook_url',
    'fake_internal_service','canary_document','canary_email',
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
    case 'fake_credential':
      return `honeypot_svc_${tenantSlug}_${id}`    // username format
    case 'fake_api_key':
      return `zfhp_${id}${Math.random().toString(36).slice(2, 34)}`
    case 'fake_s3_bucket':
      return `${tenantSlug}-internal-backup-${id}`
    case 'fake_admin_account':
      return `svc.backup.admin.${id}@${tenantSlug}.internal`
    case 'fake_database_server':
      return `db-backup-${id}.internal.${tenantSlug}.com`
    case 'fake_ssh_key':
      return `-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA[HONEYPOT:${id}]\n-----END OPENSSH PRIVATE KEY-----`
    case 'fake_webhook_url':
      return `https://hooks.${tenantSlug}.internal/webhook/${id}/ingest`
    case 'fake_internal_service':
      return `http://svc-internal-${id}.${tenantSlug}.local:8080`
    case 'canary_document':
      return `confidential_roadmap_${id}.docx`
    case 'canary_email':
      return `archive.backup.${id}@${tenantSlug}.com`
    default:
      return `honeypot-${id}`
  }
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
    type:         'fake_credential',
    placement:    'm365_sharepoint',
    description:  'Fake admin username/password planted in SharePoint IT runbook. Any login attempt = immediate compromise indicator.',
    tags:         ['credential', 'identity', 'high-value'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Fake AWS API Key',
    type:         'fake_api_key',
    placement:    'aws_parameter_store',
    description:  'Decommissioned-looking AWS key planted in legacy config. Any API call = credential theft indicator.',
    tags:         ['aws', 'cloud', 'api-key'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Fake S3 Backup Bucket',
    type:         'fake_s3_bucket',
    placement:    'github_repo',
    description:  'Fake S3 bucket name planted in old deployment scripts. Any access = attacker probing cloud resources.',
    tags:         ['s3', 'cloud', 'storage'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Fake Service Account',
    type:         'fake_admin_account',
    placement:    'confluence_page',
    description:  'Dormant admin account documented in Confluence "emergency access" page. Any login = insider threat or lateral movement.',
    tags:         ['identity', 'service-account'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Canary Document: Strategy 2025',
    type:         'canary_document',
    placement:    'm365_sharepoint',
    description:  'Document titled "Confidential M&A Strategy 2025" planted in SharePoint. Any open or download = data exfiltration.',
    tags:         ['document', 'canary', 'exfil'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
  {
    name:         'Fake Database Server',
    type:         'fake_database_server',
    placement:    'aws_parameter_store',
    description:  'Decommissioned DB hostname in Parameter Store. Any connection attempt = lateral movement indicator.',
    tags:         ['database', 'lateral-movement'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
  {
    name:         'Canary Email: IT Helpdesk',
    type:         'canary_email',
    placement:    'email_signature',
    description:  'Fake IT helpdesk email planted in auto-signature. Any email = phishing campaign or insider threat.',
    tags:         ['email', 'phishing'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
  {
    name:         'Fake Internal Webhook',
    type:         'fake_webhook_url',
    placement:    'slack_message',
    description:  'Webhook URL posted in historical Slack message. Any HTTP call = attacker harvesting internal URLs.',
    tags:         ['webhook', 'recon'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
  {
    name:         'Fake SSH Key in Scripts',
    type:         'fake_ssh_key',
    placement:    'github_repo',
    description:  'Invalidated-looking private key in archived repo. Any use attempt = SSH key harvesting.',
    tags:         ['ssh', 'credential'],
    alertOnTrigger: true,
    alertSeverity:  'critical',
  },
  {
    name:         'Fake Internal Service URL',
    type:         'fake_internal_service',
    placement:    'aws_parameter_store',
    description:  'Non-existent internal microservice URL in Parameter Store. Any connection = network reconnaissance.',
    tags:         ['recon', 'network'],
    alertOnTrigger: true,
    alertSeverity:  'high',
  },
]
