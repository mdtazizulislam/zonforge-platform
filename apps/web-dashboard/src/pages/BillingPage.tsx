import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Gauge,
  Info,
  Layers3,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { BillingConfirmationDialog } from '@/components/billing/BillingConfirmationDialog'
import { BillingInvoiceHistoryShell } from '@/components/billing/BillingInvoiceHistoryShell'
import { BillingStatusBadge } from '@/components/billing/BillingStatusBadge'
import { BillingUsageBar } from '@/components/billing/BillingUsageBar'
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton } from '@/components/shared/ui'
import {
  ApiError,
  api,
  type BillingPlanCatalogItem,
  type BillingSubscriptionResponse,
} from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

type NoticeTone = 'success' | 'error' | 'info'

type NoticeState = {
  tone: NoticeTone
  message: string
}

function formatDate(value: string | null) {
  if (!value) return 'Not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatMoney(cents: number) {
  if (cents <= 0) return 'Free'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatInterval(interval: 'monthly' | 'annual' | null) {
  if (interval === 'annual') return 'Annual'
  if (interval === 'monthly') return 'Monthly'
  return 'Not set'
}

function formatPlanCode(code: string) {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function getNoticeClasses(tone: NoticeTone) {
  if (tone === 'success') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
  if (tone === 'error') return 'border-red-500/20 bg-red-500/10 text-red-100'
  return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100'
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function roleCanManageBilling(role: string | null | undefined) {
  return role === 'owner' || role === 'admin'
}

function currentStatusMessage(subscription: BillingSubscriptionResponse['subscription']) {
  const status = String(subscription.status ?? '').toLowerCase()

  if (status === 'checkout_created') {
    return 'Stripe checkout has been created. Your paid plan activates only after Stripe payment completes and the backend confirms the webhook.'
  }

  if (status === 'past_due') {
    return 'Payment is past due. Keep the billing method current to avoid interruption.'
  }

  if (status === 'trialing' || status === 'trial') {
    return 'This workspace is currently trialing. Renewal details will continue to update from Stripe-backed billing state.'
  }

  if (status === 'canceled' || status === 'cancelled') {
    return 'This subscription is canceled. Upgrade to restart paid billing through the backend checkout flow.'
  }

  return 'Billing status on this page is synchronized from backend-confirmed Stripe state, never from client-side assumptions.'
}

function BillingOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <Skeleton className="mb-3 h-6 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </Card>
      <Card className="p-6">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr_0.9fr]">
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="mb-3 h-4 w-28" />
            <Skeleton className="mb-3 h-3 w-full" />
            <Skeleton className="h-2 w-full" />
          </Card>
        ))}
      </div>
    </div>
  )
}

function PlanComparisonCard({
  plan,
  interval,
  isCurrent,
  canChange,
  isBusy,
  onChoose,
}: {
  plan: BillingPlanCatalogItem
  interval: 'monthly' | 'annual'
  isCurrent: boolean
  canChange: boolean
  isBusy: boolean
  onChoose: (planCode: string) => void
}) {
  const price = interval === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents

  return (
    <div className={clsx(
      'flex h-full flex-col rounded-3xl border p-6 transition-all',
      isCurrent
        ? 'border-emerald-500/40 bg-emerald-500/5 shadow-lg shadow-emerald-500/10'
        : plan.highlighted
          ? 'border-cyan-500/40 bg-cyan-500/5 shadow-lg shadow-cyan-500/10'
          : 'border-gray-800 bg-gray-900/90',
    )}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{plan.displayName}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">{formatPlanCode(plan.code)}</p>
        </div>
        {isCurrent ? (
          <Badge variant="success" size="sm">Current Plan</Badge>
        ) : plan.highlighted ? (
          <Badge variant="warning" size="sm">Recommended</Badge>
        ) : null}
      </div>

      <div className="mb-5 rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{interval === 'annual' ? 'Annual checkout' : 'Monthly checkout'}</p>
        <p className="mt-2 text-3xl font-semibold text-gray-100">{formatMoney(price)}</p>
        <p className="mt-1 text-sm text-gray-400">Backend catalog pricing for the selected billing interval.</p>
      </div>

      <div className="mb-5 grid gap-3 text-sm text-gray-300 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Identities</p>
          <p className="mt-1 font-medium text-gray-100">{plan.limits.identities === 'unlimited' ? 'Unlimited' : plan.limits.identities.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Connectors</p>
          <p className="mt-1 font-medium text-gray-100">{plan.limits.connectors === 'unlimited' ? 'Unlimited' : plan.limits.connectors.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Events per minute</p>
          <p className="mt-1 font-medium text-gray-100">{plan.limits.eventsPerMin === 'unlimited' ? 'Unlimited' : plan.limits.eventsPerMin.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Retention</p>
          <p className="mt-1 font-medium text-gray-100">{plan.limits.retentionDays.toLocaleString()} days</p>
        </div>
      </div>

      <ul className="mb-6 flex-1 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={isCurrent ? 'outline' : 'primary'}
        size="md"
        disabled={isCurrent || !canChange}
        loading={isBusy}
        iconRight={ArrowRight}
        onClick={() => onChoose(plan.code)}
      >
        {isCurrent ? 'Already active' : canChange ? `Choose ${plan.displayName}` : 'Owner/Admin required'}
      </Button>
    </div>
  )
}

export default function BillingPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'annual' | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  const membershipRole = user?.membership?.role ?? user?.role ?? null
  const userCanManageBilling = roleCanManageBilling(membershipRole)

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: api.billing.subscription,
    staleTime: 15_000,
  })

  const usageQuery = useQuery({
    queryKey: ['billing', 'usage'],
    queryFn: api.billing.usage,
    staleTime: 30_000,
  })

  const plansQuery = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: api.billing.plans,
    staleTime: 60 * 60_000,
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    if (!payment) return

    if (payment === 'success') {
      setNotice({ tone: 'success', message: 'Stripe checkout returned successfully. The dashboard will refresh from backend-confirmed billing state.' })
      queryClient.invalidateQueries({ queryKey: ['billing'] })
    } else if (payment === 'cancelled') {
      setNotice({ tone: 'error', message: 'Stripe checkout was cancelled before backend confirmation.' })
    }

    params.delete('payment')
    params.delete('session_id')
    const nextQuery = params.toString()
    window.history.replaceState({}, document.title, nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname)
  }, [queryClient])

  const checkoutMutation = useMutation({
    mutationFn: ({ planCode, nextInterval }: { planCode: string; nextInterval: 'monthly' | 'annual' }) => api.billing.checkout(planCode, nextInterval),
    onSuccess: (result) => {
      if (!result.url) {
        setNotice({ tone: 'error', message: 'Stripe checkout URL was not returned by the backend.' })
        return
      }

      window.location.assign(result.url)
    },
    onError: (error: unknown) => {
      setNotice({ tone: 'error', message: getErrorMessage(error, 'Unable to start the checkout flow.') })
    },
  })

  const portalMutation = useMutation({
    mutationFn: () => api.billing.portal(),
    onSuccess: (result) => {
      window.location.assign(result.url)
    },
    onError: (error: unknown) => {
      setNotice({ tone: 'error', message: getErrorMessage(error, 'Unable to open the billing portal.') })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.billing.cancel(),
    onSuccess: () => {
      setCancelDialogOpen(false)
      setNotice({ tone: 'success', message: 'Cancellation has been scheduled. The current paid plan remains active until Stripe confirms the end of the billing period.' })
      queryClient.invalidateQueries({ queryKey: ['billing'] })
    },
    onError: (error: unknown) => {
      setNotice({ tone: 'error', message: getErrorMessage(error, 'Unable to schedule cancellation.') })
    },
  })

  const subscription = subscriptionQuery.data?.subscription
  const usage = usageQuery.data
  const billingInterval = selectedInterval ?? subscription?.billingInterval ?? 'monthly'
  const allPlans = plansQuery.data?.plans ?? []
  const comparisonPlans = allPlans.filter((plan) => ['starter', 'growth', 'business'].includes(plan.code))
  const currentPlan = subscription ? allPlans.find((plan) => plan.code === subscription.planCode) ?? null : null
  const canOpenPortal = Boolean(userCanManageBilling && subscription?.stripeCustomerId)
  const canCancel = Boolean(
    userCanManageBilling
    && subscription
    && !subscription.cancelAtPeriodEnd
    && subscription.planCode !== 'free'
    && ['active', 'trialing', 'trial', 'past_due', 'incomplete'].includes(String(subscription.status).toLowerCase()),
  )
  const checkoutEnabled = Boolean(userCanManageBilling && subscriptionQuery.data?.eligible_for_checkout)
  const busyPlanCode = checkoutMutation.isPending ? checkoutMutation.variables?.planCode ?? null : null
  const queryError = subscriptionQuery.error ?? usageQuery.error ?? plansQuery.error
  const billingRecommendation = usage
    ? usage.usagePct.connectors >= 80 || usage.usagePct.identities >= 80
      ? 'You are approaching plan limits. Review the next tier before connectors or identity coverage become constrained.'
      : usage.status === 'active'
        ? 'Your current plan still has room. Review higher tiers when you need broader connector coverage, more identities, or longer retention.'
        : 'Complete billing setup first, then compare plans if you need broader coverage.'
    : 'Compare plans using the live backend catalog and upgrade only when your current limits no longer fit the workspace.'

  function scrollToPlans() {
    document.getElementById('billing-plan-comparison')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function startCheckout(planCode: string) {
    checkoutMutation.mutate({ planCode, nextInterval: billingInterval })
  }

  return (
    <AppShell title="Billing & Subscription">
      <PageContent className="space-y-6">
        {notice && (
          <div className={clsx('rounded-2xl border px-5 py-4 text-sm', getNoticeClasses(notice.tone))}>
            {notice.message}
          </div>
        )}

        {queryError && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            Billing data could not be loaded cleanly. {getErrorMessage(queryError, 'Please retry in a moment.')}
          </div>
        )}

        <Card className="overflow-hidden border-gray-800 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.18),_transparent_40%),linear-gradient(135deg,_rgba(15,23,42,1),_rgba(2,6,23,1))] p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Stripe-synchronized billing
                </div>
                {subscription && <BillingStatusBadge status={subscription.status} size="sm" />}
                {subscription?.cancelAtPeriodEnd && <Badge variant="warning" size="sm">Cancels At Period End</Badge>}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white lg:text-4xl">Billing & Subscription</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 lg:text-base">
                Review the current Stripe-backed subscription, compare plans, and manage billing actions from one tenant-scoped dashboard. Billing state always reflects backend-confirmed responses.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current plan</p>
                <p className="mt-2 text-xl font-semibold text-white">{subscription?.planName ?? 'Loading...'}</p>
                <p className="mt-1 text-sm text-slate-300">{subscription ? formatInterval(subscription.billingInterval) : 'Awaiting backend response'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Renewal / period end</p>
                <p className="mt-2 text-xl font-semibold text-white">{subscription ? formatDate(subscription.currentPeriodEnd) : 'Loading...'}</p>
                <p className="mt-1 text-sm text-slate-300">Current billing window from backend state</p>
              </div>
            </div>
          </div>
        </Card>

        {subscriptionQuery.isLoading && !subscription ? (
          <BillingOverviewSkeleton />
        ) : !subscription ? (
          <EmptyState
            icon={XCircle}
            title="Subscription state unavailable"
            description="No tenant billing state was returned by the backend. Retry after authentication and tenant initialization are confirmed."
          />
        ) : (
          <>
            <Card className="border-gray-800 bg-gray-900/95 p-6 lg:p-7">
              <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr_0.9fr]">
                <div>
                  <CardHeader
                    title="Current plan"
                    description={currentStatusMessage(subscription)}
                    icon={CreditCard}
                    actions={<BillingStatusBadge status={subscription.status} size="sm" />}
                  />

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Plan</p>
                      <p className="mt-2 text-lg font-semibold text-gray-100">{subscription.planName}</p>
                      <p className="mt-1 text-sm text-gray-400">{formatPlanCode(subscription.planCode)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Billing interval</p>
                      <p className="mt-2 text-lg font-semibold text-gray-100">{formatInterval(subscription.billingInterval)}</p>
                      <p className="mt-1 text-sm text-gray-400">Backend-confirmed interval</p>
                    </div>
                    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Renewal / end</p>
                      <p className="mt-2 text-lg font-semibold text-gray-100">{formatDate(subscription.currentPeriodEnd)}</p>
                      <p className="mt-1 text-sm text-gray-400">{subscription.cancelAtPeriodEnd ? 'Cancellation scheduled' : 'Renews automatically unless canceled'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Current period start</p>
                      <p className="mt-2 text-lg font-semibold text-gray-100">{formatDate(subscription.currentPeriodStart)}</p>
                      <p className="mt-1 text-sm text-gray-400">Stripe-backed billing period anchor</p>
                    </div>
                    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Checkout eligibility</p>
                      <p className="mt-2 text-lg font-semibold text-gray-100">{subscriptionQuery.data?.eligible_for_checkout ? 'Eligible' : 'Restricted'}</p>
                      <p className="mt-1 text-sm text-gray-400">Paid plan changes always begin in backend checkout.</p>
                    </div>
                    <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Admin actions</p>
                      <p className="mt-2 text-lg font-semibold text-gray-100">{userCanManageBilling ? 'Enabled' : 'Read only'}</p>
                      <p className="mt-1 text-sm text-gray-400">Owners and admins can initiate billing actions.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <CardHeader
                    title="Included capabilities"
                    description="Feature summary for the active plan from the backend billing catalog."
                    icon={Sparkles}
                  />
                  <div className="space-y-2">
                    {(currentPlan?.features ?? ['Current plan feature catalog is still loading.']).map((feature) => (
                      <div key={feature} className="flex items-start gap-3 rounded-2xl border border-gray-800 bg-gray-950/70 px-4 py-3 text-sm text-gray-300">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <CardHeader
                    title="Actions"
                    description="Every billing action is routed back through the backend."
                    icon={Layers3}
                  />
                  <div className="space-y-3">
                    <Button variant="primary" size="md" icon={ArrowRight} onClick={scrollToPlans} disabled={!checkoutEnabled}>
                      Upgrade / Change Plan
                    </Button>
                    <Button variant="outline" size="md" icon={ExternalLink} onClick={() => portalMutation.mutate()} disabled={!canOpenPortal} loading={portalMutation.isPending}>
                      Open Billing Portal
                    </Button>
                    <Button variant="danger" size="md" icon={AlertTriangle} onClick={() => setCancelDialogOpen(true)} disabled={!canCancel}>
                      Cancel Subscription
                    </Button>

                    {subscription.cancelAtPeriodEnd ? (
                      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                        Cancellation is already scheduled. Resume is not exposed yet because the backend has no resume endpoint.
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 text-sm text-gray-400">
                        Cancellation requires explicit confirmation and remains subject to backend-confirmed Stripe state.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-gray-800 bg-gray-900/95 p-6 lg:p-7">
              <CardHeader
                title="Usage & limits"
                description="Current usage versus enforced plan limits from the billing backend."
                icon={Gauge}
                actions={usage ? <Badge variant="neutral" size="sm">{formatPlanCode(usage.planTier)}</Badge> : undefined}
              />

              {usageQuery.isLoading && !usage ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
                      <Skeleton className="mb-3 h-4 w-28" />
                      <Skeleton className="mb-3 h-3 w-full" />
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              ) : usage ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <BillingUsageBar
                    label="Connectors"
                    current={usage.usage.connectors}
                    limit={usage.limits.max_connectors}
                    helper="Configured data sources using live tenant allowance."
                  />
                  <BillingUsageBar
                    label="Identities"
                    current={usage.usage.identities}
                    limit={usage.limits.max_identities}
                    helper="Monitored identities currently covered by this workspace."
                  />
                  <BillingUsageBar
                    label="Events per minute"
                    current={usage.usage.eventsPerMinute}
                    limit={usage.limits.events_per_minute}
                    helper="Current throughput against the plan throughput ceiling."
                  />
                  <BillingUsageBar
                    label="Retention days"
                    current={usage.retentionDays}
                    limit={usage.retentionDays}
                    unit=" days"
                    helper="Policy cap currently enforced for retained data."
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-5 text-sm text-gray-400">
                  Billing usage data is not available yet. This section is integration-ready and will remain empty until the tenant usage response is returned.
                </div>
              )}
            </Card>

            <Card id="billing-plan-comparison" className="border-gray-800 bg-gray-900/95 p-6 lg:p-7">
              <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <CardHeader
                  title="Plan comparison"
                  description="Compare Starter, Growth, and Business using the live backend catalog."
                  icon={CalendarClock}
                />
                <div className="inline-flex rounded-2xl border border-gray-800 bg-gray-950/80 p-1">
                  {(['monthly', 'annual'] as const).map((interval) => (
                    <button
                      key={interval}
                      type="button"
                      onClick={() => setSelectedInterval(interval)}
                      className={clsx(
                        'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                        billingInterval === interval ? 'bg-cyan-500 text-slate-950' : 'text-gray-400 hover:text-gray-100',
                      )}
                    >
                      {interval === 'monthly' ? 'Monthly' : 'Annual'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-4 text-sm text-cyan-100">
                {billingRecommendation}
              </div>

              {plansQuery.isLoading && comparisonPlans.length === 0 ? (
                <div className="grid gap-4 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-3xl border border-gray-800 bg-gray-950/70 p-6">
                      <Skeleton className="mb-3 h-6 w-28" />
                      <Skeleton className="mb-4 h-4 w-20" />
                      <Skeleton className="mb-5 h-12 w-28" />
                      <div className="space-y-3">
                        {Array.from({ length: 4 }).map((__, inner) => <Skeleton key={inner} className="h-4 w-full" />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : comparisonPlans.length === 0 ? (
                <EmptyState
                  icon={Info}
                  title="Billing plan catalog unavailable"
                  description="The backend catalog did not return Starter, Growth, and Business comparison data yet."
                />
              ) : (
                <div className="grid gap-4 xl:grid-cols-3">
                  {comparisonPlans.map((plan) => (
                    <PlanComparisonCard
                      key={plan.code}
                      plan={plan}
                      interval={billingInterval}
                      isCurrent={plan.code === subscription.planCode}
                      canChange={checkoutEnabled}
                      isBusy={busyPlanCode === plan.code}
                      onChoose={startCheckout}
                    />
                  ))}
                </div>
              )}
            </Card>

            <BillingInvoiceHistoryShell />

            <Card className="border-gray-800 bg-gradient-to-r from-gray-900 via-gray-950 to-gray-900 p-6 lg:p-7">
              <CardHeader
                title="Billing policy & safety notice"
                description="Professional guidance for customer admins managing a Stripe-backed subscription."
                icon={Info}
              />
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 text-sm text-gray-300">
                  <p className="font-medium text-gray-100">Backend-confirmed state only</p>
                  <p className="mt-2 text-gray-400">This page never assumes a plan change completed until the backend reflects the Stripe-confirmed result.</p>
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 text-sm text-gray-300">
                  <p className="font-medium text-gray-100">Cancellation policy</p>
                  <p className="mt-2 text-gray-400">Cancellation schedules the end of paid service at the current billing period boundary unless backend state says otherwise.</p>
                </div>
                <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4 text-sm text-gray-300">
                  <p className="font-medium text-gray-100">Secure action routing</p>
                  <p className="mt-2 text-gray-400">Checkout, portal access, and cancellation buttons only call authenticated tenant-scoped backend routes.</p>
                </div>
              </div>
            </Card>
          </>
        )}

        <BillingConfirmationDialog
          open={cancelDialogOpen}
          title="Schedule subscription cancellation"
          description="This schedules the Stripe-backed subscription to end at the period boundary. The backend remains the source of truth for the final cancellation state."
          confirmLabel="Schedule Cancellation"
          pending={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
          onClose={() => setCancelDialogOpen(false)}
        />
      </PageContent>
    </AppShell>
  )
}