import { z } from 'zod'

// ─────────────────────────────────────────────
// DIGITAL TWIN SECURITY — DOMAIN TYPES
// ─────────────────────────────────────────────

export type NodeType =
  | 'user_identity'     // User or service account
  | 'workstation'       // End-user device
  | 'server'            // Internal server
  | 'cloud_service'     // AWS/GCP/Azure service
  | 'database'          // Database server
  | 'network_segment'   // VPC, subnet, zone
  | 'external_endpoint' // Internet-facing service
  | 'saas_application'  // M365, Salesforce, etc.
  | 'data_store'        // S3, SharePoint, Blob

export type EdgeType =
  | 'authenticate'      // User → Service
  | 'network_access'    // Network path
  | 'trust_delegation'  // Service-to-service trust
  | 'data_flow'         // Data movement
  | 'admin_access'      // Privileged access path
  | 'api_call'          // API relationship

export interface TwinNode {
  id:         string
  type:       NodeType
  label:      string
  properties: Record<string, unknown>
  risk:       number    // 0–100 current risk
  privilege:  'high' | 'medium' | 'low'
  internet_exposed: boolean
  hasHoneypot:  boolean
}

export interface TwinEdge {
  id:         string
  source:     string    // node ID
  target:     string    // node ID
  type:       EdgeType
  bidirectional: boolean
  encrypted:  boolean
  mfaRequired: boolean
  properties: Record<string, unknown>
}

export interface TwinTopology {
  id:          string
  tenantId:    string
  name:        string
  nodes:       TwinNode[]
  edges:       TwinEdge[]
  builtAt:     Date
  builtFrom:   string[]   // data sources used
  nodeCount:   number
  edgeCount:   number
}

// ─────────────────────────────────────────────
// ATTACK PATH
// ─────────────────────────────────────────────

export interface AttackStep {
  stepNumber:    number
  fromNode:      string    // node ID
  toNode:        string    // node ID
  technique:     string    // MITRE ID
  description:   string
  likelihood:    number    // 0–100
  detectable:    boolean   // Does ZonForge detect this step?
  detectionRule?: string
}

export interface AttackPath {
  id:              string
  twinId:          string
  name:            string
  entryPoint:      string   // node ID (attacker entry)
  target:          string   // node ID (attacker goal)
  steps:           AttackStep[]
  totalLikelihood: number   // product of step likelihoods
  detectability:   number   // % of steps that are detected
  criticalGap:     boolean  // any step undetected?
  mitreTechniques: string[]
  severity:        'critical' | 'high' | 'medium' | 'low'
  remediations:    string[]
}

// ─────────────────────────────────────────────
// SIMULATION RESULT
// ─────────────────────────────────────────────

export interface TwinSimulationResult {
  id:           string
  twinId:       string
  tenantId:     string
  runAt:        Date
  durationMs:   number

  // Summary
  attackPaths:        AttackPath[]
  criticalPathCount:  number
  undetectedSteps:    number
  overallRiskScore:   number    // 0–100
  detectability:      number    // % of attack steps detected

  // Breakdown
  topVulnerableNodes:  Array<{ nodeId: string; label: string; pathCount: number; risk: number }>
  topUndetectedTech:   Array<{ technique: string; count: number }>
  recommendedControls: string[]

  // DevSecOps
  deploymentRiskLevel: 'safe' | 'risky' | 'critical'
  deploymentRecommendation: string
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const BuildTwinSchema = z.object({
  name:     z.string().min(1).max(200).default('Production Twin'),
  sources:  z.array(z.enum(['connectors','alerts','risk_scores','manual'])).default(['connectors','alerts','risk_scores']),
})

export const SimulateTwinSchema = z.object({
  twinId:    z.string().uuid(),
  scenarios: z.array(z.string()).default(['credential_attack','lateral_movement','data_exfiltration']),
})

export const AddNodeSchema = z.object({
  twinId:   z.string().uuid(),
  type:     z.enum(['user_identity','workstation','server','cloud_service','database','network_segment','external_endpoint','saas_application','data_store']),
  label:    z.string().min(1).max(200),
  properties: z.record(z.unknown()).default({}),
  privilege:  z.enum(['high','medium','low']).default('low'),
  internet_exposed: z.boolean().default(false),
})

// ─────────────────────────────────────────────
// MITRE TECHNIQUES for path simulation
// ─────────────────────────────────────────────

export const ATTACK_TECHNIQUES: Record<string, { name: string; detectable: boolean; rule?: string }> = {
  'T1078':    { name: 'Valid Accounts',         detectable: true,  rule: 'ZF-AUTH-001' },
  'T1110':    { name: 'Brute Force',            detectable: true,  rule: 'ZF-AUTH-001' },
  'T1021':    { name: 'Remote Services',        detectable: true,  rule: 'ZF-LATERAL-001' },
  'T1098':    { name: 'Account Manipulation',   detectable: true,  rule: 'ZF-PRIVESC-001' },
  'T1530':    { name: 'Cloud Storage Access',   detectable: true,  rule: 'ZF-DATA-001' },
  'T1114.003':{ name: 'Email Forwarding',       detectable: true,  rule: 'ZF-DATA-001' },
  'T1550.001':{ name: 'OAuth Token Abuse',      detectable: true,  rule: 'ZF-OAUTH-001' },
  'T1078.004':{ name: 'Cloud Account Abuse',    detectable: true,  rule: 'ZF-AWS-001' },
  'T1190':    { name: 'Exploit Public App',     detectable: false },
  'T1133':    { name: 'External Remote Service',detectable: false },
  'T1566':    { name: 'Phishing',               detectable: false },
  'T1027':    { name: 'Obfuscation',            detectable: false },
}
