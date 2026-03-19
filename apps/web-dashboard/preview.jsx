import { useState, useEffect, useRef } from "react"

// ── Mock Data ──────────────────────────────────────────────────────

const MOCK_ALERTS = [
  { id: "a1", title: "Brute Force Login → Account Takeover Detected", severity: "critical", priority: "P1", status: "open", mitre: ["T1110", "T1078"], time: "3m ago", entity: "alice@acme.com", sla: true },
  { id: "a2", title: "Impossible Travel: US → IN within 45 minutes", severity: "critical", priority: "P1", status: "investigating", mitre: ["T1078.004"], time: "11m ago", entity: "bob@acme.com", sla: false },
  { id: "a3", title: "Mass File Download — 847 files in 3 minutes", severity: "high", priority: "P2", status: "open", mitre: ["T1530"], time: "28m ago", entity: "carol@acme.com", sla: false },
  { id: "a4", title: "AWS Root Account Login at 03:17 UTC", severity: "high", priority: "P2", status: "open", mitre: ["T1078.004"], time: "1h ago", entity: "root", sla: false },
  { id: "a5", title: "Email Auto-Forward Rule → External Domain", severity: "medium", priority: "P3", status: "open", mitre: ["T1114.003"], time: "2h ago", entity: "dave@acme.com", sla: false },
  { id: "a6", title: "Off-Hours Admin Activity Detected", severity: "medium", priority: "P3", status: "investigating", mitre: ["T1078"], time: "3h ago", entity: "svc-deploy", sla: false },
  { id: "a7", title: "New OAuth App Granted Mail.ReadWrite", severity: "low", priority: "P4", status: "resolved", mitre: ["T1550.001"], time: "5h ago", entity: "api-client", sla: false },
]

const CONNECTORS = [
  { name: "Microsoft 365", type: "m365_entra", status: "active", healthy: true, lag: "8s", lastEvent: "just now" },
  { name: "AWS CloudTrail", type: "aws_cloudtrail", status: "active", healthy: true, lag: "22s", lastEvent: "15s ago" },
  { name: "Google Workspace", type: "google_workspace", status: "error", healthy: false, lag: null, lastEvent: "2h ago" },
]

const RISK_USERS = [
  { id: "u1", name: "alice@acme.com", score: 91, severity: "critical", signals: ["brute_force", "alert_history"] },
  { id: "u2", name: "bob@acme.com", score: 78, severity: "high", signals: ["impossible_travel", "new_country"] },
  { id: "u3", name: "carol@acme.com", score: 63, severity: "medium", signals: ["mass_download"] },
  { id: "u4", name: "svc-deploy", score: 47, severity: "medium", signals: ["off_hours", "service_account"] },
  { id: "u5", name: "dave@acme.com", score: 31, severity: "low", signals: ["email_forward"] },
]

const TREND_DATA = [12, 8, 15, 23, 11, 9, 18, 31, 27, 19, 24, 16, 22, 35, 28, 20, 14, 17, 26, 33, 21, 18, 25, 29, 16, 22, 19, 15, 28, 24]

const MITRE_COVERAGE = {
  "TA0001": { name: "Initial Access", covered: 7, total: 9 },
  "TA0002": { name: "Execution", covered: 2, total: 8 },
  "TA0003": { name: "Persistence", covered: 4, total: 11 },
  "TA0004": { name: "Priv. Escalation", covered: 5, total: 10 },
  "TA0006": { name: "Credential Access", covered: 6, total: 8 },
  "TA0008": { name: "Lateral Movement", covered: 3, total: 7 },
  "TA0009": { name: "Collection", covered: 2, total: 9 },
  "TA0010": { name: "Exfiltration", covered: 4, total: 6 },
  "TA0040": { name: "Impact", covered: 3, total: 5 },
}

// ── Helpers ────────────────────────────────────────────────────────

const sevColor = (s) => ({ critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6", info: "#6b7280" }[s] || "#6b7280")
const sevBg = (s) => ({ critical: "rgba(239,68,68,.12)", high: "rgba(249,115,22,.12)", medium: "rgba(234,179,8,.12)", low: "rgba(59,130,246,.12)" }[s] || "rgba(107,114,128,.12)")
const priDot = (p) => ({ P1: "#ef4444", P2: "#f97316", P3: "#eab308", P4: "#3b82f6" }[p] || "#6b7280")
const statusColor = (s) => ({ open: "#ef4444", investigating: "#eab308", resolved: "#22c55e", false_positive: "#6b7280" }[s] || "#6b7280")

function ScoreRing({ score, size = 80 }) {
  const r = size * 0.37
  const c = 2 * Math.PI * r
  const fill = (score / 100) * c
  const color = score >= 85 ? "#ef4444" : score >= 70 ? "#f97316" : score >= 50 ? "#eab308" : score >= 25 ? "#3b82f6" : "#22c55e"
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth={size*0.075} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.075}
          strokeLinecap="round" strokeDasharray={`${fill} ${c}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray .8s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.22, fontWeight: 800, color, fontFamily: "monospace" }}>{score}</span>
      </div>
    </div>
  )
}

function PostureArc({ score }) {
  const w = 160, h = 90, r = 68
  const startAngle = Math.PI
  const endAngle = 2 * Math.PI
  const fillAngle = startAngle + (score / 100) * Math.PI
  const x1 = w/2 + r * Math.cos(startAngle), y1 = h - 5 + r * Math.sin(startAngle)
  const x2 = w/2 + r * Math.cos(fillAngle), y2 = h - 5 + r * Math.sin(fillAngle)
  const large = score > 50 ? 1 : 0
  const trackX1 = w/2 + r, trackX2 = w/2 - r
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#3b82f6" : score >= 40 ? "#eab308" : "#ef4444"
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={`M ${w/2-r} ${h-5} A ${r} ${r} 0 0 1 ${w/2+r} ${h-5}`} fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round" />
      <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" style={{ transition: "d .8s ease" }} />
      <text x={w/2} y={h-18} textAnchor="middle" fill={color} fontSize="22" fontWeight="800" fontFamily="monospace">{score}</text>
      <text x={w/2} y={h-4} textAnchor="middle" fill="#6b7280" fontSize="10" fontWeight="500">POSTURE SCORE</text>
    </svg>
  )
}

function TrendSparkline({ data }) {
  const w = 200, h = 48
  const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 8) - 4}`)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`M ${pts.join(" L ")} L ${w},${h} L 0,${h} Z`} fill="url(#tg)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Main Component ─────────────────────────────────────────────────

export default function ZonForgeDashboard() {
  const [activeTab, setActiveTab] = useState("overview")
  const [selectedAlert, setSelectedAlert] = useState(MOCK_ALERTS[0])
  const [liveCount, setLiveCount] = useState(847)
  const [pulseAlerts, setPulse] = useState(false)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => {
      setLiveCount(c => c + Math.floor(Math.random() * 12))
      setTime(new Date())
    }, 2000)
    const p = setInterval(() => {
      setPulse(true)
      setTimeout(() => setPulse(false), 600)
    }, 8000)
    return () => { clearInterval(t); clearInterval(p) }
  }, [])

  const styles = {
    root: { fontFamily: "'JetBrains Mono', 'Fira Code', monospace", background: "#030712", color: "#e5e7eb", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontSize: "13px" },
    topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #111827", background: "rgba(3,7,18,.95)", backdropFilter: "blur(12px)", flexShrink: 0 },
    logo: { display: "flex", alignItems: "center", gap: "10px" },
    logoMark: { width: 30, height: 30, background: "linear-gradient(135deg, #1d4ed8, #7c3aed)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" },
    logoText: { fontSize: 15, fontWeight: 800, letterSpacing: "-0.5px", color: "#f9fafb" },
    logoSub: { fontSize: 10, color: "#4b5563", letterSpacing: "2px", textTransform: "uppercase" },
    nav: { display: "flex", gap: 4 },
    navBtn: (active) => ({ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all .15s", background: active ? "rgba(59,130,246,.15)" : "transparent", color: active ? "#60a5fa" : "#6b7280", borderBottom: active ? "1px solid #3b82f6" : "1px solid transparent" }),
    topRight: { display: "flex", alignItems: "center", gap: 12 },
    pipelineDot: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)", color: "#4ade80", fontSize: 11, fontWeight: 600 },
    body: { flex: 1, overflow: "hidden", display: "flex" },
    sidebar: { width: 200, borderRight: "1px solid #111827", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" },
    sidebarHeader: { padding: "12px 16px 8px", borderBottom: "1px solid #0f172a" },
    sidebarTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px" },
    badge: (n) => ({ background: n > 0 ? "#ef4444" : "#374151", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "center" }),
    alertList: { flex: 1, overflowY: "auto", scrollbarWidth: "none" },
    alertRow: (active, sev) => ({ padding: "10px 14px", borderBottom: "1px solid #0f172a", cursor: "pointer", background: active ? `${sevBg(sev)}` : "transparent", borderLeft: active ? `2px solid ${sevColor(sev)}` : "2px solid transparent", transition: "all .1s" }),
    main: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" },
    content: { flex: 1, overflowY: "auto", padding: 20, scrollbarWidth: "thin", scrollbarColor: "#1f2937 transparent" },
    card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
    grid4: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 },
    label: { fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 },
    bigNum: (color) => ({ fontSize: 28, fontWeight: 800, color: color || "#f9fafb", fontFamily: "monospace", lineHeight: 1 }),
    chip: (sev) => ({ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: sevBg(sev), color: sevColor(sev), textTransform: "uppercase", letterSpacing: "0.5px" }),
    priChip: (p) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${priDot(p)}22`, color: priDot(p) }),
    statChip: (s) => ({ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: `${statusColor(s)}18`, color: statusColor(s), textTransform: "capitalize" }),
    mitreTag: { padding: "1px 6px", borderRadius: 4, background: "#161b22", color: "#8b949e", fontSize: 10, fontFamily: "monospace", border: "1px solid #21262d" },
    divider: { height: 1, background: "#161b22", margin: "14px 0" },
    riskBar: { height: 4, borderRadius: 2, background: "#161b22", overflow: "hidden" },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 },
    narrativeBox: { background: "linear-gradient(135deg, rgba(59,130,246,.05), rgba(124,58,237,.05))", border: "1px solid rgba(59,130,246,.2)", borderRadius: 10, padding: 14 },
    sparkleIcon: { fontSize: 13, marginRight: 4 },
  }

  const openP1 = MOCK_ALERTS.filter(a => a.priority === "P1" && a.status !== "resolved").length
  const openTotal = MOCK_ALERTS.filter(a => a.status !== "resolved").length

  // ── Overview Tab ───────────────────────────────────────────────

  const OverviewTab = () => (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#f9fafb", marginBottom: 2 }}>Good afternoon, Alice</div>
        <div style={{ color: "#4b5563", fontSize: 11 }}>{time.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · Tenant: Acme Corp</div>
      </div>

      {/* KPI row */}
      <div style={styles.grid4}>
        {[
          { label: "Open Critical", value: openP1, color: openP1 > 0 ? "#ef4444" : "#6b7280", sub: `${openTotal} total open` },
          { label: "Posture Score", value: "68/100", color: "#eab308", sub: "Fair — needs attention" },
          { label: "MTTD (P50)", value: "14m", color: "#60a5fa", sub: "Median detection time" },
          { label: "Connectors", value: "2/3", color: "#f97316", sub: "1 connector error" },
        ].map(k => (
          <div key={k.label} style={styles.card}>
            <div style={styles.label}>{k.label}</div>
            <div style={styles.bigNum(k.color)}>{k.value}</div>
            <div style={{ color: "#4b5563", fontSize: 10, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr", gap: 16 }}>

        {/* Posture gauge */}
        <div style={styles.card}>
          <div style={styles.label}>Security Posture</div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <PostureArc score={68} />
          </div>
          <div style={styles.divider} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, textAlign: "center" }}>
            <div style={{ ...styles.card, padding: 8, background: "#0a0f1a" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f97316", fontFamily: "monospace" }}>3</div>
              <div style={{ color: "#6b7280", fontSize: 9 }}>High alerts</div>
            </div>
            <div style={{ ...styles.card, padding: 8, background: "#0a0f1a" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#9ca3af", fontFamily: "monospace" }}>47</div>
              <div style={{ color: "#6b7280", fontSize: 9 }}>Avg user risk</div>
            </div>
          </div>
        </div>

        {/* Alert trend + recent */}
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={styles.label}>Alert Trend (30 days)</div>
            <div style={{ fontSize: 10, color: "#4b5563" }}>{liveCount.toLocaleString()} events today</div>
          </div>
          <TrendSparkline data={TREND_DATA} />
          <div style={styles.divider} />
          <div style={styles.label}>Recent Alerts</div>
          {MOCK_ALERTS.slice(0, 4).map(a => (
            <div key={a.id} onClick={() => { setActiveTab("alerts"); setSelectedAlert(a) }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #0f172a", cursor: "pointer" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: sevColor(a.severity), flexShrink: 0, animation: a.priority === "P1" && a.status !== "resolved" ? "pulse 2s infinite" : "none" }} />
              <span style={{ flex: 1, color: "#d1d5db", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
              <span style={styles.chip(a.severity)}>{a.severity}</span>
              <span style={{ color: "#4b5563", fontSize: 10, flexShrink: 0 }}>{a.time}</span>
            </div>
          ))}
        </div>

        {/* Connectors + top risk */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={styles.card}>
            <div style={styles.label}>Data Connectors</div>
            {CONNECTORS.map(c => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #0f172a" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.healthy ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#d1d5db", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ color: "#4b5563", fontSize: 10 }}>{c.status === "error" ? "⚠ Error" : `lag: ${c.lag}`}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={styles.card}>
            <div style={styles.label}>Top Risk Users</div>
            {RISK_USERS.slice(0, 3).map((u, i) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: i === 0 ? "rgba(239,68,68,.2)" : i === 1 ? "rgba(249,115,22,.2)" : "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: i === 0 ? "#ef4444" : i === 1 ? "#f97316" : "#9ca3af", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 10, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                <div style={styles.chip(u.severity)}>{u.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // ── Alert Center Tab ───────────────────────────────────────────

  const AlertTab = () => (
    <div style={{ display: "flex", height: "100%", gap: 16 }}>

      {/* Alert detail */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...styles.card, marginBottom: 12, background: `linear-gradient(135deg, ${sevBg(selectedAlert.severity)}, transparent)`, borderColor: `${sevColor(selectedAlert.severity)}33` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={styles.priChip(selectedAlert.priority)}><span style={{ width: 6, height: 6, borderRadius: "50%", background: priDot(selectedAlert.priority), display: "inline-block" }} />{selectedAlert.priority}</span>
            <span style={styles.chip(selectedAlert.severity)}>{selectedAlert.severity}</span>
            <span style={styles.statChip(selectedAlert.status)}>{selectedAlert.status}</span>
            {selectedAlert.sla && <span style={{ padding: "2px 8px", borderRadius: 20, background: "rgba(239,68,68,.15)", color: "#f87171", fontSize: 10, fontWeight: 700, border: "1px solid rgba(239,68,68,.3)" }}>⚠ SLA Breach</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 6 }}>{selectedAlert.title}</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Affected entity: <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>{selectedAlert.entity}</span> · {selectedAlert.time}</div>
        </div>

        {/* Action bar */}
        <div style={{ ...styles.card, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#4b5563", marginRight: 4 }}>ACTIONS:</span>
          {[
            { label: "Investigate", color: "#eab308" },
            { label: "Resolve", color: "#22c55e" },
            { label: "Suppress", color: "#6b7280" },
            { label: "False Positive", color: "#6b7280" },
          ].map(a => (
            <button key={a.label} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${a.color}33`, background: `${a.color}10`, color: a.color, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {a.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.1)", color: "#4ade80", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>👍 TP</button>
            <button style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.1)", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>👎 FP</button>
          </div>
        </div>

        {/* AI Narrative */}
        <div style={{ ...styles.card, ...styles.narrativeBox }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span>✨</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "1px" }}>AI Investigation Summary</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#4b5563" }}>claude-sonnet-4</span>
          </div>

          {selectedAlert.id === "a1" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...styles.label, color: "#6b7280", marginBottom: 6 }}>What Happened</div>
                <div style={{ color: "#d1d5db", lineHeight: 1.6, fontSize: 12 }}>Between 02:14–02:31 UTC, the account alice@acme.com received 47 failed authentication attempts from IP 45.33.32.156 (Linode, US), followed by a successful login at 02:31 UTC. The successful login immediately preceded access to 12 SharePoint document libraries and 3 OneDrive shared drives — activity inconsistent with Alice's normal 09:00–18:00 work pattern.</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...styles.label, color: "#6b7280", marginBottom: 6 }}>Why It Matters</div>
                <div style={{ color: "#d1d5db", lineHeight: 1.6, fontSize: 12 }}>Alice holds TENANT_ADMIN role with access to all tenant data. Post-compromise access to sensitive document libraries suggests an adversary in active reconnaissance or data collection phase. MTTD: 3 minutes from first signal.</div>
              </div>
              <div style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 8, padding: 12 }}>
                <div style={{ ...styles.label, color: "#60a5fa", marginBottom: 8 }}>Recommended Next Steps</div>
                {["Immediately contact Alice through out-of-band channel (phone)", "Suspend all active sessions for alice@acme.com NOW", "Force password reset before allowing re-access", "Review all SharePoint/OneDrive access in the 30-min post-compromise window", "Check for new email forwarding rules or OAuth grants"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(59,130,246,.2)", color: "#60a5fa", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i+1}</span>
                    <span style={{ color: "#d1d5db", fontSize: 11, lineHeight: 1.5 }}>{s}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {selectedAlert.id !== "a1" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...styles.label, color: "#6b7280", marginBottom: 6 }}>What Happened</div>
                <div style={{ color: "#d1d5db", lineHeight: 1.6, fontSize: 12 }}>Detection rule {selectedAlert.mitre[0]} triggered for entity {selectedAlert.entity}. {selectedAlert.title} — investigation required to determine scope and impact.</div>
              </div>
              <div style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", borderRadius: 8, padding: 12 }}>
                <div style={{ ...styles.label, color: "#60a5fa", marginBottom: 8 }}>Recommended Actions</div>
                {["Review immediately", "Verify with affected user through out-of-band channel", "Check for additional signals in the same time window"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(59,130,246,.2)", color: "#60a5fa", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i+1}</span>
                    <span style={{ color: "#d1d5db", fontSize: 11 }}>{s}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Context panel */}
      <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={styles.card}>
          <div style={styles.label}>MITRE ATT&CK</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 4 }}>TACTICS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <span style={{ ...styles.mitreTag, background: "rgba(239,68,68,.1)", color: "#f87171", border: "1px solid rgba(239,68,68,.2)" }}>TA0006</span>
              <span style={{ ...styles.mitreTag, background: "rgba(239,68,68,.1)", color: "#f87171", border: "1px solid rgba(239,68,68,.2)" }}>TA0001</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#4b5563", marginBottom: 4 }}>TECHNIQUES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {selectedAlert.mitre.map(t => <span key={t} style={styles.mitreTag}>{t}</span>)}
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Entity Risk Score</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ScoreRing score={selectedAlert.id === "a1" ? 91 : selectedAlert.id === "a2" ? 78 : 63} size={56} />
            <div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{selectedAlert.entity}</div>
              <div style={styles.chip(selectedAlert.severity)}>{selectedAlert.severity} risk</div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>Timeline</div>
          {[
            { label: "Alert created", icon: "🚨", time: selectedAlert.time },
            { label: "First signal", icon: "⚡", time: "~3m earlier" },
            { label: "AI narrative", icon: "✨", time: "auto-generated" },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>{e.icon}</div>
                {i < 2 && <div style={{ width: 1, height: 12, background: "#374151", margin: "2px 0" }} />}
              </div>
              <div>
                <div style={{ color: "#d1d5db", fontSize: 11 }}>{e.label}</div>
                <div style={{ color: "#4b5563", fontSize: 10 }}>{e.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── Risk Tab ────────────────────────────────────────────────────

  const RiskTab = () => (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, height: "100%" }}>
      <div>
        <div style={{ ...styles.card, marginBottom: 12, textAlign: "center" }}>
          <div style={styles.label}>Org Posture</div>
          <PostureArc score={68} />
        </div>
        <div style={styles.card}>
          <div style={styles.label}>Top Risk Users</div>
          {RISK_USERS.map((u, i) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: i < RISK_USERS.length - 1 ? "1px solid #0f172a" : "none" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "rgba(239,68,68,.15)" : i === 1 ? "rgba(249,115,22,.15)" : "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: i < 2 ? sevColor(u.severity) : "#9ca3af", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#d1d5db", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                <div style={styles.riskBar}>
                  <div style={{ height: "100%", width: `${u.score}%`, background: sevColor(u.severity), borderRadius: 2, transition: "width .6s" }} />
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: sevColor(u.severity), fontFamily: "monospace" }}>{u.score}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={styles.card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", marginBottom: 4 }}>alice@acme.com</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <span style={styles.chip("critical")}>critical risk</span>
          <span style={{ fontSize: 10, color: "#6b7280" }}>high confidence · updated 3m ago</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
          <ScoreRing score={91} size={80} />
          <div style={{ flex: 1 }}>
            <div style={{ ...styles.label, marginBottom: 12 }}>Risk Drivers</div>
            {[
              { label: "Behavior (alerts)", contribution: 27, max: 30 },
              { label: "Correlation signals", contribution: 23, max: 25 },
              { label: "Alert history (90d)", contribution: 13, max: 15 },
              { label: "Privilege bonus (+50%)", contribution: 18, max: 30 },
            ].map(d => (
              <div key={d.label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>{d.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", fontFamily: "monospace" }}>+{d.contribution}</span>
                </div>
                <div style={styles.riskBar}>
                  <div style={{ height: "100%", width: `${(d.contribution / d.max) * 100}%`, background: "rgba(59,130,246,.7)", borderRadius: 2, transition: "width .6s" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={styles.divider} />
        <div style={styles.label}>Recommended Actions</div>
        {["Immediate analyst investigation required", "Consider suspending TENANT_ADMIN account pending review", "Revoke active sessions and require re-authentication", "Review all recent activity for unauthorized actions"].map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(239,68,68,.15)", color: "#f87171", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i+1}</span>
            <span style={{ color: "#d1d5db", fontSize: 11 }}>{a}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Compliance Tab ─────────────────────────────────────────────

  const ComplianceTab = () => (
    <div>
      <div style={styles.grid3}>
        <div style={{ ...styles.card, textAlign: "center" }}>
          <div style={styles.bigNum("#60a5fa")}>67%</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>ATT&CK Coverage</div>
          <div style={{ color: "#4b5563", fontSize: 10, marginTop: 4 }}>38 of 57 techniques</div>
        </div>
        <div style={{ ...styles.card, textAlign: "center" }}>
          <div style={styles.bigNum("#60a5fa")}>20</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Active Rules</div>
          <div style={{ color: "#4b5563", fontSize: 10, marginTop: 4 }}>All enabled</div>
        </div>
        <div style={{ ...styles.card, textAlign: "center" }}>
          <div style={styles.bigNum("#22c55e")}>Verified</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>Audit Chain</div>
          <div style={{ color: "#4b5563", fontSize: 10, marginTop: 4 }}>SHA-256 intact</div>
        </div>
      </div>
      <div style={{ ...styles.card, marginTop: 16 }}>
        <div style={styles.label}>MITRE ATT&CK Coverage Heatmap</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 8, marginTop: 12 }}>
          {Object.entries(MITRE_COVERAGE).map(([id, tac]) => {
            const pct = tac.covered / tac.total
            const color = pct >= 0.7 ? "#22c55e" : pct >= 0.4 ? "#eab308" : "#ef4444"
            return (
              <div key={id} title={`${tac.name}: ${tac.covered}/${tac.total}`}>
                <div style={{ borderRadius: 6, padding: "8px 4px", background: `${color}18`, border: `1px solid ${color}30`, textAlign: "center" }}>
                  <div style={{ fontSize: 9, fontFamily: "monospace", color: color, fontWeight: 700, marginBottom: 4 }}>{id.replace("TA", "")}</div>
                  <div style={{ height: 3, borderRadius: 2, background: "#1f2937", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct * 100}%`, background: color }} />
                  </div>
                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 3 }}>{tac.covered}/{tac.total}</div>
                </div>
                <div style={{ fontSize: 9, color: "#4b5563", textAlign: "center", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tac.name}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 2px; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      {/* Top bar */}
      <div style={styles.topbar}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" fill="rgba(255,255,255,.9)" />
              <path d="M8 5L11 6.75V10.25L8 12L5 10.25V6.75L8 5Z" fill="rgba(30,64,175,.8)" />
            </svg>
          </div>
          <div>
            <div style={styles.logoText}>ZonForge Sentinel</div>
            <div style={styles.logoSub}>Cyber Early Warning</div>
          </div>
        </div>

        <div style={styles.nav}>
          {[
            { id: "overview", label: "Overview" },
            { id: "alerts", label: "Alert Center" },
            { id: "risk", label: "Risk" },
            { id: "compliance", label: "Compliance" },
          ].map(t => (
            <button key={t.id} style={styles.navBtn(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
              {t.label}
              {t.id === "alerts" && openP1 > 0 && (
                <span style={{ ...styles.badge(openP1), marginLeft: 6, animation: pulseAlerts ? "pulse .3s" : "none" }}>
                  {openP1}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={styles.topRight}>
          <div style={styles.pipelineDot}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
            Pipeline healthy
          </div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>
            {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>A</div>
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>

        {/* Sidebar (alert queue — only shown on alerts tab) */}
        {activeTab === "alerts" && (
          <div style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <div style={styles.sidebarTitle}>
                <span>🚨</span>
                <span>Alert Queue</span>
                <span style={styles.badge(openTotal)}>{openTotal}</span>
              </div>
            </div>
            <div style={styles.alertList}>
              {["P1", "P2", "P3", "P4"].map(p => {
                const grp = MOCK_ALERTS.filter(a => a.priority === p)
                if (grp.length === 0) return null
                return (
                  <div key={p}>
                    <div style={{ padding: "6px 14px 4px", display: "flex", alignItems: "center", gap: 6, background: "#060b14", borderBottom: "1px solid #0f172a" }}>
                      <span style={styles.priChip(p)}>{p}</span>
                      <span style={{ fontSize: 9, color: "#4b5563" }}>{grp.length}</span>
                    </div>
                    {grp.map(a => (
                      <div key={a.id} style={styles.alertRow(selectedAlert?.id === a.id, a.severity)} onClick={() => setSelectedAlert(a)}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "flex-start" }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.status === "investigating" ? "#eab308" : a.status === "resolved" ? "#22c55e" : sevColor(a.severity), flexShrink: 0, marginTop: 3, animation: a.status === "investigating" ? "pulse 1.5s infinite" : "none" }} />
                          <span style={{ fontSize: 11, color: selectedAlert?.id === a.id ? "#f9fafb" : "#9ca3af", lineHeight: 1.4 }}>{a.title}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginLeft: 12, flexWrap: "wrap" }}>
                          <span style={styles.chip(a.severity)}>{a.severity}</span>
                          {a.sla && <span style={{ fontSize: 9, color: "#f87171", fontWeight: 700 }}>SLA!</span>}
                          <span style={{ fontSize: 9, color: "#4b5563", marginLeft: "auto" }}>{a.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid #0f172a", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, textAlign: "center" }}>
              {[{ l: "Open", v: openTotal, c: "#ef4444" }, { l: "Active", v: 2, c: "#eab308" }, { l: "SLA", v: 1, c: "#f97316" }].map(s => (
                <div key={s.l}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: s.v > 0 ? s.c : "#374151", fontFamily: "monospace" }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: "#4b5563" }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main content */}
        <div style={styles.main}>
          <div style={styles.content}>
            {activeTab === "overview" && <OverviewTab />}
            {activeTab === "alerts" && <AlertTab />}
            {activeTab === "risk" && <RiskTab />}
            {activeTab === "compliance" && <ComplianceTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
