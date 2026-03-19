import { useState } from 'react'
import { clsx } from 'clsx'
import { useAlert, useUpdateAlertStatus, useSubmitFeedback } from '@/hooks/queries'
import {
  Badge, Button, Spinner, EmptyState, Card, Divider,
} from '@/components/shared/ui'
import {
  ShieldAlert, Sparkles, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, Tag, Clock, ExternalLink,
  User, Activity, CheckCircle2, AlertTriangle,
  FileText, MessageSquare, ChevronRight,
} from 'lucide-react'

// ─────────────────────────────────────────────
// MITRE ATT&CK TACTIC METADATA
// ─────────────────────────────────────────────

const TACTIC_META: Record<string, { name: string; color: string }> = {
  TA0001: { name: 'Initial Access',        color: 'bg-red-500/15 text-red-400' },
  TA0002: { name: 'Execution',             color: 'bg-orange-500/15 text-orange-400' },
  TA0003: { name: 'Persistence',           color: 'bg-yellow-500/15 text-yellow-400' },
  TA0004: { name: 'Privilege Escalation',  color: 'bg-amber-500/15 text-amber-400' },
  TA0005: { name: 'Defense Evasion',       color: 'bg-lime-500/15 text-lime-400' },
  TA0006: { name: 'Credential Access',     color: 'bg-teal-500/15 text-teal-400' },
  TA0007: { name: 'Discovery',             color: 'bg-cyan-500/15 text-cyan-400' },
  TA0008: { name: 'Lateral Movement',      color: 'bg-blue-500/15 text-blue-400' },
  TA0009: { name: 'Collection',            color: 'bg-indigo-500/15 text-indigo-400' },
  TA0010: { name: 'Exfiltration',          color: 'bg-purple-500/15 text-purple-400' },
  TA0011: { name: 'Command and Control',   color: 'bg-fuchsia-500/15 text-fuchsia-400' },
  TA0040: { name: 'Impact',               color: 'bg-rose-500/15 text-rose-400' },
}

// ─────────────────────────────────────────────
// TIMELINE STEP
// ─────────────────────────────────────────────

function TimelineStep({
  icon: Icon, title, subtitle, timestamp, accent, isLast,
}: {
  icon:      React.ElementType
  title:     string
  subtitle?: string
  timestamp: string
  accent:    string
  isLast?:   boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={clsx(
          'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center',
          accent,
        )}>
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-800 mt-1 min-h-4" />}
      </div>
      <div className="pb-4 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-medium text-gray-200">{title}</p>
          <p className="text-xs text-gray-600 flex-shrink-0">{timestamp}</p>
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN WORKFLOW PANEL
// ─────────────────────────────────────────────

export function AlertWorkflowPanel({ alertId }: { alertId: string }) {
  const [activeTab, setActiveTab]         = useState<'narrative' | 'evidence' | 'timeline'>('narrative')
  const [showAllEvidence, setShowAllEvid] = useState(false)

  const { data, isLoading, refetch }                         = useAlert(alertId)
  const { mutate: updateStatus, isPending: updatingStatus }  = useUpdateAlertStatus()
  const { mutate: submitFeedback, isPending: submittingFB }  = useSubmitFeedback()

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-gray-500">Loading alert…</p>
      </div>
    )
  }

  if (!data?.data) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Alert not found"
        description="This alert may have been deleted or you don't have access."
      />
    )
  }

  const alert = data.data

  const severityGradient: Record<string, string> = {
    critical: 'from-red-900/20 via-transparent',
    high:     'from-orange-900/15 via-transparent',
    medium:   'from-yellow-900/10 via-transparent',
    low:      'from-blue-900/10 via-transparent',
  }

  const severityBorder: Record<string, string> = {
    critical: 'border-red-500/30',
    high:     'border-orange-500/30',
    medium:   'border-yellow-500/30',
    low:      'border-blue-500/30',
  }

  const tabs = [
    { id: 'narrative', label: 'AI Narrative',  icon: Sparkles,    count: null },
    { id: 'evidence',  label: 'Evidence',      icon: Tag,         count: alert.evidence?.length ?? 0 },
    { id: 'timeline',  label: 'Timeline',      icon: Clock,       count: null },
  ] as const

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Alert header ───────────────────────── */}
      <div className={clsx(
        'flex-shrink-0 p-6 bg-gradient-to-b border-b',
        severityGradient[alert.severity] ?? 'from-transparent',
        severityBorder[alert.severity]   ?? 'border-gray-800',
      )}>
        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Badge variant={alert.priority as any}>{alert.priority}</Badge>
          <Badge variant={alert.severity as any} dot>{alert.severity}</Badge>
          <Badge variant={alert.status as any}>{alert.status.replace('_', ' ')}</Badge>
          {alert.mttdSlaBreached && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
                             text-xs font-medium bg-red-500/15 text-red-400 ring-1 ring-red-500/30">
              <AlertTriangle className="h-3 w-3" />
              SLA Breached
            </span>
          )}
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-100 leading-snug mb-2">
          {alert.title}
        </h2>

        {/* Description */}
        <p className="text-sm text-gray-400 leading-relaxed line-clamp-3">
          {alert.description}
        </p>

        {/* Meta grid */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {alert.affectedUserId && (
            <div className="flex items-center gap-2 text-gray-500">
              <User className="h-3.5 w-3.5 text-gray-700" />
              <span className="font-mono text-gray-400 truncate">{alert.affectedUserId}</span>
            </div>
          )}
          {alert.affectedIp && (
            <div className="flex items-center gap-2 text-gray-500">
              <Activity className="h-3.5 w-3.5 text-gray-700" />
              <span className="font-mono text-gray-400">{alert.affectedIp}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-gray-500">
            <Clock className="h-3.5 w-3.5 text-gray-700" />
            <span>{new Date(alert.createdAt).toLocaleString()}</span>
          </div>
          {alert.detectionGapMinutes != null && (
            <div className="flex items-center gap-2 text-gray-500">
              <Clock className="h-3.5 w-3.5 text-blue-600" />
              <span>MTTD: <strong className="text-gray-300">{alert.detectionGapMinutes}m</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* ── Status action bar ───────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/70 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600 font-medium uppercase tracking-wider mr-1">
            Actions:
          </span>
          {[
            { status: 'investigating', label: 'Investigate',     color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
            { status: 'resolved',      label: 'Resolve',          color: 'bg-green-500/10 text-green-400 border-green-500/20' },
            { status: 'suppressed',    label: 'Suppress',         color: 'bg-gray-700 text-gray-400 border-gray-600' },
            { status: 'false_positive',label: 'False Positive',   color: 'bg-gray-700 text-gray-500 border-gray-700' },
          ].map(({ status, label, color }) => (
            <button
              key={status}
              disabled={updatingStatus || alert.status === status}
              onClick={() => updateStatus({ alertId: alert.id, status })}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                alert.status === status
                  ? `${color} opacity-100 cursor-default`
                  : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300',
                updatingStatus && 'opacity-50',
              )}
            >
              {alert.status === status ? `✓ ${label}` : label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <button
              disabled={submittingFB}
              onClick={() => submitFeedback({ alertId: alert.id, verdict: 'true_positive' })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                         text-green-400 bg-green-500/10 border border-green-500/20 hover:bg-green-500/20
                         transition-colors"
            >
              <ThumbsUp className="h-3.5 w-3.5" /> TP
            </button>
            <button
              disabled={submittingFB}
              onClick={() => submitFeedback({ alertId: alert.id, verdict: 'false_positive' })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                         text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20
                         transition-colors"
            >
              <ThumbsDown className="h-3.5 w-3.5" /> FP
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-1 border-b border-gray-800 px-6 pt-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-all',
              activeTab === tab.id
                ? 'text-blue-400 border-blue-500'
                : 'text-gray-500 border-transparent hover:text-gray-300',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="ml-0.5 text-xs rounded-full bg-gray-800 px-1.5 text-gray-400">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* NARRATIVE TAB */}
        {activeTab === 'narrative' && (
          <div className="p-6 space-y-5">
            {alert.llmNarrative ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                    AI Investigation Summary
                  </span>
                  <span className="text-xs text-gray-700 ml-auto">
                    {alert.llmNarrative.modelUsed}
                  </span>
                </div>

                {/* What Happened */}
                <div className="rounded-xl bg-gray-800/50 border border-gray-700/50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    What Happened
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {alert.llmNarrative.whatHappened}
                  </p>
                </div>

                {/* Why It Matters */}
                <div className="rounded-xl bg-gray-800/50 border border-gray-700/50 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Why It Matters
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">
                    {alert.llmNarrative.whyItMatters}
                  </p>
                </div>

                {/* Recommended Steps */}
                <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-4">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">
                    Recommended Next Steps
                  </p>
                  <ol className="space-y-2.5">
                    {alert.llmNarrative.recommendedNextSteps?.map((step: string, i: number) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-500/20
                                         text-blue-400 text-xs flex items-center justify-center
                                         font-bold mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-gray-300 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Confidence */}
                <div className="rounded-xl bg-gray-800/30 border border-gray-800 p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                    Confidence Assessment
                  </p>
                  <p className="text-xs text-gray-500 italic leading-relaxed">
                    {alert.llmNarrative.confidenceAssessment}
                  </p>
                </div>
              </>
            ) : (
              /* No narrative yet — show recommended actions from rule */
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Detection Rule Recommendations
                  </span>
                </div>

                {alert.recommendedActions?.length > 0 ? (
                  <ol className="space-y-3">
                    {alert.recommendedActions.map((action: string, i: number) => (
                      <li key={i} className="flex gap-3 rounded-xl bg-gray-800/40 p-3.5">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-700
                                         text-gray-300 text-xs flex items-center justify-center
                                         font-bold">
                          {i + 1}
                        </span>
                        <p className="text-sm text-gray-300 leading-relaxed pt-0.5">{action}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-gray-600 text-center py-8">
                    No recommended actions available.
                  </p>
                )}

                {!alert.llmNarrative && alert.priority !== 'P3' && alert.priority !== 'P4' && (
                  <p className="mt-4 text-xs text-gray-700 text-center">
                    AI narrative is being generated…
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* EVIDENCE TAB */}
        {activeTab === 'evidence' && (
          <div className="divide-y divide-gray-800/60">
            {(!alert.evidence || alert.evidence.length === 0) ? (
              <EmptyState
                icon={Tag}
                title="No evidence events"
                description="No individual events were captured for this alert."
              />
            ) : (
              <>
                {(showAllEvidence ? alert.evidence : alert.evidence.slice(0, 15)).map(
                  (ev: any, i: number) => (
                    <div key={i} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-xs font-mono text-gray-500">
                              {ev.eventId?.slice(0, 16)}…
                            </code>
                            <span className="text-xs text-gray-600">
                              {ev.sourceType} · {ev.eventCategory} · {ev.eventAction}
                            </span>
                          </div>

                          <div className="mt-1.5 flex items-center gap-4 text-xs">
                            {ev.actorUserId && (
                              <span className="flex items-center gap-1 text-gray-500">
                                <User className="h-3 w-3 text-gray-700" />
                                {ev.actorUserId.slice(0, 20)}
                              </span>
                            )}
                            {ev.actorIp && (
                              <span className="font-mono text-gray-500">{ev.actorIp}</span>
                            )}
                            {ev.actorIpCountry && (
                              <span className="text-gray-600">{ev.actorIpCountry}</span>
                            )}
                          </div>

                          {ev.targetResource && (
                            <p className="mt-1 text-xs text-gray-600 truncate">
                              → {ev.targetResource}
                            </p>
                          )}
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <span className={clsx(
                            'text-xs px-1.5 py-0.5 rounded font-medium',
                            ev.outcome === 'success' ? 'text-green-400 bg-green-500/10'
                            : ev.outcome === 'failure' ? 'text-red-400 bg-red-500/10'
                            : 'text-gray-400 bg-gray-800',
                          )}>
                            {ev.outcome}
                          </span>
                          <p className="text-xs text-gray-700 mt-1">
                            {ev.eventTime && new Date(ev.eventTime).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {alert.evidence.length > 15 && !showAllEvidence && (
                  <div className="p-4 text-center">
                    <button
                      onClick={() => setShowAllEvid(true)}
                      className="text-sm text-blue-400 hover:underline"
                    >
                      Show all {alert.evidence.length} events
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="p-6">
            <div className="space-y-0">
              <TimelineStep
                icon={ShieldAlert}
                title="Alert created"
                subtitle={`Priority: ${alert.priority} · Severity: ${alert.severity}`}
                timestamp={new Date(alert.createdAt).toLocaleString()}
                accent="bg-red-500/20 text-red-400"
              />

              {alert.firstSignalTime && (
                <TimelineStep
                  icon={Activity}
                  title="First signal detected"
                  subtitle={`${alert.detectionGapMinutes ?? '?'}m before alert creation`}
                  timestamp={new Date(alert.firstSignalTime).toLocaleString()}
                  accent="bg-orange-500/20 text-orange-400"
                />
              )}

              {alert.assignedTo && alert.assignedAt && (
                <TimelineStep
                  icon={User}
                  title="Assigned to analyst"
                  subtitle={alert.assignedTo.slice(0, 20)}
                  timestamp={new Date(alert.assignedAt).toLocaleString()}
                  accent="bg-blue-500/20 text-blue-400"
                />
              )}

              {alert.llmNarrativeGeneratedAt && (
                <TimelineStep
                  icon={Sparkles}
                  title="AI narrative generated"
                  subtitle={`Model: ${alert.llmNarrative?.modelUsed}`}
                  timestamp={new Date(alert.llmNarrativeGeneratedAt).toLocaleString()}
                  accent="bg-purple-500/20 text-purple-400"
                />
              )}

              {alert.status === 'investigating' && (
                <TimelineStep
                  icon={Activity}
                  title="Investigation started"
                  subtitle="Analyst is actively investigating"
                  timestamp={new Date(alert.updatedAt).toLocaleString()}
                  accent="bg-yellow-500/20 text-yellow-400"
                />
              )}

              {alert.resolvedAt && (
                <TimelineStep
                  icon={CheckCircle2}
                  title={`Alert ${alert.status.replace('_', ' ')}`}
                  subtitle=""
                  timestamp={new Date(alert.resolvedAt).toLocaleString()}
                  accent="bg-green-500/20 text-green-400"
                  isLast
                />
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
