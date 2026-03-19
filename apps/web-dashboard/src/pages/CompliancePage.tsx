import { useState } from 'react'
import { clsx } from 'clsx'
import { useAttackCoverage, useDetectionRules, useAuditLog } from '@/hooks/queries'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Badge, Card, Skeleton, EmptyState } from '@/components/shared/ui'
import {
  ShieldCheck, Tag, FileSearch, BookOpen, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, Filter,
} from 'lucide-react'

// ─────────────────────────────────────────────
// MITRE ATT&CK TACTICS (ordered by attack lifecycle)
// ─────────────────────────────────────────────

const TACTICS = [
  { id: 'TA0001', name: 'Initial\nAccess',       short: 'IA' },
  { id: 'TA0002', name: 'Execution',             short: 'EX' },
  { id: 'TA0003', name: 'Persistence',           short: 'PS' },
  { id: 'TA0004', name: 'Privilege\nEscalation', short: 'PE' },
  { id: 'TA0005', name: 'Defense\nEvasion',      short: 'DE' },
  { id: 'TA0006', name: 'Credential\nAccess',    short: 'CA' },
  { id: 'TA0007', name: 'Discovery',             short: 'DI' },
  { id: 'TA0008', name: 'Lateral\nMovement',     short: 'LM' },
  { id: 'TA0009', name: 'Collection',            short: 'CO' },
  { id: 'TA0010', name: 'Exfiltration',          short: 'EF' },
  { id: 'TA0011', name: 'C2',                    short: 'C2' },
  { id: 'TA0040', name: 'Impact',               short: 'IM' },
]

// ─────────────────────────────────────────────
// ATT&CK HEATMAP CELL
// ─────────────────────────────────────────────

function HeatmapCell({
  tacticId, covered, ruleCount, techniqueId, techniqueName,
}: {
  tacticId: string; covered: boolean; ruleCount: number
  techniqueId: string; techniqueName: string
}) {
  const intensity = ruleCount >= 3 ? 'bg-green-500/80' : ruleCount >= 2 ? 'bg-green-500/50'
                  : ruleCount >= 1 ? 'bg-green-500/25' : 'bg-gray-800/60'

  return (
    <div
      title={`${techniqueId}: ${techniqueName}\n${ruleCount} rule(s)`}
      className={clsx(
        'rounded px-1.5 py-1 text-xs font-mono text-center transition-all cursor-default',
        'border hover:scale-105',
        covered
          ? `${intensity} text-green-300 border-green-500/20`
          : 'text-gray-700 border-gray-800/40 hover:border-gray-700',
      )}
    >
      {techniqueId.split('.')[0]?.replace('T', '')}
    </div>
  )
}

// ─────────────────────────────────────────────
// DETECTION RULES TABLE
// ─────────────────────────────────────────────

function DetectionRulesTable({ rules }: { rules: any[] }) {
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all')

  const filtered = rules.filter(r =>
    filter === 'all' ? true
    : filter === 'enabled' ? r.enabled
    : !r.enabled,
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {(['all', 'enabled', 'disabled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
              filter === f
                ? 'bg-gray-700 text-gray-200'
                : 'text-gray-600 hover:text-gray-400',
            )}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-600">{filtered.length} rules</span>
      </div>

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium
                        text-gray-500 uppercase tracking-wider bg-gray-800/40">
          <div className="col-span-1">Status</div>
          <div className="col-span-4">Rule</div>
          <div className="col-span-2">Severity</div>
          <div className="col-span-3">MITRE</div>
          <div className="col-span-2 text-right">Hits</div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm">
            No rules match the filter
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {filtered.map((rule: any) => (
              <div key={rule.id}
                className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-gray-800/30 transition-colors">
                <div className="col-span-1">
                  {rule.enabled
                    ? <CheckCircle2 className="h-4 w-4 text-green-500/70" />
                    : <XCircle className="h-4 w-4 text-gray-700" />}
                </div>
                <div className="col-span-4 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{rule.name}</p>
                  <p className="text-xs font-mono text-gray-600">{rule.id}</p>
                </div>
                <div className="col-span-2">
                  <Badge variant={rule.severity as any} size="xs">{rule.severity}</Badge>
                </div>
                <div className="col-span-3">
                  <div className="flex flex-wrap gap-1">
                    {rule.mitreTechniques?.slice(0, 2).map((t: string) => (
                      <span key={t} className="text-xs font-mono text-gray-600">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <span className={clsx('text-sm font-bold tabular-nums',
                    (rule.hitCount ?? 0) > 0 ? 'text-blue-400' : 'text-gray-600')}>
                    {rule.hitCount ?? 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// AUDIT LOG TABLE
// ─────────────────────────────────────────────

function AuditLogTable({ entries }: { entries: any[] }) {
  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <div className="grid grid-cols-12 gap-4 px-4 py-2.5 text-xs font-medium
                      text-gray-500 uppercase tracking-wider bg-gray-800/40">
        <div className="col-span-3">Actor</div>
        <div className="col-span-3">Action</div>
        <div className="col-span-3">Resource</div>
        <div className="col-span-3 text-right">Time</div>
      </div>
      <div className="divide-y divide-gray-800/60 max-h-[400px] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm">No audit events</div>
        ) : (
          entries.map((entry: any) => (
            <div key={entry.id}
              className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-800/30">
              <div className="col-span-3 min-w-0">
                <p className="text-xs text-gray-400 truncate">
                  {entry.actorEmail ?? entry.actorId?.slice(0, 12) ?? 'System'}
                </p>
                <p className="text-xs text-gray-600 capitalize">{entry.actorRole ?? ''}</p>
              </div>
              <div className="col-span-3">
                <p className="text-xs font-mono text-blue-400/80">{entry.action}</p>
              </div>
              <div className="col-span-3 min-w-0">
                <p className="text-xs text-gray-500 capitalize">{entry.resourceType}</p>
                <p className="text-xs text-gray-700 font-mono truncate">
                  {entry.resourceId?.slice(0, 12)}…
                </p>
              </div>
              <div className="col-span-3 text-right">
                <p className="text-xs text-gray-500">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// COMPLIANCE PAGE
// ─────────────────────────────────────────────

export default function CompliancePage() {
  const [activeTab, setTab] = useState<'coverage' | 'rules' | 'audit'>('coverage')
  const [gapsOnly, setGapsOnly] = useState(false)

  const { data: coverageData, isLoading: covLoading } = useAttackCoverage(gapsOnly)
  const { data: rulesData,    isLoading: rulesLoading } = useDetectionRules()
  const { data: auditData,    isLoading: auditLoading } = useAuditLog()

  const coverage = coverageData?.data ?? {}
  const rules    = rulesData?.data    ?? []
  const auditLog = auditData?.data    ?? []

  // Coverage stats
  const coveredCount   = Object.values(coverage).filter((c: any) => c.covered).length
  const totalTechniques = Object.keys(coverage).length
  const coveragePct    = totalTechniques > 0
    ? Math.round((coveredCount / totalTechniques) * 100)
    : 0

  const tabs = [
    { id: 'coverage', label: 'ATT&CK Coverage', icon: ShieldCheck },
    { id: 'rules',    label: 'Detection Rules', icon: FileSearch },
    { id: 'audit',    label: 'Audit Log',       icon: BookOpen },
  ] as const

  return (
    <AppShell title="Compliance & Coverage">
      <PageContent>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="flex flex-col justify-center gap-1">
            <p className={clsx('text-3xl font-bold tabular-nums',
              coveragePct >= 60 ? 'text-green-400' : coveragePct >= 40 ? 'text-yellow-400' : 'text-red-400')}>
              {coveragePct}%
            </p>
            <p className="text-sm text-gray-400">ATT&CK Technique Coverage</p>
            <p className="text-xs text-gray-600">{coveredCount} of {totalTechniques} techniques</p>
          </Card>
          <Card className="flex flex-col justify-center gap-1">
            <p className="text-3xl font-bold text-blue-400 tabular-nums">
              {rules.filter((r: any) => r.enabled).length}
            </p>
            <p className="text-sm text-gray-400">Active Detection Rules</p>
            <p className="text-xs text-gray-600">{rules.length} total</p>
          </Card>
          <Card className="flex flex-col justify-center gap-1">
            <p className="text-3xl font-bold text-gray-300 tabular-nums">
              {auditLog.length}
            </p>
            <p className="text-sm text-gray-400">Audit Events (30 days)</p>
            <p className="text-xs text-gray-600 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-green-500" />
              Hash-chained log
            </p>
          </Card>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-gray-800 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                activeTab === tab.id
                  ? 'text-blue-400 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-300',
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ATT&CK Coverage Heatmap */}
        {activeTab === 'coverage' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Coverage across MITRE ATT&CK tactics and techniques.
                <a href="https://attack.mitre.org" target="_blank" rel="noopener noreferrer"
                  className="ml-2 text-blue-400 hover:underline inline-flex items-center gap-1">
                  MITRE ATT&CK <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <button
                onClick={() => setGapsOnly(v => !v)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  gapsOnly
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'text-gray-500 border-gray-700 hover:border-gray-600',
                )}
              >
                <Filter className="h-3 w-3" />
                {gapsOnly ? 'Showing gaps only' : 'Show gaps only'}
              </button>
            </div>

            {covLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Card>
                {/* Tactics header */}
                <div className="grid grid-cols-12 gap-2 mb-3">
                  {TACTICS.map(t => (
                    <div key={t.id} className="text-center">
                      <div className={clsx(
                        'text-xs font-bold px-1 py-1.5 rounded-t border-b',
                        Object.values(coverage).some((c: any) =>
                          c.tacticId === t.id && c.covered)
                          ? 'text-green-400 border-green-500/30 bg-green-500/5'
                          : 'text-gray-700 border-gray-800 bg-gray-800/40',
                      )}>
                        {t.short}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Technique cells */}
                <div className="grid grid-cols-12 gap-2">
                  {TACTICS.map(tactic => {
                    const techniques = Object.entries(coverage).filter(
                      ([, v]: any) => v.tacticId === tactic.id,
                    )
                    return (
                      <div key={tactic.id} className="flex flex-col gap-1">
                        {techniques.slice(0, 8).map(([techId, tech]: any) => (
                          <HeatmapCell
                            key={techId}
                            tacticId={tactic.id}
                            covered={tech.covered}
                            ruleCount={tech.ruleCount ?? 0}
                            techniqueId={techId}
                            techniqueName={tech.techniqueName}
                          />
                        ))}
                        {techniques.length > 8 && (
                          <div className="text-xs text-gray-700 text-center">
                            +{techniques.length - 8}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-green-500/80" /> 3+ rules
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-green-500/40" /> 1–2 rules
                  </span>
                  <span className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-gray-800/60 border border-gray-700" /> No coverage
                  </span>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Detection Rules */}
        {activeTab === 'rules' && (
          rulesLoading
            ? <Skeleton className="h-64 w-full" />
            : <DetectionRulesTable rules={rules} />
        )}

        {/* Audit Log */}
        {activeTab === 'audit' && (
          <div>
            <div className="flex items-center gap-2 mb-4 p-4 rounded-xl bg-green-500/5
                            border border-green-500/15">
              <ShieldCheck className="h-4 w-4 text-green-400 flex-shrink-0" />
              <p className="text-xs text-gray-400">
                Audit log entries are cryptographically hash-chained (SHA-256).
                Any tampering is detectable by verifying the hash chain.
              </p>
            </div>
            {auditLoading
              ? <Skeleton className="h-64 w-full" />
              : <AuditLogTable entries={auditLog} />}
          </div>
        )}

      </PageContent>
    </AppShell>
  )
}
