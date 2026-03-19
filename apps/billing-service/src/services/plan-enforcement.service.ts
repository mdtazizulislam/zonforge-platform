import type { Context, Next } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import { PLAN_PRICING } from '../plans.js'
import type { PlanTier } from '@zonforge/shared-types'

const log = createLogger({ service: 'billing-service:enforcement' })

// ─────────────────────────────────────────────
// PLAN ENFORCEMENT MIDDLEWARE
//
// Checks quota limits at every protected endpoint.
// Returns 402 Payment Required when limit exceeded.
// Caches tenant plan in Hono context for fast checks.
// ─────────────────────────────────────────────

interface QuotaCheckResult {
  allowed:  boolean
  code?:    string
  message?: string
  limit?:   number | string
  current?: number
  upgradeRequired?: PlanTier
}

// ── Feature gate check ────────────────────────

export async function checkFeature(
  tenantId: string,
  feature:  'hasLlmNarratives' | 'hasPlaybooks' | 'hasSsoIntegration' | 'hasByok' | 'hasApiAccess',
): Promise<QuotaCheckResult> {
  const db = getDb()

  const rows = await db.select({ planTier: schema.tenants.planTier })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1)

  const planTier = (rows[0]?.planTier ?? 'starter') as PlanTier
  const limits   = PLAN_PRICING[planTier]

  if (!limits[feature]) {
    const upgradeRequired = getMinPlanForFeature(feature)
    return {
      allowed:         false,
      code:            'FEATURE_NOT_AVAILABLE',
      message:         `Feature "${feature}" requires ${upgradeRequired} plan or higher`,
      upgradeRequired,
    }
  }

  return { allowed: true }
}

// ── Connector quota check ─────────────────────

export async function checkConnectorQuota(tenantId: string): Promise<QuotaCheckResult> {
  const db = getDb()

  const rows = await db.select({ planTier: schema.tenants.planTier })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1)

  const planTier = (rows[0]?.planTier ?? 'starter') as PlanTier
  const limits   = PLAN_PRICING[planTier].limits
  const maxConn  = typeof limits.connectors === 'number' ? limits.connectors : 999_999

  const active = await db.select({ id: schema.connectors.id })
    .from(schema.connectors)
    .where(and(
      eq(schema.connectors.tenantId, tenantId),
      eq(schema.connectors.status,   'active'),
    ))

  if (active.length >= maxConn) {
    return {
      allowed:  false,
      code:     'PLAN_LIMIT_EXCEEDED',
      message:  `Your ${planTier} plan allows ${maxConn} active connector${maxConn === 1 ? '' : 's'}. Upgrade to add more.`,
      limit:    maxConn,
      current:  active.length,
      upgradeRequired: getUpgradeTierForConnectors(maxConn),
    }
  }

  return { allowed: true, limit: maxConn, current: active.length }
}

// ── Custom rule quota check ───────────────────

export async function checkCustomRuleQuota(tenantId: string): Promise<QuotaCheckResult> {
  const db = getDb()

  const rows = await db.select({ planTier: schema.tenants.planTier })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1)

  const planTier   = (rows[0]?.planTier ?? 'starter') as PlanTier
  const limits     = PLAN_PRICING[planTier].limits
  const maxRules   = typeof limits.customRules === 'number' ? limits.customRules : 999_999

  if (maxRules === 0) {
    return {
      allowed:  false,
      code:     'FEATURE_NOT_AVAILABLE',
      message:  'Custom detection rules require Growth plan or higher.',
      limit:    0,
      upgradeRequired: 'growth',
    }
  }

  const custom = await db.select({ id: schema.detectionRules.id })
    .from(schema.detectionRules)
    .where(and(
      eq(schema.detectionRules.tenantId,  tenantId),
      eq(schema.detectionRules.isCustom,  true),
      eq(schema.detectionRules.enabled,   true),
    ))

  if (custom.length >= maxRules) {
    return {
      allowed:  false,
      code:     'PLAN_LIMIT_EXCEEDED',
      message:  `Your ${planTier} plan allows ${maxRules} custom rules. Upgrade to add more.`,
      limit:    maxRules,
      current:  custom.length,
    }
  }

  return { allowed: true, limit: maxRules, current: custom.length }
}

// ── Tenant suspended check ────────────────────

export async function checkTenantActive(tenantId: string): Promise<QuotaCheckResult> {
  const db = getDb()

  const rows = await db.select({ status: schema.tenants.status })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1)

  const status = rows[0]?.status ?? 'active'

  if (status === 'suspended') {
    return {
      allowed:  false,
      code:     'TENANT_SUSPENDED',
      message:  'Your account has been suspended. Please contact support.',
    }
  }

  if (status === 'trial' || status === 'active') {
    return { allowed: true }
  }

  return {
    allowed:  false,
    code:     'ACCOUNT_INACTIVE',
    message:  `Account status: ${status}. Please contact support.`,
  }
}

// ── Hono middleware factories ─────────────────

export function requireFeatureMiddleware(
  feature: 'hasLlmNarratives' | 'hasPlaybooks' | 'hasSsoIntegration' | 'hasByok' | 'hasApiAccess',
) {
  return async (ctx: Context, next: Next) => {
    const user = ctx.var.user
    if (!user) {
      return ctx.json({ success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401)
    }

    const check = await checkFeature(user.tenantId, feature)

    if (!check.allowed) {
      return ctx.json({
        success: false,
        error: {
          code:    check.code ?? 'FEATURE_NOT_AVAILABLE',
          message: check.message,
          upgrade: check.upgradeRequired
            ? { requiredPlan: check.upgradeRequired, checkoutUrl: '/billing/upgrade' }
            : undefined,
        },
      }, 402)   // 402 Payment Required
    }

    await next()
  }
}

export function requireActiveAccountMiddleware() {
  return async (ctx: Context, next: Next) => {
    const user = ctx.var.user
    if (!user) { await next(); return }

    const check = await checkTenantActive(user.tenantId)

    if (!check.allowed) {
      return ctx.json({
        success: false,
        error: { code: check.code, message: check.message },
      }, 402)
    }

    await next()
  }
}

// ─────────────────────────────────────────────
// PLAN HELPERS
// ─────────────────────────────────────────────

function getMinPlanForFeature(
  feature: string,
): PlanTier {
  const featureMap: Record<string, PlanTier> = {
    hasLlmNarratives:  'growth',
    hasPlaybooks:      'business',
    hasSsoIntegration: 'business',
    hasByok:           'enterprise',
    hasApiAccess:      'business',
  }
  return featureMap[feature] ?? 'growth'
}

function getUpgradeTierForConnectors(currentLimit: number): PlanTier {
  if (currentLimit <= 1)  return 'growth'
  if (currentLimit <= 3)  return 'business'
  if (currentLimit <= 10) return 'enterprise'
  return 'enterprise'
}

// needed for checkConnectorQuota
import { and } from 'drizzle-orm'
