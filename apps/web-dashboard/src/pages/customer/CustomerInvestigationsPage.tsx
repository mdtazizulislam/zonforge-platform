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
      <div className="zf-page">
        <div className="zf-container">
          <div className="zf-grid">
            <section className="zf-card zf-card--wide">
              <h2 className="zf-title">Status across active response work</h2>
              <p className="zf-sub">A concise investigation pulse that preserves the analyst workflow behind the scenes.</p>
              <div className="zf-settings-stack">
                <div className="zf-row">
                  <div>
                    <div className="zf-label">Total Investigations</div>
                    <div className="zf-value">{stats?.totalInvestigations ?? investigations.length}</div>
                  </div>
                  <div>
                    <div className="zf-label">Pending Review</div>
                    <div className="zf-value">{stats?.pendingReview ?? 0}</div>
                  </div>
                  <div>
                    <div className="zf-label">True Positive Rate</div>
                    <div className="zf-value">{Math.round((stats?.tpRate ?? 0) * 100)}%</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="zf-card zf-card--wide">
              <h2 className="zf-title">Recent investigations</h2>
              <p className="zf-sub">Customer-ready summaries with status visibility and no overlapping panel stack.</p>
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

            <section className="zf-card">
              <h2 className="zf-title">Review focus</h2>
              <p className="zf-sub">Executive notes for keeping remediation decisions moving.</p>
              <div className="zf-action-list">
                <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Track pending review items that could delay remediation decisions.</p></div>
                <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Use completed investigations to confirm whether alert volume matches actual risk.</p></div>
                <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Escalate failed investigations if executive summaries stop updating.</p></div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </CustomerLayout>
  )
}