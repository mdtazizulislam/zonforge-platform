import KpiCard from './KpiCard'

function clampScore(score?: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score ?? 0)))
}

export default function RiskGaugeCard({ score, helper }: { score?: number; helper?: string }) {
  const safeScore = clampScore(score)
  const filledSegments = Math.max(0, Math.min(10, Math.round(safeScore / 10)))

  return (
    <KpiCard
      title="Org Risk Score"
      value={safeScore}
      helper={helper ?? 'No risk score yet'}
      tone={safeScore >= 75 ? 'danger' : safeScore >= 45 ? 'warning' : 'success'}
    >
      <div className="zf-risk-gauge">
        <div className="zf-risk-gauge__segments" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <span
              key={index}
              className={index < filledSegments ? 'zf-risk-gauge__segment is-active' : 'zf-risk-gauge__segment'}
            />
          ))}
        </div>
        <div className="zf-risk-gauge__inner" />
        <div className="zf-risk-gauge__center">
          <span className="zf-risk-gauge__score">{safeScore}</span>
          <span className="zf-risk-gauge__label">Risk Index</span>
        </div>
      </div>
    </KpiCard>
  )
}