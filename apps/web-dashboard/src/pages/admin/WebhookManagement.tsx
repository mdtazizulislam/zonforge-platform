import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type WebhookStatus = "active" | "paused" | "error";
type WebhookEvent =
  | "alert.created" | "alert.updated" | "alert.resolved"
  | "risk.score_changed" | "risk.threshold_exceeded"
  | "connector.health_changed" | "connector.error"
  | "user.access_review_due" | "compliance.control_failed"
  | "incident.created" | "incident.resolved";

interface WebhookDelivery {
  id: string;
  event: WebhookEvent;
  status: "success" | "failed" | "retrying";
  response_code?: number;
  duration_ms: number;
  delivered_at: string;
  payload_preview: string;
  retry_count: number;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret_hint?: string;
  status: WebhookStatus;
  events: WebhookEvent[];
  filter_severity?: string[];
  created_by: string;
  created_at: string;
  last_triggered_at?: string;
  success_rate_7d: number;
  total_deliveries_7d: number;
  failed_deliveries_7d: number;
  deliveries: WebhookDelivery[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockWebhooks: Webhook[] = [
  {
    id: "wh1",
    name: "Slack — #security-alerts",
    url: "https://hooks.slack.com/services/T00000000/B00000000/XXXX",
    secret_hint: "••••••••Xk3p",
    status: "active",
    events: ["alert.created", "alert.resolved", "incident.created"],
    filter_severity: ["critical", "high"],
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    last_triggered_at: new Date(Date.now() - 1800000).toISOString(),
    success_rate_7d: 98.4,
    total_deliveries_7d: 127,
    failed_deliveries_7d: 2,
    deliveries: [
      { id: "d1", event: "alert.created", status: "success", response_code: 200, duration_ms: 142, delivered_at: new Date(Date.now() - 1800000).toISOString(), payload_preview: '{"event":"alert.created","alert":{"id":"al-001","title":"Brute-Force...","severity":"critical"}}', retry_count: 0 },
      { id: "d2", event: "alert.resolved", status: "success", response_code: 200, duration_ms: 98, delivered_at: new Date(Date.now() - 7200000).toISOString(), payload_preview: '{"event":"alert.resolved","alert":{"id":"al-002","title":"Impossible Travel..."}}', retry_count: 0 },
      { id: "d3", event: "alert.created", status: "failed", response_code: 503, duration_ms: 5001, delivered_at: new Date(Date.now() - 86400000).toISOString(), payload_preview: '{"event":"alert.created","alert":{"id":"al-003","severity":"high"}}', retry_count: 3 },
    ],
  },
  {
    id: "wh2",
    name: "PagerDuty — P1 Escalation",
    url: "https://events.pagerduty.com/v2/enqueue",
    secret_hint: "••••••••YmNp",
    status: "active",
    events: ["alert.created", "incident.created"],
    filter_severity: ["critical"],
    created_by: "admin@acme.com",
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    last_triggered_at: new Date(Date.now() - 3600000).toISOString(),
    success_rate_7d: 100,
    total_deliveries_7d: 8,
    failed_deliveries_7d: 0,
    deliveries: [
      { id: "d4", event: "incident.created", status: "success", response_code: 202, duration_ms: 234, delivered_at: new Date(Date.now() - 3600000).toISOString(), payload_preview: '{"event":"incident.created","incident":{"id":"inc-001","severity":"critical"}}', retry_count: 0 },
    ],
  },
  {
    id: "wh3",
    name: "SIEM — Splunk HEC",
    url: "https://splunk.acme.internal:8088/services/collector",
    status: "error",
    events: ["alert.created", "alert.updated", "risk.score_changed", "connector.health_changed"],
    created_by: "devops@acme.com",
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    last_triggered_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    success_rate_7d: 31.2,
    total_deliveries_7d: 348,
    failed_deliveries_7d: 239,
    deliveries: [
      { id: "d5", event: "alert.created", status: "failed", response_code: 401, duration_ms: 87, delivered_at: new Date(Date.now() - 2 * 86400000).toISOString(), payload_preview: '{"event":"alert.created",...}', retry_count: 3 },
      { id: "d6", event: "risk.score_changed", status: "retrying", duration_ms: 5000, delivered_at: new Date(Date.now() - 2 * 86400000 - 3600000).toISOString(), payload_preview: '{"event":"risk.score_changed",...}', retry_count: 1 },
    ],
  },
];

const ALL_EVENTS: { id: WebhookEvent; label: string; category: string }[] = [
  { id: "alert.created", label: "Alert Created", category: "Alerts" },
  { id: "alert.updated", label: "Alert Updated", category: "Alerts" },
  { id: "alert.resolved", label: "Alert Resolved", category: "Alerts" },
  { id: "incident.created", label: "Incident Created", category: "Incidents" },
  { id: "incident.resolved", label: "Incident Resolved", category: "Incidents" },
  { id: "risk.score_changed", label: "Risk Score Changed", category: "Risk" },
  { id: "risk.threshold_exceeded", label: "Risk Threshold Exceeded", category: "Risk" },
  { id: "connector.health_changed", label: "Connector Health Changed", category: "Connectors" },
  { id: "connector.error", label: "Connector Error", category: "Connectors" },
  { id: "user.access_review_due", label: "Access Review Due", category: "Access" },
  { id: "compliance.control_failed", label: "Compliance Control Failed", category: "Compliance" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusDot: Record<WebhookStatus, string> = {
  active: "bg-green-500",
  paused: "bg-slate-500",
  error: "bg-red-500 animate-pulse",
};
const statusStyle: Record<WebhookStatus, string> = {
  active: "text-green-400 bg-green-500/10 border-green-500/30",
  paused: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  error: "text-red-400 bg-red-500/10 border-red-500/30",
};
const deliveryStyle: Record<string, string> = {
  success: "text-green-400",
  failed: "text-red-400",
  retrying: "text-yellow-400",
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SAMPLE_PAYLOAD = `{
  "event": "alert.created",
  "timestamp": "2026-04-17T02:31:00Z",
  "tenant_id": "acme-corp",
  "data": {
    "alert": {
      "id": "al-001",
      "title": "Brute-Force to Successful Login",
      "severity": "critical",
      "priority": "P1",
      "status": "open",
      "affected_user": "john.smith@acme.com",
      "risk_score": 87,
      "mitre_technique": "T1110",
      "created_at": "2026-04-17T02:31:00Z"
    }
  },
  "signature": "sha256=abc123..."
}`;

// ─── Webhook Form ─────────────────────────────────────────────────────────────
function WebhookForm({ onClose, existing }: { onClose: () => void; existing?: Webhook }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"config" | "events" | "test">("config");
  const [name, setName] = useState(existing?.name ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(existing?.events ?? ["alert.created"]);
  const [filterSev, setFilterSev] = useState<string[]>(existing?.filter_severity ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { success: boolean; code: number; ms: number }>(null);
  const [copied, setCopied] = useState(false);

  const toggleEvent = (e: WebhookEvent) => setEvents(p => p.includes(e) ? p.filter(x => x !== e) : [...p, e]);
  const toggleSev = (s: string) => setFilterSev(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const categories = [...new Set(ALL_EVENTS.map(e => e.category))];

  const testWebhook = async () => {
    setTesting(true);
    await new Promise(r => setTimeout(r, 1500));
    setTestResult({ success: true, code: 200, ms: 143 });
    setTesting(false);
  };

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 900));
    qc.invalidateQueries({ queryKey: ["webhooks"] });
    setSaving(false); setSaved(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">{existing ? "Edit" : "New"} Webhook</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex gap-1 p-3 border-b border-slate-800">
          {([
            { id: "config", label: "⚙️ Config" },
            { id: "events", label: "📡 Events" },
            { id: "test", label: "🧪 Test" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Config Tab */}
          {tab === "config" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Webhook Name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Slack — #security-alerts"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Endpoint URL *</label>
                <input value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                <p className="text-xs text-slate-500 mt-1">Must be HTTPS. HTTP endpoints are rejected.</p>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Signing Secret (optional)</label>
                <input type="password" value={secret} onChange={e => setSecret(e.target.value)}
                  placeholder={existing?.secret_hint ?? "Generate a shared secret for payload verification"}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                <p className="text-xs text-slate-500 mt-1">🔒 Used to sign payloads with HMAC-SHA256. Verify using the <code className="text-blue-300">X-ZonForge-Signature</code> header.</p>
              </div>

              {/* Severity filter */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">Only trigger for severity (leave blank for all)</label>
                <div className="flex gap-2">
                  {["critical","high","medium","low"].map(s => (
                    <button key={s} onClick={() => toggleSev(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors ${
                        filterSev.includes(s)
                          ? s === "critical" ? "bg-red-600 text-white border-red-600"
                            : s === "high" ? "bg-orange-500 text-white border-orange-500"
                            : s === "medium" ? "bg-yellow-500 text-black border-yellow-500"
                            : "bg-green-600 text-white border-green-600"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick integrations */}
              <div className="pt-3 border-t border-slate-800">
                <p className="text-xs text-slate-400 mb-2">Quick Integration Templates:</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "Slack", url: "https://hooks.slack.com/services/..." },
                    { label: "PagerDuty", url: "https://events.pagerduty.com/v2/enqueue" },
                    { label: "Splunk HEC", url: "https://your-splunk:8088/services/collector" },
                    { label: "Microsoft Teams", url: "https://outlook.office.com/webhook/..." },
                  ].map(t => (
                    <button key={t.label} onClick={() => { if (!url) setUrl(t.url); if (!name) setName(t.label); }}
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Events Tab */}
          {tab === "events" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">Choose which events trigger this webhook. <strong className="text-white">{events.length} selected</strong></p>
              {categories.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">{cat}</p>
                  <div className="space-y-1">
                    {ALL_EVENTS.filter(e => e.category === cat).map(ev => (
                      <label key={ev.id} className="flex items-center gap-3 p-2.5 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750 border border-transparent hover:border-slate-600 transition-all">
                        <input type="checkbox" checked={events.includes(ev.id)} onChange={() => toggleEvent(ev.id)}
                          className="rounded border-slate-600 bg-slate-700 text-blue-600 flex-shrink-0"/>
                        <div className="flex-1">
                          <span className="text-sm text-white">{ev.label}</span>
                          <code className="ml-2 text-xs text-slate-400 font-mono">{ev.id}</code>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Test Tab */}
          {tab === "test" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">Send a test payload to verify your endpoint is configured correctly.</p>

              <div>
                <p className="text-xs text-slate-400 mb-2">Sample Payload (alert.created):</p>
                <div className="relative">
                  <pre className="bg-slate-800 rounded-xl p-4 text-xs font-mono text-green-300 overflow-x-auto max-h-52">
                    {SAMPLE_PAYLOAD}
                  </pre>
                  <button onClick={() => { navigator.clipboard.writeText(SAMPLE_PAYLOAD); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="absolute top-2 right-2 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">
                    {copied ? "✅" : "Copy"}
                  </button>
                </div>
              </div>

              <button onClick={testWebhook} disabled={testing || !url}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/40 rounded-xl text-sm transition-colors disabled:opacity-50">
                {testing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-300"/>Sending test payload...</> : "🚀 Send Test Payload"}
              </button>

              {testResult && (
                <div className={`rounded-xl border p-4 ${testResult.success ? "bg-green-900/20 border-green-800/40" : "bg-red-900/20 border-red-800/40"}`}>
                  <p className={`text-sm font-semibold mb-1 ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                    {testResult.success ? "✅ Test Successful" : "❌ Test Failed"}
                  </p>
                  <div className="flex gap-4 text-xs">
                    <span className="text-slate-300">HTTP {testResult.code}</span>
                    <span className="text-slate-300">{testResult.ms}ms</span>
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                <p className="text-xs font-semibold text-white mb-2">Verify Payload Signature (Node.js)</p>
                <pre className="text-xs font-mono text-green-300 overflow-x-auto">{`const crypto = require('crypto');
const sig = req.headers['x-zonforge-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');
if (sig !== expected) return res.status(401).end();`}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !name || !url}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Saving...</> : saved ? "✅ Saved!" : (existing ? "Save Changes" : "Create Webhook")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WebhookManagement() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editWebhook, setEditWebhook] = useState<Webhook | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: webhooks = mockWebhooks } = useQuery<Webhook[]>({
    queryKey: ["webhooks"],
    queryFn: async () => { const r = await apiClient.get("/admin/webhooks"); return r.data.data; },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiClient.patch(`/admin/webhooks/${id}`, { status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/admin/webhooks/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const retryDelivery = useMutation({
    mutationFn: async ({ whId, deliveryId }: { whId: string; deliveryId: string }) => {
      await apiClient.post(`/admin/webhooks/${whId}/deliveries/${deliveryId}/retry`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const stats = {
    active: webhooks.filter(w => w.status === "active").length,
    error: webhooks.filter(w => w.status === "error").length,
    total_7d: webhooks.reduce((s, w) => s + w.total_deliveries_7d, 0),
    failed_7d: webhooks.reduce((s, w) => s + w.failed_deliveries_7d, 0),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Webhook Management</h1>
          <p className="text-slate-400 text-sm mt-1">Push real-time events to external systems</p>
        </div>
        <button onClick={() => { setEditWebhook(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Webhook
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Active", value: stats.active, color: "text-green-400" },
          { label: "Errors", value: stats.error, color: stats.error > 0 ? "text-red-400" : "text-green-400" },
          { label: "Deliveries (7d)", value: stats.total_7d.toLocaleString(), color: "text-blue-400" },
          { label: "Failed (7d)", value: stats.failed_7d, color: stats.failed_7d > 0 ? "text-red-400" : "text-green-400" },
        ].map((c, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <p className="text-xs text-slate-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Webhook Cards */}
      <div className="space-y-4">
        {webhooks.map(wh => (
          <div key={wh.id} className={`bg-slate-900 rounded-xl border transition-all ${wh.status === "error" ? "border-red-800/50" : "border-slate-800"}`}>
            {/* Header */}
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-white">{wh.name}</p>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[wh.status]}`}/>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyle[wh.status]}`}>{wh.status}</span>
                  </div>
                  <p className="text-xs font-mono text-slate-400 truncate mb-2">{wh.url}</p>

                  {/* Event badges */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {wh.events.slice(0, 4).map(e => (
                      <span key={e} className="text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded">{e}</span>
                    ))}
                    {wh.events.length > 4 && (
                      <span className="text-xs text-slate-400">+{wh.events.length - 4} more</span>
                    )}
                    {wh.filter_severity && wh.filter_severity.length > 0 && (
                      <span className="text-xs text-orange-300 bg-orange-900/30 border border-orange-800/40 px-1.5 py-0.5 rounded">
                        {wh.filter_severity.join("/")} only
                      </span>
                    )}
                  </div>

                  {/* Delivery metrics */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 bg-slate-700 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${wh.success_rate_7d >= 95 ? "bg-green-500" : wh.success_rate_7d >= 80 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${wh.success_rate_7d}%` }}/>
                      </div>
                      <span className={`font-medium ${wh.success_rate_7d >= 95 ? "text-green-400" : wh.success_rate_7d >= 80 ? "text-yellow-400" : "text-red-400"}`}>
                        {wh.success_rate_7d}%
                      </span>
                      <span className="text-slate-500">success (7d)</span>
                    </div>
                    <span className="text-slate-400">{wh.total_deliveries_7d} deliveries</span>
                    {wh.failed_deliveries_7d > 0 && (
                      <span className="text-red-400">{wh.failed_deliveries_7d} failed</span>
                    )}
                    {wh.last_triggered_at && <span className="text-slate-500">Last: {timeAgo(wh.last_triggered_at)}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <div className="flex gap-1.5">
                    <button onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)}
                      className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                      {expandedId === wh.id ? "Hide" : "Logs"}
                    </button>
                    <button onClick={() => { setEditWebhook(wh); setShowForm(true); }}
                      className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                      Edit
                    </button>
                    <button onClick={() => toggleStatus.mutate({ id: wh.id, status: wh.status === "active" ? "paused" : "active" })}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${wh.status === "active" ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>
                      {wh.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button onClick={() => deleteWebhook.mutate(wh.id)}
                      className="px-2.5 py-1.5 text-xs bg-red-900/20 text-red-400 border border-red-800/30 rounded-lg hover:bg-red-900/40 transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Log */}
            {expandedId === wh.id && (
              <div className="border-t border-slate-800">
                <div className="px-5 py-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-white">Recent Deliveries</p>
                  <p className="text-xs text-slate-400">{wh.deliveries.length} records</p>
                </div>
                <div className="divide-y divide-slate-800">
                  {wh.deliveries.map(d => (
                    <div key={d.id} className="px-5 py-3 flex items-start gap-4">
                      <div className="flex-shrink-0 w-16 text-center">
                        {d.response_code ? (
                          <span className={`text-xs font-bold ${d.response_code < 300 ? "text-green-400" : d.response_code < 500 ? "text-yellow-400" : "text-red-400"}`}>
                            {d.response_code}
                          </span>
                        ) : (
                          <span className="text-xs text-yellow-400">—</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium ${deliveryStyle[d.status]}`}>{d.status}</span>
                          <span className="text-xs font-mono text-slate-400">{d.event}</span>
                          {d.retry_count > 0 && (
                            <span className="text-xs text-orange-400">{d.retry_count} retries</span>
                          )}
                          <span className="text-xs text-slate-500 ml-auto">{d.duration_ms}ms</span>
                          <span className="text-xs text-slate-500">{timeAgo(d.delivered_at)}</span>
                        </div>
                        <p className="text-xs font-mono text-slate-500 truncate">{d.payload_preview}</p>
                      </div>
                      {d.status === "failed" && (
                        <button onClick={() => retryDelivery.mutate({ whId: wh.id, deliveryId: d.id })}
                          className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 transition-colors">
                          Retry
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && <WebhookForm onClose={() => setShowForm(false)} existing={editWebhook} />}
    </div>
  );
}
