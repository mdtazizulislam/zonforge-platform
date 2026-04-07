import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Filter, FolderInput, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, CardHeader, EmptyState, SkeletonRows } from '@/components/shared/ui'
import { useEvent, useEvents } from '@/hooks/queries'

type FilterState = {
  sourceType: string
  eventType: string
  startDate: string
  endDate: string
}

const EMPTY_FILTERS: FilterState = {
  sourceType: '',
  eventType: '',
  startDate: '',
  endDate: '',
}

function toApiDate(value: string) {
  return value ? new Date(value).toISOString() : undefined
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function severityVariant(value: string | null): 'critical' | 'high' | 'medium' | 'low' | 'info' | 'neutral' {
  const normalized = (value ?? '').toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  if (normalized === 'low') return 'low'
  if (normalized === 'info') return 'info'
  return 'neutral'
}

function titleize(value: string | null) {
  if (!value) return 'Unknown'
  return value.replace(/_/g, ' ')
}

export default function EventsPage() {
  const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [selectedEventId, setSelectedEventId] = useState<string>('')

  const eventsQuery = useEvents({
    page,
    limit: 20,
    sourceType: filters.sourceType || undefined,
    eventType: filters.eventType || undefined,
    startDate: toApiDate(filters.startDate),
    endDate: toApiDate(filters.endDate),
  })

  const items = eventsQuery.data?.data.items ?? []
  const total = eventsQuery.data?.data.total ?? 0
  const hasMore = eventsQuery.data?.data.hasMore ?? false

  useEffect(() => {
    if (items.length === 0) {
      setSelectedEventId('')
      return
    }

    const stillVisible = items.some((item) => item.id === selectedEventId)
    if (!stillVisible) {
      setSelectedEventId(items[0]!.id)
    }
  }, [items, selectedEventId])

  const eventDetailQuery = useEvent(selectedEventId)

  function applyFilters() {
    setPage(1)
    setFilters(draftFilters)
  }

  function clearFilters() {
    setPage(1)
    setDraftFilters(EMPTY_FILTERS)
    setFilters(EMPTY_FILTERS)
  }

  return (
    <AppShell
      title="Events"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => eventsQuery.refetch()}>
            Refresh
          </Button>
        </div>
      }
    >
      <PageContent className="space-y-6">
        <Card>
          <CardHeader
            title="Normalized Security Events"
            description="Tenant-scoped telemetry prepared for future detections and investigations."
            icon={Activity}
            actions={<Badge variant="neutral">{total} total</Badge>}
          />

          <div className="grid gap-3 md:grid-cols-5">
            <label className="md:col-span-1">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Source</span>
              <select
                value={draftFilters.sourceType}
                onChange={(event) => setDraftFilters((current) => ({ ...current, sourceType: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-blue-500"
              >
                <option value="">All sources</option>
                <option value="aws">AWS</option>
                <option value="microsoft365">Microsoft 365</option>
                <option value="google_workspace">Google Workspace</option>
              </select>
            </label>

            <label className="md:col-span-1">
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Event type</span>
              <input
                value={draftFilters.eventType}
                onChange={(event) => setDraftFilters((current) => ({ ...current, eventType: event.target.value }))}
                placeholder="signin_failure"
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-blue-500"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">Start</span>
              <input
                type="datetime-local"
                value={draftFilters.startDate}
                onChange={(event) => setDraftFilters((current) => ({ ...current, startDate: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-blue-500"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-gray-500">End</span>
              <input
                type="datetime-local"
                value={draftFilters.endDate}
                onChange={(event) => setDraftFilters((current) => ({ ...current, endDate: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-blue-500"
              />
            </label>

            <div className="flex items-end gap-2">
              <Button variant="primary" size="md" icon={Filter} onClick={applyFilters} className="flex-1">
                Apply
              </Button>
              <Button variant="ghost" size="md" icon={Search} onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-gray-200">Event stream</p>
                <p className="text-xs text-gray-500">Queued, normalized, and stored asynchronously.</p>
              </div>
              <Badge variant={items.length > 0 ? 'success' : 'neutral'}>{items.length} shown</Badge>
            </div>

            {eventsQuery.isLoading ? (
              <div className="p-4">
                <SkeletonRows count={6} cols={5} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={FolderInput}
                title="Connect a source and send your first event"
                description="No normalized events are available for this tenant yet."
                action={
                  <Link to="/connectors" className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-gray-600 hover:bg-gray-800">
                    Open connectors
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-800 text-sm">
                  <thead className="bg-gray-950/60 text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Source</th>
                      <th className="px-5 py-3">Event</th>
                      <th className="px-5 py-3">Actor</th>
                      <th className="px-5 py-3">Target</th>
                      <th className="px-5 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {items.map((item) => {
                      const selected = item.id === selectedEventId
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedEventId(item.id)}
                          className={selected ? 'bg-blue-500/10' : 'hover:bg-gray-800/50'}
                        >
                          <td className="px-5 py-4 align-top">
                            <div className="space-y-1">
                              <Badge variant="neutral">{titleize(item.sourceType)}</Badge>
                              {item.severity && <Badge variant={severityVariant(item.severity)}>{item.severity}</Badge>}
                            </div>
                          </td>
                          <td className="px-5 py-4 align-top">
                            <p className="font-medium text-gray-100">{titleize(item.canonicalEventType)}</p>
                            <p className="mt-1 text-xs text-gray-500">{item.sourceEventId ?? 'No source event id'}</p>
                          </td>
                          <td className="px-5 py-4 align-top text-gray-300">
                            <p>{item.actorEmail ?? 'Unknown actor'}</p>
                            <p className="mt-1 text-xs text-gray-500">{item.actorIp ?? 'No IP'}</p>
                          </td>
                          <td className="px-5 py-4 align-top text-gray-300">
                            {item.targetResource ?? 'Unknown target'}
                          </td>
                          <td className="px-5 py-4 align-top text-gray-400">
                            {formatDateTime(item.eventTime)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {items.length > 0 && (
              <div className="flex items-center justify-between border-t border-gray-800 px-5 py-4 text-sm text-gray-500">
                <span>Page {page}</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                    Previous
                  </Button>
                  <Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage((current) => current + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Event detail"
              description="Inspect the normalized payload and linked raw event for the selected row."
              icon={ShieldAlert}
            />

            {!selectedEventId ? (
              <EmptyState
                icon={Activity}
                title="No event selected"
                description="Choose a normalized event from the table to inspect its detail."
              />
            ) : eventDetailQuery.isLoading ? (
              <div className="space-y-4">
                <div className="h-6 animate-pulse rounded bg-gray-800" />
                <div className="h-28 animate-pulse rounded bg-gray-800" />
                <div className="h-40 animate-pulse rounded bg-gray-800" />
              </div>
            ) : eventDetailQuery.data?.data ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Canonical type</p>
                    <p className="mt-2 text-sm font-medium text-gray-100">{titleize(eventDetailQuery.data.data.canonicalEventType)}</p>
                    <p className="mt-1 text-xs text-gray-500">{eventDetailQuery.data.data.sourceType}</p>
                  </div>
                  <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Event time</p>
                    <p className="mt-2 text-sm font-medium text-gray-100">{formatDateTime(eventDetailQuery.data.data.eventTime)}</p>
                    <p className="mt-1 text-xs text-gray-500">Ingested {formatDateTime(eventDetailQuery.data.data.ingestedAt)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Normalized payload</p>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs leading-6 text-gray-300">
                    {JSON.stringify(eventDetailQuery.data.data.normalizedPayload, null, 2)}
                  </pre>
                </div>

                <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Raw payload</p>
                      <p className="mt-1 text-xs text-gray-500">Status: {eventDetailQuery.data.data.raw.status ?? 'unknown'}</p>
                    </div>
                    {eventDetailQuery.data.data.raw.errorMessage && (
                      <Badge variant="warning">{eventDetailQuery.data.data.raw.errorMessage}</Badge>
                    )}
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs leading-6 text-gray-300">
                    {JSON.stringify(eventDetailQuery.data.data.raw.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={ShieldAlert}
                title="Unable to load event detail"
                description="Refresh the page or select a different event."
              />
            )}
          </Card>
        </div>
      </PageContent>
    </AppShell>
  )
}