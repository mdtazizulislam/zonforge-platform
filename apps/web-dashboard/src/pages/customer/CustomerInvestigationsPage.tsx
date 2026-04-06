import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useInvestigations, useInvestigationStats } from '@/hooks/queries'

function statusClass(status: string | undefined): string {
  const normalized = (status ?? 'queued').toLowerCase()
  if (normalized === 'completed') return 'zf-status-pill is-success'
  if (normalized === 'failed') return 'zf-status-pill is-danger'
  if (normalized === 'awaiting_approval') return 'zf-status-pill is-warning'
  return 'zf-status-pill'
}

function formatStatus(status: string | undefined): string {
  return (status ?? 'queued').replace(/_/g, ' ')
}

export default function CustomerInvestigationsPage() {
  const investigationsQuery = useInvestigations(6)
  const statsQuery = useInvestigationStats()
  const investigations = investigationsQuery.data?.data ?? []
  const stats = statsQuery.data?.data

  return (
    <CustomerLayout
      title="Customer Investigations"
      subtitle="Executive summaries of investigation progress and outcomes."
    >
      <div className="zf-dashboard-grid">
        <section className="zf-panel-card zf-full-span zf-customer-shell-hero">
          <div>
            <p className="zf-panel-heading__eyebrow">Investigation pulse</p>
            <h2 className="zf-panel-heading__title">Status across active response work</h2>
            <p className="zf-panel-heading__meta">This view keeps the narrative concise while preserving the current analyst workflows behind the scenes.</p>
          </div>
          <div className="zf-customer-shell-stat-grid">
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Total investigations</span>
              <strong className="zf-customer-shell-stat__value">{stats?.totalInvestigations ?? investigations.length}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Pending review</span>
              <strong className="zf-customer-shell-stat__value">{stats?.pendingReview ?? 0}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">True positive rate</span>
              <strong className="zf-customer-shell-stat__value">{Math.round((stats?.tpRate ?? 0) * 100)}%</strong>
            </article>
          </div>
        </section>

        <section className="zf-panel-card zf-span-8">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Current queue</p>
              <h2 className="zf-panel-heading__title">Recent investigations</h2>
            </div>
          </div>
          {investigationsQuery.isLoading ? (
            <div className="zf-panel-empty">Loading investigation summaries.</div>
          ) : investigations.length === 0 ? (
            <div className="zf-panel-empty">No customer-ready investigations are available yet.</div>
          ) : (
            <div className="zf-customer-shell-list">
              {investigations.map((investigation) => (
                <article key={investigation.id} className="zf-customer-shell-list__item">
                  <div className="zf-customer-shell-list__row">
                    <div>
                      <h3>{investigation.alertTitle || `Investigation ${investigation.id}`}</h3>
                      <p>{investigation.executiveSummary || investigation.summary || 'Executive summary pending.'}</p>
                    </div>
                    <span className={statusClass(investigation.status)}>{formatStatus(investigation.status)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="zf-panel-card zf-span-4">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Executive notes</p>
              <h2 className="zf-panel-heading__title">Review focus</h2>
            </div>
          </div>
          <div className="zf-action-list">
            <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Track pending review items that could delay remediation decisions.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Use completed investigations to confirm whether alert volume matches actual risk.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Escalate failed investigations if executive summaries stop updating.</p></div>
          </div>
        </section>
      </div>
    </CustomerLayout>
  )
}