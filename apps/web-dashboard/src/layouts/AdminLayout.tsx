import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { apiClient } from "../api/client";

const navItems = [
  { path: "/app/admin", label: "Overview", end: true, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { path: "/app/admin/users", label: "Users", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  { path: "/app/admin/connectors", label: "Connectors", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { path: "/app/admin/connectors/health", label: "Connector Health", icon: "M5 12h3l2-5 4 10 2-5h3" },
  { path: "/app/admin/rules", label: "Alert Tuning", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { path: "/app/admin/rules/detection", label: "Detection Rules", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { path: "/app/admin/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { path: "/app/admin/billing", label: "Billing", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { path: "/app/admin/audit", label: "Audit Log", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { path: "/app/admin/maintenance", label: "Maintenance", icon: "M10 14 21 3m-6 0h6v6M3 21l6-6" },
  { path: "/app/admin/sso", label: "SSO", icon: "M7 8h10M7 12h7M7 16h4" },
  { path: "/app/admin/threat-intel", label: "Threat Intel", icon: "M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { path: "/app/admin/api-keys", label: "API Keys", icon: "M15 7a2 2 0 114 0 2 2 0 01-4 0ZM6 13l5-5 5 5-5 5-5-5Z" },
  { path: "/app/admin/access-review", label: "Access Review", icon: "M12 6a4 4 0 100 8 4 4 0 000-8Zm-7 14a7 7 0 0114 0" },
  { path: "/app/admin/webhooks", label: "Webhooks", icon: "M8 12h8M12 8v8" },
];

export default function AdminLayout() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const currentSection = [...navItems]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => ((item as any).end ? location.pathname === item.path : location.pathname.startsWith(item.path)))?.label ?? "Admin Workspace";

  const initials = (user?.name ?? "Admin User")
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      clearAuth();
      navigate("/login");
    }
  };

  return (
    <div className="zf-customer-page">
      <aside className="zf-customer-sidebar">
        <div>
          <div className="zf-customer-sidebar__brand">
            <div className="zf-customer-sidebar__logo">ZA</div>
            <div>
              <p className="zf-customer-sidebar__eyebrow">Tenant Admin</p>
              <p className="zf-customer-sidebar__title">Admin Workspace</p>
            </div>
          </div>

          <nav className="zf-customer-sidebar__nav">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={(item as any).end}
                className={({ isActive }) => `zf-customer-navlink${isActive ? " is-active" : ""}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="zf-customer-sidebar__footer">
          <p className="zf-customer-sidebar__footnote">{user?.name ?? "Admin User"}</p>
          <p className="zf-customer-sidebar__subnote">{user?.email ?? "tenant-admin@zonforge.com"}</p>
          <button type="button" onClick={handleLogout} className="zf-btn-secondary" style={{ width: "100%", marginTop: "12px" }}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="zf-customer-main">
        <header className="zf-customer-header">
          <div>
            <p className="zf-customer-header__eyebrow">Tenant Administration</p>
            <h1 className="zf-customer-header__title">{currentSection}</h1>
            <p className="zf-customer-header__subtitle">
              Manage users, connector health, maintenance windows, and workspace operations from one dashboard.
            </p>
          </div>

          <div className="zf-customer-header__actions">
            <div className="zf-customer-user">
              <div className="zf-customer-user__avatar">{initials}</div>
              <div>
                <p className="zf-customer-user__name">{user?.name ?? "Admin User"}</p>
                <p className="zf-customer-user__role">{user?.email ?? "tenant-admin@zonforge.com"}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="zf-customer-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
