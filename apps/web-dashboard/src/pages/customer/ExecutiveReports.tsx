import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReportSchedule {
  id: string;
  name: string;
  frequency: "weekly" | "monthly" | "quarterly";
  day_of_week?: number;
  day_of_month?: number;
  recipients: string[];
  sections: string[];
  branding: { logo_url?: string; company_name: string; accent_color: string };
  last_sent?: string;
  next_send: string;
  status: "active" | "paused";
}

interface ReportHistory {
  id: string;
  name: string;
  generated_at: string;
  period: string;
  pages: number;
  size_kb: number;
  recipients_sent: number;
  download_url: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockSchedules: ReportSchedule[] = [
  {
    id: "s1", name: "Weekly CISO Security Briefing",
    frequency: "weekly", day_of_week: 1,
    recipients: ["ciso@acme.com", "vp-engineering@acme.com"],
    sections: ["risk_summary", "top_alerts", "top_risk_users", "connector_health", "compliance_snapshot"],
    branding: { company_name: "Acme Corporation", accent_color: "#2563EB" },
    last_sent: new Date(Date.now() - 7 * 86400000).toISOString(),
    next_send: new Date(Date.now() + 3 * 86400000).toISOString(),
    status: "active",
  },
  {
    id: "s2", name: "Monthly Board Security Report",
    frequency: "monthly", day_of_month: 1,
    recipients: ["ceo@acme.com", "cfo@acme.com", "board@acme.com"],
    sections: ["risk_summary", "compliance_snapshot", "vulnerability_summary", "incident_summary", "trend_analysis"],
    branding: { company_name: "Acme Corporation", accent_color: "#0D9488" },
    last_sent: new Date(Date.now() - 30 * 86400000).toISOString(),
    next_send: new Date(Date.now() + 17 * 86400000).toISOString(),
    status: "active",
  },
];

const mockHistory: ReportHistory[] = [
  { id: "r1", name: "Weekly CISO Security Briefing", generated_at: new Date(Date.now() - 7 * 86400000).toISOString(), period: "Apr 1–7, 2026", pages: 8, size_kb: 847, recipients_sent: 2, download_url: "#" },
  { id: "r2", name: "Weekly CISO Security Briefing", generated_at: new Date(Date.now() - 14 * 86400000).toISOString(), period: "Mar 25–31, 2026", pages: 7, size_kb: 792, recipients_sent: 2, download_url: "#" },
  { id: "r3", name: "Monthly Board Security Report", generated_at: new Date(Date.now() - 30 * 86400000).toISOString(), period: "March 2026", pages: 14, size_kb: 1840, recipients_sent: 3, download_url: "#" },
  { id: "r4", name: "Weekly CISO Security Briefing", generated_at: new Date(Date.now() - 21 * 86400000).toISOString(), period: "Mar 18–24, 2026", pages: 8, size_kb: 821, recipients_sent: 2, download_url: "#" },
];

const availableSections = [
  { id: "risk_summary", label: "Organization Risk Summary", description: "Overall risk score, trend, and severity breakdown", icon: "📊" },
  { id: "top_alerts", label: "Top Alerts This Period", description: "P1 and P2 alerts with brief descriptions", icon: "🚨" },
  { id: "top_risk_users", label: "Top Risk Users", description: "Highest-risk user identities with scores", icon: "👤" },
  { id: "top_risk_assets", label: "Top Risk Assets", description: "Critical and internet-facing assets with risk scores", icon: "🖥️" },
  { id: "connector_health", label: "Connector Health Summary", description: "Data source status and event volumes", icon: "🔌" },
  { id: "compliance_snapshot", label: "Compliance Posture Snapshot", description: "SOC 2, ISO 27001, NIST CSF coverage percentages", icon: "✅" },
  { id: "vulnerability_summary", label: "Vulnerability Summary", description: "Critical and high CVE counts by asset", icon: "🔓" },
  { id: "incident_summary", label: "Incident Summary", description: "Resolved incidents and mean time to detect", icon: "🛡️" },
  { id: "trend_analysis", label: "Trend Analysis", description: "Alert volume and risk score trends over time", icon: "📈" },
  { id: "recommendations", label: "AI Recommendations", description: "Top 5 actionable security improvements", icon: "🤖" },
];

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function timeUntil(iso: string) {
  const d = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

// ─── Report Preview Component ─────────────────────────────────────────────────
function ReportPreview({ schedule }: { schedule: ReportSchedule }) {
  return (
    <div className="bg-white rounded-xl shadow-2xl overflow-hidden" style={{ fontFamily: "Georgia, serif" }}>
      {/* Header */}
      <div style={{ backgroundColor: schedule.branding.accent_color }} className="p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80 uppercase tracking-wider">Security Intelligence Report</p>
            <h1 className="text-2xl font-bold mt-1">{schedule.branding.company_name}</h1>
            <p className="text-sm opacity-80 mt-1">Generated by ZonForge Sentinel · {new Date().toLocaleDateString()}</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">42</div>
            <div className="text-sm opacity-80">Risk Score</div>
          </div>
        </div>
      </div>

      {/* Body preview */}
      <div className="p-6 space-y-4 bg-gray-50">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <h2 className="text-sm font-bold text-gray-800 mb-2">📊 Executive Summary</h2>
          <p className="text-xs text-gray-600">This week your organization maintained a <strong>MEDIUM</strong> risk posture with an overall score of 42/100. 3 critical alerts were raised, of which 2 are resolved. Key concern: prod-api-server-01 has an unpatched CVSS 9.8 vulnerability with active suspicious login events.</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[["17", "Open Alerts", "#ef4444"], ["3", "Critical", "#dc2626"], ["87%", "Connectors Healthy", "#16a34a"]].map(([v, l, c]: any) => (
            <div key={l} className="bg-white rounded-lg p-3 border border-gray-200 text-center">
              <p className="text-2xl font-bold" style={{ color: c }}>{v}</p>
              <p className="text-xs text-gray-500 mt-1">{l}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <h2 className="text-sm font-bold text-gray-800 mb-2">🚨 Top Alerts This Period</h2>
          <div className="space-y-1">
            {[
              ["P1", "Brute-Force to Successful Login", "john.smith@acme.com"],
              ["P2", "Impossible Travel Login", "jane.doe@acme.com"],
              ["P2", "Dormant Admin Account Active", "admin@acme.com"],
            ].map(([p, t, u]) => (
              <div key={t} className="flex items-center gap-2 text-xs text-gray-600">
                <span className={`px-1.5 py-0.5 rounded text-white text-xs font-bold ${p === "P1" ? "bg-red-500" : "bg-orange-500"}`}>{p}</span>
                <span className="flex-1">{t}</span>
                <span className="text-gray-400">{u}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-center text-xs text-gray-400 italic">
          — Preview · Full report includes {schedule.sections.length} sections, charts, and detailed findings —
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Form ────────────────────────────────────────────────────────────
function ScheduleForm({ onClose, existing }: { onClose: () => void; existing?: ReportSchedule }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "quarterly">(existing?.frequency ?? "weekly");
  const [dayOfWeek, setDayOfWeek] = useState(existing?.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(existing?.day_of_month ?? 1);
  const [recipients, setRecipients] = useState(existing?.recipients.join(", ") ?? "");
  const [sections, setSections] = useState<string[]>(existing?.sections ?? ["risk_summary", "top_alerts", "connector_health"]);
  const [companyName, setCompanyName] = useState(existing?.branding.company_name ?? "");
  const [accentColor, setAccentColor] = useState(existing?.branding.accent_color ?? "#2563EB");
  const [tab, setTab] = useState<"general" | "sections" | "branding">("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleSection = (id: string) =>
    setSections(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">
            {existing ? "Edit Report Schedule" : "New Report Schedule"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-slate-800">
          {(["general", "sections", "branding"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${tab === t ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
              {t === "general" ? "⚙️ General" : t === "sections" ? "📄 Sections" : "🎨 Branding"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* General Tab */}
          {tab === "general" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Report Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Weekly CISO Security Briefing"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Frequency</label>
                <div className="flex gap-2">
                  {(["weekly", "monthly", "quarterly"] as const).map(f => (
                    <button key={f} onClick={() => setFrequency(f)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${frequency === f ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {frequency === "weekly" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Send Every</label>
                  <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {frequency === "monthly" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Day of Month</label>
                  <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Recipients (comma-separated emails)</label>
                <textarea value={recipients} onChange={e => setRecipients(e.target.value)}
                  rows={2} placeholder="ciso@company.com, vp@company.com"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          )}

          {/* Sections Tab */}
          {tab === "sections" && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 mb-3">Select sections to include in the report ({sections.length} selected)</p>
              {availableSections.map(s => (
                <label key={s.id} className="flex items-start gap-3 p-3 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750 transition-colors border border-transparent hover:border-slate-600">
                  <input type="checkbox" checked={sections.includes(s.id)} onChange={() => toggleSection(s.id)}
                    className="mt-0.5 rounded border-slate-600 bg-slate-700 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-white">{s.icon} {s.label}</p>
                    <p className="text-xs text-slate-400">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Branding Tab */}
          {tab === "branding" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Company Name (appears in report header)</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                  placeholder="Acme Corporation"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Accent Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                    className="w-12 h-10 rounded-lg border border-slate-700 bg-slate-800 cursor-pointer" />
                  <input value={accentColor} onChange={e => setAccentColor(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex gap-2">
                    {["#2563EB", "#0D9488", "#7C3AED", "#DC2626", "#D97706"].map(c => (
                      <button key={c} onClick={() => setAccentColor(c)}
                        className="w-7 h-7 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: accentColor === c ? "white" : "transparent" }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Mini Preview */}
              <div>
                <p className="text-xs text-slate-400 mb-2">Header Preview:</p>
                <div className="rounded-lg overflow-hidden">
                  <div style={{ backgroundColor: accentColor }} className="p-4 text-white">
                    <p className="text-xs opacity-70 uppercase tracking-wider">Security Intelligence Report</p>
                    <p className="text-lg font-bold">{companyName || "Your Company"}</p>
                    <p className="text-xs opacity-70">Generated by ZonForge Sentinel</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !name}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving...</> :
              saved ? "✅ Saved!" : (existing ? "Save Changes" : "Create Schedule")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ExecutiveReports() {
  const [tab, setTab] = useState<"schedules" | "history" | "preview">("schedules");
  const [showForm, setShowForm] = useState(false);
  const [editSchedule, setEditSchedule] = useState<ReportSchedule | undefined>();
  const [previewSchedule, setPreviewSchedule] = useState<ReportSchedule>(mockSchedules[0]);
  const [generating, setGenerating] = useState<string | null>(null);

  const { data: schedules = mockSchedules } = useQuery<ReportSchedule[]>({
    queryKey: ["report-schedules"],
    queryFn: async () => { const r = await apiClient.get("/reports/schedules"); return r.data.data; },
  });

  const { data: history = mockHistory } = useQuery<ReportHistory[]>({
    queryKey: ["report-history"],
    queryFn: async () => { const r = await apiClient.get("/reports/history"); return r.data.data; },
  });

  const generateNow = async (scheduleId: string) => {
    setGenerating(scheduleId);
    await new Promise(r => setTimeout(r, 2000));
    setGenerating(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Executive Reports</h1>
          <p className="text-slate-400 text-sm mt-1">Scheduled PDF security reports for leadership and board</p>
        </div>
        <button onClick={() => { setEditSchedule(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Report Schedule
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        {([
          { id: "schedules", label: "📅 Schedules" },
          { id: "history", label: "📋 History" },
          { id: "preview", label: "👁 Preview" },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SCHEDULES TAB ── */}
      {tab === "schedules" && (
        <div className="space-y-4">
          {schedules.map(s => (
            <div key={s.id} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-white">{s.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {s.frequency === "weekly" ? `Every ${days[s.day_of_week ?? 1]}` :
                      s.frequency === "monthly" ? `Monthly on day ${s.day_of_month}` : "Quarterly"} ·{" "}
                    {s.recipients.length} recipient{s.recipients.length > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Next send</p>
                  <p className="text-sm font-medium text-white">{timeUntil(s.next_send)}</p>
                </div>
              </div>

              {/* Section badges */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {s.sections.map(sec => {
                  const found = availableSections.find(a => a.id === sec);
                  return found ? (
                    <span key={sec} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                      {found.icon} {found.label}
                    </span>
                  ) : null;
                })}
              </div>

              {/* Recipients */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {s.recipients.map(r => (
                  <span key={r} className="text-xs bg-blue-900/30 text-blue-300 border border-blue-800/40 px-2 py-0.5 rounded-full">
                    ✉ {r}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={() => generateNow(s.id)} disabled={generating === s.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-lg transition-colors disabled:opacity-50">
                  {generating === s.id ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-300" />Generating...</> : "⚡ Generate Now"}
                </button>
                <button onClick={() => { setPreviewSchedule(s); setTab("preview"); }}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                  👁 Preview
                </button>
                <button onClick={() => { setEditSchedule(s); setShowForm(true); }}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                  ✏️ Edit
                </button>
                {s.last_sent && (
                  <span className="ml-auto text-xs text-slate-500 self-center">Last sent {timeAgo(s.last_sent)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {["Report", "Period", "Generated", "Pages", "Size", "Recipients", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {history.map(r => (
                <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">{r.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{r.period}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(r.generated_at)}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{r.pages}pp</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{r.size_kb}KB</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{r.recipients_sent} sent</td>
                  <td className="px-4 py-3">
                    <a href={r.download_url}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PREVIEW TAB ── */}
      {tab === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-400">Previewing:</p>
            <select
              value={previewSchedule.id}
              onChange={e => setPreviewSchedule(schedules.find(s => s.id === e.target.value) ?? schedules[0])}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none">
              {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="max-w-2xl mx-auto">
            <ReportPreview schedule={previewSchedule} />
          </div>
        </div>
      )}

      {/* Schedule Form Modal */}
      {showForm && (
        <ScheduleForm
          onClose={() => setShowForm(false)}
          existing={editSchedule}
        />
      )}
    </div>
  );
}
