import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Search, Plus, Clock, AlertCircle, CheckCircle2, Loader2, FileText, Brain, ArrowRight } from 'lucide-react'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Button, Spinner, EmptyState, Skeleton, Card } from '@/components/shared/ui'
import { api, type AiInvestigation } from '@/lib/api'
import { useInvestigations, useInvestigationStats } from '@/hooks/queries'

const STATUS_META: Record<AiInvestigation['status'], { label: string; color: string; icon: React.ElementType }> = {
  queued: { label: 'Queued', color: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400', icon: Loader2 },
  completed: { label: 'Completed', color: 'border-green-500/20 bg-green-500/10 text-green-400', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'border-red-500/20 bg-red-500/10 text-red-400', icon: AlertCircle },
}

function InvestigationCard({ inv }: { inv: AiInvestigation }) {
  const meta = STATUS_META[inv.status]
  const StatusIcon = meta.icon

  return (
    <div className="space-y-3 rounded-xl border border-gray-700/50 bg-gray-800/40 p-5 transition-colors hover:border-gray-600">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-mono text-gray-600">ID: {inv.id.slice(0, 16)}…</p>
          <p className="text-sm font-medium text-gray-300">
            Alert: <span className="font-mono text-blue-400">{inv.alertId}</span>
          </p>
        </div>
        <span className={clsx('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', meta.color)}>
          <StatusIcon className={clsx('h-3 w-3', inv.status === 'queued' && 'animate-spin')} />
          {meta.label}
        </span>
      </div>

      {inv.summary && <p className="line-clamp-4 text-sm leading-relaxed text-gray-400">{inv.summary}</p>}

      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <Clock className="h-3 w-3" />
        {new Date(inv.createdAt).toLocaleString()}
      </div>
    </div>
  )
}

export default function InvestigationsPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const requestedAlertId = searchParams.get('alertId')?.trim() ?? ''
  const requestedStart = searchParams.get('start') === '1'

  const [alertId, setAlertId] = useState(requestedAlertId)
  const [context, setContext] = useState('')
  const [showForm, setShowForm] = useState(requestedStart || requestedAlertId.length > 0)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (requestedAlertId) {
      setAlertId(requestedAlertId)
      setShowForm(true)
    }
  }, [requestedAlertId])

  useEffect(() => {
    if (requestedStart) {
      setShowForm(true)
    }
  }, [requestedStart])

  const { data, isLoading, error } = useInvestigations(20)
  const { data: statsData } = useInvestigationStats()

  const { mutate: createInvestigation, isPending: creating } = useMutation({
    mutationFn: () => api.ai.createInvestigation(alertId.trim(), context.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'investigations'] })
      setAlertId('')
      setContext('')
      setShowForm(false)
      setFormError(null)
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Failed to create investigation')
    },
  })

  function handleCreate() {
    if (!alertId.trim()) {
      setFormError('Alert ID is required')
      return
    }
    setFormError(null)
    createInvestigation()
  }

  const investigations: AiInvestigation[] = data?.data ?? []
  const stats = statsData?.data

  return (
    <AppShell
      title="Investigations"
      actions={
        <div className="flex items-center gap-2">
          <Link to="/ai-soc-analyst" className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100">
            <Brain className="h-3.5 w-3.5" />
            Analyst View
          </Link>
          <Button variant="primary" size="sm" onClick={() => { setShowForm(v => !v); setFormError(null) }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Start Investigation
          </Button>
        </div>
      }
    >
      <PageContent>
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15">
              <Search className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-100">AI Investigations</h1>
              <p className="text-sm text-gray-500">Live investigation queue, status, and summaries from the SOC analyst service</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Total', value: stats?.totalInvestigations ?? investigations.length, tone: 'text-gray-100' },
              { label: 'True Positives', value: stats?.truePositives ?? '—', tone: 'text-red-400' },
              { label: 'False Positives', value: stats?.falsePositives ?? '—', tone: 'text-green-400' },
              { label: 'Pending Review', value: stats?.pendingReview ?? investigations.filter(inv => inv.status === 'awaiting_approval').length, tone: 'text-yellow-400' },
            ].map((item) => (
              <Card key={item.label} className="border-gray-800/80 bg-gray-900/70">
                <p className={clsx('text-2xl font-bold tabular-nums', item.tone)}>{item.value}</p>
                <p className="mt-1 text-xs text-gray-500">{item.label}</p>
              </Card>
            ))}
          </div>

          {showForm && (
            <div className="space-y-4 rounded-xl border border-gray-700 bg-gray-800/50 p-5">
              <p className="text-sm font-semibold text-gray-300">Start New Investigation</p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Alert ID *</label>
                <input
                  value={alertId}
                  onChange={e => setAlertId(e.target.value)}
                  placeholder="e.g. ALT-00001"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">
                  Additional Context <span className="text-gray-700">(optional)</span>
                </label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  rows={3}
                  placeholder="Describe what you want the AI to focus on…"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500"
                />
              </div>

              {formError && (
                <p className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {formError}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="primary" size="sm" onClick={handleCreate} disabled={creating}>
                  {creating ? <Spinner size="sm" /> : <><Plus className="mr-1.5 h-4 w-4" />Create</>}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Link to="/alerts" className="ml-auto inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline">
                  Open Alert Center <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Failed to load investigations.
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-gray-700/50 bg-gray-800/40 p-5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : investigations.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No investigations yet"
              description="Create an investigation to get an AI-generated deep dive into an alert."
            />
          ) : (
            <div className="space-y-4">
              {investigations.map(inv => (
                <InvestigationCard key={inv.id} inv={inv} />
              ))}
            </div>
          )}
        </div>
      </PageContent>
    </AppShell>
  )
}