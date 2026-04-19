import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface HealthDimension {
  name: string;
  score: number;
  weight: number;
  status: "excellent" | "good" | "warning" | "critical";
  detail: string;
  recommendation?: string;
}

interface TenantHealth {
  id: string;
  name: string;
  domain: string;
  plan: string;
  health_score: number;
  health_trend: "improving" | "stable" | "declining";
  trend_delta: number;
  churn_risk: "low" | "medium" | "high" | "critical";
  churn_probability: number;
  dimensions: HealthDimension[];
  last_login_days: number;
  alerts_acknowledged_rate: number;
  connectors_active: number;
  connectors_total: number;
  features_used: number;
  features_total: number;
  nps_score?: number;
  contract_renewal_days: number;
  mrr: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockTenants: TenantHealth[] = [
  {
    id: "t1", name: "Acme Corporation", domain: "acme.com", plan: "Business",
    health_score: 82, health_trend: "improving", trend_delta: 7,
    churn_risk: "low", churn_probability: 8,
    mrr: 3999, contract_renewal_days: 335, nps_score: 72,
    last_login_days: 0, alerts_acknowledged_rate: 91,
    connectors_active: 4, connectors_total: 4,
    features_used: 9, features_total: 12,
    dimensions: [
      { name: "Engagement", score: 88, weight: 25, status: "excellent", detail: "Daily active users, alerts reviewed within 24h" },
      { name: "Connector Health", score: 100, weight: 20, status: "excellent", detail: "All 4 connectors healthy, 0 errors in 30d" },
      { name: "Feature Adoption", score: 75, weight: 20, status: "good", detail: "9/12 features used — missing: Threat Hunting, Compliance Export, Playbooks" },
      { name: "Alert Response", score: 91, weight: 20, status: "excellent", detail: "91% of alerts acknowledged within SLA" },
      { name: "Security Posture", score: 68, weight: 15, status: "warning", detail: "MFA not enforced, 2 critical CVEs unpatched", recommendation: "Enforce MFA and patch CVE-2024-0001" },
    ],
  },
  {
    id: "t2", name: "FinTech Labs", domain: "fintechlabs.io", plan: "Growth",
    health_score: 91, health_trend: "stable", trend_delta: 1,
    churn_risk: "low", churn_probability: 4,
    mrr: 1499, contract_renewal_days: 287, nps_score: 88,
    last_login_days: 0, alerts_acknowledged_rate: 97,
    connectors_active: 2, connectors_total: 2,
    features_used: 8, features_total: 10,
    dimensions: [
      { name: "Engagement", score: 95, weight: 25, status: "excellent", detail: "Team logs in daily, weekly security reviews" },
      { name: "Connector Health", score: 100, weight: 20, status: "excellent", detail: "All connectors healthy" },
      { name: "Feature Adoption", score: 80, weight: 20, status: "good", detail: "8/10 features used" },
      { name: "Alert Response", score: 97, weight: 20, status: "excellent", detail: "97% acknowledgement rate — top 5% platform-wide" },
      { name: "Security Posture", score: 84, weight: 15, status: "good", detail: "MFA enforced, compliance score 88%" },
    ],
  },
  {
    id: "t3", name: "CloudSoft", domain: "cloudsoft.com", plan: "Enterprise",
    health_score: 54, health_trend: "declining", trend_delta: -12,
    churn_risk: "high", churn_probability: 41,
    mrr: 12000, contract_renewal_days: 67, nps_score: 31,
    last_login_days: 3, alerts_acknowledged_rate: 44,
    connectors_active: 4, connectors_total: 6,
    features_used: 5, features_total: 15,
    dimensions: [
      { name: "Engagement", score: 42, weight: 25, status: "critical", detail: "Primary admin not logged in for 3 days, 44% alert response rate", recommendation: "Schedule QBR call — investigate adoption blockers" },
      { name: "Connector Health", score: 67, weight: 20, status: "warning", detail: "2 of 6 connectors degraded — Google Workspace, WAF", recommendation: "Assist with reconnection — offer support session" },
      { name: "Feature Adoption", score: 33, weight: 20, status: "critical", detail: "Only 5/15 enterprise features used — low ROI", recommendation: "Propose feature onboarding workshop" },
      { name: "Alert Response", score: 44, weight: 20, status: "critical", detail: "56% of alerts not reviewed — P1 alerts aging >48h" },
      { name: "Security Posture", score: 61, weight: 15, status: "warning", detail: "Compliance score 61%, 5 critical CVEs" },
    ],
  },
  {
    id: "t4", name: "DataDriven Co", domain: "datadriven.co", plan: "Growth",
    health_score: 63, health_trend: "improving", trend_delta: 14,
    churn_risk: "medium", churn_probability: 22,
    mrr: 1499, contract_renewal_days: 12, nps_score: 55,
    last_login_days: 1, alerts_acknowledged_rate: 72,
    connectors_active: 1, connectors_total: 1,
    features_used: 4, features_total: 10,
    dimensions: [
      { name: "Engagement", score: 71, weight: 25, status: "good", detail: "Improving — active 1 day ago, alert reviews up 40% this month" },
      { name: "Connector Health", score: 100, weight: 20, status: "excellent", detail: "1 connector healthy" },
      { name: "Feature Adoption", score: 40, weight: 20, status: "warning", detail: "4/10 features — opportunity to expand usage", recommendation: "Add 2nd connector + enable compliance module" },
      { name: "Alert Response", score: 72, weight: 20, status: "good", detail: "Improving trend — up from 54% last month" },
      { name: "Security Posture", score: 72, weight: 15, status: "good", detail: "MFA enabled, compliance at 72%" },
    ],
  },
  {
    id: "t5", name: "SecureBank", domain: "securebank.com", plan: "Enterprise",
    health_score: 94, health_trend: "stable", trend_delta: 2,
    churn_risk: "low", churn_probability: 2,
    mrr: 12000, contract_renewal_days: 198, nps_score: 91,
    last_login_days: 0, alerts_acknowledged_rate: 99,
    connectors_active: 7, connectors_total: 7,
    features_used: 14, features_total: 15,
    dimensions: [
      { name: "Engagement", score: 98, weight: 25, status: "excellent", detail: "Multiple daily logins, dedicated security team" },
      { name: "Connector Health", score: 100, weight: 20, status: "excellent", detail: "All 7 connectors healthy, zero errors" },
      { name: "Feature Adoption", score: 93, weight: 20, status: "excellent", detail: "14/15 features — power user" },
      { name: "Alert Response", score: 99, weight: 20, status: "excellent", detail: "99% acknowledgement rate — #1 on platform" },
      { name: "Security Posture", score: 91, weight: 15, status: "excellent", detail: "SOC 2 certified, compliance score 91%" },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const healthColor = (score: number) =>
  score >= 80 ? "text-green-400" : score >= 65 ? "text-yellow-400" : score >= 45 ? "text-orange-400" : "text-red-400";

const healthBg = (score: number) =>
  score >= 80 ? "bg-green-500" : score >= 65 ? "bg-yellow-500" : score >= 45 ? "bg-orange-500" : "bg-red-500";

const dimColor: Record<string, string> = {
  excellent: "text-green-400 bg-green-500/10 border-green-500/30",
  good: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  warning: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
};

const churnBadge: Record<string, string> = {
  low: "text-green-400 bg-green-500/10 border-green-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
};

const trendIcon: Record<string, string> = {
  improving: "↑", stable: "→", declining: "↓",
};
const trendColor: Record<string, string> = {
  improving: "text-green-400", stable: "text-slate-400", declining: "text-red-400",
};

const planColor: Record<string, string> = {
  Enterprise: "bg-purple-900/40 text-purple-300 border-purple-800/40",
  Business: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  Growth: "bg-teal-900/40 text-teal-300 border-teal-800/40",
  Starter: "bg-slate-700 text-slate-300 border-slate-600",
};

// ─── Health Gauge ─────────────────────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 65 ? "#eab308" : score >= 45 ? "#f97316" : "#ef4444";
  const dash = (score / 100) * 188;
  return (
    <svg width="72" height="72" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="30" fill="none" stroke="#1e293b" strokeWidth="10"/>
      <circle cx="40" cy="40" r="30" fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} 188`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
      <text x="40" y="37" textAnchor="middle" fill={color} fontSize="16" fontWeight="bold">{score}</text>
      <text x="40" y="51" textAnchor="middle" fill="#64748b" fontSize="8">/ 100</text>
    </svg>
  );
}

// ─── Tenant Detail Panel ──────────────────────────────────────────────────────
function TenantDetailPanel({ tenant, onClose }: { tenant: TenantHealth; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-700 overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 p-5 border-b border-slate-800 flex items-center justify-between z-10">
          <div>
            <h2 className="text-sm font-bold text-white">{tenant.name}</h2>
            <p className="text-xs text-slate-400">{tenant.domain} · {tenant.plan}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Health + Churn */}
          <div className="flex items-center gap-4 bg-slate-800 rounded-xl p-4">
            <HealthGauge score={tenant.health_score}/>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${trendColor[tenant.health_trend]}`}>
                  {trendIcon[tenant.health_trend]} {tenant.health_trend}
                </span>
                <span className={`text-xs ${tenant.trend_delta > 0 ? "text-green-400" : tenant.trend_delta < 0 ? "text-red-400" : "text-slate-400"}`}>
                  {tenant.trend_delta > 0 ? `+${tenant.trend_delta}` : tenant.trend_delta} pts (30d)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${churnBadge[tenant.churn_risk]}`}>
                  {tenant.churn_risk} churn risk
                </span>
                <span className="text-xs text-slate-400">{tenant.churn_probability}% probability</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                MRR: <span className="text-white font-medium">${tenant.mrr.toLocaleString()}</span>
                {tenant.contract_renewal_days <= 90 && (
                  <span className="ml-2 text-orange-400">· Renewal in {tenant.contract_renewal_days}d</span>
                )}
              </div>
            </div>
            {tenant.nps_score !== undefined && (
              <div className="text-center flex-shrink-0">
                <p className={`text-2xl font-bold ${tenant.nps_score >= 70 ? "text-green-400" : tenant.nps_score >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                  {tenant.nps_score}
                </p>
                <p className="text-xs text-slate-400">NPS</p>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Last Login", value: tenant.last_login_days === 0 ? "Today" : `${tenant.last_login_days}d ago`, color: tenant.last_login_days > 7 ? "text-red-400" : "text-white" },
              { label: "Alert ACK Rate", value: `${tenant.alerts_acknowledged_rate}%`, color: tenant.alerts_acknowledged_rate >= 80 ? "text-green-400" : "text-yellow-400" },
              { label: "Connectors", value: `${tenant.connectors_active}/${tenant.connectors_total}`, color: tenant.connectors_active === tenant.connectors_total ? "text-green-400" : "text-yellow-400" },
              { label: "Features Used", value: `${tenant.features_used}/${tenant.features_total}`, color: (tenant.features_used / tenant.features_total) >= 0.7 ? "text-green-400" : "text-yellow-400" },
              { label: "Renewal", value: `${tenant.contract_renewal_days}d`, color: tenant.contract_renewal_days <= 30 ? "text-red-400" : tenant.contract_renewal_days <= 90 ? "text-orange-400" : "text-green-400" },
              { label: "MRR", value: `$${tenant.mrr.toLocaleString()}`, color: "text-blue-400" },
            ].map((s, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Dimension Breakdown */}
          <div>
            <p className="text-xs font-semibold text-white mb-3">Health Dimensions</p>
            <div className="space-y-3">
              {tenant.dimensions.map((dim, i) => (
                <div key={i} className="bg-slate-800 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{dim.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${dimColor[dim.status]}`}>{dim.status}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-lg font-bold ${healthColor(dim.score)}`}>{dim.score}</span>
                      <span className="text-xs text-slate-400">/{dim.weight}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 mb-2">
                    <div className={`h-1.5 rounded-full ${healthBg(dim.score)}`} style={{ width: `${dim.score}%` }}/>
                  </div>
                  <p className="text-xs text-slate-400">{dim.detail}</p>
                  {dim.recommendation && (
                    <div className="mt-2 flex items-start gap-1.5">
                      <span className="text-xs text-blue-400 flex-shrink-0">💡</span>
                      <p className="text-xs text-blue-300">{dim.recommendation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "📅 Schedule QBR", color: "bg-blue-600 hover:bg-blue-700 text-white" },
                { label: "📧 Send Health Report", color: "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700" },
                { label: "🎯 Feature Workshop", color: "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700" },
                { label: "👁 Impersonate", color: "bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 border border-orange-700/40" },
              ].map((a, i) => (
                <button key={i} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${a.color}`}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TenantHealthScoring() {
  const [selectedTenant, setSelectedTenant] = useState<TenantHealth | null>(null);
  const [churnFilter, setChurnFilter] = useState("");
  const [sortBy, setSortBy] = useState<"health" | "churn" | "mrr" | "renewal">("churn");
  const [search, setSearch] = useState("");

  const { data: tenants = mockTenants } = useQuery<TenantHealth[]>({
    queryKey: ["tenant-health"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/tenants/health"); return r.data.data; },
  });

  const filtered = [...tenants]
    .filter(t => !churnFilter || t.churn_risk === churnFilter)
    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "health") return a.health_score - b.health_score;
      if (sortBy === "churn") return b.churn_probability - a.churn_probability;
      if (sortBy === "mrr") return b.mrr - a.mrr;
      return a.contract_renewal_days - b.contract_renewal_days;
    });

  const stats = {
    avg_health: Math.round(tenants.reduce((s, t) => s + t.health_score, 0) / tenants.length),
    critical_churn: tenants.filter(t => t.churn_risk === "high" || t.churn_risk === "critical").length,
    renewing_soon: tenants.filter(t => t.contract_renewal_days <= 90).length,
    at_risk_mrr: tenants.filter(t => t.churn_risk === "high" || t.churn_risk === "critical").reduce((s, t) => s + t.mrr, 0),
    declining: tenants.filter(t => t.health_trend === "declining").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Tenant Health Scoring</h1>
        <p className="text-slate-400 text-sm mt-1">Product-led churn intelligence and engagement tracking</p>
      </div>

      {/* Platform Health KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Avg Health Score", value: stats.avg_health, color: healthColor(stats.avg_health), sub: "across all tenants" },
          { label: "High Churn Risk", value: stats.critical_churn, color: stats.critical_churn > 0 ? "text-red-400" : "text-green-400", sub: "tenants at risk" },
          { label: "Renewing ≤90d", value: stats.renewing_soon, color: stats.renewing_soon > 0 ? "text-orange-400" : "text-green-400", sub: "upcoming renewals" },
          { label: "At-Risk MRR", value: `$${(stats.at_risk_mrr / 1000).toFixed(0)}K`, color: "text-red-400", sub: "revenue at risk" },
          { label: "Declining", value: stats.declining, color: stats.declining > 0 ? "text-yellow-400" : "text-green-400", sub: "health declining" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenants..."
          className="flex-1 min-w-[180px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-700"/>
        <select value={churnFilter} onChange={e => setChurnFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
          <option value="">All Churn Risk</option>
          {["critical","high","medium","low"].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
          <option value="churn">Sort: Churn Risk</option>
          <option value="health">Sort: Health (worst first)</option>
          <option value="mrr">Sort: MRR (highest)</option>
          <option value="renewal">Sort: Renewal (soonest)</option>
        </select>
      </div>

      {/* Tenant Health Cards */}
      <div className="space-y-3">
        {filtered.map(tenant => (
          <div key={tenant.id}
            onClick={() => setSelectedTenant(tenant)}
            className={`bg-slate-900 rounded-xl border p-5 cursor-pointer hover:border-slate-600 transition-all ${
              tenant.churn_risk === "high" || tenant.churn_risk === "critical" ? "border-red-800/50" :
              tenant.health_trend === "declining" ? "border-orange-800/40" : "border-slate-800"
            }`}>
            <div className="flex items-center gap-5">
              {/* Health Gauge */}
              <HealthGauge score={tenant.health_score}/>

              {/* Main Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-bold text-white">{tenant.name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${planColor[tenant.plan] ?? ""}`}>{tenant.plan}</span>
                  <span className={`text-sm font-medium ${trendColor[tenant.health_trend]}`}>
                    {trendIcon[tenant.health_trend]} {tenant.health_trend}
                    {tenant.trend_delta !== 0 && (
                      <span className="text-xs ml-1">({tenant.trend_delta > 0 ? "+" : ""}{tenant.trend_delta}pts)</span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-2">{tenant.domain}</p>

                {/* Dimension mini bars */}
                <div className="flex gap-2 flex-wrap">
                  {tenant.dimensions.map((dim, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-xs text-slate-500 w-16 truncate">{dim.name.split(" ")[0]}</span>
                      <div className="w-12 bg-slate-700 rounded-full h-1">
                        <div className={`h-1 rounded-full ${healthBg(dim.score)}`} style={{ width: `${dim.score}%` }}/>
                      </div>
                      <span className={`text-xs font-medium ${healthColor(dim.score)}`}>{dim.score}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right stats */}
              <div className="flex flex-col gap-2 items-end flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${churnBadge[tenant.churn_risk]}`}>
                  {tenant.churn_probability}% churn risk
                </span>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-400">${tenant.mrr.toLocaleString()}<span className="text-xs text-slate-400">/mo</span></p>
                  {tenant.contract_renewal_days <= 90 && (
                    <p className="text-xs text-orange-400">⚠ Renewal in {tenant.contract_renewal_days}d</p>
                  )}
                </div>
                {tenant.nps_score !== undefined && (
                  <p className="text-xs text-slate-400">NPS: <span className={tenant.nps_score >= 70 ? "text-green-400" : tenant.nps_score >= 40 ? "text-yellow-400" : "text-red-400"}>{tenant.nps_score}</span></p>
                )}
              </div>
            </div>

            {/* Recommendations for at-risk */}
            {(tenant.churn_risk === "high" || tenant.churn_risk === "critical") && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
                <p className="text-xs font-semibold text-red-300 mb-1">🚨 Action Required:</p>
                <div className="flex flex-wrap gap-2">
                  {tenant.dimensions.filter(d => d.recommendation).map((d, i) => (
                    <span key={i} className="text-xs text-red-200">• {d.recommendation}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedTenant && (
        <TenantDetailPanel tenant={selectedTenant} onClose={() => setSelectedTenant(null)}/>
      )}
    </div>
  );
}
