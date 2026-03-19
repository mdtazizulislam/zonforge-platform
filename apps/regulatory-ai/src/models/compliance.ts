import { z } from 'zod'

// ─────────────────────────────────────────────
// REGULATORY AI — DOMAIN TYPES
// ─────────────────────────────────────────────

export type Framework =
  | 'soc2_type2'
  | 'iso27001'
  | 'gdpr'
  | 'hipaa'
  | 'pci_dss'
  | 'nist_csf'

export type ControlStatus = 'compliant' | 'partial' | 'non_compliant' | 'not_applicable' | 'unknown'

export type EvidenceType =
  | 'alert_metric'     // from alert pipeline
  | 'audit_log_entry'  // from audit logs
  | 'configuration'    // from tenant settings
  | 'connector_status' // from data connectors
  | 'risk_score'       // from risk scoring
  | 'detection_rule'   // from detection engine
  | 'policy_document'  // manually uploaded

// ─────────────────────────────────────────────
// COMPLIANCE CONTROL
// ─────────────────────────────────────────────

export interface ComplianceControl {
  id:            string
  framework:     Framework
  controlId:     string    // e.g. CC6.1, A.8.1, Art.32
  name:          string
  description:   string
  category:      string
  testProcedure: string   // How to verify compliance
  evidenceTypes: EvidenceType[]
  autoCheckable: boolean  // Can ZonForge verify this automatically?
  weight:        number   // 1-5 for scoring
}

export interface ControlResult {
  control:       ComplianceControl
  status:        ControlStatus
  score:         number    // 0–100
  evidence:      CollectedEvidence[]
  gaps:          string[]
  automatedCheck: boolean
  lastCheckedAt: Date
  nextCheckAt:   Date
  notes?:        string
}

export interface CollectedEvidence {
  type:        EvidenceType
  title:       string
  value:       string | number | boolean
  collectedAt: Date
  source:      string
  supports:    'compliant' | 'non_compliant' | 'neutral'
}

// ─────────────────────────────────────────────
// COMPLIANCE POSTURE
// ─────────────────────────────────────────────

export interface FrameworkPosture {
  tenantId:         string
  framework:        Framework
  overallScore:     number    // 0–100
  overallStatus:    ControlStatus
  controlResults:   ControlResult[]
  compliantCount:   number
  partialCount:     number
  nonCompliantCount: number
  criticalGaps:     string[]
  auditReadiness:   number    // 0–100: how ready for an audit
  lastAssessedAt:   Date
  nextAssessmentAt: Date
  trend:            'improving' | 'degrading' | 'stable'
}

// ─────────────────────────────────────────────
// AUDITOR Q&A
// ─────────────────────────────────────────────

export interface AuditorQuestion {
  id:       string
  question: string
  context?: string
}

export interface AuditorAnswer {
  question:      string
  answer:        string
  evidenceCited: string[]
  confidence:    number     // 0–100
  caveats?:      string
  generatedAt:   Date
  framework:     Framework
}

// ─────────────────────────────────────────────
// CONTROL LIBRARY
// SOC2, ISO27001, GDPR, HIPAA, PCI-DSS controls
// that can be automatically verified from ZonForge data
// ─────────────────────────────────────────────

export const CONTROL_LIBRARY: ComplianceControl[] = [

  // ── SOC2 Type II ──────────────────────────────

  {
    id: 'soc2-cc6-1', framework: 'soc2_type2', controlId: 'CC6.1',
    name: 'Logical Access Security Software',
    description: 'The entity implements logical access security software, infrastructure, and architectures over protected information assets.',
    category: 'Logical Access',
    testProcedure: 'Verify RBAC is enforced, MFA is available, and access logs are maintained.',
    evidenceTypes: ['audit_log_entry', 'configuration', 'connector_status'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'soc2-cc7-1', framework: 'soc2_type2', controlId: 'CC7.1',
    name: 'Threat Detection and Monitoring',
    description: 'The entity uses detection and monitoring procedures to identify changes to configurations or new vulnerabilities.',
    category: 'System Operations',
    testProcedure: 'Verify detection rules are active, connectors healthy, alert MTTD < 60 min.',
    evidenceTypes: ['detection_rule', 'connector_status', 'alert_metric'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'soc2-cc7-2', framework: 'soc2_type2', controlId: 'CC7.2',
    name: 'Incident Response',
    description: 'The entity monitors system components and operations of those system components for anomalies.',
    category: 'System Operations',
    testProcedure: 'Verify alert resolution rate, MTTR metrics, and playbook coverage.',
    evidenceTypes: ['alert_metric', 'audit_log_entry'],
    autoCheckable: true, weight: 4,
  },
  {
    id: 'soc2-cc8-1', framework: 'soc2_type2', controlId: 'CC8.1',
    name: 'Change Management',
    description: 'The entity authorizes, designs, develops, and implements changes to infrastructure, data, software, and procedures.',
    category: 'Change Management',
    testProcedure: 'Verify all changes are logged with actor, timestamp, and before/after state.',
    evidenceTypes: ['audit_log_entry'],
    autoCheckable: true, weight: 4,
  },
  {
    id: 'soc2-a1-1', framework: 'soc2_type2', controlId: 'A1.1',
    name: 'Availability — Monitoring',
    description: 'The entity maintains, monitors, and evaluates current processing capacity and use of system components.',
    category: 'Availability',
    testProcedure: 'Verify connector uptime > 99%, data pipeline health metrics.',
    evidenceTypes: ['connector_status', 'alert_metric'],
    autoCheckable: true, weight: 3,
  },

  // ── ISO 27001 ─────────────────────────────────

  {
    id: 'iso-a8-1', framework: 'iso27001', controlId: 'A.8.1',
    name: 'Inventory of Assets',
    description: 'Assets associated with information and information processing facilities shall be identified.',
    category: 'Asset Management',
    testProcedure: 'Verify all data connectors are catalogued and monitored.',
    evidenceTypes: ['connector_status'],
    autoCheckable: true, weight: 3,
  },
  {
    id: 'iso-a9-1', framework: 'iso27001', controlId: 'A.9.1',
    name: 'Access Control Policy',
    description: 'An access control policy shall be established, documented and reviewed.',
    category: 'Access Control',
    testProcedure: 'Verify RBAC roles, MFA policy, and access review cadence.',
    evidenceTypes: ['configuration', 'audit_log_entry'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'iso-a12-4', framework: 'iso27001', controlId: 'A.12.4',
    name: 'Logging and Monitoring',
    description: 'Event logs recording user activities, exceptions, faults and information security events shall be produced.',
    category: 'Operations Security',
    testProcedure: 'Verify audit log completeness, retention policy, and hash chain integrity.',
    evidenceTypes: ['audit_log_entry'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'iso-a16-1', framework: 'iso27001', controlId: 'A.16.1',
    name: 'Incident Management',
    description: 'Responsibilities and procedures shall be established to ensure a quick, effective and orderly response to information security incidents.',
    category: 'Incident Management',
    testProcedure: 'Verify incident detection rate, resolution SLA, and playbook coverage.',
    evidenceTypes: ['alert_metric', 'detection_rule'],
    autoCheckable: true, weight: 5,
  },

  // ── GDPR ──────────────────────────────────────

  {
    id: 'gdpr-art32', framework: 'gdpr', controlId: 'Art.32',
    name: 'Security of Processing',
    description: 'Implement appropriate technical measures to ensure security appropriate to the risk.',
    category: 'Technical Measures',
    testProcedure: 'Verify encryption at rest/transit, access controls, and breach detection capability.',
    evidenceTypes: ['configuration', 'detection_rule', 'alert_metric'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'gdpr-art33', framework: 'gdpr', controlId: 'Art.33',
    name: 'Breach Notification (72h)',
    description: 'Notify supervisory authority within 72 hours of becoming aware of a personal data breach.',
    category: 'Breach Notification',
    testProcedure: 'Verify MTTD < 24h for data-related alerts, and incident response playbooks exist.',
    evidenceTypes: ['alert_metric', 'audit_log_entry'],
    autoCheckable: true, weight: 5,
  },

  // ── HIPAA ─────────────────────────────────────

  {
    id: 'hipaa-164-312-a', framework: 'hipaa', controlId: '§164.312(a)',
    name: 'Access Controls',
    description: 'Implement technical policies to allow only authorized persons to access electronic PHI.',
    category: 'Technical Safeguards',
    testProcedure: 'Verify MFA, RBAC, and session management for PHI-adjacent systems.',
    evidenceTypes: ['configuration', 'audit_log_entry'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'hipaa-164-312-b', framework: 'hipaa', controlId: '§164.312(b)',
    name: 'Audit Controls',
    description: 'Implement hardware, software, and procedural mechanisms to record and examine activity.',
    category: 'Technical Safeguards',
    testProcedure: 'Verify audit log completeness and tamper-evidence (hash chain).',
    evidenceTypes: ['audit_log_entry'],
    autoCheckable: true, weight: 5,
  },

  // ── PCI-DSS ───────────────────────────────────

  {
    id: 'pci-req10', framework: 'pci_dss', controlId: 'Req.10',
    name: 'Track and Monitor All Access',
    description: 'Log and monitor all access to network resources and cardholder data.',
    category: 'Monitoring',
    testProcedure: 'Verify all system events are logged, retained, and reviewed for anomalies.',
    evidenceTypes: ['audit_log_entry', 'connector_status', 'alert_metric'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'pci-req11', framework: 'pci_dss', controlId: 'Req.11',
    name: 'Test Security Systems',
    description: 'Regularly test security systems and processes.',
    category: 'Security Testing',
    testProcedure: 'Verify red team simulations run, detection gaps tracked, and findings remediated.',
    evidenceTypes: ['alert_metric'],
    autoCheckable: true, weight: 4,
  },

  // ── NIST CSF ──────────────────────────────────

  {
    id: 'nist-de-ae', framework: 'nist_csf', controlId: 'DE.AE',
    name: 'Anomalies and Events',
    description: 'Anomalous activity is detected and the potential impact of events is understood.',
    category: 'Detect',
    testProcedure: 'Verify anomaly detection models are active and alert on deviations.',
    evidenceTypes: ['detection_rule', 'alert_metric'],
    autoCheckable: true, weight: 5,
  },
  {
    id: 'nist-rs-rp', framework: 'nist_csf', controlId: 'RS.RP',
    name: 'Response Planning',
    description: 'Response processes and procedures are executed and maintained.',
    category: 'Respond',
    testProcedure: 'Verify playbooks exist for P1/P2 scenarios and have been tested.',
    evidenceTypes: ['audit_log_entry'],
    autoCheckable: true, weight: 4,
  },
]

// ─────────────────────────────────────────────
// FRAMEWORK METADATA
// ─────────────────────────────────────────────

export const FRAMEWORK_META: Record<Framework, { name: string; full: string; controls: number; description: string }> = {
  soc2_type2: { name: 'SOC2',      full: 'SOC2 Type II',        controls: 5,  description: 'AICPA trust service criteria for security, availability, and confidentiality' },
  iso27001:   { name: 'ISO 27001', full: 'ISO/IEC 27001:2022',  controls: 4,  description: 'International standard for information security management systems' },
  gdpr:       { name: 'GDPR',      full: 'EU General Data Protection Regulation', controls: 2, description: 'EU regulation on data protection and privacy' },
  hipaa:      { name: 'HIPAA',     full: 'Health Insurance Portability and Accountability Act', controls: 2, description: 'US regulation protecting health information' },
  pci_dss:    { name: 'PCI-DSS',   full: 'PCI Data Security Standard v4.0', controls: 2, description: 'Payment card industry security standard' },
  nist_csf:   { name: 'NIST CSF',  full: 'NIST Cybersecurity Framework 2.0', controls: 2, description: 'US NIST framework for managing cybersecurity risk' },
}

// Zod schemas
export const AuditorQuerySchema = z.object({
  framework: z.enum(['soc2_type2','iso27001','gdpr','hipaa','pci_dss','nist_csf']),
  question:  z.string().min(5).max(1000),
})

export const AssessFrameworkSchema = z.object({
  framework: z.enum(['soc2_type2','iso27001','gdpr','hipaa','pci_dss','nist_csf']),
})
