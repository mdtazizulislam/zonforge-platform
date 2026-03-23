import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { z }          from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import {
  validateQuery, executeHuntQuery, executeTemplate,
  pivotOnIoc, promoteHuntToRule,
} from './engine/query-engine.js'
import {
  HUNT_TEMPLATES, TEMPLATE_MAP, CATEGORIES,
} from './templates/hunt-templates.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'threat-hunting' })

const ExecuteQuerySchema = z.object({
  query:      z.string().min(10).max(8000),
  parameters: z.record(z.union([z.string(), z.number()])).default({}),
})

const ExecuteTemplateSchema = z.object({
  templateId:  z.string(),
  parameters:  z.record(z.union([z.string(), z.number()])).default({}),
})

const SaveHuntSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  query:       z.string().min(10).max(8000),
  parameters:  z.record(z.union([z.string(), z.number()])).default({}),
  templateId:  z.string().optional(),
})

const PromoteSchema = z.object({
  huntId:   z.string().uuid(),
  name:     z.string().min(1).max(200),
  severity: z.enum(['critical','high','medium','low']),
})

const PivotSchema = z.object({
  type:        z.enum(['ip','user','domain','hash']),
  value:       z.string().min(1).max(500),
  lookbackDays: z.number().int().min(1).max(365).default(30),
})

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({
    origin: ['http://localhost:5173', 'https://app.zonforge.com'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── GET /v1/hunt/templates ─────────────────

  app.get('/v1/hunt/templates', (ctx) => {
    const category = ctx.req.query('category')
    const search   = ctx.req.query('search')?.toLowerCase()

    let templates = HUNT_TEMPLATES
    if (category) templates = templates.filter(t => t.category === category)
    if (search)   templates = templates.filter(t =>
      t.name.toLowerCase().includes(search) ||
      t.description.toLowerCase().includes(search) ||
      t.tags.some(tag => tag.includes(search)),
    )

    return ctx.json({
      success: true,
      data: {
        templates: templates.map(t => ({
          id: t.id, name: t.name, description: t.description,
          category: t.category, severity: t.severity,
          mitreTechniques: t.mitreTechniques,
          parameters: t.parameters, columns: t.columns, tags: t.tags,
        })),
        categories: CATEGORIES,
        total: templates.length,
      },
    })
  })

  // ── GET /v1/hunt/templates/:id ─────────────

  app.get('/v1/hunt/templates/:id', (ctx) => {
    const t = TEMPLATE_MAP.get(ctx.req.param('id'))
    if (!t) return ctx.json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404)
    return ctx.json({ success: true, data: t })
  })

  // ── POST /v1/hunt/execute ──────────────────
  // Execute raw parameterized SQL (validated)

  app.post('/v1/hunt/execute',
    zValidator('json', ExecuteQuerySchema),
    async (ctx) => {
      const user              = ctx.var.user
      const { query, parameters } = ctx.req.valid('json')

      const validation = validateQuery(query)
      if (!validation.valid) {
        return ctx.json({ success: false,
          error: { code: 'INVALID_QUERY', message: validation.error } }, 400)
      }

      const params = { ...parameters, tenant_id: user.tenantId }

      try {
        const result = await executeHuntQuery(query, params)
        return ctx.json({ success: true, data: result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Query execution failed'
        log.error({ err, userId: user.id }, 'Hunt query execution failed')
        return ctx.json({ success: false, error: { code: 'QUERY_ERROR', message: msg } }, 422)
      }
    })

  // ── POST /v1/hunt/templates/:id/execute ───

  app.post('/v1/hunt/templates/:id/execute',
    zValidator('json', z.object({ parameters: z.record(z.union([z.string(), z.number()])).default({}) })),
    async (ctx) => {
      const user         = ctx.var.user
      const templateId   = ctx.req.param('id')
      const { parameters } = ctx.req.valid('json')

      if (!TEMPLATE_MAP.has(templateId)) {
        return ctx.json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404)
      }

      try {
        const result = await executeTemplate(templateId, user.tenantId, parameters)
        return ctx.json({ success: true, data: result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Template execution failed'
        return ctx.json({ success: false, error: { code: 'QUERY_ERROR', message: msg } }, 422)
      }
    })

  // ── POST /v1/hunt/pivot ────────────────────

  app.post('/v1/hunt/pivot',
    zValidator('json', PivotSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { type, value, lookbackDays } = ctx.req.valid('json')

      try {
        const result = await pivotOnIoc(user.tenantId, type, value, lookbackDays)
        return ctx.json({ success: true, data: result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Pivot failed'
        return ctx.json({ success: false, error: { code: 'QUERY_ERROR', message: msg } }, 422)
      }
    })

  // ── GET /v1/hunt/saved ────────────────────

  app.get('/v1/hunt/saved', async (ctx) => {
    const user  = ctx.var.user
    const db    = getDb()
    const limit = parseInt(ctx.req.query('limit') ?? '50', 10)

    const hunts = await db.select()
      .from(schema.savedHunts)
      .where(eq(schema.savedHunts.tenantId, user.tenantId))
      .orderBy(desc(schema.savedHunts.createdAt))
      .limit(limit)

    return ctx.json({ success: true, data: hunts })
  })

  // ── POST /v1/hunt/saved ───────────────────

  app.post('/v1/hunt/saved',
    zValidator('json', SaveHuntSchema),
    async (ctx) => {
      const user = ctx.var.user
      const body = ctx.req.valid('json')
      const db   = getDb()

      const validation = validateQuery(body.query)
      if (!validation.valid) {
        return ctx.json({ success: false,
          error: { code: 'INVALID_QUERY', message: validation.error } }, 400)
      }

      const [hunt] = await db.insert(schema.savedHunts).values({
        id:          crypto.randomUUID(),
        tenantId:    user.tenantId,
        name:        body.name,
        description: body.description,
        templateId:  body.templateId ?? null,
        query:       body.query,
        parameters:  body.parameters,
        runCount:    0,
        lastRunAt:   null,
        createdBy:   user.id,
        createdAt:   new Date(),
      }).returning()

      return ctx.json({ success: true, data: hunt }, 201)
    })

  // ── DELETE /v1/hunt/saved/:id ─────────────

  app.delete('/v1/hunt/saved/:id', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    await db.delete(schema.savedHunts)
      .where(and(
        eq(schema.savedHunts.id, ctx.req.param('id')),
        eq(schema.savedHunts.tenantId, user.tenantId),
      ))

    return ctx.json({ success: true, data: { deleted: true } })
  })

  // ── POST /v1/hunt/promote ─────────────────
  // Promote a saved hunt to a detection rule

  app.post('/v1/hunt/promote',
    zValidator('json', PromoteSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { huntId, name, severity } = ctx.req.valid('json')
      const db   = getDb()

      const [hunt] = await db.select()
        .from(schema.savedHunts)
        .where(and(
          eq(schema.savedHunts.id, huntId),
          eq(schema.savedHunts.tenantId, user.tenantId),
        ))
        .limit(1)

      if (!hunt) {
        return ctx.json({ success: false, error: { code: 'NOT_FOUND', message: 'Hunt not found' } }, 404)
      }

      try {
        const rule = await promoteHuntToRule(
          {
            id:          hunt.id,
            tenantId:    hunt.tenantId,
            name:        hunt.name,
            description: hunt.description ?? '',
            ...(hunt.templateId ? { templateId: hunt.templateId } : {}),
            query:       hunt.query,
            parameters:  (hunt.parameters as Record<string, unknown>) ?? {},
            runCount:    hunt.runCount,
            createdBy:   hunt.createdBy ?? user.id,
            createdAt:   hunt.createdAt,
          },
          name, severity, user.tenantId, user.id,
        )

        return ctx.json({ success: true, data: rule })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Promotion failed'
        return ctx.json({ success: false, error: { code: 'PROMOTE_ERROR', message: msg } }, 422)
      }
    })

  app.get('/health', (ctx) => ctx.json({
    status: 'ok', service: 'threat-hunting',
    templates: HUNT_TEMPLATES.length,
    timestamp: new Date(),
  }))

  const port = parseInt(process.env['PORT'] ?? '3012', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Threat Hunting on port ${info.port}`)
    log.info(`   ${HUNT_TEMPLATES.length} hunt templates loaded`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down threat hunting service...')
    await closeDb()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Threat hunting service failed to start')
  process.exit(1)
})
