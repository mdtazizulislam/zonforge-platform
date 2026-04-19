import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TenantSummary {
  id: string;
  name: string;
  domain: string;
  plan: string;
  status: "active" | "suspended" | "trial";
  risk_score: number;
  risk_level: "critical" | "high" | "medium" | "low";
  open_alerts: number;
  critical_alerts: number;
  p1_alerts: number;
  connector_health: "healthy" | "degraded" | "error";
  connector_count: number;
  user_count: number;
  last_activity: string;
  mttd_minutes: number;
  compliance_score: number;
  has_unreviewed_p1: boolean;
  tags: string[];
}

interface GlobalAlert {
  id: string;
  tenant_id: string;
  tenant_name: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  priority: "P1" | "P2" | "P3" | "P4";
  status: "open" | "investigating";
  created_at: string;
  affected_user?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockTenants: TenantSummary[] = [
  { id: "t1", name: "Acme Corporation", domain: "acme.com", plan: "Business", status: "active", risk_score: 72, risk_level: "high", open_alerts: 8, critical_alerts: 3, p1_alerts: 2, connector_health: "healthy", connector_count: 4, user_count: 47, last_activity: new Date(Date.now() - 1800000).toISOString(), mttd_minutes: 28, compliance_score: 75, has_unreviewed_p1: true, tags: ["finance", "priority-client"] },
  { id: "t2", name: "FinTech Labs", domain: "fintechlabs.io", plan: "Growth", status: "active", risk_score: 41, risk_level: "medium", open_alerts: 3, critical_alerts: 0, p1_alerts: 0, connector_health: "healthy", connector_count: 2, user_count: 23, last_activity: new Date(Date.now() - 3600000).toISOString(), mttd_minutes: 19, compliance_score: 88, has_unreviewed_p1: false, tags: ["startup"] },
  { id: "t3", name: "CloudSoft", domain: "cloudsoft.com", plan: "Enterprise", status: "active", risk_score: 89, risk_level: "critical", open_alerts: 17, critical_alerts: 5, p1_alerts: 4, connector_health: "degraded", connector_count: 6, user_count: 112, last_activity: new Date(Date.now() - 300000).toISOString(), mttd_minutes: 45, compliance_score: 61, has_unreviewed_p1: true, tags: ["enterprise", "priority-client", "cloud"] },
  { id: "t4", name: "DataDriven Co", domain: "datadriven.co", plan: "Growth", status: "trial", risk_score: 28, risk_level: "low", open_alerts: 1, critical_alerts: 0, p1_alerts: 0, connector_health: "healthy", connector_count: 1, user_count: 8, last_activity: new Date(Date.now() - 86400000).toISOString(), mttd_minutes: 12, compliance_score: 72, has_unreviewed_p1: false, tags: ["trial"] },
  { id: "t5", name: "SecureBank", domain: "securebank.com", plan: "Enterprise", status: "active", risk_score: 55, risk_level: "medium", open_alerts: 5, critical_alerts: 1, p1_alerts: 0, connector_health: "healthy", connector_count: 7, user_count: 234, last_activity: new Date(Date.now() - 600000).toISOString(), mttd_minutes: 11, compliance_score: 91, has_unreviewed_p1: false, tags: ["financial", "regulated"] },
  { id: "t6", name: "RetailCorp", domain: "retailcorp.com", plan: "Starter", status: "active", risk_score: 34, risk_level: "low", open_alerts: 2, critical_alerts: 0, p1_alerts: 0, connector_health: "error", connector_count: 2, user_count: 31, last_activity: new Date(Date.now() - 7200000).toISOString(), mttd_minutes: 67, compliance_score: 54, has_unreviewed_p1: false, tags: ["retail"] },
];

const mockGlobalAlerts: GlobalAlert[] = [
  { id: "a1", tenant_id: "t3", tenant_name: "CloudSoft", title: "Brute-Force → Account Takeover", severity: "critical", priority: "P1", status: "open", created_at: new Date(Date.now() - 1800000).toISOString(), affected_user: "john@cloudsoft.com" },
  { id: "a2", tenant_id: "t1", tenant_name: "Acme Corporation", title: "Mass File Exfiltration Detected", severity: "critical", priority: "P1", status: "investigating", created_at: new Date(Date.now() - 3600000).toISOString(), affected_user: "finance@acme.com" },
  { id: "a3", tenant_id: "t3", tenant_name: "CloudSoft", title: "Impossible Travel Login", severity: "high", priority: "P2", status: "open", created_at: new Date(Date.now() - 5400000).toISOString(), affected_user: "ceo@cloudsoft.com" },
  { id: "a4", tenant_id: "t5", tenant_name: "SecureBank", title: "Dormant Admin Account Active", severity: "critical", priority: "P2", status: "open", created_at: new Date(Date.now() - 7200000).toISOString(), affected_user: "svc-admin@securebank.com" },
  { id: "a5", tenant_id: "t1", tenant_name: "Acme Corporation", title: "New IAM Key Created Post-Compromise", severity: "high", priority: "P2", status: "open", created_at: new Date(Date.now() - 9000000).toISOString() },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const riskColor: Record<string, string> = {
  critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-400", low: "text-green-400",
};
const riskBg: Record<string, string> = {
  critical: "border-red-800/60 bg-red-950/20",
  high: "border-orange-800/50 bg-orange-950/10",
  medium: "border-slate-800",
  low: "border-slate-800",
};
const connectorDot: Record<string, string> = {
  healthy: "bg-green-500", degraded: "bg-yellow-500 animate-pulse", error: "bg-red-500 animate-pulse",
};
const planColor: Record<string, string> = {
  Enterprise: "bg-purple-900/40 text-purple-300 border-purple-800/40",
  Business: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  Growth: "bg-teal-900/40 text-teal-300 border-teal-800/40",
  Starter: "bg-slate-700 text-slate-300 border-slate-600",
};
const sevBadge: Record<string, string> = {
  critical: "bg-red-600 text-white", high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black", low: "bg-green-600 text-white",
};
const priBadge: Record<string, string> = {
  P1: "bg-red-600 text-white", P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-black", P4: "bg-slate-600 text-white",
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RiskGaugeMini({ score, level }: { score: number; level: string }) {
  const color = level === "critical" ? "#ef4444" : level === "high" ? "#f97316" : level === "medium" ? "#eab308" : "#22c55e";
  return (
    <div className="flex items-center gap-2">
      <svg width="36" height="36" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="15" fill="none" stroke="#1e293b" strokeWidth="5"/>
        <circle cx="20" cy="20" r="15" fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${(score / 100) * 94.2} 94.2`} strokeLinecap="round"
          transform="rotate(-90 20 20)"/>
      </svg>
      <div>
        <p className={`text-lg font-bold leading-none ${riskColor[level]}`}>{score}</p>
        <p className="text-xs text-slate-500 capitalize">{level}</p>
      </div>
    </div>
  );
}

// ─── Tenant Card ──────────────────────────────────────────────────────────────
function TenantCard({ tenant, view }: { tenant: TenantSummary; view: "grid" | "list" }) {
  if (view === "list") {
    return (
      <div className={`bg-slate-900 rounded-xl border ${riskBg[tenant.risk_level]} p-4 flex items-center gap-4 hover:border-slate-600 transition-all`}>
        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
          {tenant.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-white truncate">{tenant.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${planColor[tenant.plan] ?? ""}`}>{tenant.plan}</span>
            {tenant.has_unreviewed_p1 && <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full animate-pulse">P1!</span>}
          </div>
          <p className="text-xs text-slate-400">{tenant.domain} · {tenant.user_count} users</p>
        </div>
        <RiskGaugeMini score={tenant.risk_score} level={tenant.risk_level}/>
        <div className="text-center flex-shrink-0">
          <p className={`text-xl font-bold ${tenant.open_alerts > 0 ? "text-red-400" : "text-green-400"}`}>{tenant.open_alerts}</p>
          <p className="text-xs text-slate-500">alerts</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={`w-2 h-2 rounded-full ${connectorDot[tenant.connector_health]}`}/>
          <span className="text-xs text-slate-400">{tenant.connector_count} connectors</span>
        </div>
        <div className="text-center flex-shrink-0">
          <p className="text-sm font-medium text-blue-400">{tenant.compliance_score}%</p>
          <p className="text-xs text-slate-500">compliance</p>
        </div>
        <p className="text-xs text-slate-500 flex-shrink-0 w-16 text-right">{timeAgo(tenant.last_activity)}</p>
      </div>
    );
  }

  return (
    <div className={`bg-slate-900 rounded-xl border ${riskBg[tenant.risk_level]} p-5 hover:border-slate-600 transition-all relative`}>
      {tenant.has_unreviewed_p1 && (
        <div className="absolute top-3 right-3 w-3 h-3 bg-red-600 rounded-full animate-pulse" title="Unreviewed P1 alert"/>
      )}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
          {tenant.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{tenant.name}</p>
          <p className="text-xs text-slate-400">{tenant.domain}</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded border ${planColor[tenant.plan] ?? ""}`}>{tenant.plan}</span>
            {tenant.tags.slice(0, 2).map(t => <span key={t} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">#{t}</span>)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <RiskGaugeMini score={tenant.risk_score} level={tenant.risk_level}/>
        <div className="text-right">
          <div className="flex items-center gap-1.5 justify-end mb-1">
            <div className={`w-2 h-2 rounded-full ${connectorDot[tenant.connector_health]}`}/>
            <span className="text-xs text-slate-400">{tenant.connector_count} connectors</span>
          </div>
          <p className="text-xs text-slate-500">{tenant.user_count} users</p>
        </div>
      </div>

      {/* Alert stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-slate-800 rounded-lg p-2 text-center">
          <p className={`text-lg font-bold ${tenant.open_alerts > 0 ? "text-orange-400" : "text-green-400"}`}>{tenant.open_alerts}</p>
          <p className="text-xs text-slate-500">Open</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 text-center">
          <p className={`text-lg font-bold ${tenant.p1_alerts > 0 ? "text-red-400" : "text-slate-400"}`}>{tenant.p1_alerts}</p>
          <p className="text-xs text-slate-500">P1</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-blue-400">{tenant.compliance_score}%</p>
          <p className="text-xs text-slate-500">Compliant</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>MTTD: <span className={tenant.mttd_minutes <= 20 ? "text-green-400" : "text-yellow-400"}>{tenant.mttd_minutes}m</span></span>
        <span>Last: {timeAgo(tenant.last_activity)}</span>
      </div>

      {tenant.connector_health !== "healthy" && (
        <div className={`mt-3 p-2 rounded-lg text-xs text-center ${tenant.connector_health === "error" ? "bg-red-900/30 text-red-400" : "bg-yellow-900/30 text-yellow-400"}`}>
          {tenant.connector_health === "error" ? "⚠ Connector Error" : "⚠ Connector Degraded"}
        </div>
      )}
    </div>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────
function BulkDeployBar({ selected, onDeploy, onClose }: {
  selected: string[];
  onDeploy: (ruleId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-xl px-5 py-3 flex items-center gap-4 shadow-2xl">
      <p className="text-sm text-white font-medium">{selected.length} tenants selected</p>
      <div className="flex gap-2">
        <button onClick={() => onDeploy("bulk-rule")}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors">
          🚀 Deploy Rule
        </button>
        <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
          📢 Send Notification
        </button>
        <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
          📊 Export Report
        </button>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-white ml-2">✕</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MSSPConsole() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [tab, setTab] = useState<"tenants" | "alerts">("tenants");
  const [riskFilter, setRiskFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [sortBy, setSortBy] = useState<"risk" | "alerts" | "name">("risk");

  const { data: tenants = mockTenants } = useQuery<TenantSummary[]>({
    queryKey: ["mssp-tenants"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/mssp/tenants"); return r.data.data; },
    refetchInterval: autoRefresh ? 30000 : false,
    onSuccess: () => setLastRefresh(new Date()),
  } as any);

  const { data: globalAlerts = mockGlobalAlerts } = useQuery<GlobalAlert[]>({
    queryKey: ["mssp-alerts"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/mssp/alerts"); return r.data.data; },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const toggleSelect = (id: string) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const filteredTenants = [...tenants]
    .filter(t => !riskFilter || t.risk_level === riskFilter)
    .filter(t => !planFilter || t.plan === planFilter)
    .filter(t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.domain.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some(tag => tag.includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (sortBy === "risk") return riskOrder[a.risk_level] - riskOrder[b.risk_level];
      if (sortBy === "alerts") return b.open_alerts - a.open_alerts;
      return a.name.localeCompare(b.name);
    });

  const platformStats = {
    total: tenants.length,
    critical: tenants.filter(t => t.risk_level === "critical").length,
    with_p1: tenants.filter(t => t.p1_alerts > 0).length,
    connector_issues: tenants.filter(t => t.connector_health !== "healthy").length,
    total_open: tenants.reduce((s, t) => s + t.open_alerts, 0),
    total_p1: globalAlerts.filter(a => a.priority === "P1").length,
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">MSSP Multi-Tenant Console</h1>
          <p className="text-slate-400 text-sm mt-1">
            Unified view across all {platformStats.total} managed tenants
            <span className="text-slate-500"> · Auto-refresh: </span>
            <button onClick={() => setAutoRefresh(p => !p)} className={`text-xs ${autoRefresh ? "text-green-400" : "text-slate-500"} hover:text-white transition-colors`}>
              {autoRefresh ? `ON · ${lastRefresh.toLocaleTimeString()}` : "OFF"}
            </button>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView("grid")} className={`p-2 rounded-lg transition-colors ${view === "grid" ? "bg-red-700 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
          </button>
          <button onClick={() => setView("list")} className={`p-2 rounded-lg transition-colors ${view === "list" ? "bg-red-700 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
          </button>
        </div>
      </div>

      {/* Platform KPIs */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Tenants", value: platformStats.total, color: "text-white", border: "border-slate-800" },
          { label: "Critical Risk", value: platformStats.critical, color: "text-red-400", border: platformStats.critical > 0 ? "border-red-900/50" : "border-slate-800" },
          { label: "With P1 Alert", value: platformStats.with_p1, color: "text-red-400", border: platformStats.with_p1 > 0 ? "border-red-900/50" : "border-slate-800" },
          { label: "Connector Issues", value: platformStats.connector_issues, color: platformStats.connector_issues > 0 ? "text-yellow-400" : "text-green-400", border: platformStats.connector_issues > 0 ? "border-yellow-900/40" : "border-slate-800" },
          { label: "Total Open Alerts", value: platformStats.total_open, color: "text-orange-400", border: "border-slate-800" },
          { label: "Active P1s", value: platformStats.total_p1, color: platformStats.total_p1 > 0 ? "text-red-400" : "text-green-400", border: platformStats.total_p1 > 0 ? "border-red-900/50" : "border-slate-800" },
        ].map((c, i) => (
          <div key={i} className={`bg-slate-900 rounded-xl p-4 border ${c.border}`}>
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        <button onClick={() => setTab("tenants")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "tenants" ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
          🏢 All Tenants ({filteredTenants.length})
        </button>
        <button onClick={() => setTab("alerts")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "alerts" ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
          🚨 Global Alert Feed ({globalAlerts.filter(a => a.priority === "P1" || a.priority === "P2").length})
        </button>
      </div>

      {/* TENANTS TAB */}
      {tab === "tenants" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tenants, domains, tags..."
              className="flex-1 min-w-[180px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-700"/>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              <option value="">All Risk</option>
              {["critical","high","medium","low"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              <option value="">All Plans</option>
              {["Enterprise","Business","Growth","Starter"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              <option value="risk">Sort: Risk</option>
              <option value="alerts">Sort: Alerts</option>
              <option value="name">Sort: Name</option>
            </select>
            {selected.length > 0 && (
              <button onClick={() => setSelected([])} className="px-3 py-2 text-xs text-slate-400 hover:text-white">
                Clear ({selected.length})
              </button>
            )}
          </div>

          {/* Select All */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox"
              checked={selected.length === filteredTenants.length && filteredTenants.length > 0}
              onChange={() => setSelected(selected.length === filteredTenants.length ? [] : filteredTenants.map(t => t.id))}
              className="rounded border-slate-600 bg-slate-800 text-red-600"/>
            <span>Select all visible for bulk actions</span>
          </div>

          {/* Grid / List */}
          <div className={view === "grid"
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            : "space-y-2"}>
            {filteredTenants.map(tenant => (
              <div key={tenant.id} className="relative group">
                {/* Selection checkbox */}
                <div className="absolute top-3 left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <input type="checkbox" checked={selected.includes(tenant.id)} onChange={() => toggleSelect(tenant.id)}
                    className="rounded border-slate-600 bg-slate-800 text-red-600"/>
                </div>
                <div className={selected.includes(tenant.id) ? "ring-2 ring-red-700 rounded-xl" : ""}>
                  <TenantCard tenant={tenant} view={view}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GLOBAL ALERT FEED TAB */}
      {tab === "alerts" && (
        <div className="space-y-3">
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Cross-Tenant P1 & P2 Alerts</p>
              <p className="text-xs text-slate-400">Auto-refreshing</p>
            </div>
            <div className="divide-y divide-slate-800">
              {globalAlerts.map(alert => (
                <div key={alert.id} className="px-4 py-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${priBadge[alert.priority]}`}>{alert.priority}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sevBadge[alert.severity]}`}>{alert.severity}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-blue-400">{alert.tenant_name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${alert.status === "open" ? "bg-red-900/40 text-red-400" : "bg-blue-900/40 text-blue-400"}`}>{alert.status}</span>
                      </div>
                      <p className="text-sm font-medium text-white">{alert.title}</p>
                      {alert.affected_user && (
                        <p className="text-xs text-slate-400 mt-0.5">Affected: {alert.affected_user}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="text-xs text-slate-500">{timeAgo(alert.created_at)}</p>
                      <button className="px-2.5 py-1 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-lg transition-colors">
                        Open →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selected.length > 0 && (
        <BulkDeployBar
          selected={selected}
          onDeploy={() => {}}
          onClose={() => setSelected([])}
        />
      )}
    </div>
  );
}
