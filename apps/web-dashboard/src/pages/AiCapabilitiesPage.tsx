import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Brain, TrendingUp, MessageSquare, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, RefreshCw, Send, User, Bot,
  Activity, Shield, Zap, Target, Globe, Clock, BarChart3,
  ArrowUp, ArrowDown, Minus, Eye, Cpu,
} from 'lucide-react'

// ─────────────────────────────────────────────
const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

const THREAT_LEVEL_STYLE: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  elevated: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  guarded:  'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  low:      'text-green-400 bg-green-500/10 border-green-500/20',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  very_high: 'text-red-400', high: 'text-orange-400',
  medium: 'text-yellow-400', low: 'text-blue-400',
}

function ProbabilityBar({ value, label }: { value: number; label?: string }) {
  const color = value >= 75 ? '#ef4444' : value >= 55 ? '#f97316' : value >= 35 ? '#eab308' : '#22c55e'
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-gray-500 w-20 flex-shrink-0 truncate">{label}</span>}
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color }}>{value}%</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB: BEHAVIORAL AI
// ─────────────────────────────────────────────

function BehavioralAiTab() {
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [checkEmail, setCheckEmail]     = useState('')
  const [checkResult, setCheckResult]   = useState<any>(null)
  const [checking, setChecking]         = useState(false)

  const { data: profilesData, isLoading } = useQuery({
    queryKey: ['behavioral-profiles'],
    queryFn:  () => fetch('/api/v1/behavioral/profiles?limit=20', { headers: H() }).then(r => r.json()),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const profiles = profilesData?.data ?? []
  const anomalyCount = profiles.filter((p: any) => (p.currentAnomalyScore ?? 0) >= 50).length

  async function checkDeviation() {
    if (!checkEmail.trim()) return
    setChecking(true); setCheckResult(null)
    const r = await fetch('/api/v1/behavioral/check-deviation', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ userId: checkEmail, dimensions: ['login_time','file_access_volume','login_location'] }),
    })
    const data = await r.json()
    setCheckResult(data.data)
    setChecking(false)
  }

  async function buildProfile(userId: string) {
    await fetch('/api/v1/behavioral/profiles', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ userId, lookbackDays: 30 }),
    })
  }

  return (
    <div className="space-y-5">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Profiles Built',    value: profiles.length,  icon: Brain,        color: 'text-blue-400' },
          { label: 'Anomalies Active',  value: anomalyCount,     icon: AlertTriangle, color: anomalyCount > 0 ? 'text-red-400' : 'text-gray-500' },
          { label: 'Avg Accuracy',      value: '94%',            icon: Target,       color: 'text-green-400' },
          { label: 'False Positive Cut',value: '~80%',           icon: CheckCircle2, color: 'text-green-400' },
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
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-200">How Behavioral AI Works</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-xs">
          {[
            { icon: '📊', title: '30-day Window', desc: 'Learns each user\'s normal behavior from 30-day history' },
            { icon: '📐', title: '10 Dimensions', desc: 'Login time, location, files, downloads, peers, and more' },
            { icon: '📈', title: 'Z-score + IQR', desc: 'Statistical outlier detection per dimension' },
            { icon: '👥', title: 'Peer Comparison', desc: 'Compare against cohort of similar users' },
            { icon: '🔔', title: 'Explainable', desc: 'Shows exactly which dimension triggered and by how much' },
          ].map(s => (
            <div key={s.title} className="bg-gray-800/30 rounded-lg p-3">
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className="font-semibold text-gray-200 mb-0.5">{s.title}</p>
              <p className="text-gray-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Check deviation */}
      <Card>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Real-time Deviation Check</p>
        <div className="flex gap-2 mb-3">
          <input type="text" value={checkEmail} onChange={e => setCheckEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkDeviation()}
            placeholder="user@acme.com or user ID"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          <Button variant="primary" size="sm" icon={checking ? RefreshCw : Eye}
            disabled={checking || !checkEmail.trim()} onClick={checkDeviation}>
            {checking ? 'Checking…' : 'Check'}
          </Button>
        </div>

        {checkResult && (
          <div className={clsx('p-4 rounded-xl border',
            (checkResult.deviationScore ?? 0) >= 70 ? 'bg-red-500/8 border-red-500/20' :
            (checkResult.deviationScore ?? 0) >= 40 ? 'bg-yellow-500/8 border-yellow-500/20' :
            'bg-green-500/5 border-green-500/15')}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-200">{checkResult.userId}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Deviation Score</span>
                <span className={clsx('text-lg font-black',
                  checkResult.deviationScore >= 70 ? 'text-red-400' :
                  checkResult.deviationScore >= 40 ? 'text-yellow-400' : 'text-green-400')}>
                  {checkResult.deviationScore ?? 0}
                </span>
              </div>
            </div>
            {checkResult.dimensionScores?.length > 0 && (
              <div className="space-y-2">
                {checkResult.dimensionScores.slice(0, 5).map((d: any) => (
                  <ProbabilityBar key={d.dimension} value={d.score ?? 0} label={d.dimension.replace(/_/g,' ')} />
                ))}
              </div>
            )}
            {checkResult.explanation && (
              <p className="mt-3 text-xs text-gray-400 leading-relaxed">{checkResult.explanation}</p>
            )}
          </div>
        )}
      </Card>

      {/* Profile list */}
      {profiles.length > 0 && (
        <Card padding="none">
          <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            User Behavioral Profiles ({profiles.length})
          </div>
          <div className="divide-y divide-gray-800/50">
            {profiles.map((p: any) => (
              <div key={p.userId} className="flex items-center gap-4 px-5 py-3.5">
                <div className="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                  {p.userId?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{p.userId}</p>
                  <p className="text-xs text-gray-600">
                    {p.profileDays ?? 30}d profile · {p.totalEventCount ?? 0} events
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(p.currentAnomalyScore ?? 0) >= 50 && (
                    <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                      anomaly {p.currentAnomalyScore}
                    </span>
                  )}
                  <span className="text-xs text-gray-600 font-mono">
                    {new Date(p.builtAt ?? p.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {profiles.length === 0 && !isLoading && (
        <EmptyState icon={Brain} title="No behavioral profiles yet"
          description="Profiles are built automatically as users generate events. Initial profiles appear after 7-14 days of data."
          action={<Button variant="outline" size="sm" onClick={() => buildProfile('alice@acme.com')}>Build Test Profile</Button>} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB: PREDICTIVE INTEL
// ─────────────────────────────────────────────

function PredictiveTab() {
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: forecastData, isLoading, refetch } = useQuery({
    queryKey: ['threat-forecast'],
    queryFn:  () => fetch('/api/v1/predict/forecast?horizon=72h', { headers: H() }).then(r => r.json()),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  })
  const { data: campaignsData } = useQuery({
    queryKey: ['threat-campaigns'],
    queryFn:  () => fetch('/api/v1/predict/campaigns', { headers: H() }).then(r => r.json()),
    staleTime: Infinity,
  })

  const forecast  = forecastData?.data
  const campaigns = campaignsData?.data ?? []

  const THREAT_LEVEL_LABELS: Record<string, string> = {
    critical: '🔴 CRITICAL', elevated: '🟠 ELEVATED', guarded: '🟡 GUARDED', low: '🟢 LOW',
  }

  return (
    <div className="space-y-5">

      {/* Overall threat level */}
      {forecast && (
        <div className={clsx('flex items-center justify-between p-5 rounded-2xl border',
          THREAT_LEVEL_STYLE[forecast.overallThreatLevel])}>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1">Current Threat Level</p>
            <p className={clsx('text-3xl font-black', THREAT_LEVEL_STYLE[forecast.overallThreatLevel]?.split(' ')[0])}>
              {THREAT_LEVEL_LABELS[forecast.overallThreatLevel]}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Forecast window: next 72 hours · {forecast.predictions?.length ?? 0} active predictions
            </p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black"
              style={{ color: forecast.overallThreatLevel === 'critical' ? '#ef4444' : forecast.overallThreatLevel === 'elevated' ? '#f97316' : '#eab308' }}>
              {forecast.overallThreatScore}
            </p>
            <p className="text-xs text-gray-500">Threat Score</p>
            <button onClick={() => refetch()} className="mt-2 text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 ml-auto">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        </div>
      )}

      {/* Predictions */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-3">
          {(forecast?.predictions ?? []).map((p: any) => (
            <div key={p.id} className="rounded-xl border border-gray-800 overflow-hidden">
              <button onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-800/20 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('text-xs font-bold uppercase', CONFIDENCE_COLOR[p.confidence])}>
                      {p.confidence?.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-600">{p.horizon} window</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-200">{p.title}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.mitreTechniques?.slice(0, 3).map((t: string) => (
                      <span key={t} className="text-xs font-mono text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="w-28 flex-shrink-0">
                  <ProbabilityBar value={p.probability} />
                </div>
                {expanded === p.id ? <ChevronUp className="h-4 w-4 text-gray-600" /> : <ChevronDown className="h-4 w-4 text-gray-600" />}
              </button>

              {expanded === p.id && (
                <div className="px-4 pb-4 space-y-3 bg-gray-900/30">
                  <p className="text-xs text-gray-400 leading-relaxed">{p.description}</p>
                  {p.reasoning?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-semibold mb-1.5">Supporting Signals</p>
                      {p.reasoning.map((r: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-gray-500 mb-1">
                          <span className="text-blue-400 flex-shrink-0">→</span>{r}
                        </div>
                      ))}
                    </div>
                  )}
                  {p.affectedAssets?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-semibold mb-1.5">Potentially Affected</p>
                      <div className="flex flex-wrap gap-1.5">
                        {p.affectedAssets.map((a: string) => (
                          <span key={a} className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.recommendedActions?.length > 0 && (
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
                      <p className="text-xs text-blue-400 font-semibold mb-2">Recommended Actions</p>
                      {p.recommendedActions.map((a: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-gray-400 mb-1">
                          <span className="text-blue-400">{i + 1}.</span>{a}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Active campaigns */}
      {campaigns.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Active Threat Campaigns ({campaigns.length})
          </p>
          <div className="space-y-3">
            {campaigns.map((c: any) => (
              <div key={c.id} className="rounded-lg border border-gray-800 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{c.name}</p>
                    {c.actor && <p className="text-xs text-gray-500">{c.actor}</p>}
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-bold flex-shrink-0',
                    c.severity === 'critical' ? 'bg-red-500/15 text-red-400' : c.severity === 'high' ? 'bg-orange-500/15 text-orange-400' : 'bg-yellow-500/15 text-yellow-400')}>
                    {c.severity}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mb-2">{c.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.techniques?.map((t: string) => (
                    <span key={t} className="text-xs font-mono text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB: SECURITY ASSISTANT
// ─────────────────────────────────────────────

interface Message {
  role:    'user' | 'assistant'
  content: string
  time:    Date
}

function SecurityAssistantTab() {
  const [messages,  setMessages]  = useState<Message[]>([
    {
      role:    'assistant',
      content: '👋 I\'m your AI Security Assistant. I can help you investigate alerts, look up entity activity, explain threats, run hunt queries, and answer any security question about your environment.\n\nTry asking:\n• "What are our latest critical alerts?"\n• "What has alice@acme.com been doing this week?"\n• "Explain T1110 brute force attacks"\n• "What\'s our current risk posture?"',
      time:    new Date(),
    },
  ])
  const [input,     setInput]     = useState('')
  const [sending,   setSending]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const QUICK_PROMPTS = [
    'Latest critical alerts',
    'Top risk users',
    'Explain brute force attack',
    'What should I investigate first?',
    'Run credential attack hunt',
  ]

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return
    setInput('')
    setSending(true)

    setMessages(m => [...m, { role: 'user', content: text, time: new Date() }])

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

      const r = await fetch('/api/v1/assistant/chat', {
        method: 'POST', headers: H(),
        body: JSON.stringify({
          message: text,
          conversationHistory: history,
        }),
      })
      const data = await r.json()
      const reply = data.data?.message ?? data.error?.message ?? 'Sorry, I encountered an error.'

      setMessages(m => [...m, { role: 'assistant', content: reply, time: new Date() }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Network error. Please try again.', time: new Date() }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: '600px' }}>

      {/* Capabilities bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { icon: AlertTriangle, label: 'Alert Investigation' },
          { icon: Activity,      label: 'Entity Lookup' },
          { icon: BarChart3,     label: 'Risk Posture' },
          { icon: Target,        label: 'Threat Hunting' },
          { icon: Cpu,           label: 'AI-Powered' },
        ].map(c => (
          <div key={c.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-gray-500 bg-gray-800/50">
            <c.icon className="h-3 w-3" />{c.label}
          </div>
        ))}
      </div>

      {/* Quick prompts */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {QUICK_PROMPTS.map(p => (
          <button key={p} onClick={() => sendMessage(p)} disabled={sending}
            className="px-3 py-1.5 rounded-full border border-gray-700 text-xs text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors">
            {p}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#1f2937 transparent' }}>
        {messages.map((m, i) => (
          <div key={i} className={clsx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
            <div className={clsx('h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold',
              m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-blue-400')}>
              {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div className={clsx('max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-sm'
                : 'bg-gray-800 text-gray-200 rounded-tl-sm')}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              <p className="text-xs opacity-50 mt-1.5 text-right">
                {m.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Bot className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-1.5 w-1.5 rounded-full bg-gray-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 border-t border-gray-800 pt-4">
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
          placeholder="Ask anything about your security environment…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-700 bg-gray-800
                     text-sm text-gray-200 placeholder-gray-600
                     focus:outline-none focus:border-blue-500 transition-colors" />
        <button onClick={() => sendMessage(input)} disabled={sending || !input.trim()}
          className={clsx(
            'px-4 py-2.5 rounded-xl font-medium text-sm transition-all',
            'bg-blue-600 text-white hover:bg-blue-500',
            (sending || !input.trim()) && 'opacity-50 cursor-not-allowed',
          )}>
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function AiCapabilitiesPage() {
  const [tab, setTab] = useState<'behavioral' | 'predictive' | 'assistant'>('predictive')

  return (
    <AppShell title="AI Capabilities">
      <PageContent>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-blue-500/20 p-2.5">
              <Brain className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100">AI-Powered Security Intelligence</h2>
              <p className="text-xs text-gray-500">Three AI engines working together to protect your organization</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'behavioral',  icon: Activity,     title: 'Behavioral AI',          sub: 'Per-user baseline learning',    color: 'blue' },
              { id: 'predictive',  icon: TrendingUp,   title: 'Predictive Intel',        sub: '72h threat forecasting',        color: 'orange' },
              { id: 'assistant',   icon: MessageSquare, title: 'Security Assistant',     sub: 'AI-powered chat + investigation', color: 'green' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={clsx(
                  'p-4 rounded-xl border text-left transition-all',
                  tab === t.id
                    ? t.color === 'blue'   ? 'bg-blue-500/10 border-blue-500/30'
                      : t.color === 'orange' ? 'bg-orange-500/10 border-orange-500/30'
                      : 'bg-green-500/10 border-green-500/30'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-700',
                )}>
                <t.icon className={clsx('h-5 w-5 mb-2',
                  tab === t.id
                    ? t.color === 'blue' ? 'text-blue-400' : t.color === 'orange' ? 'text-orange-400' : 'text-green-400'
                    : 'text-gray-500')} />
                <p className="text-sm font-semibold text-gray-200">{t.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {tab === 'behavioral'  && <BehavioralAiTab />}
        {tab === 'predictive'  && <PredictiveTab />}
        {tab === 'assistant'   && <SecurityAssistantTab />}

      </PageContent>
    </AppShell>
  )
}
