import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { z }          from 'zod'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { generateSoc2Package }      from './reports/soc2.report.js'
import { generateExecutiveReport }  from './reports/executive.report.js'
import { forwardEvents }            from './siem/siem-forwarder.js'
import { processVulnUpload }        from './vuln/vuln-scanner.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'
import type { Context } from 'hono'

const log = createLogger({ service: 'compliance-reports' })

const SiemConfigSchema = z.object({
  provider:                z.enum(['splunk','sentinel','generic_syslog']),
  enabled:                 z.boolean(),
  splunkHecUrl:            z.string().url().optional(),
  splunkHecToken:          z.string().optional(),
  splunkIndex:             z.string().optional(),
  sentinelWorkspaceId:     z.string().optional(),
  sentinelSharedKey:       z.string().optional(),
  sentinelLogType:         z.string().optional(),
  webhookUrl:              z.string().url().optional(),
})

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({
    origin: ['http://localhost:5173', 'https://app.zonforge.com'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/compliance/reports/soc2 ──────────

  app.post('/v1/compliance/reports/soc2',
    zValidator('json', z.object({
      periodDays: z.number().int().min(1).max(365).default(90),
    })),
    async (ctx) => {
      const user = ctx.var.user
      const { periodDays } = ctx.req.valid('json')

      try {
        const pkg = await generateSoc2Package(user.tenantId, periodDays, user.id)
        return ctx.json({ success: true, data: pkg })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed'
        log.error({ err }, 'SOC2 package generation failed')
        return ctx.json({ success: false, error: { code: 'REPORT_ERROR', message: msg } }, 500)
      }
    })

  // ── POST /v1/compliance/reports/executive ─────

  app.post('/v1/compliance/reports/executive',
    zValidator('json', z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
    })),
    async (ctx) => {
      const user = ctx.var.user
      const { periodDays } = ctx.req.valid('json')

      try {
        const report = await generateExecutiveReport(user.tenantId, periodDays)
        return ctx.json({ success: true, data: report })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed'
        return ctx.json({ success: false, error: { code: 'REPORT_ERROR', message: msg } }, 500)
      }
    })

  // ── POST /v1/compliance/siem/config ───────────

  app.post('/v1/compliance/siem/config',
    zValidator('json', SiemConfigSchema),
    async (ctx) => {
      const user   = ctx.var.user
      const config = ctx.req.valid('json')

      if (!['TENANT_ADMIN', 'PLATFORM_ADMIN'].includes(user.role)) {
        return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
      }

      // Store in tenant settings
      const { getDb, schema } = await import('@zonforge/db-client')
      const db   = getDb()
      const { eq } = await import('drizzle-orm')

      const existing = await db.select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, user.tenantId))
        .limit(1)

      const current  = (existing[0]?.settings as Record<string, unknown>) ?? {}
      await db.update(schema.tenants)
        .set({ settings: { ...current, siemConfig: config }, updatedAt: new Date() })
        .where(eq(schema.tenants.id, user.tenantId))

      return ctx.json({ success: true, data: { saved: true } })
    })

  // ── POST /v1/compliance/siem/test ─────────────

  app.post('/v1/compliance/siem/test',
    zValidator('json', SiemConfigSchema),
    async (ctx) => {
      const user   = ctx.var.user
      const config = ctx.req.valid('json')

      const testEvent = [{
        eventType: 'alert' as const,
        tenantId:  user.tenantId,
        timestamp: new Date(),
        data:      { id: 'test-event', title: 'ZonForge SIEM Integration Test', severity: 'info' },
      }]

      const result = await forwardEvents(config, testEvent)
      return ctx.json({ success: true, data: {
        forwarded: result.forwarded,
        failed:    result.failed,
        testPassed: result.forwarded > 0,
      }})
    })

  // ── POST /v1/compliance/vuln/upload ───────────

  app.post('/v1/compliance/vuln/upload', async (ctx) => {
    const user  = ctx.var.user
    const form  = await ctx.req.formData()
    const file  = form.get('file') as File | null

    if (!file) {
      return ctx.json({ success: false, error: { code: 'MISSING_FILE', message: 'file field required' } }, 400)
    }

    if (file.size > 50 * 1024 * 1024) {
      return ctx.json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max file size 50MB' } }, 413)
    }

    const content = await file.text()
    const result  = await processVulnUpload(user.tenantId, file.name, content, user.id)
    return ctx.json({ success: true, data: result })
  })

  // ── GET /v1/compliance/reports/list ──────────

  app.get('/v1/compliance/reports/list', async (ctx) => {
    // Would query a reports table — simplified here
    const user = ctx.var.user
    return ctx.json({ success: true, data: {
      reports: [
        { type: 'executive', name: 'Monthly Executive Report', available: true },
        { type: 'soc2',      name: 'SOC2 Type II Evidence Package', available: true },
        { type: 'mitre',     name: 'MITRE ATT&CK Coverage Report', available: true },
        { type: 'mttd',      name: 'MTTD SLA Performance Report', available: true },
      ],
    }})
  })

  app.get('/health', (ctx) => ctx.json({
    status: 'ok', service: 'compliance-reports', timestamp: new Date(),
  }))

  const port = parseInt(process.env['PORT'] ?? '3013', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Compliance Reports on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down compliance reports...')
    await closeDb()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Compliance reports service failed to start')
  process.exit(1)
})
