import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { Link, useParams } from 'react-router-dom'
import { useAlerts } from '@/hooks/queries'
import { Badge, Skeleton } from '@/components/shared/ui'
import {
  ShieldAlert, Clock, User, Tag, ChevronDown,
  ChevronUp, Wifi, WifiOff, Filter,
} from 'lucide-react'

// ─────────────────────────────────────────────
// ALERT QUEUE PANEL
//
// Left sidebar in Analyst Alert Center.
// Groups alerts by priority with collapsible sections.
// Highlights the currently selected alert.
// Auto-refreshes every 30 seconds.
// ─────────────────────────────────────────────

interface AlertQueueItem {
  id:       string
  title:    string
  severity: string
  priority: string
  status:   string
  affectedUserId?: string | null
  affectedIp?:     string | null
  mitreTechniques: string[]
  detectionGapMinutes?: number | null
  mttdSlaBreached: boolean
  createdAt: string
}

const PRIORITY_LABELS: Record<string, string> = {
  P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low',
}

const PRIORITY_ORDER = ['P1', 'P2', 'P3', 'P4']

interface AlertQueuePanelProps {
  onSelectAlert?: (alertId: string) => void
}

export function AlertQueuePanel({ onSelectAlert }: AlertQueuePanelProps) {
  const { id: selectedId } = useParams<{ id?: string }>()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showResolved, setShowResolved] = useState(false)

  const { data, isLoading, isFetching, dataUpdatedAt } = useAlerts({
    status:  showResolved
      ? ['open', 'investigating', 'resolved']
      : ['open', 'investigating'],
    limit:   200,
  })

  const alerts: AlertQueueItem[] = data?.data ?? []

  // Group by priority
  const grouped = useMemo(() => {
    const groups: Record<string, AlertQueueItem[]> = {}
    for (const p of PRIORITY_ORDER) groups[p] = []
    for (const a of alerts) {
      groups[a.priority]?.push(a)
    }
    return groups
  }, [alerts])

  function toggleCollapse(priority: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(priority) ? next.delete(priority) : next.add(priority)
      return next
    })
  }

  const totalOpen = alerts.filter(a => a.status === 'open').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-200">Alert Queue</span>
          {totalOpen > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full
                             bg-red-500 text-xs font-bold text-white px-1">
              {totalOpen > 99 ? '99+' : totalOpen}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFetching && (
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          )}
          <button
            onClick={() => setShowResolved(v => !v)}
            className={clsx(
              'text-xs transition-colors',
              showResolved ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400',
            )}
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
        </div>
      </div>

      {/* Last updated */}
      {dataUpdatedAt > 0 && (
        <div className="px-4 py-1.5 border-b border-gray-800/50">
          <p className="text-xs text-gray-700">
            Updated {new Date(dataUpdatedAt).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            })}
          </p>
        </div>
      )}

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className={clsx('h-16 w-full', i % 3 === 0 && 'h-5 mt-4')} />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="rounded-full bg-green-500/10 p-4 mb-3">
              <ShieldAlert className="h-6 w-6 text-green-500/60" />
            </div>
            <p className="text-sm font-medium text-gray-400">Queue is clear</p>
            <p className="text-xs text-gray-600 mt-1">No open alerts right now</p>
          </div>
        ) : (
          PRIORITY_ORDER.map(priority => {
            const items = grouped[priority] ?? []
            if (items.length === 0) return null
            const isCollapsed = collapsed.has(priority)

            return (
              <div key={priority}>
                {/* Group header */}
                <button
                  onClick={() => toggleCollapse(priority)}
                  className="w-full flex items-center justify-between px-4 py-2
                             bg-gray-900/80 hover:bg-gray-800/60 border-b border-gray-800
                             transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={priority as any} size="xs">
                      {priority}
                    </Badge>
                    <span className="text-xs font-medium text-gray-400">
                      {PRIORITY_LABELS[priority]}
                    </span>
                    <span className="text-xs text-gray-600">({items.length})</span>
                  </div>
                  {isCollapsed
                    ? <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
                    : <ChevronUp   className="h-3.5 w-3.5 text-gray-600" />}
                </button>

                {/* Alert items */}
                {!isCollapsed && items.map(alert => (
                  <Link
                    key={alert.id}
                    to={`/alerts/${alert.id}`}
                    onClick={() => onSelectAlert?.(alert.id)}
                    className={clsx(
                      'block border-b border-gray-800/60 px-4 py-3 transition-colors',
                      alert.id === selectedId
                        ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                        : 'hover:bg-gray-800/50',
                    )}
                  >
                    {/* Title row */}
                    <div className="flex items-start gap-2">
                      <div className={clsx(
                        'mt-1 flex-shrink-0 h-1.5 w-1.5 rounded-full',
                        alert.status === 'open'          ? 'bg-red-400'
                        : alert.status === 'investigating' ? 'bg-yellow-400 animate-pulse'
                        : 'bg-green-400',
                      )} />
                      <p className={clsx(
                        'text-sm leading-snug line-clamp-2 min-w-0',
                        alert.id === selectedId ? 'text-white font-medium' : 'text-gray-300',
                      )}>
                        {alert.title}
                      </p>
                    </div>

                    {/* Meta row */}
                    <div className="mt-1.5 ml-3.5 flex items-center gap-2 flex-wrap">
                      <Badge variant={alert.severity as any} size="xs">
                        {alert.severity}
                      </Badge>

                      {alert.mttdSlaBreached && (
                        <span className="text-xs text-red-400 font-medium">SLA!</span>
                      )}

                      {alert.affectedUserId && (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <User className="h-3 w-3" />
                          {alert.affectedUserId.slice(0, 8)}…
                        </span>
                      )}

                      {alert.affectedIp && !alert.affectedUserId && (
                        <span className="flex items-center gap-1 text-xs text-gray-600 font-mono">
                          {alert.affectedIp}
                        </span>
                      )}

                      <span className="ml-auto flex items-center gap-1 text-xs text-gray-700">
                        <Clock className="h-2.5 w-2.5" />
                        {formatRelativeTime(alert.createdAt)}
                      </span>
                    </div>

                    {/* MITRE tags */}
                    {alert.mitreTechniques?.length > 0 && (
                      <div className="mt-1.5 ml-3.5 flex items-center gap-1">
                        <Tag className="h-3 w-3 text-gray-700 flex-shrink-0" />
                        <span className="text-xs text-gray-700 font-mono truncate">
                          {alert.mitreTechniques.slice(0, 2).join(' · ')}
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Footer stats */}
      <div className="border-t border-gray-800 px-4 py-2.5 bg-gray-900/50">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Open',  count: alerts.filter(a => a.status === 'open').length,          color: 'text-red-400' },
            { label: 'Active', count: alerts.filter(a => a.status === 'investigating').length, color: 'text-yellow-400' },
            { label: 'SLA',   count: alerts.filter(a => a.mttdSlaBreached).length,            color: 'text-orange-400' },
          ].map(({ label, count, color }) => (
            <div key={label}>
              <p className={clsx('text-sm font-bold tabular-nums', count > 0 ? color : 'text-gray-600')}>
                {count}
              </p>
              <p className="text-xs text-gray-700">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Helper ────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const delta = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(delta / 60_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs   < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
