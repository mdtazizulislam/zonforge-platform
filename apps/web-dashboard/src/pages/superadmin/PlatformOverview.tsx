import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockData = {
  total_tenants: 47,
  active_tenants: 42,
  trial_tenants: 8,
  total_users: 1284,
  events_today: 2847293,
  alerts_today: 183,
  mrr: 38450,
  arr: 461400,
  new_this_month: 6,
  churn_rate: 2.1,
  pipeline_health: { ingestion_lag_ms: 340, detection_lag_ms: 1820, queue_depth: 142, error_rate: 0.003 },
  tenants_by_plan: [
    { plan: "Starter", count: 18, color: "#3b82f6" },
    { plan: "Growth", count: 14, color: "#0d9488" },
    { plan: "Business", count: 11, color: "#8b5cf6" },
    { plan: "Enterprise", count: 4, color: "#f59e0b" },
  ],
  recent_tenants: [
    { id: "1", name: "Acme Corp", plan: "Business", status: "active", created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: "2", name: "FinTech Labs", plan: "Growth", status: "trial", created_at: new Date(Date.now() - 172800000).toISOString() },
    { id: "3", name: "HealthCo", plan: "Starter", status: "active", created_at: new Date(Date.now() - 259200000).toISOString() },
  ],
};

const healthColor = (val: number, warn: number, crit: number) =>
  val >= crit ? "text-red-400" : val >= warn ? "text-yellow-400" : "text-green-400";

export default function PlatformOverview() {
  const { data = mockData } = useQuery({
    queryKey: ["platform-overview"],
    queryFn: async () => {
      const res = await apiClient.get("/superadmin/overview");
      return res.data;
    },
    refetchInterval: 10000,
  });

  const formatNum = (n: number) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString();

  const timeAgo = (iso: string) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time platform metrics · Auto-refreshes every 10s</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 border border-green-900/40 px-3 py-1.5 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          All systems operational
        </div>
      </div>

      {/* Tenant KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Tenants", value: data.total_tenants, sub: `${data.active_tenants} active`, color: "text-white" },
          { label: "Total Users", value: formatNum(data.total_users), sub: "Across all tenants", color: "text-blue-400" },
          { label: "Events Today", value: formatNum(data.events_today), sub: "Ingested & normalized", color: "text-teal-400" },
          { label: "Alerts Today", value: data.alerts_today, sub: "Across all tenants", color: "text-orange-400" },
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "MRR", value: `$${data.mrr.toLocaleString()}`, sub: "Monthly Recurring Revenue", color: "text-green-400" },
          { label: "ARR", value: `$${data.arr.toLocaleString()}`, sub: "Annual Recurring Revenue", color: "text-green-300" },
          { label: "New This Month", value: data.new_this_month, sub: "New tenants", color: "text-blue-400" },
          { label: "Churn Rate", value: `${data.churn_rate}%`, sub: "Monthly churn", color: data.churn_rate < 3 ? "text-green-400" : "text-red-400" },
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Health */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Pipeline Health — Live</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Ingestion Lag", value: `${data.pipeline_health.ingestion_lag_ms}ms`, warn: 2000, crit: 5000, raw: data.pipeline_health.ingestion_lag_ms },
            { label: "Detection Lag", value: `${data.pipeline_health.detection_lag_ms}ms`, warn: 5000, crit: 30000, raw: data.pipeline_health.detection_lag_ms },
            { label: "Queue Depth", value: data.pipeline_health.queue_depth.toString(), warn: 1000, crit: 5000, raw: data.pipeline_health.queue_depth },
            { label: "Error Rate", value: `${(data.pipeline_health.error_rate * 100).toFixed(2)}%`, warn: 0.01, crit: 0.05, raw: data.pipeline_health.error_rate },
          ].map((m, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">{m.label}</p>
              <p className={`text-xl font-bold ${healthColor(m.raw, m.warn, m.crit)}`}>{m.value}</p>
              <div className={`text-xs mt-1 ${healthColor(m.raw, m.warn, m.crit)}`}>
                {m.raw >= m.crit ? "⚠ Critical" : m.raw >= m.warn ? "△ Warning" : "✓ Healthy"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tenants by Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Tenants by Plan</h2>
          <div className="space-y-3">
            {data.tenants_by_plan.map((p: any, i: number) => {
              const pct = Math.round((p.count / data.total_tenants) * 100);
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{p.plan}</span>
                    <span className="text-slate-400">{p.count} tenants · {pct}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Tenants */}
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Tenants</h2>
            <a href="/superadmin/tenants" className="text-xs text-red-400 hover:text-red-300">View all →</a>
          </div>
          <div className="divide-y divide-slate-800">
            {data.recent_tenants.map((t: any) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.plan} · {timeAgo(t.created_at)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  t.status === "active" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                }`}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
