import { Link } from 'wouter'
import { formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { PostureGauge } from '@/components/widgets/PostureGauge'
import { AlertTrendChart } from '@/components/charts/AlertTrendChart'
import {
  SeverityBadge, PriorityBadge, StatusBadge,
  ScoreIndicator, Spinner, CardSkeleton, ErrorCard, SkeletonBox,
} from '@/components/ui'
import {
  useRiskSummary, useAlerts, useRiskUsers, useConnectors, useMttd,
} from '@/hooks/queries'

// ─────────────────────────────────────────────
// OVERVIEW PAGE — Executive Dashboard
// ─────────────────────────────────────────────

export function OverviewPage() {
  const posture    = useRiskSummary()
  const openAlerts = useAlerts({ status: 'open,investigating', limit: 8 })
  const riskUsers  = useRiskUsers()
  const connectors = useConnectors()
  const mttd       = useMttd()

  return (
    <AppShell
      title="Executive Overview"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Last updated {posture.data ? formatDistanceToNow(new Date(posture.data.calculatedAt), { addSuffix: true }) : '…'}
          </span>
          <button
            onClick={() => posture.refetch()}
            disabled={posture.isFetching}
            className="btn-ghost py-1.5 px-2 text-xs"
          >
            {posture.isFetching ? <Spinner size="sm" /> : '↻ Refresh'}
          </button>
        </div>
      }
    >
      <PageContent>
        {/* ── Row 1: Key metrics ──────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            label="Posture Score"
            loading={posture.isLoading}
            value={
              posture.data ? (
                <PostureGauge score={posture.data.postureScore} size="sm" />
              ) : null
            }
          />
          <MetricCard
            label="Open P1 Alerts"
            loading={posture.isLoading}
            value={
              posture.data ? (
                <div className="flex items-baseline gap-1">
                  <span className={clsx(
                    'stat-number',
                    posture.data.openCriticalAlerts > 0 ? 'text-red-400' : 'text-gray-300',
                  )}>
                    {posture.data.openCriticalAlerts}
                  </span>
                  {posture.data.openHighAlerts > 0 && (
                    <span className="text-sm text-orange-400 font-mono">
                      +{posture.data.openHighAlerts} P2
                    </span>
                  )}
                </div>
              ) : null
            }
            sub={posture.data?.openCriticalAlerts === 0 ? 'No critical alerts' : 'Requires immediate attention'}
            subColor={posture.data?.openCriticalAlerts === 0 ? 'text-green-400' : 'text-red-400'}
          />
          <MetricCard
            label="Avg User Risk Score"
            loading={posture.isLoading}
            value={
              posture.data ? (
                <ScoreIndicator score={posture.data.avgUserRiskScore} size="md" />
              ) : null
            }
            sub="30-day rolling average"
          />
          <MetricCard
            label="MTTD (P1, median)"
            loading={mttd.isLoading}
            value={
              mttd.data?.['P1'] ? (
                <span className="stat-number text-gray-100">
                  {mttd.data['P1'].p50}
                  <span className="text-sm font-normal text-gray-500 ml-1">min</span>
                </span>
              ) : (
                <span className="stat-number text-gray-500">—</span>
              )
            }
            sub={mttd.data?.['P1'] ? `${mttd.data['P1'].count} P1 alerts measured` : 'No P1 data yet'}
          />
        </div>

        {/* ── Row 2: Alert trend + Posture + Top Risk Users ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          {/* Alert trend chart */}
          <div className="lg:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200">Alert Volume — 30 Days</h2>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Critical</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />High</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Medium</span>
              </div>
            </div>
            <AlertTrendChart loading={posture.isLoading} />
          </div>

          {/* Top risk users */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-200">Top Risk Users</h2>
              <Link href="/risk">
                <a className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  View all →
                </a>
              </Link>
            </div>
            <div className="space-y-2">
              {riskUsers.isLoading && Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <SkeletonBox className="h-3 w-32" />
                  <SkeletonBox className="h-5 w-10 rounded-full" />
                </div>
              ))}
              {riskUsers.data?.items.slice(0, 8).map(user => (
                <Link key={user.entityId} href={`/risk/users/${user.entityId}`}>
                  <a className="flex items-center justify-between py-1.5 hover:bg-gray-800/40
                                rounded-lg px-2 -mx-2 transition-colors group">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center
                                      text-xs text-gray-400 flex-shrink-0 ring-1 ring-gray-700">
                        {user.entityId.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-400 truncate font-mono">
                        {user.entityId.slice(0, 8)}…
                      </span>
                    </div>
                    <ScoreIndicator score={user.score} size="sm" />
                  </a>
                </Link>
              ))}
              {!riskUsers.isLoading && !riskUsers.data?.items.length && (
                <p className="text-xs text-gray-500 text-center py-4">No risk data yet</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 3: Active alerts + Connector health ──────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Active alerts */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-gray-200">Active Alerts</h2>
              <Link href="/alerts">
                <a className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  View all →
                </a>
              </Link>
            </div>

            {openAlerts.isLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <SkeletonBox className="h-4 w-12 rounded-full" />
                    <SkeletonBox className="h-4 flex-1" />
                    <SkeletonBox className="h-4 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : openAlerts.data?.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="text-3xl mb-2">✓</span>
                <p className="text-sm font-medium text-green-400">No active alerts</p>
                <p className="text-xs text-gray-500 mt-1">All clear — everything looks good</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800/60">
                {openAlerts.data?.items.map(alert => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </div>

          {/* Connector health */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-gray-200">Connectors</h2>
              <Link href="/connectors">
                <a className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  Manage →
                </a>
              </Link>
            </div>

            {connectors.isLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <SkeletonBox className="h-3 w-24" />
                    <SkeletonBox className="h-4 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Health summary */}
                {posture.data && (
                  <div className="px-5 py-3 border-b border-gray-800/60 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${posture.data.connectorHealthScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-400">
                      {posture.data.connectorHealthScore}% healthy
                    </span>
                  </div>
                )}
                <div className="divide-y divide-gray-800/60">
                  {connectors.data?.map(conn => (
                    <ConnectorRow key={conn.id} connector={conn} />
                  ))}
                  {!connectors.data?.length && (
                    <p className="text-xs text-gray-500 text-center py-8">
                      No connectors configured
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </PageContent>
    </AppShell>
  )
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function MetricCard({
  label, value, sub, subColor, loading,
}: {
  label:     string
  value?:    React.ReactNode
  sub?:      string
  subColor?: string
  loading?:  boolean
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      <div className="min-h-[40px] flex items-center">
        {loading ? (
          <SkeletonBox className="h-8 w-24" />
        ) : (
          value
        )}
      </div>
      {sub && !loading && (
        <p className={clsx('text-xs mt-2', subColor ?? 'text-gray-500')}>{sub}</p>
      )}
    </div>
  )
}

function AlertRow({ alert }: { alert: ReturnType<typeof useAlerts>['data'] extends { items: Array<infer T> } | undefined ? T : never }) {
  return (
    <Link href={`/alerts/${alert.id}`}>
      <a className="flex items-start gap-3 px-5 py-3 hover:bg-gray-800/40 transition-colors group">
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <PriorityBadge priority={alert.priority} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-300 truncate group-hover:text-gray-100 transition-colors">
            {alert.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
            {alert.detectionGapMinutes ? ` • MTTD: ${alert.detectionGapMinutes}m` : ''}
            {alert.mttdSlaBreached && (
              <span className="text-red-400 ml-1">⚠ SLA breached</span>
            )}
          </p>
        </div>
        <div className="flex-shrink-0 mt-0.5">
          <SeverityBadge severity={alert.severity} showDot={false} />
        </div>
      </a>
    </Link>
  )
}

function ConnectorRow({ connector }: { connector: import('@/lib/api').ConnectorSummary }) {
  const statusColor = connector.isHealthy
    ? 'bg-green-500'
    : connector.status === 'error'
    ? 'bg-red-500'
    : connector.status === 'degraded'
    ? 'bg-amber-500'
    : 'bg-gray-500'

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', statusColor,
        connector.isHealthy ? 'shadow-[0_0_6px_theme(colors.green.500)]' : '')} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-300 truncate">{connector.name}</p>
        <p className="text-xs text-gray-600 truncate">
          {connector.lastEventAt
            ? formatDistanceToNow(new Date(connector.lastEventAt), { addSuffix: true })
            : 'No events yet'}
        </p>
      </div>
      {connector.eventRatePerHour > 0 && (
        <span className="text-xs font-mono text-gray-500">
          {connector.eventRatePerHour}/h
        </span>
      )}
    </div>
  )
}
