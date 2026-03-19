import { useState } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Shield, Lock, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Play, ChevronDown, ChevronUp, Zap,
  Scale, Network, Eye, Target, ArrowRight, Globe,
  TrendingUp, BarChart3, FileText, Cpu, Hash,
} from 'lucide-react'

// ─────────────────────────────────────────────
const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

const RISK_COLOR: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400',
  medium: 'text-yellow-400', low: 'text-blue-400', safe: 'text-green-400',
}
const STATUS_COLOR: Record<string, string> = {
  compliant: 'text-green-400 bg-green-500/10', partial: 'text-yellow-400 bg-yellow-500/10',
  non_compliant: 'text-red-400 bg-red-500/10', unknown: 'text-gray-400 bg-gray-800',
}

// ─────────────────────────────────────────────
// TAB: DECEPTION TECHNOLOGY
// ─────────────────────────────────────────────

function DeceptionTab() {
  const qc = useQueryClient()
  const [deploying, setDeploying] = useState(false)

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['deception-summary'],
    queryFn:  () => fetch('/api/v1/deception/grid-summary', { headers: H() }).then(r => r.json()),
    staleTime: 60_000, refetchInterval: 30_000,
  })
  const { data: hpData } = useQuery({
    queryKey: ['deception-honeypots'],
    queryFn:  () => fetch('/api/v1/deception/honeypots', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
  })

  const summary   = summaryData?.data
  const honeypots = hpData?.data ?? []

  async function deployGrid() {
    setDeploying(true)
    await fetch('/api/v1/deception/deploy-grid', { method: 'POST', headers: H() })
    await new Promise(r => setTimeout(r, 1000))
    qc.invalidateQueries({ queryKey: ['deception-summary'] })
    qc.invalidateQueries({ queryKey: ['deception-honeypots'] })
    setDeploying(false)
  }

  const HONEYPOT_ICONS: Record<string, string> = {
    fake_credential: '🔑', fake_api_key: '🗝️', fake_s3_bucket: '🪣',
    fake_admin_account: '👤', fake_database_server: '🗄️', fake_ssh_key: '🔐',
    fake_webhook_url: '🌐', fake_internal_service: '🔧', canary_document: '📄', canary_email: '📧',
  }

  return (
    <div className="space-y-5">
      {/* Deploy grid CTA */}
      {(summary?.totalHoneypots ?? 0) === 0 && !isLoading && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-blue-500/20 p-3"><Shield className="h-6 w-6 text-blue-400" /></div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-100 mb-1">Deploy Honeypot Grid</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                10 strategic honeypots across credentials, cloud, documents, and email. Any touch = immediate high-confidence detection. Zero false positives by design.
              </p>
            </div>
            <Button variant="primary" icon={Zap} disabled={deploying} onClick={deployGrid}>
              {deploying ? 'Deploying…' : 'Deploy 10 Honeypots'}
            </Button>
          </div>
        </Card>
      )}

      {/* Grid stats */}
      {(summary?.totalHoneypots ?? 0) > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active Honeypots', value: summary?.activeCount ?? 0, icon: Shield, color: 'text-green-400' },
            { label: 'Triggered (30d)',   value: summary?.triggeredCount ?? 0, icon: AlertTriangle, color: summary?.triggeredCount > 0 ? 'text-red-400' : 'text-gray-500' },
            { label: 'Touch Events',      value: summary?.triggersLast30d ?? 0, icon: Eye, color: summary?.triggersLast30d > 0 ? 'text-orange-400' : 'text-gray-500' },
            { label: 'False Positive Rate', value: '0%', icon: CheckCircle2, color: 'text-green-400' },
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
      )}

      {/* Risk signals */}
      {summary?.riskSignals?.length > 0 && (
        <div className={clsx('flex items-start gap-3 p-4 rounded-xl border',
          summary.triggersLast30d > 0 ? 'bg-red-500/8 border-red-500/20' : 'bg-green-500/5 border-green-500/15')}>
          {summary.triggersLast30d > 0
            ? <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            : <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />}
          <p className={clsx('text-xs font-medium', summary.triggersLast30d > 0 ? 'text-red-400' : 'text-green-400')}>
            {summary.riskSignals[0]}
          </p>
        </div>
      )}

      {/* Honeypot grid */}
      {honeypots.length > 0 && (
        <Card padding="none">
          <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>Honeypot Grid ({honeypots.length})</span>
            <Button variant="outline" size="sm" icon={Zap} onClick={deployGrid} disabled={deploying}>Add More</Button>
          </div>
          <div className="divide-y divide-gray-800/50">
            {honeypots.map((hp: any) => (
              <div key={hp.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-xl flex-shrink-0">{HONEYPOT_ICONS[hp.type] ?? '🍯'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{hp.name}</p>
                  <p className="text-xs text-gray-600">{hp.placement} · {hp.type}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {hp.triggerCount > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400">
                      {hp.triggerCount}× triggered
                    </span>
                  )}
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', hp.status === 'active' ? 'text-green-400 bg-green-500/10' : hp.status === 'triggered' ? 'text-red-400 bg-red-500/10' : 'text-gray-400 bg-gray-800')}>
                    {hp.status}
                  </span>
                  <span className={clsx('text-xs font-bold', hp.alertSeverity === 'critical' ? 'text-red-400' : 'text-orange-400')}>
                    {hp.alertSeverity}
                  </span>
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
// TAB: REGULATORY AI
// ─────────────────────────────────────────────

function RegulatoryTab() {
  const [question, setQuestion] = useState('')
  const [framework, setFramework] = useState('soc2_type2')
  const [answer,    setAnswer]    = useState<any>(null)
  const [asking,    setAsking]    = useState(false)
  const [assessing, setAssessing] = useState<string | null>(null)

  const { data: frameworksData } = useQuery({
    queryKey: ['reg-frameworks'],
    queryFn:  () => fetch('/api/v1/regulatory/frameworks', { headers: H() }).then(r => r.json()),
    staleTime: Infinity,
  })
  const { data: postureData, isLoading: postureLoading } = useQuery({
    queryKey: ['reg-posture'],
    queryFn:  () => fetch('/api/v1/regulatory/posture', { headers: H() }).then(r => r.json()),
    staleTime: 5 * 60_000,
  })

  const frameworks = frameworksData?.data ?? []
  const postures   = postureData?.data   ?? []

  async function askAuditor() {
    if (!question.trim()) return
    setAsking(true); setAnswer(null)
    const r = await fetch('/api/v1/regulatory/ask-auditor', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ framework, question }),
    })
    const data = await r.json()
    setAnswer(data.data)
    setAsking(false)
  }

  return (
    <div className="space-y-5">

      {/* Framework compliance grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {postureLoading ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          postures.map((p: any) => {
            const fw = frameworks.find((f: any) => f.id === p.framework)
            return (
              <Card key={p.framework} className={clsx('hover:border-gray-700 transition-colors',
                p.overallStatus === 'non_compliant' && 'border-red-500/20')}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-200">{fw?.name ?? p.framework}</h3>
                    <p className="text-xs text-gray-600">{fw?.full}</p>
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-bold tabular-nums',
                    p.overallScore >= 80 ? 'text-green-400' : p.overallScore >= 50 ? 'text-yellow-400' : 'text-red-400')}>
                    {p.overallScore}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${p.overallScore}%`, background: p.overallScore >= 80 ? '#22c55e' : p.overallScore >= 50 ? '#eab308' : '#ef4444' }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={clsx('px-2 py-0.5 rounded font-medium', STATUS_COLOR[p.overallStatus])}>{p.overallStatus?.replace('_', ' ')}</span>
                  <span className="text-gray-600">{p.compliantCount}/{p.controlResults?.length} controls</span>
                </div>
                {p.criticalGaps?.length > 0 && (
                  <div className="mt-2 text-xs text-red-400 truncate">⚠ {p.criticalGaps[0]}</div>
                )}
              </Card>
            )
          })
        )}
      </div>

      {/* AI Auditor */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-200">Ask the AI Compliance Advisor</h3>
          <span className="text-xs text-gray-600 ml-auto">claude-sonnet-4-6</span>
        </div>

        <div className="flex gap-3 mb-3">
          <select value={framework} onChange={e => setFramework(e.target.value)}
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 focus:outline-none focus:border-blue-500">
            {frameworks.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && askAuditor()}
            placeholder="e.g. 'How do we meet CC7.1 monitoring requirements?'"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
          <Button variant="primary" size="sm" icon={asking ? RefreshCw : Cpu} onClick={askAuditor} disabled={asking || !question.trim()}>
            {asking ? 'Thinking…' : 'Ask'}
          </Button>
        </div>

        {asking && (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
            <RefreshCw className="h-4 w-4 animate-spin" /> Analyzing compliance data and generating response…
          </div>
        )}

        {answer && (
          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/15 mt-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-blue-400 font-semibold uppercase tracking-wider">{answer.framework?.replace('_',' ').toUpperCase()}</span>
              <span className="text-xs text-gray-600">· Confidence: {answer.confidence}%</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{answer.answer}</p>
            {answer.evidenceCited?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-blue-500/15">
                <p className="text-xs text-gray-500 mb-1">Evidence cited:</p>
                {answer.evidenceCited.map((e: string, i: number) => (
                  <div key={i} className="text-xs text-gray-600 font-mono">{e}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB: DIGITAL TWIN
// ─────────────────────────────────────────────

function DigitalTwinTab() {
  const qc = useQueryClient()
  const [building,    setBuilding]    = useState(false)
  const [simulating,  setSimulating]  = useState<string | null>(null)
  const [lastResult,  setLastResult]  = useState<any>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const { data: twinsData, isLoading } = useQuery({
    queryKey: ['digital-twins'],
    queryFn:  () => fetch('/api/v1/twin/list', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
  })

  const twins = twinsData?.data ?? []

  async function buildTwin() {
    setBuilding(true)
    await fetch('/api/v1/twin/build', { method: 'POST', headers: H(), body: JSON.stringify({ name: 'Production Environment Twin' }) })
    await new Promise(r => setTimeout(r, 500))
    qc.invalidateQueries({ queryKey: ['digital-twins'] })
    setBuilding(false)
  }

  async function simulate(twinId: string) {
    setSimulating(twinId); setLastResult(null)
    const r = await fetch('/api/v1/twin/simulate', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ twinId, scenarios: ['credential_attack', 'lateral_movement', 'oauth_abuse'] }),
    })
    const data = await r.json()
    setLastResult(data.data)
    setSimulating(null)
  }

  const DEPLOY_STYLES = {
    safe:     'bg-green-500/10 text-green-400 border-green-500/20',
    risky:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  return (
    <div className="space-y-5">

      {twins.length === 0 && !isLoading && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-purple-500/20 p-3"><Network className="h-6 w-6 text-purple-400" /></div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-100 mb-1">Build Digital Twin</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Automatically constructs a virtual replica of your infrastructure from existing connector data and risk scores. Simulates attack paths without touching production.
              </p>
            </div>
            <Button variant="primary" icon={Network} disabled={building} onClick={buildTwin}>
              {building ? 'Building…' : 'Build Twin'}
            </Button>
          </div>
        </Card>
      )}

      {twins.length > 0 && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Infrastructure Twins</h3>
          <Button variant="outline" size="sm" icon={Network} onClick={buildTwin} disabled={building}>
            Rebuild Twin
          </Button>
        </div>
      )}

      {twins.map((twin: any) => (
        <Card key={twin.id}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-200">{twin.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {twin.nodeCount} nodes · {twin.edgeCount} edges · Built {new Date(twin.builtAt).toLocaleString()}
              </p>
            </div>
            <Button variant="primary" size="sm" icon={simulating === twin.id ? RefreshCw : Play}
              disabled={!!simulating} onClick={() => simulate(twin.id)}>
              {simulating === twin.id ? 'Simulating…' : 'Simulate Attacks'}
            </Button>
          </div>

          {simulating === twin.id && (
            <div className="flex items-center gap-3 py-4 text-sm text-gray-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Modeling attack paths: credential attack, lateral movement, OAuth abuse…
            </div>
          )}

          {lastResult && lastResult.twinId === twin.id && (
            <div className="space-y-4 mt-2">
              {/* Deployment recommendation */}
              <div className={clsx('flex items-start gap-3 p-4 rounded-xl border', DEPLOY_STYLES[lastResult.deploymentRiskLevel as keyof typeof DEPLOY_STYLES])}>
                {lastResult.deploymentRiskLevel === 'safe'
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  : lastResult.deploymentRiskLevel === 'risky'
                  ? <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  : <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">{lastResult.deploymentRiskLevel}</p>
                  <p className="text-xs mt-0.5">{lastResult.deploymentRecommendation}</p>
                </div>
              </div>

              {/* Simulation KPIs */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Attack Paths', value: lastResult.attackPaths?.length ?? 0, color: 'text-gray-200' },
                  { label: 'Critical Paths', value: lastResult.criticalPathCount ?? 0, color: lastResult.criticalPathCount > 0 ? 'text-red-400' : 'text-gray-400' },
                  { label: 'Detection Coverage', value: `${lastResult.detectability}%`, color: lastResult.detectability >= 80 ? 'text-green-400' : 'text-yellow-400' },
                  { label: 'Undetected Steps', value: lastResult.undetectedSteps ?? 0, color: lastResult.undetectedSteps > 0 ? 'text-red-400' : 'text-green-400' },
                ].map(k => (
                  <div key={k.label} className="bg-gray-800/40 rounded-lg p-3 text-center">
                    <p className={clsx('text-xl font-bold tabular-nums', k.color)}>{k.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Attack paths */}
              {lastResult.attackPaths?.map((path: any) => (
                <div key={path.id} className="rounded-xl border border-gray-800 overflow-hidden">
                  <button onClick={() => setSelectedPath(selectedPath === path.id ? null : path.id)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-800/20 text-left transition-colors">
                    <span className={clsx('px-2 py-0.5 rounded text-xs font-bold uppercase flex-shrink-0',
                      path.severity === 'critical' ? 'bg-red-500/15 text-red-400' : path.severity === 'high' ? 'bg-orange-500/15 text-orange-400' : 'bg-yellow-500/15 text-yellow-400')}>
                      {path.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-200">{path.name}</p>
                      <p className="text-xs text-gray-500">{path.steps?.length} steps · {path.detectability}% detectable · likelihood: {path.totalLikelihood}%</p>
                    </div>
                    {path.criticalGap && <span className="text-xs text-red-400 font-bold flex-shrink-0">⚠ GAP</span>}
                    {selectedPath === path.id ? <ChevronUp className="h-4 w-4 text-gray-600" /> : <ChevronDown className="h-4 w-4 text-gray-600" />}
                  </button>
                  {selectedPath === path.id && (
                    <div className="px-4 pb-4 space-y-2 bg-gray-900/30">
                      {path.steps?.map((step: any) => (
                        <div key={step.stepNumber} className="flex items-center gap-3 text-xs">
                          <span className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 font-bold flex-shrink-0">{step.stepNumber}</span>
                          <span className="font-mono text-gray-600 flex-shrink-0">{step.technique}</span>
                          <span className="text-gray-400 flex-1">{step.description}</span>
                          {step.detectable
                            ? <span className="text-green-400 flex-shrink-0">✓ {step.detectionRule}</span>
                            : <span className="text-red-400 flex-shrink-0">✗ UNDETECTED</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Recommendations */}
              {lastResult.recommendedControls?.length > 0 && (
                <Card>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recommended Security Controls</p>
                  {lastResult.recommendedControls.slice(0, 6).map((r: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 mb-2 text-xs text-gray-400">
                      <ArrowRight className="h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" />{r}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function EnterpriseCapabilitiesPage() {
  const [tab, setTab] = useState<'deception' | 'regulatory' | 'twin'>('deception')

  return (
    <AppShell title="Enterprise Capabilities">
      <PageContent>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-800 mb-6">
          {[
            { id: 'deception',  label: 'Deception Grid',      icon: Shield,  sub: 'Honeypots' },
            { id: 'regulatory', label: 'Regulatory AI',        icon: Scale,   sub: 'Compliance Autopilot' },
            { id: 'twin',       label: 'Digital Twin',         icon: Network, sub: 'Attack Path Modeling' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
              <t.icon className="h-4 w-4" />
              {t.label}
              <span className="text-xs text-gray-600 hidden md:inline">· {t.sub}</span>
            </button>
          ))}
        </div>

        {tab === 'deception'  && <DeceptionTab />}
        {tab === 'regulatory' && <RegulatoryTab />}
        {tab === 'twin'       && <DigitalTwinTab />}

      </PageContent>
    </AppShell>
  )
}
