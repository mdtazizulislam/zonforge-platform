import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RulePerformance {
  id: string;
  name: string;
  severity: "critical" | "high" | "medium" | "low";
  mitre_id?: string;
  mitre_tactic?: string;
  total_hits_30d: number;
  true_positives: number;
  false_positives: number;
  fp_rate: number;
  avg_mttd_minutes: number;
  tenant_hit_count: number;
  total_tenants: number;
  trend: "up" | "down" | "stable";
  trend_pct: number;
  top_hit_tenants: string[];
  status: "healthy" | "noisy" | "dead" | "new";
}

interface PlatformDetectionStats {
  total_alerts_30d: number;
  true_positives_30d: number;
  false_positives_30d: number;
  overall_fp_rate: number;
  avg_mttd_minutes: number;
  rules_firing: number;
  rules_total: number;
  dead_rules: number;
  noisy_rules: number;
  daily_trend: { date: string; alerts: number; tp: number; fp: number }[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockStats: PlatformDetectionStats = {
  total_alerts_30d: 12847,
  true_positives_30d: 10934,
  false_positives_30d: 1913,
  overall_fp_rate: 14.9,
  avg_mttd_minutes: 28,
  rules_firing: 34,
  rules_total: 38,
  dead_rules: 4,
  noisy_rules: 6,
  daily_trend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en", { month: "short", day: "numeric" }),
    alerts: 350 + Math.floor(Math.random() * 150),
    tp: 290 + Math.floor(Math.random() * 100),
    fp: 40 + Math.floor(Math.random() * 60),
  })),
};

const mockRules: RulePerformance[] = [
  { id: "r1", name: "Brute-Force to Successful Login", severity: "high", mitre_id: "T1110", mitre_tactic: "Credential Access", total_hits_30d: 3421, true_positives: 3241, false_positives: 180, fp_rate: 5.3, avg_mttd_minutes: 12, tenant_hit_count: 47, total_tenants: 47, trend: "up", trend_pct: 8, top_hit_tenants: ["Acme Corp", "CloudSoft", "FinTech Labs"], status: "healthy" },
  { id: "r2", name: "Impossible Travel Login", severity: "high", mitre_id: "T1078", mitre_tactic: "Initial Access", total_hits_30d: 1284, true_positives: 748, false_positives: 536, fp_rate: 41.7, avg_mttd_minutes: 18, tenant_hit_count: 43, total_tenants: 47, trend: "up", trend_pct: 12, top_hit_tenants: ["SecureBank", "DataDriven Co"], status: "noisy" },
  { id: "r3", name: "Mass Cloud Storage Exfiltration", severity: "critical", mitre_id: "T1530", mitre_tactic: "Exfiltration", total_hits_30d: 87, true_positives: 81, false_positives: 6, fp_rate: 6.9, avg_mttd_minutes: 8, tenant_hit_count: 38, total_tenants: 47, trend: "stable", trend_pct: 0, top_hit_tenants: ["CloudSoft", "SecureBank"], status: "healthy" },
  { id: "r4", name: "Dormant Admin Account Active", severity: "high", mitre_id: "T1078", mitre_tactic: "Persistence", total_hits_30d: 234, true_positives: 228, false_positives: 6, fp_rate: 2.6, avg_mttd_minutes: 31, tenant_hit_count: 41, total_tenants: 47, trend: "down", trend_pct: 5, top_hit_tenants: ["Acme Corp"], status: "healthy" },
  { id: "r5", name: "New IAM Key Created Post-Compromise", severity: "critical", mitre_id: "T1098", mitre_tactic: "Persistence", total_hits_30d: 42, true_positives: 38, false_positives: 4, fp_rate: 9.5, avg_mttd_minutes: 6, tenant_hit_count: 24, total_tenants: 47, trend: "stable", trend_pct: 0, top_hit_tenants: ["FinTech Labs"], status: "healthy" },
  { id: "r6", name: "Bulk API Token Usage", severity: "medium", mitre_id: "T1580", mitre_tactic: "Discovery", total_hits_30d: 1893, true_positives: 512, false_positives: 1381, fp_rate: 72.9, avg_mttd_minutes: 45, tenant_hit_count: 31, total_tenants: 47, trend: "up", trend_pct: 34, top_hit_tenants: ["CloudSoft", "DataDriven Co", "Acme Corp"], status: "noisy" },
  { id: "r7", name: "Off-Hours Admin Login", severity: "medium", mitre_id: "T1078", mitre_tactic: "Initial Access", total_hits_30d: 0, true_positives: 0, false_positives: 0, fp_rate: 0, avg_mttd_minutes: 0, tenant_hit_count: 0, total_tenants: 47, trend: "stable", trend_pct: 0, top_hit_tenants: [], status: "dead" },
  { id: "r8", name: "DNS Tunneling Detection", severity: "high", mitre_id: "T1071", mitre_tactic: "Command and Control", total_hits_30d: 3, true_positives: 3, false_positives: 0, fp_rate: 0, avg_mttd_minutes: 22, tenant_hit_count: 2, total_tenants: 47, trend: "stable", trend_pct: 0, top_hit_tenants: ["SecureBank"], status: "new" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const tacticColor: Record<string, string> = {
  "Credential Access": "#ef4444", "Initial Access": "#f97316",
  "Persistence": "#8b5cf6", "Privilege Escalation": "#ec4899",
  "Defense Evasion": "#6366f1", "Discovery": "#06b6d4",
  "Exfiltration": "#f43f5e", "Impact": "#dc2626",
  "Lateral Movement": "#14b8a6", "Command and Control": "#f59e0b",
};

const ruleStatusStyle: Record<string, string> = {
  healthy: "text-green-400 bg-green-500/10 border-green-500/30",
  noisy: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  dead: "text-red-400 bg-red-500/10 border-red-500/30",
  new: "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

const ruleStatusIcon: Record<string, string> = {
  healthy: "✅", noisy: "🔔", dead: "💀", new: "🆕",
};

const sevColor: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-green-400 bg-green-500/10 border-green-500/30",
};

function TrendBadge({ trend, pct }: { trend: string; pct: number }) {
  if (trend === "stable" || pct === 0) return <span className="text-xs text-slate-500">—</span>;
  return (
    <span className={`text-xs font-medium ${trend === "up" ? "text-red-400" : "text-green-400"}`}>
      {trend === "up" ? "↑" : "↓"} {pct}%
    </span>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
function MiniBarChart({ data, field, color }: { data: any[]; field: string; color: string }) {
  const max = Math.max(...data.map(d => d[field]), 1);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {data.slice(-14).map((d, i) => (
        <div key={i} className="flex-1 rounded-t transition-all hover:opacity-80"
          style={{ height: `${(d[field] / max) * 36}px`, backgroundColor: color, opacity: 0.7 }}
          title={`${d.date}: ${d[field]}`}/>
      ))}
    </div>
  );
}

// ─── FP Rate Gauge ────────────────────────────────────────────────────────────
function FPGauge({ pct }: { pct: number }) {
  const color = pct >= 30 ? "#ef4444" : pct >= 15 ? "#eab308" : "#22c55e";
  const strokeDasharray = `${(pct / 100) * 188} 188`;
  return (
    <svg width="80" height="80" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="30" fill="none" stroke="#1e293b" strokeWidth="10"/>
      <circle cx="50" cy="50" r="30" fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={strokeDasharray} strokeLinecap="round" transform="rotate(-90 50 50)"/>
      <text x="50" y="47" textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">{pct}%</text>
      <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="8">FP Rate</text>
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DetectionPerformance() {
  const [statusFilter, setStatusFilter] = useState<"" | "healthy" | "noisy" | "dead" | "new">("");
  const [sortBy, setSortBy] = useState<"fp_rate" | "hits" | "name">("fp_rate");
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d">("30d");

  const { data: stats = mockStats } = useQuery<PlatformDetectionStats>({
    queryKey: ["detection-stats", period],
    queryFn: async () => { const r = await apiClient.get(`/superadmin/detection/stats?period=${period}`); return r.data; },
  });

  const { data: rules = mockRules } = useQuery<RulePerformance[]>({
    queryKey: ["detection-performance", period],
    queryFn: async () => { const r = await apiClient.get(`/superadmin/detection/rules?period=${period}`); return r.data.data; },
  });

  const filtered = [...rules]
    .filter(r => !statusFilter || r.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === "fp_rate") return b.fp_rate - a.fp_rate;
      if (sortBy === "hits") return b.total_hits_30d - a.total_hits_30d;
      return a.name.localeCompare(b.name);
    });

  const tpRate = Math.round((stats.true_positives_30d / stats.total_alerts_30d) * 100);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Detection Performance</h1>
          <p className="text-slate-400 text-sm mt-1">Platform-wide rule effectiveness and signal quality</p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? "bg-red-700 text-white" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Platform Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alert Volume */}
        <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Alert Volume — Last 30 days</p>
              <p className="text-3xl font-bold text-white">{stats.total_alerts_30d.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">
                <span className="text-green-400 font-medium">{stats.true_positives_30d.toLocaleString()} TP</span>
                {" · "}
                <span className="text-red-400 font-medium">{stats.false_positives_30d.toLocaleString()} FP</span>
              </p>
            </div>
            <FPGauge pct={stats.overall_fp_rate} />
          </div>
          <MiniBarChart data={stats.daily_trend} field="alerts" color="#3b82f6" />
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500/70 rounded-sm inline-block"/>Total Alerts</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="space-y-3">
          {[
            { label: "True Positive Rate", value: `${tpRate}%`, color: tpRate >= 85 ? "text-green-400" : "text-yellow-400", sub: `${stats.true_positives_30d.toLocaleString()} confirmed threats` },
            { label: "Avg MTTD", value: `${stats.avg_mttd_minutes}m`, color: stats.avg_mttd_minutes <= 30 ? "text-green-400" : "text-yellow-400", sub: "Mean time to detect" },
            { label: "Rules Firing", value: `${stats.rules_firing}/${stats.rules_total}`, color: "text-blue-400", sub: `${stats.dead_rules} dead · ${stats.noisy_rules} noisy` },
          ].map((c, i) => (
            <div key={i} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <p className="text-xs text-slate-400 mb-1">{c.label}</p>
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* TP/FP Trend Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <p className="text-xs font-semibold text-white mb-3">True Positives (30d)</p>
          <MiniBarChart data={stats.daily_trend} field="tp" color="#22c55e"/>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <p className="text-xs font-semibold text-white mb-3">False Positives (30d)</p>
          <MiniBarChart data={stats.daily_trend} field="fp" color="#ef4444"/>
        </div>
      </div>

      {/* Rule Performance Table */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <p className="text-sm font-semibold text-white">Rule Performance</p>
          <div className="flex gap-1 ml-auto flex-wrap">
            {([["", "All"], ["healthy", "✅ Healthy"], ["noisy", "🔔 Noisy"], ["dead", "💀 Dead"], ["new", "🆕 New"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setStatusFilter(v as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === v ? "bg-red-700 text-white" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
                {l}
              </button>
            ))}
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none">
              <option value="fp_rate">Sort: FP Rate</option>
              <option value="hits">Sort: Hit Count</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {["Rule","Status","Sev","MITRE","Hits (30d)","TP","FP Rate","MTTD","Tenants","Trend",""].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(rule => (
                <>
                  <tr key={rule.id}
                    className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${rule.status === "dead" ? "opacity-60" : ""}`}
                    onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}>
                    <td className="px-3 py-3">
                      <p className="text-sm font-medium text-white truncate max-w-[200px]">{rule.name}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${ruleStatusStyle[rule.status]}`}>
                        {ruleStatusIcon[rule.status]} {rule.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${sevColor[rule.severity]}`}>{rule.severity}</span>
                    </td>
                    <td className="px-3 py-3">
                      {rule.mitre_id ? (
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono text-white"
                          style={{ backgroundColor: tacticColor[rule.mitre_tactic ?? ""] ?? "#475569" }}>
                          {rule.mitre_id}
                        </span>
                      ) : <span className="text-slate-500 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 text-sm font-bold text-white">{rule.total_hits_30d.toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 bg-slate-700 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${100 - rule.fp_rate}%` }}/>
                        </div>
                        <span className="text-xs text-green-400">{(100 - rule.fp_rate).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-sm font-bold ${rule.fp_rate >= 40 ? "text-red-400" : rule.fp_rate >= 15 ? "text-yellow-400" : "text-green-400"}`}>
                        {rule.fp_rate}%
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-sm ${rule.avg_mttd_minutes === 0 ? "text-slate-500" : rule.avg_mttd_minutes <= 15 ? "text-green-400" : rule.avg_mttd_minutes <= 30 ? "text-blue-400" : "text-yellow-400"}`}>
                        {rule.avg_mttd_minutes === 0 ? "—" : `${rule.avg_mttd_minutes}m`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-300">{rule.tenant_hit_count}/{rule.total_tenants}</td>
                    <td className="px-3 py-3"><TrendBadge trend={rule.trend} pct={rule.trend_pct}/></td>
                    <td className="px-3 py-3 text-xs text-slate-400">{expandedRule === rule.id ? "▲" : "▼"}</td>
                  </tr>

                  {expandedRule === rule.id && (
                    <tr key={`${rule.id}-detail`} className="bg-slate-800/30">
                      <td colSpan={11} className="px-5 py-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-slate-300 mb-2">Signal Quality</p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between"><span className="text-slate-400">True Positives</span><span className="text-green-400 font-medium">{rule.true_positives.toLocaleString()}</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">False Positives</span><span className="text-red-400 font-medium">{rule.false_positives.toLocaleString()}</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">FP Rate</span>
                                <span className={`font-bold ${rule.fp_rate >= 40 ? "text-red-400" : rule.fp_rate >= 15 ? "text-yellow-400" : "text-green-400"}`}>{rule.fp_rate}%</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-300 mb-2">Coverage</p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between"><span className="text-slate-400">Tenants firing</span><span className="text-white">{rule.tenant_hit_count}/{rule.total_tenants}</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">Avg MTTD</span><span className="text-blue-400">{rule.avg_mttd_minutes}m</span></div>
                              <div className="flex justify-between"><span className="text-slate-400">30d Trend</span><TrendBadge trend={rule.trend} pct={rule.trend_pct}/></div>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-300 mb-2">Top Tenants</p>
                            {rule.top_hit_tenants.length > 0 ? (
                              <div className="space-y-1">
                                {rule.top_hit_tenants.map(t => (
                                  <div key={t} className="text-xs text-slate-300 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"/>
                                    {t}
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-xs text-slate-500">No tenant hits</p>}
                          </div>
                        </div>

                        {/* Recommendations */}
                        {rule.status === "noisy" && (
                          <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-800/40 rounded-lg">
                            <p className="text-xs font-semibold text-yellow-300 mb-1">⚠ Noisy Rule — Recommendations:</p>
                            <ul className="text-xs text-yellow-200 space-y-0.5 list-disc list-inside">
                              <li>Raise threshold or add additional conditions to reduce FP volume</li>
                              <li>Review analyst feedback — identify common FP patterns</li>
                              <li>Consider adding entity-specific suppressions for known safe behaviour</li>
                            </ul>
                          </div>
                        )}
                        {rule.status === "dead" && (
                          <div className="mt-3 p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
                            <p className="text-xs font-semibold text-red-300 mb-1">💀 Dead Rule — No hits in 30 days:</p>
                            <ul className="text-xs text-red-200 space-y-0.5 list-disc list-inside">
                              <li>Verify the event source is still connected for all tenants</li>
                              <li>Check if the event type has been renamed or deprecated</li>
                              <li>Consider deprecating this rule if the threat vector is obsolete</li>
                            </ul>
                          </div>
                        )}

                        <div className="flex gap-2 mt-3">
                          <button className="px-3 py-1.5 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-lg transition-colors">Edit Rule</button>
                          <button className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">View Analyst Feedback</button>
                          {rule.status === "dead" && (
                            <button className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/40 rounded-lg transition-colors">Deprecate Rule</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
