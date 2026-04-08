import { useState } from 'react'
import { clsx } from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card } from '@/components/shared/ui'
import { ApiError, api, type CurrentPlanResponse, type PlanDefinition } from '@/lib/api'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Shield,
  Star,
  TrendingUp,
  Users,
  Wifi,
  Zap,
  Database,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'

type NoticeState = {
  tone: 'success' | 'error'
  message: string
}

function widthBucketClass(pct: number) {
  if (pct >= 100) return 'w-full'
  if (pct >= 90) return 'w-11/12'
  if (pct >= 80) return 'w-10/12'
  if (pct >= 75) return 'w-9/12'
  if (pct >= 66) return 'w-8/12'
  if (pct >= 58) return 'w-7/12'
  if (pct >= 50) return 'w-6/12'
  if (pct >= 42) return 'w-5/12'
  if (pct >= 33) return 'w-4/12'
  if (pct >= 25) return 'w-3/12'
  if (pct >= 16) return 'w-2/12'
  if (pct > 0) return 'w-1/12'
  return 'w-0'
}

function featureLines(plan: PlanDefinition) {
  const features = plan.features
  return [
    `Detections: ${features.detections}`,
    `Alerts: ${String(features.alerts)}`,
    `Risk: ${String(features.risk)}`,
    `Investigations: ${String(features.investigation)}`,
    `AI: ${features.ai ? 'enabled' : 'not included'}`,
    plan.code === 'enterprise' ? 'SSO, compliance, SLA, and dedicated support' : null,
  ].filter(Boolean) as string[]
}

function UsageMeter({
  label,
  current,
  limit,
  unit = '',
  warningAt = 80,
}: {
  label: string
  current: number
  limit: number | string | null
  unit?: string
  warningAt?: number
}) {
  const isUnlimited = limit == null || limit === 'unlimited'
  const pct = isUnlimited ? 0 : Math.min(Math.round((current / Number(limit)) * 100), 100)
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= warningAt ? 'bg-yellow-500' : 'bg-blue-500'

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-sm font-medium text-gray-200">
          {current.toLocaleString()}{unit}
          {isUnlimited ? <span className="text-gray-600"> / ∞</span> : <span className="text-gray-600"> / {Number(limit).toLocaleString()}{unit}</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        {isUnlimited ? <div className="h-full w-full bg-green-500/40" /> : <div className={clsx('h-full rounded-full transition-all duration-700', barColor, widthBucketClass(pct))} />}
      </div>
      {pct >= warningAt && !isUnlimited && (
        <p className={clsx('mt-1 text-xs', pct >= 100 ? 'text-red-400' : 'text-yellow-400')}>
          {pct >= 100 ? 'Limit reached — upgrade to continue' : `${pct}% of limit used`}
        </p>
      )}
    </div>
  )
}

function PlanCard({
  plan,
  currentPlanCode,
  billingCycle,
  canManageBilling,
  activePlanCode,
  onSelect,
}: {
  plan: PlanDefinition
  currentPlanCode: string
  billingCycle: 'monthly' | 'annual'
  canManageBilling: boolean
  activePlanCode: string | null
  onSelect: (planCode: string) => void
}) {
  const isCurrent = plan.code === currentPlanCode
  const isFree = plan.priceMonthly === 0
  const isEnterprise = plan.code === 'enterprise'
  const isLoading = activePlanCode === plan.code
  const displayPrice = plan.priceMonthly == null ? 'Custom' : plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly}/mo`
  const highlighted = plan.code === 'growth'

  return (
    <div className={clsx(
      'relative flex flex-col rounded-2xl border p-6 transition-all',
      highlighted ? 'border-blue-500 bg-blue-500/5 shadow-lg shadow-blue-500/10' : isCurrent ? 'border-green-500/40 bg-green-500/5' : 'border-gray-800 bg-gray-900 hover:border-gray-700',
    )}>
      <div className="mb-4 flex items-center gap-2">
        {highlighted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 text-xs font-bold text-white">
            <Star className="h-3 w-3" />
            Most Popular
          </span>
        )}
        {isCurrent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-bold text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Current Plan
          </span>
        )}
      </div>

      <h3 className="mb-1 text-lg font-bold text-gray-100">{plan.name}</h3>
      <p className="mb-4 text-xs text-gray-500">{plan.code === 'free' ? 'For initial onboarding and basic monitoring.' : `Live ${billingCycle} view bound to tenant plan controls.`}</p>

      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className="text-3xl font-bold text-gray-100">{displayPrice}</span>
          {!isFree && !isEnterprise && <span className="mb-1 text-xs text-gray-500">monthly</span>}
        </div>
      </div>

      <div className="mb-6 space-y-2 border-b border-gray-800 pb-4">
        {[
          { label: 'Identities', value: plan.limits.max_identities, icon: Users },
          { label: 'Connectors', value: plan.limits.max_connectors, icon: Wifi },
          { label: 'Events/min', value: plan.limits.events_per_minute, icon: Zap },
          { label: 'Retention', value: plan.limits.retention_days == null ? 'Unlimited' : `${plan.limits.retention_days}d`, icon: Database },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
            <span className="text-gray-500">{label}:</span>
            <span className={clsx('ml-auto font-medium', value == null ? 'text-green-400' : 'text-gray-300')}>
              {value == null ? 'Unlimited' : typeof value === 'number' ? value.toLocaleString() : value}
            </span>
          </div>
        ))}
      </div>

      <ul className="mb-6 flex-1 space-y-1.5">
        {featureLines(plan).map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-xs">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500/60" />
            <span className="text-gray-400">{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="rounded-xl border border-green-500/20 py-2.5 text-center text-sm font-medium text-green-400">✓ Active Plan</div>
      ) : isEnterprise ? (
        <a href="mailto:sales@zonforge.com" className="flex items-center justify-center gap-2 rounded-xl border border-gray-700 py-2.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white">
          Contact Sales <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <button
          onClick={() => onSelect(plan.code)}
          disabled={!canManageBilling || isLoading}
          className={clsx(
            'w-full rounded-xl py-2.5 text-sm font-semibold transition-all',
            highlighted ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20' : 'border border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-400',
            (!canManageBilling || isLoading) && 'cursor-not-allowed opacity-60',
          )}
        >
          {isLoading ? 'Applying plan…' : !canManageBilling ? 'Owner/Admin required' : isFree ? 'Downgrade to Free' : `Upgrade to ${plan.name}`}
        </button>
      )}
    </div>
  )
}

export default function BillingPage() {
  const [billingCycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const queryClient = useQueryClient()

  const plansQuery = useQuery({
    queryKey: ['plans', 'catalog'],
    queryFn: async () => (await api.plans.list()).items,
    staleTime: 60 * 60_000,
  })

  const currentPlanQuery = useQuery({
    queryKey: ['plans', 'current'],
    queryFn: () => api.plans.me(),
    staleTime: 60_000,
  })

  const upgradeMutation = useMutation({
    mutationFn: (planCode: string) => api.plans.upgrade(planCode),
    onSuccess: (state) => {
      setNotice({ tone: 'success', message: `Plan updated to ${state.plan.name}.` })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['billing'] })
    },
    onError: (error: unknown) => {
      setNotice({ tone: 'error', message: error instanceof ApiError ? error.message : 'Unable to update the plan.' })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.plans.cancel(),
    onSuccess: () => {
      setNotice({ tone: 'success', message: 'Plan downgraded to Free.' })
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      queryClient.invalidateQueries({ queryKey: ['billing'] })
    },
    onError: (error: unknown) => {
      setNotice({ tone: 'error', message: error instanceof ApiError ? error.message : 'Unable to downgrade the plan.' })
    },
  })

  const plans = plansQuery.data ?? []
  const currentPlan = currentPlanQuery.data
  const planCode = currentPlan?.plan.code ?? 'free'

  function handleSelect(nextPlanCode: string) {
    if (nextPlanCode === 'free') {
      cancelMutation.mutate()
      return
    }

    upgradeMutation.mutate(nextPlanCode)
  }

  return (
    <AppShell title="Plan & Billing">
      <PageContent>
        {notice && (
          <div className={clsx('mb-6 rounded-2xl border px-5 py-4 text-sm', notice.tone === 'success' ? 'border-green-500/20 bg-green-500/10 text-green-200' : 'border-red-500/20 bg-red-500/10 text-red-200')}>
            {notice.message}
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-300">Current Plan</h3>
                  {currentPlan?.status === 'trial' && <Badge variant="warning" size="xs">Trial</Badge>}
                </div>
                <p className="text-2xl font-bold capitalize text-gray-100">
                  {currentPlanQuery.isLoading ? 'Loading…' : currentPlan?.plan.name ?? 'Unknown'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {currentPlan?.startedAt ? `Active since ${new Date(currentPlan.startedAt).toLocaleDateString()}` : 'Plan assignment pending.'}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-300 md:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Connectors</p>
                    <p className="mt-1 font-medium">{currentPlan?.usage.connectors ?? 0} / {currentPlan?.limits.max_connectors ?? '∞'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Identities</p>
                    <p className="mt-1 font-medium">{currentPlan?.usage.identities ?? 0} / {currentPlan?.limits.max_identities ?? '∞'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Risk</p>
                    <p className="mt-1 font-medium capitalize">{String(currentPlan?.features.risk ?? false)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Investigations</p>
                    <p className="mt-1 font-medium capitalize">{String(currentPlan?.features.investigation ?? false)}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" icon={CreditCard} disabled>
                  Backend-bound plan state
                </Button>
                {currentPlan?.canManageBilling && planCode !== 'free' && (
                  <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
                    Downgrade to Free
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="flex flex-col justify-center gap-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-semibold text-gray-300">Support</span>
            </div>
            <p className="text-lg font-bold text-gray-100">
              {planCode === 'enterprise' ? 'Dedicated Support' : planCode === 'business' ? 'Priority Support' : 'Standard Support'}
            </p>
            <p className="text-xs text-gray-600">
              {planCode === 'enterprise' ? 'Negotiated SLA, SSO, compliance, and dedicated support.' : planCode === 'business' ? 'Full platform support with AI workflows.' : 'Upgrade to unlock advanced risk, investigations, and AI.'}
            </p>
          </Card>
        </div>

        {currentPlan && (
          <Card className="mb-8">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">Current Usage</h3>
              <span className="text-xs text-gray-600">Live tenant plan enforcement</span>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <UsageMeter label="Data Connectors" current={currentPlan.usage.connectors} limit={currentPlan.limits.max_connectors} />
              <UsageMeter label="Monitored Identities" current={currentPlan.usage.identities} limit={currentPlan.limits.max_identities} />
              <UsageMeter label="Events per Minute" current={currentPlan.usage.eventsPerMinute} limit={currentPlan.limits.events_per_minute} />
              <UsageMeter label="Retention" current={currentPlan.limits.retention_days ?? 365} limit={currentPlan.limits.retention_days ?? 'unlimited'} unit=" days" />
            </div>

            {currentPlan.limits.max_connectors != null && currentPlan.usage.connectors >= currentPlan.limits.max_connectors && (
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-400" />
                <p className="text-xs text-yellow-300">Your connector allowance is fully used. Upgrade to add another connector.</p>
                <button onClick={() => document.getElementById('plans-section')?.scrollIntoView({ behavior: 'smooth' })} className="ml-auto flex flex-shrink-0 items-center gap-1 text-xs text-yellow-400 hover:underline">
                  View plans <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </Card>
        )}

        <div id="plans-section">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-100">Upgrade Your Plan</h3>
            <div className="flex items-center gap-1 rounded-xl border border-gray-700 bg-gray-800 p-1">
              {(['monthly', 'annual'] as const).map((cycle) => (
                <button
                  key={cycle}
                  onClick={() => setCycle(cycle)}
                  className={clsx('rounded-lg px-4 py-1.5 text-sm font-medium transition-all', billingCycle === cycle ? 'bg-gray-700 text-gray-200 shadow-sm' : 'text-gray-600 hover:text-gray-400')}
                >
                  {cycle === 'monthly' ? 'Monthly' : 'Annual'}
                  {cycle === 'annual' && <span className="ml-1.5 text-xs font-semibold text-green-400">view</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentPlanCode={planCode}
                billingCycle={billingCycle}
                canManageBilling={Boolean(currentPlan?.canManageBilling)}
                activePlanCode={upgradeMutation.isPending ? upgradeMutation.variables ?? null : cancelMutation.isPending ? 'free' : null}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-blue-500/15 bg-gradient-to-r from-blue-500/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-500/15 p-3">
              <TrendingUp className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h4 className="mb-1 text-base font-bold text-gray-100">Need a custom solution?</h4>
              <p className="mb-4 max-w-lg text-sm text-gray-400">For organizations with complex security requirements, compliance needs, or negotiated infrastructure, enterprise remains a custom plan with direct sales engagement.</p>
              <a href="mailto:sales@zonforge.com" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500">
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