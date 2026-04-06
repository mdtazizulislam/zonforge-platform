import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import { buildAppUrl } from '@/lib/runtime-config'
import {
  Users, ShieldAlert, TrendingUp, Server, Globe,
  AlertTriangle, CheckCircle2, XCircle, Search,
  RefreshCw, ExternalLink, ChevronRight, DollarSign,
  Building2, Activity, Filter, MoreHorizontal,
  Eye, Ban, Settings, Zap, Clock,
} from 'lucide-react'

// ─────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

async function fetchMsspOverview() {
  const r = await fetch('/api/v1/mssp/overview', { headers: authHeader() })
  return r.json()
}

async function fetchMsspTenants(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  const r = await fetch(`/api/v1/mssp/tenants${params}`, { headers: authHeader() })
  return r.json()
}

async function fetchMsspAlerts() {
  const r = await fetch('/api/v1/mssp/alerts?limit=30', { headers: authHeader() })
  return r.json()
}

async function fetchRevenue() {
  const r = await fetch('/api/v1/mssp/revenue', { headers: authHeader() })
  return r.json()
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const planColors: Record<string, string> = {
  starter:    'bg-gray-700 text-gray-300',
  growth:     'bg-blue-500/15 text-blue-400',
  business:   'bg-purple-500/15 text-purple-400',
  enterprise: 'bg-amber-500/15 text-amber-400',
  mssp:       'bg-green-500/15 text-green-400',
}

const statusColors: Record<string, string> = {
  active:    'bg-green-500/10 text-green-400',
  trial:     'bg-blue-500/10 text-blue-400',
  suspended: 'bg-red-500/10 text-red-400',
  cancelled: 'bg-gray-700 text-gray-500',
}

function formatMrr(cents: number) {
  if (cents === 0) return 'Free'
  return `$${Math.floor(cents / 100).toLocaleString()}/mo`
}

function PostureBar({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#3b82f6' : score >= 40 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right"
        style={{ color }}>{score}</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// TENANT ROW
// ─────────────────────────────────────────────

function TenantRow({
  tenant, onImpersonate, onSuspend, onViewDetail,
}: {
  tenant: any
  onImpersonate: (id: string) => void
  onSuspend:     (id: string) => void
  onViewDetail:  (id: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="grid grid-cols-12 gap-4 px-5 py-3.5 items-center
                    hover:bg-gray-800/30 transition-colors group border-b border-gray-800/50">
      {/* Name + plan */}
      <div className="col-span-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gray-800 flex items-center justify-center
                          text-xs font-bold text-gray-400 flex-shrink-0">
            {tenant.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{tenant.name}</p>
            <p className="text-xs text-gray-600 font-mono truncate">{tenant.slug}</p>
          </div>
        </div>
      </div>

      {/* Plan + status */}
      <div className="col-span-2 flex items-center gap-2 flex-wrap">
        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize',
          planColors[tenant.planTier] ?? 'bg-gray-700 text-gray-400')}>
          {tenant.planTier}
        </span>
        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium capitalize',
          statusColors[tenant.status] ?? 'bg-gray-700 text-gray-400')}>
          {tenant.status}
        </span>
      </div>

      {/* Posture */}
      <div className="col-span-2">
        <PostureBar score={tenant.postureScore ?? 75} />
      </div>

      {/* Alerts */}
      <div className="col-span-2 flex items-center gap-2">
        {(tenant.openCritical ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                           text-xs font-bold bg-red-500/15 text-red-400">
            <AlertTriangle className="h-3 w-3" />
            {tenant.openCritical}
          </span>
        )}
        {(tenant.openHigh ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                           text-xs font-bold bg-orange-500/15 text-orange-400">
            {tenant.openHigh}H
          </span>
        )}
        {!tenant.openCritical && !tenant.openHigh && (
          <span className="text-xs text-gray-600">Clean</span>
        )}
      </div>

      {/* MRR */}
      <div className="col-span-2 text-right">
        <p className="text-sm font-bold text-gray-300 tabular-nums">
          {formatMrr(tenant.mrr ?? 0)}
        </p>
        <p className="text-xs text-gray-600">
          {new Date(tenant.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Actions */}
      <div className="col-span-1 flex items-center justify-end">
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-gray-800
                       transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 w-44 bg-gray-900 border border-gray-700
                            rounded-xl shadow-2xl overflow-hidden">
              <button onClick={() => { onViewDetail(tenant.id); setMenuOpen(false) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300
                           hover:bg-gray-800 transition-colors">
                <Eye className="h-3.5 w-3.5" /> View Details
              </button>
              <button onClick={() => { onImpersonate(tenant.id); setMenuOpen(false) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300
                           hover:bg-gray-800 transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Impersonate
              </button>
              <div className="h-px bg-gray-800" />
              <button onClick={() => { onSuspend(tenant.id); setMenuOpen(false) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400
                           hover:bg-red-500/10 transition-colors">
                <Ban className="h-3.5 w-3.5" /> Suspend
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// REVENUE CHART (simple horizontal bars)
// ─────────────────────────────────────────────

function RevenuePlanBreakdown({ byPlan }: { byPlan: Record<string, { count: number; mrr: number }> }) {
  const entries = Object.entries(byPlan).sort(([, a], [, b]) => b.mrr - a.mrr)
  const maxMrr  = Math.max(...entries.map(([, v]) => v.mrr), 1)

  return (
    <div className="space-y-3">
      {entries.map(([plan, data]) => (
        <div key={plan}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={clsx('px-2 py-0.5 rounded text-xs font-medium capitalize',
                planColors[plan] ?? 'bg-gray-700 text-gray-400')}>
                {plan}
              </span>
              <span className="text-xs text-gray-500">{data.count} tenant{data.count !== 1 ? 's' : ''}</span>
            </div>
            <span className="text-sm font-bold text-gray-200 tabular-nums">
              {formatMrr(data.mrr)}
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-blue-500/60 transition-all duration-700"
              style={{ width: `${(data.mrr / maxMrr) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// MSSP PAGE
// ─────────────────────────────────────────────

export default function MsspPage() {
  const [search,      setSearch]      = useState('')
  const [activeTab,   setActiveTab]   = useState<'tenants' | 'alerts' | 'revenue'>('tenants')
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  const qc = useQueryClient()

  const { data: overview,  isLoading: ovLoading }  = useQuery({
    queryKey: ['mssp', 'overview'],
    queryFn:  fetchMsspOverview,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
  const { data: tenants,   isLoading: tenLoading, refetch } = useQuery({
    queryKey: ['mssp', 'tenants', search],
    queryFn:  () => fetchMsspTenants(search || undefined),
    staleTime: 60_000,
  })
  const { data: alertData, isLoading: alertLoading } = useQuery({
    queryKey: ['mssp', 'alerts'],
    queryFn:  fetchMsspAlerts,
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: activeTab === 'alerts',
  })
  const { data: revenueData } = useQuery({
    queryKey: ['mssp', 'revenue'],
    queryFn:  fetchRevenue,
    staleTime: 10 * 60_000,
    enabled: activeTab === 'revenue',
  })

  const ov       = overview?.data
  const tenList  = tenants?.data  ?? []
  const alerts   = alertData?.data ?? []
  const revenue  = revenueData?.data

  async function handleImpersonate(tenantId: string) {
    setImpersonating(tenantId)
    try {
      const r    = await fetch(`/api/v1/mssp/tenants/${tenantId}/impersonate`, {
        method: 'POST', headers: authHeader(),
      })
      const data = await r.json()
      if (data.data?.token) {
        // Open tenant dashboard in new tab with impersonation token
        const url = buildAppUrl(`/dashboard?impersonate=${data.data.token}`)
        window.open(url, '_blank')
      }
    } finally {
      setImpersonating(null)
    }
  }

  async function handleSuspend(tenantId: string) {
    if (!confirm('Suspend this tenant? All active sessions will be terminated.')) return
    await fetch('/api/v1/mssp/tenants/bulk-suspend', {
      method:  'POST',
      headers: authHeader(),
      body:    JSON.stringify({ tenantIds: [tenantId], reason: 'Suspended by MSSP admin' }),
    })
    qc.invalidateQueries({ queryKey: ['mssp'] })
  }

  return (
    <AppShell
      title="MSSP Console"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                          bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Building2 className="h-3.5 w-3.5" />
            PLATFORM_ADMIN
          </div>
          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={() => qc.invalidateQueries({ queryKey: ['mssp'] })}>
            Refresh
          </Button>
        </div>
      }
    >
      <PageContent>

        {/* ── KPI summary ──────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Tenants',    value: ov?.totalTenants,     icon: Building2,   color: 'text-gray-200' },
            { label: 'Active',           value: ov?.activeTenants,    icon: CheckCircle2, color: 'text-green-400' },
            { label: 'Trial',            value: ov?.trialTenants,     icon: Clock,       color: 'text-blue-400' },
            { label: 'Open Critical',    value: ov?.totalOpenCritical, icon: AlertTriangle, color: (ov?.totalOpenCritical ?? 0) > 0 ? 'text-red-400' : 'text-gray-400' },
            { label: 'Total MRR',        value: ov ? formatMrr(ov.totalMrr) : '—', icon: DollarSign, color: 'text-green-400' },
          ].map(k => (
            <Card key={k.label} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <k.icon className="h-4 w-4 text-gray-600" />
                <span className="text-xs text-gray-500">{k.label}</span>
              </div>
              {ovLoading
                ? <div className="h-7 w-16 rounded bg-gray-800 animate-pulse" />
                : <p className={clsx('text-2xl font-bold tabular-nums', k.color)}>
                    {k.value ?? '—'}
                  </p>}
            </Card>
          ))}
        </div>

        {/* ── Tabs ────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-gray-800 mb-5">
          {[
            { id: 'tenants', label: 'Tenants', icon: Building2, count: ov?.totalTenants },
            { id: 'alerts',  label: 'Cross-Tenant Alerts', icon: ShieldAlert, count: ov?.totalOpenCritical },
            { id: 'revenue', label: 'Revenue', icon: DollarSign, count: null },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                activeTab === t.id
                  ? 'text-blue-400 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300',
              )}>
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={clsx('text-xs px-1.5 rounded-full font-bold',
                  t.id === 'alerts' && t.count > 0 ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-400')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TENANTS TAB ─────────────────────── */}
        {activeTab === 'tenants' && (
          <div>
            {/* Search */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                <input
                  type="text"
                  placeholder="Search tenants…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-700 bg-gray-800
                             text-sm text-gray-200 placeholder-gray-600
                             focus:outline-none focus:border-blue-500"
                />
              </div>
              <span className="text-sm text-gray-500">
                {tenList.length} tenants
              </span>
            </div>

            {/* Table */}
            <Card padding="none">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-5 py-2.5 text-xs font-medium text-gray-500
                              uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <div className="col-span-3">Tenant</div>
                <div className="col-span-2">Plan / Status</div>
                <div className="col-span-2">Posture</div>
                <div className="col-span-2">Alerts</div>
                <div className="col-span-2 text-right">MRR</div>
                <div className="col-span-1"></div>
              </div>

              {tenLoading ? (
                <div className="divide-y divide-gray-800">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4">
                      <div className="h-7 w-7 rounded-lg bg-gray-800 animate-pulse" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-40 rounded bg-gray-800 animate-pulse" />
                        <div className="h-2 w-24 rounded bg-gray-800 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : tenList.length === 0 ? (
                <EmptyState icon={Building2} title="No tenants found"
                  description="No tenants match your search." />
              ) : (
                tenList.map((t: any) => (
                  <TenantRow
                    key={t.id}
                    tenant={t}
                    onImpersonate={handleImpersonate}
                    onSuspend={handleSuspend}
                    onViewDetail={setSelectedId}
                  />
                ))
              )}
            </Card>
          </div>
        )}

        {/* ── ALERTS TAB ──────────────────────── */}
        {activeTab === 'alerts' && (
          <div>
            <Card padding="none">
              <div className="grid grid-cols-12 gap-4 px-5 py-2.5 text-xs font-medium text-gray-500
                              uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
                <div className="col-span-2">Tenant</div>
                <div className="col-span-5">Alert</div>
                <div className="col-span-2">Severity</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1 text-right">Time</div>
              </div>

              {alertLoading ? (
                <div className="divide-y divide-gray-800">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex gap-4 p-4">
                      <div className="h-3 w-24 rounded bg-gray-800 animate-pulse" />
                      <div className="flex-1 h-3 rounded bg-gray-800 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : alerts.length === 0 ? (
                <EmptyState icon={ShieldAlert} title="No critical alerts"
                  description="No P1/P2 open alerts across any tenant." />
              ) : (
                <div className="divide-y divide-gray-800/60">
                  {alerts.map((a: any) => (
                    <div key={a.id}
                      className="grid grid-cols-12 gap-4 px-5 py-3 items-center hover:bg-gray-800/30">
                      <div className="col-span-2">
                        <span className="text-xs font-medium text-gray-400 truncate block">
                          {a.tenantName}
                        </span>
                      </div>
                      <div className="col-span-5 min-w-0">
                        <p className="text-sm text-gray-200 truncate">{a.title}</p>
                        {a.mttdSlaBreached && (
                          <span className="text-xs text-red-400 font-medium">SLA Breach</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <Badge variant={a.severity as any} size="xs">{a.severity}</Badge>
                      </div>
                      <div className="col-span-2">
                        <Badge variant={a.priority as any} size="xs">{a.priority}</Badge>
                      </div>
                      <div className="col-span-1 text-right">
                        <span className="text-xs text-gray-500">
                          {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── REVENUE TAB ─────────────────────── */}
        {activeTab === 'revenue' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* MRR KPIs */}
            <div className="space-y-4">
              {[
                { label: 'Monthly Recurring Revenue', value: revenue ? formatMrr(revenue.totalMrr) : '—', color: 'text-green-400' },
                { label: 'Annual Run Rate',           value: revenue ? `$${Math.floor((revenue.totalArr ?? 0) / 100).toLocaleString()}/yr` : '—', color: 'text-blue-400' },
                { label: 'New Tenants (30d)',          value: revenue?.newThisPeriod ?? '—', color: 'text-gray-200' },
                { label: 'Churned (30d)',              value: revenue?.churnedThisPeriod ?? '—', color: (revenue?.churnedThisPeriod ?? 0) > 0 ? 'text-red-400' : 'text-gray-400' },
              ].map(k => (
                <Card key={k.label} className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">{k.label}</span>
                  <span className={clsx('text-2xl font-bold tabular-nums', k.color)}>
                    {k.value}
                  </span>
                </Card>
              ))}
            </div>

            {/* Plan breakdown */}
            <div className="lg:col-span-2">
              <Card>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-500" />
                    MRR by Plan
                  </h3>
                  <span className="text-xs text-gray-600">
                    Total: {revenue ? formatMrr(revenue.totalMrr) : '—'}
                  </span>
                </div>

                {revenue?.byPlan
                  ? <RevenuePlanBreakdown byPlan={revenue.byPlan} />
                  : <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-8 rounded bg-gray-800 animate-pulse" />
                      ))}
                    </div>
                }

                {/* Plan distribution */}
                {ov?.tenantsByPlan && (
                  <div className="mt-5 pt-4 border-t border-gray-800">
                    <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Tenant Distribution</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Object.entries(ov.tenantsByPlan).map(([plan, count]) => (
                        <div key={plan}
                          className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium',
                            planColors[plan] ?? 'bg-gray-700 text-gray-400')}>
                          <span className="capitalize">{plan}</span>
                          <span className="font-bold">{count as number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

      </PageContent>
    </AppShell>
  )
}
