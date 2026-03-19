import { useState, useRef } from 'react'
import { clsx } from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  FileText, Download, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Shield, BarChart3, Zap, Upload, Settings,
  TrendingUp, TrendingDown, Minus, ExternalLink, Clock,
  Server, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react'

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────

const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

// ─────────────────────────────────────────────
// REPORT CARD
// ─────────────────────────────────────────────

function ReportCard({
  icon: Icon, title, description, period, generating, onGenerate, lastGenerated, badge,
}: {
  icon:          React.ElementType
  title:         string
  description:   string
  period:        string
  generating:    boolean
  onGenerate:    () => void
  lastGenerated?: string
  badge?:        string
}) {
  return (
    <Card className="hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-gray-800 p-3 flex-shrink-0">
          <Icon className="h-5 w-5 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
            {badge && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/10 text-green-400">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{description}</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {period}
            </span>
            {lastGenerated && (
              <span className="text-xs text-gray-700">
                Last: {new Date(lastGenerated).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="primary" size="sm"
          icon={generating ? RefreshCw : Download}
          onClick={onGenerate}
          disabled={generating}
          className={clsx('flex-shrink-0', generating && 'animate-pulse')}
        >
          {generating ? 'Generating…' : 'Generate'}
        </Button>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────
// SOC2 EVIDENCE VIEWER
// ─────────────────────────────────────────────

function Soc2Viewer({ pkg }: { pkg: any }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const statusIcon = (s: string) => ({
    compliant: <CheckCircle2 className="h-4 w-4 text-green-400" />,
    partial:   <AlertTriangle className="h-4 w-4 text-yellow-400" />,
    gap:       <XCircle className="h-4 w-4 text-red-400" />,
  }[s] ?? null)

  const statusColor = (s: string) => ({
    compliant: 'bg-green-500/10 text-green-400 border-green-500/20',
    partial:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    gap:       'bg-red-500/10 text-red-400 border-red-500/20',
  }[s] ?? 'bg-gray-700 text-gray-400')

  return (
    <div className="space-y-4">
      {/* Package header */}
      <div className="rounded-xl border border-gray-800 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-gray-100">SOC2 Type II Evidence Package</h3>
            <p className="text-xs text-gray-500 mt-1">
              Tenant: {pkg.tenantName} ·
              Period: {new Date(pkg.period.from).toLocaleDateString()} –{' '}
              {new Date(pkg.period.to).toLocaleDateString()} ·
              Generated: {new Date(pkg.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <div className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border',
              pkg.summary.overallStatus === 'compliant' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              pkg.summary.overallStatus === 'partial' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
              'bg-red-500/10 text-red-400 border-red-500/20')}>
              {statusIcon(pkg.summary.overallStatus)}
              {pkg.summary.overallStatus === 'compliant' ? 'All Controls Compliant'
               : pkg.summary.overallStatus === 'partial' ? 'Partial Compliance'
               : 'Non-Compliant'}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs justify-end">
              <span className="text-green-400">{pkg.summary.compliantControls} compliant</span>
              {pkg.summary.partialControls > 0 && <span className="text-yellow-400">{pkg.summary.partialControls} partial</span>}
              {pkg.summary.gapControls > 0 && <span className="text-red-400">{pkg.summary.gapControls} gaps</span>}
            </div>
          </div>
        </div>
        {pkg.downloadUrl && (
          <a href={pkg.downloadUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-400 hover:underline">
            <Download className="h-3 w-3" /> Download Evidence Package (S3)
          </a>
        )}
      </div>

      {/* Control sections */}
      {pkg.sections?.map((section: any) => (
        <div key={section.controlId} className="rounded-xl border border-gray-800 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === section.controlId ? null : section.controlId)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              {statusIcon(section.status)}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-200">{section.controlId}</span>
                  <span className="text-sm text-gray-400">{section.controlName}</span>
                </div>
                <p className="text-xs text-gray-600">{section.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border capitalize',
                statusColor(section.status))}>
                {section.status}
              </span>
              {expanded === section.controlId ? <ChevronUp className="h-4 w-4 text-gray-600" /> : <ChevronDown className="h-4 w-4 text-gray-600" />}
            </div>
          </button>

          {expanded === section.controlId && (
            <div className="px-4 pb-4 pt-0 border-t border-gray-800 space-y-4">
              {/* Evidence data */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Evidence</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(section.evidence ?? {}).filter(([k]) => k !== 'sampleAuditEntries').map(([k, v]) => (
                    <div key={k} className="bg-gray-800/40 rounded-lg p-2.5">
                      <p className="text-xs text-gray-500 mb-0.5">{k.replace(/([A-Z])/g, ' $1').trim()}</p>
                      <p className="text-sm font-medium text-gray-200 truncate">{String(v)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gaps */}
              {section.gaps?.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/8 border border-red-500/20">
                  <p className="text-xs font-semibold text-red-400 mb-2">Gaps Identified</p>
                  {section.gaps.map((g: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-300">
                      <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      {g}
                    </div>
                  ))}
                </div>
              )}

              {/* Remediation */}
              {section.remediation?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Remediation</p>
                  {section.remediation.map((r: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-gray-400 mb-1.5">
                      <ArrowRight className="h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5" />
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// EXECUTIVE REPORT VIEWER
// ─────────────────────────────────────────────

function ExecutiveViewer({ report }: { report: any }) {
  const deltaColor = report.headline.postureScoreDelta > 0 ? 'text-green-400'
    : report.headline.postureScoreDelta < 0 ? 'text-red-400' : 'text-gray-400'
  const DeltaIcon = report.headline.postureScoreDelta > 0 ? TrendingUp
    : report.headline.postureScoreDelta < 0 ? TrendingDown : Minus

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-100">
            {report.period.label} Executive Security Report
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {report.tenantName} ·
            {new Date(report.period.from).toLocaleDateString()} –{' '}
            {new Date(report.period.to).toLocaleDateString()} ·
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Posture Score', value: report.headline.postureScore,
            sub: <span className={clsx('flex items-center gap-0.5 text-xs', deltaColor)}><DeltaIcon className="h-3 w-3" />{Math.abs(report.headline.postureScoreDelta)}</span> },
          { label: 'Open Critical', value: report.headline.openCriticalAlerts,
            color: report.headline.openCriticalAlerts > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Incidents', value: report.headline.totalIncidents,
            sub: <span className="text-xs text-gray-600">{report.headline.resolvedIncidents} resolved</span> },
          { label: 'Resolution Rate', value: `${report.headline.resolutionRate}%`,
            color: report.headline.resolutionRate >= 80 ? 'text-green-400' : 'text-yellow-400' },
        ].map((k, i) => (
          <div key={i} className="bg-gray-800/40 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{k.label}</p>
            <p className={clsx('text-2xl font-bold tabular-nums', k.color ?? 'text-gray-100')}>{k.value}</p>
            {k.sub && <div className="mt-1">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Detection + Risk in 2 cols */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detection Performance</p>
          {[
            { label: 'MTTD P50', value: `${report.detection.mttdP50Minutes}min` },
            { label: 'MTTD P90', value: `${report.detection.mttdP90Minutes}min` },
            { label: 'False Positive Rate', value: `${report.detection.falsePositiveRate}%` },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <span className="text-xs text-gray-500">{r.label}</span>
              <span className="text-sm font-bold text-gray-200">{r.value}</span>
            </div>
          ))}
        </Card>
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Risk Overview</p>
          {[
            { label: 'Avg User Risk', value: report.risk.avgUserRiskScore },
            { label: 'High Risk Users', value: report.risk.highRiskUsers, color: report.risk.highRiskUsers > 0 ? 'text-orange-400' : 'text-gray-400' },
            { label: 'Critical Risk Users', value: report.risk.criticalRiskUsers, color: report.risk.criticalRiskUsers > 0 ? 'text-red-400' : 'text-gray-400' },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <span className="text-xs text-gray-500">{r.label}</span>
              <span className={clsx('text-sm font-bold', r.color ?? 'text-gray-200')}>{r.value}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Recommendations */}
      {report.recommendations?.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Recommendations
          </p>
          {report.recommendations.map((r: string, i: number) => (
            <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">{i + 1}</span>
              <p className="text-sm text-gray-400 leading-relaxed">{r}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function ComplianceReportsPage() {
  const [tab,        setTab]       = useState<'reports'|'siem'|'vuln'>('reports')
  const [generating, setGenerating]= useState<string | null>(null)
  const [result,     setResult]    = useState<any>(null)
  const [resultType, setResultType]= useState<'soc2'|'executive'|null>(null)
  const [siemTest,   setSiemTest]  = useState<any>(null)
  const [vulnResult, setVulnResult]= useState<any>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // SIEM config state
  const [siemProvider, setSiemProvider] = useState<'splunk'|'sentinel'|'generic_syslog'>('splunk')
  const [siemEnabled, setSiemEnabled]   = useState(false)
  const [splunkUrl,   setSplunkUrl]     = useState('')
  const [splunkToken, setSplunkToken]   = useState('')
  const [sentinelWs,  setSentinelWs]    = useState('')
  const [sentinelKey, setSentinelKey]   = useState('')

  async function generateReport(type: 'soc2' | 'executive', days: number) {
    setGenerating(type)
    setResult(null)
    try {
      const endpoint = type === 'soc2' ? '/api/v1/compliance/reports/soc2' : '/api/v1/compliance/reports/executive'
      const r = await fetch(endpoint, { method: 'POST', headers: H(), body: JSON.stringify({ periodDays: days }) })
      const data = await r.json()
      if (data.success) { setResult(data.data); setResultType(type) }
    } finally { setGenerating(null) }
  }

  async function testSiem() {
    setSiemTest(null)
    const config = {
      provider:      siemProvider,
      enabled:       true,
      splunkHecUrl:  splunkUrl,
      splunkHecToken: splunkToken,
      sentinelWorkspaceId: sentinelWs,
      sentinelSharedKey:   sentinelKey,
    }
    const r = await fetch('/api/v1/compliance/siem/test', { method: 'POST', headers: H(), body: JSON.stringify(config) })
    const data = await r.json()
    setSiemTest(data.data)
  }

  async function handleFileUpload(file: File) {
    setVulnResult(null)
    setUploadError(null)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/v1/compliance/vuln/upload', {
      method: 'POST',
      headers: { Authorization: H().Authorization },
      body: form,
    })
    const data = await r.json()
    if (data.success) setVulnResult(data.data)
    else setUploadError(data.error?.message ?? 'Upload failed')
  }

  return (
    <AppShell title="Compliance & Reports">
      <PageContent>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-800 mb-6">
          {[
            { id: 'reports', label: 'Report Generation', icon: FileText },
            { id: 'siem',    label: 'SIEM Integration',  icon: Server },
            { id: 'vuln',    label: 'Vulnerability Feed', icon: Shield },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── REPORTS TAB ──────────────────────── */}
        {tab === 'reports' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <ReportCard
                icon={Shield}
                title="SOC2 Type II Evidence Package"
                description="Automated evidence collection across CC6, CC7, CC8, and A1 trust service criteria. Includes audit trail, alert metrics, connector health, and gap analysis."
                period="90-day audit period"
                generating={generating === 'soc2'}
                onGenerate={() => generateReport('soc2', 90)}
                badge="SOC2"
              />
              <ReportCard
                icon={BarChart3}
                title="Monthly Executive Report"
                description="Non-technical summary for leadership: posture trend, incident summary, MTTD performance, top risk entities, and actionable recommendations."
                period="30-day rolling period"
                generating={generating === 'executive'}
                onGenerate={() => generateReport('executive', 30)}
                badge="PDF"
              />
              <ReportCard
                icon={FileText}
                title="Weekly Security Digest"
                description="Week-over-week change in alerts, risk scores, and connector health. Designed for security team standup."
                period="7-day period"
                generating={generating === 'weekly'}
                onGenerate={() => generateReport('executive', 7)}
              />
              <ReportCard
                icon={Zap}
                title="MTTD SLA Performance"
                description="Detection time percentiles (P50/P90/P99), SLA breach analysis, and rule-by-rule detection latency breakdown."
                period="30-day period"
                generating={generating === 'mttd'}
                onGenerate={() => generateReport('executive', 30)}
              />
            </div>

            <div className="lg:col-span-3">
              {generating && (
                <Card className="flex flex-col items-center justify-center py-16">
                  <RefreshCw className="h-10 w-10 text-blue-400 animate-spin mb-4" />
                  <p className="text-sm text-gray-400">Generating report…</p>
                  <p className="text-xs text-gray-600 mt-1">Querying security data, calculating metrics</p>
                </Card>
              )}

              {!generating && !result && (
                <Card className="flex flex-col items-center justify-center py-16 h-full">
                  <div className="rounded-2xl bg-gray-800/50 p-5 mb-4">
                    <FileText className="h-10 w-10 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400 mb-2">No report generated yet</p>
                  <p className="text-xs text-gray-600 text-center max-w-xs">
                    Select a report type from the left and click Generate. Reports are produced in real-time from your security data.
                  </p>
                </Card>
              )}

              {!generating && result && resultType === 'soc2' && <Soc2Viewer pkg={result} />}
              {!generating && result && resultType === 'executive' && <ExecutiveViewer report={result} />}
            </div>
          </div>
        )}

        {/* ── SIEM TAB ────────────────────────── */}
        {tab === 'siem' && (
          <div className="max-w-2xl">
            <Card>
              <h3 className="text-sm font-semibold text-gray-200 mb-1">SIEM Integration</h3>
              <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                Forward ZonForge alerts and signals to your SIEM in real-time. Supports Splunk HEC, Microsoft Sentinel, and generic webhooks.
              </p>

              {/* Provider selector */}
              <div className="mb-5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { id: 'splunk',        label: 'Splunk' },
                    { id: 'sentinel',      label: 'Microsoft Sentinel' },
                    { id: 'generic_syslog', label: 'Webhook / Syslog' },
                  ].map(p => (
                    <button key={p.id} onClick={() => setSiemProvider(p.id as any)}
                      className={clsx(
                        'py-2.5 rounded-xl text-xs font-medium transition-all border',
                        siemProvider === p.id ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600',
                      )}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Splunk fields */}
              {siemProvider === 'splunk' && (
                <div className="space-y-3 mb-5">
                  {[
                    { label: 'HEC URL',   value: splunkUrl,   set: setSplunkUrl,   ph: 'https://your-splunk:8088/services/collector' },
                    { label: 'HEC Token', value: splunkToken, set: setSplunkToken, ph: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-xs font-medium text-gray-500">{f.label}</label>
                      <input type="text" value={f.value} onChange={e => f.set(e.target.value)}
                        placeholder={f.ph}
                        className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" />
                    </div>
                  ))}
                </div>
              )}

              {/* Sentinel fields */}
              {siemProvider === 'sentinel' && (
                <div className="space-y-3 mb-5">
                  {[
                    { label: 'Workspace ID', value: sentinelWs,  set: setSentinelWs,  ph: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
                    { label: 'Shared Key',   value: sentinelKey, set: setSentinelKey, ph: 'base64-encoded-key' },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-xs font-medium text-gray-500">{f.label}</label>
                      <input type="text" value={f.value} onChange={e => f.set(e.target.value)}
                        placeholder={f.ph}
                        className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" />
                    </div>
                  ))}
                </div>
              )}

              {/* Enable + test */}
              <div className="flex items-center gap-3">
                <button onClick={() => setSiemEnabled(v => !v)}
                  className={clsx('relative h-6 w-11 rounded-full transition-colors', siemEnabled ? 'bg-blue-600' : 'bg-gray-700')}>
                  <div className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', siemEnabled ? 'translate-x-5.5' : 'translate-x-0.5')} />
                </button>
                <span className="text-sm text-gray-300">{siemEnabled ? 'Enabled' : 'Disabled'}</span>
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={testSiem}>Test Connection</Button>
                  <Button variant="primary" size="sm" onClick={() => {}}>Save Config</Button>
                </div>
              </div>

              {/* Test result */}
              {siemTest && (
                <div className={clsx('mt-4 flex items-center gap-3 p-3 rounded-xl border',
                  siemTest.testPassed ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20')}>
                  {siemTest.testPassed
                    ? <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                  <p className={clsx('text-xs font-medium', siemTest.testPassed ? 'text-green-400' : 'text-red-400')}>
                    {siemTest.testPassed
                      ? `Connection successful — test event forwarded`
                      : `Connection failed — check credentials and URL`}
                  </p>
                </div>
              )}
            </Card>

            {/* What gets forwarded */}
            <Card className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">What Gets Forwarded</h4>
              <div className="space-y-2">
                {[
                  ['Alerts', 'All P1/P2/P3 alerts on creation and status change'],
                  ['Detection Signals', 'Raw rule hits before alert creation'],
                  ['Risk Changes', 'When user/asset risk score crosses severity threshold'],
                  ['Playbook Executions', 'Automated response action results'],
                ].map(([label, desc]) => (
                  <div key={label} className="flex items-start gap-3">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500/60 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-medium text-gray-300">{label}</span>
                      <span className="text-xs text-gray-600 ml-2">{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── VULNERABILITY TAB ────────────────── */}
        {tab === 'vuln' && (
          <div className="max-w-2xl">
            <Card className="mb-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-1">Vulnerability Scanner Upload</h3>
              <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                Upload scan results from Tenable, Qualys, OpenVAS, or any CSV/JSON format. Findings are parsed, indexed, and merged into your asset risk scores.
              </p>

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f) }}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer
                           hover:border-blue-500/50 hover:bg-blue-500/3 transition-all"
              >
                <Upload className="h-8 w-8 text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-400 mb-1">Drop scan file here or click to upload</p>
                <p className="text-xs text-gray-600">Tenable .nessus · Qualys XML · OpenVAS · CSV · JSON · Max 50MB</p>
                <input ref={fileRef} type="file" className="hidden"
                  accept=".json,.csv,.xml,.nessus"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
              </div>

              {/* Supported formats */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {['Tenable / Nessus (.nessus, JSON)', 'Qualys VMDR (XML)', 'OpenVAS Report (XML)', 'Generic JSON array', 'CSV (header-based)', 'Any structured format'].map(f => (
                  <div key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <CheckCircle2 className="h-3 w-3 text-green-500/60" />{f}
                  </div>
                ))}
              </div>
            </Card>

            {/* Upload error */}
            {uploadError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20 mb-4">
                <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">{uploadError}</p>
              </div>
            )}

            {/* Upload result */}
            {vulnResult && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-semibold text-gray-200">Upload Processed Successfully</span>
                  <span className="text-xs text-gray-600 ml-auto font-mono">{vulnResult.uploadId?.slice(0, 8)}…</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Total Findings',   value: vulnResult.totalFindings,  color: 'text-gray-200' },
                    { label: 'Critical',          value: vulnResult.criticalCount,  color: vulnResult.criticalCount > 0 ? 'text-red-400' : 'text-gray-400' },
                    { label: 'High',              value: vulnResult.highCount,      color: vulnResult.highCount > 0 ? 'text-orange-400' : 'text-gray-400' },
                    { label: 'Assets Affected',   value: vulnResult.assetsAffected, color: 'text-gray-200' },
                  ].map(k => (
                    <div key={k.label} className="bg-gray-800/40 rounded-lg p-3 text-center">
                      <p className={clsx('text-xl font-bold tabular-nums', k.color)}>{k.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Format: <span className="font-mono text-gray-300">{vulnResult.format}</span></span>
                  <span className="text-gray-500">Risk Impact: <span className={clsx('font-bold',
                    vulnResult.riskScoreImpact === 'high' ? 'text-red-400' : vulnResult.riskScoreImpact === 'medium' ? 'text-yellow-400' : 'text-green-400'
                  )}>{vulnResult.riskScoreImpact}</span></span>
                  <span className="text-gray-500">Processed in <span className="text-gray-300">{vulnResult.processingMs}ms</span></span>
                </div>

                {vulnResult.topCves?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <p className="text-xs text-gray-500 mb-2">Top CVEs Found</p>
                    <div className="flex flex-wrap gap-1.5">
                      {vulnResult.topCves.map((cve: string) => (
                        <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${cve}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded hover:underline">
                          {cve}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

      </PageContent>
    </AppShell>
  )
}
