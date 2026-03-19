import { useState } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Brain, CheckCircle2, XCircle, AlertTriangle, Clock, Play,
  ChevronDown, ChevronUp, RefreshCw, Shield, Search,
  User, Globe, Target, FileText, Wrench, Eye,
  TrendingUp, ArrowRight, Cpu, MessageSquare,
} from 'lucide-react'

// ─────────────────────────────────────────────
const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

const VERDICT_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  true_positive:        { label: 'TRUE POSITIVE',     color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',    icon: AlertTriangle },
  false_positive:       { label: 'FALSE POSITIVE',    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20', icon: CheckCircle2 },
  true_positive_benign: { label: 'AUTHORIZED',        color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', icon: Shield },
  insufficient_evidence:{ label: 'INSUFFICIENT',      color: 'text-gray-400',   bg: 'bg-gray-800 border-gray-700',        icon: Eye },
  escalate:             { label: 'ESCALATE',          color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', icon: ArrowRight },
}

const STATUS_STYLE: Record<string, string> = {
  queued:           'bg-gray-700 text-gray-400',
  investigating:    'bg-blue-500/10 text-blue-400 animate-pulse',
  awaiting_approval:'bg-yellow-500/10 text-yellow-400',
  completed:        'bg-green-500/10 text-green-400',
  failed:           'bg-red-500/10 text-red-400',
}

const THOUGHT_ICON: Record<string, React.ElementType> = {
  hypothesis: Brain, tool_call: Wrench, observation: Eye,
  reasoning: MessageSquare, conclusion: CheckCircle2,
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const color = confidence >= 85 ? '#22c55e' : confidence >= 70 ? '#3b82f6' : confidence >= 50 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${confidence}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{confidence}%</span>
    </div>
  )
}

function ThoughtStep({ thought, index }: { thought: any; index: number }) {
  const [open, setOpen] = useState(thought.type === 'conclusion')
  const Icon = THOUGHT_ICON[thought.type] ?? Brain

  const stepColors: Record<string, string> = {
    hypothesis:  'text-purple-400 bg-purple-500/10',
    tool_call:   'text-blue-400 bg-blue-500/10',
    observation: 'text-cyan-400 bg-cyan-500/10',
    reasoning:   'text-gray-400 bg-gray-800',
    conclusion:  'text-green-400 bg-green-500/10',
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={clsx('h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0', stepColors[thought.type])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        {index < 99 && <div className="w-px h-full bg-gray-800 mt-1" />}
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <button onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 text-left w-full">
          <span className={clsx('text-xs font-bold uppercase tracking-wider', stepColors[thought.type]?.split(' ')[0])}>
            {thought.type.replace('_', ' ')}
          </span>
          {thought.toolName && (
            <span className="text-xs font-mono text-gray-600 bg-gray-800 px-2 py-0.5 rounded">{thought.toolName}</span>
          )}
          {open ? <ChevronUp className="h-3 w-3 text-gray-600 ml-auto" /> : <ChevronDown className="h-3 w-3 text-gray-600 ml-auto" />}
        </button>
        {open && (
          <div className="mt-2 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">
            {thought.content.length > 1000 ? `${thought.content.slice(0, 1000)}…` : thought.content}
          </div>
        )}
      </div>
    </div>
  )
}

function InvestigationCard({ inv, onView, onReview }: { inv: any; onView: (id: string) => void; onReview: (id: string) => void }) {
  const verdict = VERDICT_META[inv.verdict ?? '']
  const VIcon   = verdict?.icon ?? Brain

  return (
    <div className="rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={clsx('px-2.5 py-1 rounded text-xs font-medium capitalize', STATUS_STYLE[inv.status])}>
              {inv.status?.replace('_', ' ')}
            </span>
            {verdict && (
              <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold', verdict.bg, verdict.color)}>
                <VIcon className="h-3 w-3" />{verdict.label}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-200 truncate">{inv.alertTitle || `Alert ${inv.alertId?.slice(0, 8)}`}</p>
          {inv.executiveSummary && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{inv.executiveSummary}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0 text-xs text-gray-600">
          {new Date(inv.createdAt).toLocaleString()}
        </div>
      </div>

      {inv.confidence > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">AI Confidence</span>
            <span className="text-xs text-gray-500">{inv.totalSteps} steps · {inv.totalTokens?.toLocaleString()} tokens</span>
          </div>
          <ConfidenceMeter confidence={inv.confidence} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => onView(inv.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium
                     border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors">
          <FileText className="h-3 w-3" /> View Report
        </button>
        {inv.status === 'awaiting_approval' && (
          <button onClick={() => onReview(inv.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold
                       bg-yellow-600 text-white hover:bg-yellow-500 transition-colors">
            <CheckCircle2 className="h-3 w-3" /> Review
          </button>
        )}
      </div>
    </div>
  )
}

function InvestigationDetail({ invId, onBack }: { invId: string; onBack: () => void }) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['investigation', invId],
    queryFn:  () => fetch(`/api/v1/investigations/${invId}`, { headers: H() }).then(r => r.json()),
    staleTime: 10_000,
    refetchInterval: (q) => {
      const status = q.state.data?.data?.status
      return ['queued','investigating'].includes(status) ? 5000 : false
    },
  })

  const inv     = data?.data
  const verdict = VERDICT_META[inv?.verdict ?? '']

  async function submitReview(v: string, notes: string) {
    await fetch('/api/v1/investigations/:id/review'.replace(':id', invId), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ investigationId: invId, verdict: v, notes }),
    })
    qc.invalidateQueries({ queryKey: ['investigations'] })
    qc.invalidateQueries({ queryKey: ['investigation', invId] })
    setReviewOpen(false)
  }

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  )

  if (!inv) return <div className="text-gray-500 text-sm">Investigation not found</div>

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
        ← Back to investigations
      </button>

      {/* Header */}
      <div className={clsx('rounded-2xl border p-5', verdict?.bg ?? 'bg-gray-900 border-gray-800')}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {verdict && (
                <span className={clsx('text-xl font-black', verdict.color)}>{verdict.label}</span>
              )}
              <span className={clsx('px-2.5 py-1 rounded text-xs font-medium', STATUS_STYLE[inv.status])}>
                {inv.status?.replace('_', ' ')}
              </span>
            </div>
            <h2 className="text-base font-bold text-gray-100">{inv.alertTitle}</h2>
            {inv.executiveSummary && (
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">{inv.executiveSummary}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-gray-500 mb-1">AI Confidence</div>
            <div className={clsx('text-3xl font-black', verdict?.color ?? 'text-gray-400')}>{inv.confidence}%</div>
          </div>
        </div>

        {inv.confidence > 0 && <ConfidenceMeter confidence={inv.confidence} />}

        <div className="flex items-center gap-3 mt-3 text-xs text-gray-600">
          <span>{inv.totalSteps} reasoning steps</span>
          <span>·</span>
          <span>{inv.totalTokens?.toLocaleString()} tokens</span>
          <span>·</span>
          <span>{inv.durationMs ? `${Math.round(inv.durationMs / 1000)}s` : '—'}</span>
          <span>·</span>
          <span className="font-mono">{inv.agentModel}</span>
        </div>
      </div>

      {/* In-progress */}
      {['queued','investigating'].includes(inv.status) && (
        <Card className="flex items-center gap-4 py-6">
          <Brain className="h-8 w-8 text-blue-400 animate-pulse flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-200">
              {inv.status === 'queued' ? 'Investigation queued…' : 'AI analyst investigating…'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Gathering evidence, analyzing patterns, forming hypotheses
            </p>
          </div>
          <RefreshCw className="h-4 w-4 text-gray-600 animate-spin ml-auto" />
        </Card>
      )}

      {/* 2-col: evidence + reasoning */}
      {inv.status !== 'queued' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Evidence */}
          <Card>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Evidence Collected ({inv.evidence?.length ?? 0})</p>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {(inv.evidence ?? []).map((e: any, i: number) => (
                <div key={i} className={clsx('p-3 rounded-lg border',
                  e.supportsTP ? 'border-red-500/20 bg-red-500/5' : e.supportsFP ? 'border-green-500/20 bg-green-500/5' : 'border-gray-800 bg-gray-800/20')}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('text-xs font-bold', e.supportsTP ? 'text-red-400' : e.supportsFP ? 'text-green-400' : 'text-gray-500')}>
                      {e.supportsTP ? '↑TP' : e.supportsFP ? '↑FP' : '—'}
                    </span>
                    <span className="text-xs font-medium text-gray-300 truncate">{e.title}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{e.description}</p>
                </div>
              ))}
              {(!inv.evidence || inv.evidence.length === 0) && (
                <p className="text-xs text-gray-600">No evidence collected yet</p>
              )}
            </div>
          </Card>

          {/* Reasoning trace */}
          <Card>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Agent Reasoning Trace</p>
            <div className="max-h-80 overflow-y-auto">
              {(inv.thoughts ?? []).map((t: any, i: number) => (
                <ThoughtStep key={i} thought={t} index={i} />
              ))}
              {(!inv.thoughts || inv.thoughts.length === 0) && (
                <p className="text-xs text-gray-600">Reasoning not yet available</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Detailed report */}
      {inv.detailedReport && (
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Full Investigation Report</p>
          <div className="prose prose-invert prose-sm max-w-none text-gray-300 text-xs leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap font-mono">
            {inv.detailedReport}
          </div>
        </Card>
      )}

      {/* Recommendations + IOCs */}
      {(inv.recommendations?.length > 0 || inv.iocList?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {inv.recommendations?.length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recommendations</p>
              {inv.recommendations.map((r: string, i: number) => (
                <div key={i} className="flex items-start gap-2 mb-2 text-xs text-gray-400">
                  <ArrowRight className="h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" />{r}
                </div>
              ))}
            </Card>
          )}
          {inv.iocList?.length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">IOC List ({inv.iocList.length})</p>
              {inv.iocList.map((ioc: string, i: number) => (
                <div key={i} className="text-xs font-mono text-gray-400 py-1 border-b border-gray-800 last:border-0">{ioc}</div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Human review */}
      {inv.status === 'awaiting_approval' && !reviewOpen && (
        <Card className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-200">Human Review Required</p>
            <p className="text-xs text-gray-500">AI confidence below 85% — analyst confirmation requested</p>
          </div>
          <Button variant="primary" icon={CheckCircle2} onClick={() => setReviewOpen(true)}>
            Submit Review
          </Button>
        </Card>
      )}

      {reviewOpen && (
        <Card>
          <p className="text-sm font-semibold text-gray-200 mb-4">Analyst Review</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {Object.entries(VERDICT_META).map(([v, m]) => (
              <button key={v} onClick={() => submitReview(v, '')}
                className={clsx('flex items-center gap-2 p-3 rounded-xl border text-left transition-all text-xs font-medium', m.bg, m.color)}>
                <m.icon className="h-3.5 w-3.5 flex-shrink-0" />
                {m.label}
              </button>
            ))}
          </div>
          <button onClick={() => setReviewOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function AiSocAnalystPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewId,   setReviewId]   = useState<string | null>(null)

  const { data: statsData } = useQuery({
    queryKey: ['investigation-stats'],
    queryFn:  () => fetch('/api/v1/investigations/stats', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
  })
  const { data: listData, isLoading } = useQuery({
    queryKey: ['investigations'],
    queryFn:  () => fetch('/api/v1/investigations?limit=30', { headers: H() }).then(r => r.json()),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const stats = statsData?.data
  const list  = listData?.data ?? []
  const pending = list.filter((i: any) => i.status === 'awaiting_approval').length

  if (selectedId) {
    return (
      <AppShell title="AI SOC Analyst — Investigation">
        <PageContent><InvestigationDetail invId={selectedId} onBack={() => setSelectedId(null)} /></PageContent>
      </AppShell>
    )
  }

  return (
    <AppShell
      title="AI SOC Analyst"
      actions={
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pending} awaiting review
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Cpu className="h-3.5 w-3.5" />
            claude-sonnet-4-6
          </div>
        </div>
      }
    >
      <PageContent>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Investigations', value: stats?.totalInvestigations ?? '—', icon: Brain, color: 'text-blue-400' },
            { label: 'True Positives',        value: stats?.truePositives ?? '—',      icon: AlertTriangle, color: 'text-red-400' },
            { label: 'False Positives',       value: stats?.falsePositives ?? '—',     icon: CheckCircle2,  color: 'text-green-400' },
            { label: 'Pending Review',        value: stats?.pendingReview ?? '—',      icon: Clock, color: pending > 0 ? 'text-yellow-400' : 'text-gray-500' },
            { label: 'TP Rate (30d)',          value: stats ? `${stats.tpRate}%` : '—', icon: TrendingUp, color: 'text-gray-200' },
          ].map(k => (
            <Card key={k.label} className="flex items-center gap-3">
              <k.icon className={clsx('h-5 w-5 flex-shrink-0', k.color)} />
              <div>
                <p className={clsx('text-2xl font-bold tabular-nums', k.color)}>{k.value}</p>
                <p className="text-xs text-gray-500">{k.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 text-center">
          {[
            { n: '1', label: 'Alert Received', desc: 'P1/P2 auto-triggered', icon: AlertTriangle },
            { n: '2', label: 'Evidence Gathered', desc: '8 investigation tools', icon: Search },
            { n: '3', label: 'AI Reasons', desc: 'Multi-step analysis', icon: Brain },
            { n: '4', label: 'Verdict + Report', desc: 'Human review if <85%', icon: FileText },
          ].map((s, i) => (
            <div key={s.n} className="relative flex items-center gap-2">
              <div className="flex-1 rounded-xl border border-gray-800 p-3 bg-gray-900/50">
                <s.icon className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                <p className="text-xs font-semibold text-gray-200">{s.label}</p>
                <p className="text-xs text-gray-600 mt-0.5">{s.desc}</p>
              </div>
              {i < 3 && <ArrowRight className="h-4 w-4 text-gray-700 flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* Investigation list */}
        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState icon={Brain} title="No investigations yet"
            description="Investigations auto-trigger on P1/P2 alerts, or manually from any alert detail page."
            action={<Button variant="primary" icon={Play}>Investigate from Alerts</Button>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map((inv: any) => (
              <InvestigationCard key={inv.id} inv={inv}
                onView={setSelectedId} onReview={setReviewId} />
            ))}
          </div>
        )}

      </PageContent>
    </AppShell>
  )
}
