import { getPool } from '../db.js'

export type SubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'INCOMPLETE' | 'CANCELED' | 'NONE'

export interface TenantSubscription {
  tenant_id: number
  plan_code: string
  status: SubscriptionStatus
  current_period_end: string | null
}

function normalizeStatus(raw: string | null | undefined): SubscriptionStatus {
  const normalized = String(raw ?? '').toLowerCase()
  if (normalized === 'active') return 'ACTIVE'
  if (normalized === 'trialing') return 'TRIALING'
  if (normalized === 'past_due') return 'PAST_DUE'
  if (normalized === 'incomplete') return 'INCOMPLETE'
  if (normalized === 'canceled' || normalized === 'cancelled') return 'CANCELED'
  return 'NONE'
}

export async function getTenantSubscription(tenantId: number): Promise<TenantSubscription | null> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT
       ts.tenant_id,
       COALESCE(p.code, t.plan, 'starter') AS plan_code,
       COALESCE(ts.subscription_status, 'none') AS subscription_status,
       ts.current_period_end
     FROM tenants t
     LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
     LEFT JOIN plans p ON p.id = ts.plan_id
     WHERE t.id = $1
     LIMIT 1`,
    [tenantId],
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    tenant_id: Number(row.tenant_id),
    plan_code: String(row.plan_code ?? 'starter').toLowerCase(),
    status: normalizeStatus(row.subscription_status),
    current_period_end: row.current_period_end ? String(row.current_period_end) : null,
  }
}

export async function getTenantPlan(tenantId: number): Promise<string> {
  const subscription = await getTenantSubscription(tenantId)
  return subscription?.plan_code ?? 'starter'
}

export async function isSubscriptionActive(tenantId: number): Promise<boolean> {
  const subscription = await getTenantSubscription(tenantId)
  if (!subscription) return false
  return subscription.status === 'ACTIVE' || subscription.status === 'TRIALING'
}
