import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { apiClient } from "../api/client";

const navItems = [
  { path: "/app/superadmin", label: "Platform Overview", end: true, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { path: "/app/superadmin/tenants", label: "Tenants", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { path: "/app/superadmin/billing", label: "Billing", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { path: "/app/superadmin/mssp", label: "MSSP Console", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" },
  { path: "/app/superadmin/rules", label: "Detection Rules", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { path: "/app/superadmin/threat-intel", label: "Threat Intel", icon: "M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { path: "/app/superadmin/system", label: "System Health", icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" },
  { path: "/app/superadmin/sla", label: "SLA", icon: "M12 8v4l3 3M12 21a9 9 0 100-18 9 9 0 000 18z" },
  { path: "/app/superadmin/capacity", label: "Capacity", icon: "M4 18h16M7 14h3V6H7v8Zm7 0h3V10h-3v4Z" },
  { path: "/app/superadmin/detection-performance", label: "Detection Performance", icon: "M5 12h3l2-5 4 10 2-5h3" },
  { path: "/app/superadmin/war-room", label: "War Room", icon: "M3 12h18M12 3v18" },
  { path: "/app/superadmin/white-label", label: "White Label", icon: "M4 7h16M4 12h16M4 17h10" },
];

export default function SuperAdminLayout() {
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
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} transition-all duration-300 bg-slate-900 border-r border-red-900/30 flex flex-col flex-shrink-0`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-red-900/30 min-h-[64px]">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-600/30">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="font-bold text-red-300 text-sm">Super Admin</p>
              <p className="text-slate-400 text-xs">Platform Control</p>
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
                    ? "bg-red-700 text-white shadow-lg shadow-red-700/20"
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

        <div className="p-3 border-t border-red-900/30">
          {sidebarOpen && (
            <>
              <div className="flex items-center gap-3 px-2 py-2 mb-1">
                <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {user?.name?.charAt(0).toUpperCase() ?? "S"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-red-400">Super Admin</p>
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
        <header className="bg-slate-900 border-b border-red-900/30 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Toggle super admin navigation"
            title="Toggle super admin navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-900/50 text-red-300 px-3 py-1 rounded-full font-medium border border-red-800/50">
              ⚡ SUPER ADMIN
            </span>
            <span className="text-xs text-slate-500">{user?.email}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
