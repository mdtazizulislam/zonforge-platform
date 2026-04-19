import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TimelineEvent {
  id: string;
  timestamp: string;
  source: string;
  event_type: string;
  description: string;
  actor: string;
  target?: string;
  ip_address?: string;
  country?: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  mitre_tactic?: string;
  mitre_technique?: string;
  mitre_id?: string;
  is_key_event: boolean;
  raw_event?: Record<string, string>;
}

interface Incident {
  id: string;
  title: string;
  status: "active" | "investigating" | "resolved" | "false_positive";
  severity: "critical" | "high" | "medium" | "low";
  affected_user?: string;
  affected_asset?: string;
  started_at: string;
  detected_at: string;
  resolved_at?: string;
  mttd_minutes: number;
  attack_stage: "reconnaissance" | "initial_access" | "execution" | "persistence" | "privilege_escalation" | "lateral_movement" | "exfiltration" | "impact";
  mitre_tactics: string[];
  confidence: number;
  timeline: TimelineEvent[];
  summary: string;
  recommended_actions: string[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockIncidents: Incident[] = [
  {
    id: "inc-001",
    title: "Credential Brute-Force → Account Takeover → Data Exfiltration",
    status: "investigating",
    severity: "critical",
    affected_user: "john.smith@acme.com",
    affected_asset: "prod-api-server-01",
    started_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    detected_at: new Date(Date.now() - 5.5 * 3600000).toISOString(),
    resolved_at: undefined,
    mttd_minutes: 31,
    attack_stage: "exfiltration",
    mitre_tactics: ["Credential Access", "Initial Access", "Collection", "Exfiltration"],
    confidence: 94,
    summary: "An attacker conducted a brute-force campaign against john.smith@acme.com using a Tor exit node, achieving a successful login after 23 failed attempts. The attacker then bypassed MFA via legacy authentication protocols and downloaded 847 files from SharePoint before creating a new AWS IAM key for persistence.",
    recommended_actions: [
      "Disable john.smith@acme.com account immediately",
      "Revoke all active sessions and the newly created IAM key",
      "Block legacy authentication protocols in M365",
      "Review all files accessed between 02:31–02:38 UTC",
      "Notify DPO if PII was included in downloaded files",
    ],
    timeline: [
      {
        id: "e1",
        timestamp: new Date(Date.now() - 6 * 3600000).toISOString(),
        source: "M365 Entra ID",
        event_type: "LOGIN_FAILED",
        description: "First failed login attempt detected from Tor exit node",
        actor: "john.smith@acme.com",
        ip_address: "185.220.101.42",
        country: "NL (Tor exit node)",
        severity: "medium",
        mitre_tactic: "Credential Access",
        mitre_technique: "Brute Force",
        mitre_id: "T1110",
        is_key_event: false,
      },
      {
        id: "e2",
        timestamp: new Date(Date.now() - 5.8 * 3600000).toISOString(),
        source: "M365 Entra ID",
        event_type: "LOGIN_FAILED_SPIKE",
        description: "23 failed login attempts in 17 minutes — brute-force pattern confirmed",
        actor: "john.smith@acme.com",
        ip_address: "185.220.101.42",
        country: "NL (Tor exit node)",
        severity: "high",
        mitre_tactic: "Credential Access",
        mitre_technique: "Brute Force",
        mitre_id: "T1110",
        is_key_event: true,
      },
      {
        id: "e3",
        timestamp: new Date(Date.now() - 5.5 * 3600000).toISOString(),
        source: "M365 Entra ID",
        event_type: "LOGIN_SUCCESS",
        description: "Successful login from Nigeria — country never seen for this user. MFA not challenged (legacy auth used).",
        actor: "john.smith@acme.com",
        ip_address: "41.215.100.8",
        country: "NG 🇳🇬",
        severity: "critical",
        mitre_tactic: "Initial Access",
        mitre_technique: "Valid Accounts",
        mitre_id: "T1078",
        is_key_event: true,
      },
      {
        id: "e4",
        timestamp: new Date(Date.now() - 5.4 * 3600000).toISOString(),
        source: "M365 Entra ID",
        event_type: "MFA_BYPASS",
        description: "Authentication completed without MFA challenge via legacy SMTP/IMAP authentication protocol",
        actor: "john.smith@acme.com",
        ip_address: "41.215.100.8",
        country: "NG 🇳🇬",
        severity: "critical",
        mitre_tactic: "Defense Evasion",
        mitre_technique: "Use Alternate Authentication Material",
        mitre_id: "T1550",
        is_key_event: true,
      },
      {
        id: "e5",
        timestamp: new Date(Date.now() - 5.2 * 3600000).toISOString(),
        source: "M365 SharePoint",
        event_type: "FILE_DOWNLOAD_BULK",
        description: "847 files downloaded from SharePoint /HR/Confidential and /Finance/ in under 3 minutes",
        actor: "john.smith@acme.com",
        ip_address: "41.215.100.8",
        country: "NG 🇳🇬",
        severity: "critical",
        mitre_tactic: "Collection",
        mitre_technique: "Data from Cloud Storage",
        mitre_id: "T1530",
        is_key_event: true,
      },
      {
        id: "e6",
        timestamp: new Date(Date.now() - 5.0 * 3600000).toISOString(),
        source: "AWS CloudTrail",
        event_type: "IAM_ACCESS_KEY_CREATED",
        description: "New programmatic IAM access key created — likely for persistence after potential password reset",
        actor: "john.smith@acme.com",
        ip_address: "41.215.100.8",
        country: "NG 🇳🇬",
        severity: "critical",
        mitre_tactic: "Persistence",
        mitre_technique: "Account Manipulation",
        mitre_id: "T1098",
        is_key_event: true,
      },
      {
        id: "e7",
        timestamp: new Date(Date.now() - 4.8 * 3600000).toISOString(),
        source: "AWS CloudTrail",
        event_type: "S3_LIST_BUCKETS",
        description: "ListBuckets API called — attacker enumerating S3 storage for further exfiltration targets",
        actor: "john.smith@acme.com",
        ip_address: "41.215.100.8",
        country: "NG 🇳🇬",
        severity: "high",
        mitre_tactic: "Discovery",
        mitre_technique: "Cloud Storage Object Discovery",
        mitre_id: "T1619",
        is_key_event: false,
      },
      {
        id: "e8",
        timestamp: new Date(Date.now() - 4.6 * 3600000).toISOString(),
        source: "ZonForge Sentinel",
        event_type: "ALERT_TRIGGERED",
        description: "ZonForge Sentinel correlated 4 signals into P1 alert: Brute-Force → Account Takeover → Exfiltration chain detected",
        actor: "ZonForge Sentinel",
        severity: "critical",
        is_key_event: true,
      },
    ],
  },
  {
    id: "inc-002",
    title: "Suspicious Admin Account Activation — Off-Hours Access",
    status: "resolved",
    severity: "high",
    affected_user: "svc-deploy@acme.com",
    started_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    detected_at: new Date(Date.now() - 2 * 86400000 + 900000).toISOString(),
    resolved_at: new Date(Date.now() - 2 * 86400000 + 7200000).toISOString(),
    mttd_minutes: 15,
    attack_stage: "privilege_escalation",
    mitre_tactics: ["Persistence", "Privilege Escalation"],
    confidence: 78,
    summary: "A dormant service account inactive for 94 days suddenly performed privileged operations at 03:42 UTC. The account assigned itself to the Global Administrator role. Investigation confirmed unauthorized access via a leaked API key found on GitHub.",
    recommended_actions: [
      "Rotate all service account credentials immediately",
      "Enable secret scanning in GitHub repositories",
      "Audit all admin role assignments in the last 30 days",
    ],
    timeline: [
      {
        id: "f1",
        timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
        source: "M365 Entra ID",
        event_type: "SERVICE_ACCOUNT_LOGIN",
        description: "svc-deploy account logged in after 94 days of inactivity at 03:42 UTC (outside business hours)",
        actor: "svc-deploy@acme.com",
        ip_address: "104.21.44.12",
        country: "US",
        severity: "high",
        mitre_tactic: "Persistence",
        mitre_technique: "Valid Accounts: Service Accounts",
        mitre_id: "T1078.003",
        is_key_event: true,
      },
      {
        id: "f2",
        timestamp: new Date(Date.now() - 2 * 86400000 + 300000).toISOString(),
        source: "M365 Entra ID",
        event_type: "ROLE_ASSIGNMENT",
        description: "Global Administrator role assigned to svc-deploy@acme.com — unauthorized privilege escalation",
        actor: "svc-deploy@acme.com",
        ip_address: "104.21.44.12",
        country: "US",
        severity: "critical",
        mitre_tactic: "Privilege Escalation",
        mitre_technique: "Valid Accounts",
        mitre_id: "T1078",
        is_key_event: true,
      },
      {
        id: "f3",
        timestamp: new Date(Date.now() - 2 * 86400000 + 900000).toISOString(),
        source: "ZonForge Sentinel",
        event_type: "ALERT_TRIGGERED",
        description: "Alert: Dormant service account with sudden privilege escalation — MTTD: 15 minutes",
        actor: "ZonForge Sentinel",
        severity: "critical",
        is_key_event: true,
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sevColor: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-green-400 bg-green-500/10 border-green-500/30",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

const sevDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
  info: "bg-blue-500",
};

const statusBadge: Record<string, string> = {
  active: "bg-red-500/20 text-red-400 border-red-500/30",
  investigating: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  false_positive: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const tacticColor: Record<string, string> = {
  "Credential Access": "#ef4444",
  "Initial Access": "#f97316",
  "Execution": "#eab308",
  "Persistence": "#8b5cf6",
  "Privilege Escalation": "#ec4899",
  "Defense Evasion": "#6366f1",
  "Discovery": "#06b6d4",
  "Lateral Movement": "#14b8a6",
  "Collection": "#84cc16",
  "Exfiltration": "#f43f5e",
  "Impact": "#dc2626",
};

const stageOrder = [
  "reconnaissance", "initial_access", "execution", "persistence",
  "privilege_escalation", "lateral_movement", "exfiltration", "impact",
];

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Attack Chain Progress Bar ────────────────────────────────────────────────
function AttackChainBar({ currentStage, tactics }: { currentStage: string; tactics: string[] }) {
  const stages = [
    { id: "initial_access", label: "Initial Access", short: "Access" },
    { id: "execution", label: "Execution", short: "Execute" },
    { id: "persistence", label: "Persistence", short: "Persist" },
    { id: "privilege_escalation", label: "Priv. Escalation", short: "Escalate" },
    { id: "lateral_movement", label: "Lateral Movement", short: "Lateral" },
    { id: "exfiltration", label: "Exfiltration", short: "Exfil" },
    { id: "impact", label: "Impact", short: "Impact" },
  ];

  const currentIdx = stageOrder.indexOf(currentStage);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Kill Chain Progress</p>
      <div className="flex items-center gap-0">
        {stages.map((stage, i) => {
          const stageIdx = stageOrder.indexOf(stage.id);
          const isPast = stageIdx < currentIdx;
          const isCurrent = stage.id === currentStage;
          const isFuture = stageIdx > currentIdx;

          return (
            <div key={stage.id} className="flex items-center flex-1">
              <div className={`relative flex-1 text-center group`}>
                <div className={`py-2 px-1 rounded transition-all ${
                  isCurrent ? "bg-red-600 text-white" :
                  isPast ? "bg-red-900/60 text-red-300" :
                  "bg-slate-800 text-slate-500"
                }`}>
                  <p className="text-xs font-medium truncate">{stage.short}</p>
                </div>
                {isCurrent && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
              {i < stages.length - 1 && (
                <div className={`w-3 h-0.5 flex-shrink-0 ${isPast || isCurrent ? "bg-red-600" : "bg-slate-700"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timeline Component ───────────────────────────────────────────────────────
function IncidentTimelinePanel({ incident }: { incident: Incident }) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayed = showAll ? incident.timeline : incident.timeline.filter(e => e.is_key_event || incident.timeline.indexOf(e) === 0);

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-700" />

      <div className="space-y-3">
        {displayed.map((event, i) => (
          <div key={event.id} className="relative flex gap-4">
            {/* Dot */}
            <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
              event.is_key_event
                ? `${sevDot[event.severity]} border-slate-900`
                : "bg-slate-800 border-slate-700"
            }`}>
              {event.is_key_event ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <div className={`w-3 h-3 rounded-full ${sevDot[event.severity]}`} />
              )}
            </div>

            {/* Event Card */}
            <div className={`flex-1 rounded-xl border p-4 mb-1 transition-all cursor-pointer ${
              event.is_key_event
                ? `bg-slate-900 ${sevColor[event.severity].split(" ")[2]}`
                : "bg-slate-900 border-slate-800"
            } hover:border-slate-600`}
              onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}>

              {/* Event header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {event.is_key_event && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${sevColor[event.severity]}`}>
                        {event.severity.toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                      {event.event_type}
                    </span>
                    <span className="text-xs text-slate-500">{event.source}</span>
                    {event.mitre_id && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-mono text-white"
                        style={{ backgroundColor: tacticColor[event.mitre_tactic ?? ""] ?? "#475569" }}>
                        {event.mitre_id}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white font-medium">{event.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-mono text-slate-300">{formatTime(event.timestamp)}</p>
                  <p className="text-xs text-slate-500">{formatDate(event.timestamp)}</p>
                </div>
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                <span>👤 {event.actor}</span>
                {event.ip_address && <span>🌐 {event.ip_address}</span>}
                {event.country && <span>📍 {event.country}</span>}
                {event.target && <span>🎯 {event.target}</span>}
              </div>

              {/* Expanded detail */}
              {expandedEvent === event.id && event.mitre_tactic && (
                <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2 py-1 rounded font-medium text-white"
                      style={{ backgroundColor: tacticColor[event.mitre_tactic] ?? "#475569" }}>
                      {event.mitre_tactic}
                    </span>
                    <span className="text-xs text-slate-300">{event.mitre_technique}</span>
                    <a href={`https://attack.mitre.org/techniques/${event.mitre_id?.replace(".", "/")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 ml-auto" onClick={e => e.stopPropagation()}>
                      View {event.mitre_id} on MITRE →
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Show all toggle */}
      {incident.timeline.filter(e => !e.is_key_event).length > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 ml-16 text-xs text-blue-400 hover:text-blue-300 transition-colors">
          {showAll
            ? "▲ Show key events only"
            : `▼ Show all ${incident.timeline.length} events (including ${incident.timeline.filter(e => !e.is_key_event).length} supporting events)`}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function IncidentTimeline() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(mockIncidents[0].id);
  const [statusFilter, setStatusFilter] = useState("");

  const { data: incidents = mockIncidents } = useQuery<Incident[]>({
    queryKey: ["incidents"],
    queryFn: async () => {
      const res = await apiClient.get("/incidents");
      return res.data.data;
    },
  });

  const filtered = incidents.filter(i => !statusFilter || i.status === statusFilter);
  const selected = incidents.find(i => i.id === selectedId) ?? incidents[0];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Incident Timeline</h1>
        <p className="text-slate-400 text-sm mt-1">Visual attack chain analysis with MITRE ATT&CK mapping</p>
      </div>

      <div className="flex gap-5">
        {/* Left — Incident List */}
        <div className="w-80 flex-shrink-0 space-y-3">
          {/* Filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Incidents</option>
            <option value="active">Active</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Incident Cards */}
          {filtered.map(inc => (
            <div key={inc.id}
              onClick={() => setSelectedId(inc.id)}
              className={`bg-slate-900 rounded-xl border p-4 cursor-pointer transition-all hover:border-slate-600 ${
                selectedId === inc.id ? "border-blue-600 ring-1 ring-blue-600/30" : "border-slate-800"
              }`}>
              <div className="flex items-start gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${statusBadge[inc.status]}`}>
                  {inc.status}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full border ${sevColor[inc.severity]}`}>
                  {inc.severity}
                </span>
              </div>
              <p className="text-xs font-medium text-white leading-snug mb-2">{inc.title}</p>
              <div className="space-y-1">
                {inc.affected_user && (
                  <p className="text-xs text-slate-400">👤 {inc.affected_user}</p>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">{timeAgo(inc.started_at)}</p>
                  <p className="text-xs text-slate-400">MTTD: {inc.mttd_minutes}m</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right — Selected Incident Detail */}
        {selected && (
          <div className="flex-1 min-w-0 space-y-4">
            {/* Incident Header */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadge[selected.status]}`}>
                      {selected.status}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${sevColor[selected.severity]}`}>
                      {selected.severity}
                    </span>
                    <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                      {selected.confidence}% confidence
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white">{selected.title}</h2>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-400">MTTD</p>
                  <p className="text-xl font-bold text-white">{selected.mttd_minutes}m</p>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                {[
                  { label: "Started", value: `${formatDate(selected.started_at)} ${formatTime(selected.started_at)}` },
                  { label: "Detected", value: `${formatDate(selected.detected_at)} ${formatTime(selected.detected_at)}` },
                  { label: "Duration", value: selected.resolved_at ? `${Math.floor((new Date(selected.resolved_at).getTime() - new Date(selected.started_at).getTime()) / 60000)}m` : "Ongoing" },
                ].map((m, i) => (
                  <div key={i} className="bg-slate-800 rounded-lg p-2.5">
                    <p className="text-xs text-slate-400">{m.label}</p>
                    <p className="text-xs font-medium text-white mt-0.5">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* MITRE Tactics */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selected.mitre_tactics.map(tactic => (
                  <span key={tactic} className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                    style={{ backgroundColor: tacticColor[tactic] ?? "#475569" }}>
                    {tactic}
                  </span>
                ))}
              </div>

              {/* Summary */}
              <p className="text-sm text-slate-300 leading-relaxed">{selected.summary}</p>
            </div>

            {/* Kill Chain Progress */}
            <AttackChainBar currentStage={selected.attack_stage} tactics={selected.mitre_tactics} />

            {/* Timeline */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <h3 className="text-sm font-semibold text-white mb-4">
                Event Timeline
                <span className="ml-2 text-xs text-slate-400 font-normal">
                  {selected.timeline.length} events · {selected.timeline.filter(e => e.is_key_event).length} key
                </span>
              </h3>
              <IncidentTimelinePanel incident={selected} />
            </div>

            {/* Recommended Actions */}
            <div className="bg-slate-900 rounded-xl border border-orange-900/40 p-5">
              <h3 className="text-sm font-semibold text-white mb-3">⚡ Recommended Actions</h3>
              <div className="space-y-2">
                {selected.recommended_actions.map((action, i) => (
                  <label key={i} className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" className="mt-0.5 rounded border-slate-600 bg-slate-800 text-orange-600 flex-shrink-0" />
                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{action}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
