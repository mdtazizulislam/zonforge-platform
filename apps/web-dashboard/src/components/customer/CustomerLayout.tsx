import React, { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth.store";
import CustomerSidebar from "./CustomerSidebar";

type StoredAuth = {
  state?: {
    user?: {
      fullName?: string;
      name?: string;
      email?: string;
      role?: string;
      workspaceName?: string;
      tenant?: {
        name?: string;
        slug?: string;
      };
    };
  };
  user?: {
    fullName?: string;
    name?: string;
    email?: string;
    role?: string;
    workspaceName?: string;
    tenant?: {
      name?: string;
      slug?: string;
    };
  };
  workspace?: {
    name?: string;
    slug?: string;
  };
};

function readStoredAuth(): StoredAuth | null {
  const candidates = ["zf-auth", "zf_auth"];
  for (const key of candidates) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as StoredAuth;
      if (parsed?.state?.user) {
        return {
          user: parsed.state.user,
          workspace: {
            name: parsed.state.user.tenant?.name ?? parsed.state.user.workspaceName,
            slug: parsed.state.user.tenant?.slug,
          },
        };
      }
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function pageTitle(pathname: string): string {
  const internalPath = pathname.replace(/^\/app(?=\/|$)/, '') || '/';

  if (internalPath.startsWith("/customer-alerts")) return "Alerts";
  if (internalPath.startsWith("/customer-investigations")) return "Investigations";
  if (internalPath.startsWith("/customer-ai-assistant")) return "AI Assistant";
  if (internalPath.startsWith("/risk/users")) return "User Risk";
  if (internalPath.startsWith("/risk/assets")) return "Asset Risk";
  if (internalPath.startsWith("/risk/vulnerabilities")) return "Vulnerability Correlation";
  if (internalPath.startsWith("/incidents/timeline")) return "Incident Timeline";
  if (internalPath.startsWith("/connectors")) return "Connectors";
  if (internalPath.startsWith("/reports")) return "Executive Reports";
  if (internalPath.startsWith("/compliance-posture")) return "Compliance Posture";
  if (internalPath.startsWith("/billing") || internalPath.startsWith("/customer-billing")) return "Billing";
  if (internalPath.startsWith("/customer-settings")) return "Settings";
  return "Dashboard";
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export default function CustomerLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const user = useAuthStore((state) => state.user);

  const auth = useMemo(() => readStoredAuth(), []);
  const workspaceName =
    user?.tenant?.name || auth?.workspace?.name || auth?.user?.workspaceName || "ZonForge Sentinel";
  const displayName =
    user?.fullName || user?.name || user?.email || auth?.user?.fullName || auth?.user?.name || auth?.user?.email || "Workspace User";
  const role = user?.membership?.role || user?.role || auth?.user?.role || "viewer";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_32%),linear-gradient(180deg,#071122_0%,#08152b_100%)] text-slate-100">
      <CustomerSidebar
        open={open}
        onClose={() => setOpen(false)}
        workspaceName={workspaceName}
        displayName={displayName}
        role={role}
      />

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-200 lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
              >
                <MenuIcon />
              </button>

              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Executive Overview
                </p>
                <h1 className="truncate text-base font-semibold text-white">
                  {pageTitle(location.pathname)}
                </h1>
              </div>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{displayName}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{role}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 font-semibold text-blue-200 ring-1 ring-blue-400/30">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}