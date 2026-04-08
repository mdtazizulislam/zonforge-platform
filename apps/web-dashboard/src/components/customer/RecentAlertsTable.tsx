function severityClass(severity: string) {
  const normalized = severity.toLowerCase()
  if (normalized === 'critical') return 'zf-badge zf-badge--danger'
  if (normalized === 'high') return 'zf-badge zf-badge--warning'
  if (normalized === 'medium') return 'zf-badge zf-badge--caution'
  return 'zf-badge'
}

function statusClass(status?: string) {
  const normalized = (status ?? '').toLowerCase()
  if (normalized.includes('resolved') || normalized.includes('healthy')) return 'zf-status-pill is-success'
  if (normalized.includes('in_progress') || normalized.includes('warning')) return 'zf-status-pill is-warning'
  if (normalized.includes('failed') || normalized.includes('error')) return 'zf-status-pill is-danger'
  return 'zf-status-pill'
}

export default function RecentAlertsTable({
  alerts,
}: {
  alerts: Array<{ id: string; title: string; severity: string; source?: string; status?: string }>
}) {
  return (
    <section className="zf-panel-card">
      <div className="zf-panel-heading">
        <div>
          <p className="zf-panel-heading__eyebrow">Recent Alerts</p>
          <h2 className="zf-panel-heading__title">Latest alert feed</h2>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="zf-panel-empty">No recent alerts to display.</div>
      ) : (
        <div className="zf-table-wrap">
          <table className="zf-alerts-table">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0, 5).map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <div className="zf-alerts-table__title">{alert.title}</div>
                  </td>
                  <td><span className={severityClass(alert.severity)}>{alert.severity}</span></td>
                  <td>{alert.source ?? 'Security feed'}</td>
                  <td><span className={statusClass(alert.status)}>{alert.status ?? 'open'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}