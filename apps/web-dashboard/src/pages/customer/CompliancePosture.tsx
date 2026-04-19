import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Control {
  id: string;
  control_id: string;
  title: string;
  description: string;
  status: "passing" | "failing" | "partial" | "not_assessed";
  evidence: string[];
  last_checked: string;
  remediation?: string;
}

interface Framework {
  id: string;
  name: string;
  short_name: string;
  version: string;
  description: string;
  total_controls: number;
  passing: number;
  failing: number;
  partial: number;
  not_assessed: number;
  coverage_pct: number;
  last_updated: string;
  controls: Control[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const mockFrameworks: Framework[] = [
  {
    id: "soc2",
    name: "SOC 2 Type II",
    short_name: "SOC 2",
    version: "2017",
    description: "AICPA Trust Services Criteria for security, availability, processing integrity, confidentiality, and privacy.",
    total_controls: 12,
    passing: 8,
    failing: 2,
    partial: 1,
    not_assessed: 1,
    coverage_pct: 75,
    last_updated: new Date(Date.now() - 86400000).toISOString(),
    controls: [
      { id: "s1", control_id: "CC6.1", title: "Logical and Physical Access Controls", description: "The entity implements logical access security measures to protect against threats from sources outside its system boundaries.", status: "passing", evidence: ["MFA enforced for all admin accounts", "RBAC roles configured", "Access review completed 2026-03-01"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "s2", control_id: "CC6.2", title: "Authentication Mechanisms", description: "Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.", status: "passing", evidence: ["User provisioning workflow documented", "Invite-based onboarding enforced"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "s3", control_id: "CC6.3", title: "Removal of Access", description: "The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets based on approved authorizations.", status: "partial", evidence: ["Manual offboarding process in place"], last_checked: new Date(Date.now() - 86400000).toISOString(), remediation: "Automate user deprovisioning via HR system integration" },
      { id: "s4", control_id: "CC7.1", title: "System Monitoring", description: "The entity uses detection and monitoring procedures to identify changes to configurations or new vulnerabilities.", status: "passing", evidence: ["Continuous monitoring active via ZonForge Sentinel", "Alert policies configured for all severity levels", "Connector health monitored"], last_checked: new Date(Date.now() - 1800000).toISOString() },
      { id: "s5", control_id: "CC7.2", title: "Anomaly and Threat Detection", description: "The entity implements detection mechanisms including intrusion detection, anomaly detection and log analysis.", status: "passing", evidence: ["Behavioral anomaly detection active", "Threat intel enrichment enabled", "MITRE ATT&CK coverage: 68%"], last_checked: new Date(Date.now() - 1800000).toISOString() },
      { id: "s6", control_id: "CC7.3", title: "Security Event Response", description: "The entity evaluates security events to determine whether they could or have resulted in a failure of the entity to meet its objectives.", status: "passing", evidence: ["Alert triage process documented", "P1 SLA: 15 minutes response time", "Incident response runbook in place"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "s7", control_id: "CC8.1", title: "Change Management", description: "The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure.", status: "passing", evidence: ["GitHub branch protection enabled", "PR review required", "CI/CD pipeline with test gates"], last_checked: new Date(Date.now() - 7200000).toISOString() },
      { id: "s8", control_id: "CC9.1", title: "Risk Assessment", description: "The entity identifies, selects, and develops risk mitigation activities for risks arising from potential business disruptions.", status: "passing", evidence: ["Quarterly risk review conducted", "Asset risk scores maintained", "Vulnerability management process active"], last_checked: new Date(Date.now() - 86400000).toISOString() },
      { id: "s9", control_id: "A1.1", title: "System Availability", description: "The entity maintains, monitors, and evaluates current processing capacity.", status: "failing", evidence: [], last_checked: new Date(Date.now() - 86400000).toISOString(), remediation: "Configure uptime monitoring and document RTO/RPO targets" },
      { id: "s10", control_id: "A1.2", title: "Disaster Recovery", description: "The entity authorizes, designs, develops, acquires, implements, operates, approves, maintains, and monitors environmental protections.", status: "failing", evidence: [], last_checked: new Date(Date.now() - 86400000).toISOString(), remediation: "Create and test disaster recovery plan; configure backup verification" },
      { id: "s11", control_id: "C1.1", title: "Confidential Information Protection", description: "The entity identifies and maintains confidential information to meet the entity's objectives related to confidentiality.", status: "passing", evidence: ["Data classification policy enforced", "PII fields identified and masked in non-analyst views", "Encryption at rest and in transit verified"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "s12", control_id: "PI1.1", title: "Processing Integrity", description: "The entity obtains or generates, uses, and communicates relevant, quality information to support the functioning of internal control.", status: "not_assessed", evidence: [], last_checked: "", remediation: "Conduct processing integrity assessment" },
    ],
  },
  {
    id: "iso27001",
    name: "ISO 27001:2022",
    short_name: "ISO 27001",
    version: "2022",
    description: "International standard for information security management systems (ISMS).",
    total_controls: 10,
    passing: 6,
    failing: 1,
    partial: 2,
    not_assessed: 1,
    coverage_pct: 70,
    last_updated: new Date(Date.now() - 172800000).toISOString(),
    controls: [
      { id: "i1", control_id: "A.9.1", title: "Access Control Policy", description: "An access control policy shall be established, documented, and reviewed based on business and information security requirements.", status: "passing", evidence: ["RBAC policy documented", "Least privilege enforced"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "i2", control_id: "A.9.4", title: "Secure Log-on Procedures", description: "Where required by the access control policy, access to systems and applications shall be controlled by a secure log-on procedure.", status: "passing", evidence: ["MFA enforced for admin roles", "Session timeout configured", "Failed login monitoring active"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "i3", control_id: "A.10.1", title: "Cryptographic Controls", description: "A policy on the use of cryptographic controls for protection of information shall be developed and implemented.", status: "passing", evidence: ["AES-256-GCM for data at rest", "TLS 1.3 for data in transit", "JWT RS256 for tokens"], last_checked: new Date(Date.now() - 7200000).toISOString() },
      { id: "i4", control_id: "A.12.6", title: "Vulnerability Management", description: "Information about technical vulnerabilities of information systems shall be obtained in a timely fashion.", status: "partial", evidence: ["Vulnerability scanning integrated", "CVE tracking active"], last_checked: new Date(Date.now() - 86400000).toISOString(), remediation: "Establish formal SLA for critical CVE remediation (target: 72 hours)" },
      { id: "i5", control_id: "A.12.7", title: "Audit Logging", description: "Audit logs recording user activities, exceptions, faults and information security events shall be produced, kept and regularly reviewed.", status: "passing", evidence: ["Tamper-resistant audit log active", "Hash-chain integrity verified", "90-day retention minimum"], last_checked: new Date(Date.now() - 1800000).toISOString() },
      { id: "i6", control_id: "A.14.2", title: "Secure Development", description: "Rules for the development of software and systems shall be established and applied to developments.", status: "passing", evidence: ["Secure SDLC policy in place", "Dependency scanning in CI/CD", "SBOM generated on each release"], last_checked: new Date(Date.now() - 86400000).toISOString() },
      { id: "i7", control_id: "A.16.1", title: "Incident Management", description: "Responsibilities and procedures shall be established to ensure a quick, effective, and orderly response to information security incidents.", status: "passing", evidence: ["Incident response runbook documented", "P1 escalation path defined", "Post-incident review process"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "i8", control_id: "A.17.1", title: "Business Continuity", description: "The organization shall determine its requirements for information security and the continuity of information security management.", status: "failing", evidence: [], last_checked: new Date(Date.now() - 86400000).toISOString(), remediation: "Document BCP with information security requirements; test annually" },
      { id: "i9", control_id: "A.18.1", title: "Compliance with Legal Requirements", description: "All relevant legislative, statutory, regulatory, contractual requirements and the organization's approach to meet these requirements shall be explicitly identified.", status: "partial", evidence: ["GDPR DPA in place for EU customers"], last_checked: new Date(Date.now() - 172800000).toISOString(), remediation: "Complete legal inventory for all applicable regulations (HIPAA, PCI-DSS)" },
      { id: "i10", control_id: "A.18.2", title: "Information Security Reviews", description: "The organization's approach to managing information security shall be reviewed independently at planned intervals.", status: "not_assessed", evidence: [], last_checked: "", remediation: "Schedule annual independent security review / penetration test" },
    ],
  },
  {
    id: "nist",
    name: "NIST Cybersecurity Framework",
    short_name: "NIST CSF",
    version: "2.0",
    description: "Framework for improving critical infrastructure cybersecurity across Identify, Protect, Detect, Respond, and Recover functions.",
    total_controls: 10,
    passing: 7,
    failing: 1,
    partial: 2,
    not_assessed: 0,
    coverage_pct: 80,
    last_updated: new Date(Date.now() - 259200000).toISOString(),
    controls: [
      { id: "n1", control_id: "ID.AM", title: "Asset Management", description: "The data, personnel, devices, systems, and facilities that enable the organization to achieve business purposes are identified and managed.", status: "passing", evidence: ["Asset inventory maintained in ZonForge", "Critical assets tagged and monitored", "Internet-facing assets identified"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "n2", control_id: "ID.RA", title: "Risk Assessment", description: "The organization understands the cybersecurity risk to operations, assets, and individuals.", status: "passing", evidence: ["Continuous risk scoring active", "Vulnerability correlation enabled", "Threat intel enrichment"], last_checked: new Date(Date.now() - 1800000).toISOString() },
      { id: "n3", control_id: "PR.AC", title: "Identity Management and Access Control", description: "Access to assets and associated facilities is limited to authorized users, processes, or devices.", status: "passing", evidence: ["RBAC enforced", "MFA for privileged roles", "Session management active"], last_checked: new Date(Date.now() - 3600000).toISOString() },
      { id: "n4", control_id: "PR.DS", title: "Data Security", description: "Information and records (data) are managed consistent with the organization's risk strategy.", status: "passing", evidence: ["Encryption at rest and in transit", "Data classification applied", "Tenant isolation enforced"], last_checked: new Date(Date.now() - 7200000).toISOString() },
      { id: "n5", control_id: "PR.PT", title: "Protective Technology", description: "Technical security solutions are managed to ensure the security and resilience of systems and assets.", status: "partial", evidence: ["Firewall monitoring active", "WAF configured"], last_checked: new Date(Date.now() - 86400000).toISOString(), remediation: "Implement endpoint detection and response (EDR) across all workstations" },
      { id: "n6", control_id: "DE.AE", title: "Anomalies and Events", description: "Anomalous activity is detected in a timely manner and the potential impact of events is understood.", status: "passing", evidence: ["Behavioral anomaly detection", "Alert correlation engine", "MITRE ATT&CK mapping"], last_checked: new Date(Date.now() - 1800000).toISOString() },
      { id: "n7", control_id: "DE.CM", title: "Security Continuous Monitoring", description: "The information system and assets are monitored at discrete intervals to identify cybersecurity events.", status: "passing", evidence: ["24/7 continuous monitoring", "Real-time alert pipeline", "Connector health monitoring"], last_checked: new Date(Date.now() - 600000).toISOString() },
      { id: "n8", control_id: "RS.RP", title: "Response Planning", description: "Response processes and procedures are executed and maintained to ensure timely response to cybersecurity incidents.", status: "passing", evidence: ["Incident response runbook", "P1 SLA defined", "On-call rotation documented"], last_checked: new Date(Date.now() - 86400000).toISOString() },
      { id: "n9", control_id: "RC.RP", title: "Recovery Planning", description: "Recovery processes and procedures are executed and maintained to ensure timely restoration of systems or assets.", status: "partial", evidence: ["Backup procedures in place"], last_checked: new Date(Date.now() - 86400000).toISOString(), remediation: "Document and test full recovery procedures; establish RTO targets" },
      { id: "n10", control_id: "RC.IM", title: "Recovery Improvements", description: "Recovery planning and processes are improved by incorporating lessons learned into future activities.", status: "failing", evidence: [], last_checked: new Date(Date.now() - 172800000).toISOString(), remediation: "Establish post-incident review process with documented improvements tracking" },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  passing: "text-green-400 bg-green-500/10 border-green-500/30",
  failing: "text-red-400 bg-red-500/10 border-red-500/30",
  partial: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  not_assessed: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

const statusIcon: Record<string, string> = {
  passing: "✅",
  failing: "❌",
  partial: "⚠️",
  not_assessed: "⬜",
};

const coverageColor = (pct: number) =>
  pct >= 80 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400";

const coverageBar = (pct: number) =>
  pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";

// ─── Control Row ──────────────────────────────────────────────────────────────
function ControlRow({ control }: { control: Control }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border-b border-slate-800 last:border-0`}>
      <div
        className="flex items-center gap-4 px-4 py-3 hover:bg-slate-800/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <span className="text-base flex-shrink-0">{statusIcon[control.status]}</span>
        <span className="text-xs font-mono text-slate-400 w-20 flex-shrink-0">{control.control_id}</span>
        <p className="text-sm text-white flex-1">{control.title}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${statusColor[control.status]}`}>
          {control.status.replace("_", " ")}
        </span>
        <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="px-4 pb-4 bg-slate-800/20">
          <p className="text-xs text-slate-400 mb-3 ml-28">{control.description}</p>

          {control.evidence.length > 0 && (
            <div className="ml-28 mb-3">
              <p className="text-xs font-semibold text-green-400 mb-1">Evidence:</p>
              <ul className="space-y-1">
                {control.evidence.map((e, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <span className="text-green-400 flex-shrink-0">✓</span>{e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {control.remediation && (
            <div className="ml-28 p-3 bg-orange-900/20 border border-orange-800/40 rounded-lg">
              <p className="text-xs font-semibold text-orange-400 mb-1">Remediation Required:</p>
              <p className="text-xs text-orange-300">{control.remediation}</p>
            </div>
          )}

          {control.last_checked && (
            <p className="text-xs text-slate-500 ml-28 mt-2">
              Last checked: {new Date(control.last_checked).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Framework Card ───────────────────────────────────────────────────────────
function FrameworkCard({
  framework,
  selected,
  onClick,
}: {
  framework: Framework;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-slate-900 rounded-xl border p-5 cursor-pointer transition-all hover:border-slate-600 ${
        selected ? "border-blue-600 ring-1 ring-blue-600/30" : "border-slate-800"
      }`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white">{framework.short_name}</h3>
          <p className="text-xs text-slate-400">{framework.version}</p>
        </div>
        <span className={`text-2xl font-bold ${coverageColor(framework.coverage_pct)}`}>
          {framework.coverage_pct}%
        </span>
      </div>

      {/* Coverage Bar */}
      <div className="w-full bg-slate-800 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${coverageBar(framework.coverage_pct)}`}
          style={{ width: `${framework.coverage_pct}%` }}
        />
      </div>

      {/* Control Summary */}
      <div className="grid grid-cols-4 gap-1 text-center">
        <div>
          <p className="text-sm font-bold text-green-400">{framework.passing}</p>
          <p className="text-xs text-slate-500">Pass</p>
        </div>
        <div>
          <p className="text-sm font-bold text-red-400">{framework.failing}</p>
          <p className="text-xs text-slate-500">Fail</p>
        </div>
        <div>
          <p className="text-sm font-bold text-yellow-400">{framework.partial}</p>
          <p className="text-xs text-slate-500">Partial</p>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-400">{framework.not_assessed}</p>
          <p className="text-xs text-slate-500">N/A</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CompliancePosture() {
  const [selectedFramework, setSelectedFramework] = useState("soc2");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: frameworks = mockFrameworks } = useQuery<Framework[]>({
    queryKey: ["compliance-frameworks"],
    queryFn: async () => {
      const res = await apiClient.get("/compliance/frameworks");
      return res.data.data;
    },
  });

  const active = frameworks.find(f => f.id === selectedFramework) ?? frameworks[0];

  const filteredControls = (active?.controls ?? [])
    .filter(c => !statusFilter || c.status === statusFilter)
    .filter(c =>
      c.control_id.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase())
    );

  const exportEvidence = () => {
    const rows = [
      ["Control ID", "Title", "Status", "Evidence", "Remediation", "Last Checked"],
      ...(active?.controls ?? []).map(c => [
        c.control_id, c.title, c.status,
        c.evidence.join(" | "),
        c.remediation ?? "",
        c.last_checked ? new Date(c.last_checked).toISOString() : "",
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-${active?.short_name}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  // Overall posture score
  const totalControls = frameworks.reduce((s, f) => s + f.total_controls, 0);
  const totalPassing = frameworks.reduce((s, f) => s + f.passing, 0);
  const overallPct = Math.round((totalPassing / totalControls) * 100);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Posture</h1>
          <p className="text-slate-400 text-sm mt-1">
            SOC 2 · ISO 27001 · NIST CSF — Evidence collected automatically
          </p>
        </div>
        <button
          onClick={exportEvidence}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg border border-slate-700 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export Evidence
        </button>
      </div>

      {/* Overall Posture */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl border border-slate-700 p-5 flex items-center gap-6">
        <div className="flex-shrink-0">
          <svg width="80" height="80" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="12" />
            <circle cx="50" cy="50" r="40" fill="none"
              stroke={overallPct >= 80 ? "#22c55e" : overallPct >= 60 ? "#eab308" : "#ef4444"}
              strokeWidth="12"
              strokeDasharray={`${(overallPct / 100) * 251} 251`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)" />
            <text x="50" y="46" textAnchor="middle"
              fill={overallPct >= 80 ? "#22c55e" : overallPct >= 60 ? "#eab308" : "#ef4444"}
              fontSize="18" fontWeight="bold">{overallPct}</text>
            <text x="50" y="62" textAnchor="middle" fill="#94a3b8" fontSize="8">OVERALL</text>
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Overall Compliance Posture</h2>
          <p className="text-slate-400 text-sm">
            {totalPassing} of {totalControls} controls passing across {frameworks.length} frameworks
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Last evidence collection: {new Date(Date.now() - 1800000).toLocaleString()}
          </p>
        </div>
        <div className="ml-auto flex flex-col gap-2">
          {frameworks.map(f => (
            <div key={f.id} className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-20">{f.short_name}</span>
              <div className="w-24 bg-slate-700 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${coverageBar(f.coverage_pct)}`}
                  style={{ width: `${f.coverage_pct}%` }}
                />
              </div>
              <span className={`text-xs font-bold ${coverageColor(f.coverage_pct)}`}>{f.coverage_pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Framework Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {frameworks.map(f => (
          <FrameworkCard
            key={f.id}
            framework={f}
            selected={selectedFramework === f.id}
            onClick={() => setSelectedFramework(f.id)}
          />
        ))}
      </div>

      {/* Selected Framework Detail */}
      {active && (
        <div className="bg-slate-900 rounded-xl border border-slate-800">
          {/* Framework Header */}
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-white">{active.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{active.description}</p>
              </div>
              <p className="text-xs text-slate-500">
                Updated {new Date(active.last_updated).toLocaleDateString()}
              </p>
            </div>

            {/* Controls Filter */}
            <div className="flex flex-wrap gap-2 mt-4">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search controls..."
                className="flex-1 min-w-[180px] px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {(["", "passing", "failing", "partial", "not_assessed"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}>
                  {s === "" ? "All" : `${statusIcon[s]} ${s.replace("_", " ")}`}
                </button>
              ))}
            </div>
          </div>

          {/* Controls List */}
          <div>
            {filteredControls.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">No controls found</p>
            ) : (
              filteredControls.map(control => (
                <ControlRow key={control.id} control={control} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
