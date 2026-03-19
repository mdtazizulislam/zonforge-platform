import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { IngestionService, IngestionError } from '../services/ingestion.service.js'
import { validateApiKeyFromDb } from '@zonforge/auth-utils'
import { createLogger } from '@zonforge/logger'
import type { Context } from 'hono'

const log = createLogger({ service: 'ingestion-service:routes' })

// ─────────────────────────────────────────────
// Ingestion request validators
// ─────────────────────────────────────────────

const IngestBatchSchema = z.object({
  connectorId: z.string().uuid(),
  sourceType:  z.string().min(1).max(100),
  events:      z.array(z.record(z.unknown())).min(1).max(1000),
  batchId:     z.string().uuid().optional(),
  collectedAt: z.string().datetime().optional(),
})

const VulnScanSchema = z.object({
  assetId:     z.string().uuid(),
  sourceScanner: z.string().min(1),
  findings:    z.array(z.object({
    cveId:          z.string().optional(),
    title:          z.string(),
    description:    z.string().optional(),
    cvssScore:      z.number().min(0).max(10),
    severity:       z.enum(['critical', 'high', 'medium', 'low', 'info']),
    isInternetFacing: z.boolean().default(false),
    isExploitAvailable: z.boolean().default(false),
    remediationGuidance: z.string().optional(),
    detectedAt:     z.string().datetime(),
  })).min(1).max(5000),
})

// ─────────────────────────────────────────────
// Routes factory — receives IngestionService instance
// ─────────────────────────────────────────────

export function createIngestionRouter(service: IngestionService) {
  const router = new Hono()

  // ── Connector API-key auth middleware ───────
  router.use('/v1/ingest/*', async (ctx, next) => {
    const apiKey = ctx.req.header('X-Api-Key')
      ?? ctx.req.header('Authorization')?.replace('Bearer ', '')

    if (!apiKey) {
      return ctx.json({ success: false,
        error: { code: 'UNAUTHORIZED', message: 'API key required' } }, 401)
    }

    const validated = await validateApiKeyFromDb(apiKey)
    if (!validated || validated.role !== 'API_CONNECTOR') {
      return ctx.json({ success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401)
    }

    // Attach to context
    ctx.set('tenantId',    validated.tenantId)
    ctx.set('connectorId', validated.connectorId ?? '')
    ctx.set('requestId',   uuidv4())

    await next()
    return
  })

  // ─────────────────────────────────────────────
  // POST /v1/ingest/events
  // Main event ingestion endpoint
  // Called by: all collector services
  // Auth: API key (role = API_CONNECTOR)
  // ─────────────────────────────────────────────

  router.post(
    '/v1/ingest/events',
    zValidator('json', IngestBatchSchema),
    async (ctx) => {
      const tenantId    = ctx.get('tenantId') as string
      const connectorId = ctx.get('connectorId') as string
      const body        = ctx.req.valid('json')
      const rawBody     = await ctx.req.text()
      const signature   = ctx.req.header('X-ZonForge-Signature') ?? ''
      const batchId     = body.batchId ?? uuidv4()

      // Idempotency key check
      const idempotencyKey = ctx.req.header('Idempotency-Key')
      if (idempotencyKey) {
        // TODO: check Redis for prior result — return cached if exists
      }

      try {
        const result = await service.ingestBatch({
          tenantId,
          connectorId: body.connectorId ?? connectorId,
          sourceType:  body.sourceType,
          events:      body.events,
          batchId,
          signature,
          rawBody,
        })

        return ctx.json({
          success: true,
          data: {
            batchId:    result.batchId,
            accepted:   result.accepted,
            duplicates: result.duplicates,
            rejected:   result.rejected,
          },
          meta: { requestId: ctx.get('requestId'), timestamp: new Date() },
        }, 202)   // 202 Accepted — async processing

      } catch (err) {
        return handleError(ctx, err)
      }
    }
  )

  // ─────────────────────────────────────────────
  // POST /v1/ingest/vulnerability-scan
  // Upload vulnerability scanner results
  // Auth: API key (role = API_CONNECTOR or TENANT_ADMIN)
  // ─────────────────────────────────────────────

  router.post(
    '/v1/ingest/vulnerability-scan',
    zValidator('json', VulnScanSchema),
    async (ctx) => {
      const tenantId = ctx.get('tenantId') as string
      const body     = ctx.req.valid('json')
      const db       = (await import('@zonforge/db-client')).getDb()
      const {
        schema: s,
        eq: dbEq,
      } = await import('@zonforge/db-client')
      const { v4 } = await import('uuid')

      // Validate asset belongs to tenant
      const assets = await db.select({ id: s.assets.id })
        .from(s.assets)
        .where(dbEq(s.assets.id, body.assetId))
        .limit(1)

      if (!assets[0]) {
        return ctx.json({ success: false,
          error: { code: 'NOT_FOUND', message: 'Asset not found' } }, 404)
      }

      // Insert vulnerabilities
      const vulnRows = body.findings.map(f => ({
        id:                  v4(),
        tenantId,
        assetId:             body.assetId,
        cveId:               f.cveId ?? null,
        title:               f.title,
        description:         f.description ?? null,
        cvssScore:           f.cvssScore,
        severity:            f.severity,
        isInternetFacing:    f.isInternetFacing,
        isExploitAvailable:  f.isExploitAvailable,
        remediationGuidance: f.remediationGuidance ?? null,
        detectedAt:          new Date(f.detectedAt),
        sourceScanner:       body.sourceScanner,
        createdAt:           new Date(),
      }))

      await db.insert(s.vulnerabilities).values(vulnRows)

      log.info({ tenantId, assetId: body.assetId, count: vulnRows.length },
        'Vulnerability scan imported')

      return ctx.json({
        success: true,
        data:    { imported: vulnRows.length },
        meta:    { requestId: ctx.get('requestId'), timestamp: new Date() },
      }, 201)
    }
  )

  // ─────────────────────────────────────────────
  // GET /v1/ingest/health
  // ─────────────────────────────────────────────

  router.get('/v1/ingest/health', (ctx) => {
    return ctx.json({ status: 'ok', service: 'ingestion-service', timestamp: new Date() })
  })

  return router
}

// ── Error handler ─────────────────────────────

function handleError(ctx: Context, err: unknown) {
  if (err instanceof IngestionError) {
    return ctx.json({
      success: false,
      error: { code: err.code, message: err.message },
    }, err.statusCode as 400 | 401 | 403 | 404 | 429 | 500)
  }
  log.error({ err }, 'Unhandled ingestion error')
  return ctx.json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  }, 500)
}

// Required for Hono context type extension
declare module 'hono' {
  interface ContextVariableMap {
    tenantId:    string
    connectorId: string
    requestId:   string
  }
}
