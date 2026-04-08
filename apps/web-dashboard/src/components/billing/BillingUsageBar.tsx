import { clsx } from 'clsx'

function normalizeLimit(limit: number | null | undefined): number | null {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null
}

export function BillingUsageBar({
  label,
  current,
  limit,
  unit,
  helper,
}: {
  label: string
  current: number
  limit: number | null | undefined
  unit?: string
  helper?: string
}) {
  const normalizedLimit = normalizeLimit(limit)
  const isUnlimited = normalizedLimit == null
  const pct = isUnlimited ? 100 : Math.min(100, Math.round((current / normalizedLimit) * 100))
  const toneClass = pct >= 100 && !isUnlimited
    ? 'bg-red-500'
    : pct >= 80 && !isUnlimited
      ? 'bg-yellow-500'
      : 'bg-cyan-500'

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-100">{label}</p>
          {helper && <p className="text-xs text-gray-500">{helper}</p>}
        </div>
        <p className="text-sm font-semibold text-gray-200">
          {current.toLocaleString()}{unit ?? ''}
          {isUnlimited ? (
            <span className="text-gray-500"> / Unlimited</span>
          ) : (
            <span className="text-gray-500"> / {normalizedLimit.toLocaleString()}{unit ?? ''}</span>
          )}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        <div className={clsx('h-full rounded-full transition-all duration-500', toneClass)} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">{isUnlimited ? 'No enforced cap on this plan.' : `${pct}% of allowance in use.`}</span>
        {!isUnlimited && pct >= 80 && (
          <span className={clsx('font-medium', pct >= 100 ? 'text-red-400' : 'text-yellow-400')}>
            {pct >= 100 ? 'Limit reached' : 'Approaching limit'}
          </span>
        )}
      </div>
    </div>
  )
}
