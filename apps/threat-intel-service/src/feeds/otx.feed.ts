import { createLogger } from '@zonforge/logger'
import { sleep } from '@zonforge/collector-base'
import type { NormalizedIoc } from '../types.js'
import {
  normalizeIocValue, isValidIoc, FEED_CONFIDENCE,
  confidenceToSeverity,
} from '../types.js'

// ─────────────────────────────────────────────
// AlienVault OTX Feed Ingestor
// API: https://otx.alienvault.com/api/v1
// Free tier: 10,000 IOCs per day
// Rate limit: 1 req/second
// ─────────────────────────────────────────────

const log = createLogger({ service: 'threat-intel:otx' })

const OTX_BASE = 'https://otx.alienvault.com/api/v1'
const SOURCE   = 'otx'
const CONF     = FEED_CONFIDENCE[SOURCE]!

export class OtxFeedIngestor {
  constructor(private readonly apiKey: string) {}

  // ── Fetch subscribed pulses (changed since last poll) ──────────

  async fetchPulsesSince(
    since:    Date,
    maxPages: number = 10,
  ): Promise<NormalizedIoc[]> {
    if (!this.apiKey) {
      log.warn('OTX API key not configured — skipping')
      return []
    }

    const iocs: NormalizedIoc[] = []
    let   page   = 1
    let   hasMore = true

    while (hasMore && page <= maxPages) {
      try {
        const url = `${OTX_BASE}/pulses/subscribed?modified_since=${since.toISOString()}&page=${page}&limit=50`

        const resp = await fetch(url, {
          headers: {
            'X-OTX-API-KEY': this.apiKey,
            'Accept':        'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        })

        if (!resp.ok) {
          log.error({ status: resp.status }, 'OTX API error')
          break
        }

        const data = await resp.json() as {
          results:  Array<OtxPulse>
          next:     string | null
          count:    number
        }

        for (const pulse of data.results) {
          const pulseIocs = this.parsePulse(pulse)
          iocs.push(...pulseIocs)
        }

        hasMore = !!data.next
        page++

        // Rate limit: 1 req/second
        if (hasMore) await sleep(1000)

      } catch (err) {
        log.error({ err, page }, 'OTX fetch error')
        break
      }
    }

    log.info({ count: iocs.length, since: since.toISOString() },
      'OTX pulses ingested')
    return iocs
  }

  // ── Fetch reputation for a specific IP ───────────────────────

  async getIpReputation(ip: string): Promise<NormalizedIoc | null> {
    if (!this.apiKey) return null

    try {
      const resp = await fetch(`${OTX_BASE}/indicators/IPv4/${ip}/reputation`, {
        headers: { 'X-OTX-API-KEY': this.apiKey },
        signal:  AbortSignal.timeout(10_000),
      })

      if (!resp.ok) return null

      const data = await resp.json() as {
        reputation?: { threat_score: number; activities: string[] }
      }

      if (!data.reputation || data.reputation.threat_score < 1) return null

      const rawConf = Math.min(data.reputation.threat_score / 10, 1.0)

      return {
        iocType:     'ip',
        iocValue:    normalizeIocValue('ip', ip),
        confidence:  rawConf * CONF,
        severity:    confidenceToSeverity(rawConf * CONF),
        feedSource:  SOURCE,
        description: data.reputation.activities.join(', '),
        tags:        data.reputation.activities,
        firstSeenAt: new Date(),
        lastSeenAt:  new Date(),
        expiresAt:   new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
    } catch {
      return null
    }
  }

  // ── Parse pulse into IOCs ─────────────────────────────────────

  private parsePulse(pulse: OtxPulse): NormalizedIoc[] {
    const iocs:      NormalizedIoc[] = []
    const now        = new Date()
    const expiresAt  = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days

    for (const indicator of pulse.indicators ?? []) {
      const iocType = mapOtxType(indicator.type)
      if (!iocType) continue

      const normalized = normalizeIocValue(iocType, indicator.indicator)
      if (!isValidIoc(iocType, normalized)) continue

      iocs.push({
        iocType,
        iocValue:    normalized,
        confidence:  CONF,
        severity:    confidenceToSeverity(CONF),
        feedSource:  SOURCE,
        description: `OTX Pulse: ${pulse.name}`,
        tags:        pulse.tags ?? [],
        firstSeenAt: new Date(indicator.created ?? pulse.created),
        lastSeenAt:  new Date(pulse.modified),
        expiresAt,
        rawData: {
          pulseId:     pulse.id,
          pulseName:   pulse.name,
          indicatorId: indicator.id,
          indicatorType: indicator.type,
        },
      })
    }

    return iocs
  }
}

// ── OTX API Types ─────────────────────────────

interface OtxPulse {
  id:         string
  name:       string
  description: string
  created:    string
  modified:   string
  tags:       string[]
  indicators: Array<{
    id:        number
    indicator: string
    type:      string
    created:   string
  }>
}

// ── OTX indicator type → IocType mapping ─────

function mapOtxType(otxType: string): 'ip' | 'domain' | 'url' | 'file_hash_md5' | 'file_hash_sha1' | 'file_hash_sha256' | null {
  const map: Record<string, 'ip' | 'domain' | 'url' | 'file_hash_md5' | 'file_hash_sha1' | 'file_hash_sha256'> = {
    'IPv4':       'ip',
    'IPv6':       'ip',
    'domain':     'domain',
    'hostname':   'domain',
    'URL':        'url',
    'FileHash-MD5':    'file_hash_md5',
    'FileHash-SHA1':   'file_hash_sha1',
    'FileHash-SHA256': 'file_hash_sha256',
  }
  return map[otxType] ?? null
}
