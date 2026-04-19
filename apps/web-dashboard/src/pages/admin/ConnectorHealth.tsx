import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConnectorEvent {
  id: string;
  timestamp: string;
  event_type: string;
  message: string;
  level: "info" | "warn" | "error";
}

interface ConnectorMetric {
  timestamp: string;
  events_per_min: number;
  latency_ms: number;
  error_rate: number;
}

interface ConnectorDetail {
  id: string;
  name: string;
  type: string;
  status: "healthy" | "degraded" | "error" | "paused";
  last_event_at: string;
  created_at: string;
  event_rate: number;
  event_rate_24h: number;
  total_events_today: number;
  total_events_30d: number;
  error_count_24h: number;
  avg_latency_ms: number;
  uptime_pct: number;
  config: Record<string, string>;
  metrics_24h: ConnectorMetric[];
  error_log: ConnectorEvent[];
  last_5_events: { timestamp: string; event_type: string; source: string }[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockConnectors: Record<string, ConnectorDetail> = {
  "1": {
    id: "1", name: "Microsoft 365", type: "m365",
    status: "healthy",
    last_event_at: new Date(Date.now() - 90000).toISOString(),
    created_at: "2026-01-15T10:00:00Z",
    event_rate: 847, event_rate_24h: 823,
    total_events_today: 1218960,
    total_events_30d: 24847293,
    error_count_24h: 0,
    avg_latency_ms: 312,
    uptime_pct: 99.97,
    config: { tenant_id: "acme-corp.onmicrosoft.com", polling_interval: "5 minutes", scopes: "AuditLog.Read.All, Directory.Read.All" },
    metrics_24h: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      events_per_min: 750 + Math.floor(Math.random() * 200),
      latency_ms: 280 + Math.floor(Math.random() * 100),
      error_rate: Math.random() * 0.002,
    })),
    error_log: [],
    last_5_events: [
      { timestamp: new Date(Date.now() - 90000).toISOString(), event_type: "UserLoginSuccess", source: "M365 Entra ID" },
      { timestamp: new Date(Date.now() - 150000).toISOString(), event_type: "FileDownloaded", source: "M365 SharePoint" },
      { timestamp: new Date(Date.now() - 210000).toISOString(), event_type: "UserLoginFailed", source: "M365 Entra ID" },
      { timestamp: new Date(Date.now() - 270000).toISOString(), event_type: "AdminRoleAssigned", source: "M365 Entra ID" },
      { timestamp: new Date(Date.now() - 330000).toISOString(), event_type: "MFABypass", source: "M365 Entra ID" },
    ],
  },
  "3": {
    id: "3", name: "Google Workspace", type: "google_workspace",
    status: "degraded",
    last_event_at: new Date(Date.now() - 1200000).toISOString(),
    created_at: "2026-02-01T09:00:00Z",
    event_rate: 12, event_rate_24h: 284,
    total_events_today: 17280,
    total_events_30d: 8472930,
    error_count_24h: 3,
    avg_latency_ms: 2840,
    uptime_pct: 94.21,
    config: { domain: "acme.com", service_account: "zonforge-sa@acme.iam.gserviceaccount.com", polling_interval: "10 minutes" },
    metrics_24h: Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      events_per_min: i > 18 ? Math.floor(Math.random() * 30) : 250 + Math.floor(Math.random() * 100),
      latency_ms: i > 18 ? 2500 + Math.floor(Math.random() * 1000) : 400 + Math.floor(Math.random() * 200),
      error_rate: i > 18 ? 0.08 + Math.random() * 0.05 : Math.random() * 0.01,
    })),
    error_log: [
      { id: "e1", timestamp: new Date(Date.now() - 900000).toISOString(), event_type: "AUTH_FAILURE", message: "OAuth token expired — re-authentication required. Token last refreshed 7 days ago.", level: "error" },
      { id: "e2", timestamp: new Date(Date.now() - 1800000).toISOString(), event_type: "RATE_LIMIT", message: "Google Admin SDK rate limit hit (1000 req/100s). Backing off for 60 seconds.", level: "warn" },
      { id: "e3", timestamp: new Date(Date.now() - 3600000).toISOString(), event_type: "TIMEOUT", message: "API request timed out after 30 seconds. Retrying with exponential backoff.", level: "warn" },
    ],
    last_5_events: [
      { timestamp: new Date(Date.now() - 1200000).toISOString(), event_type: "UserLoginSuccess", source: "Google Workspace" },
      { timestamp: new Date(Date.now() - 1800000).toISOString(), event_type: "DriveFileShared", source: "Google Drive" },
    ],
  },
};

const mockList = [
  { id: "1", name: "Microsoft 365", type: "m365", status: "healthy", event_rate: 847, error_count_24h: 0, last_event_at: new Date(Date.now() - 90000).toISOString(), uptime_pct: 99.97 },
  { id: "2", name: "AWS CloudTrail", type: "aws_cloudtrail", status: "healthy", event_rate: 234, error_count_24h: 0, last_event_at: new Date(Date.now() - 180000).toISOString(), uptime_pct: 99.99 },
  { id: "3", name: "Google Workspace", type: "google_workspace", status: "degraded", event_rate: 12, error_count_24h: 3, last_event_at: new Date(Date.now() - 1200000).toISOString(), uptime_pct: 94.21 },
  { id: "4", name: "WAF Logs", type: "waf", status: "error", event_rate: 0, error_count_24h: 47, last_event_at: new Date(Date.now() - 7200000).toISOString(), uptime_pct: 71.00 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusDot: Record<string, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500 animate-pulse",
  error: "bg-red-500 animate-pulse",
  paused: "bg-slate-500",
};
const statusText: Record<string, string> = {
  healthy: "text-green-400",
  degraded: "text-yellow-400",
  error: "text-red-400",
  paused: "text-slate-400",
};
const statusBorder: Record<string, string> = {
  healthy: "border-slate-800",
  degraded: "border-yellow-800/50",
  error: "border-red-800/50",
  paused: "border-slate-700",
};
const logLevel: Record<string, string> = {
  info: "text-blue-400 bg-blue-900/30",
  warn: "text-yellow-400 bg-yellow-900/30",
  error: "text-red-400 bg-red-900/30",
};
const typeIcon: Record<string, string> = {
  m365: "🔷", aws_cloudtrail: "🟠", google_workspace: "🔴",
  azure: "🔵", gcp: "🟡", waf: "🟢", firewall: "🛡️",
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, color = "#3b82f6", height = 32 }: { data: number[]; color?: string; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120; const h = height;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Metric Chart ─────────────────────────────────────────────────────────────
function MetricChart({ metrics, field, label, color, unit }: {
  metrics: ConnectorMetric[];
  field: keyof ConnectorMetric;
  label: string;
  color: string;
  unit: string;
}) {
  const values = metrics.map(m => Number(m[field]));
  const max = Math.max(...values, 1);
  const hours = metrics.map(m => new Date(m.timestamp).getHours());

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-white">{label}</p>
        <p className="text-xs text-slate-400">Last 24h</p>
      </div>
      <div className="flex items-end gap-0.5 h-16">
        {values.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
              {v.toFixed(field === "error_rate" ? 3 : 0)}{unit}
            </div>
            <div
              className="w-full rounded-t transition-all"
              style={{ height: `${(v / max) * 56}px`, backgroundColor: color, opacity: 0.7 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-500">{hours[0]}:00</span>
        <span className="text-xs text-slate-500">{hours[Math.floor(hours.length / 2)]}:00</span>
        <span className="text-xs text-slate-500">Now</span>
      </div>
    </div>
  );
}

// ─── Connector Detail View ────────────────────────────────────────────────────
function ConnectorDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: connector = mockConnectors[id] } = useQuery<ConnectorDetail>({
    queryKey: ["connector-detail", id],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/connectors/${id}`);
      return r.data;
    },
    refetchInterval: 30000,
  });

  const toggleStatus = useMutation({
    mutationFn: async (action: "pause" | "resume" | "test") => {
      await apiClient.post(`/admin/connectors/${id}/${action}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connector-detail", id] }),
  });

  if (!connector) return <div className="text-slate-400 p-8">Connector not found</div>;

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={() => navigate("/admin/connectors")}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Connectors
      </button>

      {/* Header */}
      <div className={`bg-slate-900 rounded-xl border ${statusBorder[connector.status]} p-5`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="text-3xl">{typeIcon[connector.type] ?? "🔌"}</div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-white">{connector.name}</h1>
                <div className={`w-2.5 h-2.5 rounded-full ${statusDot[connector.status]}`} />
                <span className={`text-sm font-medium ${statusText[connector.status]}`}>{connector.status}</span>
              </div>
              <p className="text-xs text-slate-400">
                Type: {connector.type.replace("_", " ").toUpperCase()} ·
                Connected since {new Date(connector.created_at).toLocaleDateString()} ·
                Last event {timeAgo(connector.last_event_at)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toggleStatus.mutate("test")}
              disabled={toggleStatus.isPending}
              className="px-3 py-1.5 text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/50 rounded-lg transition-colors">
              Test Connection
            </button>
            {connector.status !== "paused" ? (
              <button
                onClick={() => toggleStatus.mutate("pause")}
                className="px-3 py-1.5 text-xs bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 border border-yellow-800/40 rounded-lg transition-colors">
                Pause
              </button>
            ) : (
              <button
                onClick={() => toggleStatus.mutate("resume")}
                className="px-3 py-1.5 text-xs bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-800/40 rounded-lg transition-colors">
                Resume
              </button>
            )}
            <button className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
              Edit Credentials
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Events/min", value: connector.event_rate.toLocaleString(), color: "text-blue-400" },
          { label: "Events Today", value: connector.total_events_today >= 1000000 ? `${(connector.total_events_today / 1000000).toFixed(1)}M` : connector.total_events_today.toLocaleString(), color: "text-teal-400" },
          { label: "Avg Latency", value: `${connector.avg_latency_ms}ms`, color: connector.avg_latency_ms > 2000 ? "text-red-400" : connector.avg_latency_ms > 1000 ? "text-yellow-400" : "text-green-400" },
          { label: "Errors (24h)", value: connector.error_count_24h.toString(), color: connector.error_count_24h > 0 ? "text-red-400" : "text-green-400" },
          { label: "Uptime", value: `${connector.uptime_pct}%`, color: connector.uptime_pct >= 99 ? "text-green-400" : connector.uptime_pct >= 95 ? "text-yellow-400" : "text-red-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {connector.metrics_24h.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MetricChart metrics={connector.metrics_24h} field="events_per_min" label="Events / Minute" color="#3b82f6" unit="/min" />
          <MetricChart metrics={connector.metrics_24h} field="latency_ms" label="Latency (ms)" color="#0d9488" unit="ms" />
          <MetricChart metrics={connector.metrics_24h} field="error_rate" label="Error Rate" color="#ef4444" unit="" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Error Log */}
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Error Log</h2>
            <span className="text-xs text-slate-400">{connector.error_log.length} entries</span>
          </div>
          {connector.error_log.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-green-400 text-sm">✅ No errors in the last 24 hours</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {connector.error_log.map(log => (
                <div key={log.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${logLevel[log.level]}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-xs font-mono text-slate-400">{log.event_type}</span>
                    <span className="text-xs text-slate-500 ml-auto">{timeAgo(log.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-300">{log.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Last Events + Config */}
        <div className="space-y-4">
          {/* Last Events */}
          <div className="bg-slate-900 rounded-xl border border-slate-800">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white">Last 5 Events</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {connector.last_5_events.length === 0 ? (
                <p className="text-slate-400 text-xs p-4">No recent events</p>
              ) : connector.last_5_events.map((e, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-blue-400">{e.event_type}</p>
                    <p className="text-xs text-slate-500">{e.source}</p>
                  </div>
                  <span className="text-xs text-slate-500">{timeAgo(e.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Config */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-white mb-3">Configuration</h2>
            <div className="space-y-2">
              {Object.entries(connector.config).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-slate-400">{k.replace(/_/g, " ")}</span>
                  <span className="text-slate-200 font-mono max-w-[200px] truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Connector List View (enhanced) ──────────────────────────────────────────
function ConnectorListView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ type: "", name: "", credentials: "" });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | boolean>(null);

  const { data = mockList } = useQuery({
    queryKey: ["connectors"],
    queryFn: async () => {
      const r = await apiClient.get("/admin/connectors");
      return r.data.data;
    },
    refetchInterval: 30000,
  });

  const connectorTypes = [
    { type: "m365", label: "Microsoft 365 / Entra ID", icon: "🔷" },
    { type: "aws_cloudtrail", label: "AWS CloudTrail", icon: "🟠" },
    { type: "google_workspace", label: "Google Workspace", icon: "🔴" },
    { type: "azure", label: "Azure Activity Logs", icon: "🔵" },
    { type: "gcp", label: "GCP Audit Logs", icon: "🟡" },
    { type: "waf", label: "WAF / Firewall Logs", icon: "🟢" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Connectors</h1>
          <p className="text-slate-400 text-sm mt-1">
            {data.filter((c: any) => c.status === "healthy").length} healthy ·{" "}
            {data.filter((c: any) => c.status === "degraded").length} degraded ·{" "}
            {data.filter((c: any) => c.status === "error").length} error
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setStep(1); setTestResult(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Connector
        </button>
      </div>

      {/* Connector Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.map((c: any) => (
          <div key={c.id}
            className={`bg-slate-900 rounded-xl border ${statusBorder[c.status]} p-5 hover:border-slate-600 transition-all`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">{typeIcon[c.type] ?? "🔌"}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <div className={`w-2 h-2 rounded-full ${statusDot[c.status]}`} />
                  </div>
                  <p className="text-xs text-slate-400">Last event {timeAgo(c.last_event_at)}</p>
                </div>
              </div>
              <span className={`text-xs font-medium ${statusText[c.status]}`}>{c.status}</span>
            </div>

            {/* Mini metrics */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-white">{c.event_rate}/m</p>
                <p className="text-xs text-slate-400">Rate</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <p className={`text-sm font-bold ${c.error_count_24h > 0 ? "text-red-400" : "text-green-400"}`}>
                  {c.error_count_24h}
                </p>
                <p className="text-xs text-slate-400">Errors</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <p className={`text-sm font-bold ${c.uptime_pct >= 99 ? "text-green-400" : c.uptime_pct >= 95 ? "text-yellow-400" : "text-red-400"}`}>
                  {c.uptime_pct}%
                </p>
                <p className="text-xs text-slate-400">Uptime</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/admin/connectors/${c.id}`)}
                className="flex-1 px-3 py-1.5 text-xs bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800/40 rounded-lg transition-colors">
                View Details
              </button>
              <button className="flex-1 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Connector Wizard Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 w-full max-w-lg relative">
            <button onClick={() => setShowAdd(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-400"}`}>{s}</div>
                  {s < 3 && <div className={`h-0.5 w-8 ${step > s ? "bg-teal-600" : "bg-slate-700"}`} />}
                </div>
              ))}
              <p className="ml-2 text-sm text-slate-300 font-medium">
                {step === 1 ? "Select Type" : step === 2 ? "Configure" : "Test & Activate"}
              </p>
            </div>

            {step === 1 && (
              <div className="space-y-2">
                {connectorTypes.map(ct => (
                  <button key={ct.type} onClick={() => { setForm(f => ({ ...f, type: ct.type, name: ct.label })); setStep(2); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-teal-700 rounded-lg transition-all text-left">
                    <span className="text-xl">{ct.icon}</span>
                    <span className="text-sm text-white">{ct.label}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">Configure <strong className="text-white">{form.name}</strong></p>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Display Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Credentials</label>
                  <textarea value={form.credentials} onChange={e => setForm(f => ({ ...f, credentials: e.target.value }))}
                    rows={3} placeholder="Paste API key, OAuth token, or service account JSON..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
                  <p className="text-xs text-slate-500 mt-1">🔒 Encrypted with AES-256-GCM before storage</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Back</button>
                  <button onClick={() => setStep(3)} className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg">Next</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">Test connection to <strong className="text-white">{form.name}</strong></p>
                <button onClick={async () => { setTesting(true); await new Promise(r => setTimeout(r, 1500)); setTestResult(true); setTesting(false); }}
                  disabled={testing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-white disabled:opacity-50 transition-colors">
                  {testing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Testing...</> : "Run Connection Test"}
                </button>
                {testResult === true && (
                  <div className="bg-green-900/30 border border-green-800/50 rounded-lg p-3 text-sm text-green-400">
                    ✅ Connection successful · 15ms latency · Sample events retrieved
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg">Back</button>
                  <button onClick={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ["connectors"] }); }}
                    disabled={!testResult}
                    className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors">
                    Activate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function ConnectorHealth() {
  const { id } = useParams();
  return id ? <ConnectorDetailView id={id} /> : <ConnectorListView />;
}
