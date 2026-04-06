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
      <div className="zf-page">
        <div className="zf-container">
          <div className="zf-grid">
            <section className="zf-card zf-card--wide">
              <h2 className="zf-title">Plan and usage snapshot</h2>
              <p className="zf-sub">Billing details remain simple here while analyst and finance workflows stay untouched.</p>
              <div className="zf-settings-stack">
                <div className="zf-row">
                  <div>
                    <div className="zf-label">Plan Tier</div>
                    <div className="zf-value">{subscription?.planTier ?? usage?.planTier ?? 'Unknown'}</div>
                  </div>
                  <div>
                    <div className="zf-label">Subscription</div>
                    <div className="zf-value">{subscription?.status ?? 'Unknown'}</div>
                  </div>
                  <div>
                    <div className="zf-label">Retention</div>
                    <div className="zf-value">{usage?.retentionDays ?? 0}d</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="zf-card zf-card--wide">
              <h2 className="zf-title">Current plan allowances</h2>
              <p className="zf-sub">Usage entries stay readable without the previous overlapping shell wrappers.</p>
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

            <section className="zf-card">
              <h2 className="zf-title">Key dates</h2>
              <p className="zf-sub">Commercial checkpoints for the current billing cycle.</p>
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
        </div>
      </div>
    </CustomerLayout>
  )
}