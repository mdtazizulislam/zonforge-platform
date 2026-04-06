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
      <div className="zf-dashboard-grid">
        <section className="zf-panel-card zf-full-span zf-customer-shell-hero">
          <div>
            <p className="zf-panel-heading__eyebrow">Alert posture</p>
            <h2 className="zf-panel-heading__title">Prioritized customer alert stream</h2>
            <p className="zf-panel-heading__meta">Critical issues, open investigations, and source coverage are summarized for fast executive review.</p>
          </div>
          <div className="zf-customer-shell-stat-grid">
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Critical alerts</span>
              <strong className="zf-customer-shell-stat__value">{metrics.critical}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Open alerts</span>
              <strong className="zf-customer-shell-stat__value">{metrics.active}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Sources reporting</span>
              <strong className="zf-customer-shell-stat__value">{metrics.monitoredSources}</strong>
            </article>
          </div>
        </section>

        <section className="zf-panel-card zf-span-8">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Live queue</p>
              <h2 className="zf-panel-heading__title">Recent alerts</h2>
            </div>
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

        <section className="zf-panel-card zf-span-4">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Executive guidance</p>
              <h2 className="zf-panel-heading__title">What to do next</h2>
            </div>
          </div>
          <div className="zf-action-list">
            <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Escalate any critical customer alert that remains open.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Confirm the highest-volume alert source is expected and healthy.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Use investigations for deeper analyst context without leaving the customer shell.</p></div>
          </div>
        </section>
      </div>
    </CustomerLayout>
  )
}