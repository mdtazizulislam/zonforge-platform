import { useState } from 'react'
import { clsx } from 'clsx'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useRiskSummary, useRiskUsers, useRiskUser, useMttdMetrics,
} from '@/hooks/queries'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { PostureGauge }         from '@/components/widgets/PostureGauge'
import { Badge, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Users, Server, Shield, TrendingUp, TrendingDown,
  Clock, AlertTriangle, ChevronRight, Info,
} from 'lucide-react'

// ── Risk score bar ────────────────────────────

function RiskBar({ score }: { score: number }) {
  const pct   = Math.min(score, 100)
  const color = score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-orange-500'
              : score >= 25 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-500', color)}
             style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-gray-300 w-8 text-right">{score}</span>
    </div>
  )
}

// ── Entity row ────────────────────────────────

function EntityRow({ rank, entityId, score, severity, selected, onSelect }: {
  rank: number; entityId: string; score: number; severity: string
  selected: boolean; onSelect: () => void
}) {
  return (
    <button onClick={onSelect}
      className={clsx(
        'w-full text-left px-5 py-4 border-b border-gray-800/60 transition-colors',
        selected ? 'bg-blue-500/8 border-l-2 border-l-blue-500' : 'hover:bg-gray-800/40',
      )}>
      <div className="flex items-center gap-3">
        <div className={clsx(
          'flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold',
          rank === 1 ? 'bg-red-500/20 text-red-300'
          : rank === 2 ? 'bg-orange-500/20 text-orange-300'
          : rank <= 3 ? 'bg-yellow-500/20 text-yellow-300'
          : 'bg-gray-700 text-gray-400',
        )}>{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-mono text-gray-200 truncate">
              {entityId.length > 22 ? `${entityId.slice(0, 22)}…` : entityId}
            </p>
            <Badge variant={severity as any} size="xs">{severity}</Badge>
          </div>
          <RiskBar score={score} />
        </div>
        <ChevronRight className="h-4 w-4 text-gray-600 flex-shrink-0" />
      </div>
    </button>
  )
}

// ── Entity detail ─────────────────────────────

function EntityDetail({ userId }: { userId: string }) {
  const { data: profile, isLoading } = useRiskUser(userId)
  const risk = profile?.riskScore

  if (isLoading) return (
    <div className="p-6 space-y-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  )

  if (!risk) return (
    <EmptyState icon={Users} title="No risk data"
      description="Insufficient signal history for scoring." />
  )

  const scoreColor = risk.score >= 70 ? 'text-red-400' : risk.score >= 50 ? 'text-orange-400'
                   : risk.score >= 25 ? 'text-yellow-400' : 'text-green-400'
  const strokeColor = risk.score >= 70 ? '#ef4444' : risk.score >= 50 ? '#f97316'
                    : risk.score >= 25 ? '#eab308' : '#22c55e'
  const circumference = 2 * Math.PI * 30
  const strokeDash = (risk.score / 100) * circumference

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      {/* Score ring */}
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="30" fill="none" stroke="#1f2937" strokeWidth="6" />
            <circle cx="40" cy="40" r="30" fill="none" stroke={strokeColor} strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${strokeDash} ${circumference}`}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={clsx('text-xl font-bold', scoreColor)}>{risk.score}</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={risk.severity as any}>{risk.severity}</Badge>
            <span className="text-xs text-gray-600 capitalize">{risk.confidenceBand} confidence</span>
          </div>
          <p className="text-xs font-mono text-gray-500">{userId.slice(0, 28)}…</p>
          <p className="text-xs text-gray-700 mt-1">Updated {new Date(risk.calculatedAt).toLocaleString()}</p>
        </div>
      </div>

      {/* Risk drivers */}
      {risk.contributingSignals?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Risk Drivers</p>
          <div className="space-y-3">
            {risk.contributingSignals.map((sig: any, i: number) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400 capitalize">{sig.signalType.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-bold text-gray-300">+{sig.contribution?.toFixed(1)}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500/70 rounded-full transition-all"
                    style={{ width: `${Math.min(sig.contribution ?? 0, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended actions */}
      {profile?.recommendedActions && profile.recommendedActions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
            Recommended Actions
          </p>
          <ol className="space-y-2">
            {profile.recommendedActions.map((action: string, i: number) => (
              <li key={i} className="flex gap-2.5 text-xs">
                <span className="flex-shrink-0 h-4 w-4 rounded-full bg-gray-800 text-gray-500
                                 flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                <span className="text-gray-400 leading-relaxed">{action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Link to={`/alerts?affectedUserId=${userId}`}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg
                   border border-gray-700 text-sm text-gray-400 hover:text-gray-200
                   hover:border-gray-600 transition-colors">
        <AlertTriangle className="h-4 w-4" />
        View related alerts
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────
// RISK PAGE
// ─────────────────────────────────────────────

export default function RiskPage() {
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<'users' | 'assets'>('users')
  const [selectedId, setId] = useState<string | null>(searchParams.get('userId'))

  const { data: summary, isLoading: sumLoading } = useRiskSummary()
  const { data: usersData, isLoading: usersLoading } = useRiskUsers()
  const { data: mttd } = useMttdMetrics()

  const entities = usersData?.items ?? []
  const mttdBucket = mttd
    ? (Object.values(mttd).find(
        (v): v is { p50: number; p75: number; p95: number; count: number } =>
          !!v && typeof v === 'object' && 'p50' in v,
      ) ?? null)
    : null

  return (
    <AppShell title="Risk Intelligence">
      <PageContent>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="flex flex-col items-center gap-2 py-3">
            <PostureGauge score={summary?.postureScore ?? 0} loading={sumLoading} size="sm" />
            <p className="text-xs text-gray-500">Org Posture</p>
          </Card>
          <Card className="flex flex-col justify-center gap-1">
            <p className={clsx('text-3xl font-bold tabular-nums',
              (summary?.openCriticalAlerts ?? 0) > 0 ? 'text-red-400' : 'text-gray-400')}>
              {sumLoading ? '—' : summary?.openCriticalAlerts ?? 0}
            </p>
            <p className="text-sm text-gray-400">Open P1 Alerts</p>
            <p className="text-xs text-gray-600">{summary?.openHighAlerts ?? 0} P2 (high)</p>
          </Card>
          <Card className="flex flex-col justify-center gap-1">
            <p className={clsx('text-3xl font-bold tabular-nums',
              (summary?.avgUserRiskScore ?? 0) >= 50 ? 'text-orange-400' : 'text-gray-300')}>
              {sumLoading ? '—' : summary?.avgUserRiskScore ?? 0}
            </p>
            <p className="text-sm text-gray-400">Avg User Risk</p>
            <p className="text-xs text-gray-600">out of 100</p>
          </Card>
          <Card className="flex flex-col justify-center gap-1">
            <p className={clsx('text-3xl font-bold tabular-nums',
              (summary?.connectorHealthScore ?? 100) < 80 ? 'text-orange-400' : 'text-green-400')}>
              {sumLoading ? '—' : `${summary?.connectorHealthScore ?? 100}%`}
            </p>
            <p className="text-sm text-gray-400">Connector Health</p>
          </Card>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Entity list */}
          <Card padding="none">
            <div className="flex items-center gap-1 p-3 border-b border-gray-800">
              {(['users', 'assets'] as const).map(v => (
                <button key={v} onClick={() => { setView(v); setId(null) }}
                  className={clsx('flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    view === v ? 'bg-gray-800 text-gray-200' : 'text-gray-600 hover:text-gray-400')}>
                  {v === 'users' ? <Users className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                  {v === 'users' ? 'Users' : 'Assets'}
                </button>
              ))}
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {usersLoading ? (
                <div className="divide-y divide-gray-800">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-4">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-1.5 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : entities.length === 0 ? (
                <EmptyState icon={Shield} title="No risk scores yet"
                  description="Risk scores are calculated as alerts are processed." />
              ) : (
                entities.map((u: any, i: number) => (
                  <EntityRow key={u.entityId} rank={i + 1}
                    entityId={u.entityId} score={u.score} severity={u.severity}
                    selected={selectedId === u.entityId} onSelect={() => setId(u.entityId)} />
                ))
              )}
            </div>
          </Card>

          {/* Detail + MTTD */}
          <div className="lg:col-span-2 space-y-6">
            <Card padding="none" className="min-h-[300px]">
              {selectedId
                ? <EntityDetail userId={selectedId} />
                : <EmptyState icon={Shield} title="Select an entity"
                    description="Click a user or asset to view their full risk profile." />}
            </Card>

            {/* MTTD section */}
            {mttdBucket && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    Mean Time to Detect
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'P50 (Median)', value: mttdBucket.p50, color: 'bg-blue-500' },
                    { label: 'P75',          value: mttdBucket.p75, color: 'bg-orange-500' },
                    { label: 'P95 (Worst)',  value: mttdBucket.p95, color: 'bg-red-500' },
                  ].map(({ label, value, color }) => {
                    const max = Math.max(mttdBucket.p95 ?? 1, 1)
                    const pct = value != null ? (value / max) * 100 : 0
                    return (
                      <div key={label} className="flex flex-col items-center gap-2">
                        <div className="w-full h-16 bg-gray-800/40 rounded-lg flex items-end p-1">
                          <div className={clsx('w-full rounded transition-all', color)}
                            style={{ height: `${pct}%`, minHeight: '4px' }} />
                        </div>
                        <p className="text-xl font-bold text-gray-100 tabular-nums">
                          {value != null ? `${value}m` : 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500 text-center">{label}</p>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>

      </PageContent>
    </AppShell>
  )
}
