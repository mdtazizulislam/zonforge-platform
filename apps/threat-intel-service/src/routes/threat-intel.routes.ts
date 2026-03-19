import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createLogger } from '@zonforge/logger'
import type { IocStore } from '../services/ioc-store.service.js'
import type { FeedRefreshWorker } from '../workers/feed-refresh.worker.js'
import { normalizeIocValue, isValidIoc } from '../types.js'
import type { IocType } from '../types.js'

// ─────────────────────────────────────────────
// THREAT INTEL API ROUTES
//
// Internal endpoints called by:
//  - normalization-worker  (batch enrichment)
//  - detection-engine      (IOC match check)
//  - alert-service         (evidence enrichment)
//
// Public endpoints:
//  - GET  /health
//  - GET  /metrics
//  - GET  /stats
//
// Admin endpoints (PLATFORM_ADMIN only):
//  - POST /admin/refresh    trigger manual feed refresh
// ─────────────────────────────────────────────

const log = createLogger({ service: 'threat-intel:routes' })

const BatchEnrichSchema = z.object({
  events: z.array(z.object({
    eventId:         z.string(),
    actorIp:         z.string().nullable().optional(),
    targetDomain:    z.string().nullable().optional(),
    fileHashSha256:  z.string().nullable().optional(),
  })).min(1).max(1000),
})

const LookupSchema = z.object({
  iocType:  z.enum(['ip', 'domain', 'url', 'file_hash_md5', 'file_hash_sha1', 'file_hash_sha256', 'email']),
  iocValue: z.string().min(1),
})

export function createThreatIntelRouter(
  store:   IocStore,
  worker:  FeedRefreshWorker,
) {
  const router = new Hono()

  // ─────────────────────────────────────────────
  // POST /internal/enrich
  // Batch enrichment — called by normalization worker
  // Returns enrichment match per event_id
  // ─────────────────────────────────────────────

  router.post(
    '/internal/enrich',
    zValidator('json', BatchEnrichSchema),
    async (ctx) => {
      const { events } = ctx.req.valid('json')
      const startMs    = Date.now()

      const results = await store.batchLookup(
        events.map(e => ({
          eventId:        e.eventId,
          actorIp:        e.actorIp ?? null,
          targetDomain:   e.targetDomain ?? null,
          fileHashSha256: e.fileHashSha256 ?? null,
        })),
      )

      const matches = events.map(e => {
        const match = results.get(e.eventId)
        return {
          eventId:    e.eventId,
          matched:    !!match,
          iocType:    match?.iocType,
          iocValue:   match?.iocValue,
          confidence: match?.confidence,
          severity:   match?.severity,
          feedSource: match?.feedSource,
          description: match?.description,
        }
      })

      return ctx.json({
        success: true,
        data: {
          matches,
          totalMatched: matches.filter(m => m.matched).length,
          latencyMs:    Date.now() - startMs,
        },
      })
    },
  )

  // ─────────────────────────────────────────────
  // POST /internal/lookup
  // Single IOC lookup — for ad-hoc checks
  // ─────────────────────────────────────────────

  router.post(
    '/internal/lookup',
    zValidator('json', LookupSchema),
    async (ctx) => {
      const { iocType, iocValue } = ctx.req.valid('json')

      const normalized = normalizeIocValue(iocType as IocType, iocValue)
      if (!isValidIoc(iocType as IocType, normalized)) {
        return ctx.json({
          success: false,
          error: { code: 'INVALID_IOC', message: 'Invalid IOC format for the given type' },
        }, 400)
      }

      const result = await store.lookup(iocType as IocType, normalized)
      return ctx.json({ success: true, data: { iocValue: normalized, ...result } })
    },
  )

  // ─────────────────────────────────────────────
  // GET /stats — IOC database statistics
  // ─────────────────────────────────────────────

  router.get('/stats', async (ctx) => {
    const stats = await store.getStats()
    return ctx.json({ success: true, data: stats })
  })

  // ─────────────────────────────────────────────
  // POST /admin/refresh — manual feed refresh trigger
  // ─────────────────────────────────────────────

  router.post('/admin/refresh', async (ctx) => {
    const apiKey = ctx.req.header('X-Admin-Key')
    if (apiKey !== process.env['ZONFORGE_ADMIN_KEY']) {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN', message: 'Invalid admin key' } }, 403)
    }

    log.info('Manual feed refresh triggered via API')

    // Run async — don't block the HTTP response
    worker.runRefresh()
      .then(result => log.info(result, 'Manual refresh complete'))
      .catch(err => log.error({ err }, 'Manual refresh failed'))

    return ctx.json({
      success: true,
      data: { message: 'Feed refresh started asynchronously' },
    })
  })

  // ─────────────────────────────────────────────
  // GET /health
  // ─────────────────────────────────────────────

  router.get('/health', async (ctx) => {
    const stats = await store.getStats().catch(() => null)
    return ctx.json({
      status:    'ok',
      service:   'threat-intel-service',
      iocCount:  stats?.totalIocs ?? 'unknown',
      timestamp: new Date(),
    })
  })

  return router
}
