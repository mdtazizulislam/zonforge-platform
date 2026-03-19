import { clsx } from 'clsx'

// ─────────────────────────────────────────────
// ORG POSTURE SCORE GAUGE
// Semi-circular gauge with color zones:
//   0–40:   red (critical)
//   41–60:  orange (poor)
//   61–75:  yellow (moderate)
//   76–90:  teal (good)
//   91–100: green (excellent)
// ─────────────────────────────────────────────

interface PostureGaugeProps {
  score:      number
  prevScore?: number
  size?:      'sm' | 'md' | 'lg'
  loading?:   boolean
}

function getScoreColor(score: number) {
  if (score >= 91) return { stroke: '#22c55e', text: 'text-green-400',  label: 'Excellent' }
  if (score >= 76) return { stroke: '#14b8a6', text: 'text-teal-400',   label: 'Good' }
  if (score >= 61) return { stroke: '#f59e0b', text: 'text-amber-400',  label: 'Moderate' }
  if (score >= 41) return { stroke: '#ea580c', text: 'text-orange-400', label: 'Poor' }
  return                 { stroke: '#dc2626', text: 'text-red-400',     label: 'Critical' }
}

export function PostureGauge({ score, prevScore, size = 'md', loading }: PostureGaugeProps) {
  const sizeClass = size === 'lg' ? 'w-48' : size === 'sm' ? 'w-28' : 'w-36'

  if (loading) {
    return (
      <div className={clsx('flex flex-col items-center animate-pulse', sizeClass)}>
        <div className="h-16 w-full rounded-lg bg-gray-800" />
        <div className="mt-2 h-3 w-16 rounded bg-gray-800" />
      </div>
    )
  }

  const { stroke, text, label } = getScoreColor(score)

  // SVG arc math
  const R      = 70    // radius
  const cx     = 100   // center x
  const cy     = 100   // center y
  const START  = 210   // start angle (degrees)
  const END    = 330   // total arc degrees

  function polarToCartesian(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180
    return {
      x: cx + R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
    }
  }

  function describeArc(startDeg: number, endDeg: number) {
    const s   = polarToCartesian(startDeg)
    const e   = polarToCartesian(endDeg)
    const big = endDeg - startDeg > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${big} 1 ${e.x} ${e.y}`
  }

  const filledAngle = START + (score / 100) * END
  const bgPath      = describeArc(START, START + END)
  const fillPath    = score > 0 ? describeArc(START, filledAngle) : null

  const delta = prevScore !== undefined ? score - prevScore : null

  return (
    <div className={clsx('flex flex-col items-center', sizeClass)}>
      <div className="relative w-full">
        <svg viewBox="0 0 200 130" className="w-full overflow-visible">
          {/* Background arc */}
          <path
            d={bgPath}
            fill="none"
            stroke="#1f2937"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {fillPath && (
            <path
              d={fillPath}
              fill="none"
              stroke={stroke}
              strokeWidth="12"
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
              style={{ filter: `drop-shadow(0 0 6px ${stroke}60)` }}
            />
          )}
          {/* Score text */}
          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            className="font-mono font-bold"
            fill={stroke}
            fontSize="28"
            fontFamily="JetBrains Mono, monospace"
          >
            {score}
          </text>
          {/* /100 */}
          <text
            x={cx}
            y={cy + 26}
            textAnchor="middle"
            fill="#6b7280"
            fontSize="9"
            fontFamily="Inter, sans-serif"
          >
            /100
          </text>
        </svg>
      </div>

      {/* Label + delta */}
      <div className="text-center -mt-2">
        <p className={clsx('text-sm font-semibold', text)}>{label}</p>
        {delta !== null && delta !== 0 && (
          <p className={clsx('text-xs mt-0.5', delta > 0 ? 'text-green-400' : 'text-red-400')}>
            {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} pts
          </p>
        )}
      </div>
    </div>
  )
}
