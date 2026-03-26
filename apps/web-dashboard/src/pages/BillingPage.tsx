import { useState } from 'react'
import { clsx } from 'clsx'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton } from '@/components/shared/ui'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  CreditCard, Zap, CheckCircle2, ArrowRight, TrendingUp,
  Shield, Clock, Database, Users, Wifi, ChevronRight,
  AlertTriangle, Star, ExternalLink,
} from 'lucide-react'

// ─────────────────────────────────────────────
// TYPES (matching billing-service plans.ts)
// ─────────────────────────────────────────────

interface PlanInfo {
  tier:              string
  displayName:       string
  description:       string
  monthlyPriceCents: number
  annualPriceCents:  number
  trialDays:         number
  highlighted:       boolean
  limits: {
    identities:    number | string
    connectors:    number | string
    eventsPerMin:  number | string
    retentionDays: number
    customRules:   number | string
  }
  features: string[]
}

interface UsageData {
  connectorsActive:  number
  identitiesMonitor: number
  eventsThisMonth:   number
  planLimits: {
    maxConnectors:  number
    maxIdentities:  number
    retentionDays:  number
    maxCustomRules: number
  }
  planTier: string
  usagePct: {
    connectors:  number
    identities:  number
  }
}

// ─────────────────────────────────────────────
// USAGE METER BAR
// ─────────────────────────────────────────────

function UsageMeter({
  label, current, limit, unit = '', warningAt = 80,
}: {
  label: string; current: number; limit: number | string
  unit?: string; warningAt?: number
}) {
  const isUnlimited = limit === 'unlimited' || typeof limit !== 'number'
  const pct = isUnlimited ? 0 : Math.min(Math.round((current / (limit as number)) * 100), 100)

  const barColor = pct >= 100 ? 'bg-red-500'
    : pct >= warningAt ? 'bg-yellow-500'
    : 'bg-blue-500'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-sm font-medium text-gray-200">
          {current.toLocaleString()}{unit}
          {!isUnlimited && (
            <span className="text-gray-600"> / {(limit as number).toLocaleString()}{unit}</span>
          )}
          {isUnlimited && <span className="text-gray-600"> / ∞</span>}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        {isUnlimited ? (
          <div className="h-full bg-green-500/40 w-full" />
        ) : (
          <div
            className={clsx('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {pct >= warningAt && !isUnlimited && (
        <p className={clsx('text-xs mt-1', pct >= 100 ? 'text-red-400' : 'text-yellow-400')}>
          {pct >= 100 ? 'Limit reached — upgrade to continue' : `${pct}% of limit used`}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PLAN CARD
// ─────────────────────────────────────────────

function PlanCard({
  plan, currentTier, billingCycle, onSelect,
}: {
  plan:         PlanInfo
  currentTier:  string
  billingCycle: 'monthly' | 'annual'
  onSelect:     (tier: string) => void
}) {
  const isCurrent   = plan.tier === currentTier
  const isFree      = plan.monthlyPriceCents === 0
  const isEnterprise = plan.tier === 'enterprise' || plan.tier === 'mssp'

  const price = billingCycle === 'annual'
    ? plan.annualPriceCents
    : plan.monthlyPriceCents

  const displayPrice = price === 0 ? (isFree ? 'Free' : 'Contact sales')
    : `$${Math.floor(price / 100)}/mo`

  const annualSavings = plan.monthlyPriceCents > 0 && plan.annualPriceCents > 0
    ? Math.round(((plan.monthlyPriceCents - plan.annualPriceCents) / plan.monthlyPriceCents) * 100)
    : 0

  return (
    <div className={clsx(
      'relative flex flex-col rounded-2xl border p-6 transition-all',
      plan.highlighted
        ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10'
        : isCurrent
        ? 'border-green-500/40 bg-green-500/5'
        : 'border-gray-800 bg-gray-900 hover:border-gray-700',
    )}>
      {/* Badges */}
      <div className="flex items-center gap-2 mb-4">
        {plan.highlighted && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                           text-xs font-bold bg-blue-500 text-white">
            <Star className="h-3 w-3" />
            Most Popular
          </span>
        )}
        {isCurrent && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                           text-xs font-bold bg-green-500/20 text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Current Plan
          </span>
        )}
      </div>

      {/* Plan name + price */}
      <h3 className="text-lg font-bold text-gray-100 mb-1">{plan.displayName}</h3>
      <p className="text-xs text-gray-500 mb-4">{plan.description}</p>

      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className="text-3xl font-bold text-gray-100">{displayPrice}</span>
          {!isFree && !isEnterprise && billingCycle === 'annual' && (
            <span className="text-xs text-gray-500 mb-1">billed annually</span>
          )}
        </div>
        {annualSavings > 0 && billingCycle === 'annual' && (
          <p className="text-xs text-green-400 mt-1">
            Save {annualSavings}% vs monthly
          </p>
        )}
        {plan.trialDays > 0 && !isCurrent && !isFree && (
          <p className="text-xs text-blue-400 mt-1">
            {plan.trialDays}-day free trial
          </p>
        )}
      </div>

      {/* Limits */}
      <div className="space-y-2 mb-6 pb-4 border-b border-gray-800">
        {[
          { label: 'Identities',  value: plan.limits.identities,   icon: Users },
          { label: 'Connectors',  value: plan.limits.connectors,   icon: Wifi },
          { label: 'Events/min',  value: plan.limits.eventsPerMin, icon: Zap },
          { label: 'Retention',   value: `${plan.limits.retentionDays}d`, icon: Database },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <Icon className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
            <span className="text-gray-500">{label}:</span>
            <span className={clsx(
              'font-medium ml-auto',
              value === 'unlimited' ? 'text-green-400' : 'text-gray-300',
            )}>
              {value === 'unlimited' || value === 999999 ? 'Unlimited'
               : typeof value === 'number' ? value.toLocaleString()
               : value}
            </span>
          </div>
        ))}
      </div>

      {/* Features */}
      <ul className="space-y-1.5 flex-1 mb-6">
        {plan.features.slice(0, 6).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500/60 flex-shrink-0 mt-0.5" />
            <span className="text-gray-400">{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <div className="text-center py-2.5 rounded-xl border border-green-500/20 text-sm text-green-400 font-medium">
          ✓ Active Plan
        </div>
      ) : isEnterprise ? (
        <a
          href="mailto:sales@zonforge.com"
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl
                     border border-gray-700 text-sm text-gray-300 hover:text-white
                     hover:border-gray-600 transition-colors"
        >
          Contact Sales <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <button
          onClick={() => onSelect(plan.tier)}
          className={clsx(
            'w-full py-2.5 rounded-xl text-sm font-semibold transition-all',
            plan.highlighted
              ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
              : 'border border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-400',
          )}
        >
          {isFree ? 'Start Free' : `Upgrade to ${plan.displayName}`}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// BILLING PAGE
// ─────────────────────────────────────────────

export default function BillingPage() {
  const [billingCycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const billingBase = import.meta.env.VITE_BILLING_API_URL ?? '/api'

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn:  () => api.getPlans ? api.getPlans() : fetch('/api/v1/billing/plans').then(r => r.json()),
    staleTime: 60 * 60_000,
  })

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['billing', 'usage'],
    queryFn:  () => api.billing?.usage ? api.billing.usage() : fetch('/api/v1/billing/usage', {
      headers: { Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` },
    }).then(r => r.json()),
    staleTime: 5 * 60_000,
  })

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn:  () => fetch('/api/v1/billing/subscription', {
      headers: { Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` },
    }).then(r => r.json()),
    staleTime: 5 * 60_000,
  })

  const plans: PlanInfo[] = plansData?.data ?? []
  const usage: UsageData  = usageData?.data
  const sub               = subData?.data

  const currentTier = usage?.planTier ?? 'starter'

  async function handleUpgrade(tier: string) {
    setCheckoutLoading(tier)
    try {
      const resp = await fetch(`${billingBase}/billing/checkout-session`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${localStorage.getItem('zf_access_token')}`,
        },
        body: JSON.stringify({ planCode: tier, billingCycle }),
      })
      const data = await resp.json()
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Checkout failed:', err)
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function handlePortal() {
    const resp = await fetch(`${billingBase}/billing/portal`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` },
    })
    const data = await resp.json()
    if (data?.url) window.location.href = data.url
  }

  return (
    <AppShell title="Plan & Billing">
      <PageContent>

        {/* ── Current plan + subscription info ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">

          {/* Current plan */}
          <Card className="lg:col-span-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-gray-300">Current Plan</h3>
                  {sub?.status === 'trialing' && (
                    <Badge variant="warning" size="xs">Trial</Badge>
                  )}
                </div>
                <p className="text-2xl font-bold text-gray-100 capitalize">
                  {usageLoading ? <span className="opacity-0">—</span>
                   : currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                </p>
                {sub?.trialEndsAt && new Date(sub.trialEndsAt) > new Date() && (
                  <p className="text-sm text-yellow-400 mt-1 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Trial ends {new Date(sub.trialEndsAt).toLocaleDateString()}
                  </p>
                )}
                {sub?.currentPeriodEnd && sub.status !== 'trialing' && (
                  <p className="text-xs text-gray-600 mt-1">
                    {sub.cancelAtPeriodEnd ? 'Cancels' : 'Renews'}{' '}
                    {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={CreditCard}
                onClick={handlePortal}
              >
                Manage Billing
              </Button>
            </div>
          </Card>

          {/* SLA / support tier */}
          <Card className="flex flex-col justify-center gap-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-gray-300">Support</span>
            </div>
            <p className="text-lg font-bold text-gray-100">
              {currentTier === 'enterprise' || currentTier === 'mssp'
                ? 'Dedicated CSM'
                : currentTier === 'business'
                ? 'Priority Support'
                : 'Community'}
            </p>
            <p className="text-xs text-gray-600">
              {currentTier === 'enterprise' || currentTier === 'mssp'
                ? 'Custom SLA + 24/7 escalation'
                : currentTier === 'business'
                ? '4-hour response SLA'
                : 'Documentation + forums'}
            </p>
          </Card>
        </div>

        {/* ── Usage meters ─────────────────────── */}
        {usage && (
          <Card className="mb-8">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-gray-200">Current Usage</h3>
              <span className="text-xs text-gray-600">Resets monthly</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <UsageMeter
                label="Data Connectors"
                current={usage.connectorsActive}
                limit={usage.planLimits.maxConnectors}
              />
              <UsageMeter
                label="Monitored Identities"
                current={usage.identitiesMonitor}
                limit={usage.planLimits.maxIdentities}
              />
              <UsageMeter
                label="Event Retention"
                current={usage.planLimits.retentionDays}
                limit={365}
                unit=" days"
              />
              <UsageMeter
                label="Custom Detection Rules"
                current={0}
                limit={usage.planLimits.maxCustomRules}
              />
            </div>

            {/* Limit warnings */}
            {(usage.usagePct.connectors >= 80 || usage.usagePct.identities >= 80) && (
              <div className="mt-5 flex items-start gap-3 p-3 rounded-xl bg-yellow-500/8
                              border border-yellow-500/20">
                <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300">
                  You're approaching your plan limits. Upgrade to avoid service interruptions.
                </p>
                <button
                  onClick={() => document.getElementById('plans-section')?.scrollIntoView({ behavior: 'smooth' })}
                  className="ml-auto text-xs text-yellow-400 hover:underline flex-shrink-0 flex items-center gap-1"
                >
                  View plans <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </Card>
        )}

        {/* ── Plan comparison ───────────────────── */}
        <div id="plans-section">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-gray-100">Upgrade Your Plan</h3>

            {/* Billing cycle toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-800 border border-gray-700">
              {(['monthly', 'annual'] as const).map(cycle => (
                <button
                  key={cycle}
                  onClick={() => setCycle(cycle)}
                  className={clsx(
                    'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                    billingCycle === cycle
                      ? 'bg-gray-700 text-gray-200 shadow-sm'
                      : 'text-gray-600 hover:text-gray-400',
                  )}
                >
                  {cycle === 'monthly' ? 'Monthly' : 'Annual'}
                  {cycle === 'annual' && (
                    <span className="ml-1.5 text-xs text-green-400 font-semibold">-20%</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-96 rounded-2xl bg-gray-900 animate-pulse border border-gray-800" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {plans.map(plan => (
                <PlanCard
                  key={plan.tier}
                  plan={plan}
                  currentTier={currentTier}
                  billingCycle={billingCycle}
                  onSelect={handleUpgrade}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Enterprise footer ─────────────────── */}
        <div className="mt-8 rounded-2xl border border-blue-500/15 bg-gradient-to-r
                        from-blue-500/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-500/15 p-3">
              <TrendingUp className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-100 mb-1">
                Need a custom solution?
              </h4>
              <p className="text-sm text-gray-400 mb-4 max-w-lg">
                For organizations with complex security requirements, compliance needs,
                or MSSP capabilities, we offer tailored pricing and dedicated infrastructure.
              </p>
              <a
                href="mailto:sales@zonforge.com"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                           bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500
                           transition-colors shadow-lg shadow-blue-500/20"
              >
                Talk to Sales
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

      </PageContent>
    </AppShell>
  )
}
