import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Brain, TrendingUp, TrendingDown, Minus, AlertTriangle,
  BarChart3, MessageSquare, Send, RefreshCw, Zap,
  Shield, CheckCircle2, XCircle, ArrowUp, ArrowDown,
  Cpu, Target, Globe, Star, ChevronDown, ChevronUp,
  Eye, Lock,
} from 'lucide-react'

// ─────────────────────────────────────────────
const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

const THREAT_LEVEL_STYLE: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  elevated: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  moderate: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  low:      'text-green-400 bg-green-500/10 border-green-500/30',
}

const BENCH_STATUS: Record<string, { icon: React.ElementType; color: string }> = {
  above: { icon: ArrowUp,   color: 'text-green-400' },
  at:    { icon: Minus,     color: 'text-yellow-400' },
  below: { icon: ArrowDown, color: 'text-red-400' },
}

function ThreatBar({ likelihood }: { likelihood: number }) {
  const color = likelihood >= 75 ? '#ef4444' : likelihood >= 55 ? '#f97316' : likelihood >= 35 ? '#eab308' : '#22c55e'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${likelihood}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-10 text-right tabular-nums" style={{ color }}>{likelihood}%</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// CHAT WIDGET
// ─────────────────────────────────────────────

interface ChatMessage { role: 'user' | 'assistant'; content: string; toolsUsed?: string[] }

function SecurityChatWidget() {
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const { data: suggestionsData } = useQuery({
    queryKey: ['assistant-suggestions'],
    queryFn:  () => fetch('/api/v1/assistant/suggestions', { headers: H() }).then(r => r.json()),
    staleTime: 5 * 60_000,
  })
  const suggestions = suggestionsData?.data?.suggestions ?? []

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const r = await fetch('/api/v1/assistant/chat', {
        method: 'POST', headers: H(),
        body: JSON.stringify({
          sessionId,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await r.json()
      if (data.success) {
        setSessionId(data.data.sessionId)
        setMessages(prev => [...prev, {
          role:      'assistant',
          content:   data.data.message ?? 'No response',
          toolsUsed: data.data.toolsUsed,
        }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 min-h-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8">
            <div className="rounded-2xl bg-blue-500/10 p-4 mb-4">
              <Brain className="h-8 w-8 text-blue-400" />
            </div>
            <p className="text-sm font-semibold text-gray-300 mb-2">ZonForge Security AI</p>
            <p className="text-xs text-gray-500 text-center max-w-xs mb-5">
              Ask me anything about your security posture, specific users, IPs, or recent incidents.
            </p>
            {/* Quick suggestions */}
            <div className="w-full space-y-2">
              {suggestions.slice(0, 4).map((s: string) => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="w-full text-left text-xs text-gray-400 px-3 py-2 rounded-xl
                             border border-gray-800 hover:border-blue-500/40 hover:bg-blue-500/5
                             transition-all truncate">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-800 text-gray-200 rounded-bl-none')}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {msg.toolsUsed.map(t => (
                      <span key={t} className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded">
                        🔧 {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              <span className="text-xs text-gray-400">Analyzing…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3 border-t border-gray-800">
        <div className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            placeholder="Ask about security events, users, IPs…"
            className="flex-1 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-xs
                       text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
            className={clsx('p-2 rounded-xl bg-blue-600 text-white transition-all',
              (loading || !input.trim()) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500')}>
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 text-center">
          Powered by claude-sonnet-4-6 · Real-time data access
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function AiIntelligencePage() {
  const [tab, setTab] = useState<'forecast'|'behavioral'|'triage'|'benchmark'>('forecast')
  const [expandedPath, setExpandedPath] = useState<string | null>(null)

  const { data: forecastData, isLoading: fcLoad } = useQuery({
    queryKey: ['threat-forecast'],
    queryFn:  () => fetch('/api/v1/ai/threat-forecast', { headers: H() }).then(r => r.json()),
    staleTime: 60 * 60_000,
    enabled:  tab === 'forecast',
  })
  const { data: benchData, isLoading: bchLoad } = useQuery({
    queryKey: ['benchmark'],
    queryFn:  () => fetch('/api/v1/ai/benchmark', { headers: H() }).then(r => r.json()),
    staleTime: 30 * 60_000,
    enabled:  tab === 'benchmark',
  })
  const { data: behavioralData } = useQuery({
    queryKey: ['behavioral-stats'],
    queryFn:  () => fetch('/api/v1/behavioral/stats', { headers: H() }).then(r => r.json()),
    staleTime: 5 * 60_000,
  })
  const { data: triageData } = useQuery({
    queryKey: ['triage-queue'],
    queryFn:  () => fetch('/api/v1/triage/queue?limit=10', { headers: H() }).then(r => r.json()),
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: tab === 'triage',
  })

  const forecast  = forecastData?.data
  const benchmark = benchData?.data
  const bStats    = behavioralData?.data
  const triageQ   = triageData?.data ?? []

  return (
    <AppShell
      title="AI Intelligence"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Cpu className="h-3.5 w-3.5" />
            5 AI Systems Active
          </div>
        </div>
      }
    >
      <PageContent>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" style={{ minHeight: 'calc(100vh - 160px)' }}>

          {/* ── Left: AI Features ─────────────── */}
          <div className="xl:col-span-2 flex flex-col gap-4">

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-800">
              {[
                { id: 'forecast',   label: 'Threat Forecast',  icon: Target },
                { id: 'triage',     label: 'Smart Triage',     icon: Zap },
                { id: 'behavioral', label: 'Behavioral AI',    icon: Eye },
                { id: 'benchmark',  label: 'Benchmarks',       icon: BarChart3 },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                    tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* THREAT FORECAST */}
            {tab === 'forecast' && (
              <div className="space-y-4">
                {fcLoad ? <Skeleton className="h-64 w-full" /> : !forecast ? null : (
                  <>
                    {/* Overall threat level */}
                    <div className={clsx('rounded-2xl border p-5', THREAT_LEVEL_STYLE[forecast.overallThreatLevel] ?? 'bg-gray-900 border-gray-800')}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">72-Hour Threat Forecast</p>
                          <h2 className="text-2xl font-black mt-1">{forecast.overallThreatLevel?.toUpperCase()} THREAT LEVEL</h2>
                        </div>
                        <Target className="h-10 w-10 opacity-50" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {forecast.topRisks?.map((r: string, i: number) => (
                          <span key={i} className="text-xs bg-black/20 px-3 py-1 rounded-full">{r}</span>
                        ))}
                      </div>
                    </div>

                    {/* Category forecasts */}
                    <div className="space-y-3">
                      {forecast.categories?.map((cat: any) => (
                        <Card key={cat.category}>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <h3 className="text-sm font-semibold text-gray-200">{cat.category}</h3>
                              <p className="text-xs text-gray-500 mt-0.5">{cat.recommendation}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {cat.trend === 'increasing' ? <TrendingUp className="h-4 w-4 text-red-400" />
                                : cat.trend === 'decreasing' ? <TrendingDown className="h-4 w-4 text-green-400" />
                                : <Minus className="h-4 w-4 text-gray-500" />}
                              <span className="text-xs text-gray-500 capitalize">{cat.trend}</span>
                            </div>
                          </div>
                          <ThreatBar likelihood={cat.likelihood} />
                          {cat.signals?.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {cat.signals.slice(0, 2).map((s: string, i: number) => (
                                <div key={i} className="text-xs text-gray-600 flex items-center gap-1.5">
                                  <span className="h-1 w-1 rounded-full bg-gray-600 flex-shrink-0" />{s}
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>

                    {/* Global campaigns */}
                    <Card>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Active Global Campaigns
                      </p>
                      {forecast.activeGlobalCampaigns?.map((c: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-gray-400 mb-2">
                          <Globe className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />{c}
                        </div>
                      ))}
                    </Card>
                  </>
                )}
              </div>
            )}

            {/* SMART TRIAGE */}
            {tab === 'triage' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
                  <Zap className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <p className="text-xs text-gray-400">
                    AI-sorted alert queue using asset criticality, threat intel, behavioral deviation, blast radius, and dwell time.
                  </p>
                </div>
                <Card padding="none">
                  <div className="px-5 py-2.5 border-b border-gray-800 grid text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    style={{ gridTemplateColumns: '80px 1fr 100px 80px' }}>
                    <span>AI Score</span><span>Alert</span><span>AI Priority</span><span>Time</span>
                  </div>
                  {triageQ.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-xs text-gray-600">
                      No open alerts · Queue clear
                    </div>
                  ) : (
                    triageQ.map((a: any) => (
                      <div key={a.id}
                        className="grid items-center gap-4 px-5 py-3.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20"
                        style={{ gridTemplateColumns: '80px 1fr 100px 80px' }}>
                        {/* Score ring */}
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-black tabular-nums"
                            style={{ color: a.aiUrgencyScore >= 75 ? '#ef4444' : a.aiUrgencyScore >= 55 ? '#f97316' : a.aiUrgencyScore >= 35 ? '#eab308' : '#22c55e' }}>
                            {a.aiUrgencyScore}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 truncate">{a.title}</p>
                          <p className="text-xs text-gray-600 truncate">{a.analystGuidance?.slice(0, 80)}</p>
                          {a.priorityChanged && (
                            <span className="text-xs text-yellow-400">
                              {a.priority} → {a.aiPriority} (re-prioritized)
                            </span>
                          )}
                        </div>
                        <span className={clsx('px-2 py-0.5 rounded text-xs font-bold',
                          a.aiPriority === 'P0' ? 'bg-red-600 text-white' :
                          a.aiPriority === 'P1' ? 'bg-red-500/15 text-red-400' :
                          a.aiPriority === 'P2' ? 'bg-orange-500/15 text-orange-400' :
                          'bg-gray-700 text-gray-400')}>
                          {a.aiPriority}
                        </span>
                        <span className="text-xs text-gray-600">
                          {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </Card>
              </div>
            )}

            {/* BEHAVIORAL AI */}
            {tab === 'behavioral' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'User Profiles', value: bStats?.totalProfiles ?? '—', icon: Eye, color: 'text-blue-400' },
                    { label: 'Stable Baselines', value: bStats?.stableProfiles ?? '—', icon: CheckCircle2, color: 'text-green-400' },
                    { label: 'Avg Confidence', value: bStats ? `${bStats.avgConfidence}%` : '—', icon: Brain, color: 'text-purple-400' },
                  ].map(k => (
                    <Card key={k.label} className="text-center">
                      <k.icon className={clsx('h-5 w-5 mx-auto mb-2', k.color)} />
                      <p className={clsx('text-2xl font-bold tabular-nums', k.color)}>{k.value}</p>
                      <p className="text-xs text-gray-500">{k.label}</p>
                    </Card>
                  ))}
                </div>

                <Card>
                  <h3 className="text-sm font-semibold text-gray-200 mb-4">How Behavioral AI Works</h3>
                  <div className="space-y-3">
                    {[
                      { step: '1', label: 'Profile Building',    desc: '30-day rolling window per user — login times, locations, file access patterns, peer comparison' },
                      { step: '2', label: 'Real-Time Scoring',   desc: 'Every event scored against baseline — z-score, IQR fence, peer percentile, location novelty' },
                      { step: '3', label: 'Anomaly Detection',   desc: 'Deviations flagged with severity, z-score, and human-readable deviation explanation' },
                      { step: '4', label: 'Alert Enrichment',    desc: 'Alert priority boosted when behavioral anomaly accompanies security event' },
                    ].map(s => (
                      <div key={s.step} className="flex gap-3">
                        <span className="h-6 w-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{s.step}</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-300">{s.label}</p>
                          <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/15">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <p className="text-xs font-semibold text-green-400">Impact: 80% False Positive Reduction</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    By establishing individual behavioral baselines, ZonForge reduces noise from generic threshold rules.
                    Example: 100 file downloads at 2am by alice@acme.com (who always works nights) = NOT an alert.
                    100 downloads at 2am by bob@acme.com (who never works nights) = HIGH severity alert.
                  </p>
                </div>
              </div>
            )}

            {/* BENCHMARK */}
            {tab === 'benchmark' && (
              <div className="space-y-4">
                {bchLoad ? <Skeleton className="h-64 w-full" /> : !benchmark ? null : (
                  <>
                    {/* Overall percentile */}
                    <Card className="text-center">
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Your Security Ranking</p>
                          <p className="text-4xl font-black text-blue-400">{benchmark.percentile}th</p>
                          <p className="text-sm text-gray-400">percentile in your industry</p>
                          {benchmark.achievementBadges?.length > 0 && (
                            <div className="flex gap-2 mt-3 flex-wrap">
                              {benchmark.achievementBadges.map((b: string) => (
                                <span key={b} className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded-lg border border-yellow-500/20">{b}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500 mb-1">Your Score</p>
                          <p className="text-3xl font-black text-gray-100">{benchmark.overallScore}</p>
                          <p className="text-xs text-gray-600">Industry median: {benchmark.industryMedian}</p>
                        </div>
                      </div>
                    </Card>

                    {/* Dimension table */}
                    <Card padding="none">
                      <div className="px-5 py-2.5 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider grid" style={{ gridTemplateColumns: '1fr 80px 80px 100px' }}>
                        <span>Dimension</span><span className="text-right">Yours</span><span className="text-right">Industry</span><span className="text-right">Gap to Top 25%</span>
                      </div>
                      {benchmark.dimensions?.map((d: any) => {
                        const ST = BENCH_STATUS[d.status] ?? BENCH_STATUS['at']!
                        return (
                          <div key={d.name} className="grid items-center gap-4 px-5 py-3.5 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20"
                            style={{ gridTemplateColumns: '1fr 80px 80px 100px' }}>
                            <div>
                              <div className="flex items-center gap-2">
                                <ST.icon className={clsx('h-3.5 w-3.5', ST.color)} />
                                <p className="text-sm text-gray-200">{d.name}</p>
                              </div>
                              {d.status === 'below' && d.improvementSteps?.[0] && (
                                <p className="text-xs text-gray-600 mt-0.5 ml-5">{d.improvementSteps[0]}</p>
                              )}
                            </div>
                            <p className={clsx('text-sm font-bold text-right', ST.color)}>{d.yourValue}</p>
                            <p className="text-sm text-gray-500 text-right">{d.industryMedian}</p>
                            <p className={clsx('text-xs text-right', d.status === 'above' ? 'text-green-400' : 'text-gray-500')}>{d.gapToTop25}</p>
                          </div>
                        )
                      })}
                    </Card>

                    {/* Upgrade recommendation */}
                    {benchmark.upgradeRecommendation && (
                      <div className="p-4 rounded-xl bg-blue-500/8 border border-blue-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="h-4 w-4 text-blue-400" />
                          <p className="text-xs font-bold text-blue-400">Upgrade Recommendation</p>
                          <span className="ml-auto text-xs text-gray-600">
                            {benchmark.upgradeRecommendation.currentPlan} → {benchmark.upgradeRecommendation.recommendedPlan}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mb-1">{benchmark.upgradeRecommendation.reason}</p>
                        <p className="text-xs text-blue-400 font-medium">{benchmark.upgradeRecommendation.estimatedValue}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Security Assistant Chat ──── */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-gray-200">Security AI Assistant</h3>
              <span className="ml-auto text-xs text-gray-600">claude-sonnet-4-6</span>
            </div>
            <Card padding="none" className="flex-1 flex flex-col overflow-hidden"
              style={{ minHeight: '600px' }}>
              <SecurityChatWidget />
            </Card>
          </div>

        </div>
      </PageContent>
    </AppShell>
  )
}
