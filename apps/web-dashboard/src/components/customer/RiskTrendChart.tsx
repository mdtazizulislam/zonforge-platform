function buildPath(points: number[], width: number, height: number, padding: number) {
  const safePoints = points.length > 1 ? points : [0, 0, 0, 0, 0, 0]
  const max = Math.max(...safePoints, 1)
  const min = Math.min(...safePoints, 0)
  const span = Math.max(max - min, 1)
  const stepX = (width - padding * 2) / Math.max(safePoints.length - 1, 1)

  return safePoints.map((point, index) => {
    const x = padding + stepX * index
    const y = height - padding - ((point - min) / span) * (height - padding * 2)
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')
}

export default function RiskTrendChart({ points }: { points: number[] }) {
  const safePoints = points.filter((point) => Number.isFinite(point)).slice(0, 8)
  const hasTrend = safePoints.length > 1 && safePoints.some((point) => point !== safePoints[0])
  const width = 640
  const height = 240
  const padding = 28

  return (
    <div className="zf-chart-card">
      <div className="zf-panel-heading">
        <div>
          <p className="zf-panel-heading__eyebrow">Risk Trends</p>
          <h2 className="zf-panel-heading__title">Organization posture trend</h2>
        </div>
        <p className="zf-panel-heading__meta">{hasTrend ? 'Recent signal movement' : 'No recent risk trend yet'}</p>
      </div>

      <div className="zf-trend-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Risk trend chart">
          {[0, 1, 2, 3].map((line) => {
            const y = padding + line * ((height - padding * 2) / 3)
            return <line key={line} x1={padding} y1={y} x2={width - padding} y2={y} className="zf-trend-chart__grid" />
          })}

          <path d={buildPath(safePoints, width, height, padding)} className="zf-trend-chart__line" />
        </svg>

        {!hasTrend ? <div className="zf-trend-chart__empty">No recent risk trend yet</div> : null}
      </div>
    </div>
  )
}