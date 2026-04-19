import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

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

const emptyWindows: MaintenanceWindow[] = [];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_CONNECTORS = ["Microsoft 365", "AWS CloudTrail", "Google Workspace", "WAF Logs", "Firewall"];

const severityTone: Record<string, React.CSSProperties> = {
  critical: { background: "rgba(255, 93, 122, .18)", color: "#ffb7c5", border: "1px solid rgba(255, 93, 122, .28)" },
  high: { background: "rgba(255, 181, 71, .18)", color: "#ffd89b", border: "1px solid rgba(255, 181, 71, .28)" },
  medium: { background: "rgba(33, 212, 253, .14)", color: "#8fe8ff", border: "1px solid rgba(33, 212, 253, .24)" },
  low: { background: "rgba(31, 210, 134, .14)", color: "#6ff0b2", border: "1px solid rgba(31, 210, 134, .24)" },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "Now";
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `in ${days}d ${hours % 24}h`;
  return `in ${hours}h`;
}

function choiceStyle(selected: boolean): React.CSSProperties {
  return selected
    ? {
        minHeight: "38px",
        padding: "0 12px",
        borderRadius: "10px",
        border: "none",
        background: "linear-gradient(135deg, #2f7cff, #21d4fd)",
        color: "#fff",
        fontWeight: 700,
        cursor: "pointer",
      }
    : {
        minHeight: "38px",
        padding: "0 12px",
        borderRadius: "10px",
        border: "1px solid rgba(120, 160, 255, .18)",
        background: "#0b1730",
        color: "#8fa5c7",
        fontWeight: 600,
        cursor: "pointer",
      };
}

function WindowTimeline({ windows }: { windows: MaintenanceWindow[] }) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.now() + index * 86400000);
    return { key: index, label: index === 0 ? "Today" : DAYS[date.getDay()], date };
  });

  return (
    <section className="zf-card zf-card--wide">
      <div className="zf-card-head">
        <h3 className="zf-card-title">14-Day Maintenance Calendar</h3>
        <p className="zf-card-subtitle">Visual timeline of upcoming maintenance activity</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(14, minmax(0, 1fr))", gap: "8px" }}>
        {days.map((day) => {
          const start = new Date(day.date).setHours(0, 0, 0, 0);
          const end = new Date(day.date).setHours(23, 59, 59, 999);
          const hasWindow = windows.some((window) => {
            const windowStart = new Date(window.start_time).getTime();
            const windowEnd = new Date(window.end_time).getTime();
            return window.status !== "cancelled" && windowStart <= end && windowEnd >= start;
          });

          return (
            <div key={day.key} style={{ textAlign: "center" }}>
              <div className="zf-card-subtitle" style={{ marginBottom: "6px" }}>{day.label}</div>
              <div
                style={{
                  height: "42px",
                  borderRadius: "12px",
                  background: hasWindow ? "linear-gradient(135deg, #2f7cff, #21d4fd)" : "rgba(8, 18, 37, .9)",
                  display: "grid",
                  placeItems: "center",
                  color: hasWindow ? "#fff" : "#8fa5c7",
                  fontWeight: 700,
                }}
              >
                {hasWindow ? "🔧" : new Date(day.date).getDate()}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

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

  const durationHours = ((new Date(endTime).getTime() - new Date(startTime).getTime()) / 3600000).toFixed(1);

  const toggleDay = (day: number) => setDaysOfWeek((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  const toggleSeverity = (severity: string) => setSuppressSev((current) => current.includes(severity) ? current.filter((item) => item !== severity) : [...current, severity]);
  const toggleConnector = (connector: string) => setSuppressConn((current) => current.includes(connector) ? current.filter((item) => item !== connector) : [...current, connector]);

  const save = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    qc.invalidateQueries({ queryKey: ["maintenance-windows"] });
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2, 6, 23, .78)", display: "grid", placeItems: "center", padding: "16px", zIndex: 50 }}>
      <div className="zf-card" style={{ width: "100%", maxWidth: "820px", maxHeight: "92vh", overflow: "auto" }}>
        <div className="zf-card-head">
          <h3 className="zf-card-title">{existing ? "Edit" : "Create"} Maintenance Window</h3>
          <p className="zf-card-subtitle">Suppress noisy alerts during planned operational work</p>
        </div>

        <div className="zf-section">
          <div className="zf-team-grid">
            <div className="zf-team-form">
              <div className="zf-team-field">
                <span>Window Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="zf-team-input" placeholder="Weekly Infrastructure Patching" />
              </div>
              <div className="zf-team-field">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="zf-team-input"
                  style={{ paddingTop: "12px", minHeight: "110px" }}
                  placeholder="Describe what is changing and what alerting should be muted"
                />
              </div>
            </div>

            <div className="zf-team-note">
              <span>Window Summary</span>
              <small>{formatDateTime(startTime)} → {formatDateTime(endTime)}</small>
              <small>Estimated duration: {durationHours} hours</small>
              <small>Current recurrence: {recurrence}</small>
            </div>
          </div>

          <div className="zf-grid zf-grid-2">
            <div className="zf-card">
              <div className="zf-card-head">
                <h4 className="zf-card-title">Schedule</h4>
              </div>
              <div className="zf-team-form">
                <div className="zf-team-field">
                  <span>Start</span>
                  <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="zf-team-input" />
                </div>
                <div className="zf-team-field">
                  <span>End</span>
                  <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="zf-team-input" />
                </div>
                <div className="zf-row__actions">
                  {(["once", "weekly", "monthly"] as RecurrenceType[]).map((option) => (
                    <button key={option} type="button" style={choiceStyle(recurrence === option)} onClick={() => setRecurrence(option)}>
                      {option}
                    </button>
                  ))}
                </div>
                {recurrence === "weekly" && (
                  <div className="zf-row__actions">
                    {DAYS.map((day, index) => (
                      <button key={day} type="button" style={choiceStyle(daysOfWeek.includes(index))} onClick={() => toggleDay(index)}>
                        {day}
                      </button>
                    ))}
                  </div>
                )}
                {recurrence === "monthly" && (
                  <div className="zf-team-field">
                    <span>Day of Month</span>
                    <select value={dayOfMonth} onChange={(event) => setDayOfMonth(Number(event.target.value))} className="zf-team-select">
                      {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="zf-card">
              <div className="zf-card-head">
                <h4 className="zf-card-title">Suppression Scope</h4>
              </div>
              <div className="zf-action-stack">
                <div className="zf-row__actions">
                  {["critical", "high", "medium", "low"].map((severity) => (
                    <button key={severity} type="button" style={choiceStyle(suppressSev.includes(severity))} onClick={() => toggleSeverity(severity)}>
                      {severity}
                    </button>
                  ))}
                </div>
                <div className="zf-row__actions">
                  {ALL_CONNECTORS.map((connector) => (
                    <button key={connector} type="button" style={choiceStyle(suppressConn.includes(connector))} onClick={() => toggleConnector(connector)}>
                      {connector}
                    </button>
                  ))}
                </div>
                <div className="zf-row__actions">
                  {[0, 15, 30, 60, 120].map((value) => (
                    <button key={value} type="button" style={choiceStyle(notifyBefore === value)} onClick={() => setNotifyBefore(value)}>
                      {value === 0 ? "No notice" : `${value}m notice`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} className="zf-btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving || !name} className="zf-btn-primary" style={{ flex: 1, opacity: saving || !name ? 0.65 : 1 }}>
            {saving ? "Saving…" : existing ? "Save Changes" : "Create Window"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MaintenanceWindows() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editWindow, setEditWindow] = useState<MaintenanceWindow | undefined>();
  const [statusFilter, setStatusFilter] = useState<WindowStatus | "">("");

  const { data: windows = emptyWindows } = useQuery<MaintenanceWindow[]>({
    queryKey: ["maintenance-windows"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/maintenance");
      return response.data.data;
    },
  });

  const cancelWindow = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/maintenance/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance-windows"] }),
  });

  const filtered = windows.filter((window) => !statusFilter || window.status === statusFilter);
  const stats = {
    active: windows.filter((window) => window.status === "active").length,
    upcoming: windows.filter((window) => window.status === "upcoming").length,
    completed: windows.filter((window) => window.status === "completed").length,
    suppressed: windows.reduce((sum, window) => sum + window.suppressed_count, 0),
  };

  return (
    <div className="zf-section">
      <section className="zf-card zf-card--wide">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "end", flexWrap: "wrap" }}>
          <div className="zf-section-head">
            <h2 className="zf-page-title">Maintenance Windows</h2>
            <p className="zf-page-subtitle">Schedule planned downtime and suppress false-positive alerts during operational work</p>
          </div>

          <button type="button" onClick={() => { setEditWindow(undefined); setShowForm(true); }} className="zf-btn-primary">
            New Window
          </button>
        </div>
      </section>

      <div className="zf-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {[
          { label: "Active Now", value: stats.active, tone: "#6ff0b2" },
          { label: "Upcoming", value: stats.upcoming, tone: "#8fe8ff" },
          { label: "Completed", value: stats.completed, tone: "#dbeafe" },
          { label: "Suppressed Alerts", value: stats.suppressed.toLocaleString(), tone: "#21d4fd" },
        ].map((stat) => (
          <section key={stat.label} className="zf-card">
            <p className="zf-card-subtitle">{stat.label}</p>
            <p className="zf-value" style={{ textAlign: "left", color: stat.tone, fontSize: "2rem", marginTop: "8px" }}>{stat.value}</p>
          </section>
        ))}
      </div>

      <WindowTimeline windows={windows} />

      <div className="zf-row__actions">
        {(["", "active", "upcoming", "completed", "cancelled"] as Array<WindowStatus | "">).map((filter) => (
          <button key={filter || "all"} type="button" style={choiceStyle(statusFilter === filter)} onClick={() => setStatusFilter(filter)}>
            {filter || "all"}
          </button>
        ))}
      </div>

      <div className="zf-grid" style={{ gridTemplateColumns: "1fr" }}>
        {filtered.length > 0 ? filtered.map((window) => (
          <section key={window.id} className="zf-card zf-card--wide">
            <div className="zf-card-head">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <h3 className="zf-card-title">{window.name}</h3>
                  <p className="zf-card-subtitle">{window.description}</p>
                </div>
                <span className={`zf-status-pill ${window.status === "active" ? "is-success" : window.status === "upcoming" ? "is-warning" : window.status === "cancelled" ? "is-danger" : ""}`}>
                  {window.status}
                </span>
              </div>
            </div>

            <div className="zf-detail-list">
              <div className="zf-detail-row">
                <span className="zf-label">Timing</span>
                <span className="zf-value">{formatDateTime(window.start_time)} → {formatDateTime(window.end_time)}</span>
              </div>
              <div className="zf-detail-row">
                <span className="zf-label">Recurrence</span>
                <span className="zf-value">
                  {window.recurrence}
                  {window.next_occurrence ? ` · ${timeUntil(window.next_occurrence)}` : ""}
                </span>
              </div>
              <div className="zf-detail-row">
                <span className="zf-label">Suppressed Alerts</span>
                <span className="zf-value">{window.suppressed_count.toLocaleString()}</span>
              </div>
            </div>

            <div className="zf-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {window.suppress_severities.map((severity) => (
                  <span key={severity} className="zf-badge" style={severityTone[severity]}>
                    {severity}
                  </span>
                ))}
                {(window.suppress_connectors.length > 0 ? window.suppress_connectors : ["All connectors"]).map((connector) => (
                  <span key={connector} className="zf-badge" style={{ background: "rgba(33,212,253,.12)", color: "#8fe8ff", border: "1px solid rgba(33,212,253,.24)" }}>
                    {connector}
                  </span>
                ))}
              </div>

              {window.status !== "completed" && window.status !== "cancelled" && (
                <div className="zf-row__actions">
                  <button type="button" onClick={() => { setEditWindow(window); setShowForm(true); }} className="zf-btn-secondary">
                    Edit
                  </button>
                  <button type="button" onClick={() => cancelWindow.mutate(window.id)} className="zf-btn-secondary">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        )) : (
          <section className="zf-card zf-card--wide">
            <div className="zf-card-head">
              <h3 className="zf-card-title">No maintenance windows scheduled</h3>
              <p className="zf-card-subtitle">Create a planned downtime window to suppress noisy alerts during patching, backups, or failover testing.</p>
            </div>
          </section>
        )}
      </div>

      {showForm && <WindowForm onClose={() => setShowForm(false)} existing={editWindow} />}
    </div>
  );
}
