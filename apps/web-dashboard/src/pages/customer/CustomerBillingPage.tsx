import { useQuery } from '@tanstack/react-query'
import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useUsage } from '@/hooks/queries'
import { api } from '@/lib/api'

export default function CustomerBillingPage() {
  const usageQuery = useUsage()
  const subscriptionQuery = useQuery({
    queryKey: ['customer', 'subscription'],
    queryFn: () => api.billing.subscription(),
    staleTime: 300_000,
  })

  const usage = usageQuery.data?.data
  const subscription = subscriptionQuery.data
  const usageEntries = Object.entries(usage?.usage ?? {})

  return (
    <CustomerLayout
      title="Customer Billing"
      subtitle="A concise subscription and usage snapshot for commercial review."
    >
      <div className="zf-dashboard-grid">
        <section className="zf-panel-card zf-full-span zf-customer-shell-hero">
          <div>
            <p className="zf-panel-heading__eyebrow">Commercial status</p>
            <h2 className="zf-panel-heading__title">Plan and usage snapshot</h2>
            <p className="zf-panel-heading__meta">Billing details remain simple here while the analyst and finance workflows stay untouched.</p>
          </div>
          <div className="zf-customer-shell-stat-grid">
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Plan tier</span>
              <strong className="zf-customer-shell-stat__value">{subscription?.planTier ?? usage?.planTier ?? 'Unknown'}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Subscription</span>
              <strong className="zf-customer-shell-stat__value">{subscription?.status ?? 'Unknown'}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Retention</span>
              <strong className="zf-customer-shell-stat__value">{usage?.retentionDays ?? 0}d</strong>
            </article>
          </div>
        </section>

        <section className="zf-panel-card zf-span-8">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Usage detail</p>
              <h2 className="zf-panel-heading__title">Current plan allowances</h2>
            </div>
          </div>
          {(usageQuery.isLoading || subscriptionQuery.isLoading) ? (
            <div className="zf-panel-empty">Loading subscription details.</div>
          ) : usageEntries.length === 0 ? (
            <div className="zf-panel-empty">No customer billing usage data is available.</div>
          ) : (
            <div className="zf-customer-shell-list">
              {usageEntries.map(([feature, value]) => (
                <article key={feature} className="zf-customer-shell-list__item">
                  <div className="zf-customer-shell-list__row">
                    <div>
                      <h3>{feature.replace(/[_-]/g, ' ')}</h3>
                      <p>{value.limit == null ? 'Unlimited allowance' : `${value.current} of ${value.limit} in use`}</p>
                    </div>
                    <span className="zf-badge">{value.current}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="zf-panel-card zf-span-4">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Account review</p>
              <h2 className="zf-panel-heading__title">Key dates</h2>
            </div>
          </div>
          <div className="zf-customer-shell-detail-grid">
            <div className="zf-customer-shell-detail">
              <span>Current period start</span>
              <strong>{subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart).toLocaleDateString() : 'Unknown'}</strong>
            </div>
            <div className="zf-customer-shell-detail">
              <span>Current period end</span>
              <strong>{subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'Unknown'}</strong>
            </div>
            <div className="zf-customer-shell-detail">
              <span>Trial ends</span>
              <strong>{subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString() : 'Not in trial'}</strong>
            </div>
          </div>
        </section>
      </div>
    </CustomerLayout>
  )
}