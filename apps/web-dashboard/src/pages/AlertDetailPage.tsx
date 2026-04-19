import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAlert, useUpdateAlertStatus, useSubmitFeedback } from '@/hooks/queries'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import {
  ChevronLeft, ShieldAlert, Clock, User, Tag,
  CheckCircle2, XCircle, HelpCircle, Loader2,
  Sparkles, ChevronDown, ChevronUp, ExternalLink,
  ThumbsUp, ThumbsDown, AlertTriangle,
} from 'lucide-react'

// ─────────────────────────────────────────────
// MITRE TACTIC COLOR
// ─────────────────────────────────────────────

const TACTIC_COLORS: Record<string, string> = {
  TA0001: 'bg-red-500/15 text-red-400',
  TA0002: 'bg-orange-500/15 text-orange-400',
  TA0003: 'bg-yellow-500/15 text-yellow-400',
  TA0004: 'bg-amber-500/15 text-amber-400',
  TA0005: 'bg-green-500/15 text-green-400',
  TA0006: 'bg-teal-500/15 text-teal-400',
  TA0007: 'bg-cyan-500/15 text-cyan-400',
  TA0008: 'bg-blue-500/15 text-blue-400',
  TA0009: 'bg-indigo-500/15 text-indigo-400',
  TA0010: 'bg-purple-500/15 text-purple-400',
  TA0011: 'bg-fuchsia-500/15 text-fuchsia-400',
  TA0040: 'bg-rose-500/15 text-rose-400',
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType
  children: React.ReactNode; className?: string
}) {
  return (
    <div className={clsx('rounded-xl border border-gray-800 bg-gray-900 p-5', className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-4">
        <Icon className="h-4 w-4 text-gray-500" />
        {title}
      </h3>
      {children}
    </div>
  )
}

function StatusButton({ status, current, label, colorClass, onClick, loading }: {
  status: string; current: string; label: string
  colorClass: string; onClick: () => void; loading: boolean
}) {
  const isActive = current === status
  return (
    <button
      onClick={onClick}
      disabled={loading || isActive}
      className={clsx(
        'flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-all',
        isActive
          ? `${colorClass} border-transparent cursor-default`
          : 'text-gray-500 border-gray-700 hover:border-gray-600 hover:text-gray-300',
        loading && 'opacity-50',
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : label}
    </button>
  )
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────

export default function AlertDetailPage() {
  const { id }          = useParams<{ id: string }>()
  const navigate        = useNavigate()
  const [showEvidence, setShowEvidence] = useState(false)

  const { data, isLoading } = useAlert(id!)
  const { mutate: updateStatus, isPending: statusPending } = useUpdateAlertStatus()
  const { mutate: submitFeedback, isPending: feedbackPending } = useSubmitFeedback()

  const alert = data?.data

  if (isLoading) {
    return (
      <AppShell title="Alert Detail">
        <PageContent>
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        </PageContent>
      </AppShell>
    )
  }

  if (!alert) {
    return (
      <AppShell title="Alert Not Found">
        <PageContent>
          <div className="text-center py-24">
            <ShieldAlert className="h-12 w-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400">Alert not found or you do not have access.</p>
            <button onClick={() => navigate(-1)}
              className="mt-4 text-sm text-blue-400 hover:underline">
              ← Go back
            </button>
          </div>
        </PageContent>
      </AppShell>
    )
  }

  const severityBg = {
    critical: 'from-red-500/10 border-red-500/20',
    high:     'from-orange-500/10 border-orange-500/20',
    medium:   'from-yellow-500/10 border-yellow-500/20',
    low:      'from-blue-500/10 border-blue-500/20',
    info:     'from-cyan-500/10 border-cyan-500/20',
  }[alert.severity] ?? 'from-gray-800/40 border-gray-800'

  const priorityDot: Record<string, string> = {
    P1: 'bg-red-500', P2: 'bg-orange-500', P3: 'bg-yellow-500', P4: 'bg-blue-500',
  }

  return (
    <AppShell
      title={`Alert · ${alert.priority}`}
      actions={
        <Link to="/app/alerts"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          All Alerts
        </Link>
      }
    >
      <PageContent>

        {/* ── Alert header ─────────────────────────── */}
        <div className={clsx(
          'mb-6 rounded-xl border bg-gradient-to-br to-transparent p-6',
          severityBg,
        )}>
          <div className="flex items-start gap-4">
            <div className={clsx(
              'flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center',
              'bg-gray-900/80',
            )}>
              <div className={clsx('h-3 w-3 rounded-full', priorityDot[alert.priority] ?? 'bg-gray-500')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-mono text-gray-500">{alert.id.slice(0, 8)}…</span>
                <span className="text-xs text-gray-600">·</span>
                <span className="text-xs text-gray-500">{alert.priority}</span>
                {alert.mttdSlaBreached && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                   text-xs font-medium bg-red-500/15 text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    SLA Breached
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-100 mb-2">{alert.title}</h1>
              <p className="text-sm text-gray-400 leading-relaxed">{alert.description}</p>
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-gray-500 border-t border-gray-800/50 pt-4">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {new Date(alert.createdAt).toLocaleString()}
            </span>
            {alert.detectionGapMinutes != null && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                MTTD: {alert.detectionGapMinutes} minutes
              </span>
            )}
            {alert.affectedUserId && (
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                User: <code className="font-mono">{alert.affectedUserId.slice(0, 12)}…</code>
              </span>
            )}
            {alert.affectedIp && (
              <span className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                IP: <code className="font-mono">{alert.affectedIp}</code>
              </span>
            )}
          </div>
        </div>

        {/* ── Main grid ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT 2/3 */}
          <div className="lg:col-span-2 space-y-6">

            {/* LLM Narrative */}
            {alert.llmNarrative && (
              <SectionCard title="AI Investigation Summary" icon={Sparkles}>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      What Happened
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {alert.llmNarrative.whatHappened}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Why It Matters
                    </p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {alert.llmNarrative.whyItMatters}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Recommended Next Steps
                    </p>
                    <ol className="space-y-1.5">
                      {alert.llmNarrative.recommendedNextSteps?.map((step: string, i: number) => (
                        <li key={i} className="flex gap-2.5 text-sm text-gray-300">
                          <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-500/20
                                           text-blue-400 text-xs flex items-center justify-center
                                           font-medium mt-0.5">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="pt-2 border-t border-gray-800">
                    <p className="text-xs text-gray-600 italic">
                      {alert.llmNarrative.confidenceAssessment}
                    </p>
                    <p className="text-xs text-gray-700 mt-1">
                      Generated by {alert.llmNarrative.modelUsed} ·{' '}
                      {alert.llmNarrativeGeneratedAt &&
                        new Date(alert.llmNarrativeGeneratedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Recommended actions (from detection rule) */}
            {!alert.llmNarrative && alert.recommendedActions?.length > 0 && (
              <SectionCard title="Recommended Actions" icon={CheckCircle2}>
                <ol className="space-y-2">
                  {alert.recommendedActions.map((action: string, i: number) => (
                    <li key={i} className="flex gap-2.5 text-sm text-gray-300">
                      <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-500/20
                                       text-blue-400 text-xs flex items-center justify-center
                                       font-medium mt-0.5">
                        {i + 1}
                      </span>
                      {action}
                    </li>
                  ))}
                </ol>
              </SectionCard>
            )}

            {/* Evidence events */}
            <div className="rounded-xl border border-gray-800 bg-gray-900">
              <button
                onClick={() => setShowEvidence(v => !v)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <Tag className="h-4 w-4 text-gray-500" />
                  Evidence Events ({alert.evidence?.length ?? 0})
                </h3>
                {showEvidence
                  ? <ChevronUp className="h-4 w-4 text-gray-500" />
                  : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>

              {showEvidence && alert.evidence?.length > 0 && (
                <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                  {alert.evidence.slice(0, 10).map((ev: any, i: number) => (
                    <div key={i} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-xs font-mono text-gray-400">{ev.eventId?.slice(0, 12)}…</code>
                            <span className="text-xs text-gray-600">
                              {ev.eventCategory} · {ev.eventAction}
                            </span>
                          </div>
                          {ev.actorUserId && (
                            <p className="text-xs text-gray-500 mt-1">User: {ev.actorUserId.slice(0, 12)}…</p>
                          )}
                          {ev.actorIp && (
                            <p className="text-xs text-gray-500 mt-0.5">IP: {ev.actorIp}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          <span className={clsx(
                            'text-xs px-1.5 py-0.5 rounded font-medium',
                            ev.outcome === 'success' ? 'text-green-400 bg-green-500/10'
                            : ev.outcome === 'failure' ? 'text-red-400 bg-red-500/10'
                            : 'text-gray-400 bg-gray-800',
                          )}>
                            {ev.outcome}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* RIGHT sidebar */}
          <div className="space-y-6">

            {/* Status management */}
            <SectionCard title="Status" icon={ShieldAlert}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Current</span>
                  <span className={clsx(
                    'px-2.5 py-1 rounded-full text-xs font-medium capitalize',
                    {
                      open:        'bg-red-500/10 text-red-400',
                      in_progress: 'bg-yellow-500/10 text-yellow-400',
                      resolved:    'bg-green-500/10 text-green-400',
                    }[alert.status] ?? 'bg-gray-700 text-gray-400',
                  )}>
                    {alert.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <StatusButton
                    status="open" current={alert.status}
                    label="Reopen" colorClass="bg-red-500/10 text-red-400"
                    onClick={() => updateStatus({ alertId: alert.id, status: 'open' })}
                    loading={statusPending}
                  />
                  <StatusButton
                    status="in_progress" current={alert.status}
                    label="Investigate" colorClass="bg-yellow-500/10 text-yellow-400"
                    onClick={() => updateStatus({ alertId: alert.id, status: 'in_progress' })}
                    loading={statusPending}
                  />
                  <StatusButton
                    status="resolved" current={alert.status}
                    label="Resolve" colorClass="bg-green-500/10 text-green-400"
                    onClick={() => updateStatus({ alertId: alert.id, status: 'resolved' })}
                    loading={statusPending}
                  />
                </div>
              </div>
            </SectionCard>

            {/* Analyst feedback */}
            <SectionCard title="Analyst Feedback" icon={HelpCircle}>
              <p className="text-xs text-gray-500 mb-3">
                Help improve detection accuracy
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => submitFeedback({ alertId: alert.id, verdict: 'true_positive' })}
                  disabled={feedbackPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                             text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20
                             hover:bg-green-500/20 transition-colors"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  True Positive
                </button>
                <button
                  onClick={() => submitFeedback({ alertId: alert.id, verdict: 'false_positive' })}
                  disabled={feedbackPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                             text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20
                             hover:bg-red-500/20 transition-colors"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  False Pos.
                </button>
              </div>
            </SectionCard>

            {/* MITRE ATT&CK */}
            {(alert.mitreTactics?.length > 0 || alert.mitreTechniques?.length > 0) && (
              <SectionCard title="MITRE ATT&CK" icon={Tag}>
                <div className="space-y-3">
                  {alert.mitreTactics?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1.5">Tactics</p>
                      <div className="flex flex-wrap gap-1.5">
                        {alert.mitreTactics.map((t: string) => (
                          <a
                            key={t}
                            href={`https://attack.mitre.org/tactics/${t}/`}
                            target="_blank" rel="noopener noreferrer"
                            className={clsx(
                              'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium',
                              TACTIC_COLORS[t] ?? 'bg-gray-700 text-gray-400',
                            )}
                          >
                            {t}
                            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {alert.mitreTechniques?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-wider mb-1.5">Techniques</p>
                      <div className="flex flex-wrap gap-1.5">
                        {alert.mitreTechniques.map((t: string) => (
                          <a
                            key={t}
                            href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs
                                       font-mono font-medium bg-gray-800 text-gray-400 hover:text-gray-200"
                          >
                            {t}
                            <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

          </div>
        </div>

      </PageContent>
    </AppShell>
  )
}
