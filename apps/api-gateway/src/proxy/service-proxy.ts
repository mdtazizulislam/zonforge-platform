import type { Context } from 'hono'
import { createLogger } from '@zonforge/logger'

// ─────────────────────────────────────────────
// ZonForge Sentinel — Service Proxy
//
// Routes incoming API requests to the appropriate
// downstream microservice. In production these are
// separate pods; in dev they run as local ports.
//
// Service URL map is resolved at startup from
// environment variables or defaults.
// ─────────────────────────────────────────────

const log = createLogger({ service: 'api-gateway:proxy' })

// ── Service registry ──────────────────────────

export interface ServiceConfig {
  url:         string
  timeoutMs:   number
  healthPath:  string
}

export const SERVICES = {
  auth:        'AUTH_SERVICE_URL',
  tenant:      'TENANT_SERVICE_URL',
  ingestion:   'INGESTION_SERVICE_URL',
  threatIntel: 'THREAT_INTEL_SERVICE_URL',
  detection:   'DETECTION_SERVICE_URL',
  anomaly:     'ANOMALY_SERVICE_URL',
  correlation: 'CORRELATION_SERVICE_URL',
  riskScoring: 'RISK_SCORING_SERVICE_URL',
  alert:       'ALERT_SERVICE_URL',
  playbook:    'PLAYBOOK_SERVICE_URL',
} as const

export type ServiceName = keyof typeof SERVICES

const SERVICE_DEFAULTS: Record<ServiceName, string> = {
  auth:        'http://localhost:3100',
  tenant:      'http://localhost:3101',
  ingestion:   'http://localhost:3001',
  threatIntel: 'http://localhost:3005',
  detection:   'http://localhost:3003',
  anomaly:     'http://localhost:3004',
  correlation: 'http://localhost:3006',
  riskScoring: 'http://localhost:3007',
  alert:       'http://localhost:3008',
  playbook:    'http://localhost:3009',
}

const SERVICE_TIMEOUTS: Record<ServiceName, number> = {
  auth:        10_000,
  tenant:      10_000,
  ingestion:   30_000,
  threatIntel: 15_000,
  detection:   15_000,
  anomaly:     20_000,
  correlation: 15_000,
  riskScoring: 10_000,
  alert:       15_000,
  playbook:    30_000,
}

export function getServiceUrl(service: ServiceName): string {
  const envVar = SERVICES[service]
  return process.env[envVar] ?? SERVICE_DEFAULTS[service]
}

// ── Core proxy function ───────────────────────

export async function proxyTo(
  ctx:        Context,
  service:    ServiceName,
  targetPath: string,
  overrideMethod?: string,
): Promise<Response> {
  const baseUrl   = getServiceUrl(service)
  const targetUrl = `${baseUrl}${targetPath}`
  const method    = overrideMethod ?? ctx.req.method
  const timeoutMs = SERVICE_TIMEOUTS[service]

  // Forward headers (drop hop-by-hop)
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(ctx.req.raw.headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue
    headers[key] = value as string
  }

  // Forward the authenticated user context to downstream services
  const user = ctx.var.user
  if (user) {
    headers['X-User-Id']    = user.id
    headers['X-Tenant-Id']  = user.tenantId
    headers['X-User-Role']  = user.role
    headers['X-User-Email'] = user.email
    headers['X-Request-Id'] = ctx.var.requestId
  }

  let body: RequestInit['body']
  if (!['GET', 'HEAD', 'DELETE'].includes(method)) {
    body = ctx.req.raw.body ?? undefined
  }

  try {
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    }
    if (body != null) {
      init.body = body
      Object.assign(init, { duplex: 'half' as const })
    }
    const resp = await fetch(targetUrl, init)

    log.debug({
      service,
      method,
      targetUrl,
      status: resp.status,
      requestId: ctx.var.requestId,
    }, 'Proxy request completed')

    return resp

  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    log.error({
      err,
      service,
      targetUrl,
      isTimeout,
    }, `Proxy to ${service} failed`)

    const status  = isTimeout ? 504 : 502
    const code    = isTimeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR'
    const message = isTimeout
      ? `Service ${service} timed out after ${timeoutMs}ms`
      : `Service ${service} is unavailable`

    return new Response(
      JSON.stringify({ success: false, error: { code, message } }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

// Hop-by-hop headers that must not be forwarded
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailers', 'transfer-encoding',
  'upgrade', 'host',
])

// ── Service health checker ────────────────────

export interface ServiceHealthStatus {
  service:   ServiceName
  url:       string
  status:    'healthy' | 'degraded' | 'down'
  latencyMs: number
  error?:    string
}

const HEALTH_PATHS: Record<ServiceName, string> = {
  auth:        '/v1/auth/health',
  tenant:      '/health',
  ingestion:   '/v1/ingest/health',
  threatIntel: '/health',
  detection:   '/health',
  anomaly:     '/health',
  correlation: '/health',
  riskScoring: '/health',
  alert:       '/health',
  playbook:    '/health',
}

export async function checkServiceHealth(
  service: ServiceName,
): Promise<ServiceHealthStatus> {
  const url     = getServiceUrl(service)
  const path    = HEALTH_PATHS[service]
  const fullUrl = `${url}${path}`
  const start   = Date.now()

  try {
    const resp = await fetch(fullUrl, {
      method:  'GET',
      signal:  AbortSignal.timeout(5_000),
    })
    const latency = Date.now() - start

    if (resp.ok) {
      return {
        service,
        url:       fullUrl,
        status:    'healthy',
        latencyMs: latency,
      }
    }
    return {
      service,
      url:       fullUrl,
      status:    'degraded',
      latencyMs: latency,
      error:     `HTTP ${resp.status}`,
    }
  } catch (err) {
    return {
      service,
      url:    fullUrl,
      status: 'down',
      latencyMs: Date.now() - start,
      error:  err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

export async function checkAllServices(): Promise<ServiceHealthStatus[]> {
  const services = Object.keys(SERVICES) as ServiceName[]
  return Promise.all(services.map(checkServiceHealth))
}
