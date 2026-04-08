import { getPool } from '../db.js'
import {
  getLimitValue,
  getTenantPlanState,
  isFeatureEnabled,
  normalizeLimitForComparison,
  type PlanFeatureKey,
  type PlanLimitKey,
  type TenantPlanState,
} from './tenantPlans.js'

export type FeatureCode = 'AI_ANALYSIS' | 'ADVANCED_DETECTION' | 'EXPORT_REPORT' | 'THREAT_HUNTING'
export type MetricCode = 'CONNECTORS' | 'IDENTITIES' | 'EVENTS_PER_MIN'

export type RequiredFeatureLevel = 'summary' | 'basic' | 'full'

export class UpgradeRequiredError extends Error {
  public readonly code = 'UPGRADE_REQUIRED'

  constructor(
    public readonly plan: string,
    public readonly metric: string,
    public readonly limit: number | string,
    public readonly recommendedPlan?: string,
    message?: string,
  ) {
    super(message ?? 'Upgrade required')
    this.name = 'UpgradeRequiredError'
  }

  toResponse() {
    return {
      code: this.code,
      plan: this.plan,
      metric: this.metric,
      limit: this.limit,
      recommendedPlan: this.recommendedPlan ?? null,
      message: this.message,
    }
  }
}

function metricToLimitKey(metricCode: MetricCode): PlanLimitKey {
  if (metricCode === 'CONNECTORS') return 'max_connectors'
  if (metricCode === 'IDENTITIES') return 'max_identities'
  return 'events_per_minute'
}

function periodForMetric(metricCode: MetricCode): 'day' | 'hour' {
  return metricCode === 'EVENTS_PER_MIN' ? 'hour' : 'day'
}

function periodBounds(period: 'day' | 'hour') {
  const now = new Date()
  const start = new Date(now)
  if (period === 'hour') {
    start.setMinutes(0, 0, 0)
  } else {
    start.setHours(0, 0, 0, 0)
  }
  return { start, now }
}

export async function incrementUsage(tenantId: number, metricCode: MetricCode, increment = 1): Promise<number> {
  const pool = getPool()
  const period = periodForMetric(metricCode)
  const { start } = periodBounds(period)

  const result = await pool.query(
    `INSERT INTO usage_counters (
       tenant_id, metric_code, metric, period_start, period_end, period, current_value, value, updated_at
     ) VALUES ($1,$2,$2,$3,$4,$5,$6,$6,NOW())
     ON CONFLICT (tenant_id, metric_code, period_start, period_end)
     DO UPDATE SET
       current_value = usage_counters.current_value + EXCLUDED.current_value,
       value = usage_counters.value + EXCLUDED.value,
       updated_at = NOW()
     RETURNING current_value`,
    [tenantId, metricCode, start, start, period, increment],
  )

  return Number(result.rows[0]?.current_value ?? 0)
}

export async function getUsageSummary(tenantId: number) {
  const pool = getPool()
  const state = await getTenantPlanState(tenantId)

  const dayStart = periodBounds('day').start
  const hourStart = periodBounds('hour').start

  const [connectorCount, identityCount, eventUsage] = await Promise.all([
    // Read from usage_counters (billing source-of-truth) — platform connectors table uses UUID tenant_id (different schema).
    pool.query(
      `SELECT COALESCE(SUM(current_value), 0) AS cnt
       FROM usage_counters
       WHERE tenant_id = $1 AND metric_code = 'CONNECTORS'`,
      [tenantId],
    ),
    pool.query('SELECT count(*) AS cnt FROM users u JOIN tenants t ON t.user_id = u.id WHERE t.id = $1', [tenantId]),
    pool.query(
      `SELECT current_value AS cnt
       FROM usage_counters
       WHERE tenant_id = $1 AND metric_code = 'EVENTS_PER_MIN' AND period = 'hour' AND period_start = $2
       LIMIT 1`,
      [tenantId, hourStart],
    ),
  ])

  return {
    plan: state.plan.code,
    status: state.status === 'canceled' ? 'INACTIVE' : 'ACTIVE',
    limits: {
      max_connectors: state.limits.max_connectors,
      max_identities: state.limits.max_identities,
      events_per_minute: state.limits.events_per_minute,
      retention_days: state.limits.retention_days,
    },
    usage: {
      CONNECTORS: Number(connectorCount.rows[0]?.cnt ?? 0),
      IDENTITIES: Number(identityCount.rows[0]?.cnt ?? 0),
      EVENTS_PER_MIN: Number(eventUsage.rows[0]?.cnt ?? 0),
    },
    periods: {
      dayStart,
      hourStart,
    },
  }
}

export function requirePlanFeature(
  state: TenantPlanState,
  featureKey: PlanFeatureKey,
  requiredLevel: RequiredFeatureLevel = 'basic',
): void {
  if (isFeatureEnabled(state, featureKey, requiredLevel)) {
    return
  }

  const recommendedPlan = featureKey === 'ai'
    ? 'business'
    : featureKey === 'investigation' || requiredLevel === 'full'
      ? 'growth'
      : 'starter'

  throw new UpgradeRequiredError(
    state.plan.code,
    featureKey,
    requiredLevel,
    recommendedPlan,
    `${featureKey} requires the ${recommendedPlan} plan or higher.`,
  )
}

export function requirePlanLimit(
  state: TenantPlanState,
  limitKey: PlanLimitKey,
  currentUsage: number,
  increment = 1,
): void {
  const limit = getLimitValue(state, limitKey)
  if (currentUsage + increment <= normalizeLimitForComparison(limit)) {
    return
  }

  throw new UpgradeRequiredError(
    state.plan.code,
    limitKey,
    limit ?? 'unlimited',
    limitKey === 'max_connectors' ? 'starter' : limitKey === 'max_identities' ? 'starter' : 'growth',
    `${limitKey} exceeds the ${state.plan.code} plan allowance.`,
  )
}

export async function assertFeatureAllowed(tenantId: number, featureCode: FeatureCode): Promise<void> {
  const state = await getTenantPlanState(tenantId)
  if (featureCode === 'AI_ANALYSIS') {
    requirePlanFeature(state, 'ai', 'basic')
    return
  }

  if (featureCode === 'ADVANCED_DETECTION') {
    requirePlanFeature(state, 'detections', 'full')
    return
  }

  if (featureCode === 'EXPORT_REPORT' || featureCode === 'THREAT_HUNTING') {
    requirePlanFeature(state, 'investigation', 'basic')
  }
}

export async function assertQuota(
  tenantId: number,
  metricCode: MetricCode,
  currentValue: number,
  increment = 1,
): Promise<void> {
  const state = await getTenantPlanState(tenantId)
  requirePlanLimit(state, metricToLimitKey(metricCode), currentValue, increment)
}
