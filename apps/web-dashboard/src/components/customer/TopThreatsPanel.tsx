function severityClass(severity: string) {
  const normalized = severity.toLowerCase()
  if (normalized === 'critical') return 'is-danger'
  if (normalized === 'high') return 'is-warning'
  if (normalized === 'medium') return 'is-caution'
  return 'is-neutral'
}

function badgeClass(severity: string) {
  const normalized = severity.toLowerCase()
  if (normalized === 'critical') return 'zf-badge zf-badge--danger'
  if (normalized === 'high') return 'zf-badge zf-badge--warning'
  if (normalized === 'medium') return 'zf-badge zf-badge--caution'
  return 'zf-badge'
}

export default function TopThreatsPanel({
  items,
}: {
  items: Array<{ id: string; title: string; severity: string; context?: string; ts?: string }>
}) {
  return (
    <section className="zf-panel-card">
      <div className="zf-panel-heading">
        <div>
          <p className="zf-panel-heading__eyebrow">Top Threats</p>
          <h2 className="zf-panel-heading__title">Priority items requiring attention</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="zf-panel-empty">No priority threats are surfaced right now. This section will highlight the highest-risk items as live alerts arrive.</div>
      ) : (
        <div className="zf-threat-list">
          {items.slice(0, 3).map((item) => (
            <article key={item.id} className="zf-threat-item">
              <div className={`zf-threat-item__dot ${severityClass(item.severity)}`} />
              <div className="zf-threat-item__body">
                <div className="zf-threat-item__row">
                  <p className="zf-threat-item__title">{item.title}</p>
                  <span className={badgeClass(item.severity)}>{item.severity}</span>
                </div>
                <p className="zf-threat-item__context">{item.context ?? 'No additional context available.'}</p>
                {item.ts ? <p className="zf-threat-item__time">{item.ts}</p> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}