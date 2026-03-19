import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAlerts, useUpdateAlertStatus } from '@/hooks/queries'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { useUiStore } from '@/stores/auth.store'
import {
  ShieldAlert, Filter, ChevronDown, RefreshCw,
  ArrowRight, Clock, Tag,
} from 'lucide-react'

const SEVERITY_OPTIONS  = ['critical', 'high', 'medium', 'low']
const STATUS_OPTIONS    = ['open', 'investigating', 'resolved', 'false_positive', 'suppressed']
const PRIORITY_OPTIONS  = ['P1', 'P2', 'P3', 'P4']

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', color)}>
      {children}
    </span>
  )
}

function severityColor(sev: string) {
  return {
    critical: 'bg-red-500/15 text-red-400',
    high:     'bg-orange-500/15 text-orange-400',
    medium:   'bg-yellow-500/15 text-yellow-400',
    low:      'bg-blue-500/15 text-blue-400',
    info:     'bg-gray-700 text-gray-400',
  }[sev] ?? 'bg-gray-700 text-gray-400'
}

function statusColor(status: string) {
  return {
    open:          'bg-red-500/10 text-red-400',
    investigating: 'bg-yellow-500/10 text-yellow-400',
    resolved:      'bg-green-500/10 text-green-400',
    false_positive:'bg-gray-700 text-gray-500',
    suppressed:    'bg-gray-700 text-gray-500',
  }[status] ?? 'bg-gray-700 text-gray-400'
}

function priorityDot(p: string) {
  return { P1: 'bg-red-500', P2: 'bg-orange-500', P3: 'bg-yellow-500', P4: 'bg-blue-500' }[p] ?? 'bg-gray-500'
}

export default function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { alertFilters, setAlertFilter, clearAlertFilters } = useUiStore()

  // Merge URL params with store filters
  const urlPriority = searchParams.get('priority')
  const effectiveFilters = {
    ...alertFilters,
    priority: urlPriority ? [urlPriority] : alertFilters.priority,
  }

  const { data, isLoading, refetch, isFetching } = useAlerts({
    severity: effectiveFilters.severity,
    status:   effectiveFilters.status,
    priority: effectiveFilters.priority,
    limit:    100,
  })

  const { mutate: updateStatus, isPending: updating } = useUpdateAlertStatus()
  const alerts = data?.data ?? []

  // Filter toggle helpers
  function toggleFilter(key: 'severity' | 'status' | 'priority', value: string) {
    const current = key === 'priority' ? effectiveFilters.priority : alertFilters[key]
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]

    if (key === 'priority') {
      setSearchParams(next.length ? { priority: next[0]! } : {})
    } else {
      setAlertFilter(key, next)
    }
  }

  const activeFilterCount =
    effectiveFilters.severity.length +
    effectiveFilters.priority.length +
    (effectiveFilters.status.length > 0 &&
     !(effectiveFilters.status.length === 2 &&
       effectiveFilters.status.includes('open') &&
       effectiveFilters.status.includes('investigating'))
      ? effectiveFilters.status.length : 0)

  return (
    <AppShell
      title="Alert Center"
      actions={
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                     text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className={clsx('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      }
    >
      <PageContent>

        {/* ── Filter bar ─────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-xl
                        border border-gray-800 bg-gray-900">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Filter className="h-4 w-4" />
            <span className="font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full
                               bg-blue-500 text-xs text-white font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Severity */}
            <div className="flex items-center gap-1">
              {SEVERITY_OPTIONS.map(sev => (
                <button
                  key={sev}
                  onClick={() => toggleFilter('severity', sev)}
                  className={clsx(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                    effectiveFilters.severity.includes(sev)
                      ? `${severityColor(sev)} border-transparent`
                      : 'text-gray-500 border-gray-700 hover:border-gray-600',
                  )}
                >
                  {sev}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-gray-700 self-center" />

            {/* Priority */}
            <div className="flex items-center gap-1">
              {PRIORITY_OPTIONS.map(p => (
                <button
                  key={p}
                  onClick={() => toggleFilter('priority', p)}
                  className={clsx(
                    'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                    effectiveFilters.priority.includes(p)
                      ? 'bg-gray-700 text-white border-gray-600'
                      : 'text-gray-500 border-gray-700 hover:border-gray-600',
                  )}
                >
                  <span className={clsx('h-1.5 w-1.5 rounded-full', priorityDot(p))} />
                  {p}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-gray-700 self-center" />

            {/* Status */}
            <div className="flex items-center gap-1">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleFilter('status', s)}
                  className={clsx(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-all capitalize',
                    effectiveFilters.status.includes(s)
                      ? `${statusColor(s)} border-transparent`
                      : 'text-gray-500 border-gray-700 hover:border-gray-600',
                  )}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={() => { clearAlertFilters(); setSearchParams({}) }}
              className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* ── Results summary ────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            {isLoading ? 'Loading…' : `${alerts.length} alerts`}
          </p>
        </div>

        {/* ── Alert table ─────────────────────────── */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-800">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <div className="h-2 w-2 rounded-full bg-gray-800 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-gray-800 animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-gray-800 animate-pulse" />
                  </div>
                  <div className="h-5 w-16 rounded-full bg-gray-800 animate-pulse" />
                </div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldAlert className="h-10 w-10 text-gray-700 mb-3" />
              <p className="text-gray-400 font-medium">No alerts match the current filters</p>
              <p className="text-sm text-gray-600 mt-1">Try adjusting filters or refreshing</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium
                              text-gray-500 uppercase tracking-wider bg-gray-800/40">
                <div className="col-span-1 flex items-center gap-1">Pri</div>
                <div className="col-span-5">Title</div>
                <div className="col-span-2">Severity</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2 text-right">Time</div>
              </div>

              {/* Rows */}
              {alerts.map((alert: any) => (
                <Link
                  key={alert.id}
                  to={`/alerts/${alert.id}`}
                  className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center
                             hover:bg-gray-800/50 transition-colors group"
                >
                  <div className="col-span-1 flex items-center">
                    <div className={clsx('h-2 w-2 rounded-full', priorityDot(alert.priority))} />
                    <span className="ml-2 text-xs text-gray-500">{alert.priority}</span>
                  </div>

                  <div className="col-span-5 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate
                                  group-hover:text-white transition-colors">
                      {alert.title}
                    </p>
                    {alert.mitreTechniques?.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Tag className="h-3 w-3 text-gray-600" />
                        <span className="text-xs text-gray-600 font-mono">
                          {alert.mitreTechniques.slice(0, 2).join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="col-span-2">
                    <Badge color={severityColor(alert.severity)}>
                      {alert.severity}
                    </Badge>
                    {alert.mttdSlaBreached && (
                      <span className="ml-1.5 text-xs text-red-500 font-medium">SLA!</span>
                    )}
                  </div>

                  <div className="col-span-2">
                    <Badge color={statusColor(alert.status)}>
                      {alert.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-1.5">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">
                        {new Date(alert.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(alert.createdAt).toLocaleTimeString([], {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-gray-600
                                          group-hover:text-gray-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </PageContent>
    </AppShell>
  )
}
