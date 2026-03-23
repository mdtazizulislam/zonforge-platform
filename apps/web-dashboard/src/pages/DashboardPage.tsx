import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  useRiskSummary, useAlerts, useMttdMetrics,
  useConnectors, usePipelineHealth,
} from '@/hooks/queries'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { PostureGauge }         from '@/components/widgets/PostureGauge'
import { AlertTrendChart }      from '@/components/charts/AlertTrendChart'
import { useAuthStore }         from '@/stores/auth.store'
import {
  ShieldAlert, Users, Server, Clock, Activity,
  TrendingUp, TrendingDown, Minus, ArrowRight,
  AlertTriangle, CheckCircle2, XCircle, Loader2,
  Wifi, WifiOff,
} from 'lucide-react'

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function severityBadge(sev: string) {
  const map: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
    high:     'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30',
    medium:   'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30',
    low:      'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
    info:     'bg-gray-700 text-gray-400',
  }
  return map[sev] ?? map.info
}

function priorityDot(priority: string) {
  const map: Record<string, string> = {
    P1: 'bg-red-500',
    P2: 'bg-orange-500',
    P3: 'bg-yellow-500',
    P4: 'bg-blue-500',
  }
  return map[priority] ?? 'bg-gray-500'
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-green-400'
}

function scoreTrend(current: number, prev: number) {
  const delta = current - prev
  if (Math.abs(delta) < 2) return { icon: Minus,       color: 'text-gray-400', label: 'stable' }
  if (delta > 0)            return { icon: TrendingUp,  color: 'text-red-400',  label: `+${delta}` }
  return                           { icon: TrendingDown, color: 'text-green-400', label: `${delta}` }
}

// ─────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────

interface StatCardProps {
  label:     string
  value:     string | number
  subLabel?: string
  icon:      React.ElementType
  iconColor: string
  trend?:    { direction: 'up' | 'down' | 'flat'; value: string; isGood: boolean }
  href?:     string
  loading?:  boolean
}

function StatCard({
  label, value, subLabel, icon: Icon, iconColor,
  trend, href, loading,
}: StatCardProps) {
  const card = (
    <div className={clsx(
      'relative flex flex-col gap-3 rounded-xl border border-gray-800',
      'bg-gray-900 p-5 transition-colors',
      href && 'hover:border-gray-700 hover:bg-gray-800/60 cursor-pointer',
    )}>
      <div className="flex items-start justify-between">
        <div className={clsx('rounded-lg p-2.5', iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div className={clsx(
            'flex items-center gap-1 text-xs font-medium',
            trend.isGood ? 'text-green-400' : 'text-red-400',
          )}>
            {trend.direction === 'up'   && <TrendingUp className="h-3.5 w-3.5" />}
            {trend.direction === 'down' && <TrendingDown className="h-3.5 w-3.5" />}
            {trend.direction === 'flat' && <Minus className="h-3.5 w-3.5 text-gray-500" />}
            <span>{trend.value}</span>
          </div>
        )}
      </div>
      <div>
        {loading ? (
          <div className="h-8 w-24 rounded bg-gray-800 animate-pulse" />
        ) : (
          <p className="text-2xl font-bold text-gray-100 tabular-nums">{value}</p>
        )}
        <p className="mt-0.5 text-sm text-gray-400">{label}</p>
        {subLabel && <p className="mt-1 text-xs text-gray-600">{subLabel}</p>}
      </div>
      {href && (
        <ArrowRight className="absolute right-4 bottom-4 h-4 w-4 text-gray-600" />
      )}
    </div>
  )

  return href ? <Link to={href}>{card}</Link> : card
}

// ─────────────────────────────────────────────
// CONNECTOR STATUS ROW
// ─────────────────────────────────────────────

function ConnectorStatusRow({ connector }: { connector: {
  id: string; name: string; type: string;
  status: string; lastEventAt: string | null; isHealthy: boolean
}}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className={clsx('h-2 w-2 rounded-full flex-shrink-0', {
          'bg-green-400': connector.status === 'active' && connector.isHealthy,
          'bg-yellow-400': connector.status === 'active' && !connector.isHealthy,
          'bg-red-400':   connector.status === 'error',
          'bg-gray-600':  connector.status === 'paused' || connector.status === 'pending_auth',
        })} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">{connector.name}</p>
          <p className="text-xs text-gray-500">{connector.type.replace(/_/g, ' ')}</p>
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        {connector.lastEventAt ? (
          <p className="text-xs text-gray-400">
            {new Date(connector.lastEventAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        ) : (
          <p className="text-xs text-gray-600">No events</p>
        )}
        <p className={clsx('text-xs font-medium mt-0.5', {
          'text-green-400': connector.status === 'active' && connector.isHealthy,
          'text-yellow-400': connector.status === 'active' && !connector.isHealthy,
          'text-red-400':   connector.status === 'error',
          'text-gray-500':  connector.status === 'paused',
        })}>
          {connector.status === 'active' && connector.isHealthy ? 'Healthy' :
           connector.status === 'active' ? 'Lagging' :
           connector.status === 'error' ? 'Error' :
           connector.status === 'paused' ? 'Paused' : 'Pending'}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// RECENT ALERT ROW
// ─────────────────────────────────────────────

function AlertRow({ alert }: { alert: {
  id: string; title: string; severity: string;
  priority: string; status: string; createdAt: string;
  mitreTechniques: string[]
}}) {
  return (
    <Link
      to={`/alerts/${alert.id}`}
      className="flex items-start gap-3 py-3 border-b border-gray-800 last:border-0
                 hover:bg-gray-800/50 -mx-4 px-4 rounded-lg transition-colors"
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className={clsx('h-2 w-2 rounded-full mt-1.5', priorityDot(alert.priority))} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate">{alert.title}</p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <span className={clsx('inline-flex px-1.5 py-0.5 rounded text-xs font-medium',
            severityBadge(alert.severity))}>
            {alert.severity}
          </span>
          {alert.mitreTechniques.slice(0, 2).map(t => (
            <span key={t} className="text-xs text-gray-600 font-mono">{t}</span>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-xs text-gray-500">
          {new Date(alert.createdAt).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit',
          })}
        </p>
        <p className={clsx('text-xs mt-0.5 font-medium', {
          'text-yellow-400': alert.status === 'investigating',
          'text-gray-400':   alert.status === 'open',
          'text-green-400':  alert.status === 'resolved',
        })}>
          {alert.status}
        </p>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)

  const { data: risk,       isLoading: riskLoading }   = useRiskSummary()
  const { data: alertsData, isLoading: alertsLoading } = useAlerts({
    status:   ['open', 'investigating'],
    limit:    8,
  })
  const { data: mttd,       isLoading: mttdLoading }   = useMttdMetrics()
  const { data: connData,   isLoading: connLoading }   = useConnectors()
  const { data: pipeline }                             = usePipelineHealth()

  const alerts     = alertsData?.data    ?? []
  const connectors = connData?.data      ?? []

  const openP1     = alerts.filter(a => a.priority === 'P1').length
  const openP2     = alerts.filter(a => a.priority === 'P2').length
  const healthyConn = connectors.filter((c: any) => c.isHealthy).length

  // Greeting
  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <AppShell
      title="Executive Overview"
      actions={
        <div className="flex items-center gap-2">
          {/* Pipeline status indicator */}
          <div className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
            pipeline?.data?.overall === 'healthy'
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
          )}>
            {pipeline?.data?.overall === 'healthy'
              ? <Wifi className="h-3.5 w-3.5" />
              : <WifiOff className="h-3.5 w-3.5" />}
            Pipeline {pipeline?.data?.overall ?? 'checking…'}
          </div>
        </div>
      }
    >
      <PageContent>

        {/* ── Welcome ─────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-100">
            {greeting}, {user?.name?.split(' ')[0] ?? 'Analyst'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })} · Tenant: {user?.tenantId?.slice(0, 8)}…
          </p>
        </div>

        {/* ── Top-level KPI row ─────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          <StatCard
            label="Open Critical"
            value={riskLoading ? '—' : String(risk?.data?.openCriticalAlerts ?? 0)}
            icon={AlertTriangle}
            iconColor={openP1 > 0 ? 'bg-red-500/15 text-red-400' : 'bg-gray-800 text-gray-500'}
            href="/alerts?priority=P1"
            loading={riskLoading}
            trend={openP1 > 0
              ? { direction: 'up', value: `${openP1} P1`, isGood: false }
              : { direction: 'flat', value: 'None', isGood: true }}
          />

          <StatCard
            label="Org Posture Score"
            value={riskLoading ? '—' : `${risk?.data?.postureScore ?? 0}/100`}
            subLabel={(risk?.data?.postureScore ?? 0) >= 80 ? 'Good'
              : (risk?.data?.postureScore ?? 0) >= 60 ? 'Fair' : 'Needs attention'}
            icon={ShieldAlert}
            iconColor={
              (risk?.data?.postureScore ?? 0) >= 80 ? 'bg-green-500/15 text-green-400'
              : (risk?.data?.postureScore ?? 0) >= 60 ? 'bg-yellow-500/15 text-yellow-400'
              : 'bg-red-500/15 text-red-400'
            }
            href="/risk"
            loading={riskLoading}
          />

          <StatCard
            label="MTTD (P50)"
            value={mttdLoading ? '—'
              : mttd?.data?.p50Minutes != null
                ? `${mttd.data.p50Minutes}m`
                : 'N/A'}
            subLabel="Median detection time"
            icon={Clock}
            iconColor="bg-blue-500/15 text-blue-400"
            loading={mttdLoading}
          />

          <StatCard
            label="Connectors"
            value={connLoading ? '—' : `${healthyConn}/${connectors.length}`}
            subLabel="Healthy / Total"
            icon={Activity}
            iconColor={
              healthyConn === connectors.length ? 'bg-green-500/15 text-green-400'
              : 'bg-orange-500/15 text-orange-400'
            }
            href="/connectors"
            loading={connLoading}
          />
        </div>

        {/* ── Main 3-column grid ────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* LEFT: Posture gauge + top risk users */}
          <div className="flex flex-col gap-6">

            {/* Posture gauge */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">Security Posture</h3>
                <Link to="/risk" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                  Details <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex justify-center py-2">
                <PostureGauge
                  score={risk?.data?.postureScore ?? 0}
                  loading={riskLoading}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-gray-800/60 py-2 px-3">
                  <p className="text-lg font-bold text-orange-400">
                    {risk?.data?.openHighAlerts ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">High alerts</p>
                </div>
                <div className="rounded-lg bg-gray-800/60 py-2 px-3">
                  <p className="text-lg font-bold text-gray-200">
                    {risk?.data?.avgUserRiskScore ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Avg user risk</p>
                </div>
              </div>
            </div>

            {/* Top risk users */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Users className="inline h-4 w-4 mr-1.5 text-gray-500" />
                  Top Risk Users
                </h3>
                <Link to="/risk" className="text-xs text-blue-400 hover:underline">
                  View all
                </Link>
              </div>
              {riskLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gray-800 animate-pulse" />
                      <div className="flex-1">
                        <div className="h-3 w-28 rounded bg-gray-800 animate-pulse mb-1.5" />
                        <div className="h-2 w-16 rounded bg-gray-800 animate-pulse" />
                      </div>
                      <div className="h-6 w-10 rounded bg-gray-800 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (risk?.data?.topRiskUserIds ?? []).length > 0 ? (
                <div className="space-y-1">
                  {(risk?.data?.topRiskUserIds ?? []).slice(0, 5).map((userId: string, idx: number) => (
                    <Link
                      key={userId}
                      to={`/risk?userId=${userId}`}
                      className="flex items-center gap-3 py-2 rounded-lg
                                 hover:bg-gray-800/60 -mx-2 px-2 transition-colors"
                    >
                      <div className={clsx(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                        idx === 0 ? 'bg-red-500/20 text-red-400'
                        : idx === 1 ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-gray-700 text-gray-400',
                      )}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 font-mono truncate">
                          {userId.slice(0, 12)}…
                        </p>
                        <p className="text-xs text-gray-600">User</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500/40 mb-2" />
                  <p className="text-sm text-gray-500">No high-risk users</p>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Alert trend + recent alerts */}
          <div className="lg:col-span-1 flex flex-col gap-6">

            {/* Alert trend chart */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">Alert Trend (30 days)</h3>
                <Link to="/alerts" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                  All alerts <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <AlertTrendChart height={180} />
            </div>

            {/* Recent alerts */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-300">
                  <ShieldAlert className="inline h-4 w-4 mr-1.5 text-gray-500" />
                  Recent Alerts
                </h3>
                <Link to="/alerts" className="text-xs text-blue-400 hover:underline">
                  View all
                </Link>
              </div>

              {alertsLoading ? (
                <div className="space-y-3 mt-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="h-2 w-2 mt-2 rounded-full bg-gray-800 animate-pulse flex-shrink-0" />
                      <div className="flex-1">
                        <div className="h-3 w-full rounded bg-gray-800 animate-pulse mb-1.5" />
                        <div className="h-2 w-24 rounded bg-gray-800 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : alerts.length > 0 ? (
                <div>
                  {alerts.slice(0, 6).map((alert: any) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-500/30 mb-3" />
                  <p className="text-sm font-medium text-gray-400">No open alerts</p>
                  <p className="text-xs text-gray-600 mt-1">All clear — keep monitoring</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Connectors + top risk assets */}
          <div className="flex flex-col gap-6">

            {/* Connector status */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Activity className="inline h-4 w-4 mr-1.5 text-gray-500" />
                  Data Connectors
                </h3>
                <Link to="/connectors" className="text-xs text-blue-400 hover:underline">
                  Manage
                </Link>
              </div>

              {connLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-gray-800 animate-pulse flex-shrink-0" />
                      <div className="flex-1 h-3 rounded bg-gray-800 animate-pulse" />
                      <div className="h-3 w-12 rounded bg-gray-800 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : connectors.length > 0 ? (
                <div>
                  {connectors.slice(0, 5).map((c: any) => (
                    <ConnectorStatusRow key={c.id} connector={c} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <WifiOff className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No connectors configured</p>
                  <Link to="/connectors" className="text-xs text-blue-400 mt-2 inline-block hover:underline">
                    Add connector →
                  </Link>
                </div>
              )}
            </div>

            {/* MTTD widget */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Clock className="inline h-4 w-4 mr-1.5 text-gray-500" />
                  Detection Time (MTTD)
                </h3>
              </div>
              {mttdLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="rounded-lg bg-gray-800/60 p-3 text-center">
                      <div className="h-6 w-10 rounded bg-gray-800 animate-pulse mx-auto mb-1" />
                      <div className="h-2 w-8 rounded bg-gray-800 animate-pulse mx-auto" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'P50', value: mttd?.data?.p50Minutes },
                    { label: 'P90', value: mttd?.data?.p90Minutes },
                    { label: 'P99', value: mttd?.data?.p99Minutes },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-gray-800/60 p-3 text-center">
                      <p className="text-lg font-bold text-gray-100">
                        {value != null ? `${value}m` : 'N/A'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}
              {mttd?.data?.trend30d != null && (
                <div className={clsx(
                  'mt-3 flex items-center gap-1.5 text-xs',
                  mttd.data.trend30d < 0 ? 'text-green-400' : 'text-red-400',
                )}>
                  {mttd.data.trend30d < 0
                    ? <TrendingDown className="h-3.5 w-3.5" />
                    : <TrendingUp className="h-3.5 w-3.5" />}
                  <span>
                    {mttd.data.trend30d < 0
                      ? `${Math.abs(mttd.data.trend30d)}% faster vs last month`
                      : `${mttd.data.trend30d}% slower vs last month`}
                  </span>
                </div>
              )}
            </div>

            {/* Top risk assets */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Server className="inline h-4 w-4 mr-1.5 text-gray-500" />
                  Top Risk Assets
                </h3>
                <Link to="/risk?view=assets" className="text-xs text-blue-400 hover:underline">
                  View all
                </Link>
              </div>
              {riskLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-10 rounded-lg bg-gray-800 animate-pulse" />
                  ))}
                </div>
              ) : (risk?.data?.topRiskAssetIds ?? []).length > 0 ? (
                <div className="space-y-1">
                  {(risk?.data?.topRiskAssetIds ?? []).slice(0, 4).map((assetId: string, idx: number) => (
                    <div
                      key={assetId}
                      className="flex items-center gap-3 py-2 rounded-lg"
                    >
                      <div className={clsx(
                        'flex h-7 w-7 items-center justify-center rounded text-xs font-bold',
                        idx === 0 ? 'bg-red-500/20 text-red-400'
                        : idx === 1 ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-gray-700 text-gray-400',
                      )}>
                        {idx + 1}
                      </div>
                      <p className="text-sm text-gray-300 font-mono truncate flex-1">
                        {assetId.slice(0, 12)}…
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500/40 mb-2" />
                  <p className="text-sm text-gray-500">No high-risk assets</p>
                </div>
              )}
            </div>

          </div>
        </div>

      </PageContent>
    </AppShell>
  )
}
