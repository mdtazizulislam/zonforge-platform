import { eq, and, lt, gt, inArray, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { Redis } from 'ioredis'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type { NormalizedIoc, IocType } from '../types.js'

// ─────────────────────────────────────────────
// IOC STORE
//
// Two-tier storage:
//  1. Redis hot-cache: top 100K active IOCs (HSET per type)
//     Key: zf:platform:ioc:{type}  →  field: value  →  JSON metadata
//     Read latency: <1ms
//
//  2. PostgreSQL: full IOC store with TTL and history
//     Read latency: <10ms
//     Used for miss fallback and analytics
// ─────────────────────────────────────────────

const log = createLogger({ service: 'threat-intel:store' })

// Max IOCs per type to keep in Redis hot-cache
const HOT_CACHE_LIMIT = 100_000
const CACHE_TTL_SECS  = 3600   // 1 hour

export class IocStore {
  constructor(private readonly redis: Redis) {}

  // ── Upsert batch of IOCs ───────────────────

  async upsertBatch(iocs: NormalizedIoc[]): Promise<{
    inserted: number
    updated:  number
    skipped:  number
  }> {
    if (iocs.length === 0) return { inserted: 0, updated: 0, skipped: 0 }

    const db = getDb()
    let inserted = 0
    let updated  = 0
    let skipped  = 0

    // Process in chunks of 500 to avoid huge SQL queries
    const chunkSize = 500
    for (let i = 0; i < iocs.length; i += chunkSize) {
      const chunk = iocs.slice(i, i + chunkSize)

      for (const ioc of chunk) {
        try {
          // Check if IOC already exists
          const existing = await db.select({
            id:         schema.threatIntelIocs.id,
            confidence: schema.threatIntelIocs.confidence,
            hitCount:   schema.threatIntelIocs.hitCount,
          })
            .from(schema.threatIntelIocs)
            .where(and(
              eq(schema.threatIntelIocs.iocType,  ioc.iocType as any),
              eq(schema.threatIntelIocs.iocValue, ioc.iocValue),
              eq(schema.threatIntelIocs.feedSource, ioc.feedSource),
            ))
            .limit(1)

          if (existing.length > 0) {
            // Update: bump confidence and lastSeenAt
            const current = existing[0]!
            await db.update(schema.threatIntelIocs)
              .set({
                confidence: Math.max(current.confidence, ioc.confidence),
                lastSeenAt: ioc.lastSeenAt,
                expiresAt:  ioc.expiresAt ?? null,
                updatedAt:  new Date(),
              })
              .where(eq(schema.threatIntelIocs.id, current.id))
            updated++
          } else {
            // Insert new IOC
            await db.insert(schema.threatIntelIocs).values({
              id:          uuidv4(),
              iocType:     ioc.iocType as any,
              iocValue:    ioc.iocValue,
              confidence:  ioc.confidence,
              severity:    ioc.severity,
              feedSource:  ioc.feedSource,
              description: ioc.description,
              tags:        ioc.tags,
              expiresAt:   ioc.expiresAt ?? null,
              firstSeenAt: ioc.firstSeenAt,
              lastSeenAt:  ioc.lastSeenAt,
              hitCount:    0,
              createdAt:   new Date(),
              updatedAt:   new Date(),
            })
            inserted++
          }
        } catch (err) {
          log.debug({ err, iocValue: ioc.iocValue }, 'IOC upsert skipped')
          skipped++
        }
      }
    }

    log.info({ inserted, updated, skipped }, 'IOC batch upserted')
    return { inserted, updated, skipped }
  }

  // ── Rebuild Redis hot-cache ────────────────
  // Called after a feed refresh cycle

  async rebuildHotCache(): Promise<void> {
    const db = getDb()
    const now = new Date()

    const iocTypes: IocType[] = ['ip', 'domain', 'url', 'file_hash_sha256']

    for (const iocType of iocTypes) {
      try {
        // Fetch top N high-confidence, non-expired IOCs
        const iocs = await db.select({
          iocValue:    schema.threatIntelIocs.iocValue,
          confidence:  schema.threatIntelIocs.confidence,
          severity:    schema.threatIntelIocs.severity,
          feedSource:  schema.threatIntelIocs.feedSource,
          description: schema.threatIntelIocs.description,
          tags:        schema.threatIntelIocs.tags,
        })
          .from(schema.threatIntelIocs)
          .where(and(
            eq(schema.threatIntelIocs.iocType,     iocType as any),
            gt(schema.threatIntelIocs.confidence,  0.5),
          ))
          .orderBy(schema.threatIntelIocs.confidence)
          .limit(HOT_CACHE_LIMIT)

        if (iocs.length === 0) continue

        // Build Redis pipeline for atomic bulk update
        const cacheKey = `zf:platform:ioc:${iocType}`
        const pipeline = this.redis.pipeline()

        // Delete existing cache for this type
        pipeline.del(cacheKey)

        // Set all IOCs as hash fields
        const fieldArgs: string[] = []
        for (const ioc of iocs) {
          fieldArgs.push(
            ioc.iocValue,
            JSON.stringify({
              confidence:  ioc.confidence,
              severity:    ioc.severity,
              feedSource:  ioc.feedSource,
              description: ioc.description,
              tags:        ioc.tags,
            }),
          )
        }

        // HSET with all fields at once (Redis 4.0+)
        pipeline.hset(cacheKey, ...fieldArgs)
        pipeline.expire(cacheKey, CACHE_TTL_SECS)

        await pipeline.exec()

        log.debug({ iocType, count: iocs.length }, 'Hot-cache rebuilt')
      } catch (err) {
        log.error({ err, iocType }, 'Hot-cache rebuild failed for type')
      }
    }

    log.info('✅ IOC hot-cache rebuild complete')
  }

  // ── Lookup a single IOC (hot-cache first) ─────────────────────

  async lookup(
    iocType:  IocType,
    iocValue: string,
  ): Promise<{
    matched:     boolean
    confidence?: number
    severity?:   string
    feedSource?: string
    description?: string
  }> {
    const cacheKey = `zf:platform:ioc:${iocType}`

    // 1. Check Redis hot-cache
    try {
      const cached = await this.redis.hget(cacheKey, iocValue)
      if (cached) {
        const data = JSON.parse(cached) as {
          confidence: number; severity: string
          feedSource: string; description: string
        }

        // Update hit count async (non-blocking)
        this.incrementHitCount(iocType, iocValue).catch(() => {})

        return { matched: true, ...data }
      }
    } catch {
      // Cache miss — fall through to DB
    }

    // 2. DB fallback
    const db = getDb()
    const rows = await db.select({
      confidence:  schema.threatIntelIocs.confidence,
      severity:    schema.threatIntelIocs.severity,
      feedSource:  schema.threatIntelIocs.feedSource,
      description: schema.threatIntelIocs.description,
    })
      .from(schema.threatIntelIocs)
      .where(and(
        eq(schema.threatIntelIocs.iocType,  iocType as any),
        eq(schema.threatIntelIocs.iocValue, iocValue),
      ))
      .orderBy(schema.threatIntelIocs.confidence)
      .limit(1)

    if (rows.length === 0) return { matched: false }

    const row = rows[0]!

    // Populate cache for next lookup
    await this.redis.hset(
      cacheKey, iocValue,
      JSON.stringify({
        confidence:  row.confidence,
        severity:    row.severity,
        feedSource:  row.feedSource,
        description: row.description ?? '',
      }),
    ).catch(() => {})

    return {
      matched:     true,
      confidence:  row.confidence,
      severity:    row.severity,
      feedSource:  row.feedSource,
      description: row.description ?? '',
    }
  }

  // ── Batch lookup (for enriching event batches) ────────────────

  async batchLookup(requests: Array<{
    eventId:      string
    actorIp?:     string | null
    targetDomain?: string | null
    fileHashSha256?: string | null
  }>): Promise<Map<string, {
    iocType:     IocType
    iocValue:    string
    confidence:  number
    severity:    string
    feedSource:  string
    description: string
  }>> {
    const results = new Map<string, any>()

    for (const req of requests) {
      // Check IPs
      if (req.actorIp) {
        const match = await this.lookup('ip', req.actorIp)
        if (match.matched) {
          results.set(req.eventId, {
            iocType:    'ip',
            iocValue:   req.actorIp,
            ...match,
          })
          continue
        }
      }

      // Check domains
      if (req.targetDomain) {
        const match = await this.lookup('domain', req.targetDomain)
        if (match.matched) {
          results.set(req.eventId, {
            iocType:   'domain',
            iocValue:  req.targetDomain,
            ...match,
          })
          continue
        }
      }

      // Check file hashes
      if (req.fileHashSha256) {
        const match = await this.lookup('file_hash_sha256', req.fileHashSha256)
        if (match.matched) {
          results.set(req.eventId, {
            iocType:   'file_hash_sha256',
            iocValue:  req.fileHashSha256,
            ...match,
          })
        }
      }
    }

    return results
  }

  // ── Expire old IOCs ───────────────────────────────────────────

  async expireOldIocs(): Promise<number> {
    const db  = getDb()
    const now = new Date()

    // We can't easily do a DELETE with Drizzle returning count in all versions
    // So we select first, then delete
    const expired = await db.select({ id: schema.threatIntelIocs.id })
      .from(schema.threatIntelIocs)
      .where(lt(schema.threatIntelIocs.expiresAt, now))

    if (expired.length === 0) return 0

    const ids = expired.map(r => r.id)
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      await db.delete(schema.threatIntelIocs)
        .where(inArray(schema.threatIntelIocs.id, chunk))
    }

    log.info({ count: expired.length }, 'Expired IOCs deleted')
    return expired.length
  }

  // ── Stats ─────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalIocs:    number
    byType:       Record<string, number>
    bySource:     Record<string, number>
  }> {
    const db   = getDb()
    const all  = await db.select({
      iocType:   schema.threatIntelIocs.iocType,
      feedSource: schema.threatIntelIocs.feedSource,
    }).from(schema.threatIntelIocs)

    const byType:   Record<string, number> = {}
    const bySource: Record<string, number> = {}

    for (const row of all) {
      byType[row.iocType]      = (byType[row.iocType]      ?? 0) + 1
      bySource[row.feedSource] = (bySource[row.feedSource] ?? 0) + 1
    }

    return { totalIocs: all.length, byType, bySource }
  }

  // ── Private helpers ───────────────────────────────────────────

  private async incrementHitCount(iocType: IocType, iocValue: string): Promise<void> {
    const db = getDb()
    await db.update(schema.threatIntelIocs)
      .set({ hitCount: sql`${schema.threatIntelIocs.hitCount} + 1` })
      .where(and(
        eq(schema.threatIntelIocs.iocType,  iocType as any),
        eq(schema.threatIntelIocs.iocValue, iocValue),
      ))
  }
}
