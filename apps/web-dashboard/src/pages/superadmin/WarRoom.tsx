import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
type IncidentSeverity = "P1" | "P2" | "P3";
type IncidentStatus = "declared" | "investigating" | "mitigating" | "resolved";

interface WarRoomIncident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affected_tenants: string[];
  affected_tenants_count: number;
  total_tenants: number;
  commander: string;
  responders: string[];
  declared_at: string;
  updated_at: string;
  resolved_at?: string;
  estimated_impact: string;
  root_cause?: string;
  customer_impact: boolean;
  communication_sent: boolean;
}

interface TimelineEntry {
  id: string;
  timestamp: string;
  author: string;
  role: string;
  type: "update" | "action" | "escalation" | "resolved" | "communication";
  message: string;
  automated: boolean;
}

interface Responder {
  name: string;
  email: string;
  role: string;
  status: "active" | "standby" | "offline";
  joined_at: string;
}

interface Checklist {
  id: string;
  phase: string;
  item: string;
  done: boolean;
  done_by?: string;
  done_at?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockIncident: WarRoomIncident = {
  id: "inc-p1-001",
  title: "Platform-wide Alert Ingestion Failure",
  description: "Event ingestion pipeline experiencing failures due to Kafka cluster leader re-election. Alerts from all tenants are delayed or not being processed.",
  severity: "P1",
  status: "mitigating",
  affected_tenants: ["CloudSoft", "SecureBank", "Acme Corp", "FinTech Labs"],
  affected_tenants_count: 47,
  total_tenants: 47,
  commander: "Sarah Chen (VP Engineering)",
  responders: ["Mike Torres", "Alice Wang", "Bob Smith", "Ana Garcia"],
  declared_at: new Date(Date.now() - 47 * 60000).toISOString(),
  updated_at: new Date(Date.now() - 3 * 60000).toISOString(),
  estimated_impact: "All tenants not receiving real-time alerts. Estimated 47-minute delay in threat detection across platform.",
  root_cause: "Kafka broker-3 crashed due to disk I/O saturation. Leader re-election triggered cascading connection resets.",
  customer_impact: true,
  communication_sent: true,
};

const mockTimeline: TimelineEntry[] = [
  { id: "t1", timestamp: new Date(Date.now() - 47 * 60000).toISOString(), author: "ZonForge Sentinel", role: "Automated", type: "escalation", message: "AUTOMATED: Ingestion lag exceeded 10 minutes threshold across all connectors. P1 incident auto-declared.", automated: true },
  { id: "t2", timestamp: new Date(Date.now() - 45 * 60000).toISOString(), author: "Sarah Chen", role: "Incident Commander", type: "action", message: "War Room activated. Paging on-call engineers. Starting investigation on Kafka cluster.", automated: false },
  { id: "t3", timestamp: new Date(Date.now() - 42 * 60000).toISOString(), author: "Mike Torres", role: "Infrastructure Lead", type: "update", message: "Confirmed: Kafka broker-3 is down. Disk at 100% utilization. Leader election in progress — estimated 5-8 minutes.", automated: false },
  { id: "t4", timestamp: new Date(Date.now() - 38 * 60000).toISOString(), author: "Ana Garcia", role: "Customer Success", type: "communication", message: "Status page updated. Email sent to all Enterprise/Business tier admins notifying of alert delay.", automated: false },
  { id: "t5", timestamp: new Date(Date.now() - 35 * 60000).toISOString(), author: "ZonForge Sentinel", role: "Automated", type: "update", message: "AUTOMATED: Kafka leader re-election complete. Ingestion pipeline attempting reconnect.", automated: true },
  { id: "t6", timestamp: new Date(Date.now() - 30 * 60000).toISOString(), author: "Alice Wang", role: "Backend Engineer", type: "update", message: "Pipeline reconnected but processing backlog. ~47 minutes of events queued. ETA to clear: 15-20 minutes.", automated: false },
  { id: "t7", timestamp: new Date(Date.now() - 25 * 60000).toISOString(), author: "Bob Smith", role: "Database Reliability", type: "action", message: "Cleared Kafka broker-3 disk by removing old log segments. Added disk usage alert at 75% threshold.", automated: false },
  { id: "t8", timestamp: new Date(Date.now() - 15 * 60000).toISOString(), author: "Sarah Chen", role: "Incident Commander", type: "update", message: "Status: Actively mitigating. Backlog clearing at ~2x normal rate. Monitoring for full recovery.", automated: false },
  { id: "t9", timestamp: new Date(Date.now() - 5 * 60000).toISOString(), author: "Alice Wang", role: "Backend Engineer", type: "update", message: "Backlog 60% cleared. All connectors flowing. Real-time lag back to <30 seconds.", automated: false },
];

const mockResponders: Responder[] = [
  { name: "Sarah Chen", email: "sarah.chen@zonforge.io", role: "Incident Commander", status: "active", joined_at: new Date(Date.now() - 45 * 60000).toISOString() },
  { name: "Mike Torres", email: "mike.torres@zonforge.io", role: "Infrastructure Lead", status: "active", joined_at: new Date(Date.now() - 44 * 60000).toISOString() },
  { name: "Alice Wang", email: "alice.wang@zonforge.io", role: "Backend Engineer", status: "active", joined_at: new Date(Date.now() - 43 * 60000).toISOString() },
  { name: "Bob Smith", email: "bob.smith@zonforge.io", role: "Database Reliability", status: "active", joined_at: new Date(Date.now() - 40 * 60000).toISOString() },
  { name: "Ana Garcia", email: "ana.garcia@zonforge.io", role: "Customer Success", status: "standby", joined_at: new Date(Date.now() - 38 * 60000).toISOString() },
];

const mockChecklist: Checklist[] = [
  { id: "c1", phase: "Triage", item: "Confirm incident scope and impact", done: true, done_by: "Sarah Chen", done_at: new Date(Date.now() - 44 * 60000).toISOString() },
  { id: "c2", phase: "Triage", item: "Assign Incident Commander", done: true, done_by: "Auto-assigned", done_at: new Date(Date.now() - 45 * 60000).toISOString() },
  { id: "c3", phase: "Triage", item: "Page on-call responders", done: true, done_by: "PagerDuty", done_at: new Date(Date.now() - 44 * 60000).toISOString() },
  { id: "c4", phase: "Communication", item: "Update status page", done: true, done_by: "Ana Garcia", done_at: new Date(Date.now() - 38 * 60000).toISOString() },
  { id: "c5", phase: "Communication", item: "Notify affected Enterprise tenants", done: true, done_by: "Ana Garcia", done_at: new Date(Date.now() - 37 * 60000).toISOString() },
  { id: "c6", phase: "Communication", item: "Prepare executive summary", done: false },
  { id: "c7", phase: "Mitigation", item: "Identify root cause", done: true, done_by: "Mike Torres", done_at: new Date(Date.now() - 40 * 60000).toISOString() },
  { id: "c8", phase: "Mitigation", item: "Implement fix / workaround", done: true, done_by: "Bob Smith", done_at: new Date(Date.now() - 25 * 60000).toISOString() },
  { id: "c9", phase: "Mitigation", item: "Verify fix in production", done: false },
  { id: "c10", phase: "Recovery", item: "Confirm full recovery — lag < 5s", done: false },
  { id: "c11", phase: "Recovery", item: "Send all-clear to customers", done: false },
  { id: "c12", phase: "Post-mortem", item: "Schedule post-mortem (within 48h)", done: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sevColor: Record<IncidentSeverity, string> = {
  P1: "bg-red-600 text-white",
  P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-black",
};
const statusStyle: Record<IncidentStatus, string> = {
  declared: "text-red-400 bg-red-500/10 border-red-500/30",
  investigating: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  mitigating: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  resolved: "text-green-400 bg-green-500/10 border-green-500/30",
};
const timelineIcon: Record<string, string> = {
  update: "📝", action: "⚡", escalation: "🚨", resolved: "✅", communication: "📢",
};
const responderStatus: Record<string, string> = {
  active: "bg-green-500", standby: "bg-yellow-500", offline: "bg-slate-500",
};

function elapsed(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WarRoom() {
  const qc = useQueryClient();
  const [update, setUpdate] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [checklist, setChecklist] = useState(mockChecklist);
  const [timeline, setTimeline] = useState(mockTimeline);
  const [elapsedTime, setElapsedTime] = useState(elapsed(mockIncident.declared_at));
  const [tab, setTab] = useState<"timeline" | "checklist" | "responders">("timeline");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(elapsed(mockIncident.declared_at));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const postUpdate = async () => {
    if (!update.trim()) return;
    setPostingUpdate(true);
    await new Promise(r => setTimeout(r, 500));
    const newEntry: TimelineEntry = {
      id: `t${Date.now()}`, timestamp: new Date().toISOString(),
      author: "You (Super Admin)", role: "Platform Owner",
      type: "update", message: update, automated: false,
    };
    setTimeline(prev => [...prev, newEntry]);
    setUpdate("");
    setPostingUpdate(false);
  };

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev => prev.map(c =>
      c.id === id ? { ...c, done: !c.done, done_by: !c.done ? "You" : undefined, done_at: !c.done ? new Date().toISOString() : undefined } : c
    ));
  };

  const resolveIncident = async () => {
    setResolving(true);
    await new Promise(r => setTimeout(r, 1500));
    setResolved(true);
    setResolving(false);
  };

  const phases = [...new Set(checklist.map(c => c.phase))];
  const doneCount = checklist.filter(c => c.done).length;

  return (
    <div className="space-y-4 pb-8">
      {/* P1 Alert Header */}
      {!resolved && (
        <div className="bg-red-900/30 border border-red-600/60 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0"/>
          <span className="text-red-300 text-sm font-bold">⚡ ACTIVE P1 INCIDENT — War Room Open</span>
          <span className="text-red-200 text-xs ml-auto">Duration: {elapsedTime}</span>
        </div>
      )}
      {resolved && (
        <div className="bg-green-900/30 border border-green-600/60 rounded-xl p-4 flex items-center gap-3">
          <span className="text-green-300 text-sm font-bold">✅ Incident RESOLVED — Duration: {elapsedTime}</span>
        </div>
      )}

      {/* Incident Header Card */}
      <div className="bg-slate-900 rounded-xl border border-red-800/50 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${sevColor[mockIncident.severity]}`}>{mockIncident.severity}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusStyle[mockIncident.status]}`}>{mockIncident.status}</span>
              {mockIncident.customer_impact && <span className="text-xs bg-orange-900/40 text-orange-300 border border-orange-800/40 px-2 py-0.5 rounded-full">Customer Impact</span>}
              {mockIncident.communication_sent && <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-800/40 px-2 py-0.5 rounded-full">📢 Status Page Updated</span>}
            </div>
            <h1 className="text-lg font-bold text-white mb-1">{mockIncident.title}</h1>
            <p className="text-sm text-slate-300 leading-relaxed">{mockIncident.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-3xl font-bold text-red-400 font-mono">{elapsedTime}</p>
              <p className="text-xs text-slate-400">elapsed</p>
            </div>
          </div>
        </div>

        {/* Impact + Root Cause */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3">
            <p className="text-xs font-semibold text-red-300 mb-1">Estimated Impact</p>
            <p className="text-xs text-slate-300">{mockIncident.estimated_impact}</p>
          </div>
          {mockIncident.root_cause && (
            <div className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-white mb-1">Root Cause Identified</p>
              <p className="text-xs text-slate-300">{mockIncident.root_cause}</p>
            </div>
          )}
        </div>

        {/* Affected tenants */}
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-slate-400">Affected: <span className="text-red-400 font-bold">{mockIncident.affected_tenants_count}/{mockIncident.total_tenants} tenants</span></span>
          {mockIncident.affected_tenants.map(t => (
            <span key={t} className="bg-red-900/30 text-red-300 border border-red-800/40 px-2 py-0.5 rounded-full">{t}</span>
          ))}
          {mockIncident.affected_tenants_count > mockIncident.affected_tenants.length && (
            <span className="text-slate-500">+{mockIncident.affected_tenants_count - mockIncident.affected_tenants.length} more</span>
          )}
        </div>

        {/* Commander + Resolve button */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-400">
            Commander: <span className="text-white font-medium">{mockIncident.commander}</span>
            <span className="mx-2">·</span>
            Declared: <span className="text-slate-300">{timeStr(mockIncident.declared_at)}</span>
          </p>
          {!resolved && (
            <button onClick={resolveIncident} disabled={resolving}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-60">
              {resolving ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"/>Resolving...</> : "✅ Mark Resolved"}
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        {([
          { id: "timeline", label: `📝 Timeline (${timeline.length})` },
          { id: "checklist", label: `✅ Checklist (${doneCount}/${checklist.length})` },
          { id: "responders", label: `👥 Responders (${mockResponders.filter(r => r.status === "active").length} active)` },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-red-700 text-white" : "text-slate-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TIMELINE TAB ── */}
      {tab === "timeline" && (
        <div className="space-y-4">
          {/* Post update */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-xs font-semibold text-white mb-2">Post Update</p>
            <div className="flex gap-2">
              <textarea value={update} onChange={e => setUpdate(e.target.value)}
                placeholder="Add a timeline update, action taken, or escalation note..."
                rows={2}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-700 resize-none"/>
              <button onClick={postUpdate} disabled={postingUpdate || !update.trim()}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors self-end">
                {postingUpdate ? "..." : "Post"}
              </button>
            </div>
          </div>

          {/* Timeline entries */}
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-700"/>
            <div className="space-y-3">
              {[...timeline].reverse().map(entry => (
                <div key={entry.id} className="relative flex gap-4">
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base ${entry.automated ? "bg-slate-800 border border-slate-600" : "bg-slate-900 border border-slate-700"}`}>
                    {timelineIcon[entry.type]}
                  </div>
                  <div className={`flex-1 rounded-xl p-4 border mb-1 ${
                    entry.type === "escalation" ? "bg-red-900/20 border-red-800/40" :
                    entry.type === "communication" ? "bg-blue-900/20 border-blue-800/40" :
                    entry.type === "action" ? "bg-teal-900/20 border-teal-800/40" :
                    "bg-slate-900 border-slate-800"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{entry.author}</span>
                        <span className="text-xs text-slate-500">{entry.role}</span>
                        {entry.automated && <span className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">AUTO</span>}
                      </div>
                      <span className="text-xs text-slate-500 font-mono">{timeStr(entry.timestamp)}</span>
                    </div>
                    <p className="text-sm text-slate-300">{entry.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CHECKLIST TAB ── */}
      {tab === "checklist" && (
        <div className="space-y-4">
          {/* Progress */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">Runbook Progress</p>
              <p className="text-sm font-bold text-blue-400">{doneCount}/{checklist.length}</p>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }}/>
            </div>
          </div>

          {phases.map(phase => (
            <div key={phase} className="bg-slate-900 rounded-xl border border-slate-800">
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">{phase}</p>
              </div>
              <div className="divide-y divide-slate-800">
                {checklist.filter(c => c.phase === phase).map(item => (
                  <div key={item.id} className={`flex items-start gap-3 px-4 py-3 ${item.done ? "opacity-70" : ""}`}>
                    <button onClick={() => toggleChecklistItem(item.id)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${item.done ? "bg-green-600 border-green-600" : "border-slate-500 hover:border-green-500"}`}>
                      {item.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                    </button>
                    <div className="flex-1">
                      <p className={`text-sm ${item.done ? "text-slate-400 line-through" : "text-white"}`}>{item.item}</p>
                      {item.done && item.done_by && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          ✓ {item.done_by} · {item.done_at ? timeStr(item.done_at) : ""}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── RESPONDERS TAB ── */}
      {tab === "responders" && (
        <div className="space-y-3">
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Name", "Role", "Status", "Joined", "Contact"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {mockResponders.map(r => (
                  <tr key={r.email} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${responderStatus[r.status]}`}/>
                        <p className="text-sm font-medium text-white">{r.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{r.role}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "active" ? "bg-green-500/20 text-green-400" : r.status === "standby" ? "bg-yellow-500/20 text-yellow-400" : "bg-slate-500/20 text-slate-400"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{elapsed(r.joined_at)} ago</td>
                    <td className="px-4 py-3 text-xs text-blue-400">{r.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Page additional responders */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-xs font-semibold text-white mb-3">Page Additional Responders</p>
            <div className="flex flex-wrap gap-2">
              {["Security Team", "Database On-Call", "Network On-Call", "Executive Escalation", "Customer Success"].map(team => (
                <button key={team} className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                  📟 Page {team}
                </button>
              ))}
            </div>
          </div>

          {/* Communication Templates */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-xs font-semibold text-white mb-3">Quick Communication Templates</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "📊 Status Page — Investigating", type: "status" },
                { label: "📧 Customer Email — Impact Notice", type: "email" },
                { label: "📊 Status Page — Mitigating", type: "status" },
                { label: "📧 Customer Email — All Clear", type: "email" },
              ].map((tpl, i) => (
                <button key={i} className="px-3 py-2 text-xs bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800/40 rounded-lg transition-colors text-left">
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
