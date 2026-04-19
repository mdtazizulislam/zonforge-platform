import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

const roleTone: Record<string, React.CSSProperties> = {
  TENANT_ADMIN: { background: "rgba(47,124,255,.18)", color: "#21d4fd", border: "1px solid rgba(47,124,255,.28)" },
  SECURITY_ANALYST: { background: "rgba(33,212,253,.14)", color: "#8fe8ff", border: "1px solid rgba(33,212,253,.24)" },
  READ_ONLY: { background: "rgba(148,163,184,.12)", color: "#cbd5e1", border: "1px solid rgba(148,163,184,.18)" },
};

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("SECURITY_ANALYST");
  const [search, setSearch] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/users");
      return res.data.data;
    },
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      await apiClient.post("/admin/users/invite", { email: inviteEmail, role: inviteRole });
    },
    onSuccess: () => {
      setShowInvite(false);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiClient.patch(`/admin/users/${id}`, { status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const timeAgo = (iso: string) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (d > 0) return `${d}d ago`;
    return `${h}h ago`;
  };

  const filtered = (users as Array<any>).filter((user) =>
    user.name.toLowerCase().includes(search.toLowerCase()) ||
    user.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="zf-section">
      <section className="zf-card zf-card--wide">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "end", flexWrap: "wrap" }}>
          <div className="zf-section-head">
            <h2 className="zf-page-title">User Management</h2>
            <p className="zf-page-subtitle">{users.length} users in your organization</p>
          </div>

          <button type="button" onClick={() => setShowInvite(true)} className="zf-btn-primary">
            Invite User
          </button>
        </div>

        <div style={{ marginTop: "16px" }}>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search users by name or email"
            className="zf-team-input"
            style={{ width: "100%" }}
          />
        </div>
      </section>

      <section className="zf-card zf-card--wide">
        <div className="zf-card-head">
          <h3 className="zf-card-title">Workspace Members</h3>
          <p className="zf-card-subtitle">Active administrators, analysts, and read-only users</p>
        </div>

        {filtered.length > 0 ? (
          <div className="zf-table-wrap">
            <table className="zf-alerts-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "999px",
                            display: "grid",
                            placeItems: "center",
                            background: "linear-gradient(135deg, #2f7cff, #21d4fd)",
                            color: "#fff",
                            fontSize: ".8rem",
                            fontWeight: 800,
                          }}
                        >
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="zf-alerts-table__title">{user.name}</div>
                          <div className="zf-card-subtitle">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="zf-badge" style={roleTone[user.role] ?? roleTone.READ_ONLY}>
                        {user.role.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <span className={`zf-status-pill ${user.status === "active" ? "is-success" : "is-danger"}`}>
                        {user.status}
                      </span>
                    </td>
                    <td>{timeAgo(user.last_login_at)}</td>
                    <td>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => updateUser.mutate({ id: user.id, status: user.status === "active" ? "suspended" : "active" })}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: user.status === "active" ? "#ff8ea5" : "#6ff0b2",
                            fontSize: ".85rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          {user.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="zf-team-note">
            <span>No members match the current view</span>
            <small>Invite your first administrator or analyst to start managing tenant access from this workspace.</small>
          </div>
        )}
      </section>

      {showInvite && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2, 6, 23, .78)", display: "grid", placeItems: "center", padding: "16px", zIndex: 50 }}>
          <div className="zf-card" style={{ width: "100%", maxWidth: "520px" }}>
            <div className="zf-card-head">
              <h3 className="zf-card-title">Invite New User</h3>
              <p className="zf-card-subtitle">Send a secure workspace invitation and assign an initial role</p>
            </div>

            <div className="zf-team-form">
              <div className="zf-team-field">
                <span>Email Address</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="zf-team-input"
                  placeholder="user@company.com"
                />
              </div>

              <div className="zf-team-field">
                <span>Role</span>
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="zf-team-select">
                  <option value="SECURITY_ANALYST">Security Analyst</option>
                  <option value="READ_ONLY">Read Only</option>
                  <option value="TENANT_ADMIN">Tenant Admin</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setShowInvite(false)} className="zf-btn-secondary" style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="button" onClick={() => inviteUser.mutate()} disabled={!inviteEmail || inviteUser.isPending} className="zf-btn-primary" style={{ flex: 1, opacity: !inviteEmail || inviteUser.isPending ? 0.65 : 1 }}>
                {inviteUser.isPending ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
