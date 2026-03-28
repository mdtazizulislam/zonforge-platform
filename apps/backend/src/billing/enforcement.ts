import { getPool } from '../db.js'
import { getPlanLimits } from './planDefinitions.js'
import { getTenantPlan, isSubscriptionActive } from './subscriptionService.js'

export type FeatureCode = 'AI_ANALYSIS' | 'ADVANCED_DETECTION' | 'EXPORT_REPORT' | 'THREAT_HUNTING'
export type MetricCode = 'CONNECTORS' | 'IDENTITIES' | 'EVENTS_PER_MIN'

export class UpgradeRequiredError extends Error {
  public readonly code = 'UPGRADE_REQUIRED'

  constructor(
    public readonly plan: string,
    public readonly metric: string,
    public readonly limit: number | string,
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
      message: this.message,
    }
  }
}

function metricToLimitKey(metricCode: MetricCode): 'connectors' | 'identities' | 'max_events_per_min' {
  if (metricCode === 'CONNECTORS') return 'connectors'
  if (metricCode === 'IDENTITIES') return 'identities'
  return 'max_events_per_min'
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
  const plan = await getTenantPlan(tenantId)
  const limits = getPlanLimits(plan)
  const active = await isSubscriptionActive(tenantId)

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
    plan,
    status: active ? 'ACTIVE' : 'INACTIVE',
    limits,
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

export async function assertFeatureAllowed(tenantId: number, featureCode: FeatureCode): Promise<void> {
  const plan = await getTenantPlan(tenantId)
  const limits = getPlanLimits(plan)
  const active = await isSubscriptionActive(tenantId)

  if (!active && plan !== 'starter') {
    throw new UpgradeRequiredError(plan, featureCode, 'active_subscription',
      `Subscription must be ACTIVE for ${featureCode}`)
  }

  if (featureCode === 'AI_ANALYSIS' && limits.ai_enabled === false) {
    throw new UpgradeRequiredError(plan, featureCode, 'growth_or_higher',
      'AI analysis is not available on the current plan')
  }

  if (featureCode === 'ADVANCED_DETECTION' && (plan === 'starter')) {
    throw new UpgradeRequiredError(plan, featureCode, 'growth_or_higher',
      'Advanced detection is not available on Starter')
  }

  if ((featureCode === 'EXPORT_REPORT' || featureCode === 'THREAT_HUNTING') && (plan === 'starter')) {
    throw new UpgradeRequiredError(plan, featureCode, 'growth_or_higher',
      `${featureCode} is not available on Starter`)
  }
}

export async function assertQuota(
  tenantId: number,
  metricCode: MetricCode,
  currentValue: number,
  increment = 1,
): Promise<void> {
  const plan = await getTenantPlan(tenantId)
  const limits = getPlanLimits(plan)
  const limitKey = metricToLimitKey(metricCode)
  const limit = limits[limitKey]

  if (limit === 'contracted') return

  if (currentValue + increment > limit) {
    throw new UpgradeRequiredError(plan, metricCode, limit,
      `${metricCode} exceeds ${limit} for plan ${plan}`)
  }
}
