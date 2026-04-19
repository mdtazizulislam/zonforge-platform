import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type SuppressionType = "rule" | "entity" | "ip" | "time_window" | "maintenance";

interface SuppressionRule {
  id: string;
  name: string;
  type: SuppressionType;
  reason: string;
  conditions: {
    rule_id?: string;
    rule_name?: string;
    entity_type?: "user" | "asset" | "ip";
    entity_value?: string;
    ip_range?: string;
    time_start?: string;
    time_end?: string;
    days_of_week?: number[];
    severity?: string[];
  };
  expires_at?: string;
  is_permanent: boolean;
  created_by: string;
  created_at: string;
  suppressed_count: number;
  active: boolean;
}

interface RuleTuning {
  rule_id: string;
  rule_name: string;
  severity: string;
  current_threshold: number;
  suggested_threshold: number;
  hit_count_7d: number;
  false_positive_count_7d: number;
  false_positive_rate: number;
  analyst_feedback: { tp: number; fp: number };
  suggestion: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockSuppressions: SuppressionRule[] = [
  {
    id: "s1", name: "Suppress scanner IP alerts", type: "ip",
    reason: "Internal vulnerability scanner generates false positive alerts",
    conditions: { ip_range: "10.0.100.0/24", severity: ["low", "medium"] },
    is_permanent: true, created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    suppressed_count: 847, active: true,
  },
  {
    id: "s2", name: "Weekend maintenance window", type: "maintenance",
    reason: "Scheduled maintenance every Saturday 01:00–05:00 UTC",
    conditions: { days_of_week: [6], time_start: "01:00", time_end: "05:00", severity: ["low", "medium", "high"] },
    is_permanent: true, created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    suppressed_count: 234, active: true,
  },
  {
    id: "s3", name: "Suppress john.smith brute-force rule", type: "entity",
    reason: "User confirmed as legitimate — works from multiple countries",
    conditions: { rule_name: "Impossible Travel Login", entity_type: "user", entity_value: "john.smith@acme.com" },
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    is_permanent: false, created_by: "analyst@acme.com",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    suppressed_count: 12, active: true,
  },
  {
    id: "s4", name: "Bulk API Token rule — adjust threshold", type: "rule",
    reason: "Rule threshold too low for CI/CD pipeline usage",
    conditions: { rule_name: "Bulk API Token Usage", severity: ["medium"] },
    expires_at: new Date(Date.now() - 86400000).toISOString(),
    is_permanent: false, created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    suppressed_count: 56, active: false,
  },
];

const mockTuning: RuleTuning[] = [
  {
    rule_id: "r2", rule_name: "Impossible Travel Login", severity: "high",
    current_threshold: 1, suggested_threshold: 1,
    hit_count_7d: 7, false_positive_count_7d: 3,
    false_positive_rate: 42.8,
    analyst_feedback: { tp: 4, fp: 3 },
    suggestion: "High false positive rate (42.8%). Consider adding trusted country list or increasing geo distance threshold from 500km to 800km.",
  },
  {
    rule_id: "r4", rule_name: "Bulk API Token Usage", severity: "medium",
    current_threshold: 500, suggested_threshold: 1000,
    hit_count_7d: 14, false_positive_count_7d: 8,
    false_positive_rate: 57.1,
    analyst_feedback: { tp: 6, fp: 8 },
    suggestion: "CI/CD pipeline triggers this rule regularly. Suggest raising threshold to 1,000 req/10min or adding pipeline service account to entity safe list.",
  },
  {
    rule_id: "r1", rule_name: "Brute-Force to Successful Login", severity: "high",
    current_threshold: 10, suggested_threshold: 10,
    hit_count_7d: 23, false_positive_count_7d: 1,
    false_positive_rate: 4.3,
    analyst_feedback: { tp: 22, fp: 1 },
    suggestion: "Rule is well-tuned. Low false positive rate. No changes recommended.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const typeIcon: Record<SuppressionType, string> = {
  rule: "📋", entity: "👤", ip: "🌐", time_window: "🕐", maintenance: "🔧",
};
const typeLabel: Record<SuppressionType, string> = {
  rule: "Rule-based", entity: "Entity", ip: "IP Range", time_window: "Time Window", maintenance: "Maintenance Window",
};
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function timeUntil(iso: string) {
  const d = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  return `In ${d}d`;
}

// ─── New Suppression Form ─────────────────────────────────────────────────────
function SuppressionForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<SuppressionType>("ip");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [ipRange, setIpRange] = useState("");
  const [entityType, setEntityType] = useState<"user" | "asset" | "ip">("user");
  const [entityValue, setEntityValue] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [timeStart, setTimeStart] = useState("00:00");
  const [timeEnd, setTimeEnd] = useState("06:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([6]);
  const [severities, setSeverities] = useState<string[]>(["low", "medium"]);
  const [isPermanent, setIsPermanent] = useState(true);
  const [expiresIn, setExpiresIn] = useState("7");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleDay = (d: number) => setDaysOfWeek(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const toggleSev = (s: string) => setSeverities(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    qc.invalidateQueries({ queryKey: ["suppressions"] });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">New Suppression Rule</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Suppression Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["ip","entity","rule","maintenance","time_window"] as SuppressionType[]).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${type === t ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"}`}>
                  <span>{typeIcon[t]}</span><span>{typeLabel[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Suppression Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Suppress scanner IP range"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Reason (for audit log) *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="Why is this suppression necessary?"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
          </div>

          {/* Type-specific fields */}
          {type === "ip" && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">IP Range (CIDR)</label>
              <input value={ipRange} onChange={e => setIpRange(e.target.value)} placeholder="10.0.100.0/24 or 192.168.1.42"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          )}
          {type === "entity" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Entity Type</label>
                <select value={entityType} onChange={e => setEntityType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
                  <option value="user">User</option>
                  <option value="asset">Asset</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Entity Value</label>
                <input value={entityValue} onChange={e => setEntityValue(e.target.value)} placeholder="user@domain.com or asset-name"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Specific Rule (optional — leave blank for all rules)</label>
                <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. Impossible Travel Login"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>
          )}
          {type === "rule" && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Detection Rule Name</label>
              <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Brute-Force to Successful Login"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          )}
          {(type === "maintenance" || type === "time_window") && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Time (UTC)</label>
                  <input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">End Time (UTC)</label>
                  <input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none"/>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Days of Week</label>
                <div className="flex gap-1.5">
                  {dayNames.map((d, i) => (
                    <button key={d} onClick={() => toggleDay(i)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${daysOfWeek.includes(i) ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Severity filter */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Apply to severities</label>
            <div className="flex gap-2">
              {["critical","high","medium","low"].map(s => (
                <button key={s} onClick={() => toggleSev(s)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border ${
                    severities.includes(s)
                      ? s === "critical" ? "bg-red-600 text-white border-red-600"
                        : s === "high" ? "bg-orange-600 text-white border-orange-600"
                        : s === "medium" ? "bg-yellow-600 text-black border-yellow-600"
                        : "bg-green-600 text-white border-green-600"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Duration</label>
            <div className="flex gap-2">
              <button onClick={() => setIsPermanent(true)} className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${isPermanent ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700"}`}>Permanent</button>
              <button onClick={() => setIsPermanent(false)} className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${!isPermanent ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700"}`}>Temporary</button>
            </div>
            {!isPermanent && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-400">Expires in</span>
                <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
                  {["1","3","7","14","30","90"].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !name || !reason}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Saving...</> : saved ? "✅ Saved!" : "Create Suppression"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AlertTuning() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"suppressions" | "tuning">("suppressions");
  const [showForm, setShowForm] = useState(false);
  const [applyingTuning, setApplyingTuning] = useState<string | null>(null);
  const [appliedTunings, setAppliedTunings] = useState<string[]>([]);

  const { data: suppressions = mockSuppressions } = useQuery<SuppressionRule[]>({
    queryKey: ["suppressions"],
    queryFn: async () => { const r = await apiClient.get("/admin/suppressions"); return r.data.data; },
  });

  const { data: tunings = mockTuning } = useQuery<RuleTuning[]>({
    queryKey: ["rule-tunings"],
    queryFn: async () => { const r = await apiClient.get("/admin/rules/tuning-suggestions"); return r.data.data; },
  });

  const toggleSuppression = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await apiClient.patch(`/admin/suppressions/${id}`, { active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppressions"] }),
  });

  const applyTuning = async (ruleId: string) => {
    setApplyingTuning(ruleId);
    await new Promise(r => setTimeout(r, 1000));
    setApplyingTuning(null);
    setAppliedTunings(prev => [...prev, ruleId]);
  };

  const stats = {
    active: suppressions.filter(s => s.active).length,
    total_suppressed: suppressions.reduce((sum, s) => sum + s.suppressed_count, 0),
    high_fp_rules: tunings.filter(t => t.false_positive_rate > 20).length,
    maintenance: suppressions.filter(s => s.type === "maintenance" && s.active).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alert Suppression & Tuning</h1>
          <p className="text-slate-400 text-sm mt-1">Reduce noise without missing real threats</p>
        </div>
        {tab === "suppressions" && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Add Suppression
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Active Suppressions", value: stats.active, color: "text-blue-400" },
          { label: "Alerts Suppressed", value: stats.total_suppressed.toLocaleString(), color: "text-teal-400" },
          { label: "High FP Rules", value: stats.high_fp_rules, color: stats.high_fp_rules > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Maintenance Windows", value: stats.maintenance, color: "text-slate-300" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        <button onClick={() => setTab("suppressions")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "suppressions" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
          🔕 Suppressions ({suppressions.filter(s => s.active).length} active)
        </button>
        <button onClick={() => setTab("tuning")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "tuning" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
          🎛️ Tuning Suggestions ({tunings.filter(t => t.false_positive_rate > 10).length} flagged)
        </button>
      </div>

      {/* ── SUPPRESSIONS TAB ── */}
      {tab === "suppressions" && (
        <div className="space-y-3">
          {suppressions.map(sup => (
            <div key={sup.id} className={`bg-slate-900 rounded-xl border p-5 transition-all ${sup.active ? "border-slate-800" : "border-slate-800 opacity-60"}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-xl flex-shrink-0">{typeIcon[sup.type]}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-semibold text-white">{sup.name}</p>
                      <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{typeLabel[sup.type]}</span>
                      {!sup.active && <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">Inactive</span>}
                      {sup.expires_at && new Date(sup.expires_at) < new Date() && <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded">Expired</span>}
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{sup.reason}</p>

                    {/* Condition summary */}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {sup.conditions.ip_range && <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">IP: {sup.conditions.ip_range}</span>}
                      {sup.conditions.entity_value && <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded">Entity: {sup.conditions.entity_value}</span>}
                      {sup.conditions.rule_name && <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded">Rule: {sup.conditions.rule_name}</span>}
                      {sup.conditions.days_of_week && <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded">{sup.conditions.days_of_week.map(d => dayNames[d]).join(", ")} {sup.conditions.time_start}–{sup.conditions.time_end} UTC</span>}
                      {sup.conditions.severity && <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded">Sev: {sup.conditions.severity.join(", ")}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Suppressed</p>
                    <p className="text-lg font-bold text-teal-400">{sup.suppressed_count.toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => toggleSuppression.mutate({ id: sup.id, active: !sup.active })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sup.active ? "bg-blue-600" : "bg-slate-600"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sup.active ? "translate-x-6" : "translate-x-1"}`}/>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>By {sup.created_by}</span>
                <span>·</span>
                <span>Created {timeAgo(sup.created_at)}</span>
                {sup.expires_at && <><span>·</span><span className={new Date(sup.expires_at) < new Date() ? "text-red-400" : "text-slate-400"}>Expires {timeUntil(sup.expires_at)}</span></>}
                {sup.is_permanent && <><span>·</span><span>Permanent</span></>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TUNING SUGGESTIONS TAB ── */}
      {tab === "tuning" && (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-4 text-sm text-blue-300">
            💡 These suggestions are based on analyst feedback (true positive / false positive votes) collected over the last 30 days. Apply with care.
          </div>
          {tunings.map(t => (
            <div key={t.rule_id} className={`bg-slate-900 rounded-xl border p-5 ${t.false_positive_rate > 20 ? "border-yellow-800/40" : "border-slate-800"}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-white">{t.rule_name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${t.severity === "high" ? "text-orange-400 bg-orange-500/10 border-orange-500/30" : "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"}`}>{t.severity}</span>
                    {t.false_positive_rate > 20 && <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded border border-yellow-800/40">⚠ High FP Rate</span>}
                    {appliedTunings.includes(t.rule_id) && <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded">✅ Applied</span>}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Hits (7d)", value: t.hit_count_7d, color: "text-white" },
                  { label: "False Positives", value: t.false_positive_count_7d, color: t.false_positive_count_7d > 0 ? "text-red-400" : "text-green-400" },
                  { label: "FP Rate", value: `${t.false_positive_rate}%`, color: t.false_positive_rate > 20 ? "text-yellow-400" : "text-green-400" },
                  { label: "Analyst Votes", value: `${t.analyst_feedback.tp}✓ ${t.analyst_feedback.fp}✗`, color: "text-slate-300" },
                ].map((s, i) => (
                  <div key={i} className="bg-slate-800 rounded-lg p-3 text-center">
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* FP Rate bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">False Positive Rate</span>
                  <span className={t.false_positive_rate > 20 ? "text-yellow-400" : "text-green-400"}>{t.false_positive_rate}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div className={`h-2 rounded-full ${t.false_positive_rate > 40 ? "bg-red-500" : t.false_positive_rate > 20 ? "bg-yellow-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min(t.false_positive_rate, 100)}%` }}/>
                </div>
              </div>

              {/* Suggestion */}
              <div className="bg-slate-800 rounded-lg p-3 mb-4 border border-slate-700">
                <p className="text-xs font-semibold text-white mb-1">💡 AI Suggestion</p>
                <p className="text-xs text-slate-300">{t.suggestion}</p>
              </div>

              {/* Threshold comparison */}
              {t.current_threshold !== t.suggested_threshold && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-slate-800 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-slate-400">Current Threshold</p>
                    <p className="text-lg font-bold text-white">{t.current_threshold}</p>
                  </div>
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                  <div className="bg-blue-900/30 border border-blue-800/40 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-blue-400">Suggested Threshold</p>
                    <p className="text-lg font-bold text-blue-300">{t.suggested_threshold}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {!appliedTunings.includes(t.rule_id) && t.current_threshold !== t.suggested_threshold && (
                  <button onClick={() => applyTuning(t.rule_id)} disabled={applyingTuning === t.rule_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-lg transition-colors disabled:opacity-50">
                    {applyingTuning === t.rule_id ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-300"/>Applying...</> : "✓ Apply Suggested Threshold"}
                  </button>
                )}
                <button onClick={() => setShowForm(true)}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                  + Add Suppression for this Rule
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <SuppressionForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
