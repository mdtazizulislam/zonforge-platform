function statusClass(status?: string) {
  const normalized = (status ?? '').toLowerCase()
  if (normalized === 'completed') return 'zf-status-pill is-success'
  if (normalized === 'failed') return 'zf-status-pill is-danger'
  if (normalized === 'awaiting_approval') return 'zf-status-pill is-warning'
  return 'zf-status-pill'
}

export default function InvestigationPreviewPanel({
  items,
}: {
  items: Array<{ id: string; title: string; status?: string; summary?: string; secondary?: string }>
}) {
  const primary = items[0]

  return (
    <section className="zf-panel-card">
      <div className="zf-panel-heading">
        <div>
          <p className="zf-panel-heading__eyebrow">Investigation Preview</p>
          <h2 className="zf-panel-heading__title">Latest investigation state</h2>
        </div>
      </div>

      {!primary ? (
        <div className="zf-panel-empty">No investigation preview available.</div>
      ) : (
        <div className="zf-investigation-panel">
          <div className="zf-investigation-panel__featured">
            <div className="zf-investigation-panel__row">
              <h3>{primary.title}</h3>
              <span className={statusClass(primary.status)}>{primary.status ?? 'queued'}</span>
            </div>
            <p>{primary.summary ?? 'Summary pending from the investigation service.'}</p>
            {primary.secondary ? <p className="zf-investigation-panel__secondary">{primary.secondary}</p> : null}
          </div>

          {items.slice(1, 3).length > 0 ? (
            <div className="zf-investigation-panel__list">
              {items.slice(1, 3).map((item) => (
                <div key={item.id} className="zf-investigation-panel__item">
                  <div>
                    <p className="zf-investigation-panel__item-title">{item.title}</p>
                    <p className="zf-investigation-panel__item-summary">{item.summary ?? 'No summary available.'}</p>
                    {item.secondary ? <p className="zf-investigation-panel__secondary">{item.secondary}</p> : null}
                  </div>
                  <span className={statusClass(item.status)}>{item.status ?? 'queued'}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}