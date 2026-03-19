import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { compress } from 'hono/compress'
import { Redis } from 'ioredis'
import { initDb, closeDb } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import {
  requestIdMiddleware,
  authMiddleware,
  planRateLimitMiddleware,
  setMiddlewareRedis,
  successResponse,
  errorResponse,
} from './middleware/core.middleware.js'
import { createRiskRouter }        from './routes/risk.routes.js'
import { createComplianceRouter }  from './routes/compliance.routes.js'
import { createPlaybookRouter }    from './routes/playbook.routes.js'
import { createHealthRouter }      from './routes/health.routes.js'

// Import routers from other services (acting as a gateway)
// In production these would be proxied, but for monorepo
// they are imported directly for type safety

const log = createLogger({ service: 'api-gateway' })

/** Forward request body only when allowed (avoids `body: null` DOM typing issues). */
async function forwardFetch(
  url:     string,
  method:  string,
  headers: Headers,
  req:     { arrayBuffer(): Promise<ArrayBuffer> },
  timeoutMs = 10_000,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  }
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = await req.arrayBuffer()
  }
  return fetch(url, init)
}

async function start() {
  // ── Database ────────────────────────────────
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  // ── Redis ───────────────────────────────────
  const redis = new Redis({
    host:     redisConfig.host,
    port:     redisConfig.port,
    password: redisConfig.password,
    tls:      redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (t) => Math.min(t * 100, 3000),
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error',   (e: Error) => log.error({ err: e }, 'Redis error'))

  setMiddlewareRedis(redis)

  // ─────────────────────────────────────────────
  // HONO APP
  // ─────────────────────────────────────────────

  const app = new Hono()

  // ── Global middleware ─────────────────────────

  app.use('*', requestIdMiddleware)

  app.use('*', cors({
    origin: (origin) => {
      const allowed = [
        'http://localhost:5173',       // Vite dev
        'http://localhost:3000',       // local production build
        'https://app.zonforge.com',
        'https://admin.zonforge.com',
      ]
      return allowed.includes(origin ?? '') ? origin ?? '' : ''
    },
    allowMethods:  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders:  [
      'Content-Type', 'Authorization', 'X-Request-Id',
      'X-Api-Key', 'Idempotency-Key',
    ],
    exposeHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials:   true,
    maxAge:        600,
  }))

  app.use('*', secureHeaders({
    xFrameOptions:             'DENY',
    xContentTypeOptions:       'nosniff',
    strictTransportSecurity:   'max-age=31536000; includeSubDomains',
    referrerPolicy:            'strict-origin-when-cross-origin',
  }))

  app.use('*', compress())

  // Inject Redis into context for routes that need it
  app.use('*', async (ctx, next) => {
    ctx.set('redis' as any, redis)
    await next()
  })

  // ── Auth protected routes ────────────────────

  app.use('/v1/*', authMiddleware)
  app.use('/v1/*', planRateLimitMiddleware())

  // ── Route registration ───────────────────────

  const healthRouter     = createHealthRouter()
  const riskRouter       = createRiskRouter()
  const complianceRouter = createComplianceRouter()
  const playbookRouter   = createPlaybookRouter()

  app.route('/', healthRouter)
  app.route('/', riskRouter)
  app.route('/', complianceRouter)
  app.route('/', playbookRouter)

  // ── Proxy routes to downstream services ──────
  // In production each service runs independently.
  // For MVP monorepo: direct import of route handlers.

  // Auth routes → proxy to auth-service :3100
  app.all('/v1/auth/*', async (ctx) => {
    const url  = ctx.req.url.replace(
      /^.*\/v1\/auth/,
      `${process.env['ZONFORGE_AUTH_SERVICE_URL'] ?? 'http://localhost:3100'}/v1/auth`,
    )
    const resp = await forwardFetch(url, ctx.req.method, ctx.req.raw.headers, ctx.req)
    return new Response(resp.body, {
      status:  resp.status,
      headers: resp.headers,
    })
  })

  // Tenant routes → proxy to tenant-service :3101
  app.all('/v1/tenants/*', async (ctx) => {
    const url  = ctx.req.url.replace(
      /^.*\/v1\//,
      `${process.env['ZONFORGE_TENANT_SERVICE_URL'] ?? 'http://localhost:3101'}/v1/`,
    )
    const resp = await forwardFetch(url, ctx.req.method, ctx.req.raw.headers, ctx.req)
    return new Response(resp.body, { status: resp.status, headers: resp.headers })
  })

  // Alert routes → proxy to alert-service :3008
  app.all('/v1/alerts/*', async (ctx) => {
    const url  = ctx.req.url.replace(
      /^.*\/v1\//,
      `${process.env['ZONFORGE_ALERT_SERVICE_URL'] ?? 'http://localhost:3008'}/v1/`,
    )
    const resp = await forwardFetch(url, ctx.req.method, ctx.req.raw.headers, ctx.req)
    return new Response(resp.body, { status: resp.status, headers: resp.headers })
  })

  // Connector routes → proxy to ingestion-service :3001
  app.all('/v1/connectors/*', async (ctx) => {
    const url  = ctx.req.url.replace(
      /^.*\/v1\//,
      `${process.env['ZONFORGE_INGESTION_SERVICE_URL'] ?? 'http://localhost:3001'}/v1/`,
    )
    const resp = await forwardFetch(url, ctx.req.method, ctx.req.raw.headers, ctx.req)
    return new Response(resp.body, { status: resp.status, headers: resp.headers })
  })

  // ── OpenAPI spec endpoint ────────────────────

  app.get('/v1/openapi.json', (ctx) =>
    successResponse(ctx, buildOpenApiSpec()),
  )

  // ── 404 handler ───────────────────────────────

  app.notFound((ctx) =>
    errorResponse(ctx, 'NOT_FOUND',
      `Route not found: ${ctx.req.method} ${ctx.req.path}`, 404),
  )

  // ── Global error handler ─────────────────────

  app.onError((err, ctx) => {
    log.error({ err, path: ctx.req.path }, 'Unhandled gateway error')
    return errorResponse(ctx, 'INTERNAL_ERROR', 'Internal server error', 500)
  })

  // ─────────────────────────────────────────────
  // SERVER START
  // ─────────────────────────────────────────────

  const port = parseInt(process.env['PORT'] ?? '3000', 10)

  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`🚀 ZonForge API Gateway running on port ${info.port}`)
    log.info(`   Environment: ${env.ZONFORGE_ENV}`)
    log.info(`   OpenAPI: http://localhost:${info.port}/v1/openapi.json`)
    log.info('   Downstream services:')
    log.info(`     Auth:       ${process.env['ZONFORGE_AUTH_SERVICE_URL']     ?? 'http://localhost:3100'}`)
    log.info(`     Tenant:     ${process.env['ZONFORGE_TENANT_SERVICE_URL']   ?? 'http://localhost:3101'}`)
    log.info(`     Ingestion:  ${process.env['ZONFORGE_INGESTION_SERVICE_URL']?? 'http://localhost:3001'}`)
    log.info(`     Alerts:     ${process.env['ZONFORGE_ALERT_SERVICE_URL']    ?? 'http://localhost:3008'}`)
    log.info(`     Risk:       ${process.env['ZONFORGE_RISK_ENGINE_URL']      ?? 'http://localhost:3007'}`)
  })

  // ── Graceful shutdown ────────────────────────

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down API gateway...')
    await closeDb()
    await redis.quit()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

// ─────────────────────────────────────────────
// OPENAPI SPEC (simplified — production would
// auto-generate from Zod schemas)
// ─────────────────────────────────────────────

function buildOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title:       'ZonForge Sentinel API',
      description: 'AI-Powered Cyber Early Warning Platform',
      version:     '1.0.0',
      contact:     { name: 'ZonForge Platform', url: 'https://zonforge.com' },
    },
    servers: [
      { url: '/v1', description: 'API v1' },
    ],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey:     { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      },
    },
    paths: {
      '/auth/login':           { post: { summary: 'Login',          tags: ['Auth'] } },
      '/auth/refresh':         { post: { summary: 'Refresh token',  tags: ['Auth'] } },
      '/auth/logout':          { post: { summary: 'Logout',         tags: ['Auth'] } },
      '/auth/me':              { get:  { summary: 'Get current user',tags: ['Auth'] } },
      '/tenants/{id}':         { get:  { summary: 'Get tenant',     tags: ['Tenants'] } },
      '/connectors':           { get:  { summary: 'List connectors',tags: ['Connectors'] },
                                 post: { summary: 'Create connector', tags: ['Connectors'] } },
      '/connectors/{id}/validate': { get: { summary: 'Validate connector', tags: ['Connectors'] } },
      '/alerts':               { get:  { summary: 'List alerts',    tags: ['Alerts'] } },
      '/alerts/{id}':          { get:  { summary: 'Get alert',      tags: ['Alerts'] } },
      '/alerts/{id}/status':   { patch:{ summary: 'Update status',  tags: ['Alerts'] } },
      '/alerts/{id}/feedback': { post: { summary: 'Submit feedback',tags: ['Alerts'] } },
      '/risk/summary':         { get:  { summary: 'Org posture',    tags: ['Risk'] } },
      '/risk/users':           { get:  { summary: 'User risk list', tags: ['Risk'] } },
      '/risk/users/{id}':      { get:  { summary: 'User profile',   tags: ['Risk'] } },
      '/risk/assets':          { get:  { summary: 'Asset risk list',tags: ['Risk'] } },
      '/risk/assets/{id}':     { get:  { summary: 'Asset profile',  tags: ['Risk'] } },
      '/metrics/mttd':         { get:  { summary: 'MTTD metrics',   tags: ['Metrics'] } },
      '/playbooks':            { get:  { summary: 'List playbooks', tags: ['Playbooks'] } },
      '/playbooks/{id}/execute':{ post:{ summary: 'Execute playbook',tags: ['Playbooks'] } },
      '/compliance/attack-coverage': { get: { summary: 'ATT&CK coverage heatmap', tags: ['Compliance'] } },
      '/compliance/audit-log': { get:  { summary: 'Audit log',      tags: ['Compliance'] } },
      '/compliance/rules':     { get:  { summary: 'Detection rules',tags: ['Compliance'] } },
      '/health':               { get:  { summary: 'Health check',   tags: ['Health'] } },
      '/health/pipeline':      { get:  { summary: 'Pipeline health',tags: ['Health'] } },
      '/billing/usage':        { get:  { summary: 'Usage summary',  tags: ['Billing'] } },
      '/billing/subscription': { get:  { summary: 'Subscription',   tags: ['Billing'] } },
    },
  }
}

start().catch(err => {
  log.fatal({ err }, '❌ API gateway failed to start')
  process.exit(1)
})
