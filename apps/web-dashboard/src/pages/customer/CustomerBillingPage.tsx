import { useQuery } from '@tanstack/react-query'
import { CustomerLayout } from '@/layouts/CustomerLayout'
import { useUsage } from '@/hooks/queries'
import { api } from '@/lib/api'

export default function CustomerBillingPage() {
  const usageQuery = useUsage()
  const subscriptionQuery = useQuery({
    queryKey: ['customer', 'subscription'],
    queryFn: () => api.plans.me(),
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
          <section className="zf-section">
            <div className="zf-section-head">
              <h1 className="zf-page-title">Billing</h1>
              <p className="zf-page-subtitle">A polished commercial snapshot for customer review, consistent with the premium dashboard shell.</p>
            </div>

            <div className="zf-grid zf-grid-2">
              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Plan and usage snapshot</h2>
                  <p className="zf-card-subtitle">Billing details remain simple here while analyst and finance workflows stay untouched.</p>
                </div>
                <div className="zf-detail-list">
                  <div className="zf-detail-row">
                    <span className="zf-label">Plan Tier</span>
                    <span className="zf-value">{subscription?.plan.name ?? usage?.planTier ?? 'Unknown'}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Subscription</span>
                    <span className="zf-value">{subscription?.status ?? 'Unknown'}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Retention</span>
                    <span className="zf-value">{usage?.retentionDays ?? 0}d</span>
                  </div>
                </div>
              </section>

              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Current plan allowances</h2>
                  <p className="zf-card-subtitle">Usage entries stay readable without the previous overlapping shell wrappers.</p>
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

              <section className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Key dates</h2>
                  <p className="zf-card-subtitle">Commercial checkpoints for the current billing cycle.</p>
                </div>
                <div className="zf-customer-shell-detail-grid">
                  <div className="zf-customer-shell-detail">
                    <span>Current period start</span>
                    <strong>{subscription?.startedAt ? new Date(subscription.startedAt).toLocaleDateString() : 'Unknown'}</strong>
                  </div>
                  <div className="zf-customer-shell-detail">
                    <span>Current period end</span>
                    <strong>{subscription?.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString() : 'Unknown'}</strong>
                  </div>
                  <div className="zf-customer-shell-detail">
                    <span>Trial ends</span>
                    <strong>{subscription?.status === 'trial' && subscription?.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString() : 'Not in trial'}</strong>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
    </CustomerLayout>
  )
}