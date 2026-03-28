export type PlanCode = 'starter' | 'growth' | 'business' | 'enterprise'
export type ContractOrNumber = number | 'contracted'

export interface PlanLimits {
  connectors: ContractOrNumber
  identities: ContractOrNumber
  retention_days: number
  ai_enabled: false | 'limited' | 'full'
  max_events_per_min: ContractOrNumber
}

export const PLAN_DEFINITIONS: Record<PlanCode, PlanLimits> = {
  starter: {
    connectors: 1,
    identities: 50,
    retention_days: 7,
    ai_enabled: false,
    max_events_per_min: 500,
  },
  growth: {
    connectors: 5,
    identities: 500,
    retention_days: 90,
    ai_enabled: 'limited',
    max_events_per_min: 2000,
  },
  business: {
    connectors: 20,
    identities: 2000,
    retention_days: 180,
    ai_enabled: 'full',
    max_events_per_min: 10000,
  },
  enterprise: {
    connectors: 'contracted',
    identities: 'contracted',
    retention_days: 365,
    ai_enabled: 'full',
    max_events_per_min: 'contracted',
  },
}

export function getPlanLimits(planCode: string | null | undefined): PlanLimits {
  const key = (planCode ?? 'starter').toLowerCase() as PlanCode
  return PLAN_DEFINITIONS[key] ?? PLAN_DEFINITIONS.starter
}
