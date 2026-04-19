import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const mockOverview = {
  user_count: 12,
  connector_count: 4,
  active_connectors: 3,
  alert_summary: { open: 17, critical: 3 },
  plan_usage: { identities_used: 87, limit: 200 },
  recent_audit: [
    { id: "1", actor_email: "admin@acme.com", action: "CONNECTOR_CREATED", target_type: "connector", created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: "2", actor_email: "admin@acme.com", action: "USER_INVITED", target_type: "user", created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: "3", actor_email: "john.smith@acme.com", action: "ALERT_RESOLVED", target_type: "alert", created_at: new Date(Date.now() - 14400000).toISOString() },
  ],
};

export default function AdminOverview() {
  const { data = mockOverview } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/overview");
      return res.data;
    },
  });

  const usagePct = Math.round((data.plan_usage.identities_used / data.plan_usage.limit) * 100);

  const timeAgo = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    return h > 0 ? `${h}h ago` : "Just now";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Overview</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your organization's security platform</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: data.user_count, icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z", color: "text-blue-400", link: "/admin/users" },
          { label: "Active Connectors", value: `${data.active_connectors}/${data.connector_count}`, icon: "M13 10V3L4 14h7v7l9-11h-7z", color: "text-teal-400", link: "/admin/connectors" },
          { label: "Open Alerts", value: data.alert_summary.open, icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9", color: "text-orange-400", link: "/alerts" },
          { label: "Critical Alerts", value: data.alert_summary.critical, icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", color: "text-red-400", link: "/alerts" },
        ].map((card, i) => (
          <a key={i} href={card.link} className="bg-slate-900 rounded-xl p-5 border border-slate-800 hover:border-slate-600 transition-all block">
            <div className="flex items-center gap-3 mb-3">
              <svg className={`w-5 h-5 ${card.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.icon} />
              </svg>
              <span className="text-xs text-slate-400">{card.label}</span>
            </div>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </a>
        ))}
      </div>

      {/* Plan Usage */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Plan Usage — Identities</h2>
          <span className="text-xs text-slate-400">{data.plan_usage.identities_used} / {data.plan_usage.limit}</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${usagePct >= 90 ? "bg-red-500" : usagePct >= 70 ? "bg-yellow-500" : "bg-teal-500"}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-slate-400">{usagePct}% used</span>
          {usagePct >= 80 && <a href="/admin/billing" className="text-xs text-blue-400 hover:text-blue-300">Upgrade plan →</a>}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: "Invite User", href: "/admin/users", icon: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" },
          { label: "Add Connector", href: "/admin/connectors/new", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
          { label: "View Audit Log", href: "/admin/audit", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
        ].map((action, i) => (
          <a key={i} href={action.href}
            className="flex items-center gap-3 bg-slate-900 rounded-xl p-4 border border-slate-800 hover:border-teal-700 hover:bg-slate-800 transition-all">
            <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
            </svg>
            <span className="text-sm text-white">{action.label}</span>
          </a>
        ))}
      </div>

      {/* Recent Audit */}
      <div className="bg-slate-900 rounded-xl border border-slate-800">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
          <a href="/admin/audit" className="text-xs text-blue-400 hover:text-blue-300">View all →</a>
        </div>
        <div className="divide-y divide-slate-800">
          {data.recent_audit.map((entry: any) => (
            <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{entry.action.replace(/_/g, " ")}</p>
                <p className="text-xs text-slate-400">{entry.actor_email}</p>
              </div>
              <span className="text-xs text-slate-500">{timeAgo(entry.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
