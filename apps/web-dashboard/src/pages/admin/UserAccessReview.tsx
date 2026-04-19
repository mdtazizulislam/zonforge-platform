import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type ReviewStatus = "pending" | "approved" | "revoked" | "modified";
type RiskLevel = "critical" | "high" | "medium" | "low";

interface AccessReviewUser {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  risk_level: RiskLevel;
  risk_score: number;
  days_inactive: number;
  last_login?: string;
  mfa_enabled: boolean;
  privilege_level: "elevated" | "standard" | "restricted";
  access_count: number;
  review_status: ReviewStatus;
  review_note?: string;
  flags: string[];
  joined_at: string;
}

interface ReviewCampaign {
  id: string;
  name: string;
  status: "active" | "completed" | "scheduled";
  due_date: string;
  total_users: number;
  reviewed: number;
  approved: number;
  revoked: number;
  modified: number;
  created_at: string;
  created_by: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockCampaign: ReviewCampaign = {
  id: "rc1",
  name: "Q2 2026 Quarterly Access Review",
  status: "active",
  due_date: new Date(Date.now() + 7 * 86400000).toISOString(),
  total_users: 8,
  reviewed: 3,
  approved: 2,
  revoked: 1,
  modified: 0,
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  created_by: "admin@acme.com",
};

const mockUsers: AccessReviewUser[] = [
  {
    id: "u1", name: "John Smith", email: "john.smith@acme.com",
    department: "Engineering", role: "SECURITY_ANALYST",
    risk_level: "critical", risk_score: 87,
    days_inactive: 0, last_login: new Date(Date.now() - 86400000).toISOString(),
    mfa_enabled: false, privilege_level: "elevated",
    access_count: 14, review_status: "pending",
    flags: ["MFA disabled", "High risk score", "Elevated privilege"],
    joined_at: "2024-03-01T10:00:00Z",
  },
  {
    id: "u2", name: "Jane Doe", email: "jane.doe@acme.com",
    department: "Finance", role: "READ_ONLY",
    risk_level: "low", risk_score: 28,
    days_inactive: 0, last_login: new Date(Date.now() - 2 * 86400000).toISOString(),
    mfa_enabled: true, privilege_level: "standard",
    access_count: 3, review_status: "approved",
    flags: [],
    joined_at: "2023-06-15T10:00:00Z",
  },
  {
    id: "u3", name: "Bob Wilson", email: "bob.wilson@acme.com",
    department: "IT", role: "TENANT_ADMIN",
    risk_level: "medium", risk_score: 54,
    days_inactive: 94, last_login: new Date(Date.now() - 94 * 86400000).toISOString(),
    mfa_enabled: true, privilege_level: "elevated",
    access_count: 8, review_status: "pending",
    flags: ["Inactive 94 days", "Admin role — high privilege"],
    joined_at: "2022-11-10T10:00:00Z",
  },
  {
    id: "u4", name: "Alice Chen", email: "alice.chen@acme.com",
    department: "Engineering", role: "SECURITY_ANALYST",
    risk_level: "high", risk_score: 71,
    days_inactive: 0, last_login: new Date(Date.now() - 3600000).toISOString(),
    mfa_enabled: true, privilege_level: "standard",
    access_count: 6, review_status: "pending",
    flags: ["Login from new country", "After-hours access pattern"],
    joined_at: "2025-01-20T10:00:00Z",
  },
  {
    id: "u5", name: "contractor@ext.com", email: "contractor@ext.com",
    department: "External", role: "READ_ONLY",
    risk_level: "high", risk_score: 65,
    days_inactive: 45, last_login: new Date(Date.now() - 45 * 86400000).toISOString(),
    mfa_enabled: false, privilege_level: "restricted",
    access_count: 2, review_status: "revoked",
    review_note: "Contract ended — access revoked",
    flags: ["External contractor", "Inactive 45 days", "MFA disabled"],
    joined_at: "2025-09-01T10:00:00Z",
  },
  {
    id: "u6", name: "svc-deploy", email: "svc-deploy@acme.com",
    department: "DevOps", role: "TENANT_ADMIN",
    risk_level: "critical", risk_score: 91,
    days_inactive: 0, last_login: new Date(Date.now() - 2 * 86400000).toISOString(),
    mfa_enabled: false, privilege_level: "elevated",
    access_count: 22, review_status: "pending",
    flags: ["Service account with admin role", "MFA not applicable — API auth", "High request volume"],
    joined_at: "2024-01-01T10:00:00Z",
  },
  {
    id: "u7", name: "Sarah Johnson", email: "sarah.johnson@acme.com",
    department: "Marketing", role: "READ_ONLY",
    risk_level: "low", risk_score: 18,
    days_inactive: 2, last_login: new Date(Date.now() - 2 * 86400000).toISOString(),
    mfa_enabled: true, privilege_level: "standard",
    access_count: 2, review_status: "approved",
    flags: [],
    joined_at: "2024-07-01T10:00:00Z",
  },
  {
    id: "u8", name: "Mike Torres", email: "mike.torres@acme.com",
    department: "Sales", role: "READ_ONLY",
    risk_level: "medium", risk_score: 41,
    days_inactive: 12, last_login: new Date(Date.now() - 12 * 86400000).toISOString(),
    mfa_enabled: true, privilege_level: "standard",
    access_count: 3, review_status: "pending",
    flags: ["Access to sensitive data scope"],
    joined_at: "2023-12-01T10:00:00Z",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const riskColor: Record<RiskLevel, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-green-400 bg-green-500/10 border-green-500/30",
};

const reviewStatusStyle: Record<ReviewStatus, string> = {
  pending: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  approved: "text-green-400 bg-green-500/10 border-green-500/30",
  revoked: "text-red-400 bg-red-500/10 border-red-500/30",
  modified: "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

const reviewStatusIcon: Record<ReviewStatus, string> = {
  pending: "⏳", approved: "✅", revoked: "🚫", modified: "✏️",
};

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function daysUntil(iso: string) {
  const d = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (d < 0) return "Overdue";
  if (d === 0) return "Due today";
  return `${d} days left`;
}

// ─── User Review Card ─────────────────────────────────────────────────────────
function UserReviewCard({
  user, onAction,
}: {
  user: AccessReviewUser;
  onAction: (userId: string, action: ReviewStatus, note?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(user.review_note ?? "");
  const [newRole, setNewRole] = useState(user.role);
  const isDone = user.review_status !== "pending";

  return (
    <div className={`bg-slate-900 rounded-xl border transition-all ${
      user.review_status === "approved" ? "border-green-900/40 opacity-75" :
      user.review_status === "revoked" ? "border-red-900/40 opacity-75" :
      user.review_status === "modified" ? "border-blue-900/40" :
      user.flags.length > 0 ? "border-orange-900/40" : "border-slate-800"
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
            user.risk_level === "critical" ? "bg-red-600" :
            user.risk_level === "high" ? "bg-orange-600" :
            user.risk_level === "medium" ? "bg-yellow-600" : "bg-green-600"
          }`}>
            {user.name.charAt(0)}
          </div>

          {/* User Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${riskColor[user.risk_level]}`}>
                {user.risk_level} · {user.risk_score}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full border ${reviewStatusStyle[user.review_status]}`}>
                {reviewStatusIcon[user.review_status]} {user.review_status}
              </span>
            </div>
            <p className="text-xs text-slate-400">{user.email} · {user.department} · {user.role}</p>

            {/* Quick stats */}
            <div className="flex gap-3 mt-2 flex-wrap">
              <span className="text-xs text-slate-400">
                {user.days_inactive > 0 ? <span className="text-orange-400">⚠ {user.days_inactive}d inactive</span> : <span className="text-green-400">✓ Active</span>}
              </span>
              <span className="text-xs text-slate-400">
                {user.mfa_enabled ? <span className="text-green-400">✓ MFA</span> : <span className="text-red-400">✗ No MFA</span>}
              </span>
              <span className="text-xs text-slate-400">{user.privilege_level} privilege</span>
              {user.last_login && <span className="text-xs text-slate-400">Last login: {timeAgo(user.last_login)}</span>}
            </div>

            {/* Flags */}
            {user.flags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {user.flags.map((flag, i) => (
                  <span key={i} className="text-xs bg-orange-900/30 text-orange-300 border border-orange-800/40 px-2 py-0.5 rounded-full">
                    ⚑ {flag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {!isDone ? (
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button onClick={() => onAction(user.id, "approved", note)}
                className="px-3 py-1.5 text-xs bg-green-900/40 hover:bg-green-900/60 text-green-300 border border-green-800/40 rounded-lg transition-colors font-medium">
                ✅ Approve
              </button>
              <button onClick={() => setExpanded(!expanded)}
                className="px-3 py-1.5 text-xs bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800/40 rounded-lg transition-colors">
                ✏️ Modify
              </button>
              <button onClick={() => onAction(user.id, "revoked", note)}
                className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/40 rounded-lg transition-colors">
                🚫 Revoke
              </button>
            </div>
          ) : (
            <div className="flex-shrink-0 text-right">
              {user.review_note && <p className="text-xs text-slate-400 max-w-[120px]">{user.review_note}</p>}
            </div>
          )}
        </div>

        {/* Expanded — Modify Panel */}
        {expanded && !isDone && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Change Role To</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
                  <option value="READ_ONLY">READ_ONLY — Viewer</option>
                  <option value="SECURITY_ANALYST">SECURITY_ANALYST</option>
                  <option value="TENANT_ADMIN">TENANT_ADMIN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Review Note (for audit log)</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Reason for change..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { onAction(user.id, "modified", note); setExpanded(false); }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                Apply Changes
              </button>
              <button onClick={() => setExpanded(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New Campaign Form ────────────────────────────────────────────────────────
function NewCampaignForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("Q3 2026 Quarterly Access Review");
  const [dueInDays, setDueInDays] = useState("14");
  const [scope, setScope] = useState<string[]>(["inactive_60d", "high_risk", "elevated_privilege"]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleScope = (s: string) => setScope(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 900));
    qc.invalidateQueries({ queryKey: ["access-review"] });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 600);
  };

  const scopeOptions = [
    { id: "all_users", label: "All Users", desc: "Review every user in the tenant" },
    { id: "inactive_30d", label: "Inactive 30+ days", desc: "Users who have not logged in for 30 days" },
    { id: "inactive_60d", label: "Inactive 60+ days", desc: "Users who have not logged in for 60 days" },
    { id: "high_risk", label: "High / Critical Risk Score", desc: "Users with risk score above 70" },
    { id: "elevated_privilege", label: "Elevated Privilege", desc: "Admins and elevated-role users" },
    { id: "no_mfa", label: "MFA Not Enabled", desc: "Users without MFA configured" },
    { id: "external", label: "External / Contractor", desc: "Non-company email domain users" },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">New Access Review Campaign</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Campaign Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Due In</label>
            <select value={dueInDays} onChange={e => setDueInDays(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              {[["7","7 days"],["14","14 days"],["30","30 days"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">User Scope *</label>
            <div className="space-y-2">
              {scopeOptions.map(o => (
                <label key={o.id} className="flex items-start gap-3 p-3 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750 border border-transparent hover:border-slate-600 transition-all">
                  <input type="checkbox" checked={scope.includes(o.id)} onChange={() => toggleScope(o.id)}
                    className="mt-0.5 rounded border-slate-600 bg-slate-700 text-blue-600 flex-shrink-0"/>
                  <div>
                    <p className="text-sm font-medium text-white">{o.label}</p>
                    <p className="text-xs text-slate-400">{o.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !name || scope.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Launching...</> : saved ? "✅ Launched!" : "Launch Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function UserAccessReview() {
  const qc = useQueryClient();
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [filter, setFilter] = useState<ReviewStatus | "all" | "flagged">("all");
  const [users, setUsers] = useState(mockUsers);

  const handleAction = (userId: string, action: ReviewStatus, note?: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, review_status: action, review_note: note } : u));
  };

  const campaign = mockCampaign;
  const reviewed = users.filter(u => u.review_status !== "pending").length;
  const pct = Math.round((reviewed / users.length) * 100);

  const filtered = users
    .filter(u => {
      if (filter === "all") return true;
      if (filter === "flagged") return u.flags.length > 0;
      return u.review_status === filter;
    })
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      if (a.review_status === "pending" && b.review_status !== "pending") return -1;
      if (b.review_status === "pending" && a.review_status !== "pending") return 1;
      return order[a.risk_level] - order[b.risk_level];
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Access Review</h1>
          <p className="text-slate-400 text-sm mt-1">Periodic access certification and privilege validation</p>
        </div>
        <button onClick={() => setShowNewCampaign(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Campaign
        </button>
      </div>

      {/* Active Campaign Banner */}
      <div className={`bg-slate-900 rounded-xl border p-5 ${pct === 100 ? "border-green-800/50" : "border-blue-800/40"}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-bold text-white">{campaign.name}</h2>
              <span className="text-xs bg-blue-900/40 text-blue-400 border border-blue-800/40 px-2 py-0.5 rounded-full">Active</span>
            </div>
            <p className="text-xs text-slate-400">
              Created by {campaign.created_by} · {daysUntil(campaign.due_date)}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${pct === 100 ? "text-green-400" : "text-blue-400"}`}>{pct}%</p>
            <p className="text-xs text-slate-400">complete</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-2.5 mb-4">
          <div className={`h-2.5 rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }}/>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Users", value: users.length, color: "text-white" },
            { label: "✅ Approved", value: users.filter(u => u.review_status === "approved").length, color: "text-green-400" },
            { label: "🚫 Revoked", value: users.filter(u => u.review_status === "revoked").length, color: "text-red-400" },
            { label: "⏳ Pending", value: users.filter(u => u.review_status === "pending").length, color: "text-yellow-400" },
          ].map((s, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit flex-wrap">
        {([
          { id: "all", label: `All (${users.length})` },
          { id: "pending", label: `⏳ Pending (${users.filter(u => u.review_status === "pending").length})` },
          { id: "flagged", label: `⚑ Flagged (${users.filter(u => u.flags.length > 0).length})` },
          { id: "approved", label: `✅ Approved (${users.filter(u => u.review_status === "approved").length})` },
          { id: "revoked", label: `🚫 Revoked (${users.filter(u => u.review_status === "revoked").length})` },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${filter === f.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Bulk Actions */}
      {users.filter(u => u.review_status === "pending").length > 0 && (
        <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 rounded-xl border border-slate-800 text-xs">
          <span className="text-slate-400">{users.filter(u => u.review_status === "pending").length} users pending review</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setUsers(prev => prev.map(u => ({ ...u, review_status: u.review_status === "pending" && u.flags.length === 0 ? "approved" : u.review_status })))}
              className="px-3 py-1.5 bg-green-900/30 hover:bg-green-900/50 text-green-300 border border-green-800/40 rounded-lg transition-colors">
              ✅ Bulk Approve — Low Risk (no flags)
            </button>
          </div>
        </div>
      )}

      {/* User Review Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <p>No users match this filter</p>
          </div>
        ) : filtered.map(user => (
          <UserReviewCard key={user.id} user={user} onAction={handleAction} />
        ))}
      </div>

      {/* Completion Banner */}
      {pct === 100 && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-5 text-center">
          <p className="text-lg font-bold text-green-400 mb-1">🎉 Review Complete!</p>
          <p className="text-sm text-slate-300">
            All {users.length} users reviewed — {users.filter(u => u.review_status === "approved").length} approved, {users.filter(u => u.review_status === "revoked").length} revoked, {users.filter(u => u.review_status === "modified").length} modified
          </p>
          <button className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors">
            Export Review Report (PDF)
          </button>
        </div>
      )}

      {showNewCampaign && <NewCampaignForm onClose={() => setShowNewCampaign(false)} />}
    </div>
  );
}
