import { z } from 'zod'

// ─────────────────────────────────────────────
// DECEPTION TECHNOLOGY — HONEYPOT GRID
//
// Platform-native honeypots that require ZERO
// infrastructure beyond the ZonForge platform itself.
//
// Honeypot types:
//   credential  — fake usernames/passwords in config files
//   aws_key     — fake AWS access keys (canary tokens)
//   api_token   — fake API tokens in env files / docs
//   s3_bucket   — fake S3 bucket names (watched for access)
//   user_account— fake admin accounts (watched for login)
//   dns_canary  — canary DNS records (unique per tenant)
//   oauth_client— fake OAuth client_id/secret pair
//   db_record   — fake database records with tracking IDs
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

export type HoneypotStatus = 'active' | 'triggered' | 'decommissioned' | 'deploying'

export type TriggerConfidence = 'definite' | 'high' | 'medium'

// ─────────────────────────────────────────────
// HONEYPOT DEFINITION
// ─────────────────────────────────────────────

export interface Honeypot {
  id:          string
  tenantId:    string
  type:        HoneypotType
  name:        string
  description: string
  status:      HoneypotStatus

  // The decoy value (what the attacker will see/steal)
  decoyValue:  string
  // Tracking token embedded in the decoy
  trackingToken: string

  // Deployment
  deployedAt:   Date | null
  deployedTo:   string | null   // service/location where planted
  instructions: string          // how to plant it

  // Trigger state
  triggeredAt:  Date | null
  triggerCount: number
  lastTriggerDetails: TriggerEvent | null

  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────
// TRIGGER EVENT
// ─────────────────────────────────────────────

export interface TriggerEvent {
  honeypotId:    string
  tenantId:      string
  triggeredAt:   Date
  confidence:    TriggerConfidence
  triggerType:   string   // 'api_key_used' | 'login_attempt' | 's3_access' | etc.
  sourceIp?:     string | undefined
  sourceCountry?: string | undefined
  userAgent?:    string | undefined
  requestPath?:  string | undefined
  rawRequest?:   Record<string, unknown> | undefined
  alertId?:      string | undefined   // linked alert
}

// ─────────────────────────────────────────────
// HONEYPOT GRID STATS
// ─────────────────────────────────────────────

export interface GridStats {
  tenantId:        string
  totalHoneypots:  number
  activeHoneypots: number
  triggeredLast30d: number
  byType:          Record<HoneypotType, number>
  recentTriggers:  TriggerEvent[]
  threatActors:    Array<{ ip: string; triggerCount: number; lastSeen: Date }>
  calculatedAt:    Date
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const DeployHoneypotSchema = z.object({
  type:      z.enum(['credential','aws_key','api_token','s3_bucket','user_account','dns_canary','oauth_client','db_record']),
  name:      z.string().min(1).max(200).optional(),
  deployAll: z.boolean().default(false),
})

export const TriggerHoneypotSchema = z.object({
  trackingToken: z.string(),
  triggerType:   z.string(),
  sourceIp:      z.string().optional(),
  userAgent:     z.string().optional(),
  requestPath:   z.string().optional(),
  rawRequest:    z.record(z.unknown()).optional(),
})

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

export const HONEYPOT_META: Record<HoneypotType, {
  label:       string
  emoji:       string
  description: string
  deployTime:  string
  falsePositiveRate: string
}> = {
  credential: {
    label: 'Fake Credentials',
    emoji: '🔑',
    description: 'Username/password pairs planted in config files, wikis, or documentation',
    deployTime:  '< 1 minute',
    falsePositiveRate: '0%',
  },
  aws_key: {
    label: 'AWS Canary Key',
    emoji: '☁️',
    description: 'Fake AWS access key that alerts on any API call — immediate detection of credential theft',
    deployTime:  '2 minutes',
    falsePositiveRate: '0%',
  },
  api_token: {
    label: 'API Token Trap',
    emoji: '🎣',
    description: 'Fake API token planted in .env files, code comments, or documentation',
    deployTime:  '< 1 minute',
    falsePositiveRate: '0%',
  },
  s3_bucket: {
    label: 'Fake S3 Bucket',
    emoji: '🪣',
    description: 'S3 bucket name planted in configs — access triggers immediate alert',
    deployTime:  '3 minutes',
    falsePositiveRate: '0%',
  },
  user_account: {
    label: 'Ghost Admin Account',
    emoji: '👻',
    description: 'Fake admin account that should never be logged into — any login is an attack',
    deployTime:  '2 minutes',
    falsePositiveRate: '0%',
  },
  dns_canary: {
    label: 'DNS Canary',
    emoji: '🐦',
    description: 'Unique DNS record — any DNS resolution reveals attacker\'s infrastructure',
    deployTime:  '1 minute',
    falsePositiveRate: '0%',
  },
  oauth_client: {
    label: 'OAuth Canary App',
    emoji: '🔐',
    description: 'Fake OAuth client credentials — use triggers immediate detection',
    deployTime:  '2 minutes',
    falsePositiveRate: '0%',
  },
  db_record: {
    label: 'Database Canary Record',
    emoji: '🗄️',
    description: 'Fake database record with embedded tracking token — access reveals SQL injection or insider threat',
    deployTime:  '1 minute',
    falsePositiveRate: '0%',
  },
}
