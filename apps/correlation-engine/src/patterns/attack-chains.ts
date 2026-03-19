// ─────────────────────────────────────────────
// ZonForge Sentinel — Attack Chain Pattern Templates
//
// Each pattern describes a multi-step attack sequence.
// The CorrelationEngine matches detection signals against
// these patterns to generate correlated findings.
//
// Pattern matching logic:
//   - Signals are grouped by entity (user/IP/asset) within windowHours
//   - A pattern is matched when completionThreshold% of steps are found
//   - Compound confidence = weighted avg of individual signal confidences
// ─────────────────────────────────────────────

import type { Severity, AlertPriority } from '@zonforge/shared-types'

export interface PatternStep {
  stepId:       string
  description:  string
  // Match criteria — signals must satisfy at least one
  ruleIds?:     string[]         // specific rule IDs
  metricNames?: string[]         // anomaly metric names
  detectionTypes?: string[]      // 'rule' | 'anomaly' | 'threat_intel'
  severities?:  Severity[]
  mitreTechniques?: string[]
  // Weight of this step in compound confidence
  weight:       number           // 0.0–1.0, must sum to 1.0 per pattern
  required:     boolean          // if true, pattern fails without this step
}

export interface AttackChainPattern {
  id:                  string
  name:                string
  description:         string
  severity:            Severity
  priority:            AlertPriority
  windowHours:         number     // time window to group signals
  completionThreshold: number     // 0.0–1.0 — fraction of steps needed
  steps:               PatternStep[]
  mitreTactics:        string[]
  mitreTechniques:     string[]
  recommendedActions:  string[]
  baseConfidence:      number
}

// ─────────────────────────────────────────────
// 9 ATTACK CHAIN PATTERNS
// ─────────────────────────────────────────────

export const ATTACK_CHAIN_PATTERNS: AttackChainPattern[] = [

  // ── Pattern 1: Credential Brute-Force → Account Takeover ──────
  {
    id:          'ACP-001',
    name:        'Credential Brute-Force to Account Takeover',
    description: 'Multiple failed logins followed by successful login, possibly from a new location or device — classic credential stuffing or brute-force attack culminating in account takeover.',
    severity:    'high',
    priority:    'P1',
    windowHours: 2,
    completionThreshold: 0.67,
    baseConfidence: 0.85,
    mitreTactics:    ['TA0006', 'TA0001'],
    mitreTechniques: ['T1110', 'T1078'],
    steps: [
      {
        stepId:      'brute_force',
        description: 'Multiple failed login attempts',
        ruleIds:     ['ZF-AUTH-001'],
        detectionTypes: ['rule'],
        weight:   0.40,
        required: true,
      },
      {
        stepId:      'successful_login',
        description: 'Successful login after failures',
        detectionTypes: ['rule', 'anomaly'],
        mitreTechniques: ['T1078', 'T1078.004'],
        weight:   0.35,
        required: true,
      },
      {
        stepId:      'location_anomaly',
        description: 'Login from new country or impossible travel',
        ruleIds:     ['ZF-AUTH-002', 'ZF-AUTH-006'],
        metricNames: ['login_countries'],
        weight:   0.25,
        required: false,
      },
    ],
    recommendedActions: [
      'Immediately contact the affected user through out-of-band channel',
      'Suspend all active sessions for the user',
      'Force password reset before allowing re-access',
      'Review all actions taken after the successful login',
      'Check for privilege escalation or data access post-compromise',
      'Block source IP if confirmed malicious',
    ],
  },

  // ── Pattern 2: Credential Compromise → Privilege Escalation ───
  {
    id:          'ACP-002',
    name:        'Account Compromise with Privilege Escalation',
    description: 'Suspicious login followed by privilege escalation — attacker compromises a standard account then escalates to admin.',
    severity:    'high',
    priority:    'P1',
    windowHours: 24,
    completionThreshold: 0.75,
    baseConfidence: 0.88,
    mitreTactics:    ['TA0001', 'TA0004', 'TA0003'],
    mitreTechniques: ['T1078', 'T1098', 'T1136'],
    steps: [
      {
        stepId:      'initial_access',
        description: 'Suspicious or anomalous login',
        ruleIds:     ['ZF-AUTH-001', 'ZF-AUTH-002', 'ZF-AUTH-005', 'ZF-AUTH-007'],
        metricNames: ['login_countries', 'login_hour_distribution', 'known_devices'],
        weight:   0.30,
        required: true,
      },
      {
        stepId:      'privilege_escalation',
        description: 'Privilege escalation action',
        ruleIds:     ['ZF-PRIVESC-001', 'ZF-IAM-001', 'ZF-AWS-003'],
        mitreTechniques: ['T1098', 'T1136.003'],
        weight:   0.45,
        required: true,
      },
      {
        stepId:      'persistence',
        description: 'Persistence mechanism established',
        ruleIds:     ['ZF-IAM-002', 'ZF-AUTH-003'],
        mitreTechniques: ['T1136'],
        weight:   0.25,
        required: false,
      },
    ],
    recommendedActions: [
      'Immediately revoke all elevated permissions granted during this session',
      'Disable the compromised account pending investigation',
      'Identify and disable any backdoor accounts created',
      'Audit all resource access since initial compromise',
      'Review privilege assignment process for control gaps',
    ],
  },

  // ── Pattern 3: Ransomware Early-Stage ─────────────────────────
  {
    id:          'ACP-003',
    name:        'Ransomware Early-Stage Indicators',
    description: 'Combination of shadow copy deletion, mass file operations, and potential logging disruption — high-confidence ransomware pre-encryption activity.',
    severity:    'critical',
    priority:    'P1',
    windowHours: 4,
    completionThreshold: 0.60,
    baseConfidence: 0.93,
    mitreTactics:    ['TA0040', 'TA0005'],
    mitreTechniques: ['T1490', 'T1485', 'T1070'],
    steps: [
      {
        stepId:      'backup_deletion',
        description: 'Shadow copy or backup deletion',
        ruleIds:     ['ZF-RANSOMWARE-001'],
        mitreTechniques: ['T1490'],
        weight:   0.50,
        required: true,
      },
      {
        stepId:      'mass_file_ops',
        description: 'Mass file deletion or modification',
        ruleIds:     ['ZF-AWS-002'],
        mitreTechniques: ['T1485'],
        weight:   0.30,
        required: false,
      },
      {
        stepId:      'logging_disabled',
        description: 'CloudTrail or audit logging stopped',
        mitreTechniques: ['T1070'],
        weight:   0.20,
        required: false,
      },
    ],
    recommendedActions: [
      '🚨 CRITICAL: Activate ransomware incident response plan IMMEDIATELY',
      'Isolate affected systems from the network RIGHT NOW',
      'Do NOT attempt to pay ransom — contact law enforcement',
      'Verify backup integrity from isolated backup system before anything else',
      'Engage your cyber incident response retainer',
      'Preserve all forensic evidence before any remediation',
    ],
  },

  // ── Pattern 4: Data Exfiltration ──────────────────────────────
  {
    id:          'ACP-004',
    name:        'Insider Threat Data Exfiltration',
    description: 'Suspicious login (off-hours or new location) followed by mass data download and potentially email forwarding — classic data theft pattern.',
    severity:    'high',
    priority:    'P1',
    windowHours: 48,
    completionThreshold: 0.60,
    baseConfidence: 0.80,
    mitreTactics:    ['TA0009', 'TA0010'],
    mitreTechniques: ['T1530', 'T1213', 'T1114'],
    steps: [
      {
        stepId:      'unusual_access',
        description: 'Unusual or suspicious login pattern',
        ruleIds:     ['ZF-AUTH-004', 'ZF-AUTH-006'],
        metricNames: ['login_hour_distribution', 'login_countries'],
        weight:   0.25,
        required: false,
      },
      {
        stepId:      'mass_download',
        description: 'Mass file download or data access',
        ruleIds:     ['ZF-DATA-001'],
        metricNames: ['download_count_per_hour'],
        weight:   0.45,
        required: true,
      },
      {
        stepId:      'exfil_channel',
        description: 'Data exfiltration channel established',
        ruleIds:     ['ZF-EMAIL-001'],
        mitreTechniques: ['T1114.003'],
        weight:   0.30,
        required: false,
      },
    ],
    recommendedActions: [
      'Immediately identify which data was accessed and downloaded',
      'Determine if any data left the corporate environment',
      'If employee, engage HR and legal immediately',
      'Preserve audit logs and access records for legal proceedings',
      'Review DLP policies to prevent future unauthorized exports',
    ],
  },

  // ── Pattern 5: OAuth Token Theft → API Abuse ──────────────────
  {
    id:          'ACP-005',
    name:        'OAuth Token Theft and API Abuse',
    description: 'Suspicious OAuth grant followed by unusual API token usage from a new IP — indicates OAuth phishing leading to token-based persistent access.',
    severity:    'high',
    priority:    'P2',
    windowHours: 72,
    completionThreshold: 0.70,
    baseConfidence: 0.78,
    mitreTactics:    ['TA0001', 'TA0006'],
    mitreTechniques: ['T1550.001', 'T1566.002'],
    steps: [
      {
        stepId:      'oauth_grant',
        description: 'Broad OAuth permission granted',
        ruleIds:     ['ZF-OAUTH-001'],
        weight:   0.45,
        required: true,
      },
      {
        stepId:      'api_abuse',
        description: 'Unusual API token usage pattern',
        ruleIds:     ['ZF-API-001'],
        metricNames: ['api_calls_per_hour'],
        weight:   0.55,
        required: true,
      },
    ],
    recommendedActions: [
      'Revoke the suspicious OAuth token immediately',
      'Review all API calls made with this token',
      'Audit which data/resources were accessed',
      'Report to application vendor if third-party app is implicated',
      'Review OAuth application consent policy',
    ],
  },

  // ── Pattern 6: Cloud Infrastructure Destruction ───────────────
  {
    id:          'ACP-006',
    name:        'Cloud Infrastructure Destruction',
    description: 'Root account login or privilege escalation followed by mass resource deletion — destructive attack or disgruntled insider.',
    severity:    'critical',
    priority:    'P1',
    windowHours: 6,
    completionThreshold: 0.65,
    baseConfidence: 0.90,
    mitreTactics:    ['TA0040', 'TA0004'],
    mitreTechniques: ['T1485', 'T1078.004', 'T1078'],
    steps: [
      {
        stepId:      'high_priv_access',
        description: 'Root or super-admin access obtained',
        ruleIds:     ['ZF-AWS-001', 'ZF-PRIVESC-001', 'ZF-AUTH-003'],
        weight:   0.45,
        required: true,
      },
      {
        stepId:      'logging_disabled',
        description: 'Monitoring or logging disrupted',
        mitreTechniques: ['T1070'],
        weight:   0.15,
        required: false,
      },
      {
        stepId:      'mass_destruction',
        description: 'Mass resource deletion or destruction',
        ruleIds:     ['ZF-AWS-002', 'ZF-RANSOMWARE-001'],
        mitreTechniques: ['T1485', 'T1490'],
        weight:   0.40,
        required: true,
      },
    ],
    recommendedActions: [
      '🚨 CRITICAL: Activate cloud incident response plan immediately',
      'Suspend all compromised high-privilege accounts',
      'Enable resource deletion protection on remaining assets immediately',
      'Restore from most recent clean backup',
      'Engage cloud provider security support team',
      'Contact cyber insurance and legal counsel',
    ],
  },

  // ── Pattern 7: Lateral Movement Campaign ──────────────────────
  {
    id:          'ACP-007',
    name:        'Lateral Movement Campaign',
    description: 'Initial compromise followed by authentication spread across multiple internal assets — active attacker moving through the environment.',
    severity:    'high',
    priority:    'P1',
    windowHours: 12,
    completionThreshold: 0.67,
    baseConfidence: 0.77,
    mitreTactics:    ['TA0001', 'TA0008', 'TA0004'],
    mitreTechniques: ['T1078', 'T1021', 'T1098'],
    steps: [
      {
        stepId:      'initial_compromise',
        description: 'Initial account compromise or suspicious access',
        ruleIds:     ['ZF-AUTH-001', 'ZF-AUTH-007', 'ZF-AUTH-002'],
        weight:   0.30,
        required: false,
      },
      {
        stepId:      'lateral_movement',
        description: 'Authentication spread across multiple assets',
        ruleIds:     ['ZF-LATERAL-001'],
        mitreTechniques: ['T1021'],
        weight:   0.50,
        required: true,
      },
      {
        stepId:      'privilege_escalation',
        description: 'Privilege escalation on accessed systems',
        ruleIds:     ['ZF-PRIVESC-001', 'ZF-AWS-003'],
        weight:   0.20,
        required: false,
      },
    ],
    recommendedActions: [
      'Map all systems accessed by the compromised identity',
      'Isolate the source identity and all accessed systems',
      'Check for credential dumping on accessed systems',
      'Rotate all service account passwords immediately',
      'Review network segmentation — lateral movement should be impossible between these assets',
    ],
  },

  // ── Pattern 8: Service Account Compromise ─────────────────────
  {
    id:          'ACP-008',
    name:        'Service Account Compromise and Misuse',
    description: 'Service account performs interactive login followed by anomalous API activity — service account credential theft with manual adversary operation.',
    severity:    'high',
    priority:    'P2',
    windowHours: 8,
    completionThreshold: 0.75,
    baseConfidence: 0.85,
    mitreTactics:    ['TA0003', 'TA0006'],
    mitreTechniques: ['T1078.003', 'T1550'],
    steps: [
      {
        stepId:      'svc_interactive_login',
        description: 'Service account interactive login',
        ruleIds:     ['ZF-IAM-001'],
        weight:   0.50,
        required: true,
      },
      {
        stepId:      'api_abuse',
        description: 'Anomalous API usage by service account',
        ruleIds:     ['ZF-API-001'],
        metricNames: ['api_calls_per_hour'],
        weight:   0.50,
        required: true,
      },
    ],
    recommendedActions: [
      'Rotate service account credentials immediately',
      'Review all API calls made in this session',
      'Check how service account credentials may have been exposed (secrets in code, logs, etc.)',
      'Enforce service account policy: disable console/interactive access',
    ],
  },

  // ── Pattern 9: Impossible Travel with Post-Login Activity ─────
  {
    id:          'ACP-009',
    name:        'Impossible Travel with Suspicious Post-Login Activity',
    description: 'Impossible travel login followed by sensitive actions — confirms credential compromise with active adversary operation.',
    severity:    'critical',
    priority:    'P1',
    windowHours: 4,
    completionThreshold: 0.75,
    baseConfidence: 0.92,
    mitreTactics:    ['TA0001', 'TA0009', 'TA0010'],
    mitreTechniques: ['T1078.004', 'T1530', 'T1213'],
    steps: [
      {
        stepId:      'impossible_travel',
        description: 'Impossible travel login detected',
        ruleIds:     ['ZF-AUTH-002'],
        weight:   0.45,
        required: true,
      },
      {
        stepId:      'sensitive_action',
        description: 'Sensitive post-login activity',
        ruleIds:     ['ZF-DATA-001', 'ZF-PRIVESC-001', 'ZF-EMAIL-001', 'ZF-OAUTH-001'],
        metricNames: ['download_count_per_hour'],
        weight:   0.55,
        required: true,
      },
    ],
    recommendedActions: [
      'Immediately suspend the user account — active compromise confirmed',
      'Revoke ALL active sessions for this user globally',
      'Identify exactly what data or systems were accessed',
      'Notify the real user through alternate contact — do not use compromised email',
      'Treat as active incident — engage incident response team now',
    ],
  },
]

// Quick lookup by ID
export const PATTERN_MAP = new Map(
  ATTACK_CHAIN_PATTERNS.map(p => [p.id, p]),
)
