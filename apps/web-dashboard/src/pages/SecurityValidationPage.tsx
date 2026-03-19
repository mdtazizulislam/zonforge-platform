import { useState } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Play, Shield, Target, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, BarChart3, Clock,
  TrendingUp, TrendingDown, Minus, Zap, Activity, Lock,
  ArrowRight, FlaskConical,
} from 'lucide-react'

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────

const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const CAT_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  credential:          { label: 'Credential Attacks',  color: 'text-red-400 bg-red-500/10',    icon: Lock },
  privilege_escalation:{ label: 'Priv. Escalation',    color: 'text-purple-400 bg-purple-500/10', icon: Shield },
  exfiltration:        { label: 'Data Exfiltration',   color: 'text-yellow-400 bg-yellow-500/10', icon: ArrowRight },
  lateral_movement:    { label: 'Lateral Movement',    color: 'text-orange-400 bg-orange-500/10', icon: Activity },
  oauth_abuse:         { label: 'OAuth Abuse',         color: 'text-blue-400 bg-blue-500/10',  icon: Zap },
}

const EVAL_STYLES: Record<string, { label: string; dot: string; badge: string }> = {
  pass:    { label: 'Detection PASS',    dot: 'bg-green-400',  badge: 'bg-green-500/10 text-green-400' },
  partial: { label: 'Partial Detection', dot: 'bg-yellow-400', badge: 'bg-yellow-500/10 text-yellow-400' },
  fail:    { label: 'Detection FAIL',    dot: 'bg-red-400',    badge: 'bg-red-500/10 text-red-400' },
  timeout: { label: 'Timeout',           dot: 'bg-gray-500',   badge: 'bg-gray-700 text-gray-400' },
}

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400',  B: 'text-blue-400',
  C: 'text-yellow-400', D: 'text-orange-400', F: 'text-red-400',
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') return <TrendingUp className="h-3.5 w-3.5 text-green-400" />
  if (trend === 'degrading') return <TrendingDown className="h-3.5 w-3.5 text-red-400" />
  return <Minus className="h-3.5 w-3.5 text-gray-500" />
}

function DetectionBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : pct >= 50 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-10 text-right" style={{
        color: pct >= 90 ? '#22c55e' : pct >= 70 ? '#eab308' : pct >= 50 ? '#f97316' : '#ef4444',
      }}>{pct}%</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// SIMULATION RESULT ROW
// ─────────────────────────────────────────────

function SimResultRow({ result }: { result: any }) {
  const [open, setOpen] = useState(false)
  const ev    = EVAL_STYLES[result.evaluationStatus] ?? EVAL_STYLES['timeout']!
  const catM  = CAT_META[result.category] ?? { label: result.category, color: 'text-gray-400 bg-gray-800', icon: Shield }
  const Icon  = catM.icon

  return (
    <div className="border-b border-gray-800/50 last:border-0">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/20 transition-colors text-left">

        {/* Status dot */}
        <div className={clsx('h-2.5 w-2.5 rounded-full flex-shrink-0', ev.dot,
          result.status === 'running' && 'animate-pulse')} />

        {/* Scenario info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium', catM.color)}>
              <Icon className="h-3 w-3" />{catM.label}
            </span>
            <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', ev.badge)}>{ev.label}</span>
          </div>
          <p className="text-sm font-medium text-gray-200 truncate">{result.scenarioName}</p>
          <p className="text-xs text-gray-500 truncate">{result.summary}</p>
        </div>

        {/* Detection rate */}
        <div className="w-32 flex-shrink-0">
          <DetectionBar pct={Number(result.detectionRatePct ?? 0)} />
        </div>

        {/* Time */}
        <span className="text-xs text-gray-500 flex-shrink-0">
          {new Date(result.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>

        {open ? <ChevronUp className="h-4 w-4 text-gray-600" /> : <ChevronDown className="h-4 w-4 text-gray-600" />}
      </button>

      {open && (
        <div className="px-5 pb-4 bg-gray-900/30 space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Events Injected', value: result.eventsInjected ?? 0 },
              { label: 'Expected Rules',  value: result.expectedRules?.length ?? 0 },
              { label: 'Detections Found', value: result.detectionsFound ?? 0 },
              { label: 'Duration',         value: result.durationMs ? `${Math.round(result.durationMs / 1000)}s` : '—' },
            ].map(s => (
              <div key={s.label} className="bg-gray-800/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-100 tabular-nums">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Expected rules */}
          {result.expectedRules?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Expected Detections</p>
              <div className="flex flex-wrap gap-2">
                {result.expectedRules.map((r: string) => {
                  const found = result.gapRules && !result.gapRules.includes(r)
                  return (
                    <span key={r} className={clsx(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium',
                      found ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
                    )}>
                      {found ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {r}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* MITRE techniques */}
          {result.mitreTechniques?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">MITRE ATT&CK</p>
              <div className="flex flex-wrap gap-1.5">
                {result.mitreTechniques.map((t: string) => (
                  <span key={t} className="text-xs font-mono text-gray-600 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Gaps & Recommendations */}
          {result.gaps?.length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/8 border border-red-500/20">
              <p className="text-xs font-semibold text-red-400 mb-2">Detection Gaps</p>
              {result.gaps.map((g: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-300 mb-1">
                  <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />{g}
                </div>
              ))}
            </div>
          )}

          {result.recommendations?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recommendations</p>
              {result.recommendations.map((r: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-400 mb-1.5">
                  <ArrowRight className="h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" />{r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// SECURITY GRADE RING
// ─────────────────────────────────────────────

function GradeRing({ score, grade }: { score: number; grade: string }) {
  const r = 54, c = 2 * Math.PI * r
  const fill = (score / 100) * c
  const colors: Record<string, string> = { A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444' }
  const color = colors[grade] ?? '#6b7280'

  return (
    <div className="relative inline-block">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#1f2937" strokeWidth="10" />
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
          transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dasharray .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black" style={{ color }}>{grade}</span>
        <span className="text-sm font-bold text-gray-400">{score}/100</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function SecurityValidationPage() {
  const [runningId, setRunningId] = useState<string | null>(null)
  const [tab, setTab]             = useState<'results'|'score'|'gaps'>('results')
  const qc = useQueryClient()

  const { data: scenariosData } = useQuery({
    queryKey: ['redteam', 'scenarios'],
    queryFn:  () => fetch('/api/v1/redteam/scenarios', { headers: H() }).then(r => r.json()),
    staleTime: Infinity,
  })
  const { data: resultsData, isLoading: resLoad } = useQuery({
    queryKey: ['redteam', 'results'],
    queryFn:  () => fetch('/api/v1/redteam/results?limit=30', { headers: H() }).then(r => r.json()),
    staleTime: 30_000,
    refetchInterval: 15_000,
  })
  const { data: scoreData } = useQuery({
    queryKey: ['redteam', 'score'],
    queryFn:  () => fetch('/api/v1/redteam/security-score', { headers: H() }).then(r => r.json()),
    staleTime: 5 * 60_000,
    enabled:  tab === 'score' || tab === 'results',
  })
  const { data: gapData } = useQuery({
    queryKey: ['redteam', 'gaps'],
    queryFn:  () => fetch('/api/v1/redteam/gap-report', { headers: H() }).then(r => r.json()),
    staleTime: 5 * 60_000,
    enabled:  tab === 'gaps',
  })

  const scenarios = scenariosData?.data ?? []
  const results   = resultsData?.data  ?? []
  const score     = scoreData?.data
  const gaps      = gapData?.data

  const passCount    = results.filter((r: any) => r.evaluationStatus === 'pass').length
  const failCount    = results.filter((r: any) => r.evaluationStatus === 'fail').length
  const runningCount = results.filter((r: any) => r.status === 'running').length

  async function runScenario(scenarioId?: string) {
    setRunningId(scenarioId ?? 'all')
    try {
      await fetch('/api/v1/redteam/run-simulation', {
        method: 'POST', headers: H(),
        body: JSON.stringify(scenarioId ? { scenarioId } : { runAll: false }),
      })
      await new Promise(r => setTimeout(r, 2000))
      qc.invalidateQueries({ queryKey: ['redteam', 'results'] })
      qc.invalidateQueries({ queryKey: ['redteam', 'score'] })
    } finally { setRunningId(null) }
  }

  return (
    <AppShell
      title="Security Validation Lab"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold
                          bg-green-500/10 text-green-400 border border-green-500/20">
            <Lock className="h-3.5 w-3.5" />
            Sandbox Mode · No Real Actions
          </div>
          <Button variant="primary" size="sm" icon={Play}
            disabled={!!runningId}
            onClick={() => runScenario()}>
            {runningId ? 'Running…' : 'Run Simulation'}
          </Button>
        </div>
      }
    >
      <PageContent>

        {/* ── KPI row ─────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Scenarios Available', value: scenarios.length, icon: FlaskConical, color: 'text-blue-400' },
            { label: 'Total Runs (30d)',     value: results.length,   icon: Activity, color: 'text-gray-200' },
            { label: 'Passed',               value: passCount,        icon: CheckCircle2, color: 'text-green-400' },
            { label: 'Failed / Gaps',        value: failCount,        icon: XCircle, color: failCount > 0 ? 'text-red-400' : 'text-gray-400' },
            { label: 'Currently Running',    value: runningCount,     icon: RefreshCw, color: runningCount > 0 ? 'text-yellow-400 animate-pulse' : 'text-gray-500' },
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Scenario launcher ─────────────── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Attack Scenarios</h3>
            {scenarios.length === 0
              ? <div className="py-6 text-center text-xs text-gray-600">Loading scenarios…</div>
              : scenarios.map((s: any) => {
                const catM = CAT_META[s.category] ?? { label: s.category, color: 'text-gray-400 bg-gray-800', icon: Shield }
                const Icon = catM.icon
                return (
                  <div key={s.id} className="rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium mb-2', catM.color)}>
                          <Icon className="h-3 w-3" />{catM.label}
                        </span>
                        <p className="text-sm font-medium text-gray-200">{s.name}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                          <span>{s.stepCount} steps</span>
                          <span>·</span>
                          <span>{s.totalEvents} events</span>
                          <span>·</span>
                          <span className="font-mono">{s.expectedRules?.[0]}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => runScenario(s.id)}
                        disabled={!!runningId}
                        className={clsx(
                          'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                          'bg-blue-600 text-white hover:bg-blue-500',
                          runningId && 'opacity-50 cursor-not-allowed',
                        )}>
                        {runningId === s.id
                          ? <RefreshCw className="h-3 w-3 animate-spin" />
                          : <Play className="h-3 w-3" />}
                        Run
                      </button>
                    </div>
                    {/* MITRE tags */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {s.mitreTechniques?.map((t: string) => (
                        <span key={t} className="text-xs font-mono text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                )
              })
            }
          </div>

          {/* ── Results + Score + Gaps ─────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Security Score (always visible at top) */}
            {score && (
              <Card>
                <div className="flex items-center gap-6">
                  <GradeRing score={score.overallScore ?? 0} grade={score.overallGrade ?? 'F'} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-100">Detection Coverage Score</h3>
                      <TrendIcon trend={score.trend} />
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      Based on {score.totalSimulations} simulations · {score.passRate}% pass rate
                    </p>

                    {/* Category bars */}
                    <div className="space-y-2">
                      {(score.categoryScores ?? []).map((c: any) => {
                        const m = CAT_META[c.category] ?? { label: c.category, color: 'text-gray-400', icon: Shield }
                        return (
                          <div key={c.category}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={clsx('text-xs font-medium', m.color.split(' ')[0])}>{m.label}</span>
                              <div className="flex items-center gap-1">
                                <TrendIcon trend={c.trend} />
                                <span className="text-xs text-gray-500">{c.trendDelta > 0 ? '+' : ''}{c.trendDelta}%</span>
                              </div>
                            </div>
                            <DetectionBar pct={c.avgDetectionPct} />
                          </div>
                        )
                      })}
                    </div>

                    {/* Critical gaps banner */}
                    {score.criticalGaps?.length > 0 && (
                      <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-400">
                          {score.criticalGaps[0]}
                          {score.criticalGaps.length > 1 && ` (+${score.criticalGaps.length - 1} more)`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-800">
              {[
                { id: 'results', label: 'Simulation History' },
                { id: 'gaps',    label: 'Detection Gaps' },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                    tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Results tab */}
            {tab === 'results' && (
              <Card padding="none">
                {resLoad ? (
                  <div className="divide-y divide-gray-800">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4 p-4">
                        <div className="h-2.5 w-2.5 rounded-full bg-gray-800 animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-64" />
                        </div>
                        <Skeleton className="h-2 w-32" />
                      </div>
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <EmptyState icon={FlaskConical} title="No simulations run yet"
                    description="Click 'Run Simulation' to start continuous security validation."
                    action={<Button variant="primary" icon={Play} onClick={() => runScenario()}>Start First Simulation</Button>} />
                ) : (
                  results.map((r: any) => <SimResultRow key={r.id} result={r} />)
                )}
              </Card>
            )}

            {/* Gaps tab */}
            {tab === 'gaps' && (
              <Card>
                {!gaps ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-5 w-5 text-gray-600 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: 'Total Runs', value: gaps.totalRuns },
                        { label: 'Pass Rate',  value: `${gaps.passRate}%`, color: gaps.passRate >= 80 ? 'text-green-400' : 'text-yellow-400' },
                        { label: 'Period',     value: gaps.period },
                      ].map(k => (
                        <div key={k.label} className="bg-gray-800/40 rounded-lg p-3 text-center">
                          <p className={clsx('text-xl font-bold', k.color ?? 'text-gray-100')}>{k.value}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                        </div>
                      ))}
                    </div>

                    {gaps.topGapRules?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Rules with Most Gaps</p>
                        {gaps.topGapRules.map((r: any) => (
                          <div key={r.rule} className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
                            <div className="flex items-center gap-2">
                              <XCircle className="h-3.5 w-3.5 text-red-400" />
                              <span className="text-xs font-mono text-gray-300">{r.rule}</span>
                            </div>
                            <span className="text-xs text-red-400 font-bold">{r.failCount}× missed</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {gaps.scenariosWithGaps?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detection Rate by Scenario</p>
                        {gaps.scenariosWithGaps.map((s: any) => (
                          <div key={s.scenarioId} className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-400">{s.name}</span>
                              <span className="text-xs text-gray-500">{s.count}× tested</span>
                            </div>
                            <DetectionBar pct={s.pct} />
                          </div>
                        ))}
                      </div>
                    )}

                    {gaps.topGapRules?.length === 0 && gaps.scenariosWithGaps?.length === 0 && (
                      <div className="text-center py-8">
                        <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-3" />
                        <p className="text-sm text-gray-300 font-medium">No detection gaps found</p>
                        <p className="text-xs text-gray-600 mt-1">All simulated attacks were detected successfully</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* Safety banner */}
        <div className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-green-500/5 border border-green-500/15">
          <Lock className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-green-400 mb-1">Sandbox Safety Guarantee</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              All simulations use RFC 5737 TEST-NET IP addresses, synthetic <code className="text-gray-400">@sim.zonforge.internal</code> identities, and are tagged with <code className="text-gray-400">_simulation:true</code>. No real credentials are modified, no real data is accessed, and no real systems are contacted. Simulation events are automatically excluded from playbook auto-execution.
            </p>
          </div>
        </div>

      </PageContent>
    </AppShell>
  )
}
