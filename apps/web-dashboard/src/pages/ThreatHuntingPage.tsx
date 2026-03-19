import { useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Button, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  Search, Play, Save, BookOpen, Target, Clock, Download,
  ChevronRight, AlertTriangle, TrendingUp, Shield, Zap,
  Check, X, Plus, RefreshCw, ExternalLink, Copy,
  Filter, Terminal, BarChart3, ArrowUpRight,
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
  credential:   { label: 'Credential Attacks', color: 'text-red-400 bg-red-500/10',    icon: Shield },
  lateral:      { label: 'Lateral Movement',   color: 'text-orange-400 bg-orange-500/10', icon: ArrowUpRight },
  exfiltration: { label: 'Exfiltration',       color: 'text-yellow-400 bg-yellow-500/10', icon: TrendingUp },
  persistence:  { label: 'Persistence',        color: 'text-purple-400 bg-purple-500/10', icon: Target },
  execution:    { label: 'Execution',          color: 'text-pink-400 bg-pink-500/10',   icon: Zap },
  discovery:    { label: 'Discovery',          color: 'text-blue-400 bg-blue-500/10',   icon: Search },
}

const SEV_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10',
  high:     'text-orange-400 bg-orange-500/10',
  medium:   'text-yellow-400 bg-yellow-500/10',
  low:      'text-blue-400 bg-blue-500/10',
}

function formatMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

// ─────────────────────────────────────────────
// QUERY EDITOR
// ─────────────────────────────────────────────

function QueryEditor({ value, onChange, onRun, loading }: {
  value: string; onChange: (v: string) => void
  onRun: () => void; loading: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800
                      bg-gray-800/40 rounded-t-xl">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">ClickHouse SQL</span>
          <span className="text-xs text-gray-700">· read-only · tenant-isolated</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 font-mono">{value.length} chars</span>
          <button
            onClick={onRun}
            disabled={loading || !value.trim()}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
              'bg-blue-600 text-white hover:bg-blue-500',
              (loading || !value.trim()) && 'opacity-50 cursor-not-allowed',
            )}
          >
            {loading
              ? <><RefreshCw className="h-3 w-3 animate-spin" /> Running…</>
              : <><Play className="h-3 w-3" /> Run Hunt</>
            }
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        className="flex-1 w-full px-4 py-3 bg-gray-950 text-gray-300 text-xs font-mono
                   leading-relaxed resize-none focus:outline-none rounded-b-xl
                   scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800"
        placeholder="-- Write a ClickHouse SQL query
-- Required: WHERE tenant_id = {tenant_id:UUID}
-- Use {param_name:Type} for parameters

SELECT
  actor_user_id,
  count() AS events,
  max(event_time) AS last_seen
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_time >= now() - INTERVAL 24 HOUR
GROUP BY actor_user_id
ORDER BY events DESC
LIMIT 100"
        style={{ minHeight: '200px' }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// RESULTS TABLE
// ─────────────────────────────────────────────

function ResultsTable({ result }: { result: any }) {
  const [copied, setCopied] = useState(false)

  function copyAsCsv() {
    const header = result.columns.join(',')
    const rows = result.rows.map((r: any) =>
      result.columns.map((c: string) => {
        const v = String(r[c] ?? '')
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
      }).join(','),
    )
    navigator.clipboard.writeText([header, ...rows].join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Result meta bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/30
                      border-b border-gray-800 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-xs font-medium text-gray-300">
              {result.rowCount.toLocaleString()} rows
            </span>
          </div>
          {result.truncated && (
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Truncated at {result.rowCount.toLocaleString()}
            </span>
          )}
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatMs(result.executionMs)}
          </span>
          <span className="text-xs font-mono text-gray-700">{result.queryId?.slice(0, 8)}…</span>
        </div>

        <button onClick={copyAsCsv}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-gray-500
                     hover:text-gray-300 border border-gray-700 hover:border-gray-600 transition-colors">
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied!' : 'Copy CSV'}
        </button>
      </div>

      {/* Table */}
      {result.rowCount === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">No results found. Try adjusting your parameters.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-900 border-b border-gray-800">
                {result.columns.map((col: string) => (
                  <th key={col}
                    className="px-4 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wider
                               whitespace-nowrap border-r border-gray-800 last:border-r-0">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row: any, i: number) => (
                <tr key={i}
                  className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors">
                  {result.columns.map((col: string) => (
                    <td key={col}
                      className="px-4 py-2 text-gray-300 font-mono whitespace-nowrap
                                 border-r border-gray-800/40 last:border-r-0 max-w-xs truncate">
                      {row[col] === null || row[col] === undefined ? (
                        <span className="text-gray-700">null</span>
                      ) : typeof row[col] === 'object' ? (
                        <span className="text-blue-400 text-xs">{JSON.stringify(row[col])}</span>
                      ) : (
                        String(row[col])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// TEMPLATE CARD
// ─────────────────────────────────────────────

function TemplateCard({ template, onLoad }: { template: any; onLoad: (t: any) => void }) {
  const catMeta = CAT_META[template.category] ?? CAT_META['discovery']!
  const Icon    = catMeta.icon

  return (
    <button
      onClick={() => onLoad(template)}
      className="w-full text-left p-4 rounded-xl border border-gray-800
                 hover:border-gray-700 hover:bg-gray-800/30 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium', catMeta.color)}>
          <Icon className="h-3 w-3" />
          {catMeta.label}
        </span>
        <span className={clsx('px-1.5 py-0.5 rounded text-xs font-bold capitalize', SEV_COLORS[template.severity])}>
          {template.severity}
        </span>
      </div>

      <h4 className="text-sm font-semibold text-gray-200 mb-1 group-hover:text-white transition-colors">
        {template.name}
      </h4>
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-2">
        {template.description}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-700 font-mono">{template.id}</span>
        {template.mitreTechniques?.slice(0, 2).map((t: string) => (
          <span key={t} className="text-xs font-mono text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
            {t}
          </span>
        ))}
        {(template.mitreTechniques?.length ?? 0) > 2 && (
          <span className="text-xs text-gray-700">+{template.mitreTechniques.length - 2}</span>
        )}
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────
// IOC PIVOT PANEL
// ─────────────────────────────────────────────

function IocPivotPanel({ onResult }: { onResult: (r: any) => void }) {
  const [type,    setType]    = useState<'ip'|'user'|'domain'|'hash'>('ip')
  const [value,   setValue]   = useState('')
  const [days,    setDays]    = useState(30)
  const [loading, setLoading] = useState(false)

  async function runPivot() {
    if (!value.trim()) return
    setLoading(true)
    try {
      const r = await fetch('/api/v1/hunt/pivot', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ type, value: value.trim(), lookbackDays: days }),
      })
      const data = await r.json()
      if (data.success) onResult(data.data)
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1">
        {(['ip','user','domain','hash'] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={clsx(
              'py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
              type === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300',
            )}>
            {t}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && runPivot()}
        placeholder={
          type === 'ip'     ? '45.33.32.156' :
          type === 'user'   ? 'alice@acme.com' :
          type === 'domain' ? 'evil-c2.com' :
          'sha256:abc123…'
        }
        className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800
                   text-sm text-gray-200 placeholder-gray-600 font-mono
                   focus:outline-none focus:border-blue-500"
      />

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 flex-shrink-0">Lookback:</label>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700
                     text-xs text-gray-300 focus:outline-none focus:border-blue-500">
          {[7, 14, 30, 60, 90].map(d => (
            <option key={d} value={d}>{d} days</option>
          ))}
        </select>
        <button onClick={runPivot} disabled={loading || !value.trim()}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
            'bg-orange-600 text-white hover:bg-orange-500',
            (loading || !value.trim()) && 'opacity-50 cursor-not-allowed',
          )}>
          {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
          Pivot
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function ThreatHuntingPage() {
  const [query,       setQuery]    = useState('')
  const [activeView,  setView]     = useState<'editor'|'timeline'>('editor')
  const [result,      setResult]   = useState<any>(null)
  const [error,       setError]    = useState<string | null>(null)
  const [running,     setRunning]  = useState(false)
  const [activePanel, setPanel]    = useState<'templates'|'saved'|'pivot'>('templates')
  const [catFilter,   setCatFilter]= useState<string>('all')
  const [saveModal,   setSaveModal]= useState(false)
  const [saveName,    setSaveName] = useState('')
  const [promoteModal, setPromote]= useState<string | null>(null)
  const qc = useQueryClient()

  const { data: templatesData } = useQuery({
    queryKey: ['hunt-templates', catFilter],
    queryFn:  () => fetch(`/api/v1/hunt/templates${catFilter !== 'all' ? `?category=${catFilter}` : ''}`, { headers: H() }).then(r => r.json()),
    staleTime: Infinity,
  })

  const { data: savedData, isLoading: savedLoading } = useQuery({
    queryKey: ['hunt-saved'],
    queryFn:  () => fetch('/api/v1/hunt/saved', { headers: H() }).then(r => r.json()),
    staleTime: 60_000,
    enabled: activePanel === 'saved',
  })

  const templates = templatesData?.data?.templates ?? []
  const saved     = savedData?.data ?? []
  const categories = ['all', ...(templatesData?.data?.categories ?? [])]

  function loadTemplate(t: any) {
    setQuery(t.query)
    setPanel('templates')
    setResult(null)
    setError(null)
  }

  async function runQuery() {
    if (!query.trim()) return
    setRunning(true)
    setError(null)
    try {
      const r = await fetch('/api/v1/hunt/execute', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ query, parameters: {} }),
      })
      const data = await r.json()
      if (data.success) {
        setResult(data.data)
      } else {
        setError(data.error?.message ?? 'Query failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setRunning(false)
    }
  }

  async function saveHunt() {
    if (!saveName.trim() || !query.trim()) return
    await fetch('/api/v1/hunt/saved', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ name: saveName, description: '', query, parameters: {} }),
    })
    setSaveModal(false)
    setSaveName('')
    qc.invalidateQueries({ queryKey: ['hunt-saved'] })
  }

  async function deleteHunt(id: string) {
    await fetch(`/api/v1/hunt/saved/${id}`, { method: 'DELETE', headers: H() })
    qc.invalidateQueries({ queryKey: ['hunt-saved'] })
  }

  return (
    <AppShell
      title="Threat Hunting"
      actions={
        <div className="flex items-center gap-2">
          {query && (
            <Button variant="outline" size="sm" icon={Save} onClick={() => setSaveModal(true)}>
              Save Hunt
            </Button>
          )}
          {result && (
            <Button variant="outline" size="sm" icon={ArrowUpRight} onClick={() => setPromote(query)}>
              Promote to Rule
            </Button>
          )}
        </div>
      }
    >
      <PageContent className="h-full">
        <div className="grid grid-cols-12 gap-4 h-full" style={{ minHeight: 'calc(100vh - 130px)' }}>

          {/* ── Left panel ──────────────────────── */}
          <div className="col-span-3 flex flex-col gap-3">

            {/* Panel tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-gray-900 border border-gray-800">
              {[
                { id: 'templates', label: 'Templates', icon: BookOpen },
                { id: 'saved',     label: 'Saved',     icon: Save },
                { id: 'pivot',     label: 'IOC Pivot',  icon: Target },
              ].map(p => (
                <button key={p.id} onClick={() => setPanel(p.id as any)}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                    activePanel === p.id ? 'bg-gray-800 text-gray-200 shadow' : 'text-gray-600 hover:text-gray-400',
                  )}>
                  <p.icon className="h-3 w-3" />
                  {p.label}
                </button>
              ))}
            </div>

            {/* Templates panel */}
            {activePanel === 'templates' && (
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                {/* Category filter */}
                <div className="flex gap-1 flex-wrap">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setCatFilter(cat)}
                      className={clsx(
                        'px-2 py-1 rounded text-xs font-medium capitalize transition-colors',
                        catFilter === cat ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300',
                      )}>
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Template list */}
                <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-800">
                  {templates.length === 0
                    ? <div className="text-center py-8 text-xs text-gray-600">Loading templates…</div>
                    : templates.map((t: any) => (
                      <TemplateCard key={t.id} template={t} onLoad={loadTemplate} />
                    ))
                  }
                </div>
              </div>
            )}

            {/* Saved hunts panel */}
            {activePanel === 'saved' && (
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {savedLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : saved.length === 0 ? (
                  <div className="py-8 text-center">
                    <Save className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-xs text-gray-600">No saved hunts yet</p>
                  </div>
                ) : (
                  saved.map((h: any) => (
                    <div key={h.id}
                      className="p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <button onClick={() => { setQuery(h.query); setResult(null); setError(null) }}
                          className="text-left flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-300 truncate">{h.name}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Ran {h.runCount}× · {new Date(h.createdAt).toLocaleDateString()}
                          </p>
                        </button>
                        <button onClick={() => deleteHunt(h.id)}
                          className="text-gray-700 hover:text-red-400 transition-colors flex-shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* IOC Pivot panel */}
            {activePanel === 'pivot' && (
              <IocPivotPanel onResult={(r) => { setResult(r); setError(null) }} />
            )}
          </div>

          {/* ── Editor + Results ─────────────────── */}
          <div className="col-span-9 flex flex-col gap-4 min-h-0">

            {/* Editor */}
            <Card padding="none" className="flex-shrink-0"
              style={{ minHeight: '240px', maxHeight: '280px' }}>
              <QueryEditor
                value={query}
                onChange={setQuery}
                onRun={runQuery}
                loading={running}
              />
            </Card>

            {/* Status / Error */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20">
                <X className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-400 mb-1">Query Error</p>
                  <p className="text-xs text-red-400/80 font-mono leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Results */}
            {result && !error && (
              <Card padding="none" className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ResultsTable result={result} />
              </Card>
            )}

            {/* Empty state */}
            {!result && !error && !running && (
              <Card className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="rounded-2xl bg-blue-500/10 p-5 w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <Search className="h-8 w-8 text-blue-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-200 mb-2">Start Hunting</h3>
                  <p className="text-sm text-gray-500 max-w-sm mb-4 leading-relaxed">
                    Select a template from the left to load a pre-built query, or write your own ClickHouse SQL.
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                    {['20 hunt templates', 'IOC pivot search', 'Hunt → rule promotion'].map(f => (
                      <div key={f} className="flex items-center gap-1.5 p-2 rounded-lg bg-gray-800/40">
                        <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {running && (
              <Card className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Scanning events…</p>
                  <p className="text-xs text-gray-600 mt-1">ClickHouse query executing</p>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* ── Save Modal ──────────────────────── */}
        {saveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setSaveModal(false)} />
            <Card className="relative w-full max-w-md mx-4 z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-100">Save Hunt</h3>
                <button onClick={() => setSaveModal(false)} className="text-gray-500 hover:text-gray-300">✕</button>
              </div>
              <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
                placeholder="Hunt name…"
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800
                           text-sm text-gray-200 placeholder-gray-600 mb-4
                           focus:outline-none focus:border-blue-500"
                onKeyDown={e => e.key === 'Enter' && saveHunt()} />
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={() => setSaveModal(false)}>Cancel</Button>
                <Button variant="primary" icon={Save} onClick={saveHunt} disabled={!saveName.trim()}>Save</Button>
              </div>
            </Card>
          </div>
        )}

        {/* ── Promote Modal ────────────────────── */}
        {promoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={() => setPromote(null)} />
            <Card className="relative w-full max-w-md mx-4 z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-100">Promote to Detection Rule</h3>
                <button onClick={() => setPromote(null)} className="text-gray-500 hover:text-gray-300">✕</button>
              </div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                This query will be saved as a custom detection rule that runs automatically on every new event batch.
              </p>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Rule Name</label>
                  <input type="text" placeholder="e.g. Custom Mass Download Detection"
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800
                               text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Severity</label>
                  <div className="mt-2 flex gap-2">
                    {['critical','high','medium','low'].map(s => (
                      <button key={s} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs capitalize text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors">{s}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={() => setPromote(null)}>Cancel</Button>
                <Button variant="primary" icon={ArrowUpRight} onClick={() => setPromote(null)}>
                  Promote to Rule
                </Button>
              </div>
            </Card>
          </div>
        )}

      </PageContent>
    </AppShell>
  )
}
