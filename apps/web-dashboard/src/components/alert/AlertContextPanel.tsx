import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import { useRiskUser, useAlerts } from '@/hooks/queries'
import { Badge, Card, Skeleton } from '@/components/shared/ui'
import {
  Tag, ExternalLink, User, Server, TrendingUp,
  TrendingDown, Minus, ShieldAlert, ChevronRight,
  AlertTriangle, Activity, Globe,
} from 'lucide-react'

// ─────────────────────────────────────────────
// MITRE ATT&CK MAP
// ─────────────────────────────────────────────

const TACTIC_NAMES: Record<string, string> = {
  TA0001: 'Initial Access',
  TA0002: 'Execution',
  TA0003: 'Persistence',
  TA0004: 'Privilege Escalation',
  TA0005: 'Defense Evasion',
  TA0006: 'Credential Access',
  TA0007: 'Discovery',
  TA0008: 'Lateral Movement',
  TA0009: 'Collection',
  TA0010: 'Exfiltration',
  TA0011: 'Command & Control',
  TA0040: 'Impact',
}

const TACTIC_COLORS: Record<string, string> = {
  TA0001: 'bg-red-500/15 text-red-400 border-red-500/20',
  TA0002: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  TA0003: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  TA0004: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  TA0005: 'bg-lime-500/15 text-lime-400 border-lime-500/20',
  TA0006: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  TA0007: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  TA0008: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  TA0009: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  TA0010: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  TA0011: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20',
  TA0040: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
}

// ─────────────────────────────────────────────
// RISK SCORE RING
// ─────────────────────────────────────────────

function RiskRing({ score, label }: { score: number; label: string }) {
  const r = 22
  const circumference = 2 * Math.PI * r
  const fraction      = score / 100
  const strokeDash    = fraction * circumference

  const color = score >= 70 ? '#ef4444'
    : score >= 50 ? '#f97316'
    : score >= 25 ? '#eab308'
    : '#22c55e'

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="60" height="60" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r={r}
            fill="none" stroke="#1f2937" strokeWidth="5" />
          <circle cx="30" cy="30" r={r}
            fill="none" stroke={color} strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circumference}`}
            transform="rotate(-90 30 30)"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-gray-200">{score}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

// ─────────────────────────────────────────────
// ALERT CONTEXT PANEL
// ─────────────────────────────────────────────

interface AlertContextPanelProps {
  alert: {
    id:                string
    mitreTactics:      string[]
    mitreTechniques:   string[]
    affectedUserId?:   string | null
    affectedIp?:       string | null
    affectedAssetId?:  string | null
    tenantId:          string
  }
}

export function AlertContextPanel({ alert }: AlertContextPanelProps) {
  // Fetch entity risk score
  const { data: userRiskData, isLoading: riskLoading } = useRiskUser(
    alert.affectedUserId ?? '',
  )
  const userRisk = userRiskData?.data

  // Fetch related alerts (same user or IP in last 30 days)
  const { data: relatedData } = useAlerts({
    status: ['open', 'investigating', 'resolved'],
    limit:  20,
  })
  const relatedAlerts = (relatedData?.data ?? [])
    .filter((a: any) =>
      a.id !== alert.id && (
        (alert.affectedUserId && a.affectedUserId === alert.affectedUserId) ||
        (alert.affectedIp    && a.affectedIp    === alert.affectedIp)
      ),
    )
    .slice(0, 5)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">

        {/* ── MITRE ATT&CK Context ──────────────── */}
        {(alert.mitreTactics?.length > 0 || alert.mitreTechniques?.length > 0) && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                MITRE ATT&CK
              </h3>
            </div>

            {/* Tactics */}
            {alert.mitreTactics?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-600 mb-2">Tactics</p>
                <div className="flex flex-wrap gap-1.5">
                  {alert.mitreTactics.map(t => (
                    <a
                      key={t}
                      href={`https://attack.mitre.org/tactics/${t}/`}
                      target="_blank" rel="noopener noreferrer"
                      className={clsx(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs',
                        'font-mono font-medium border transition-opacity hover:opacity-80',
                        TACTIC_COLORS[t] ?? 'bg-gray-700 text-gray-400 border-gray-600',
                      )}
                    >
                      {t}
                      <span className="text-xs opacity-60 ml-0.5">
                        {TACTIC_NAMES[t] ? `· ${TACTIC_NAMES[t]}` : ''}
                      </span>
                      <ExternalLink className="h-2.5 w-2.5 opacity-50 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Techniques */}
            {alert.mitreTechniques?.length > 0 && (
              <div>
                <p className="text-xs text-gray-600 mb-2">Techniques</p>
                <div className="flex flex-wrap gap-1.5">
                  {alert.mitreTechniques.map(t => (
                    <a
                      key={t}
                      href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs
                                 font-mono bg-gray-800 text-gray-400 border border-gray-700
                                 hover:text-gray-200 transition-colors"
                    >
                      {t}
                      <ExternalLink className="h-2.5 w-2.5 opacity-40" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Entity Risk Score ─────────────────── */}
        {alert.affectedUserId && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Affected User Risk
              </h3>
            </div>

            {riskLoading ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ) : userRisk ? (
              <>
                <div className="flex items-center gap-4">
                  <RiskRing score={userRisk.score} label="Risk" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={userRisk.severity as any} size="xs">
                        {userRisk.severity}
                      </Badge>
                      <span className="text-xs text-gray-500 capitalize">
                        {userRisk.confidenceBand} confidence
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 font-mono mt-1 truncate">
                      {alert.affectedUserId.slice(0, 24)}…
                    </p>
                    <Link
                      to={`/risk?userId=${alert.affectedUserId}`}
                      className="text-xs text-blue-400 hover:underline mt-1 inline-flex items-center gap-1"
                    >
                      Full profile <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {/* Contributing signals */}
                {userRisk.contributingSignals?.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs text-gray-600 uppercase tracking-wider">
                      Contributing Signals
                    </p>
                    {userRisk.contributingSignals.slice(0, 3).map((sig: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-full bg-gray-800 rounded-full h-1.5 flex-1">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(sig.contribution, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0 w-16 truncate">
                          {sig.signalType}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-gray-600">No risk data available for this user</p>
                <p className="text-xs text-gray-700 mt-0.5">
                  May need baseline data collection
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── IP / Affected IP context ─────────── */}
        {alert.affectedIp && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Source IP Context
              </h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Address</span>
                <code className="text-xs font-mono text-gray-300">{alert.affectedIp}</code>
              </div>
              <div className="pt-2 border-t border-gray-800">
                <a
                  href={`https://www.shodan.io/host/${alert.affectedIp}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Look up on Shodan
                </a>
                <a
                  href={`https://www.virustotal.com/gui/ip-address/${alert.affectedIp}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline mt-1.5"
                >
                  <ExternalLink className="h-3 w-3" />
                  Check VirusTotal
                </a>
                <a
                  href={`https://www.abuseipdb.com/check/${alert.affectedIp}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline mt-1.5"
                >
                  <ExternalLink className="h-3 w-3" />
                  AbuseIPDB Report
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── Related alerts ─────────────────────── */}
        {relatedAlerts.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Related Alerts
              </h3>
              <span className="text-xs text-gray-600 ml-auto">
                Same {alert.affectedUserId ? 'user' : 'IP'}
              </span>
            </div>
            <div className="space-y-2">
              {relatedAlerts.map((ra: any) => (
                <Link
                  key={ra.id}
                  to={`/alerts/${ra.id}`}
                  className="block rounded-lg border border-gray-800 bg-gray-800/40
                             p-2.5 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Badge variant={ra.priority as any} size="xs">{ra.priority}</Badge>
                    <p className="text-xs text-gray-300 leading-snug line-clamp-2 flex-1">
                      {ra.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant={ra.severity as any} size="xs">{ra.severity}</Badge>
                    <span className="text-xs text-gray-600 ml-auto">
                      {new Date(ra.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Quick links ────────────────────────── */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
            External Resources
          </h3>
          <div className="space-y-2">
            {alert.mitreTechniques?.[0] && (
              <a
                href={`https://attack.mitre.org/techniques/${alert.mitreTechniques[0].replace('.', '/')}/`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-400 hover:underline"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                MITRE ATT&CK: {alert.mitreTechniques[0]}
              </a>
            )}
            <a
              href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-blue-400 hover:underline"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              CISA KEV Catalog
            </a>
            <a
              href="https://nvd.nist.gov/vuln/search"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-blue-400 hover:underline"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              NIST NVD Search
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
