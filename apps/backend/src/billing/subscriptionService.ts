import { getTenantPlanState } from './tenantPlans.js'

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
  if (normalized === 'trial') return 'TRIALING'
  if (normalized === 'trialing') return 'TRIALING'
  if (normalized === 'past_due') return 'PAST_DUE'
  if (normalized === 'incomplete') return 'INCOMPLETE'
  if (normalized === 'canceled' || normalized === 'cancelled') return 'CANCELED'
  return 'NONE'
}

export async function getTenantSubscription(tenantId: number): Promise<TenantSubscription | null> {
  const state = await getTenantPlanState(tenantId)
  return {
    tenant_id: tenantId,
    plan_code: state.plan.code,
    status: normalizeStatus(state.status),
    current_period_end: state.expiresAt,
  }
}

export async function getTenantPlan(tenantId: number): Promise<string> {
  const subscription = await getTenantSubscription(tenantId)
  return subscription?.plan_code ?? 'free'
}

export async function isSubscriptionActive(tenantId: number): Promise<boolean> {
  const subscription = await getTenantSubscription(tenantId)
  if (!subscription) return false
  return subscription.status === 'ACTIVE' || subscription.status === 'TRIALING'
}
