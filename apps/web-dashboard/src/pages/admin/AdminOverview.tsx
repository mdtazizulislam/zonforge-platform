import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const emptyOverview = {
  user_count: 0,
  connector_count: 0,
  active_connectors: 0,
  alert_summary: { open: 0, critical: 0 },
  plan_usage: { identities_used: 0, limit: 0 },
  recent_audit: [],
};

export default function AdminOverview() {
  const { data = emptyOverview } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/overview");
      return res.data;
    },
  });

  const usagePct = data.plan_usage.limit > 0
    ? Math.round((data.plan_usage.identities_used / data.plan_usage.limit) * 100)
    : 0;

  const timeAgo = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    return h > 0 ? `${h}h ago` : "Just now";
  };

  const stats = [
    { label: "Users", value: data.user_count, tone: "#21d4fd", link: "/app/admin/users" },
    { label: "Connectors", value: data.active_connectors, tone: "#1fd286", link: "/app/admin/connectors" },
    { label: "Open Alerts", value: data.alert_summary.open, tone: "#ffb547", link: "/app/alerts" },
    { label: "Critical", value: data.alert_summary.critical, tone: "#ff5d7a", link: "/app/alerts" },
  ];

  return (
    <div className="zf-section">
      <section className="zf-card zf-card--wide">
        <div className="zf-section-head">
          <p className="zf-page-subtitle">Tenant administration</p>
          <h2 className="zf-page-title">Admin Overview</h2>
          <p className="zf-page-subtitle">Manage users, connectors, alerts, and operational health from one clean control surface.</p>
        </div>
      </section>

      <div className="zf-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.link} className="zf-card" style={{ textDecoration: "none" }}>
            <div className="zf-card-head" style={{ marginBottom: "10px" }}>
              <p className="zf-card-subtitle">{stat.label}</p>
              <p className="zf-value" style={{ textAlign: "left", color: stat.tone, fontSize: "2rem" }}>{stat.value}</p>
            </div>
            <p className="zf-card-subtitle">Open the related admin workflow</p>
          </Link>
        ))}
      </div>

      <div className="zf-grid zf-grid-2">
        <section className="zf-card">
          <div className="zf-card-head">
            <h3 className="zf-card-title">Plan Usage</h3>
            <p className="zf-card-subtitle">Identity capacity across your current subscription</p>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
            <span className="zf-label">Used</span>
            <span className="zf-value">{data.plan_usage.identities_used} / {data.plan_usage.limit}</span>
          </div>

          <div style={{ height: "12px", borderRadius: "999px", overflow: "hidden", background: "rgba(8, 18, 37, .9)" }}>
            <div
              style={{
                height: "100%",
                width: `${usagePct}%`,
                borderRadius: "999px",
                background: usagePct >= 90 ? "#ff5d7a" : usagePct >= 70 ? "#ffb547" : "linear-gradient(135deg, #2f7cff, #21d4fd)",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginTop: "10px", alignItems: "center" }}>
            <span className="zf-card-subtitle">{usagePct}% used</span>
            {usagePct >= 80 && (
              <Link to="/app/admin/billing" style={{ color: "#21d4fd", fontSize: ".85rem", fontWeight: 700, textDecoration: "none" }}>
                Review billing →
              </Link>
            )}
          </div>
        </section>

        <section className="zf-card">
          <div className="zf-card-head">
            <h3 className="zf-card-title">Quick Actions</h3>
            <p className="zf-card-subtitle">Common administrative tasks for daily operations</p>
          </div>

          <div className="zf-action-stack">
            <Link to="/app/admin/users" className="zf-btn-secondary" style={{ textDecoration: "none", textAlign: "center" }}>
              Invite or review users
            </Link>
            <Link to="/app/admin/connectors" className="zf-btn-secondary" style={{ textDecoration: "none", textAlign: "center" }}>
              Manage connectors
            </Link>
            <Link to="/app/admin/maintenance" className="zf-btn-secondary" style={{ textDecoration: "none", textAlign: "center" }}>
              Schedule maintenance
            </Link>
          </div>
        </section>
      </div>

      <section className="zf-card zf-card--wide">
        <div className="zf-card-head">
          <h3 className="zf-card-title">Recent Activity</h3>
          <p className="zf-card-subtitle">Latest administrative actions across the tenant workspace</p>
        </div>

        <div className="zf-detail-list">
          {data.recent_audit.map((entry: any) => (
            <div key={entry.id} className="zf-detail-row">
              <div>
                <p className="zf-card-title" style={{ fontSize: ".95rem" }}>{entry.action.replace(/_/g, " ")}</p>
                <p className="zf-card-subtitle">{entry.actor_email} · {entry.target_type}</p>
              </div>
              <span className="zf-card-subtitle">{timeAgo(entry.created_at)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
