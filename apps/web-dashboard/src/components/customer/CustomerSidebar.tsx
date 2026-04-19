import React from "react";
import { NavLink, useLocation } from "react-router-dom";

type CustomerSidebarProps = {
  open: boolean;
  onClose: () => void;
  workspaceName?: string;
  displayName?: string;
  role?: string;
};

type NavItem = {
  label: string;
  to: string;
  icon: React.ReactNode;
};

function NavIconGrid() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function NavIconBell() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 9a6 6 0 1 1 12 0v4l2 3H4l2-3V9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function NavIconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function NavIconSpark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </svg>
  );
}

function NavIconCard() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 10h18" />
    </svg>
  );
}

function NavIconCog() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/app/customer-dashboard", icon: <NavIconGrid /> },
  { label: "Alerts", to: "/app/customer-alerts", icon: <NavIconBell /> },
  { label: "Investigations", to: "/app/customer-investigations", icon: <NavIconSearch /> },
  { label: "User Risk", to: "/app/risk/users", icon: <NavIconSearch /> },
  { label: "Asset Risk", to: "/app/risk/assets", icon: <NavIconGrid /> },
  { label: "Vulnerabilities", to: "/app/risk/vulnerabilities", icon: <NavIconSpark /> },
  { label: "Timeline", to: "/app/incidents/timeline", icon: <NavIconBell /> },
  { label: "Compliance", to: "/app/compliance-posture", icon: <NavIconCog /> },
  { label: "Connectors", to: "/app/connectors", icon: <NavIconSpark /> },
  { label: "Reports", to: "/app/reports", icon: <NavIconCard /> },
  { label: "AI Assistant", to: "/app/customer-ai-assistant", icon: <NavIconSpark /> },
  { label: "Billing", to: "/app/billing", icon: <NavIconCard /> },
  { label: "Settings", to: "/app/customer-settings", icon: <NavIconCog /> },
];

function linkClass(isActive: boolean) {
  return [
    "group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all",
    isActive
      ? "bg-blue-500/15 text-white ring-1 ring-inset ring-blue-400/30"
      : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
  ].join(" ");
}

function SidebarContent({
  workspaceName = "ZonForge Sentinel",
  displayName = "Workspace User",
  role = "viewer",
  onClose,
}: Pick<CustomerSidebarProps, "workspaceName" | "displayName" | "role" | "onClose">) {
  const location = useLocation();
  const normalizedPathname = location.pathname.replace(/^\/app(?=\/|$)/, '') || '/';

  return (
    <div className="flex h-full flex-col bg-slate-950/95 text-slate-100 backdrop-blur">
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30">
            ZF
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Customer Workspace
            </p>
            <p className="truncate text-base font-semibold text-white">{workspaceName}</p>
          </div>
        </div>
      </div>

      <div className="px-3 py-4">
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const legacyPath = item.to.replace(/^\/app(?=\/|$)/, '');
            const active =
              location.pathname === item.to ||
              location.pathname.startsWith(`${item.to}/`) ||
              normalizedPathname === legacyPath ||
              normalizedPathname.startsWith(`${legacyPath}/`) ||
              (legacyPath === "/billing" && normalizedPathname === "/customer-billing");

            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={() => linkClass(active)}
                onClick={onClose}
              >
                <span className="text-slate-400 group-hover:text-white">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-slate-800 p-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Account
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-white">{displayName}</p>
          <div className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            {role}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerSidebar({
  open,
  onClose,
  workspaceName,
  displayName,
  role,
}: CustomerSidebarProps) {
  return (
    <>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-slate-800 lg:bg-slate-950/95">
        <SidebarContent
          workspaceName={workspaceName}
          displayName={displayName}
          role={role}
          onClose={onClose}
        />
      </aside>

      {open ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[320px] flex-col border-r border-slate-800 bg-slate-950 shadow-2xl">
            <SidebarContent
              workspaceName={workspaceName}
              displayName={displayName}
              role={role}
              onClose={onClose}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
