import { useMemo } from 'react'
import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useAlerts } from '@/hooks/queries'

function normalizeSeverity(value: string | undefined): string {
  const severity = (value ?? 'info').toLowerCase()
  if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') return severity
  return 'info'
}

function formatSeverity(value: string | undefined): string {
  const severity = normalizeSeverity(value)
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}

function severityClass(value: string | undefined): string {
  const severity = normalizeSeverity(value)
  if (severity === 'critical') return 'zf-badge zf-badge--danger'
  if (severity === 'high' || severity === 'medium') return 'zf-badge zf-badge--warning'
  if (severity === 'low') return 'zf-badge zf-badge--caution'
  return 'zf-badge'
}

export default function CustomerAlertsPage() {
  const alertsQuery = useAlerts({ limit: 8 })
  const alerts = alertsQuery.data?.data ?? []

  const metrics = useMemo(() => {
    const critical = alerts.filter((alert) => normalizeSeverity(alert.severity) === 'critical').length
    const active = alerts.filter((alert) => (alert.status ?? '').toLowerCase() !== 'resolved').length
    const monitoredSources = new Set(alerts.map((alert) => alert.affectedIp ?? alert.assignedTo ?? alert.id).filter(Boolean)).size

    return { critical, active, monitoredSources }
  }, [alerts])

  return (
    <CustomerLayout
      title="Customer Alerts"
      subtitle="A customer-safe view of the alerts that need review right now."
    >
      <div className="zf-page">
        <div className="zf-container">
          <section className="zf-section">
            <div className="zf-section-head">
              <h1 className="zf-page-title">Alerts</h1>
              <p className="zf-page-subtitle">A premium customer alert view with executive context and clean prioritization.</p>
            </div>

            <div className="zf-grid zf-grid-2">
              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Alert posture</h2>
                  <p className="zf-card-subtitle">Critical issues, open investigations, and source coverage are summarized for fast executive review.</p>
                </div>
                <div className="zf-detail-list">
                  <div className="zf-detail-row">
                    <span className="zf-label">Critical Alerts</span>
                    <span className="zf-value">{metrics.critical}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Open Alerts</span>
                    <span className="zf-value">{metrics.active}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Sources Reporting</span>
                    <span className="zf-value">{metrics.monitoredSources}</span>
                  </div>
                </div>
              </section>

              <section className="zf-card zf-card--wide">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Recent alerts</h2>
                  <p className="zf-card-subtitle">Customer-safe alert activity without analyst-only controls.</p>
                </div>
              {alertsQuery.isLoading ? (
                <div className="zf-panel-empty">Loading the latest customer alerts.</div>
              ) : alerts.length === 0 ? (
                <div className="zf-panel-empty">No customer alerts are currently available.</div>
              ) : (
                <div className="zf-customer-shell-list">
                  {alerts.map((alert) => (
                    <article key={alert.id} className="zf-customer-shell-list__item">
                      <div className="zf-customer-shell-list__row">
                        <div>
                          <h3>{alert.title}</h3>
                          <p>{alert.affectedIp || alert.assignedTo || 'Security feed'} • {alert.status || 'Open'}</p>
                        </div>
                        <span className={severityClass(alert.severity)}>{formatSeverity(alert.severity)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              </section>

              <section className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">What to do next</h2>
                  <p className="zf-card-subtitle">Immediate customer-facing actions to keep response momentum clean.</p>
                </div>
                <div className="zf-action-list">
                  <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Escalate any critical customer alert that remains open.</p></div>
                  <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Confirm the highest-volume alert source is expected and healthy.</p></div>
                  <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Use investigations for deeper analyst context without leaving the customer shell.</p></div>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
    </CustomerLayout>
  )
}