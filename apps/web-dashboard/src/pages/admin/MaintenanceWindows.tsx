import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type WindowStatus = "active" | "upcoming" | "completed" | "cancelled";
type RecurrenceType = "once" | "weekly" | "monthly";

interface MaintenanceWindow {
  id: string;
  name: string;
  description: string;
  status: WindowStatus;
  start_time: string;
  end_time: string;
  recurrence: RecurrenceType;
  days_of_week?: number[];
  day_of_month?: number;
  suppress_severities: string[];
  suppress_connectors: string[];
  notify_before_minutes: number;
  created_by: string;
  created_at: string;
  next_occurrence?: string;
  suppressed_count: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const now = new Date();
const mockWindows: MaintenanceWindow[] = [
  {
    id: "mw1",
    name: "Weekly Infrastructure Patching",
    description: "Automated OS and software patching across production servers every Sunday night",
    status: "upcoming",
    start_time: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16),
    end_time: new Date(Date.now() + 2 * 86400000 + 4 * 3600000).toISOString().slice(0, 16),
    recurrence: "weekly",
    days_of_week: [0],
    suppress_severities: ["low", "medium"],
    suppress_connectors: ["AWS CloudTrail", "WAF Logs"],
    notify_before_minutes: 30,
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    next_occurrence: new Date(Date.now() + 2 * 86400000).toISOString(),
    suppressed_count: 847,
  },
  {
    id: "mw2",
    name: "Database Backup Window",
    description: "Monthly full database backup — elevated I/O will trigger false storage anomaly alerts",
    status: "upcoming",
    start_time: new Date(Date.now() + 17 * 86400000).toISOString().slice(0, 16),
    end_time: new Date(Date.now() + 17 * 86400000 + 3 * 3600000).toISOString().slice(0, 16),
    recurrence: "monthly",
    day_of_month: 1,
    suppress_severities: ["low", "medium", "high"],
    suppress_connectors: ["AWS CloudTrail"],
    notify_before_minutes: 60,
    created_by: "devops@acme.com",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    next_occurrence: new Date(Date.now() + 17 * 86400000).toISOString(),
    suppressed_count: 234,
  },
  {
    id: "mw3",
    name: "Emergency DR Failover Test",
    description: "One-time disaster recovery failover test — will cause connectivity anomalies",
    status: "completed",
    start_time: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 16),
    end_time: new Date(Date.now() - 5 * 86400000 + 6 * 3600000).toISOString().slice(0, 16),
    recurrence: "once",
    suppress_severities: ["low", "medium", "high", "critical"],
    suppress_connectors: [],
    notify_before_minutes: 120,
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    suppressed_count: 1293,
  },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_CONNECTORS = ["Microsoft 365", "AWS CloudTrail", "Google Workspace", "WAF Logs", "Firewall"];

const statusStyle: Record<WindowStatus, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  upcoming: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  completed: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  cancelled: "text-red-400 bg-red-500/10 border-red-500/30",
};

const statusDot: Record<WindowStatus, string> = {
  active: "bg-green-500 animate-pulse",
  upcoming: "bg-blue-500",
  completed: "bg-slate-500",
  cancelled: "bg-red-500",
};

const sevColors: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-green-600 text-white",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "Now";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `in ${d}d ${h % 24}h`;
  return `in ${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// ─── Timeline Visual ──────────────────────────────────────────────────────────
function WindowTimeline({ windows }: { windows: MaintenanceWindow[] }) {
  const upcoming = windows.filter(w => w.status !== "completed" && w.status !== "cancelled");
  if (upcoming.length === 0) return null;

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + i * 86400000);
    return { label: i === 0 ? "Today" : DAYS[d.getDay()], date: d };
  });

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h2 className="text-sm font-semibold text-white mb-4">14-Day Maintenance Calendar</h2>
      <div className="flex gap-1">
        {days.map((day, i) => {
          const dayStart = day.date.setHours(0, 0, 0, 0);
          const dayEnd = day.date.setHours(23, 59, 59, 999);
          const hasWindow = upcoming.some(w => {
            const ws = new Date(w.start_time).getTime();
            const we = new Date(w.end_time).getTime();
            return ws <= dayEnd && we >= dayStart;
          });
          const windowsOnDay = upcoming.filter(w => {
            const ws = new Date(w.start_time).getTime();
            const we = new Date(w.end_time).getTime();
            return ws <= dayEnd && we >= dayStart;
          });

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-slate-400">{day.label}</span>
              <div className={`w-full h-8 rounded flex items-center justify-center text-xs transition-all ${
                hasWindow ? "bg-blue-600/70 text-white" : i === 0 ? "bg-slate-700 text-slate-300" : "bg-slate-800 text-slate-600"
              }`} title={windowsOnDay.map(w => w.name).join(", ")}>
                {hasWindow ? "🔧" : ""}
              </div>
              <span className="text-xs text-slate-600">{new Date(day.date).getDate()}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-600/70"/><span>Maintenance Window</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-slate-800"/><span>Normal</span></div>
      </div>
    </div>
  );
}

// ─── Window Form ──────────────────────────────────────────────────────────────
function WindowForm({ onClose, existing }: { onClose: () => void; existing?: MaintenanceWindow }) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [startTime, setStartTime] = useState(existing?.start_time ?? new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState(existing?.end_time ?? new Date(Date.now() + 86400000 + 4 * 3600000).toISOString().slice(0, 16));
  const [recurrence, setRecurrence] = useState<RecurrenceType>(existing?.recurrence ?? "once");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(existing?.days_of_week ?? [0]);
  const [dayOfMonth, setDayOfMonth] = useState(existing?.day_of_month ?? 1);
  const [suppressSev, setSuppressSev] = useState<string[]>(existing?.suppress_severities ?? ["low", "medium"]);
  const [suppressConn, setSuppressConn] = useState<string[]>(existing?.suppress_connectors ?? []);
  const [notifyBefore, setNotifyBefore] = useState(existing?.notify_before_minutes ?? 30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleDay = (d: number) => setDaysOfWeek(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
  const toggleSev = (s: string) => setSuppressSev(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleConn = (c: string) => setSuppressConn(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  const durationHours = ((new Date(endTime).getTime() - new Date(startTime).getTime()) / 3600000).toFixed(1);

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 900));
    qc.invalidateQueries({ queryKey: ["maintenance-windows"] });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">{existing ? "Edit" : "New"} Maintenance Window</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Window Name *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Weekly Infrastructure Patching"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="What maintenance is happening? Why will alerts be suppressed?"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"/>
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-white">📅 Schedule</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">End Time</label>
                <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
            </div>

            {startTime && endTime && new Date(endTime) > new Date(startTime) && (
              <p className="text-xs text-blue-400">Duration: {durationHours} hours</p>
            )}

            {/* Recurrence */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Recurrence</label>
              <div className="flex gap-2">
                {(["once", "weekly", "monthly"] as RecurrenceType[]).map(r => (
                  <button key={r} onClick={() => setRecurrence(r)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize border transition-colors ${recurrence === r ? "bg-blue-600 text-white border-blue-600" : "bg-slate-700 text-slate-400 border-slate-600 hover:text-white"}`}>
                    {r === "once" ? "One-time" : r === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            {recurrence === "weekly" && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">Repeat on</label>
                <div className="flex gap-1.5">
                  {DAYS.map((d, i) => (
                    <button key={d} onClick={() => toggleDay(i)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${daysOfWeek.includes(i) ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:text-white"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recurrence === "monthly" && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Day of Month</label>
                <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Suppression Rules */}
          <div className="bg-slate-800 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-white">🔕 Suppression Rules</p>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Suppress Alert Severities</label>
              <div className="flex gap-2">
                {["critical", "high", "medium", "low"].map(s => (
                  <button key={s} onClick={() => toggleSev(s)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all border ${
                      suppressSev.includes(s)
                        ? `${sevColors[s]} border-transparent`
                        : "bg-slate-700 text-slate-400 border-slate-600 hover:text-white"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
              {suppressSev.includes("critical") && (
                <p className="text-xs text-orange-400 mt-2">⚠️ Suppressing critical alerts means P1 incidents may go undetected during this window.</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Suppress Specific Connectors (optional)</label>
              <div className="flex flex-wrap gap-2">
                {ALL_CONNECTORS.map(c => (
                  <button key={c} onClick={() => toggleConn(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${suppressConn.includes(c) ? "bg-teal-600 text-white border-teal-600" : "bg-slate-700 text-slate-400 border-slate-600 hover:text-white"}`}>
                    {c}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">Leave blank to suppress alerts from all connectors</p>
            </div>
          </div>

          {/* Notifications */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Notify Team Before Start</label>
            <div className="flex gap-2 flex-wrap">
              {[[0,"No notice"],[15,"15 min"],[30,"30 min"],[60,"1 hour"],[120,"2 hours"]].map(([v,l]) => (
                <button key={v} onClick={() => setNotifyBefore(Number(v))}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${notifyBefore === v ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-300 mb-2">📋 Summary</p>
            <div className="space-y-1 text-xs text-slate-300">
              <p>• <strong>{name || "Unnamed window"}</strong> — {recurrence === "once" ? "one-time" : recurrence}</p>
              <p>• Starts {formatDateTime(startTime)} · Duration {durationHours}h</p>
              <p>• Suppress: <span className="text-orange-300">{suppressSev.join(", ")} severity alerts</span></p>
              {suppressConn.length > 0 && <p>• Only from: {suppressConn.join(", ")}</p>}
              {notifyBefore > 0 && <p>• Team notified {notifyBefore} min before</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !name}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Saving...</> : saved ? "✅ Saved!" : (existing ? "Save Changes" : "Create Window")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MaintenanceWindows() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editWindow, setEditWindow] = useState<MaintenanceWindow | undefined>();
  const [statusFilter, setStatusFilter] = useState<WindowStatus | "">("");

  const { data: windows = mockWindows } = useQuery<MaintenanceWindow[]>({
    queryKey: ["maintenance-windows"],
    queryFn: async () => { const r = await apiClient.get("/admin/maintenance"); return r.data.data; },
  });

  const cancelWindow = useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/admin/maintenance/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance-windows"] }),
  });

  const filtered = windows.filter(w => !statusFilter || w.status === statusFilter);

  const stats = {
    active: windows.filter(w => w.status === "active").length,
    upcoming: windows.filter(w => w.status === "upcoming").length,
    total_suppressed: windows.reduce((s, w) => s + w.suppressed_count, 0),
    completed: windows.filter(w => w.status === "completed").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Maintenance Windows</h1>
          <p className="text-slate-400 text-sm mt-1">Schedule planned downtime to suppress false-positive alerts</p>
        </div>
        <button onClick={() => { setEditWindow(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Window
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Active Now", value: stats.active, color: stats.active > 0 ? "text-green-400" : "text-slate-400" },
          { label: "Upcoming", value: stats.upcoming, color: "text-blue-400" },
          { label: "Alerts Suppressed", value: stats.total_suppressed.toLocaleString(), color: "text-teal-400" },
          { label: "Completed", value: stats.completed, color: "text-slate-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Calendar Timeline */}
      <WindowTimeline windows={windows} />

      {/* Filter */}
      <div className="flex gap-2">
        {([["", "All"], ["active", "Active"], ["upcoming", "Upcoming"], ["completed", "Completed"], ["cancelled", "Cancelled"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setStatusFilter(v as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === v ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Windows List */}
      <div className="space-y-3">
        {filtered.map(win => (
          <div key={win.id} className={`bg-slate-900 rounded-xl border p-5 transition-all ${
            win.status === "active" ? "border-green-800/50" :
            win.status === "upcoming" ? "border-blue-800/40" :
            "border-slate-800 opacity-70"
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3 flex-1">
                <div className="text-2xl flex-shrink-0">🔧</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-bold text-white">{win.name}</h3>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[win.status]}`}/>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle[win.status]}`}>{win.status}</span>
                    <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded capitalize">{win.recurrence}</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{win.description}</p>

                  {/* Time info */}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-3">
                    <span>🕐 {formatDateTime(win.start_time)}</span>
                    <span>→ {formatDateTime(win.end_time)}</span>
                    {win.status === "upcoming" && win.next_occurrence && (
                      <span className="text-blue-400">Next: {timeUntil(win.next_occurrence)}</span>
                    )}
                    {win.recurrence === "weekly" && win.days_of_week && (
                      <span>Repeats: {win.days_of_week.map(d => DAYS[d]).join(", ")}</span>
                    )}
                    {win.recurrence === "monthly" && (
                      <span>Repeats: Day {win.day_of_month} of month</span>
                    )}
                  </div>

                  {/* Suppression badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {win.suppress_severities.map(s => (
                      <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${sevColors[s]}`}>
                        🔕 {s}
                      </span>
                    ))}
                    {win.suppress_connectors.map(c => (
                      <span key={c} className="text-xs bg-teal-900/40 text-teal-300 border border-teal-800/40 px-2 py-0.5 rounded-full">
                        {c}
                      </span>
                    ))}
                    {win.suppress_connectors.length === 0 && (
                      <span className="text-xs text-slate-500">All connectors</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right side */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-4">
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total suppressed</p>
                  <p className="text-xl font-bold text-teal-400">{win.suppressed_count.toLocaleString()}</p>
                </div>
                {win.status !== "completed" && win.status !== "cancelled" && (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditWindow(win); setShowForm(true); }}
                      className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                      Edit
                    </button>
                    <button onClick={() => cancelWindow.mutate(win.id)}
                      className="px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/30 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Created by {win.created_by} · {win.notify_before_minutes > 0 ? `Team notified ${win.notify_before_minutes}min before` : "No pre-notification"}
            </div>
          </div>
        ))}
      </div>

      {showForm && <WindowForm onClose={() => setShowForm(false)} existing={editWindow} />}
    </div>
  );
}
