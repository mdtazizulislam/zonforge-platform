import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { ConnectorService, type UpdateConnectorInput } from '../services/connector.service.js'
import { createLogger } from '@zonforge/logger'
import type { Context } from 'hono'

const log = createLogger({ service: 'ingestion-service:connector-routes' })

const ConnectorTypeSchema = z.enum([
  'm365_entra', 'aws_cloudtrail', 'google_workspace',
  'azure_activity', 'gcp_audit', 'api_gateway_aws',
  'api_gateway_kong', 'cloudflare_waf', 'aws_waf',
  'generic_syslog', 'generic_webhook', 'vulnerability_scan_upload',
])

const CreateConnectorBody = z.object({
  name:                z.string().min(1).max(255),
  type:                ConnectorTypeSchema,
  config:              z.record(z.unknown()),
  pollIntervalMinutes: z.number().int().min(1).max(60).default(5),
})

const UpdateConnectorBody = z.object({
  name:                z.string().min(1).max(255).optional(),
  config:              z.record(z.unknown()).optional(),
  pollIntervalMinutes: z.number().int().min(1).max(60).optional(),
  status:              z.enum(['active', 'paused']).optional(),
})

export function createConnectorRouter(service: ConnectorService) {
  const router = new Hono()

  // ── POST /v1/connectors ───────────────────────────────────────
  router.post(
    '/v1/connectors',
    zValidator('json', CreateConnectorBody),
    async (ctx) => {
      const user = ctx.var.user
      const body = ctx.req.valid('json')

      try {
        const result = await service.createConnector({
          tenantId:            user.tenantId,
          name:                body.name,
          type:                body.type as any,
          config:              body.config,
          pollIntervalMinutes: body.pollIntervalMinutes,
          createdBy:           user.id,
        })
        return ctx.json({ success: true, data: result, meta: meta(ctx) }, 201)
      } catch (err) {
        const code = (err as { code?: string } | undefined)?.code
        if (code === 'UPGRADE_REQUIRED') {
          return ctx.json({ success: false,
            error: { code: 'UPGRADE_REQUIRED', message: 'Connector quota exceeded for current plan' } }, 403)
        }

        log.error({ err }, 'Create connector failed')
        return ctx.json({ success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to create connector' } }, 500)
      }
    }
  )

  // ── GET /v1/connectors ────────────────────────────────────────
  router.get('/v1/connectors', async (ctx) => {
    const user       = ctx.var.user
    const connectors = await service.listConnectors(user.tenantId)
    return ctx.json({ success: true, data: connectors, meta: meta(ctx) })
  })

  // ── GET /v1/connectors/:id ────────────────────────────────────
  router.get('/v1/connectors/:id', async (ctx) => {
    const user      = ctx.var.user
    const connector = await service.getConnector(ctx.req.param('id'), user.tenantId)
    if (!connector) {
      return ctx.json({ success: false,
        error: { code: 'NOT_FOUND', message: 'Connector not found' } }, 404)
    }
    return ctx.json({ success: true, data: connector, meta: meta(ctx) })
  })

  // ── GET /v1/connectors/:id/validate ──────────────────────────
  router.get('/v1/connectors/:id/validate', async (ctx) => {
    const user   = ctx.var.user
    const result = await service.validateConnectorById(
      ctx.req.param('id'),
      user.tenantId,
    )
    return ctx.json({ success: true, data: result, meta: meta(ctx) })
  })

  // ── PATCH /v1/connectors/:id ──────────────────────────────────
  router.patch(
    '/v1/connectors/:id',
    zValidator('json', UpdateConnectorBody),
    async (ctx) => {
      const user  = ctx.var.user
      const raw   = ctx.req.valid('json')
      const updates: UpdateConnectorInput = {}
      if (raw.name !== undefined) updates.name = raw.name
      if (raw.config !== undefined) updates.config = raw.config
      if (raw.pollIntervalMinutes !== undefined) {
        updates.pollIntervalMinutes = raw.pollIntervalMinutes
      }
      if (raw.status !== undefined) updates.status = raw.status
      await service.updateConnector(
        ctx.req.param('id'), user.tenantId, updates, user.id,
      )
      return ctx.json({ success: true, data: { updated: true }, meta: meta(ctx) })
    }
  )

  // ── DELETE /v1/connectors/:id ─────────────────────────────────
  router.delete('/v1/connectors/:id', async (ctx) => {
    const user = ctx.var.user
    await service.deleteConnector(ctx.req.param('id'), user.tenantId, user.id)
    return ctx.json({ success: true, data: { deleted: true }, meta: meta(ctx) })
  })

  // ── POST /v1/connectors/:id/error (internal — from collectors) ─
  router.post('/v1/connectors/:id/error', async (ctx) => {
    const body = await ctx.req.json() as { message: string }
    await service.recordError(ctx.req.param('id'), body.message ?? 'Unknown error')
    return ctx.json({ success: true }, 200)
  })

  return router
}

function meta(ctx: Context) {
  return { requestId: ctx.var.requestId ?? 'unknown', timestamp: new Date() }
}
