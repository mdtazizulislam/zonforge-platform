import { createLogger } from '@zonforge/logger'
import type { NormalizedIoc } from '../types.js'
import {
  normalizeIocValue, isValidIoc,
  FEED_CONFIDENCE, confidenceToSeverity,
} from '../types.js'

// ─────────────────────────────────────────────
// Abuse.ch Feed Ingestors
//
// URLhaus:       https://urlhaus-api.abuse.ch
// MalwareBazaar: https://bazaar.abuse.ch/api
// Feodo Tracker: https://feodotracker.abuse.ch/downloads
//
// All are free, no API key required
// Rate limit: be respectful, max 1 req/second
// ─────────────────────────────────────────────

const log = createLogger({ service: 'threat-intel:abuse-ch' })

// ── URLhaus — malware distribution URLs ───────────────────────

export async function fetchUrlhausRecent(
  limitHours = 24,
): Promise<NormalizedIoc[]> {
  const SOURCE = 'urlhaus'
  const CONF   = FEED_CONFIDENCE[SOURCE]!
  const iocs:  NormalizedIoc[] = []

  try {
    const resp = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/limit/1000/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    'limit=1000',
      signal:  AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      log.error({ status: resp.status }, 'URLhaus API error')
      return []
    }

    const data = await resp.json() as {
      query_status: string
      urls: Array<{
        id:           string
        date_added:   string
        url:          string
        url_status:   string
        threat:       string
        tags:         string[] | null
        host:         string
      }>
    }

    const cutoff = new Date(Date.now() - limitHours * 60 * 60 * 1000)

    for (const u of data.urls ?? []) {
      const addedAt = new Date(u.date_added)
      if (addedAt < cutoff) continue

      // Submit URL as IOC
      const urlNorm = normalizeIocValue('url', u.url)
      if (urlNorm && isValidIoc('url', urlNorm)) {
        iocs.push({
          iocType:     'url',
          iocValue:    urlNorm,
          confidence:  CONF,
          severity:    'high',
          feedSource:  SOURCE,
          description: `URLhaus: ${u.threat} distribution URL`,
          tags:        u.tags ?? [],
          firstSeenAt: addedAt,
          lastSeenAt:  addedAt,
          expiresAt:   new Date(addedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
          rawData:     { urlhausId: u.id, status: u.url_status, threat: u.threat },
        })
      }

      // Also submit the host as domain IOC
      if (u.host && !u.host.match(/^\d/)) {
        const domainNorm = normalizeIocValue('domain', u.host)
        if (domainNorm && isValidIoc('domain', domainNorm)) {
          iocs.push({
            iocType:     'domain',
            iocValue:    domainNorm,
            confidence:  CONF * 0.85,  // slightly lower than URL
            severity:    'medium',
            feedSource:  SOURCE,
            description: `URLhaus: malware hosting domain`,
            tags:        u.tags ?? [],
            firstSeenAt: addedAt,
            lastSeenAt:  addedAt,
            expiresAt:   new Date(addedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
          })
        }
      }
    }

    log.info({ count: iocs.length }, 'URLhaus IOCs ingested')
  } catch (err) {
    log.error({ err }, 'URLhaus fetch failed')
  }

  return iocs
}

// ── MalwareBazaar — malware file hashes ───────────────────────

export async function fetchMalwareBazaarRecent(
  limitHours = 24,
): Promise<NormalizedIoc[]> {
  const SOURCE = 'malwarebazaar'
  const CONF   = FEED_CONFIDENCE[SOURCE]!
  const iocs:  NormalizedIoc[] = []

  try {
    const resp = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    'query=get_recent&selector=time',
      signal:  AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      log.error({ status: resp.status }, 'MalwareBazaar API error')
      return []
    }

    const data = await resp.json() as {
      query_status: string
      data: Array<{
        sha256_hash:  string
        sha1_hash:    string
        md5_hash:     string
        first_seen:   string
        last_seen:    string
        file_name:    string
        file_type:    string
        tags:         string[] | null
        vendor_intel: Record<string, unknown>
        signature:    string | null
      }>
    }

    const cutoff = new Date(Date.now() - limitHours * 60 * 60 * 1000)

    for (const sample of data.data ?? []) {
      const firstSeen = new Date(sample.first_seen)
      if (firstSeen < cutoff) continue

      // Boost confidence if multiple AV vendors detect it
      const vendorCount = Object.keys(sample.vendor_intel ?? {}).length
      const boost       = Math.min(vendorCount * 0.02, 0.15)
      const confidence  = Math.min(CONF + boost, 0.98)

      const expires = new Date(firstSeen.getTime() + 90 * 24 * 60 * 60 * 1000)
      const tags    = sample.tags ?? []
      const desc    = `MalwareBazaar: ${sample.signature ?? sample.file_type} malware`

      // SHA256
      if (sample.sha256_hash) {
        const val = normalizeIocValue('file_hash_sha256', sample.sha256_hash)
        if (isValidIoc('file_hash_sha256', val)) {
          iocs.push({
            iocType:     'file_hash_sha256',
            iocValue:    val,
            confidence,
            severity:    confidenceToSeverity(confidence),
            feedSource:  SOURCE,
            description: desc,
            tags,
            firstSeenAt: firstSeen,
            lastSeenAt:  new Date(sample.last_seen),
            expiresAt:   expires,
            rawData: {
              sha1:      sample.sha1_hash,
              md5:       sample.md5_hash,
              fileType:  sample.file_type,
              signature: sample.signature,
              vendorDetections: vendorCount,
            },
          })
        }
      }
    }

    log.info({ count: iocs.length }, 'MalwareBazaar IOCs ingested')
  } catch (err) {
    log.error({ err }, 'MalwareBazaar fetch failed')
  }

  return iocs
}

// ── Feodo Tracker — C2 server IPs ─────────────────────────────

export async function fetchFeodoC2Ips(): Promise<NormalizedIoc[]> {
  const SOURCE = 'abuse_ch_feodo'
  const CONF   = FEED_CONFIDENCE[SOURCE]!
  const iocs:  NormalizedIoc[] = []

  try {
    const resp = await fetch(
      'https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.json',
      { signal: AbortSignal.timeout(30_000) },
    )

    if (!resp.ok) {
      log.error({ status: resp.status }, 'Feodo Tracker API error')
      return []
    }

    const data = await resp.json() as Array<{
      ip_address:  string
      port:        number
      status:      string
      hostname:    string | null
      as_number:   number
      as_name:     string
      country:     string
      first_seen:  string
      last_online: string
      malware:     string
    }>

    for (const entry of data) {
      const ipNorm = normalizeIocValue('ip', entry.ip_address)
      if (!isValidIoc('ip', ipNorm)) continue

      iocs.push({
        iocType:     'ip',
        iocValue:    ipNorm,
        confidence:  CONF,
        severity:    'critical',   // C2 servers are always critical
        feedSource:  SOURCE,
        description: `Feodo C2: ${entry.malware} command & control server`,
        tags:        ['c2', 'botnet', entry.malware.toLowerCase()],
        firstSeenAt: new Date(entry.first_seen),
        lastSeenAt:  new Date(entry.last_online),
        expiresAt:   null,   // C2 IPs never expire automatically
        rawData: {
          port:      entry.port,
          status:    entry.status,
          asNumber:  entry.as_number,
          asName:    entry.as_name,
          country:   entry.country,
          malware:   entry.malware,
        },
      })
    }

    log.info({ count: iocs.length }, 'Feodo C2 IPs ingested')
  } catch (err) {
    log.error({ err }, 'Feodo Tracker fetch failed')
  }

  return iocs
}

// ── AbuseIPDB lookup (per-IP check) ─────────────────────────────

export async function checkAbuseIpDb(
  ip:     string,
  apiKey: string,
): Promise<NormalizedIoc | null> {
  if (!apiKey) return null

  try {
    const resp = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=30`,
      {
        headers: {
          Key:    apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!resp.ok) return null

    const result = await resp.json() as {
      data: {
        abuseConfidenceScore: number
        totalReports:         number
        isPublicProxy:        boolean
        isTor:                boolean
        usageType:            string
        domain:               string
        countryCode:          string
        lastReportedAt:       string
      }
    }

    const score = result.data.abuseConfidenceScore
    if (score < 25) return null   // Low confidence — not actionable

    const confidence = (score / 100) * FEED_CONFIDENCE['abuseipdb']!

    return {
      iocType:     'ip',
      iocValue:    normalizeIocValue('ip', ip),
      confidence,
      severity:    confidenceToSeverity(confidence),
      feedSource:  'abuseipdb',
      description: `AbuseIPDB: ${result.data.usageType ?? 'malicious IP'} (${result.data.totalReports} reports)`,
      tags: [
        result.data.isPublicProxy ? 'proxy' : '',
        result.data.isTor ? 'tor' : '',
        result.data.usageType?.toLowerCase().replace(' ', '_') ?? '',
      ].filter(Boolean),
      firstSeenAt: new Date(),
      lastSeenAt:  new Date(result.data.lastReportedAt),
      expiresAt:   new Date(Date.now() + 24 * 60 * 60 * 1000),
      rawData: {
        score:        score,
        totalReports: result.data.totalReports,
        isProxy:      result.data.isPublicProxy,
        isTor:        result.data.isTor,
        domain:       result.data.domain,
        country:      result.data.countryCode,
      },
    }
  } catch {
    return null
  }
}
