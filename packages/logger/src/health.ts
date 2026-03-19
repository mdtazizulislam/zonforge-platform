import type { Context } from 'hono'
import { createLogger } from '@zonforge/logger'

// ─────────────────────────────────────────────────────────────────
// ZonForge Sentinel — Unified Health Check Service
//
// Provides two endpoints:
//
//   GET /health          → shallow (Kubernetes liveness probe)
//                          Fast: only checks if process is alive
//
//   GET /health/ready    → deep (Kubernetes readiness probe)
//                          Checks DB, Redis, ClickHouse, queue lag
//
//   GET /health/pipeline → pipeline-specific health
//                          Queue depths, lag, worker status
//
// Kubernetes probes:
//   livenessProbe:  GET /health         (every 15s, timeout 3s)
//   readinessProbe: GET /health/ready   (every 10s, timeout 5s)
//   startupProbe:   GET /health         (every 5s, failureThreshold 30)
// ─────────────────────────────────────────────────────────────────

const log = createLogger({ service: 'health-check' })

export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthCheckResult {
  component: string
  status:    HealthStatus
  latencyMs: number
  detail?:   string
  critical:  boolean
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT CHECKERS
// ─────────────────────────────────────────────────────────────────

async function checkPostgres(): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    const { getDb, schema } = await import('@zonforge/db-client')
    const db = getDb()
    await db.select({ one: { value: 1 } })
      .from(schema.tenants)
      .limit(1)
    return {
      component: 'postgres',
      status:    'ok',
      latencyMs: Date.now() - start,
      critical:  true,
    }
  } catch (err) {
    log.error({ err }, 'PostgreSQL health check failed')
    return {
      component: 'postgres',
      status:    'down',
      latencyMs: Date.now() - start,
      detail:    err instanceof Error ? err.message : 'Connection failed',
      critical:  true,
    }
  }
}

async function checkRedis(redis: any): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    const pong = await redis.ping()
    return {
      component: 'redis',
      status:    pong === 'PONG' ? 'ok' : 'degraded',
      latencyMs: Date.now() - start,
      critical:  true,
    }
  } catch (err) {
    return {
      component: 'redis',
      status:    'down',
      latencyMs: Date.now() - start,
      detail:    err instanceof Error ? err.message : 'Connection failed',
      critical:  true,
    }
  }
}

async function checkClickHouse(): Promise<HealthCheckResult> {
  const start = Date.now()
  const host  = process.env['ZONFORGE_CLICKHOUSE_HOST'] ?? 'http://localhost:8123'
  try {
    const resp = await fetch(`${host}/ping`, {
      signal: AbortSignal.timeout(3000),
    })
    return {
      component: 'clickhouse',
      status:    resp.ok ? 'ok' : 'degraded',
      latencyMs: Date.now() - start,
      detail:    resp.ok ? undefined : `HTTP ${resp.status}`,
      critical:  false,   // platform can degrade without ClickHouse (events delayed, not dropped)
    }
  } catch (err) {
    return {
      component: 'clickhouse',
      status:    'down',
      latencyMs: Date.now() - start,
      detail:    err instanceof Error ? err.message : 'Connection failed',
      critical:  false,
    }
  }
}

async function checkQueueLag(redis: any): Promise<HealthCheckResult> {
  const start = Date.now()
  try {
    // Check raw-events queue depth
    const waiting = await redis.llen('bull:zf:raw-events:wait')
      .catch(() => null)

    if (waiting === null) {
      return {
        component: 'queue-lag',
        status:    'degraded',
        latencyMs: Date.now() - start,
        detail:    'Could not read queue metrics',
        critical:  false,
      }
    }

    // Warn if > 5K waiting, critical if > 50K
    const status: HealthStatus =
      waiting > 50_000 ? 'down'
      : waiting > 5_000 ? 'degraded'
      : 'ok'

    return {
      component: 'queue-lag',
      status,
      latencyMs: Date.now() - start,
      detail:    `${waiting} events waiting in raw-events queue`,
      critical:  false,
    }
  } catch (err) {
    return {
      component: 'queue-lag',
      status:    'degraded',
      latencyMs: Date.now() - start,
      detail:    'Queue check unavailable',
      critical:  false,
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// HEALTH ROUTE FACTORY
// ─────────────────────────────────────────────────────────────────

export function createHealthRoutes(opts: {
  service:  string
  version?: string
  redis?:   any
  extras?:  (() => Promise<HealthCheckResult>)[]
}) {
  const { Hono } = require('hono')
  const router   = new Hono()

  // ── GET /health — liveness (fast, always 200 if process alive) ──

  router.get('/health', (ctx: Context) => {
    return ctx.json({
      status:   'ok',
      service:  opts.service,
      version:  opts.version ?? process.env['SERVICE_VERSION'] ?? '0.0.0',
      uptime:   Math.floor(process.uptime()),
      timestamp: new Date(),
    }, 200)
  })

  // ── GET /health/ready — readiness (deep checks) ─────────────────

  router.get('/health/ready', async (ctx: Context) => {
    const checks: Promise<HealthCheckResult>[] = [
      checkPostgres(),
    ]

    if (opts.redis) {
      checks.push(checkRedis(opts.redis))
      checks.push(checkQueueLag(opts.redis))
    }

    checks.push(checkClickHouse())

    if (opts.extras) {
      checks.push(...opts.extras.map(fn => fn()))
    }

    const results  = await Promise.all(checks)
    const hasDown  = results.some(r => r.status === 'down' && r.critical)
    const hasDeg   = results.some(r => r.status === 'degraded')
    const overall: HealthStatus = hasDown ? 'down' : hasDeg ? 'degraded' : 'ok'

    const statusCode = hasDown ? 503 : 200

    return ctx.json({
      status:    overall,
      service:   opts.service,
      version:   opts.version ?? process.env['SERVICE_VERSION'] ?? '0.0.0',
      checks:    results,
      timestamp: new Date(),
    }, statusCode)
  })

  // ── GET /health/pipeline — pipeline-specific health ─────────────

  router.get('/health/pipeline', async (ctx: Context) => {
    if (!opts.redis) {
      return ctx.json({ error: 'Redis not available' }, 503)
    }

    try {
      const redis = opts.redis

      // Get queue stats
      const [rawWaiting, rawActive, rawFailed, dlqWaiting] = await Promise.all([
        redis.llen('bull:zf:raw-events:wait').catch(() => 0),
        redis.llen('bull:zf:raw-events:active').catch(() => 0),
        redis.zcard('bull:zf:raw-events:failed').catch(() => 0),
        redis.llen('bull:zf:dlq:raw-events:wait').catch(() => 0),
      ])

      // Compute lag estimate (assumes 1K events/sec normalization capacity)
      const estimatedLagSeconds = Math.floor(rawWaiting / 1000)

      const overall: HealthStatus =
        estimatedLagSeconds > 300 ? 'down'
        : estimatedLagSeconds > 60 ? 'degraded'
        : dlqWaiting > 0 ? 'degraded'
        : 'ok'

      return ctx.json({
        status: overall,
        queues: {
          rawEvents: {
            waiting:             rawWaiting,
            active:              rawActive,
            failed:              rawFailed,
            estimatedLagSeconds,
          },
          deadLetterQueue: {
            waiting: dlqWaiting,
          },
        },
        sloStatus: {
          normalizationLagSec:    estimatedLagSeconds,
          normalizationSloBreached: estimatedLagSeconds > 120,
        },
        timestamp: new Date(),
      }, overall === 'down' ? 503 : 200)

    } catch (err) {
      log.error({ err }, 'Pipeline health check failed')
      return ctx.json({ status: 'down', error: 'Pipeline metrics unavailable' }, 503)
    }
  })

  return router
}

// ─────────────────────────────────────────────────────────────────
// KUBERNETES PROBE ANNOTATIONS (add to deployment templates)
// ─────────────────────────────────────────────────────────────────

export const K8S_PROBE_CONFIG = {
  livenessProbe: {
    httpGet:             { path: '/health',       port: 3000 },
    initialDelaySeconds: 10,
    periodSeconds:       15,
    timeoutSeconds:       3,
    failureThreshold:     3,
  },
  readinessProbe: {
    httpGet:             { path: '/health/ready', port: 3000 },
    initialDelaySeconds:  5,
    periodSeconds:       10,
    timeoutSeconds:       5,
    failureThreshold:     2,
    successThreshold:     1,
  },
  startupProbe: {
    httpGet:             { path: '/health',       port: 3000 },
    initialDelaySeconds:  5,
    periodSeconds:        5,
    timeoutSeconds:       3,
    failureThreshold:    30,   // 30 * 5s = 150s max startup time
  },
}
