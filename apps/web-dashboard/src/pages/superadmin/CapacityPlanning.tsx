import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ResourceMetric {
  name: string;
  current: number;
  limit: number;
  unit: string;
  pct_used: number;
  trend_30d: number;
  days_until_limit?: number;
  projected_30d: number;
  cost_per_unit?: number;
}

interface TenantCapacity {
  id: string;
  name: string;
  plan: string;
  identities_used: number;
  identities_limit: number;
  events_per_day: number;
  events_limit_per_day: number;
  connectors_used: number;
  connectors_limit: number;
  data_retention_days: number;
  overage_cost_mtd: number;
  upgrade_signal: "none" | "approaching" | "ready" | "overdue";
}

interface LicenseSeat {
  tier: string;
  allocated: number;
  used: number;
  available: number;
  cost_per_seat: number;
  expiry_date: string;
  auto_renew: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockResources: ResourceMetric[] = [
  { name: "Event Ingestion", current: 847293000, limit: 1000000000, unit: "events/month", pct_used: 84.7, trend_30d: 12, days_until_limit: 18, projected_30d: 950000000, cost_per_unit: 0.0001 },
  { name: "Stored Identities", current: 28472, limit: 50000, unit: "identities", pct_used: 56.9, trend_30d: 8, days_until_limit: null, projected_30d: 30750, cost_per_unit: 2 },
  { name: "Active Connectors", current: 184, limit: 250, unit: "connectors", pct_used: 73.6, trend_30d: 5, days_until_limit: null, projected_30d: 193 },
  { name: "Storage Used", current: 12.4, limit: 20, unit: "TB", pct_used: 62, trend_30d: 6, days_until_limit: null, projected_30d: 13.1 },
  { name: "API Calls", current: 18472930, limit: 25000000, unit: "calls/month", pct_used: 73.9, trend_30d: 18, days_until_limit: 22, projected_30d: 21797657 },
  { name: "ML Inference", current: 2847293, limit: 5000000, unit: "inferences/month", pct_used: 56.9, trend_30d: 10, days_until_limit: null, projected_30d: 3132022 },
];

const mockTenants: TenantCapacity[] = [
  { id: "t1", name: "Acme Corporation", plan: "Business", identities_used: 87, identities_limit: 200, events_per_day: 1218960, events_limit_per_day: 3333333, connectors_used: 4, connectors_limit: 10, data_retention_days: 180, overage_cost_mtd: 0, upgrade_signal: "none" },
  { id: "t2", name: "FinTech Labs", plan: "Growth", identities_used: 23, identities_limit: 100, events_per_day: 184729, events_limit_per_day: 1666666, connectors_used: 2, connectors_limit: 5, data_retention_days: 90, overage_cost_mtd: 0, upgrade_signal: "none" },
  { id: "t3", name: "CloudSoft", plan: "Enterprise", identities_used: 1847, identities_limit: 2000, events_per_day: 9847293, events_limit_per_day: 10000000, connectors_used: 6, connectors_limit: 7, data_retention_days: 365, overage_cost_mtd: 2100, upgrade_signal: "overdue" },
  { id: "t4", name: "DataDriven Co", plan: "Growth", identities_used: 8, identities_limit: 100, events_per_day: 47293, events_limit_per_day: 1666666, connectors_used: 1, connectors_limit: 5, data_retention_days: 90, overage_cost_mtd: 0, upgrade_signal: "none" },
  { id: "t5", name: "SecureBank", plan: "Enterprise", identities_used: 1247, identities_limit: 5000, events_per_day: 7847293, events_limit_per_day: 30000000, connectors_used: 7, connectors_limit: 20, data_retention_days: 365, overage_cost_mtd: 0, upgrade_signal: "none" },
  { id: "t6", name: "RetailCorp", plan: "Starter", identities_used: 28, identities_limit: 50, events_per_day: 284729, events_limit_per_day: 333333, connectors_used: 2, connectors_limit: 3, data_retention_days: 30, overage_cost_mtd: 840, upgrade_signal: "overdue" },
];

const mockLicenses: LicenseSeat[] = [
  { tier: "Enterprise", allocated: 10, used: 2, available: 8, cost_per_seat: 12000, expiry_date: new Date(Date.now() + 180 * 86400000).toISOString(), auto_renew: true },
  { tier: "Business", allocated: 20, used: 11, available: 9, cost_per_seat: 3999, expiry_date: new Date(Date.now() + 335 * 86400000).toISOString(), auto_renew: true },
  { tier: "Growth", allocated: 15, used: 14, available: 1, cost_per_seat: 1499, expiry_date: new Date(Date.now() + 245 * 86400000).toISOString(), auto_renew: false },
  { tier: "Starter", allocated: 10, used: 7, available: 3, cost_per_seat: 499, expiry_date: new Date(Date.now() + 60 * 86400000).toISOString(), auto_renew: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pctColor(pct: number): string {
  return pct >= 90 ? "text-red-400" : pct >= 75 ? "text-yellow-400" : "text-green-400";
}
function pctBar(pct: number): string {
  return pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-yellow-500" : "bg-green-500";
}
function formatNum(n: number): string {
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}
const upgradeStyle: Record<string, string> = {
  none: "text-slate-500",
  approaching: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  ready: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  overdue: "text-red-400 bg-red-500/10 border-red-500/30",
};
const upgradeLabel: Record<string, string> = {
  none: "—", approaching: "Approaching limit", ready: "Upgrade ready", overdue: "⚠ Over limit",
};
function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}

// ─── Resource Bar ─────────────────────────────────────────────────────────────
function ResourceBar({ metric }: { metric: ResourceMetric }) {
  const projectedPct = Math.min((metric.projected_30d / metric.limit) * 100, 100);
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">{metric.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatNum(metric.current)} / {formatNum(metric.limit)} {metric.unit}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${pctColor(metric.pct_used)}`}>{metric.pct_used}%</p>
          <p className="text-xs text-slate-500">used</p>
        </div>
      </div>

      {/* Current usage bar */}
      <div className="relative w-full bg-slate-800 rounded-full h-3 mb-1">
        <div className={`h-3 rounded-full transition-all ${pctBar(metric.pct_used)}`}
          style={{ width: `${metric.pct_used}%` }}/>
        {/* Projected marker */}
        {projectedPct > metric.pct_used && (
          <div className="absolute top-0 h-3 border-r-2 border-orange-400 border-dashed"
            style={{ left: `${Math.min(projectedPct, 98)}%` }}
            title={`Projected: ${projectedPct.toFixed(0)}%`}/>
        )}
      </div>

      <div className="flex items-center justify-between text-xs mt-2">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            +{metric.trend_30d}%/mo trend
          </span>
          {metric.days_until_limit && (
            <span className={`font-medium ${metric.days_until_limit <= 14 ? "text-red-400" : "text-orange-400"}`}>
              ⚡ Limit in ~{metric.days_until_limit}d
            </span>
          )}
        </div>
        <span className="text-orange-300">
          Projected: {formatNum(metric.projected_30d)} ({projectedPct.toFixed(0)}%)
        </span>
      </div>

      {metric.cost_per_unit && (
        <div className="mt-2 text-xs text-slate-500">
          Est. overage cost: <span className="text-orange-300 font-medium">
            ${((Math.max(metric.projected_30d - metric.limit, 0)) * metric.cost_per_unit).toFixed(0)}/mo
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CapacityPlanning() {
  const [tab, setTab] = useState<"platform" | "tenants" | "licenses">("platform");
  const [upgradeFilter, setUpgradeFilter] = useState("");

  const { data: resources = mockResources } = useQuery<ResourceMetric[]>({
    queryKey: ["capacity-resources"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/capacity/resources"); return r.data.data; },
  });

  const { data: tenants = mockTenants } = useQuery<TenantCapacity[]>({
    queryKey: ["capacity-tenants"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/capacity/tenants"); return r.data.data; },
  });

  const { data: licenses = mockLicenses } = useQuery<LicenseSeat[]>({
    queryKey: ["license-seats"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/licenses"); return r.data.data; },
  });

  const criticalResources = resources.filter(r => r.pct_used >= 80);
  const totalOverage = tenants.reduce((s, t) => s + t.overage_cost_mtd, 0);
  const upgradeOpportunities = tenants.filter(t => t.upgrade_signal !== "none").length;
  const licensesLow = licenses.filter(l => (l.available / l.allocated) < 0.15).length;

  const filteredTenants = tenants.filter(t => !upgradeFilter || t.upgrade_signal === upgradeFilter);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">License & Capacity Planning</h1>
        <p className="text-slate-400 text-sm mt-1">Platform resource usage, license seats, and upgrade intelligence</p>
      </div>

      {/* Alert banners */}
      {criticalResources.length > 0 && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg flex-shrink-0">⚡</span>
          <div>
            <p className="text-sm font-semibold text-red-300">Capacity Alert — {criticalResources.length} resource{criticalResources.length > 1 ? "s" : ""} near limit</p>
            <p className="text-xs text-red-200 mt-1">
              {criticalResources.map(r => `${r.name} at ${r.pct_used}%`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Critical Resources", value: criticalResources.length, color: criticalResources.length > 0 ? "text-red-400" : "text-green-400", border: criticalResources.length > 0 ? "border-red-900/50" : "border-slate-800" },
          { label: "Overage Revenue MTD", value: `$${totalOverage.toLocaleString()}`, color: "text-orange-400", border: "border-orange-900/40" },
          { label: "Upgrade Opportunities", value: upgradeOpportunities, color: "text-blue-400", border: "border-slate-800" },
          { label: "License Tiers Low", value: licensesLow, color: licensesLow > 0 ? "text-yellow-400" : "text-green-400", border: "border-slate-800" },
        ].map((c, i) => (
          <div key={i} className={`bg-slate-900 rounded-xl p-4 border ${c.border}`}>
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        {([
          { id: "platform", label: "⚙️ Platform Resources" },
          { id: "tenants", label: "🏢 Tenant Capacity" },
          { id: "licenses", label: "🎫 License Seats" },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PLATFORM RESOURCES ── */}
      {tab === "platform" && (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-3 text-xs text-blue-300">
            📊 Orange dashed line = projected usage in 30 days based on current growth trend
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {resources.map((r, i) => <ResourceBar key={i} metric={r}/>)}
          </div>

          {/* Scaling Recommendations */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">📋 Scaling Recommendations</h2>
            <div className="space-y-3">
              {resources.filter(r => r.days_until_limit || r.pct_used >= 75).map((r, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${r.pct_used >= 90 ? "bg-red-900/20 border border-red-800/40" : "bg-yellow-900/20 border border-yellow-800/40"}`}>
                  <span className="text-lg flex-shrink-0">{r.pct_used >= 90 ? "🚨" : "⚠️"}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{r.name}</p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Currently {r.pct_used}% used · Growing {r.trend_30d}%/month
                      {r.days_until_limit ? ` · Will hit limit in ~${r.days_until_limit} days` : ""}
                    </p>
                    <p className={`text-xs mt-1 ${r.pct_used >= 90 ? "text-red-300" : "text-yellow-300"}`}>
                      {r.pct_used >= 90
                        ? "Action required: Scale infrastructure or implement rate limiting within 2 weeks"
                        : "Monitor closely: Plan capacity increase before next billing cycle"}
                    </p>
                  </div>
                  <button className="flex-shrink-0 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    Plan Scale
                  </button>
                </div>
              ))}
              {resources.filter(r => r.days_until_limit || r.pct_used >= 75).length === 0 && (
                <p className="text-sm text-green-400">✅ All resources within healthy thresholds</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TENANT CAPACITY ── */}
      {tab === "tenants" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {([["", "All"], ["overdue", "⚠ Over Limit"], ["approaching", "Approaching"], ["ready", "Upgrade Ready"], ["none", "Healthy"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setUpgradeFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${upgradeFilter === v ? "bg-red-700 text-white" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Tenant","Plan","Identities","Events/Day","Connectors","Retention","Overage MTD","Status"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredTenants.map(t => {
                  const idPct = Math.round((t.identities_used / t.identities_limit) * 100);
                  const evPct = Math.round((t.events_per_day / t.events_limit_per_day) * 100);
                  const conPct = Math.round((t.connectors_used / t.connectors_limit) * 100);
                  return (
                    <tr key={t.id} className={`hover:bg-slate-800/30 transition-colors ${t.upgrade_signal === "overdue" ? "bg-red-950/10" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-white">{t.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{t.plan}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-700 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pctBar(idPct)}`} style={{ width: `${idPct}%` }}/>
                          </div>
                          <span className={`text-xs ${pctColor(idPct)}`}>{t.identities_used}/{t.identities_limit}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-700 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pctBar(evPct)}`} style={{ width: `${evPct}%` }}/>
                          </div>
                          <span className={`text-xs ${pctColor(evPct)}`}>{formatNum(t.events_per_day)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${pctColor(conPct)}`}>{t.connectors_used}/{t.connectors_limit}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">{t.data_retention_days}d</td>
                      <td className="px-4 py-3">
                        {t.overage_cost_mtd > 0 ? (
                          <span className="text-sm font-bold text-orange-400">${t.overage_cost_mtd.toLocaleString()}</span>
                        ) : <span className="text-slate-500 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {t.upgrade_signal === "none" ? (
                          <span className="text-xs text-slate-500">—</span>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${upgradeStyle[t.upgrade_signal]}`}>
                            {upgradeLabel[t.upgrade_signal]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LICENSE SEATS ── */}
      {tab === "licenses" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {licenses.map((lic, i) => {
              const usedPct = Math.round((lic.used / lic.allocated) * 100);
              const renewalDays = daysUntil(lic.expiry_date);
              return (
                <div key={i} className={`bg-slate-900 rounded-xl border p-5 ${renewalDays <= 60 && !lic.auto_renew ? "border-orange-800/40" : "border-slate-800"}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-base font-bold text-white">{lic.tier} Plan</p>
                      <p className="text-xs text-slate-400">${lic.cost_per_seat.toLocaleString()}/seat/month</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${pctColor(usedPct)}`}>{usedPct}%</p>
                      <p className="text-xs text-slate-400">utilized</p>
                    </div>
                  </div>

                  {/* Seat gauge */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: "Allocated", value: lic.allocated, color: "text-white" },
                      { label: "Used", value: lic.used, color: pctColor(usedPct) },
                      { label: "Available", value: lic.available, color: lic.available <= 2 ? "text-red-400" : "text-green-400" },
                    ].map((s, j) => (
                      <div key={j} className="bg-slate-800 rounded-lg p-2.5 text-center">
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-slate-400">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                    <div className={`h-2 rounded-full ${pctBar(usedPct)}`} style={{ width: `${usedPct}%` }}/>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400">Expires: </span>
                      <span className={renewalDays <= 60 ? "text-orange-400 font-medium" : "text-slate-300"}>
                        {renewalDays}d ({new Date(lic.expiry_date).toLocaleDateString()})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${lic.auto_renew ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"}`}>
                        {lic.auto_renew ? "Auto-renew ON" : "Auto-renew OFF"}
                      </span>
                    </div>
                  </div>

                  {/* Warnings */}
                  {lic.available <= 2 && (
                    <div className="mt-3 p-2.5 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-300">
                      ⚠ Only {lic.available} seat{lic.available !== 1 ? "s" : ""} remaining — purchase more to onboard new tenants
                    </div>
                  )}
                  {renewalDays <= 60 && !lic.auto_renew && (
                    <div className="mt-3 p-2.5 bg-orange-900/20 border border-orange-800/40 rounded-lg text-xs text-orange-300">
                      ⏰ License expires in {renewalDays} days — auto-renew is OFF
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button className="flex-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                      + Purchase Seats
                    </button>
                    {!lic.auto_renew && (
                      <button className="flex-1 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                        Enable Auto-renew
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* License Summary */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">License Cost Summary</h2>
            <div className="space-y-2">
              {licenses.map((lic, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{lic.tier} — {lic.used} seats @ ${lic.cost_per_seat.toLocaleString()}/mo</span>
                  <span className="text-white font-medium">${(lic.used * lic.cost_per_seat).toLocaleString()}/mo</span>
                </div>
              ))}
              <div className="border-t border-slate-700 pt-2 flex items-center justify-between font-semibold">
                <span className="text-slate-300">Total License Revenue</span>
                <span className="text-green-400">${licenses.reduce((s, l) => s + (l.used * l.cost_per_seat), 0).toLocaleString()}/mo</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
