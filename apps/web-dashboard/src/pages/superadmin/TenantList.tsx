import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";

const mockTenants = [
  { id: "1", name: "Acme Corporation", plan: "Business", status: "active", user_count: 87, event_count_30d: 2847293, alert_count_30d: 183, mrr: 3999, created_at: "2025-01-15" },
  { id: "2", name: "FinTech Labs", plan: "Growth", status: "trial", user_count: 23, event_count_30d: 847234, alert_count_30d: 42, mrr: 1499, created_at: "2026-03-28" },
  { id: "3", name: "HealthCo Inc", plan: "Starter", status: "active", user_count: 12, event_count_30d: 124832, alert_count_30d: 8, mrr: 499, created_at: "2025-11-02" },
  { id: "4", name: "CloudSoft", plan: "Enterprise", status: "active", user_count: 234, event_count_30d: 18473829, alert_count_30d: 847, mrr: 12000, created_at: "2024-08-19" },
  { id: "5", name: "DataDriven Co", plan: "Business", status: "active", user_count: 54, event_count_30d: 1283740, alert_count_30d: 67, mrr: 3999, created_at: "2025-06-14" },
  { id: "6", name: "StartupXYZ", plan: "Starter", status: "suspended", user_count: 4, event_count_30d: 0, alert_count_30d: 0, mrr: 0, created_at: "2025-09-22" },
];

const planColor: Record<string, string> = {
  Starter: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Growth: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  Business: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Enterprise: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const statusColor: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  trial: "bg-blue-500/20 text-blue-400",
  suspended: "bg-red-500/20 text-red-400",
  cancelled: "bg-slate-500/20 text-slate-400",
};

export default function TenantList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: tenants = mockTenants } = useQuery({
    queryKey: ["tenants", search, planFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (planFilter) params.set("plan", planFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiClient.get(`/superadmin/tenants?${params}`);
      return res.data.data;
    },
  });

  const filtered = tenants.filter((t: any) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatNum = (n: number) =>
    n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenant Management</h1>
          <p className="text-slate-400 text-sm mt-1">{filtered.length} tenants</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Tenant
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search tenants..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500" />
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500">
          <option value="">All Plans</option>
          {["Starter", "Growth", "Business", "Enterprise"].map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500">
          <option value="">All Status</option>
          {["active", "trial", "suspended", "cancelled"].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              {["Tenant", "Plan", "Status", "Users", "Events (30d)", "Alerts (30d)", "MRR", "Created"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((t: any) => (
              <tr key={t.id} onClick={() => navigate(`/superadmin/tenants/${t.id}`)}
                className="hover:bg-slate-800/50 cursor-pointer transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-slate-500">ID: {t.id}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${planColor[t.plan] ?? ""}`}>{t.plan}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[t.status] ?? ""}`}>{t.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">{t.user_count}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{formatNum(t.event_count_30d)}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{t.alert_count_30d}</td>
                <td className="px-4 py-3 text-sm text-green-400 font-medium">
                  {t.mrr > 0 ? `$${t.mrr.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{t.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Create New Tenant</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Organization Name</label>
                <input className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="Acme Corporation" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Admin Email</label>
                <input type="email" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="admin@company.com" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Plan</label>
                <select className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500">
                  {["Starter", "Growth", "Business", "Enterprise"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Region</label>
                <select className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500">
                  <option>us-east-1</option>
                  <option>eu-west-1</option>
                  <option>ap-southeast-1</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">
                Cancel
              </button>
              <button className="flex-1 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg transition-colors">
                Create Tenant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
