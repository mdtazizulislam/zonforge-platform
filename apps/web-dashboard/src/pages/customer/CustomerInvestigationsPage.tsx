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
      <div className="zf-page">
        <div className="zf-container">
          <section className="zf-section">
            <div className="zf-section-head">
              <h1 className="zf-page-title">Investigations</h1>
              <p className="zf-page-subtitle">Executive summaries of active response work, framed for customer review.</p>
            </div>

            <div className="zf-grid zf-grid-2">
              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Status across active response work</h2>
                  <p className="zf-card-subtitle">A concise investigation pulse that preserves the analyst workflow behind the scenes.</p>
                </div>
                <div className="zf-detail-list">
                  <div className="zf-detail-row">
                    <span className="zf-label">Total Investigations</span>
                    <span className="zf-value">{stats?.totalInvestigations ?? investigations.length}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Pending Review</span>
                    <span className="zf-value">{stats?.pendingReview ?? 0}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">True Positive Rate</span>
                    <span className="zf-value">{Math.round((stats?.tpRate ?? 0) * 100)}%</span>
                  </div>
                </div>
              </section>

              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Recent investigations</h2>
                  <p className="zf-card-subtitle">Customer-ready summaries with status visibility and no overlapping panel stack.</p>
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

              <section className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Review focus</h2>
                  <p className="zf-card-subtitle">Executive notes for keeping remediation decisions moving.</p>
                </div>
                <div className="zf-action-list">
                  <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Track pending review items that could delay remediation decisions.</p></div>
                  <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Use completed investigations to confirm whether alert volume matches actual risk.</p></div>
                  <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Escalate failed investigations if executive summaries stop updating.</p></div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
  )
}