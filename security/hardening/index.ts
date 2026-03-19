import type Redis from 'ioredis'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { AuditExportService, verifyAuditChain } from '../audit-export/audit-export.service.js'
import { SecretsRotationService } from '../secrets-rotation/secrets-rotation.service.js'
import {
  runHardeningChecks,
  enforceHardeningAtStartup,
} from './security-checks.js'
import {
  createRateLimitMiddleware,
  requestSanitizationMiddleware,
} from './rate-limiting.js'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'security-hardening' })

// ─────────────────────────────────────────────
// SECURITY HARDENING MODULE
//
// Single import that applies all security controls
// to a Hono application instance.
// Call applySecurityHardening(app, redis) in main.ts
// ─────────────────────────────────────────────

export interface SecurityHardeningOptions {
  redis:              Redis
  enableAuditExport?: boolean     // default: true in production
  enableRateLimit?:   boolean     // default: true
  enableCSP?:         boolean     // default: true
}

export function applySecurityHardening(
  app:  Hono,
  opts: SecurityHardeningOptions,
): void {
  const {
    redis,
    enableAuditExport = process.env['ZONFORGE_ENV'] === 'production',
    enableRateLimit   = true,
    enableCSP         = true,
  } = opts

  // ── 1. Request sanitization (first line) ──

  app.use('*', requestSanitizationMiddleware)

  // ── 2. Secure headers ─────────────────────

  app.use('*', secureHeaders({
    xFrameOptions:              'DENY',
    xContentTypeOptions:        'nosniff',
    referrerPolicy:             'strict-origin-when-cross-origin',
    strictTransportSecurity:    process.env['ZONFORGE_ENV'] === 'production'
      ? 'max-age=31536000; includeSubDomains; preload'
      : undefined,
    permissionsPolicy: {
      camera:      [],
      microphone:  [],
      geolocation: [],
    },
  }))

  // ── 3. Rate limiting ──────────────────────

  if (enableRateLimit) {
    app.use('*', createRateLimitMiddleware(redis))
  }

  log.info({
    rateLimit:    enableRateLimit,
    auditExport:  enableAuditExport,
    csp:          enableCSP,
    env:          process.env['ZONFORGE_ENV'],
  }, '✅ Security hardening applied')
}

// ─────────────────────────────────────────────
// SECURITY ADMIN ROUTES
//
// Internal routes for security operations.
// Mount at /internal/security (auth required).
// ─────────────────────────────────────────────

export function createSecurityAdminRouter(): Hono {
  const router = new Hono()

  // ── GET /internal/security/hardening-check ─────

  router.get('/internal/security/hardening-check', async (ctx) => {
    const user = ctx.var.user
    if (user?.role !== 'PLATFORM_ADMIN') {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN' } }, 403)
    }

    const report = runHardeningChecks()
    return ctx.json({
      success: true,
      data:    report,
    }, report.overall === 'fail' ? 500 : 200)
  })

  // ── POST /internal/security/audit-export ───────

  router.post('/internal/security/audit-export', async (ctx) => {
    const user = ctx.var.user
    if (user?.role !== 'PLATFORM_ADMIN') {
      return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    }

    const { tenantId, date } = await ctx.req.json() as {
      tenantId?: string; date?: string
    }

    const exportDate = date ? new Date(date) : new Date(Date.now() - 86_400_000)
    const service    = new AuditExportService()

    let result
    if (tenantId) {
      result = await service.exportTenantDay(tenantId, exportDate)
    } else {
      result = await service.exportAllTenantsDay(exportDate)
    }

    return ctx.json({ success: true, data: result })
  })

  // ── POST /internal/security/verify-audit-chain ─

  router.post('/internal/security/verify-audit-chain', async (ctx) => {
    const user = ctx.var.user
    if (user?.role !== 'PLATFORM_ADMIN') {
      return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    }

    const { tenantId, fromDate, toDate } = await ctx.req.json() as {
      tenantId: string; fromDate: string; toDate: string
    }

    const result = await verifyAuditChain(
      tenantId,
      new Date(fromDate),
      new Date(toDate),
    )

    return ctx.json({
      success: true,
      data:    result,
    }, result.valid ? 200 : 409)
  })

  // ── GET /internal/security/secrets-status ──────

  router.get('/internal/security/secrets-status', async (ctx) => {
    const user = ctx.var.user
    if (user?.role !== 'PLATFORM_ADMIN') {
      return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    }

    const secretsService = new SecretsRotationService()

    const [rotationStatus, kmsStatus] = await Promise.all([
      secretsService.checkRotationStatus(),
      secretsService.verifyKmsKeyRotation(),
    ])

    return ctx.json({
      success: true,
      data: {
        secrets:    rotationStatus,
        kmsKeys:    kmsStatus,
        overdue:    rotationStatus.filter(s => s.overdue).length,
        timestamp:  new Date(),
      },
    })
  })

  // ── POST /internal/security/rotate-secret ──────

  router.post('/internal/security/rotate-secret', async (ctx) => {
    const user = ctx.var.user
    if (user?.role !== 'PLATFORM_ADMIN') {
      return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    }

    const { secretName } = await ctx.req.json() as { secretName: string }
    if (!secretName) {
      return ctx.json({ success: false,
        error: { code: 'VALIDATION_ERROR', message: 'secretName required' } }, 400)
    }

    const service = new SecretsRotationService()
    const result  = await service.rotateNow(secretName)
    return ctx.json({ success: result.rotated, data: result })
  })

  return router
}

// Re-export for convenience
export {
  runHardeningChecks,
  enforceHardeningAtStartup,
  AuditExportService,
  SecretsRotationService,
  verifyAuditChain,
}
