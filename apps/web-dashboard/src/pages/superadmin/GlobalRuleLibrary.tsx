import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type RuleStatus = "published" | "draft" | "deprecated" | "testing";
type RuleSource = "zonforge" | "community" | "custom";

interface GlobalRule {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: RuleStatus;
  source: RuleSource;
  version: string;
  mitre_tactic?: string;
  mitre_technique?: string;
  mitre_id?: string;
  tags: string[];
  tenant_coverage: number;
  total_tenants: number;
  hit_count_7d_total: number;
  false_positive_rate_avg: number;
  last_updated: string;
  created_at: string;
  changelog: { version: string; date: string; note: string }[];
  conditions_summary: string;
  test_results?: { passed: number; failed: number; tenants_tested: number };
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockRules: GlobalRule[] = [
  {
    id: "gr1", name: "Brute-Force to Successful Login",
    description: "Detects multiple failed logins followed by a successful login from the same actor — indicates credential stuffing or password spray attacks.",
    severity: "high", status: "published", source: "zonforge", version: "2.1.0",
    mitre_tactic: "Credential Access", mitre_technique: "Brute Force", mitre_id: "T1110",
    tags: ["auth", "brute-force", "credential-stuffing"],
    tenant_coverage: 47, total_tenants: 47,
    hit_count_7d_total: 1284, false_positive_rate_avg: 5.2,
    last_updated: new Date(Date.now() - 7 * 86400000).toISOString(),
    created_at: "2026-01-10T10:00:00Z",
    conditions_summary: "event_action = LOGIN_FAILED × 10+ AND event_action = LOGIN_SUCCESS within 30 min, group_by actor.user_id",
    changelog: [
      { version: "2.1.0", date: "2026-04-01", note: "Lowered threshold from 15 to 10 failed attempts based on global FP analysis" },
      { version: "2.0.0", date: "2026-02-15", note: "Added group_by actor.user_id to reduce noise from shared IPs" },
      { version: "1.0.0", date: "2026-01-10", note: "Initial release" },
    ],
    test_results: { passed: 45, failed: 2, tenants_tested: 47 },
  },
  {
    id: "gr2", name: "Impossible Travel Login",
    description: "Login from two geographically impossible locations within 90 minutes — indicates account takeover or credential sharing.",
    severity: "high", status: "published", source: "zonforge", version: "1.3.0",
    mitre_tactic: "Initial Access", mitre_technique: "Valid Accounts", mitre_id: "T1078",
    tags: ["auth", "travel", "geolocation"],
    tenant_coverage: 45, total_tenants: 47,
    hit_count_7d_total: 342, false_positive_rate_avg: 14.8,
    last_updated: new Date(Date.now() - 14 * 86400000).toISOString(),
    created_at: "2026-01-10T10:00:00Z",
    conditions_summary: "event_action = LOGIN_SUCCESS AND geo.distance_km > 500 within 90 min, group_by actor.user_id",
    changelog: [
      { version: "1.3.0", date: "2026-03-20", note: "Increased geo distance threshold from 300km to 500km to reduce FP for users with VPNs" },
      { version: "1.2.0", date: "2026-02-01", note: "Added suppression for known business travel patterns" },
    ],
    test_results: { passed: 41, failed: 4, tenants_tested: 45 },
  },
  {
    id: "gr3", name: "Mass Cloud Storage Exfiltration",
    description: "Detects bulk download of files from cloud storage (SharePoint/S3/Drive) exceeding normal volume thresholds in a short window.",
    severity: "critical", status: "published", source: "zonforge", version: "1.0.0",
    mitre_tactic: "Exfiltration", mitre_technique: "Data from Cloud Storage", mitre_id: "T1530",
    tags: ["exfiltration", "cloud-storage", "data-loss"],
    tenant_coverage: 38, total_tenants: 47,
    hit_count_7d_total: 87, false_positive_rate_avg: 8.1,
    last_updated: new Date(Date.now() - 21 * 86400000).toISOString(),
    created_at: "2026-02-01T10:00:00Z",
    conditions_summary: "event_action IN [FILE_DOWNLOAD, FILE_EXPORT] AND count > 200 within 5 min, group_by actor.user_id",
    changelog: [
      { version: "1.0.0", date: "2026-02-01", note: "Initial release" },
    ],
    test_results: { passed: 37, failed: 1, tenants_tested: 38 },
  },
  {
    id: "gr4", name: "New Admin Account Created Off-Hours",
    description: "Detects creation of admin-level accounts outside business hours — often indicates unauthorized privilege escalation.",
    severity: "high", status: "testing", source: "zonforge", version: "0.9.0-beta",
    mitre_tactic: "Privilege Escalation", mitre_technique: "Account Manipulation", mitre_id: "T1098",
    tags: ["admin", "privilege-escalation", "off-hours"],
    tenant_coverage: 5, total_tenants: 47,
    hit_count_7d_total: 12, false_positive_rate_avg: 22.3,
    last_updated: new Date(Date.now() - 3 * 86400000).toISOString(),
    created_at: "2026-04-10T10:00:00Z",
    conditions_summary: "event_action = USER_ROLE_ASSIGNED AND actor.role IN [ADMIN, GLOBAL_ADMIN] AND time NOT IN business_hours",
    changelog: [
      { version: "0.9.0-beta", date: "2026-04-10", note: "Beta — testing with 5 tenants. High FP rate under investigation." },
    ],
    test_results: { passed: 3, failed: 2, tenants_tested: 5 },
  },
  {
    id: "gr5", name: "Legacy Authentication Protocol Used",
    description: "Detects authentication via legacy protocols (SMTP, IMAP, POP3) which bypass MFA — commonly exploited after credential theft.",
    severity: "medium", status: "draft", source: "zonforge", version: "0.1.0-draft",
    mitre_tactic: "Defense Evasion", mitre_technique: "Use Alternate Authentication Material", mitre_id: "T1550",
    tags: ["auth", "mfa-bypass", "legacy-protocol"],
    tenant_coverage: 0, total_tenants: 47,
    hit_count_7d_total: 0, false_positive_rate_avg: 0,
    last_updated: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    conditions_summary: "event_action = LOGIN_SUCCESS AND auth.protocol IN [SMTP, IMAP, POP3, BASIC_AUTH]",
    changelog: [
      { version: "0.1.0-draft", date: "2026-04-17", note: "Draft — not yet deployed to any tenants." },
    ],
  },
];

const tacticColor: Record<string, string> = {
  "Credential Access": "#ef4444", "Initial Access": "#f97316",
  "Persistence": "#8b5cf6", "Privilege Escalation": "#ec4899",
  "Defense Evasion": "#6366f1", "Discovery": "#06b6d4",
  "Exfiltration": "#f43f5e", "Impact": "#dc2626",
  "Lateral Movement": "#14b8a6", "Collection": "#84cc16",
};

const statusStyle: Record<RuleStatus, string> = {
  published: "text-green-400 bg-green-500/10 border-green-500/30",
  draft: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  deprecated: "text-red-400 bg-red-500/10 border-red-500/30",
  testing: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

const sevColor: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-green-400 bg-green-500/10 border-green-500/30",
};

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

// ─── Deploy Modal ──────────────────────────────────────────────────────────────
function DeployModal({ rule, onClose }: { rule: GlobalRule; onClose: () => void }) {
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const mockTenants = ["Acme Corp", "FinTech Labs", "CloudSoft", "DataDriven Co", "SecureBank"];

  const deploy = async () => {
    setDeploying(true);
    await new Promise(r => setTimeout(r, 1500));
    setDeploying(false);
    setDeployed(true);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">Deploy Rule</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400">Rule</p>
            <p className="text-sm font-medium text-white">{rule.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">v{rule.version}</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">Deploy to</label>
            <div className="flex gap-2">
              <button onClick={() => setScope("all")} className={`flex-1 py-2 rounded-lg text-xs border transition-colors ${scope === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                All {rule.total_tenants} tenants
              </button>
              <button onClick={() => setScope("selected")} className={`flex-1 py-2 rounded-lg text-xs border transition-colors ${scope === "selected" ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                Select tenants
              </button>
            </div>
          </div>
          {scope === "selected" && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {mockTenants.map(t => (
                <label key={t} className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750">
                  <input type="checkbox" checked={selectedTenants.includes(t)} onChange={() => setSelectedTenants(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                    className="rounded border-slate-600 bg-slate-700 text-blue-600"/>
                  <span className="text-sm text-white">{t}</span>
                </label>
              ))}
            </div>
          )}
          {rule.status === "testing" && (
            <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-lg p-3 text-xs text-yellow-300">
              ⚠️ This rule is in TESTING status with a high FP rate ({rule.false_positive_rate_avg}%). Deploying to all tenants is not recommended.
            </div>
          )}
          {deployed ? (
            <div className="bg-green-900/20 border border-green-800/40 rounded-lg p-3 text-sm text-green-400 text-center">
              ✅ Deployed to {scope === "all" ? rule.total_tenants : selectedTenants.length} tenants
            </div>
          ) : (
            <button onClick={deploy} disabled={deploying || (scope === "selected" && selectedTenants.length === 0)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors">
              {deploying ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Deploying...</> : "Deploy Now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Rule Detail Panel ────────────────────────────────────────────────────────
function RuleDetailPanel({ rule, onClose, onDeploy }: { rule: GlobalRule; onClose: () => void; onDeploy: () => void }) {
  const coveragePct = Math.round((rule.tenant_coverage / rule.total_tenants) * 100);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-700 flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900">
          <div>
            <h2 className="text-sm font-bold text-white">{rule.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">v{rule.version}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusStyle[rule.status]}`}>{rule.status}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${sevColor[rule.severity]}`}>{rule.severity}</span>
            {rule.mitre_id && (
              <span className="text-xs px-2 py-0.5 rounded font-mono text-white" style={{ backgroundColor: tacticColor[rule.mitre_tactic ?? ""] ?? "#475569" }}>
                {rule.mitre_id}
              </span>
            )}
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">{rule.description}</p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-white">{rule.hit_count_7d_total.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Total hits (7d)</p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className={`text-xl font-bold ${rule.false_positive_rate_avg > 15 ? "text-yellow-400" : "text-green-400"}`}>{rule.false_positive_rate_avg}%</p>
              <p className="text-xs text-slate-400">Avg FP rate</p>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-blue-400">{coveragePct}%</p>
              <p className="text-xs text-slate-400">Tenant coverage</p>
            </div>
          </div>

          {/* Coverage bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Deployed to {rule.tenant_coverage} of {rule.total_tenants} tenants</span>
              <span className="text-blue-400">{coveragePct}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div className="h-2 rounded-full bg-blue-500" style={{ width: `${coveragePct}%` }}/>
            </div>
          </div>

          {/* Conditions */}
          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-xs font-semibold text-white mb-2">Detection Logic</p>
            <code className="text-xs font-mono text-green-300 leading-relaxed">{rule.conditions_summary}</code>
          </div>

          {/* Test Results */}
          {rule.test_results && (
            <div className="bg-slate-800 rounded-lg p-4">
              <p className="text-xs font-semibold text-white mb-3">Test Results ({rule.test_results.tenants_tested} tenants)</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-900/60 rounded-lg flex items-center justify-center text-green-400 font-bold text-sm">{rule.test_results.passed}</div>
                  <span className="text-xs text-slate-400">Passed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-900/60 rounded-lg flex items-center justify-center text-red-400 font-bold text-sm">{rule.test_results.failed}</div>
                  <span className="text-xs text-slate-400">Issues</span>
                </div>
              </div>
            </div>
          )}

          {/* Changelog */}
          <div>
            <p className="text-xs font-semibold text-white mb-3">Changelog</p>
            <div className="space-y-3">
              {rule.changelog.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <span className="text-xs font-mono bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded border border-slate-700">{c.version}</span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-300">{c.note}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{c.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {rule.tags.map(t => <span key={t} className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">#{t}</span>)}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={onDeploy}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
              🚀 Deploy to Tenants
            </button>
            <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700 transition-colors">
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GlobalRuleLibrary() {
  const [statusFilter, setStatusFilter] = useState<RuleStatus | "">("");
  const [sevFilter, setSevFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRule, setSelectedRule] = useState<GlobalRule | null>(null);
  const [deployRule, setDeployRule] = useState<GlobalRule | null>(null);
  const [showNewRule, setShowNewRule] = useState(false);

  const { data: rules = mockRules } = useQuery<GlobalRule[]>({
    queryKey: ["global-rules"],
    queryFn: async () => { const r = await apiClient.get("/superadmin/rules"); return r.data.data; },
  });

  const filtered = rules
    .filter(r => !statusFilter || r.status === statusFilter)
    .filter(r => !sevFilter || r.severity === sevFilter)
    .filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.tags.some(t => t.includes(search.toLowerCase())) || (r.mitre_id ?? "").toLowerCase().includes(search.toLowerCase()));

  const stats = {
    published: rules.filter(r => r.status === "published").length,
    testing: rules.filter(r => r.status === "testing").length,
    draft: rules.filter(r => r.status === "draft").length,
    total_hits: rules.reduce((s, r) => s + r.hit_count_7d_total, 0),
    avg_fp: rules.filter(r => r.status === "published").length > 0
      ? (rules.filter(r => r.status === "published").reduce((s, r) => s + r.false_positive_rate_avg, 0) / rules.filter(r => r.status === "published").length).toFixed(1)
      : "0",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Global Rule Library</h1>
          <p className="text-slate-400 text-sm mt-1">Platform-wide detection rules deployed across all tenants</p>
        </div>
        <button onClick={() => setShowNewRule(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Global Rule
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Published", value: stats.published, color: "text-green-400" },
          { label: "Testing", value: stats.testing, color: "text-yellow-400" },
          { label: "Draft", value: stats.draft, color: "text-slate-400" },
          { label: "Total Hits (7d)", value: stats.total_hits.toLocaleString(), color: "text-blue-400" },
          { label: "Avg FP Rate", value: `${stats.avg_fp}%`, color: Number(stats.avg_fp) > 10 ? "text-yellow-400" : "text-green-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* MITRE Coverage Heatmap */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">MITRE ATT&CK Coverage</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(tacticColor).map(([tactic, color]) => {
            const count = rules.filter(r => r.mitre_tactic === tactic && r.status === "published").length;
            return (
              <div key={tactic} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color, opacity: count > 0 ? 1 : 0.2 }}/>
                <span className="text-xs text-white">{tactic}</span>
                <span className={`text-xs font-bold ${count > 0 ? "text-white" : "text-slate-600"}`}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search rules, tags, MITRE ID..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"/>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
          <option value="">All Status</option>
          {["published","testing","draft","deprecated"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
          <option value="">All Severity</option>
          {["critical","high","medium","low"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Rules Table */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              {["Rule","Status","Severity","MITRE","Coverage","Hits 7d","FP Rate","Updated",""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(rule => {
              const coveragePct = Math.round((rule.tenant_coverage / rule.total_tenants) * 100);
              return (
                <tr key={rule.id} className="hover:bg-slate-800/40 cursor-pointer transition-colors" onClick={() => setSelectedRule(rule)}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-white">{rule.name}</p>
                    <p className="text-xs text-slate-500">v{rule.version}</p>
                    <div className="flex gap-1 mt-1">
                      {rule.tags.slice(0, 2).map(t => <span key={t} className="text-xs bg-slate-800 text-slate-400 px-1 py-0.5 rounded">#{t}</span>)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle[rule.status]}`}>{rule.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${sevColor[rule.severity]}`}>{rule.severity}</span>
                  </td>
                  <td className="px-4 py-3">
                    {rule.mitre_id ? (
                      <span className="text-xs px-1.5 py-0.5 rounded font-mono text-white" style={{ backgroundColor: tacticColor[rule.mitre_tactic ?? ""] ?? "#475569" }}>{rule.mitre_id}</span>
                    ) : <span className="text-slate-500 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-700 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${coveragePct}%` }}/>
                      </div>
                      <span className="text-xs text-slate-300">{rule.tenant_coverage}/{rule.total_tenants}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-white">{rule.hit_count_7d_total.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${rule.false_positive_rate_avg > 15 ? "text-yellow-400" : "text-green-400"}`}>
                      {rule.false_positive_rate_avg}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(rule.last_updated)}</td>
                  <td className="px-4 py-3">
                    <button onClick={e => { e.stopPropagation(); setDeployRule(rule); }}
                      className="px-2.5 py-1 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-lg transition-colors whitespace-nowrap">
                      Deploy
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRule && (
        <RuleDetailPanel
          rule={selectedRule}
          onClose={() => setSelectedRule(null)}
          onDeploy={() => { setDeployRule(selectedRule); setSelectedRule(null); }}
        />
      )}
      {deployRule && <DeployModal rule={deployRule} onClose={() => setDeployRule(null)}/>}
    </div>
  );
}
