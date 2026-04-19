import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type KeyScope = "ingest:write" | "alerts:read" | "risk:read" | "admin:read" | "webhooks:write";
type KeyStatus = "active" | "expired" | "revoked";

interface APIKey {
  id: string;
  name: string;
  prefix: string;
  scopes: KeyScope[];
  status: KeyStatus;
  created_by: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  last_used_ip?: string;
  request_count_30d: number;
  request_count_today: number;
  rate_limit: number;
}

interface APIKeyUsage {
  date: string;
  requests: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockKeys: APIKey[] = [
  {
    id: "k1", name: "Production Collector — M365",
    prefix: "zf_live_a1b2c3",
    scopes: ["ingest:write"],
    status: "active",
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    expires_at: new Date(Date.now() + 335 * 86400000).toISOString(),
    last_used_at: new Date(Date.now() - 300000).toISOString(),
    last_used_ip: "10.0.1.45",
    request_count_30d: 2847293,
    request_count_today: 94877,
    rate_limit: 10000,
  },
  {
    id: "k2", name: "SIEM Integration — Splunk",
    prefix: "zf_live_d4e5f6",
    scopes: ["alerts:read", "risk:read"],
    status: "active",
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    last_used_at: new Date(Date.now() - 3600000).toISOString(),
    last_used_ip: "192.168.10.5",
    request_count_30d: 184729,
    request_count_today: 6124,
    rate_limit: 1000,
  },
  {
    id: "k3", name: "Monitoring Dashboard — Read Only",
    prefix: "zf_live_g7h8i9",
    scopes: ["alerts:read", "risk:read", "admin:read"],
    status: "active",
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    expires_at: new Date(Date.now() + 75 * 86400000).toISOString(),
    last_used_at: new Date(Date.now() - 86400000).toISOString(),
    last_used_ip: "203.0.113.10",
    request_count_30d: 47284,
    request_count_today: 1847,
    rate_limit: 500,
  },
  {
    id: "k4", name: "Old CI Pipeline Key",
    prefix: "zf_live_j0k1l2",
    scopes: ["ingest:write"],
    status: "revoked",
    created_by: "devops@acme.com",
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    last_used_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    last_used_ip: "10.0.50.100",
    request_count_30d: 0,
    request_count_today: 0,
    rate_limit: 5000,
  },
];

const SCOPES: { id: KeyScope; label: string; description: string; color: string }[] = [
  { id: "ingest:write", label: "ingest:write", description: "Push events to ingestion API", color: "bg-purple-900/40 text-purple-300 border-purple-800/40" },
  { id: "alerts:read", label: "alerts:read", description: "Read alerts and findings", color: "bg-blue-900/40 text-blue-300 border-blue-800/40" },
  { id: "risk:read", label: "risk:read", description: "Read risk scores and asset data", color: "bg-teal-900/40 text-teal-300 border-teal-800/40" },
  { id: "admin:read", label: "admin:read", description: "Read admin settings and audit logs", color: "bg-orange-900/40 text-orange-300 border-orange-800/40" },
  { id: "webhooks:write", label: "webhooks:write", description: "Configure and trigger webhooks", color: "bg-green-900/40 text-green-300 border-green-800/40" },
];

const statusColor: Record<KeyStatus, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  expired: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  revoked: "text-red-400 bg-red-500/10 border-red-500/30",
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timeUntil(iso: string) {
  const d = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  if (d <= 7) return `${d}d — ⚠️ expiring soon`;
  return `${d} days`;
}

function formatNum(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

// ─── Create Key Form ──────────────────────────────────────────────────────────
function CreateKeyForm({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<KeyScope[]>(["ingest:write"]);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState("365");
  const [rateLimit, setRateLimit] = useState("1000");
  const [saving, setSaving] = useState(false);

  const toggleScope = (s: KeyScope) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const create = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    const mockKey = `zf_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    qc.invalidateQueries({ queryKey: ["api-keys"] });
    setSaving(false);
    onCreated(mockKey);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">Create New API Key</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Key Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Production Collector — M365"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            <p className="text-xs text-slate-500 mt-1">Choose a descriptive name so you know where this key is used</p>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Scopes (Permissions) *</label>
            <div className="space-y-2">
              {SCOPES.map(s => (
                <label key={s.id} className="flex items-start gap-3 p-3 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750 border border-transparent hover:border-slate-600 transition-all">
                  <input type="checkbox" checked={scopes.includes(s.id)} onChange={() => toggleScope(s.id)}
                    className="mt-0.5 rounded border-slate-600 bg-slate-700 text-blue-600 flex-shrink-0"/>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Rate Limit (req/min)</label>
              <select value={rateLimit} onChange={e => setRateLimit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
                {[["100","100/min — Low"],["500","500/min — Standard"],["1000","1,000/min — High"],["5000","5,000/min — Very High"],["10000","10,000/min — Max"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Expiry</label>
              <div className="flex gap-2">
                <button onClick={() => setHasExpiry(false)} className={`flex-1 py-2 rounded-lg text-xs border transition-colors ${!hasExpiry ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700"}`}>No expiry</button>
                <button onClick={() => setHasExpiry(true)} className={`flex-1 py-2 rounded-lg text-xs border transition-colors ${hasExpiry ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700"}`}>Set expiry</button>
              </div>
              {hasExpiry && (
                <select value={expiryDays} onChange={e => setExpiryDays(e.target.value)}
                  className="w-full mt-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
                  {[["30","30 days"],["90","90 days"],["180","180 days"],["365","1 year"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg p-3 text-xs text-yellow-300">
            ⚠️ The full API key will only be shown <strong>once</strong> after creation. Store it securely — it cannot be retrieved again.
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={create} disabled={saving || !name || scopes.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Creating...</> : "Create API Key"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reveal Key Modal ─────────────────────────────────────────────────────────
function RevealKeyModal({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-green-800/60 w-full max-w-md p-6">
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          </div>
          <h2 className="text-lg font-bold text-white">API Key Created!</h2>
          <p className="text-sm text-slate-400 mt-1">Copy this key now — it will never be shown again.</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4">
          <p className="text-xs text-slate-400 mb-2">Your new API key:</p>
          <code className="text-sm font-mono text-green-300 break-all">{apiKey}</code>
        </div>
        <button onClick={copy}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-3 ${copied ? "bg-green-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
          {copied ? "✅ Copied!" : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>Copy to Clipboard</>
          )}
        </button>
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 text-xs text-red-300 mb-4">
          🔐 Store this key in a secure vault (AWS Secrets Manager, HashiCorp Vault, or 1Password). Do not commit to source code.
        </div>
        <button onClick={onClose} className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">
          I have saved the key — Close
        </button>
      </div>
    </div>
  );
}

// ─── Usage Sparkline ──────────────────────────────────────────────────────────
function UsageBar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.min((count / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-1.5">
        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${pct}%` }}/>
      </div>
      <span className="text-xs text-slate-400 w-12 text-right">{formatNum(count)}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function APIKeyManagement() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showRevoke, setShowRevoke] = useState<APIKey | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: keys = mockKeys } = useQuery<APIKey[]>({
    queryKey: ["api-keys"],
    queryFn: async () => { const r = await apiClient.get("/admin/api-keys"); return r.data.data; },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/admin/api-keys/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); setShowRevoke(null); },
  });

  const filtered = keys.filter(k => !statusFilter || k.status === statusFilter);
  const maxRequests = Math.max(...keys.map(k => k.request_count_30d), 1);

  const stats = {
    active: keys.filter(k => k.status === "active").length,
    total_requests: keys.filter(k => k.status === "active").reduce((s, k) => s + k.request_count_30d, 0),
    expiring_soon: keys.filter(k => k.status === "active" && k.expires_at && Math.floor((new Date(k.expires_at).getTime() - Date.now()) / 86400000) <= 7).length,
    revoked: keys.filter(k => k.status === "revoked").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API Key Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage programmatic access to ZonForge APIs</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Create API Key
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Active Keys", value: stats.active, color: "text-green-400" },
          { label: "Requests (30d)", value: formatNum(stats.total_requests), color: "text-blue-400" },
          { label: "Expiring Soon", value: stats.expiring_soon, color: stats.expiring_soon > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Revoked", value: stats.revoked, color: "text-slate-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[["active","Active"],["revoked","Revoked"],["","All"]].map(([v,l]) => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === v ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Keys List */}
      <div className="space-y-3">
        {filtered.map(key => (
          <div key={key.id} className={`bg-slate-900 rounded-xl border transition-all ${key.status === "revoked" ? "border-slate-800 opacity-60" : "border-slate-800 hover:border-slate-700"}`}>
            {/* Key Header */}
            <div className="flex items-start gap-4 p-5">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-semibold text-white">{key.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor[key.status]}`}>{key.status}</span>
                  {key.expires_at && key.status === "active" && Math.floor((new Date(key.expires_at).getTime() - Date.now()) / 86400000) <= 7 && (
                    <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800/40 px-2 py-0.5 rounded-full">⚠ Expiring soon</span>
                  )}
                </div>
                {/* Key prefix */}
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-xs font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">{key.prefix}••••••••••••</code>
                </div>
                {/* Scopes */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {key.scopes.map(s => {
                    const scope = SCOPES.find(sc => sc.id === s);
                    return scope ? (
                      <span key={s} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${scope.color}`}>{s}</span>
                    ) : null;
                  })}
                </div>
                {/* Usage */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Requests (30d)</p>
                    <UsageBar count={key.request_count_30d} max={maxRequests}/>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Requests (today)</p>
                    <UsageBar count={key.request_count_today} max={key.rate_limit * 60 * 24}/>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                <div className="flex gap-2">
                  <button onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
                    className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                    {expandedKey === key.id ? "Hide" : "Details"}
                  </button>
                  {key.status === "active" && (
                    <button onClick={() => setShowRevoke(key)}
                      className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/40 rounded-lg transition-colors">
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedKey === key.id && (
              <div className="px-5 pb-5 pt-0 border-t border-slate-800">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: "Created By", value: key.created_by },
                    { label: "Created", value: timeAgo(key.created_at) },
                    { label: "Last Used", value: key.last_used_at ? timeAgo(key.last_used_at) : "Never" },
                    { label: "Last Used IP", value: key.last_used_ip ?? "—" },
                    { label: "Rate Limit", value: `${formatNum(key.rate_limit)}/min` },
                    { label: "Expires", value: key.expires_at ? timeUntil(key.expires_at) : "No expiry" },
                    { label: "Requests Today", value: formatNum(key.request_count_today) },
                    { label: "Requests (30d)", value: formatNum(key.request_count_30d) },
                  ].map((item, i) => (
                    <div key={i} className="bg-slate-800 rounded-lg p-3">
                      <p className="text-xs text-slate-400">{item.label}</p>
                      <p className="text-xs font-medium text-white mt-0.5 truncate">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Code example */}
                <div className="mt-4">
                  <p className="text-xs text-slate-400 mb-2">Usage Example:</p>
                  <pre className="bg-slate-800 rounded-lg p-3 text-xs font-mono text-green-300 overflow-x-auto">
{`curl -X POST https://api.zonforge.io/v1/ingest/events \\
  -H "Authorization: Bearer ${key.prefix}••••••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{"events": [...]}'`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Best Practices */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">🔐 API Key Security Best Practices</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[
            { icon: "✅", text: "Use one key per service or integration — never share keys between systems" },
            { icon: "✅", text: "Store keys in a secrets manager (AWS Secrets Manager, HashiCorp Vault)" },
            { icon: "✅", text: "Set expiry dates for all keys — rotate annually at minimum" },
            { icon: "✅", text: "Use minimal scopes — only grant the permissions the key actually needs" },
            { icon: "❌", text: "Never commit API keys to source code or git repositories" },
            { icon: "❌", text: "Never share keys in Slack, email, or any messaging platform" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
              <span className="flex-shrink-0">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateKeyForm
          onClose={() => setShowCreate(false)}
          onCreated={(key) => { setShowCreate(false); setNewKey(key); }}
        />
      )}
      {newKey && <RevealKeyModal apiKey={newKey} onClose={() => setNewKey(null)}/>}

      {/* Revoke Confirmation */}
      {showRevoke && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-red-800/60 w-full max-w-md p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              </div>
              <h2 className="text-lg font-bold text-white">Revoke API Key?</h2>
              <p className="text-sm text-slate-400 mt-1">This action cannot be undone.</p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 mb-4 border border-slate-700">
              <p className="text-xs text-slate-400">Key to revoke:</p>
              <p className="text-sm font-medium text-white">{showRevoke.name}</p>
              <code className="text-xs font-mono text-slate-400">{showRevoke.prefix}••••••••••••</code>
            </div>
            <p className="text-xs text-red-300 mb-5">
              ⚠️ Any service using this key will immediately lose access. Make sure you have updated all services before revoking.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowRevoke(null)} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
              <button onClick={() => revokeKey.mutate(showRevoke.id)}
                disabled={revokeKey.isPending}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                {revokeKey.isPending ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Revoking...</> : "Revoke Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
