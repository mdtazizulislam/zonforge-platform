import { z } from 'zod'

// ─────────────────────────────────────────────
// AI SOC ANALYST — DOMAIN TYPES
// ─────────────────────────────────────────────

export type InvestigationStatus =
  | 'queued'
  | 'investigating'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'

export type Verdict =
  | 'true_positive'      // Real attack, confirmed
  | 'false_positive'     // Benign activity, noise
  | 'true_positive_benign' // Attack pattern but authorized action
  | 'insufficient_evidence' // Cannot determine
  | 'escalate'           // Needs human with higher clearance

export type SeverityRecommendation = 'critical' | 'high' | 'medium' | 'low' | 'info'

// ─────────────────────────────────────────────
// AGENT REASONING STEP
// ─────────────────────────────────────────────

export interface AgentThought {
  step:        number
  type:        'hypothesis' | 'tool_call' | 'observation' | 'reasoning' | 'conclusion'
  content:     string
  toolName?:   string
  toolInput?:  Record<string, unknown>
  toolOutput?: unknown
  timestamp:   Date
  tokensUsed?: number
}

// ─────────────────────────────────────────────
// EVIDENCE ITEM
// ─────────────────────────────────────────────

export interface EvidenceItem {
  id:          string
  type:        'alert_history' | 'login_event' | 'ip_reputation' | 'user_behavior'
              | 'threat_intel' | 'peer_comparison' | 'timeline_event' | 'risk_score'
              | 'geolocation' | 'device_fingerprint' | 'custom_query'
  source:      string
  title:       string
  description: string
  data:        unknown
  collectedAt: Date
  relevance:   'high' | 'medium' | 'low'
  supportsTP:  boolean   // supports True Positive verdict?
  supportsFP:  boolean   // supports False Positive verdict?
}

// ─────────────────────────────────────────────
// INVESTIGATION RESULT
// ─────────────────────────────────────────────

export interface InvestigationResult {
  id:              string
  tenantId:        string
  alertId:         string
  alertTitle:      string
  alertSeverity:   string

  status:          InvestigationStatus
  verdict:         Verdict | null
  confidence:      number      // 0–100
  severityRec:     SeverityRecommendation | null
  requiresHuman:   boolean

  // Agent reasoning
  thoughts:        AgentThought[]
  hypotheses:      string[]
  evidence:        EvidenceItem[]

  // Final report (markdown)
  executiveSummary: string
  detailedReport:  string
  attackNarrative: string
  iocList:         string[]
  recommendations: string[]

  // Metadata
  agentModel:      string
  totalSteps:      number
  totalTokens:     number
  durationMs:      number
  startedAt:       Date
  completedAt:     Date | null

  // Human review
  humanReviewedBy?: string
  humanVerdict?:    Verdict
  humanNotes?:      string
  reviewedAt?:      Date
}

// ─────────────────────────────────────────────
// TOOL DEFINITIONS (for Claude tool use)
// ─────────────────────────────────────────────

export const ANALYST_TOOLS = [
  {
    name: 'get_alert_details',
    description: 'Retrieve full details of the alert being investigated including all associated metadata, affected entities, and timeline.',
    input_schema: {
      type: 'object',
      properties: {
        alert_id: { type: 'string', description: 'The alert ID to retrieve' },
      },
      required: ['alert_id'],
    },
  },
  {
    name: 'get_user_activity_history',
    description: 'Get the recent activity history for a specific user — login times, locations, accessed resources, typical behavior patterns.',
    input_schema: {
      type: 'object',
      properties: {
        user_id:      { type: 'string', description: 'User identifier or email' },
        lookback_hours: { type: 'number', description: 'Hours to look back (default 168 = 7 days)', default: 168 },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'get_ip_reputation',
    description: 'Check threat intelligence reputation for an IP address — known malicious, ASN, country, previous attack associations.',
    input_schema: {
      type: 'object',
      properties: {
        ip_address: { type: 'string', description: 'IP address to check' },
      },
      required: ['ip_address'],
    },
  },
  {
    name: 'get_related_alerts',
    description: 'Find other alerts related to the same user, IP, or asset within a time window — useful for correlation and attack chain identification.',
    input_schema: {
      type: 'object',
      properties: {
        entity_id:    { type: 'string', description: 'User ID, IP address, or asset ID to search for' },
        entity_type:  { type: 'string', enum: ['user', 'ip', 'asset'], description: 'Type of entity' },
        lookback_days:{ type: 'number', description: 'Days to look back', default: 7 },
      },
      required: ['entity_id', 'entity_type'],
    },
  },
  {
    name: 'get_user_risk_score',
    description: 'Get the current risk score and contributing signals for a user.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User identifier' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'query_event_timeline',
    description: 'Query the raw event timeline for an entity across all data sources. Returns chronological event stream.',
    input_schema: {
      type: 'object',
      properties: {
        actor_id:     { type: 'string', description: 'User ID or IP to query timeline for' },
        start_time:   { type: 'string', description: 'ISO 8601 start time' },
        end_time:     { type: 'string', description: 'ISO 8601 end time' },
        event_types:  { type: 'array',  items: { type: 'string' }, description: 'Optional: filter to specific event types' },
      },
      required: ['actor_id', 'start_time', 'end_time'],
    },
  },
  {
    name: 'check_peer_comparison',
    description: 'Compare a user behavior metric against peers in the same department/role — useful for establishing whether activity is unusual.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User to compare' },
        metric:  { type: 'string', description: 'Metric to compare (e.g. file_downloads_per_day, login_countries)' },
      },
      required: ['user_id', 'metric'],
    },
  },
  {
    name: 'get_mitre_technique_context',
    description: 'Get detailed context about a MITRE ATT&CK technique — description, common tools, detection guidance, and example real-world incidents.',
    input_schema: {
      type: 'object',
      properties: {
        technique_id: { type: 'string', description: 'MITRE technique ID e.g. T1110' },
      },
      required: ['technique_id'],
    },
  },
] as const

export type ToolName = typeof ANALYST_TOOLS[number]['name']

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const StartInvestigationSchema = z.object({
  alertId:   z.string().uuid(),
  priority:  z.enum(['immediate', 'normal', 'background']).default('normal'),
  maxSteps:  z.number().int().min(3).max(20).default(10),
})

export const ReviewInvestigationSchema = z.object({
  investigationId: z.string().uuid(),
  verdict:         z.enum(['true_positive','false_positive','true_positive_benign','insufficient_evidence','escalate']),
  notes:           z.string().max(2000).optional(),
})
