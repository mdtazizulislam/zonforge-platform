import { z } from 'zod'

// ─────────────────────────────────────────────
// ZonForge Sentinel — IOC (Indicator of Compromise) Types
// ─────────────────────────────────────────────

export const IocTypeSchema = z.enum([
  'ip', 'domain', 'url',
  'file_hash_md5', 'file_hash_sha1', 'file_hash_sha256',
  'email', 'user_agent',
])
export type IocType = z.infer<typeof IocTypeSchema>

// Feed source confidence weights
// Higher weight = more reliable feed
export const FEED_CONFIDENCE_WEIGHTS: Record<string, number> = {
  'otx_alienvault':  0.75,
  'abuse_ch_urlhaus': 0.80,
  'abuse_ch_malwarebazaar': 0.85,
  'circl_hashlookup': 0.80,
  'abuseipdb':       0.70,
  'emerging_threats': 0.82,
  'recorded_future': 0.92,   // Phase 2 commercial
  'crowdstrike':     0.95,   // Phase 2 commercial
  'manual':          1.00,   // Platform-operator added
}

// Normalized IOC record (stored in PostgreSQL + Redis)
export interface NormalizedIoc {
  id:          string
  iocType:     IocType
  iocValue:    string          // normalized lowercase for IP/domain
  confidence:  number          // 0.0–1.0
  severity:    string
  feedSource:  string
  description: string | null
  tags:        string[]
  expiresAt:   Date | null
  firstSeenAt: Date
  lastSeenAt:  Date
  hitCount:    number
}

// Raw IOC from a feed (before normalization)
export interface RawFeedIoc {
  type:        IocType
  value:       string
  confidence?: number
  severity?:   string
  source:      string
  description?: string
  tags?:       string[]
  expiresAt?:  Date
  seenAt:      Date
}

// ── IOC value normalizer ──────────────────────

export function normalizeIocValue(type: IocType, value: string): string {
  switch (type) {
    case 'ip':
      return normalizeIp(value)
    case 'domain':
      return normalizeDomain(value)
    case 'url':
      return normalizeUrl(value)
    case 'file_hash_md5':
    case 'file_hash_sha1':
    case 'file_hash_sha256':
      return value.toLowerCase().trim()
    case 'email':
      return value.toLowerCase().trim()
    default:
      return value.trim()
  }
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim()
  // Remove IPv6 prefix for IPv4-mapped addresses
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7)
  }
  return trimmed
}

function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')  // strip protocol
    .replace(/\/.*$/, '')          // strip path
    .replace(/:\d+$/, '')          // strip port
    .replace(/^www\./, '')         // strip www.
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase()
}

// ── IOC value validator ───────────────────────

export function validateIocValue(type: IocType, value: string): boolean {
  switch (type) {
    case 'ip':
      return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) ||
             /^([0-9a-fA-F:]+)$/.test(value)   // IPv6
    case 'domain':
      return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(value)
    case 'file_hash_md5':
      return /^[a-fA-F0-9]{32}$/.test(value)
    case 'file_hash_sha1':
      return /^[a-fA-F0-9]{40}$/.test(value)
    case 'file_hash_sha256':
      return /^[a-fA-F0-9]{64}$/.test(value)
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    default:
      return value.length > 0 && value.length < 2048
  }
}

// ── Batch enrichment request/response ────────

export interface EnrichmentRequest {
  ips?:     string[]
  domains?: string[]
  hashes?:  string[]
  urls?:    string[]
}

export interface EnrichmentResult {
  matched: Array<{
    value:      string
    iocType:    IocType
    confidence: number
    severity:   string
    feedSource: string
    description: string | null
    tags:       string[]
    lastSeenAt: Date
  }>
  checkedCount: number
  matchedCount: number
  enrichedAt:   Date
}
