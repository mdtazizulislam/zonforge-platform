import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'security-hardening-check' })

// ─────────────────────────────────────────────
// SECURITY HARDENING CHECKLIST
//
// Automated pre-deployment checks that verify
// all critical security controls are in place.
// Fails CI/CD if any CRITICAL item fails.
// ─────────────────────────────────────────────

export interface CheckResult {
  id:       string
  category: string
  check:    string
  status:   'pass' | 'fail' | 'warn' | 'skip'
  severity: 'critical' | 'high' | 'medium' | 'low'
  message:  string
  remediation?: string
}

export type HardeningReport = {
  passed:   number
  failed:   number
  warnings: number
  critical_failures: number
  results:  CheckResult[]
  timestamp: Date
  overall:  'pass' | 'fail' | 'warn'
}

// ─────────────────────────────────────────────
// ENVIRONMENT CHECKS
// ─────────────────────────────────────────────

function checkEnvironmentVariables(): CheckResult[] {
  const results: CheckResult[] = []

  const criticalVars = [
    'ZONFORGE_JWT_SECRET',
    'ZONFORGE_ENCRYPTION_KEY',
    'ZONFORGE_HMAC_SECRET',
    'ZONFORGE_API_KEY_SALT',
    'ZONFORGE_POSTGRES_PASSWORD',
  ]

  const weakPatterns = [
    /^changeme$/i,
    /^password$/i,
    /^secret$/i,
    /^12345/,
    /^test/i,
    /^dev/i,
    /^00000+$/,
  ]

  for (const varName of criticalVars) {
    const value = process.env[varName]

    if (!value) {
      results.push({
        id:       `ENV-001-${varName}`,
        category: 'Environment',
        check:    `Required env var: ${varName}`,
        status:   'fail',
        severity: 'critical',
        message:  `${varName} is not set`,
        remediation: `Set ${varName} to a strong random value: openssl rand -hex 32`,
      })
      continue
    }

    if (value.length < 32) {
      results.push({
        id:       `ENV-002-${varName}`,
        category: 'Environment',
        check:    `Secret strength: ${varName}`,
        status:   'fail',
        severity: 'high',
        message:  `${varName} is too short (${value.length} chars, minimum 32)`,
        remediation: `Regenerate ${varName}: openssl rand -hex 32`,
      })
      continue
    }

    const isWeak = weakPatterns.some(p => p.test(value))
    if (isWeak) {
      results.push({
        id:       `ENV-003-${varName}`,
        category: 'Environment',
        check:    `Secret entropy: ${varName}`,
        status:   'fail',
        severity: 'critical',
        message:  `${varName} appears to be a weak/default value`,
        remediation: `Replace with: openssl rand -hex 32`,
      })
      continue
    }

    results.push({
      id:       `ENV-OK-${varName}`,
      category: 'Environment',
      check:    `Secret: ${varName}`,
      status:   'pass',
      severity: 'critical',
      message:  `${varName} is set and meets minimum requirements`,
    })
  }

  return results
}

// ─────────────────────────────────────────────
// RUNTIME SECURITY CHECKS
// ─────────────────────────────────────────────

function checkRuntimeSecurity(): CheckResult[] {
  const results: CheckResult[] = []
  const env = process.env['ZONFORGE_ENV'] ?? 'development'

  // 1. HTTPS required in production
  const apiUrl = process.env['ZONFORGE_API_URL'] ?? ''
  if (env === 'production' && !apiUrl.startsWith('https://')) {
    results.push({
      id:       'RUNTIME-001',
      category: 'Runtime',
      check:    'HTTPS enforcement',
      status:   'fail',
      severity: 'critical',
      message:  `ZONFORGE_API_URL must use HTTPS in production (got: ${apiUrl})`,
      remediation: 'Set ZONFORGE_API_URL to https://...',
    })
  } else {
    results.push({
      id:       'RUNTIME-001',
      category: 'Runtime',
      check:    'HTTPS enforcement',
      status:   env === 'production' ? 'pass' : 'skip',
      severity: 'critical',
      message:  env === 'production' ? 'HTTPS configured' : 'Skipped (not production)',
    })
  }

  // 2. Debug mode not enabled in production
  if (env === 'production') {
    const debugEnabled = process.env['ZONFORGE_DEBUG'] === 'true'
      || process.env['DEBUG'] !== undefined

    results.push({
      id:       'RUNTIME-002',
      category: 'Runtime',
      check:    'Debug mode disabled',
      status:   debugEnabled ? 'fail' : 'pass',
      severity: 'high',
      message:  debugEnabled ? 'Debug mode is enabled in production!' : 'Debug mode is off',
      remediation: 'Remove DEBUG and ZONFORGE_DEBUG environment variables',
    })
  }

  // 3. Database SSL required in production
  const pgSsl = process.env['ZONFORGE_POSTGRES_SSL']
  if (env === 'production' && pgSsl !== 'true') {
    results.push({
      id:       'RUNTIME-003',
      category: 'Runtime',
      check:    'Database SSL',
      status:   'fail',
      severity: 'critical',
      message:  'PostgreSQL SSL is not enabled in production',
      remediation: 'Set ZONFORGE_POSTGRES_SSL=true',
    })
  } else {
    results.push({
      id:       'RUNTIME-003',
      category: 'Runtime',
      check:    'Database SSL',
      status:   env === 'production' ? 'pass' : 'skip',
      severity: 'critical',
      message:  env !== 'production' ? 'Skipped (not production)' : 'Database SSL enabled',
    })
  }

  // 4. Redis TLS required in production
  const redisTls = process.env['ZONFORGE_REDIS_TLS']
  if (env === 'production' && redisTls !== 'true') {
    results.push({
      id:       'RUNTIME-004',
      category: 'Runtime',
      check:    'Redis TLS',
      status:   'warn',
      severity: 'high',
      message:  'Redis TLS is not enabled — recommended for production',
      remediation: 'Set ZONFORGE_REDIS_TLS=true',
    })
  } else {
    results.push({
      id:       'RUNTIME-004',
      category: 'Runtime',
      check:    'Redis TLS',
      status:   'pass',
      severity: 'high',
      message:  'Redis TLS enabled or not production',
    })
  }

  // 5. Stripe configured in production
  if (env === 'production') {
    const stripeKey = process.env['ZONFORGE_STRIPE_SECRET_KEY']
    results.push({
      id:       'RUNTIME-005',
      category: 'Runtime',
      check:    'Stripe configured',
      status:   stripeKey ? 'pass' : 'warn',
      severity: 'medium',
      message:  stripeKey ? 'Stripe is configured' : 'Stripe not configured — billing in mock mode',
      remediation: 'Set ZONFORGE_STRIPE_SECRET_KEY for production billing',
    })
  }

  return results
}

// ─────────────────────────────────────────────
// JWT SECURITY CHECKS
// ─────────────────────────────────────────────

function checkJwtSecurity(): CheckResult[] {
  const results: CheckResult[] = []

  const accessExpiry  = process.env['ZONFORGE_JWT_ACCESS_EXPIRY']  ?? '15m'
  const refreshExpiry = process.env['ZONFORGE_JWT_REFRESH_EXPIRY'] ?? '7d'

  // Access token: max 60 minutes
  const accessMins = parseExpiry(accessExpiry)
  if (accessMins > 60) {
    results.push({
      id:       'JWT-001',
      category: 'JWT',
      check:    'Access token expiry',
      status:   'fail',
      severity: 'high',
      message:  `Access token expiry ${accessExpiry} is too long (max 60m)`,
      remediation: 'Set ZONFORGE_JWT_ACCESS_EXPIRY=15m',
    })
  } else {
    results.push({
      id:       'JWT-001',
      category: 'JWT',
      check:    'Access token expiry',
      status:   'pass',
      severity: 'high',
      message:  `Access token expiry: ${accessExpiry} ✓`,
    })
  }

  // Refresh token: max 30 days
  const refreshDays = parseExpiry(refreshExpiry, 'days')
  if (refreshDays > 30) {
    results.push({
      id:       'JWT-002',
      category: 'JWT',
      check:    'Refresh token expiry',
      status:   'warn',
      severity: 'medium',
      message:  `Refresh token expiry ${refreshExpiry} is long (>30 days)`,
      remediation: 'Consider setting ZONFORGE_JWT_REFRESH_EXPIRY=7d',
    })
  } else {
    results.push({
      id:       'JWT-002',
      category: 'JWT',
      check:    'Refresh token expiry',
      status:   'pass',
      severity: 'medium',
      message:  `Refresh token expiry: ${refreshExpiry} ✓`,
    })
  }

  return results
}

// ─────────────────────────────────────────────
// MAIN HARDENING CHECK RUNNER
// ─────────────────────────────────────────────

export function runHardeningChecks(): HardeningReport {
  const allResults: CheckResult[] = [
    ...checkEnvironmentVariables(),
    ...checkRuntimeSecurity(),
    ...checkJwtSecurity(),
  ]

  const passed    = allResults.filter(r => r.status === 'pass').length
  const failed    = allResults.filter(r => r.status === 'fail').length
  const warnings  = allResults.filter(r => r.status === 'warn').length
  const critical  = allResults.filter(r => r.status === 'fail' && r.severity === 'critical').length

  const overall: HardeningReport['overall'] =
    critical > 0  ? 'fail'
    : failed > 0  ? 'fail'
    : warnings > 0 ? 'warn'
    : 'pass'

  const report: HardeningReport = {
    passed,
    failed,
    warnings,
    critical_failures: critical,
    results:   allResults,
    timestamp: new Date(),
    overall,
  }

  if (overall === 'fail') {
    log.error({ critical, failed, warnings, passed }, '🚨 Security hardening checks FAILED')
    allResults
      .filter(r => r.status === 'fail')
      .forEach(r => log.error({
        check:       r.check,
        severity:    r.severity,
        message:     r.message,
        remediation: r.remediation,
      }, `FAIL [${r.severity.toUpperCase()}]: ${r.check}`))
  } else if (overall === 'warn') {
    log.warn({ warnings, passed }, '⚠️  Security hardening checks passed with warnings')
  } else {
    log.info({ passed }, '✅ All security hardening checks passed')
  }

  return report
}

// ─────────────────────────────────────────────
// STARTUP SECURITY GATE
//
// Call this at service startup.
// Exits process if critical checks fail.
// ─────────────────────────────────────────────

export function enforceHardeningAtStartup(): void {
  const env = process.env['ZONFORGE_ENV'] ?? 'development'

  // Only enforce in production and staging
  if (!['production', 'staging'].includes(env)) return

  const report = runHardeningChecks()

  if (report.critical_failures > 0) {
    log.fatal({
      critical: report.critical_failures,
      failed:   report.failed,
    }, '🔴 CRITICAL security requirements not met — refusing to start')
    process.exit(1)
  }
}

// ── Helpers ───────────────────────────────────

function parseExpiry(expiry: string, unit: 'minutes' | 'days' = 'minutes'): number {
  const match = expiry.match(/^(\d+)([smhd])$/)
  if (!match) return 0
  const [, num, suffix] = match
  const n = parseInt(num!, 10)
  if (unit === 'days') {
    return suffix === 'd' ? n : suffix === 'h' ? n / 24 : n / 1440
  }
  return suffix === 'm' ? n : suffix === 'h' ? n * 60 : suffix === 'd' ? n * 1440 : n / 60
}
