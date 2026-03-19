import { z } from 'zod'

// ─────────────────────────────────────────────
// IOC TYPES & NORMALIZATION
// ─────────────────────────────────────────────

export const IocTypeSchema = z.enum([
  'ip',
  'domain',
  'url',
  'file_hash_md5',
  'file_hash_sha1',
  'file_hash_sha256',
  'email',
  'user_agent',
])
export type IocType = z.infer<typeof IocTypeSchema>

export interface NormalizedIoc {
  iocType:     IocType
  iocValue:    string     // normalized (lowercase, trimmed)
  confidence:  number     // 0.0 – 1.0
  severity:    string     // critical | high | medium | low
  feedSource:  string     // otx | abuseipdb | urlhaus | malwarebazaar | internal
  description: string
  tags:        string[]
  firstSeenAt: Date
  lastSeenAt:  Date
  expiresAt:   Date | null
  rawData?:    Record<string, unknown>
}

// ── Feed source confidence weights ────────────
// Higher = more trusted feed

export const FEED_CONFIDENCE: Record<string, number> = {
  otx:            0.70,
  abuseipdb:      0.75,
  urlhaus:        0.80,
  malwarebazaar:  0.85,
  abuse_ch_feodo: 0.85,
  internal:       0.95,
}

// ── Severity from confidence ──────────────────

export function confidenceToSeverity(confidence: number): string {
  if (confidence >= 0.85) return 'critical'
  if (confidence >= 0.70) return 'high'
  if (confidence >= 0.50) return 'medium'
  return 'low'
}

// ── IOC value normalization ───────────────────

export function normalizeIocValue(type: IocType, value: string): string {
  const v = value.trim().toLowerCase()

  switch (type) {
    case 'ip':
      // Normalize IPv4-mapped IPv6 → IPv4
      return v.replace(/^::ffff:/, '')
    case 'domain':
      // Remove trailing dot, www prefix normalization
      return v.replace(/\.$/, '').replace(/^www\./, '')
    case 'url':
      // Remove trailing slash, normalize scheme
      return v.replace(/\/$/, '')
    case 'file_hash_md5':
    case 'file_hash_sha1':
    case 'file_hash_sha256':
      return v.replace(/[^a-f0-9]/g, '')
    case 'email':
      return v
    default:
      return v
  }
}

// ── IOC value validation ──────────────────────

export function isValidIoc(type: IocType, value: string): boolean {
  switch (type) {
    case 'ip': {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
      const ipv6 = /^[0-9a-f:]+$/i
      if (!ipv4.test(value) && !ipv6.test(value)) return false
      // Reject private/loopback ranges
      const parts = value.split('.').map(Number)
      if (parts[0] === 10) return false
      if (parts[0] === 127) return false
      if (parts[0] === 172 && parts[1] !== undefined && parts[1] >= 16 && parts[1] <= 31) return false
      if (parts[0] === 192 && parts[1] === 168) return false
      if (value === '0.0.0.0' || value === '255.255.255.255') return false
      return true
    }
    case 'domain':
      return /^[a-z0-9][a-z0-9.-]{1,252}[a-z0-9]$/.test(value) &&
             !value.includes('..')
    case 'file_hash_md5':
      return /^[a-f0-9]{32}$/.test(value)
    case 'file_hash_sha1':
      return /^[a-f0-9]{40}$/.test(value)
    case 'file_hash_sha256':
      return /^[a-f0-9]{64}$/.test(value)
    case 'url':
      return value.startsWith('http://') || value.startsWith('https://')
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    default:
      return value.length > 0
  }
}

// ── Batch enrichment request/response ─────────

export interface EnrichmentRequest {
  events: Array<{
    eventId:    string
    actorIp?:   string | null
    targetDomain?: string | null
    fileHash?:  string | null
    userAgent?: string | null
  }>
}

export interface EnrichmentMatch {
  eventId:    string
  matched:    boolean
  iocType?:   IocType
  iocValue?:  string
  confidence?: number
  severity?:  string
  feedSource?: string
  description?: string
}

export interface EnrichmentResponse {
  matches:    EnrichmentMatch[]
  totalMatched: number
  latencyMs:  number
}
