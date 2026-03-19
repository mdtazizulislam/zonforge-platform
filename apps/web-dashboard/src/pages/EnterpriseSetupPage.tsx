import { useState } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Lock, Users, Key, CheckCircle2, XCircle, AlertTriangle,
  Copy, ExternalLink, Plus, RefreshCw, ChevronDown, ChevronUp,
  Clock, TrendingUp, Target, FileText, Phone, Mail,
  Building2, Zap, ArrowRight, Star,
} from 'lucide-react'

// ─────────────────────────────────────────────
const H = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
})

const STATUS_STYLE: Record<string, string> = {
  pending_config: 'text-gray-400 bg-gray-800',
  testing:        'text-yellow-400 bg-yellow-500/10 animate-pulse',
  active:         'text-green-400 bg-green-500/10',
  disabled:       'text-gray-500 bg-gray-800',
  error:          'text-red-400 bg-red-500/10',
}

const POC_STATUS_STYLE: Record<string, string> = {
  draft:    'text-gray-400 bg-gray-800',
  active:   'text-blue-400 bg-blue-500/10',
  review:   'text-yellow-400 bg-yellow-500/10',
  won:      'text-green-400 bg-green-500/10',
  lost:     'text-red-400 bg-red-500/10',
  extended: 'text-purple-400 bg-purple-500/10',
}

const PROVIDER_COLORS: Record<string, string> = {
  okta:             'text-blue-400',
  azure_ad:         'text-blue-500',
  google_workspace: 'text-red-400',
  onelogin:         'text-red-500',
  custom_saml:      'text-gray-400',
  custom_oidc:      'text-gray-400',
}

// ─────────────────────────────────────────────
// SSO TAB
// ─────────────────────────────────────────────

function SsoTab() {
  const [setupStep, setSetupStep] = useState<'select'|'configure'|'test'>('select')
  const [provider,  setProvider]  = useState<string | null>(null)
  const [protocol,  setProtocol]  = useState<'saml2'|'oidc'>('saml2')
  const [connName,  setConnName]  = useState('')
  const [idpUrl,    setIdpUrl]    = useState('')
  const [cert,      setCert]      = useState('')
  const [creating,  setCreating]  = useState(false)
  const [created,   setCreated]   = useState<any>(null)
  const [copied,    setCopied]    = useState('')
  const qc = useQueryClient()

  const { data: providersData } = useQuery({
    queryKey: ['sso-providers'],
    queryFn:  () => fetch('/api/v1/sso/providers', { headers: H() }).then(r => r.json()),
    staleTime: Infinity,
  })
  const { data: connectionsData, isLoading } = useQuery({
    queryKey: ['sso-connections'],
    queryFn:  () => fetch('/api/v1/sso/connections', { headers: H() }).then(r => r.json()),
    staleTime: 30_000,
  })
  const { data: scimData } = useQuery({
    queryKey: ['scim-status'],
    queryFn:  () => fetch('/api/v1/sso/scim/status', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
  })

  const providers   = providersData?.data ?? []
  const connections = connectionsData?.data ?? []
  const scim        = scimData?.data

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  async function createConnection() {
    if (!provider || !connName) return
    setCreating(true)
    const selectedProvider = providers.find((p: any) => p.id === provider)
    const r = await fetch('/api/v1/sso/connections', {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        name: connName, provider, protocol,
        samlConfig: protocol === 'saml2' ? {
          idpEntityId:    idpUrl,
          idpSsoUrl:      idpUrl,
          idpCertificate: cert || '-----BEGIN CERTIFICATE-----\nPLACEHOLDER\n-----END CERTIFICATE-----',
          signatureAlgorithm: 'rsa-sha256',
          nameIdFormat:   'email',
          attributeMap:   selectedProvider?.commonAttrMap ?? { email: 'email' },
          allowJitProvisioning: true,
          defaultRole:    'SECURITY_ANALYST',
          groupToRoleMapping: {},
        } : undefined,
      }),
    })
    const data = await r.json()
    if (data.success) { setCreated(data.data); setSetupStep('test') }
    setCreating(false)
    qc.invalidateQueries({ queryKey: ['sso-connections'] })
  }

  async function enableScim() {
    await fetch('/api/v1/sso/scim/enable', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ syncUsers: true, syncGroups: true, deprovisionUsers: true }),
    })
    qc.invalidateQueries({ queryKey: ['scim-status'] })
  }

  return (
    <div className="space-y-5">

      {/* Active connections */}
      {connections.length > 0 && (
        <Card padding="none">
          <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            SSO Connections ({connections.length})
          </div>
          {connections.map((conn: any) => (
            <div key={conn.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-800/50 last:border-0">
              <div className={clsx('text-2xl font-black flex-shrink-0', PROVIDER_COLORS[conn.provider] ?? 'text-gray-400')}>
                {conn.provider === 'okta' ? 'O' : conn.provider === 'azure_ad' ? '⊞' : conn.provider === 'google_workspace' ? 'G' : '🔐'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200">{conn.name}</p>
                <p className="text-xs text-gray-500">{conn.provider} · {conn.protocol} · {conn.totalLogins} logins · {conn.provisionedUsers} users</p>
              </div>
              <span className={clsx('px-2.5 py-1 rounded text-xs font-medium', STATUS_STYLE[conn.status])}>
                {conn.status.replace('_', ' ')}
              </span>
              {conn.status === 'active' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
            </div>
          ))}
        </Card>
      )}

      {/* Setup wizard */}
      {connections.length === 0 && (
        <div>
          {setupStep === 'select' && (
            <div className="space-y-4">
              <Card className="border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-3 mb-4">
                  <Lock className="h-5 w-5 text-blue-400" />
                  <div>
                    <h3 className="text-sm font-bold text-gray-100">Configure SSO</h3>
                    <p className="text-xs text-gray-500">Connect your Identity Provider — no more separate passwords</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {providers.map((p: any) => (
                    <button key={p.id} onClick={() => { setProvider(p.id); setProtocol(p.protocol); setSetupStep('configure') }}
                      className={clsx('p-4 rounded-xl border text-left transition-all',
                        provider === p.id ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-800/30')}>
                      <div className={clsx('text-xl font-black mb-1', PROVIDER_COLORS[p.id] ?? 'text-gray-400')}>
                        {p.id === 'okta' ? 'O' : p.id === 'azure_ad' ? '⊞' : p.id === 'google_workspace' ? 'G' : '🔐'}
                      </div>
                      <p className="text-xs font-semibold text-gray-200">{p.name}</p>
                      <p className="text-xs text-gray-600">{p.protocol.toUpperCase()}</p>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {setupStep === 'configure' && provider && (
            <Card>
              <div className="flex items-center gap-2 mb-5">
                <button onClick={() => setSetupStep('select')} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
                <span className="text-sm font-bold text-gray-100">Configure {providers.find((p: any) => p.id === provider)?.name}</span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Connection Name</label>
                  <input type="text" value={connName} onChange={e => setConnName(e.target.value)}
                    placeholder="e.g. Okta Production"
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                </div>
                {protocol === 'saml2' && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">IdP SSO URL</label>
                      <input type="url" value={idpUrl} onChange={e => setIdpUrl(e.target.value)}
                        placeholder="https://your-idp.com/sso/saml"
                        className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">IdP Certificate (PEM)</label>
                      <textarea value={cert} onChange={e => setCert(e.target.value)}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                        rows={4}
                        className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-xs font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none" />
                    </div>
                  </>
                )}
                <Button variant="primary" icon={creating ? RefreshCw : Lock}
                  disabled={creating || !connName} onClick={createConnection}>
                  {creating ? 'Creating…' : 'Create Connection'}
                </Button>
              </div>
            </Card>
          )}

          {setupStep === 'test' && created && (
            <Card className="border-green-500/20 bg-green-500/5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-sm font-bold text-gray-100">Connection Created — Configure Your IdP</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Entity ID (Audience URI)', value: created.spEntityId },
                  { label: 'ACS URL (Reply URL)',      value: created.acsUrl },
                  { label: 'Metadata URL',             value: created.metadataUrl },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                      <code className="flex-1 text-xs text-blue-400 font-mono truncate">{value}</code>
                      <button onClick={() => copyToClipboard(value, label)}
                        className="text-gray-600 hover:text-gray-300 flex-shrink-0">
                        {copied === label ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <p className="text-xs text-gray-500 font-medium mb-2">Setup steps:</p>
                  {created.setupInstructions?.split('\n').map((s: string, i: number) => (
                    <p key={i} className="text-xs text-gray-400 mb-1">{s}</p>
                  ))}
                </div>
                <a href={created.testUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Test SSO Login
                </a>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* SCIM provisioning */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-purple-400" />
            <div>
              <h3 className="text-sm font-semibold text-gray-200">SCIM 2.0 Auto-Provisioning</h3>
              <p className="text-xs text-gray-500">Users created/deactivated automatically from your IdP</p>
            </div>
          </div>
          {scim?.enabled
            ? <span className="px-2.5 py-1 rounded text-xs font-medium text-green-400 bg-green-500/10">Active</span>
            : <Button variant="primary" size="sm" icon={Zap} onClick={enableScim}>Enable SCIM</Button>
          }
        </div>
        {scim?.enabled && (
          <div className="grid grid-cols-3 gap-3 text-center mt-3">
            {[
              { label: 'Users Provisioned',   value: scim.usersProvisioned },
              { label: 'Users Deprovisioned', value: scim.usersDeprovisioned },
              { label: 'Last Sync',           value: scim.lastSyncAt ? new Date(scim.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never' },
            ].map(k => (
              <div key={k.label} className="bg-gray-800/40 rounded-lg p-3">
                <p className="text-lg font-bold text-gray-100">{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        )}
        {scim?.enabled && (
          <div className="mt-3 space-y-2">
            {[
              { label: 'SCIM Base URL', value: scim.baseUrl },
              { label: 'Bearer Token',  value: scim.bearerToken },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-600 w-24 flex-shrink-0">{label}:</span>
                <code className="flex-1 text-xs text-blue-400 font-mono truncate">{value}</code>
                <button onClick={() => copyToClipboard(value, label)}
                  className="text-gray-600 hover:text-gray-300 flex-shrink-0">
                  {copied === label ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────
// POC MANAGEMENT TAB
// ─────────────────────────────────────────────

function PocTab() {
  const [creating,   setCreating]   = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [report,     setReport]     = useState<any>(null)
  const [generating, setGenerating] = useState(false)

  // Form state
  const [company,   setCompany]   = useState('')
  const [champion,  setChampion]  = useState('')
  const [email,     setEmail]     = useState('')
  const [title,     setTitle]     = useState('CISO')
  const [ae,        setAe]        = useState('')
  const [plan,      setPlan]      = useState('enterprise')
  const [mrr,       setMrr]       = useState(0)
  const [days,      setDays]      = useState(30)

  const qc = useQueryClient()

  const { data: statsData } = useQuery({
    queryKey: ['poc-stats'],
    queryFn:  () => fetch('/api/v1/poc/stats', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
  })
  const { data: pocsData, isLoading } = useQuery({
    queryKey: ['pocs'],
    queryFn:  () => fetch('/api/v1/poc', { headers: H() }).then(r => r.json()),
    staleTime: 30_000,
  })
  const { data: pocDetail } = useQuery({
    queryKey: ['poc', selectedId],
    queryFn:  () => fetch(`/api/v1/poc/${selectedId}`, { headers: H() }).then(r => r.json()),
    staleTime: 30_000,
    enabled:  !!selectedId,
  })

  const stats = statsData?.data
  const pocs  = pocsData?.data ?? []
  const poc   = pocDetail?.data

  async function createPoc() {
    if (!company || !champion || !email || !ae) return
    setCreating(true)
    const r = await fetch('/api/v1/poc', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ companyName: company, championName: champion, championEmail: email, championTitle: title, dealOwner: ae, targetPlan: plan, targetMrr: mrr, durationDays: days }),
    })
    const data = await r.json()
    if (data.success) { setShowForm(false); qc.invalidateQueries({ queryKey: ['pocs'] }); qc.invalidateQueries({ queryKey: ['poc-stats'] }) }
    setCreating(false)
  }

  async function generateReport(pocId: string) {
    setGenerating(true); setReport(null)
    const r = await fetch(`/api/v1/poc/${pocId}/roi-report`, { method: 'POST', headers: H() })
    const data = await r.json()
    setReport(data.data)
    setGenerating(false)
  }

  async function markCriteria(pocId: string, criteriaId: string, status: string) {
    await fetch(`/api/v1/poc/${pocId}/criteria`, {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({ criteriaId, status }),
    })
    qc.invalidateQueries({ queryKey: ['poc', pocId] })
  }

  async function closePoc(pocId: string, outcome: 'won' | 'lost') {
    if (!confirm(`Mark this POC as ${outcome}?`)) return
    await fetch(`/api/v1/poc/${pocId}/close`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ outcome }),
    })
    qc.invalidateQueries({ queryKey: ['pocs'] }); qc.invalidateQueries({ queryKey: ['poc-stats'] })
  }

  // ── POC Detail View ──────────────────────────

  if (selectedId && poc) {
    return (
      <div className="space-y-5">
        <button onClick={() => { setSelectedId(null); setReport(null) }}
          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
          ← Back to POC list
        </button>

        {/* POC header */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-bold text-gray-100">{poc.companyName}</h2>
                <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', POC_STATUS_STYLE[poc.status])}>
                  {poc.status}
                </span>
              </div>
              <p className="text-xs text-gray-500">{poc.championName} · {poc.championTitle} · {poc.championEmail}</p>
              <p className="text-xs text-gray-600 mt-1">AE: {poc.dealOwner} · Target: {poc.targetPlan} ${poc.targetMrr}/mo</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-blue-400">{poc.successScore}%</div>
              <p className="text-xs text-gray-500">success score</p>
              <p className="text-xs text-gray-600 mt-1">{poc.criteriaMetCount}/{poc.criteriaTotalCount} criteria met</p>
            </div>
          </div>

          {/* Engagement */}
          {poc.engagement && (
            <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-800">
              {[
                { l: 'Alerts Investigated', v: poc.engagement.alertsInvestigated },
                { l: 'Connectors',          v: poc.engagement.connectorsConfigured },
                { l: 'Playbooks',           v: poc.engagement.playbooksCreated },
                { l: 'Engagement',          v: `${poc.engagement.engagementScore}/100` },
              ].map(k => (
                <div key={k.l} className="text-center bg-gray-800/30 rounded-lg p-2">
                  <p className="text-lg font-bold text-gray-100">{k.v}</p>
                  <p className="text-xs text-gray-600">{k.l}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button variant="outline" size="sm" icon={FileText}
              disabled={generating} onClick={() => generateReport(poc.id)}>
              {generating ? 'Generating…' : 'Generate ROI Report'}
            </Button>
            {poc.status === 'active' && <>
              <Button variant="primary" size="sm" icon={Star} onClick={() => closePoc(poc.id, 'won')}>Mark Won</Button>
              <Button variant="ghost" size="sm" onClick={() => closePoc(poc.id, 'lost')}>Mark Lost</Button>
            </>}
          </div>
        </Card>

        {/* ROI Report */}
        {report && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-4 w-4 text-blue-400" />
              <p className="text-xs font-semibold text-gray-200 uppercase tracking-wider">AI-Generated ROI Report</p>
              <span className="ml-auto text-xs text-gray-600">claude-sonnet-4-6</span>
            </div>
            <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
              {report.report}
            </div>
          </Card>
        )}

        {/* Success criteria */}
        <Card padding="none">
          <div className="px-5 py-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Success Criteria
          </div>
          {(poc.successCriteria as any[]).map((c: any) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-800/50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200">{c.title}</p>
                <p className="text-xs text-gray-500">Target: {c.target}</p>
                {c.actual && <p className="text-xs text-blue-400">Actual: {c.actual}</p>}
              </div>
              <select value={c.status}
                onChange={e => markCriteria(poc.id, c.id, e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 focus:outline-none">
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="achieved">✅ Achieved</option>
                <option value="not_achieved">❌ Not Achieved</option>
              </select>
            </div>
          ))}
        </Card>

        {/* Milestones */}
        <Card>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">4-Week Milestone Plan</p>
          <div className="space-y-4">
            {(poc.milestones as any[]).map((m: any) => {
              const done = m.tasks.filter((t: any) => t.completed).length
              const pct  = Math.round((done / m.tasks.length) * 100)
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={clsx('h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                        pct === 100 ? 'bg-green-500/20 text-green-400' : poc.currentWeek === m.week ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-500')}>
                        {m.week}
                      </span>
                      <span className="text-sm font-medium text-gray-200">{m.title}</span>
                    </div>
                    <span className="text-xs text-gray-500">{done}/{m.tasks.length}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  {poc.currentWeek === m.week && (
                    <div className="space-y-1.5 ml-8">
                      {m.tasks.map((t: any) => (
                        <div key={t.id} className="flex items-center gap-2 text-xs">
                          <span className={clsx('h-4 w-4 rounded flex items-center justify-center flex-shrink-0',
                            t.completed ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-600')}>
                            {t.completed ? '✓' : '○'}
                          </span>
                          <span className={clsx(t.completed ? 'text-gray-500 line-through' : 'text-gray-400')}>{t.title}</span>
                          <span className={clsx('ml-auto text-xs flex-shrink-0', t.owner === 'zonforge' ? 'text-blue-500' : 'text-gray-600')}>
                            {t.owner === 'zonforge' ? 'ZonForge' : 'Customer'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Pipeline stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { l: 'Active POCs',  v: stats.active,   c: 'text-blue-400' },
            { l: 'Won',          v: stats.won,       c: 'text-green-400' },
            { l: 'Lost',         v: stats.lost,      c: 'text-red-400' },
            { l: 'Pipeline MRR', v: `$${Math.round(stats.pipeline / 1000)}k`, c: 'text-yellow-400' },
            { l: 'Win Rate',     v: stats.winRate,   c: stats.won > stats.lost ? 'text-green-400' : 'text-gray-400' },
          ].map(k => (
            <Card key={k.l} className="text-center py-3">
              <p className={clsx('text-2xl font-bold tabular-nums', k.c)}>{k.v}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.l}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Active POCs</h3>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowForm(true)}>
          New POC
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-100">Create New POC</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-300">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { l: 'Company Name', v: company, set: setCompany, ph: 'Acme Corp' },
              { l: 'Champion Name', v: champion, set: setChampion, ph: 'Jane Smith' },
              { l: 'Champion Email', v: email, set: setEmail, ph: 'jane@acme.com' },
              { l: 'Champion Title', v: title, set: setTitle, ph: 'CISO' },
              { l: 'Account Executive', v: ae, set: setAe, ph: 'Your name' },
            ].map(f => (
              <div key={f.l}>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{f.l}</label>
                <input type="text" value={f.v} onChange={e => f.set(e.target.value)}
                  placeholder={f.ph}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Target Plan + MRR</label>
              <div className="flex gap-2 mt-1.5">
                <select value={plan} onChange={e => setPlan(e.target.value)}
                  className="flex-1 px-2 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-300 focus:outline-none">
                  <option value="business">Business</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                <input type="number" value={mrr} onChange={e => setMrr(Number(e.target.value))}
                  placeholder="$/mo"
                  className="w-24 px-2 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Trial Duration</label>
              <select value={days} onChange={e => setDays(Number(e.target.value))}
                className="mt-1.5 w-full px-2 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-300 focus:outline-none">
                {[14, 21, 30, 45, 60].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" icon={Target} disabled={creating || !company || !champion || !email || !ae}
              onClick={createPoc}>
              {creating ? 'Creating…' : 'Create POC'}
            </Button>
          </div>
        </Card>
      )}

      {/* POC list */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : pocs.length === 0 ? (
        <EmptyState icon={Target} title="No POCs yet"
          description="Create your first POC to start managing enterprise trials."
          action={<Button variant="primary" icon={Plus} onClick={() => setShowForm(true)}>Create First POC</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pocs.map((p: any) => {
            const daysLeft = Math.max(0, Math.round((new Date(p.endDate).getTime() - Date.now()) / 86_400_000))
            return (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className="text-left rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-semibold text-gray-200 truncate">{p.companyName}</h3>
                      <span className={clsx('px-2 py-0.5 rounded text-xs font-medium flex-shrink-0', POC_STATUS_STYLE[p.status])}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{p.championName} · {p.targetPlan} ${p.targetMrr}/mo</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-black text-blue-400">{p.successScore}%</p>
                    <p className="text-xs text-gray-600">{p.criteriaMetCount}/{p.criteriaTotalCount}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {p.status === 'active' ? `${daysLeft}d left` : p.status === 'won' ? 'Closed Won' : p.status === 'lost' ? 'Closed Lost' : '—'}
                  </span>
                  <span className="text-gray-500">AE: {p.dealOwner}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-600" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function EnterpriseSetupPage() {
  const [tab, setTab] = useState<'sso'|'poc'|'contract'>('sso')

  return (
    <AppShell title="Enterprise Setup"
      actions={
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Building2 className="h-3.5 w-3.5" />
          Enterprise Features
        </div>
      }
    >
      <PageContent>
        <div className="flex items-center gap-1 border-b border-gray-800 mb-6">
          {[
            { id: 'sso',      label: 'SSO & SCIM',        icon: Lock },
            { id: 'poc',      label: 'POC Management',    icon: Target },
            { id: 'contract', label: 'Contracts & Billing', icon: FileText },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'sso' && <SsoTab />}
        {tab === 'poc' && <PocTab />}
        {tab === 'contract' && (
          <div className="max-w-lg">
            <Card className="border-blue-500/20 bg-blue-500/5">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-gray-100">Enterprise Contracts & Custom Billing</h3>
                  <p className="text-xs text-gray-500">PO-based invoicing, multi-year discounts, custom terms</p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                {[
                  'Custom quote generation (PDF)',
                  'Net-30/60 invoice payment',
                  'Purchase Order acceptance',
                  'Multi-year pricing (3yr = 20% off)',
                  'Custom MSA and DPA templates',
                  'SOC2 Type II report sharing',
                ].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-gray-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500/60" />{f}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600">
                Contract management is handled via your CRM (Salesforce/HubSpot). ZonForge generates quotes and invoices — integration coming in the next release.
              </p>
            </Card>
          </div>
        )}
      </PageContent>
    </AppShell>
  )
}
