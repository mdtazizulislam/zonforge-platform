import { useState, useRef } from 'react'
import { clsx } from 'clsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Button, Card, Skeleton } from '@/components/shared/ui'
import {
  Package, AlertTriangle, CheckCircle2, Upload, Search,
  Download, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  Shield, Clock, Layers,
} from 'lucide-react'

const H  = () => ({ Authorization: `Bearer ${localStorage.getItem('zf_access_token')}` })
const HJ = () => ({ ...H(), 'Content-Type': 'application/json' })

const RISK_META: Record<string, { color: string; bg: string }> = {
  critical: { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  high:     { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  medium:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  low:      { color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  safe:     { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
}

const THREAT_LABELS: Record<string, string> = {
  typosquatting:        '🎭 Typosquatting',
  dependency_confusion: '🔀 Dep. Confusion',
  malicious_code:       '☠️ Malicious Code',
  compromised_account:  '🔑 Compromised Maintainer',
  known_vulnerability:  '🐛 Known CVE',
  abandoned_package:    '🏚️ Abandoned',
  suspicious_maintainer:'👤 Suspicious Maintainer',
  protestware:          '✊ Protestware',
  build_tampering:      '⚒️ Build Tamper',
}

const GRADE_COLOR: Record<string, string> = {
  A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#f97316', F: '#ef4444',
}

function GradeRing({ grade, score }: { grade: string; score: number }) {
  const r = 46, c = 2 * Math.PI * r
  const fill = (score / 100) * c
  const color = GRADE_COLOR[grade] ?? '#6b7280'
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="104" height="104" viewBox="0 0 104 104">
        <circle cx="52" cy="52" r={r} fill="none" stroke="#1f2937" strokeWidth="8" />
        <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
          transform="rotate(-90 52 52)"
          style={{ transition: 'stroke-dasharray .7s ease' }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-black leading-none" style={{ color }}>{grade}</span>
        <span className="text-xs font-bold text-gray-500">{score}/100</span>
      </div>
    </div>
  )
}

function FindingRow({ finding }: { finding: any }) {
  const [open, setOpen] = useState(finding.riskLevel === 'critical')
  const risk = RISK_META[finding.riskLevel] ?? RISK_META['safe']!
  return (
    <div className={clsx('border-b border-gray-800/50 last:border-0', finding.riskLevel === 'critical' && 'bg-red-500/3')}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-800/20 transition-colors">
        <span className={clsx('flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold capitalize', risk.bg, risk.color)}>
          {finding.riskLevel}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-semibold text-gray-200 truncate">{finding.name}</span>
            <span className="text-xs text-gray-600">@{finding.version}</span>
            <span className="text-xs text-gray-700 bg-gray-800 px-1.5 py-0.5 rounded">{finding.ecosystem}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {finding.threatCategories?.map((t: string) => (
              <span key={t} className="text-xs text-gray-500">{THREAT_LABELS[t] ?? t}</span>
            ))}
          </div>
        </div>
        {finding.cvssScore && <span className="text-xs font-bold text-orange-400 flex-shrink-0">CVSS {finding.cvssScore.toFixed(1)}</span>}
        {finding.cveIds?.[0] && <span className="text-xs font-mono text-blue-400 flex-shrink-0">{finding.cveIds[0]}</span>}
        {open ? <ChevronUp className="h-4 w-4 text-gray-600 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-600 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-2">
          <p className="text-xs text-gray-400 leading-relaxed">{finding.description}</p>
          {finding.evidence?.length > 0 && (
            <div className="space-y-1">
              {finding.evidence.map((e: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                  <AlertTriangle className="h-3 w-3 text-orange-400 flex-shrink-0 mt-0.5" />{e}
                </div>
              ))}
            </div>
          )}
          {finding.cveIds?.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {finding.cveIds.map((cve: string) => (
                <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded hover:underline">
                  {cve} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScanDetail({ scan }: { scan: any }) {
  const [tab, setTab] = useState<'findings'|'sbom'>('findings')
  const findings = scan.findings ?? []
  const critical = findings.filter((f: any) => f.riskLevel === 'critical')
  const high     = findings.filter((f: any) => f.riskLevel === 'high')
  const medium   = findings.filter((f: any) => f.riskLevel === 'medium')
  const safe     = findings.filter((f: any) => ['safe','low'].includes(f.riskLevel))

  const score = Math.max(0, Math.min(100, 100 - critical.length * 25 - high.length * 10 - medium.length * 3))
  const grade = critical.length > 0 ? 'F' : high.length > 5 ? 'D' : high.length > 0 ? 'C' : medium.length > 5 ? 'B' : 'A'

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-5">
        <GradeRing grade={grade} score={score} />
        <div className="flex-1">
          <h3 className="text-base font-bold text-gray-100 mb-1">{scan.projectName}</h3>
          <p className="text-xs text-gray-500 mb-3">{scan.ecosystem} · {scan.packageCount} packages · {new Date(scan.createdAt).toLocaleString()}</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Critical', count: critical.length, c: 'text-red-400 bg-red-500/10' },
              { label: 'High',     count: high.length,     c: 'text-orange-400 bg-orange-500/10' },
              { label: 'Medium',   count: medium.length,   c: 'text-yellow-400 bg-yellow-500/10' },
              { label: 'Safe',     count: safe.length,     c: 'text-green-400 bg-green-500/10' },
            ].map(s => (
              <div key={s.label} className={clsx('rounded-lg p-2 text-center', s.c)}>
                <p className="text-xl font-bold tabular-nums">{s.count}</p>
                <p className="text-xs opacity-70">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => window.open(`/api/v1/supply-chain/scans/${scan.id}/sbom?format=cyclonedx`, '_blank')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors flex-shrink-0">
          <Download className="h-3.5 w-3.5" /> SBOM
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {[
          { id: 'findings', label: `Findings (${findings.filter((f: any) => f.riskLevel !== 'safe').length})` },
          { id: 'sbom',     label: `SBOM (${scan.sbom?.length ?? 0})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
              tab === t.id ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'findings' && (
        <Card padding="none">
          {findings.filter((f: any) => f.riskLevel !== 'safe').length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-400 mb-2" />
              <p className="text-sm font-medium text-gray-300">No vulnerabilities detected</p>
              <p className="text-xs text-gray-600 mt-1">All packages appear safe</p>
            </div>
          ) : ['critical','high','medium','low'].map(level => {
            const lf = findings.filter((f: any) => f.riskLevel === level)
            if (!lf.length) return null
            return (
              <div key={level}>
                <div className={clsx('px-5 py-2 text-xs font-bold uppercase tracking-wider border-b border-gray-800 bg-gray-900/60', RISK_META[level]?.color)}>
                  {level} ({lf.length})
                </div>
                {lf.map((f: any) => <FindingRow key={f.id} finding={f} />)}
              </div>
            )
          })}
        </Card>
      )}

      {tab === 'sbom' && (
        <Card padding="none">
          <div className="grid grid-cols-5 gap-3 px-5 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-800/40 border-b border-gray-800">
            <div className="col-span-2">Package</div><div>Version</div><div>Ecosystem</div><div>Risk</div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(scan.sbom ?? []).map((e: any, i: number) => (
              <div key={i} className="grid grid-cols-5 gap-3 px-5 py-2.5 border-b border-gray-800/40 last:border-0 hover:bg-gray-800/20">
                <div className="col-span-2 text-xs font-mono text-gray-300 truncate">{e.name}</div>
                <div className="text-xs font-mono text-gray-500">{e.version}</div>
                <div className="text-xs text-gray-600">{e.ecosystem}</div>
                <div><span className={clsx('text-xs font-medium capitalize', RISK_META[e.riskLevel ?? 'safe']?.color)}>{e.riskLevel ?? 'safe'}</span></div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export default function SupplyChainPage() {
  const [selectedScanId, setSelected] = useState<string | null>(null)
  const [quickPkg,       setQuickPkg] = useState({ name: '', version: '', ecosystem: 'npm' })
  const [quickResult,    setQResult]  = useState<any>(null)
  const [quickLoad,      setQLoad]    = useState(false)
  const [uploading,      setUploading]= useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: scansData, isLoading } = useQuery({
    queryKey: ['supply-chain-scans'],
    queryFn:  () => fetch('/api/v1/supply-chain/scans', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
  })
  const { data: detailData } = useQuery({
    queryKey: ['supply-chain-scan', selectedScanId],
    queryFn:  () => fetch(`/api/v1/supply-chain/scans/${selectedScanId}`, { headers: H() }).then(r => r.json()),
    enabled:  !!selectedScanId,
    staleTime: 30_000,
  })

  const scans  = scansData?.data ?? []
  const detail = detailData?.data

  async function handleUpload(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/v1/supply-chain/scan', { method: 'POST', headers: H(), body: form })
    const data = await r.json()
    if (data.success) { setSelected(data.data.scanId); qc.invalidateQueries({ queryKey: ['supply-chain-scans'] }) }
    setUploading(false)
  }

  async function quickCheck() {
    if (!quickPkg.name.trim()) return
    setQLoad(true); setQResult(null)
    const r = await fetch('/api/v1/supply-chain/check-package', {
      method: 'POST', headers: HJ(), body: JSON.stringify(quickPkg),
    })
    const data = await r.json()
    setQResult(data.data); setQLoad(false)
  }

  const totalCritical = scans.reduce((s: number, sc: any) => s + (sc.criticalCount ?? 0), 0)
  const totalPackages  = scans.reduce((s: number, sc: any) => s + (sc.packageCount  ?? 0), 0)

  return (
    <AppShell title="Supply Chain Intelligence"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={Upload} disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading ? 'Scanning…' : 'Upload Manifest'}
          </Button>
          <input ref={fileRef} type="file" className="hidden"
            accept=".json,.txt,.xml,.toml,.lock,.sum,.mod"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
        </div>
      }
    >
      <PageContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Projects Scanned', value: scans.length,               icon: Layers,        color: 'text-blue-400' },
            { label: 'Total Packages',   value: totalPackages.toLocaleString(), icon: Package,    color: 'text-gray-200' },
            { label: 'Critical Findings',value: totalCritical,              icon: AlertTriangle, color: totalCritical > 0 ? 'text-red-400' : 'text-gray-400' },
            { label: 'Ecosystems',       value: '8',                        icon: Shield,        color: 'text-green-400' },
          ].map(k => (
            <Card key={k.label} className="flex items-center gap-3">
              <k.icon className={clsx('h-5 w-5 flex-shrink-0', k.color)} />
              <div><p className={clsx('text-2xl font-bold', k.color)}>{k.value}</p><p className="text-xs text-gray-500">{k.label}</p></div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            {/* Quick check */}
            <Card>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Package Check</p>
              <div className="space-y-2">
                <input type="text" value={quickPkg.name} onChange={e => setQuickPkg(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && quickCheck()} placeholder="Package name"
                  className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" />
                <div className="flex gap-2">
                  <input type="text" value={quickPkg.version} onChange={e => setQuickPkg(p => ({ ...p, version: e.target.value }))}
                    placeholder="Version" className="flex-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono" />
                  <select value={quickPkg.ecosystem} onChange={e => setQuickPkg(p => ({ ...p, ecosystem: e.target.value }))}
                    className="px-2 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-xs text-gray-300 focus:outline-none">
                    {['npm','pypi','maven','cargo','go','rubygems','nuget'].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <Button variant="primary" size="sm" icon={quickLoad ? RefreshCw : Search} onClick={quickCheck}
                  disabled={quickLoad || !quickPkg.name.trim()} className="w-full">
                  {quickLoad ? 'Checking…' : 'Check Package'}
                </Button>
              </div>
              {quickResult && (
                <div className={clsx('mt-3 p-3 rounded-xl border text-xs',
                  quickResult.riskLevel === 'safe' ? 'bg-green-500/8 border-green-500/20' : 'bg-red-500/8 border-red-500/20')}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {quickResult.riskLevel === 'safe'
                      ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                      : <AlertTriangle className="h-4 w-4 text-red-400" />}
                    <span className={clsx('font-bold uppercase', RISK_META[quickResult.riskLevel]?.color)}>{quickResult.riskLevel} risk</span>
                    <span className="font-mono text-gray-500 ml-auto">{quickResult.package.name}@{quickResult.package.version || 'latest'}</span>
                  </div>
                  {quickResult.threats?.map((t: string) => <div key={t} className="text-gray-400">{THREAT_LABELS[t] ?? t}</div>)}
                  {quickResult.riskLevel === 'safe' && <p className="text-green-400/80">No known threats detected</p>}
                </div>
              )}
            </Card>

            {/* Scan list */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Scanned Projects</p>
              {isLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : scans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-700 py-10 text-center">
                  <Upload className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No manifests scanned yet</p>
                  <p className="text-xs text-gray-700 mt-1">Upload package.json, requirements.txt, go.mod…</p>
                </div>
              ) : scans.map((sc: any) => {
                const grade = sc.criticalCount > 0 ? 'F' : sc.highCount > 0 ? 'C' : 'A'
                const color = GRADE_COLOR[grade] ?? '#6b7280'
                return (
                  <button key={sc.id} onClick={() => setSelected(sc.id)}
                    className={clsx('w-full flex items-center gap-3 p-3.5 rounded-xl border mb-2 text-left transition-all',
                      selectedScanId === sc.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-800 hover:border-gray-700')}>
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-black"
                      style={{ background: `${color}18`, color }}>{grade}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{sc.projectName}</p>
                      <p className="text-xs text-gray-600">
                        {sc.ecosystem} · {sc.packageCount} pkgs
                        {sc.criticalCount > 0 && <span className="text-red-400 ml-1">· {sc.criticalCount} critical</span>}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Supported formats */}
            <Card className="bg-gray-900/40">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Supported Manifests</p>
              {[['npm/Node.js','package.json, package-lock.json'],['Python','requirements.txt, Pipfile.lock'],['Java','pom.xml'],['Rust','Cargo.toml'],['Go','go.mod, go.sum']].map(([eco, files]) => (
                <div key={eco} className="flex items-baseline gap-2 py-1.5 border-b border-gray-800 last:border-0">
                  <span className="text-xs font-medium text-gray-400 w-24 flex-shrink-0">{eco}</span>
                  <span className="text-xs font-mono text-gray-600 truncate">{files}</span>
                </div>
              ))}
            </Card>
          </div>

          <div className="lg:col-span-2">
            {!selectedScanId ? (
              <Card className="flex flex-col items-center justify-center py-20 h-full">
                <div className="rounded-2xl bg-gray-800/50 p-5 mb-4">
                  <Shield className="h-10 w-10 text-gray-600" />
                </div>
                <p className="text-sm font-medium text-gray-400 mb-2">Select a project or upload a manifest</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center">
                  {['OSV.dev CVEs','Typosquatting','Malicious DB','SBOM Export','CycloneDX','Auto-alerts'].map(f => (
                    <div key={f} className="flex items-center gap-1 p-2 rounded-lg bg-gray-800/40 text-gray-600">
                      <CheckCircle2 className="h-3 w-3 text-green-500/60 flex-shrink-0" />{f}
                    </div>
                  ))}
                </div>
              </Card>
            ) : !detail ? (
              <Card className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 text-gray-600 animate-spin" />
              </Card>
            ) : (
              <ScanDetail scan={detail} />
            )}
          </div>
        </div>
      </PageContent>
    </AppShell>
  )
}
