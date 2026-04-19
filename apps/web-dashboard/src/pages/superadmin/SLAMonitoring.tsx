import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TenantSLA {
  id: string;
  name: string;
  plan: string;
  sla_tier: "enterprise" | "business" | "growth" | "starter";
  uptime_sla_pct: number;
  mttd_sla_minutes: number;
  alert_delivery_sla_seconds: number;
  actual_uptime_30d: number;
  actual_mttd_30d: number;
  actual_alert_delivery_p99: number;
  uptime_breaches_30d: number;
  mttd_breaches_30d: number;
  delivery_breaches_30d: number;
  sla_health: "healthy" | "warning" | "breached";
  credits_owed?: number;
  incidents_30d: number;
  last_incident?: string;
}

interface PlatformSLAStats {
  overall_uptime_30d: number;
  avg_mttd_30d: number;
  alert_delivery_p99: number;
  tenants_breaching: number;
  total_credits_owed: number;
  incidents_30d: number;
  uptime_trend: { date: string; uptime: number }[];
  mttd_trend: { date: string; mttd: number }[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockPlatformStats: PlatformSLAStats = {
  overall_uptime_30d: 99.87,
  avg_mttd_30d: 23,
  alert_delivery_p99: 4.2,
  tenants_breaching: 2,
  total_credits_owed: 1840,
  incidents_30d: 3,
  uptime_trend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en", { month: "short", day: "numeric" }),
    uptime: 99.5 + Math.random() * 0.5,
  })),
  mttd_trend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en", { month: "short", day: "numeric" }),
    mttd: 15 + Math.floor(Math.random() * 20),
  })),
};

const mockTenants: TenantSLA[] = [
  {
    id: "t1", name: "Acme Corporation", plan: "Business", sla_tier: "business",
    uptime_sla_pct: 99.9, mttd_sla_minutes: 30, alert_delivery_sla_seconds: 10,
    actual_uptime_30d: 99.94, actual_mttd_30d: 22, actual_alert_delivery_p99: 3.8,
    uptime_breaches_30d: 0, mttd_breaches_30d: 1, delivery_breaches_30d: 0,
    sla_health: "warning", incidents_30d: 1,
    last_incident: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "t2", name: "FinTech Labs", plan: "Growth", sla_tier: "growth",
    uptime_sla_pct: 99.5, mttd_sla_minutes: 60, alert_delivery_sla_seconds: 30,
    actual_uptime_30d: 99.98, actual_mttd_30d: 14, actual_alert_delivery_p99: 2.1,
    uptime_breaches_30d: 0, mttd_breaches_30d: 0, delivery_breaches_30d: 0,
    sla_health: "healthy", incidents_30d: 0,
  },
  {
    id: "t3", name: "CloudSoft", plan: "Enterprise", sla_tier: "enterprise",
    uptime_sla_pct: 99.99, mttd_sla_minutes: 15, alert_delivery_sla_seconds: 5,
    actual_uptime_30d: 99.71, actual_mttd_30d: 47, actual_alert_delivery_p99: 8.4,
    uptime_breaches_30d: 3, mttd_breaches_30d: 8, delivery_breaches_30d: 5,
    sla_health: "breached", credits_owed: 1440,
    incidents_30d: 3, last_incident: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "t4", name: "DataDriven Co", plan: "Growth", sla_tier: "growth",
    uptime_sla_pct: 99.5, mttd_sla_minutes: 60, alert_delivery_sla_seconds: 30,
    actual_uptime_30d: 100, actual_mttd_30d: 18, actual_alert_delivery_p99: 3.2,
    uptime_breaches_30d: 0, mttd_breaches_30d: 0, delivery_breaches_30d: 0,
    sla_health: "healthy", incidents_30d: 0,
  },
  {
    id: "t5", name: "SecureBank", plan: "Enterprise", sla_tier: "enterprise",
    uptime_sla_pct: 99.99, mttd_sla_minutes: 15, alert_delivery_sla_seconds: 5,
    actual_uptime_30d: 99.99, actual_mttd_30d: 11, actual_alert_delivery_p99: 2.8,
    uptime_breaches_30d: 0, mttd_breaches_30d: 0, delivery_breaches_30d: 0,
    sla_health: "healthy", incidents_30d: 1,
    last_incident: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
  {
    id: "t6", name: "RetailCorp", plan: "Starter", sla_tier: "starter",
    uptime_sla_pct: 99.0, mttd_sla_minutes: 120, alert_delivery_sla_seconds: 60,
    actual_uptime_30d: 98.84, actual_mttd_30d: 88, actual_alert_delivery_p99: 12.4,
    uptime_breaches_30d: 2, mttd_breaches_30d: 3, delivery_breaches_30d: 1,
    sla_health: "breached", credits_owed: 400,
    incidents_30d: 2, last_incident: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

const SLA_TIERS = {
  enterprise: { uptime: "99.99%", mttd: "15 min", delivery: "5s", color: "bg-purple-900/40 text-purple-300 border-purple-800/40" },
  business: { uptime: "99.9%", mttd: "30 min", delivery: "10s", color: "bg-blue-900/40 text-blue-300 border-blue-800/40" },
  growth: { uptime: "99.5%", mttd: "60 min", delivery: "30s", color: "bg-teal-900/40 text-teal-300 border-teal-800/40" },
  starter: { uptime: "99.0%", mttd: "2 hours", delivery: "60s", color: "bg-slate-700 text-slate-300 border-slate-600" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const healthStyle: Record<string, string> = {
  healthy: "text-green-400 bg-green-500/10 border-green-500/30",
  warning: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  breached: "text-red-400 bg-red-500/10 border-red-500/30",
};
const healthIcon: Record<string, string> = { healthy: "✅", warning: "⚠️", breached: "🚨" };

function uptimeColor(actual: number, sla: number): string {
  const gap = actual - sla;
  if (gap >= 0) return "text-green-400";
  if (gap >= -0.1) return "text-yellow-400";
  return "text-red-400";
}

function mttdColor(actual: number, sla: number): string {
  if (actual <= sla * 0.7) return "text-green-400";
  if (actual <= sla) return "text-yellow-400";
  return "text-red-400";
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.001;
  const w = 160;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={height}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── SLA Gauge ────────────────────────────────────────────────────────────────
function SLAGauge({ actual, target, unit }: { actual: number; target: number; unit: string }) {
  const pct = Math.min((actual / target) * 100, 100);
  const isOk = actual >= target;
  const color = isOk ? "#22c55e" : actual >= target * 0.999 ? "#eab308" : "#ef4444";
  const dash = (pct / 100) * 113;
  return (
    <div className="flex flex-col items-center">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="18" fill="none" stroke="#1e293b" strokeWidth="6"/>
        <circle cx="24" cy="24" r="18" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} 113`} strokeLinecap="round" transform="rotate(-90 24 24)"/>
      </svg>
      <p className={`text-xs font-bold -mt-1 ${isOk ? "text-green-400" : "text-red-400"}`}>{actual}{unit}</p>
    </div>
  );
}

// ─── Incident History Modal ───────────────────────────────────────────────────
function IncidentPanel({ tenant, onClose }: { tenant: TenantSLA; onClose: () => void }) {
  const mockIncidents = [
    { id: 1, type: "Uptime", started: new Date(Date.now() - 5 * 86400000).toISOString(), duration_min: 8, impact: "Ingestion API unavailable", resolved: true, credits: 400 },
    { id: 2, type: "MTTD", started: new Date(Date.now() - 12 * 86400000).toISOString(), duration_min: null, impact: "Alert delivery delayed >SLA threshold", resolved: true, credits: 0 },
    { id: 3, type: "Delivery", started: new Date(Date.now() - 18 * 86400000).toISOString(), duration_min: null, impact: "Webhook delivery latency spike", resolved: true, credits: 0 },
  ].slice(0, tenant.incidents_30d);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-700 overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">SLA Incidents — {tenant.name}</h2>
            <p className="text-xs text-slate-400">Last 30 days</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* SLA Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Uptime", actual: `${tenant.actual_uptime_30d}%`, sla: `${tenant.uptime_sla_pct}%`, ok: tenant.actual_uptime_30d >= tenant.uptime_sla_pct },
              { label: "MTTD", actual: `${tenant.actual_mttd_30d}m`, sla: `${tenant.mttd_sla_minutes}m`, ok: tenant.actual_mttd_30d <= tenant.mttd_sla_minutes },
              { label: "Delivery P99", actual: `${tenant.actual_alert_delivery_p99}s`, sla: `${tenant.alert_delivery_sla_seconds}s`, ok: tenant.actual_alert_delivery_p99 <= tenant.alert_delivery_sla_seconds },
            ].map((s, i) => (
              <div key={i} className={`bg-slate-800 rounded-lg p-3 text-center border ${s.ok ? "border-green-900/40" : "border-red-900/40"}`}>
                <p className={`text-lg font-bold ${s.ok ? "text-green-400" : "text-red-400"}`}>{s.actual}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-xs text-slate-500">SLA: {s.sla}</p>
              </div>
            ))}
          </div>

          {tenant.credits_owed && tenant.credits_owed > 0 && (
            <div className="bg-orange-900/20 border border-orange-800/40 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-orange-300">Credits Owed</p>
                <p className="text-xs text-orange-200">Service credit for SLA breaches</p>
              </div>
              <p className="text-2xl font-bold text-orange-300">${tenant.credits_owed.toLocaleString()}</p>
            </div>
          )}

          {/* Incidents */}
          <div>
            <p className="text-xs font-semibold text-white mb-3">{mockIncidents.length} Incidents</p>
            <div className="space-y-3">
              {mockIncidents.length === 0 ? (
                <p className="text-sm text-green-400 text-center py-4">✅ No SLA incidents this period</p>
              ) : mockIncidents.map(inc => (
                <div key={inc.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        inc.type === "Uptime" ? "text-red-400 bg-red-500/10 border-red-500/30" :
                        inc.type === "MTTD" ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" :
                        "text-orange-400 bg-orange-500/10 border-orange-500/30"
                      }`}>{inc.type} Breach</span>
                      {inc.credits > 0 && <span className="text-xs text-orange-300">-${inc.credits} credit</span>}
                    </div>
                    <span className="text-xs text-slate-500">{timeAgo(inc.started)}</span>
                  </div>
                  <p className="text-sm text-white">{inc.impact}</p>
                  {inc.duration_min && <p className="text-xs text-slate-400 mt-1">Duration: {inc.duration_min} minutes</p>}
                  <p className="text-xs text-green-400 mt-1">✓ Resolved</p>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
              📄 Generate SLA Report
            </button>
            {tenant.credits_owed && tenant.credits_owed > 0 && (
              <button className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition-colors">
                💳 Issue Credit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SLAMonitoring() {
  const [selectedTenant, setSelectedTenant] = useState<TenantSLA | null>(null);
  const [healthFilter, setHealthFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const { data: stats = mockPlatformStats } = useQuery<PlatformSLAStats>({
    queryKey: ["sla-stats", period],
    queryFn: async () => { const r = await apiClient.get(`/superadmin/sla/stats?period=${period}`); return r.data; },
  });

  const { data: tenants = mockTenants } = useQuery<TenantSLA[]>({
    queryKey: ["sla-tenants", period],
    queryFn: async () => { const r = await apiClient.get(`/superadmin/sla/tenants?period=${period}`); return r.data.data; },
  });

  const filtered = tenants
    .filter(t => !healthFilter || t.sla_health === healthFilter)
    .filter(t => !tierFilter || t.sla_tier === tierFilter)
    .sort((a, b) => {
      const order = { breached: 0, warning: 1, healthy: 2 };
      return order[a.sla_health] - order[b.sla_health];
    });

  const uptimeValues = stats.uptime_trend.map(d => d.uptime);
  const mttdValues = stats.mttd_trend.map(d => d.mttd);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SLA Monitoring</h1>
          <p className="text-slate-400 text-sm mt-1">Service level agreement tracking across all tenants</p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? "bg-red-700 text-white" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Platform SLA Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Uptime Trend */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400">Platform Uptime ({period})</p>
              <p className={`text-3xl font-bold ${stats.overall_uptime_30d >= 99.9 ? "text-green-400" : stats.overall_uptime_30d >= 99.5 ? "text-yellow-400" : "text-red-400"}`}>
                {stats.overall_uptime_30d}%
              </p>
              <p className="text-xs text-slate-500">Target: 99.9% enterprise SLA</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1">Alert Delivery P99</p>
              <p className="text-lg font-bold text-blue-400">{stats.alert_delivery_p99}s</p>
            </div>
          </div>
          <Sparkline values={uptimeValues} color="#22c55e"/>
          <p className="text-xs text-slate-500 mt-1">30-day uptime trend</p>
        </div>

        {/* MTTD Trend */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-slate-400">Avg MTTD ({period})</p>
              <p className={`text-3xl font-bold ${stats.avg_mttd_30d <= 20 ? "text-green-400" : stats.avg_mttd_30d <= 30 ? "text-yellow-400" : "text-orange-400"}`}>
                {stats.avg_mttd_30d}m
              </p>
              <p className="text-xs text-slate-500">Mean time to detect</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1">Incidents</p>
              <p className="text-lg font-bold text-orange-400">{stats.incidents_30d}</p>
              <p className="text-xs text-slate-500">this period</p>
            </div>
          </div>
          <Sparkline values={mttdValues} color="#f97316"/>
          <p className="text-xs text-slate-500 mt-1">30-day MTTD trend (lower is better)</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Tenants Breaching SLA", value: stats.tenants_breaching, color: stats.tenants_breaching > 0 ? "text-red-400" : "text-green-400", border: stats.tenants_breaching > 0 ? "border-red-900/50" : "border-slate-800" },
          { label: "Total Credits Owed", value: `$${stats.total_credits_owed.toLocaleString()}`, color: "text-orange-400", border: "border-orange-900/40" },
          { label: "Platform Incidents", value: stats.incidents_30d, color: stats.incidents_30d > 0 ? "text-yellow-400" : "text-green-400", border: "border-slate-800" },
          { label: "SLA Healthy Tenants", value: tenants.filter(t => t.sla_health === "healthy").length, color: "text-green-400", border: "border-slate-800" },
        ].map((c, i) => (
          <div key={i} className={`bg-slate-900 rounded-xl p-4 border ${c.border}`}>
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* SLA Tier Reference */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-xs font-semibold text-white mb-3">SLA Tiers Reference</p>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(SLA_TIERS).map(([tier, def]) => (
            <div key={tier} className={`rounded-lg p-3 border ${def.color}`}>
              <p className="text-xs font-bold capitalize mb-2">{tier}</p>
              <div className="space-y-1 text-xs">
                <p>Uptime: <span className="font-mono font-bold">{def.uptime}</span></p>
                <p>MTTD: <span className="font-mono font-bold">{def.mttd}</span></p>
                <p>Delivery: <span className="font-mono font-bold">{def.delivery}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
          <option value="">All Health</option>
          <option value="breached">🚨 Breached</option>
          <option value="warning">⚠️ Warning</option>
          <option value="healthy">✅ Healthy</option>
        </select>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
          <option value="">All Tiers</option>
          {["enterprise","business","growth","starter"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Tenant SLA Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              {["Tenant","Tier","Health","Uptime","MTTD","Delivery P99","Breaches","Credits","Incidents",""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(t => {
              const tier = SLA_TIERS[t.sla_tier];
              return (
                <tr key={t.id} className={`hover:bg-slate-800/30 transition-colors ${t.sla_health === "breached" ? "bg-red-950/10" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.plan}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${tier.color}`}>{t.sla_tier}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${healthStyle[t.sla_health]}`}>
                      {healthIcon[t.sla_health]} {t.sla_health}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-sm font-bold ${uptimeColor(t.actual_uptime_30d, t.uptime_sla_pct)}`}>{t.actual_uptime_30d}%</p>
                    <p className="text-xs text-slate-500">SLA: {t.uptime_sla_pct}%</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-sm font-bold ${mttdColor(t.actual_mttd_30d, t.mttd_sla_minutes)}`}>{t.actual_mttd_30d}m</p>
                    <p className="text-xs text-slate-500">SLA: {t.mttd_sla_minutes}m</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-sm font-bold ${t.actual_alert_delivery_p99 <= t.alert_delivery_sla_seconds ? "text-green-400" : "text-red-400"}`}>
                      {t.actual_alert_delivery_p99}s
                    </p>
                    <p className="text-xs text-slate-500">SLA: {t.alert_delivery_sla_seconds}s</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5 text-xs">
                      {t.uptime_breaches_30d > 0 && <p className="text-red-400">↓ {t.uptime_breaches_30d} uptime</p>}
                      {t.mttd_breaches_30d > 0 && <p className="text-yellow-400">↓ {t.mttd_breaches_30d} MTTD</p>}
                      {t.delivery_breaches_30d > 0 && <p className="text-orange-400">↓ {t.delivery_breaches_30d} delivery</p>}
                      {t.uptime_breaches_30d === 0 && t.mttd_breaches_30d === 0 && t.delivery_breaches_30d === 0 && <p className="text-green-400">None</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.credits_owed ? (
                      <span className="text-sm font-bold text-orange-400">${t.credits_owed.toLocaleString()}</span>
                    ) : <span className="text-slate-500 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-300">{t.incidents_30d}</p>
                    {t.last_incident && <p className="text-xs text-slate-500">{timeAgo(t.last_incident)}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedTenant(t)}
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                      Detail
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedTenant && <IncidentPanel tenant={selectedTenant} onClose={() => setSelectedTenant(null)}/>}
    </div>
  );
}
