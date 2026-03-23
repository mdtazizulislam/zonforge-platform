import type { PlanTier } from '@zonforge/shared-types'

// ─────────────────────────────────────────────
// ZONFORGE SENTINEL — PLAN PRICING
//
// Prices in USD cents (Stripe convention)
// ─────────────────────────────────────────────

export interface PlanPrice {
  tier:               PlanTier
  displayName:        string
  description:        string
  monthlyPriceCents:  number
  annualPriceCents:   number    // per month, billed annually
  currency:           'usd'
  stripeMonthlyPriceId?: string  // set from env / Stripe dashboard
  stripeAnnualPriceId?:  string
  trialDays:          number
  highlighted:        boolean   // "Most popular"
  limits: {
    identities:       number | 'unlimited'
    connectors:       number | 'unlimited'
    eventsPerMin:     number | 'unlimited'
    retentionDays:    number
    customRules:      number | 'unlimited'
  }
  features: string[]
}

function withStripePriceIds(monthlyEnv: string, annualEnv: string) {
  return {
    ...(process.env[monthlyEnv]
      ? { stripeMonthlyPriceId: process.env[monthlyEnv] }
      : {}),
    ...(process.env[annualEnv]
      ? { stripeAnnualPriceId: process.env[annualEnv] }
      : {}),
  }
}

export const PLAN_PRICING: Record<PlanTier, PlanPrice> = {
  starter: {
    tier:              'starter',
    displayName:       'Starter',
    description:       'For small teams getting started with threat detection',
    monthlyPriceCents:  0,
    annualPriceCents:   0,
    currency:          'usd',
    ...withStripePriceIds('STRIPE_PRICE_STARTER_MONTHLY', 'STRIPE_PRICE_STARTER_ANNUAL'),
    trialDays:          14,
    highlighted:        false,
    limits: {
      identities:     50,
      connectors:     1,
      eventsPerMin:   500,
      retentionDays:  30,
      customRules:    0,
    },
    features: [
      '1 data connector',
      '50 monitored identities',
      '20 platform detection rules',
      '30-day event retention',
      'Email alerts',
      'Basic risk scoring',
    ],
  },

  growth: {
    tier:              'growth',
    displayName:       'Growth',
    description:       'For growing security teams needing AI-powered insights',
    monthlyPriceCents:  29900,   // $299/month
    annualPriceCents:   24900,   // $249/month billed annually
    currency:          'usd',
    ...withStripePriceIds('STRIPE_PRICE_GROWTH_MONTHLY', 'STRIPE_PRICE_GROWTH_ANNUAL'),
    trialDays:          14,
    highlighted:        false,
    limits: {
      identities:     200,
      connectors:     3,
      eventsPerMin:   2000,
      retentionDays:  90,
      customRules:    5,
    },
    features: [
      '3 data connectors',
      '200 monitored identities',
      '5 custom detection rules',
      'AI-powered alert narratives',
      '90-day event retention',
      'Slack + webhook notifications',
      'Anomaly detection baselines',
      'Threat intelligence feeds',
    ],
  },

  business: {
    tier:              'business',
    displayName:       'Business',
    description:       'Full platform for serious security operations',
    monthlyPriceCents:  99900,   // $999/month
    annualPriceCents:   83300,   // $833/month billed annually
    currency:          'usd',
    ...withStripePriceIds('STRIPE_PRICE_BUSINESS_MONTHLY', 'STRIPE_PRICE_BUSINESS_ANNUAL'),
    trialDays:          14,
    highlighted:        true,   // "Most popular"
    limits: {
      identities:     1000,
      connectors:     10,
      eventsPerMin:   10_000,
      retentionDays:  180,
      customRules:    50,
    },
    features: [
      '10 data connectors',
      '1,000 monitored identities',
      '50 custom detection rules',
      'All AI capabilities',
      '180-day event retention',
      'Automated playbooks',
      'SSO integration',
      'API access',
      'MTTD SLA tracking',
      'Priority support',
    ],
  },

  enterprise: {
    tier:              'enterprise',
    displayName:       'Enterprise',
    description:       'Unlimited scale with advanced security controls',
    monthlyPriceCents:  0,       // contact sales
    annualPriceCents:   0,
    currency:          'usd',
    trialDays:          30,
    highlighted:        false,
    limits: {
      identities:     'unlimited',
      connectors:     'unlimited',
      eventsPerMin:   'unlimited',
      retentionDays:  365,
      customRules:    'unlimited',
    },
    features: [
      'Unlimited connectors & identities',
      'Custom detection rules (unlimited)',
      'Bring Your Own Key (BYOK) encryption',
      'SSO + SCIM provisioning',
      '365-day event retention',
      'Dedicated infrastructure',
      'Custom SLA',
      'Dedicated security CSM',
      'On-premise deployment option',
    ],
  },

  mssp: {
    tier:              'mssp',
    displayName:       'MSSP',
    description:       'Multi-tenant management for managed security providers',
    monthlyPriceCents:  0,       // custom pricing
    annualPriceCents:   0,
    currency:          'usd',
    trialDays:          30,
    highlighted:        false,
    limits: {
      identities:     'unlimited',
      connectors:     'unlimited',
      eventsPerMin:   'unlimited',
      retentionDays:  365,
      customRules:    'unlimited',
    },
    features: [
      'Everything in Enterprise',
      'Multi-tenant management console',
      'Per-customer reporting',
      'White-label option',
      'Reseller pricing model',
      'API-first architecture',
    ],
  },
}

export const PLAN_ORDER: PlanTier[] = [
  'starter', 'growth', 'business', 'enterprise', 'mssp',
]

export function formatPrice(cents: number, period: 'month' | 'year' = 'month'): string {
  if (cents === 0) return 'Free'
  const dollars = cents / 100
  return period === 'month'
    ? `$${dollars.toLocaleString()}/mo`
    : `$${(dollars * 12).toLocaleString()}/yr`
}

export function getPlanByTier(tier: PlanTier): PlanPrice {
  return PLAN_PRICING[tier]
}

export function isUpgrade(from: PlanTier, to: PlanTier): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from)
}
