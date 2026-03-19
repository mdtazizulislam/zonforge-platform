import { useState, useRef } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Lock, FileText, FlaskConical, CheckCircle2, XCircle,
  RefreshCw, Copy, ExternalLink, ChevronDown, ChevronUp,
  AlertTriangle, TrendingUp, DollarSign, Users, Clock,
  Shield, Download, Play, Plus, Settings, Check,
} from 'lucide-react'

// ─────────────────────────────────────────────
const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

// ─────────────────────────────────────────────
// TAB: SSO CONFIGURATION
// ─────────────────────────────────────────────

function SsoTab() {
  const qc = useQueryClient()
  const [provider, setProvider] = useState('okta')
  const [form, setForm] = useState({
    idpEntityId: '', idpSsoUrl: '', idpCertificate: '',
    emailAttr: 'email', jitEnabled: true, jitDefaultRole: 'ANALYST',
  })
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const { data: ssoData, isLoading } = useQuery({
    queryKey: ['sso-config'],
    queryFn:  () => fetch('/api/v1/sso/config', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
  })

  const sso = ssoData?.data

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function saveSso() {
    setSaving(true)
    await fetch('/api/v1/sso/config', {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        provider,
        idpEntityId:   form.idpEntityId,
        idpSsoUrl:     form.idpSsoUrl,
        idpCertificate: form.idpCertificate,
        attributeMap:  { email: form.emailAttr },
        jitEnabled:    form.jitEnabled,
        jitDefaultRole: form.jitDefaultRole,
        allowedDomains: [],
      }),
    })
    qc.invalidateQueries({ queryKey: ['sso-config'] })
    setSaving(false)
  }

  const PROVIDERS = [
    { id: 'okta',             name: 'Okta',              logo: '🔐' },
    { id: 'azure_ad',         name: 'Microsoft Entra ID', logo: '🔷' },
    { id: 'google_workspace', name: 'Google Workspace',  logo: '🟦' },
    { id: 'onelogin',         name: 'OneLogin',          logo: '🔑' },
    { id: 'custom_saml',      name: 'Custom SAML',       logo: '⚙️' },
  ]

  return (
    <div className="space-y-5 max-w-3xl">

      {/* Status banner */}
      {isLoading ? <Skeleton className="h-16 w-full" /> : (
        <div className={clsx('flex items-center gap-3 p-4 rounded-xl border',
          sso?.configured && sso?.enabled
            ? 'bg-green-500/8 border-green-500/20'
            : 'bg-yellow-500/8 border-yellow-500/20')}>
          {sso?.configured && sso?.enabled
            ? <><CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-400">SSO Active — {sso.provider}</p>
                  <p className="text-xs text-gray-500">{sso.loginCount} SSO logins · Last used: {sso.lastUsedAt ? new Date(sso.lastUsedAt).toLocaleDateString() : 'Never'}</p>
                </div></>
            : <><AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-yellow-400">SSO Not Configured</p>
                  <p className="text-xs text-gray-500">Configure SSO to allow team login via your Identity Provider</p>
                </div></>}
        </div>
      )}

      {/* SP Values (copy to IdP) */}
      {sso?.spInfo && (
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Your Service Provider (SP) Values — Copy to IdP
          </p>
          <div className="space-y-3">
            {[
              { label: 'ACS URL (Reply URL)',  value: sso.spInfo.acsUrl },
              { label: 'Entity ID (Audience)', value: sso.spInfo.entityId },
              { label: 'Metadata URL',          value: sso.spInfo.metadataUrl },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-gray-500 mb-1">{f.label}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-900 text-blue-300 px-3 py-2 rounded-lg border border-gray-800 truncate">
                    {f.value}
                  </code>
                  <button onClick={() => copyToClipboard(f.value, f.label)}
                    className="flex-shrink-0 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors">
                    {copied === f.label ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Provider selection */}
      <Card>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Identity Provider</p>
        <div className="grid grid-cols-5 gap-2 mb-5">
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => setProvider(p.id)}
              className={clsx('flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all',
                provider === p.id ? 'border-blue-500 bg-blue-500/10' : 'border-gray-800 hover:border-gray-700')}>
              <span className="text-2xl">{p.logo}</span>
              <span className="text-xs text-gray-400 leading-tight">{p.name}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {[
            { label: 'IdP Entity ID', key: 'idpEntityId', placeholder: 'https://your-idp.okta.com/exk...' },
            { label: 'IdP SSO URL',   key: 'idpSsoUrl',   placeholder: 'https://your-idp.okta.com/app/...' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-gray-500">{f.label}</label>
              <input type="text" placeholder={f.placeholder}
                value={form[f.key as keyof typeof form] as string}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800
                           text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-gray-500">IdP Certificate (X.509)</label>
            <textarea rows={3} placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDpDCCAoygAwIBAgIGAV...&#10;-----END CERTIFICATE-----"
              value={form.idpCertificate}
              onChange={e => setForm(prev => ({ ...prev, idpCertificate: e.target.value }))}
              className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800
                         text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono resize-none" />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setForm(prev => ({ ...prev, jitEnabled: !prev.jitEnabled }))}
                className={clsx('h-5 w-9 rounded-full transition-colors', form.jitEnabled ? 'bg-blue-600' : 'bg-gray-700')}>
                <div className={clsx('h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5', form.jitEnabled ? 'translate-x-4' : 'translate-x-0')} />
              </button>
              <span className="text-xs text-gray-400">JIT User Provisioning</span>
            </div>
            <select value={form.jitDefaultRole} onChange={e => setForm(prev => ({ ...prev, jitDefaultRole: e.target.value }))}
              className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 focus:outline-none">
              <option value="ANALYST">Default: Analyst</option>
              <option value="VIEWER">Default: Viewer (read-only)</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="primary" icon={saving ? RefreshCw : Shield} onClick={saveSso} disabled={saving}>
            {saving ? 'Saving…' : 'Save SSO Configuration'}
          </Button>
          {sso?.spInfo?.initiateUrl && (
            <a href={sso.spInfo.initiateUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" icon={ExternalLink}>Test SSO Login</Button>
            </a>
          )}
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB: BOARD REPORT
// ─────────────────────────────────────────────

function BoardReportTab() {
  const [generating, setGenerating] = useState(false)
  const [report,     setReport]     = useState<any>(null)
  const [period,     setPeriod]     = useState(90)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  async function generate() {
    setGenerating(true); setReport(null)
    const r = await fetch('/api/v1/board-report/generate', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ periodDays: period, format: 'html' }),
    })
    const data = await r.json()
    setReport(data.data)
    setGenerating(false)
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-gray-200 mb-1">Executive Security Report</h3>
            <p className="text-xs text-gray-500 leading-relaxed max-w-lg">
              Board-ready PDF/HTML report covering security posture, incidents, compliance status, industry benchmark, and AI-written narrative. Ready to present to your Board of Directors.
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <select value={period} onChange={e => setPeriod(Number(e.target.value))}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 focus:outline-none mb-3 block">
              <option value={30}>Monthly (30 days)</option>
              <option value={90}>Quarterly (90 days)</option>
              <option value={365}>Annual (365 days)</option>
            </select>
            <Button variant="primary" icon={generating ? RefreshCw : FileText} onClick={generate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Report'}
            </Button>
          </div>
        </div>
      </Card>

      {/* What's included */}
      <Card>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Report Contents</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            'Security Posture Grade (A–F)',
            '6-Month Trend Chart',
            'Incident Summary Table',
            'Compliance Status (SOC2/GDPR/ISO)',
            'Industry Percentile Benchmark',
            'Analyst Hours Saved',
            'Attacks Prevented (estimated)',
            'Board-Level Recommendations',
          ].map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-gray-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500/70 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </Card>

      {/* Report result */}
      {generating && (
        <Card className="flex items-center gap-3 py-6">
          <RefreshCw className="h-5 w-5 text-blue-400 animate-spin" />
          <p className="text-sm text-gray-400">Collecting security metrics and generating report…</p>
        </Card>
      )}

      {report && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Posture Grade', value: report.summary?.postureGrade, color: 'text-blue-400' },
              { label: 'Posture Score', value: report.summary?.postureScore, color: 'text-gray-200' },
              { label: 'Incidents', value: report.summary?.totalIncidents, color: 'text-gray-200' },
              { label: 'Industry Percentile', value: `${report.summary?.percentile}th`, color: 'text-green-400' },
            ].map(k => (
              <Card key={k.label} className="text-center py-4">
                <p className={clsx('text-2xl font-black', k.color)}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              </Card>
            ))}
          </div>

          {/* Download / view buttons */}
          <div className="flex gap-3">
            {report.downloadUrl && (
              <a href={report.downloadUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="primary" icon={Download}>Download PDF</Button>
              </a>
            )}
            {report.html && (
              <button onClick={() => {
                const w = window.open('', '_blank')
                if (w) { w.document.write(report.html); w.document.close() }
              }}>
                <Button variant="outline" icon={ExternalLink}>View Full Report</Button>
              </button>
            )}
            <Button variant="ghost" icon={RefreshCw} onClick={generate}>Regenerate</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// TAB: POC MANAGEMENT
// ─────────────────────────────────────────────

function PocTab() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState({
    companyName: '', contactName: '', contactEmail: '',
    industry: 'Technology', companySize: '201-500',
    estimatedDealSize: 50000, trialDays: 30,
  })
  const [creating, setCreating] = useState(false)

  const { data: pocsData, isLoading } = useQuery({
    queryKey: ['pocs'],
    queryFn:  () => fetch('/api/v1/poc', { headers: H() }).then(r => r.json()),
    staleTime: 60_000, refetchInterval: 60_000,
  })

  const { data: pocDetailData } = useQuery({
    queryKey: ['poc', selected],
    queryFn:  () => fetch(`/api/v1/poc/${selected}`, { headers: H() }).then(r => r.json()),
    staleTime: 30_000,
    enabled:  !!selected,
  })

  const pocs   = pocsData?.data  ?? []
  const detail = pocDetailData?.data

  async function createPoc() {
    setCreating(true)
    await fetch('/api/v1/poc', { method: 'POST', headers: H(), body: JSON.stringify(form) })
    qc.invalidateQueries({ queryKey: ['pocs'] })
    setShowNew(false); setCreating(false)
  }

  async function updateMilestone(pocId: string, milestoneId: string, status: string) {
    await fetch(`/api/v1/poc/${pocId}/milestone`, {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({ milestoneId, status }),
    })
    qc.invalidateQueries({ queryKey: ['poc', pocId] })
  }

  const STATUS_COLOR: Record<string, string> = {
    active:     'text-blue-400 bg-blue-500/10',
    converting: 'text-yellow-400 bg-yellow-500/10',
    converted:  'text-green-400 bg-green-500/10',
    churned:    'text-red-400 bg-red-500/10',
    expired:    'text-gray-500 bg-gray-800',
  }

  const HEALTH_COLOR = (s: number) =>
    s >= 70 ? 'text-green-400' : s >= 40 ? 'text-yellow-400' : 'text-red-400'

  const MS_STATUS: Record<string, { icon: React.ElementType; color: string }> = {
    completed:   { icon: CheckCircle2, color: 'text-green-400' },
    in_progress: { icon: RefreshCw,    color: 'text-blue-400' },
    blocked:     { icon: XCircle,      color: 'text-red-400' },
    pending:     { icon: Clock,        color: 'text-gray-500' },
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-gray-300">POC / Trial Engagements</h3>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowNew(true)}>
          New POC
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* POC list */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          ) : pocs.length === 0 ? (
            <EmptyState icon={FlaskConical} title="No POC engagements"
              description="Start a POC to track enterprise trial milestones and ROI."
              action={<Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>Start POC</Button>} />
          ) : (
            pocs.map((poc: any) => (
              <button key={poc.id} onClick={() => setSelected(poc.id === selected ? null : poc.id)}
                className={clsx('w-full text-left rounded-xl border p-4 transition-all hover:border-gray-700',
                  selected === poc.id ? 'border-blue-500/40 bg-blue-500/5' : 'border-gray-800')}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{poc.companyName}</p>
                    <p className="text-xs text-gray-500">{poc.contactName} · {poc.contactTitle || poc.industry}</p>
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-medium capitalize', STATUS_COLOR[poc.status] ?? STATUS_COLOR.active)}>
                    {poc.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className={clsx('text-lg font-bold', HEALTH_COLOR(poc.score ?? 80))}>{poc.score ?? 80}</p>
                    <p className="text-xs text-gray-600">Health</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-200">{poc.daysLeft ?? poc.trialDays}</p>
                    <p className="text-xs text-gray-600">Days left</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-400">${Math.round((poc.estimatedDealSize ?? 0) / 1000)}k</p>
                    <p className="text-xs text-gray-600">Est. ARR</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* POC detail */}
        <div>
          {!selected ? (
            <Card className="flex items-center justify-center py-16 text-center">
              <div>
                <FlaskConical className="h-8 w-8 text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select a POC to view milestones and ROI</p>
              </div>
            </Card>
          ) : !detail ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : (
            <div className="space-y-4">
              {/* Progress bar */}
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-200">{detail.companyName}</p>
                  <span className="text-xs text-gray-500">{detail.progressPct}% complete</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${detail.progressPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-600 mt-1.5">
                  <span>Day 0</span>
                  <span className={detail.daysLeft <= 5 ? 'text-red-400 font-bold' : ''}>
                    {detail.daysLeft} days left
                  </span>
                  <span>Day {detail.trialDays}</span>
                </div>
              </Card>

              {/* ROI */}
              {detail.roi && (
                <Card>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Value Realized</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[
                      { label: 'Analyst Hours Saved', value: detail.roi.analystHoursSaved },
                      { label: 'ROI Multiple', value: `${detail.roi.estimatedRoiMultiple}×`, color: 'text-green-400' },
                    ].map(k => (
                      <div key={k.label} className="bg-gray-800/40 rounded-lg p-3 text-center">
                        <p className={clsx('text-xl font-bold', k.color ?? 'text-gray-100')}>{k.value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{detail.roi.roiNarrative}</p>
                </Card>
              )}

              {/* Milestones */}
              <Card padding="none">
                <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Milestones ({(detail.milestones as any[])?.filter((m: any) => m.status === 'completed').length}/{detail.milestones?.length})
                </div>
                <div className="divide-y divide-gray-800/50 max-h-64 overflow-y-auto">
                  {(detail.milestones as any[] ?? []).map((m: any) => {
                    const ST = MS_STATUS[m.status] ?? MS_STATUS.pending
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                        <ST.icon className={clsx('h-4 w-4 flex-shrink-0', ST.color)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-300 truncate">{m.name}</p>
                          <p className="text-xs text-gray-600">Day {m.dueDay}</p>
                        </div>
                        {m.status === 'pending' && (
                          <button onClick={() => updateMilestone(detail.id, m.id, 'completed')}
                            className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 px-2 py-1 rounded border border-blue-500/30 hover:bg-blue-500/10 transition-colors">
                            Mark done
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>

              {detail.status === 'active' && (
                <Button variant="primary" className="w-full"
                  onClick={async () => {
                    await fetch(`/api/v1/poc/${detail.id}/convert`, { method: 'POST', headers: H() })
                    qc.invalidateQueries({ queryKey: ['pocs'] })
                    setSelected(null)
                  }}>
                  🎉 Mark as Converted
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <Card className="relative w-full max-w-lg mx-4 z-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-100">Start New POC</h3>
              <button onClick={() => setShowNew(false)} className="text-gray-500 hover:text-gray-300 text-lg">×</button>
            </div>
            <div className="space-y-3 mb-5">
              {[
                { label: 'Company Name',   key: 'companyName',   ph: 'Acme Corporation' },
                { label: 'Contact Name',   key: 'contactName',   ph: 'Jane Smith' },
                { label: 'Contact Email',  key: 'contactEmail',  ph: 'jane@acme.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{f.label}</label>
                  <input type="text" placeholder={f.ph}
                    value={form[f.key as keyof typeof form] as string}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800
                               text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Est. Deal (USD/yr)</label>
                  <input type="number" value={form.estimatedDealSize}
                    onChange={e => setForm(prev => ({ ...prev, estimatedDealSize: Number(e.target.value) }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Trial Duration</label>
                  <select value={form.trialDays} onChange={e => setForm(prev => ({ ...prev, trialDays: Number(e.target.value) }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-300 focus:outline-none">
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button variant="primary" icon={creating ? RefreshCw : FlaskConical} onClick={createPoc} disabled={creating || !form.companyName || !form.contactEmail}>
                {creating ? 'Creating…' : 'Start POC'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function EnterpriseSalesPage() {
  const [tab, setTab] = useState<'sso'|'report'|'poc'>('sso')

  return (
    <AppShell
      title="Enterprise Sales"
      actions={
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Shield className="h-3.5 w-3.5" />
          Enterprise Tier Features
        </div>
      }
    >
      <PageContent>
        <div className="flex items-center gap-1 border-b border-gray-800 mb-6">
          {[
            { id: 'sso',    label: 'SSO / SCIM',        icon: Lock,       desc: 'Enterprise identity' },
            { id: 'report', label: 'Board Report',       icon: FileText,   desc: 'Executive PDF' },
            { id: 'poc',    label: 'POC Management',     icon: FlaskConical, desc: 'Trial tracking' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
              <t.icon className="h-4 w-4" />
              {t.label}
              <span className="text-xs text-gray-600 hidden md:inline">— {t.desc}</span>
            </button>
          ))}
        </div>

        {tab === 'sso'    && <SsoTab />}
        {tab === 'report' && <BoardReportTab />}
        {tab === 'poc'    && <PocTab />}

      </PageContent>
    </AppShell>
  )
}
