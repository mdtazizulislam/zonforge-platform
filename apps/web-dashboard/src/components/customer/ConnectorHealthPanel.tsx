function statusClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'healthy' || normalized === 'success') return 'zf-connector-row__status is-success'
  if (normalized === 'degraded' || normalized === 'warning') return 'zf-connector-row__status is-warning'
  if (normalized === 'error' || normalized === 'failed') return 'zf-connector-row__status is-danger'
  return 'zf-connector-row__status'
}

export default function ConnectorHealthPanel({
  items,
}: {
  items: Array<{ id: string; name: string; status: string; detail?: string }>
}) {
  return (
    <section className="zf-panel-card">
      <div className="zf-panel-heading">
        <div>
          <p className="zf-panel-heading__eyebrow">Connector Health</p>
          <h2 className="zf-panel-heading__title">Pipeline service status</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="zf-panel-empty">No connector telemetry yet.</div>
      ) : (
        <div className="zf-connector-list">
          {items.map((item) => (
            <div key={item.id} className="zf-connector-row">
              <div>
                <p className="zf-connector-row__name">{item.name}</p>
                <p className="zf-connector-row__detail">{item.detail ?? 'No detail available.'}</p>
              </div>
              <span className={statusClass(item.status)}>{item.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}