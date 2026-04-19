import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = async () => {
    await apiClient.post("/auth/logout");
    clearAuth();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800 min-h-[64px]">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-teal-600/30">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-white text-sm">Admin Panel</p>
              <p className="text-teal-400 text-xs truncate">{user?.email}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={(item as any).end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  isActive
                    ? "bg-teal-600 text-white shadow-lg shadow-teal-600/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800">
          {sidebarOpen && (
            <>
              <div className="flex items-center gap-3 px-2 py-2 mb-1">
                <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {user?.name?.charAt(0).toUpperCase() ?? "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400">Tenant Admin</p>
                </div>
              </div>
              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/30 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Toggle admin navigation"
            title="Toggle admin navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-xs bg-teal-900/50 text-teal-300 px-2.5 py-1 rounded-full font-medium border border-teal-800/50">
            TENANT ADMIN
          </span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
