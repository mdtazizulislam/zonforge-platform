export default function RecommendedActionsPanel({ actions }: { actions: string[] }) {
  return (
    <section className="zf-panel-card">
      <div className="zf-panel-heading">
        <div>
          <p className="zf-panel-heading__eyebrow">Recommended Actions</p>
          <h2 className="zf-panel-heading__title">What to do next</h2>
        </div>
      </div>

      {actions.length === 0 ? (
        <div className="zf-panel-empty">No recommended actions yet.</div>
      ) : (
        <div className="zf-action-list">
          {actions.slice(0, 5).map((action, index) => (
            <div key={`${action}-${index}`} className="zf-action-item">
              <span className="zf-action-item__index">0{index + 1}</span>
              <p>{action}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}