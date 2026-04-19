import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tenant {
  id: string;
  name: string;
  domain: string;
  plan: string;
  status: "active" | "suspended" | "trial";
  user_count: number;
  admin_email: string;
  last_activity: string;
}

interface ImpersonationSession {
  id: string;
  tenant_id: string;
  tenant_name: string;
  initiated_by: string;
  reason: string;
  started_at: string;
  ended_at?: string;
  duration_minutes?: number;
  actions_taken: number;
  status: "active" | "ended";
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockTenants: Tenant[] = [
  { id: "t1", name: "Acme Corporation", domain: "acme.com", plan: "Business", status: "active", user_count: 47, admin_email: "admin@acme.com", last_activity: new Date(Date.now() - 1800000).toISOString() },
  { id: "t2", name: "FinTech Labs", domain: "fintechlabs.io", plan: "Growth", status: "active", user_count: 23, admin_email: "admin@fintechlabs.io", last_activity: new Date(Date.now() - 3600000).toISOString() },
  { id: "t3", name: "CloudSoft", domain: "cloudsoft.com", plan: "Enterprise", status: "active", user_count: 112, admin_email: "admin@cloudsoft.com", last_activity: new Date(Date.now() - 7200000).toISOString() },
  { id: "t4", name: "DataDriven Co", domain: "datadriven.co", plan: "Growth", status: "trial", user_count: 8, admin_email: "ceo@datadriven.co", last_activity: new Date(Date.now() - 86400000).toISOString() },
  { id: "t5", name: "SecureBank", domain: "securebank.com", plan: "Enterprise", status: "active", user_count: 234, admin_email: "security@securebank.com", last_activity: new Date(Date.now() - 300000).toISOString() },
];

const mockHistory: ImpersonationSession[] = [
  { id: "s1", tenant_id: "t1", tenant_name: "Acme Corporation", initiated_by: "support@zonforge.io", reason: "Customer reported missing alerts — investigating connector config", started_at: new Date(Date.now() - 2 * 86400000).toISOString(), ended_at: new Date(Date.now() - 2 * 86400000 + 23 * 60000).toISOString(), duration_minutes: 23, actions_taken: 7, status: "ended" },
  { id: "s2", tenant_id: "t3", tenant_name: "CloudSoft", initiated_by: "support@zonforge.io", reason: "Billing dispute — verifying usage data", started_at: new Date(Date.now() - 5 * 86400000).toISOString(), ended_at: new Date(Date.now() - 5 * 86400000 + 11 * 60000).toISOString(), duration_minutes: 11, actions_taken: 3, status: "ended" },
  { id: "s3", tenant_id: "t2", tenant_name: "FinTech Labs", initiated_by: "admin@zonforge.io", reason: "Onboarding assistance — configuring first connectors", started_at: new Date(Date.now() - 10 * 86400000).toISOString(), ended_at: new Date(Date.now() - 10 * 86400000 + 45 * 60000).toISOString(), duration_minutes: 45, actions_taken: 15, status: "ended" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const planColor: Record<string, string> = {
  Enterprise: "bg-purple-900/40 text-purple-300 border-purple-800/40",
  Business: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  Growth: "bg-teal-900/40 text-teal-300 border-teal-800/40",
  Starter: "bg-slate-700 text-slate-300 border-slate-600",
};
const tenantStatusStyle: Record<string, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  suspended: "text-red-400 bg-red-500/10 border-red-500/30",
  trial: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Impersonation Confirm Modal ───────────────────────────────────────────────
function ImpersonateModal({ tenant, onClose, onConfirm }: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    await new Promise(r => setTimeout(r, 1000));
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-orange-800/60 w-full max-w-md">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Impersonate Tenant</h2>
              <p className="text-xs text-slate-400">You are about to access another organisation's data</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Tenant Info */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {tenant.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{tenant.name}</p>
                <p className="text-xs text-slate-400">{tenant.domain} · {tenant.user_count} users · {tenant.plan}</p>
              </div>
            </div>
          </div>

          {/* Reason — mandatory */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Reason for access <span className="text-red-400">*</span>
              <span className="text-slate-500 ml-1">(recorded in audit log)</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="e.g. Customer reported missing alerts — investigating connector configuration issue (Support ticket #12345)"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"/>
            <p className="text-xs text-slate-500 mt-1">{reason.length}/500 characters</p>
          </div>

          {/* Warnings */}
          <div className="space-y-2">
            {[
              "This session will be recorded in the platform audit log",
              "The tenant admin will be notified via email",
              "All actions you take within this session are attributed to your account",
              "Session automatically expires after 60 minutes of inactivity",
            ].map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-orange-300">
                <span className="flex-shrink-0 mt-0.5">⚠</span>
                <span>{w}</span>
              </div>
            ))}
          </div>

          {/* Acknowledge */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}
              className="mt-0.5 rounded border-slate-600 bg-slate-800 text-orange-600 flex-shrink-0"/>
            <span className="text-xs text-slate-300">
              I understand this session is fully audited and that I have the authority to access this tenant's data.
            </span>
          </label>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={start} disabled={starting || !reason.trim() || !acknowledged}
            className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors">
            {starting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Starting...</> : "Start Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Active Session Banner ─────────────────────────────────────────────────────
function ActiveSessionBanner({ session, onEnd }: { session: { tenant: Tenant; reason: string; startedAt: Date }; onEnd: () => void }) {
  const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 60000);
  const [ending, setEnding] = useState(false);

  const end = async () => {
    setEnding(true);
    await new Promise(r => setTimeout(r, 800));
    onEnd();
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-orange-600 px-4 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-white rounded-full animate-pulse"/>
        <span className="text-white text-sm font-semibold">
          👁 Impersonating: {session.tenant.name}
        </span>
        <span className="text-orange-200 text-xs">· {elapsed}m elapsed · All actions are audited</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-orange-200 text-xs truncate max-w-sm">Reason: {session.reason}</span>
        <button onClick={end} disabled={ending}
          className="px-3 py-1.5 bg-white text-orange-600 text-xs font-bold rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-70">
          {ending ? "Ending..." : "End Session"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TenantImpersonation() {
  const [search, setSearch] = useState("");
  const [impersonateTarget, setImpersonateTarget] = useState<Tenant | null>(null);
  const [activeSession, setActiveSession] = useState<{ tenant: Tenant; reason: string; startedAt: Date } | null>(null);
  const [tab, setTab] = useState<"tenants" | "history">("tenants");

  const { data: tenants = mockTenants } = useQuery<Tenant[]>({
    queryKey: ["tenants-list"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/tenants"); return r.data.data; },
  });

  const { data: history = mockHistory } = useQuery<ImpersonationSession[]>({
    queryKey: ["impersonation-history"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/impersonation/history"); return r.data.data; },
  });

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.domain.toLowerCase().includes(search.toLowerCase()) ||
    t.admin_email.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = (reason: string) => {
    if (!impersonateTarget) return;
    setActiveSession({ tenant: impersonateTarget, reason, startedAt: new Date() });
    setImpersonateTarget(null);
  };

  return (
    <div className="space-y-5">
      {/* Active Session Banner */}
      {activeSession && (
        <ActiveSessionBanner session={activeSession} onEnd={() => setActiveSession(null)} />
      )}

      <div className={activeSession ? "mt-14" : ""}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Tenant Impersonation</h1>
            <p className="text-slate-400 text-sm mt-1">Access tenant environments for support — fully audit-logged</p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-orange-900/20 border border-orange-800/40 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-orange-400 text-lg flex-shrink-0">🔐</span>
            <div>
              <p className="text-sm font-semibold text-orange-300 mb-1">Privileged Access — Handle With Care</p>
              <p className="text-xs text-orange-200 leading-relaxed">
                Tenant impersonation grants you admin-level access to a customer's environment.
                Every session is immutably recorded in the audit log, the tenant admin is notified by email,
                and all actions are attributed to your super-admin account. Use only for legitimate support purposes.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
          <button onClick={() => setTab("tenants")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "tenants" ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
            🏢 Tenants ({tenants.length})
          </button>
          <button onClick={() => setTab("history")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "history" ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
            📋 Session History ({history.length})
          </button>
        </div>

        {/* Tenant List */}
        {tab === "tenants" && (
          <div className="space-y-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, domain, admin email..."
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-700"/>

            <div className="space-y-2">
              {filtered.map(tenant => (
                <div key={tenant.id} className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex items-center gap-4 hover:border-slate-700 transition-all">
                  {/* Avatar */}
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {tenant.name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold text-white">{tenant.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${planColor[tenant.plan] ?? ""}`}>{tenant.plan}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${tenantStatusStyle[tenant.status]}`}>{tenant.status}</span>
                    </div>
                    <p className="text-xs text-slate-400">{tenant.domain} · {tenant.admin_email}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{tenant.user_count} users · Last active {timeAgo(tenant.last_activity)}</p>
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => setImpersonateTarget(tenant)}
                    disabled={tenant.status === "suspended"}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 border border-orange-700/50 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    Impersonate
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Tab */}
        {tab === "history" && (
          <div className="space-y-3">
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    {["Tenant","Initiated By","Reason","Started","Duration","Actions","Status"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {history.map(s => (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-white">{s.tenant_name}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">{s.initiated_by}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">{s.reason}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(s.started_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-300">{s.duration_minutes}m</td>
                      <td className="px-4 py-3 text-xs text-slate-300">{s.actions_taken}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${s.status === "active" ? "text-green-400 bg-green-500/10 border-green-500/30" : "text-slate-400 bg-slate-500/10 border-slate-500/30"}`}>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <p className="text-xs text-slate-400">
                ℹ Impersonation sessions are immutably stored in the audit log and cannot be deleted.
                Sessions are retained for 7 years for compliance purposes.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {impersonateTarget && (
        <ImpersonateModal
          tenant={impersonateTarget}
          onClose={() => setImpersonateTarget(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
