import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  useRiskSummary, useAlerts, useMttdMetrics,
  useConnectors, usePipelineHealth,
} from '@/hooks/queries'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { PostureGauge } from '@/components/widgets/PostureGauge'
import {
  ArrowRight,
  Activity,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Server,
  TrendingDown,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { AlertTrendChart } from '@/components/charts/AlertTrendChart'

function severityBadge(sev: string) {
  const map: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
    high: 'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30',
    medium: 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30',
    low: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
    info: 'bg-gray-700 text-gray-400',
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

interface StatCardProps {
  label: string
  value: string | number
  subLabel?: string
  icon: React.ElementType
  iconColor: string
  trend?: { direction: 'up' | 'down' | 'flat'; value: string; isGood: boolean }
  href?: string
  loading?: boolean
}

function StatCard({ label, value, subLabel, icon: Icon, iconColor, trend, href, loading }: StatCardProps) {
  const card = (
    <div className={clsx(
      'relative flex flex-col gap-3 rounded-xl border border-gray-800',
      'bg-gray-900 p-5 transition-colors',
      href && 'cursor-pointer hover:border-gray-700 hover:bg-gray-800/60',
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
            {trend.direction === 'up' && <TrendingUp className="h-3.5 w-3.5" />}
            {trend.direction === 'down' && <TrendingDown className="h-3.5 w-3.5" />}
            {trend.direction === 'flat' && <ArrowRight className="h-3.5 w-3.5 rotate-45 text-gray-500" />}
            <span>{trend.value}</span>
          </div>
        )}
      </div>
      <div>
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-gray-800" />
        ) : (
          <p className="text-2xl font-bold tabular-nums text-gray-100">{value}</p>
        )}
        <p className="mt-0.5 text-sm text-gray-400">{label}</p>
        {subLabel && <p className="mt-1 text-xs text-gray-600">{subLabel}</p>}
      </div>
      {href && <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-gray-600" />}
    </div>
  )

  return href ? <Link to={href}>{card}</Link> : card
}

function ConnectorStatusRow({ connector }: { connector: {
  id: string
  name: string
  type: string
  status: string
  lastEventAt: string | null
  isHealthy: boolean
} }) {
  const status = connector.status.toLowerCase()

  return (
    <div className="border-b border-gray-800 py-2.5 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={clsx('h-2 w-2 flex-shrink-0 rounded-full', {
            'bg-green-400': status === 'connected' && connector.isHealthy,
            'bg-yellow-400': status === 'pending',
            'bg-red-400': status === 'failed',
            'bg-gray-600': status === 'disabled',
          })} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-200">{connector.name}</p>
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
          <p className={clsx('mt-0.5 text-xs font-medium', {
            'text-green-400': status === 'connected' && connector.isHealthy,
            'text-yellow-400': status === 'pending',
            'text-red-400': status === 'failed',
            'text-gray-500': status === 'disabled',
          })}>
            {status === 'connected' ? 'Connected'
              : status === 'failed' ? 'Failed'
              : status === 'disabled' ? 'Disabled' : 'Pending'}
          </p>
        </div>
      </div>
    </div>
  )
}

function AlertRow({ alert }: { alert: {
  id: string
  title: string
  severity: string
  priority: string
  status: string
  createdAt: string
  mitreTechniques: string[]
} }) {
  return (
    <Link
      to={`/alerts/${alert.id}`}
      className="-mx-4 flex items-start gap-3 rounded-lg border-b border-gray-800 px-4 py-3 transition-colors hover:bg-gray-800/50 last:border-0"
    >
      <div className="mt-0.5 flex-shrink-0">
        <div className={clsx('mt-1.5 h-2 w-2 rounded-full', priorityDot(alert.priority))} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200">{alert.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex rounded px-1.5 py-0.5 text-xs font-medium', severityBadge(alert.severity))}>
            {alert.severity}
          </span>
          {alert.mitreTechniques.slice(0, 2).map((technique) => (
            <span key={technique} className="font-mono text-xs text-gray-600">{technique}</span>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-xs text-gray-500">
          {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className={clsx('mt-0.5 text-xs font-medium', {
          'text-yellow-400': alert.status === 'investigating',
          'text-gray-400': alert.status === 'open',
          'text-green-400': alert.status === 'resolved',
        })}>
          {alert.status}
        </p>
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const user = useAuthStore(s => s.user)

  const { data: risk, isLoading: riskLoading } = useRiskSummary()
  const { data: alertsData, isLoading: alertsLoading } = useAlerts({ status: ['open', 'investigating'], limit: 8 })
  const { data: mttd, isLoading: mttdLoading } = useMttdMetrics()
  const { data: connData, isLoading: connLoading } = useConnectors()
  const { data: pipeline } = usePipelineHealth()

  const alerts = alertsData?.data ?? []
  const connectors = connData?.data ?? []
  const openP1 = alerts.filter(alert => alert.priority === 'P1').length
  const healthyConn = connectors.filter((connector: any) => connector.isHealthy).length
  const hasDashboardData =
    alerts.length > 0 ||
    connectors.length > 0 ||
    (risk?.data?.postureScore ?? 0) > 0 ||
    (risk?.data?.openCriticalAlerts ?? 0) > 0 ||
    (risk?.data?.openHighAlerts ?? 0) > 0
  const showOnboardingCta = !riskLoading && !alertsLoading && !connLoading && !mttdLoading && !hasDashboardData

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <AppShell
      title="Executive Overview"
      actions={
        <div className="flex items-center gap-2">
          <div className={clsx(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            pipeline?.data?.overall === 'healthy'
              ? 'border-green-500/20 bg-green-500/10 text-green-400'
              : 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
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

        {showOnboardingCta ? (
          <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Tenant onboarding CTA</p>
                <h3 className="mt-2 text-lg font-semibold text-white">No live tenant data is flowing yet.</h3>
                <p className="mt-2 max-w-2xl text-sm text-gray-300">
                  {user?.onboardingStatus === 'completed'
                    ? 'Return to onboarding to review the recorded setup steps or connect the first environment placeholder again.'
                    : 'Finish the onboarding flow first, choose an environment placeholder, and then return here for the dashboard handoff.'}
                </p>
              </div>

              <Link
                to="/onboarding"
                className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                {user?.onboardingStatus === 'completed' ? 'Review onboarding' : 'Continue onboarding'}
              </Link>
            </div>
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            value={mttdLoading ? '—' : mttd?.data?.p50Minutes != null ? `${mttd.data.p50Minutes}m` : 'N/A'}
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
            iconColor={healthyConn === connectors.length ? 'bg-green-500/15 text-green-400' : 'bg-orange-500/15 text-orange-400'}
            href="/connectors"
            loading={connLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">Security Posture</h3>
                <Link to="/risk" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  Details <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex justify-center py-2">
                <PostureGauge score={risk?.data?.postureScore ?? 0} loading={riskLoading} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                  <p className="text-lg font-bold text-orange-400">{risk?.data?.openHighAlerts ?? '—'}</p>
                  <p className="mt-0.5 text-xs text-gray-500">High alerts</p>
                </div>
                <div className="rounded-lg bg-gray-800/60 px-3 py-2">
                  <p className="text-lg font-bold text-gray-200">{risk?.data?.avgUserRiskScore ?? '—'}</p>
                  <p className="mt-0.5 text-xs text-gray-500">Avg user risk</p>
                </div>
              </div>
            </div>

            <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Users className="mr-1.5 inline h-4 w-4 text-gray-500" />
                  Top Risk Users
                </h3>
                <Link to="/risk" className="text-xs text-blue-400 hover:underline">View all</Link>
              </div>
              {riskLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-gray-800" />
                      <div className="flex-1">
                        <div className="mb-1.5 h-3 w-28 animate-pulse rounded bg-gray-800" />
                        <div className="h-2 w-16 animate-pulse rounded bg-gray-800" />
                      </div>
                      <div className="h-6 w-10 animate-pulse rounded bg-gray-800" />
                    </div>
                  ))}
                </div>
              ) : (risk?.data?.topRiskUserIds ?? []).length > 0 ? (
                <div className="space-y-1">
                  {(risk?.data?.topRiskUserIds ?? []).slice(0, 5).map((userId: string, index: number) => (
                    <Link
                      key={userId}
                      to={`/risk?userId=${userId}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-800/60"
                    >
                      <div className={clsx(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                        index === 0 ? 'bg-red-500/20 text-red-400'
                          : index === 1 ? 'bg-orange-500/20 text-orange-400'
                            : 'bg-gray-700 text-gray-400',
                      )}>
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm text-gray-300">{userId.slice(0, 12)}…</p>
                        <p className="text-xs text-gray-600">User</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-green-500/40" />
                  <p className="text-sm text-gray-500">No high-risk users</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-1">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">Alert Trend (30 days)</h3>
                <Link to="/alerts" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  All alerts <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <AlertTrendChart height={180} />
            </div>

            <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">
                  <ShieldAlert className="mr-1.5 inline h-4 w-4 text-gray-500" />
                  Recent Alerts
                </h3>
                <Link to="/alerts" className="text-xs text-blue-400 hover:underline">View all</Link>
              </div>

              {alertsLoading ? (
                <div className="mt-3 space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="mt-2 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-gray-800" />
                      <div className="flex-1">
                        <div className="mb-1.5 h-3 w-full animate-pulse rounded bg-gray-800" />
                        <div className="h-2 w-24 animate-pulse rounded bg-gray-800" />
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
                  <CheckCircle2 className="mb-3 h-10 w-10 text-green-500/30" />
                  <p className="text-sm font-medium text-gray-400">No open alerts</p>
                  <p className="mt-1 text-xs text-gray-600">All clear — keep monitoring</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Activity className="mr-1.5 inline h-4 w-4 text-gray-500" />
                  Data Connectors
                </h3>
                <Link to="/connectors" className="text-xs text-blue-400 hover:underline">Manage</Link>
              </div>

              {connLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-gray-800" />
                      <div className="h-3 flex-1 animate-pulse rounded bg-gray-800" />
                      <div className="h-3 w-12 animate-pulse rounded bg-gray-800" />
                    </div>
                  ))}
                </div>
              ) : connectors.length > 0 ? (
                <div>
                  {connectors.slice(0, 5).map((connector: any) => (
                    <ConnectorStatusRow key={connector.id} connector={connector} />
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <WifiOff className="mx-auto mb-2 h-8 w-8 text-gray-700" />
                  <p className="text-sm text-gray-500">No connectors configured</p>
                  <Link to="/connectors" className="mt-2 inline-block text-xs text-blue-400 hover:underline">
                    Add connector →
                  </Link>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Clock className="mr-1.5 inline h-4 w-4 text-gray-500" />
                  Detection Time (MTTD)
                </h3>
              </div>
              {mttdLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="rounded-lg bg-gray-800/60 p-3 text-center">
                      <div className="mx-auto mb-1 h-6 w-10 animate-pulse rounded bg-gray-800" />
                      <div className="mx-auto h-2 w-8 animate-pulse rounded bg-gray-800" />
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
                      <p className="text-lg font-bold text-gray-100">{value != null ? `${value}m` : 'N/A'}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
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

            <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">
                  <Server className="mr-1.5 inline h-4 w-4 text-gray-500" />
                  Top Risk Assets
                </h3>
                <Link to="/risk?view=assets" className="text-xs text-blue-400 hover:underline">View all</Link>
              </div>
              {riskLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-lg bg-gray-800" />
                  ))}
                </div>
              ) : (risk?.data?.topRiskAssetIds ?? []).length > 0 ? (
                <div className="space-y-1">
                  {(risk?.data?.topRiskAssetIds ?? []).slice(0, 4).map((assetId: string, index: number) => (
                    <div key={assetId} className="flex items-center gap-3 rounded-lg py-2">
                      <div className={clsx(
                        'flex h-7 w-7 items-center justify-center rounded text-xs font-bold',
                        index === 0 ? 'bg-red-500/20 text-red-400'
                          : index === 1 ? 'bg-orange-500/20 text-orange-400'
                            : 'bg-gray-700 text-gray-400',
                      )}>
                        {index + 1}
                      </div>
                      <p className="flex-1 truncate font-mono text-sm text-gray-300">{assetId.slice(0, 12)}…</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-green-500/40" />
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
