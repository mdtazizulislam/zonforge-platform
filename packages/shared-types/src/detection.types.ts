import { z } from 'zod'

// ─────────────────────────────────────────────
// DETECTION & ALERT TYPES
// ─────────────────────────────────────────────

export const SeveritySchema = z.enum([
  'critical',
  'high',
  'medium',
  'low',
  'info',
])
export type Severity = z.infer<typeof SeveritySchema>

export const AlertPrioritySchema = z.enum(['P1', 'P2', 'P3', 'P4', 'P5'])
export type AlertPriority = z.infer<typeof AlertPrioritySchema>

export const AlertStatusSchema = z.enum([
  'open',
  'investigating',
  'resolved',
  'suppressed',
  'false_positive',
])
export type AlertStatus = z.infer<typeof AlertStatusSchema>

// MITRE ATT&CK reference
export const MitreAttackSchema = z.object({
  tacticId: z.string(),             // e.g. "TA0006"
  tacticName: z.string(),           // e.g. "Credential Access"
  techniqueId: z.string(),          // e.g. "T1110"
  techniqueName: z.string(),        // e.g. "Brute Force"
  subTechniqueId: z.string().nullable(), // e.g. "T1110.001"
  subTechniqueName: z.string().nullable(),
})
export type MitreAttack = z.infer<typeof MitreAttackSchema>

// Evidence item in an alert
export const EvidenceItemSchema = z.object({
  eventId: z.string().uuid(),
  eventTime: z.date(),
  sourceType: z.string(),
  eventCategory: z.string(),
  eventAction: z.string(),
  actorUserId: z.string().uuid().nullable(),
  actorIp: z.string().nullable(),
  targetAssetId: z.string().uuid().nullable(),
  targetResource: z.string().nullable(),
  outcome: z.string(),
  description: z.string(),           // human-readable description
  threatIntelMatch: z.object({
    matched: z.boolean(),
    iocType: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    feedSource: z.string().optional(),
  }).optional(),
})
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>

// LLM-generated narrative
export const LlmNarrativeSchema = z.object({
  whatHappened: z.string(),
  whyItMatters: z.string(),
  recommendedNextSteps: z.array(z.string()),
  confidenceAssessment: z.string(),
  generatedAt: z.date(),
  modelUsed: z.string(),
})
export type LlmNarrative = z.infer<typeof LlmNarrativeSchema>

// Detection signal (pre-alert)
export const DetectionSignalSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  ruleId: z.string().uuid().nullable(),
  detectionType: z.enum(['rule', 'anomaly', 'threat_intel', 'correlation']),
  entityType: z.enum(['user', 'asset', 'session', 'ip']),
  entityId: z.string(),
  confidence: z.number().min(0).max(1),
  severity: SeveritySchema,
  mitre: z.array(MitreAttackSchema),
  evidenceEventIds: z.array(z.string().uuid()),
  firstSignalTime: z.date(),
  detectedAt: z.date(),
  correlatedFindingId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()).default({}),
})
export type DetectionSignal = z.infer<typeof DetectionSignalSchema>

// Full alert
export const AlertSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  findingId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  severity: SeveritySchema,
  priority: AlertPrioritySchema,
  status: AlertStatusSchema,
  evidence: z.array(EvidenceItemSchema),
  llmNarrative: LlmNarrativeSchema.nullable(),
  mitreTactics: z.array(z.string()),
  mitreTechniques: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  affectedUserId: z.string().uuid().nullable(),
  affectedAssetId: z.string().uuid().nullable(),
  affectedIp: z.string().nullable(),
  assignedTo: z.string().uuid().nullable(),
  firstSignalTime: z.date(),
  detectionGapMinutes: z.number().int().nullable(),
  mttdSlaTargetMinutes: z.number().int().nullable(),
  mttdSlaBreached: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
  resolvedAt: z.date().nullable(),
})
export type Alert = z.infer<typeof AlertSchema>

// Detection rule definition
export const DetectionRuleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(), // null = platform rule
  name: z.string(),
  description: z.string(),
  severity: SeveritySchema,
  enabled: z.boolean().default(true),
  mitre: z.array(MitreAttackSchema),
  sourceTypes: z.array(z.string()),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'not_in', 'regex']),
    value: z.unknown(),
  })),
  aggregation: z.object({
    groupByFields: z.array(z.string()),
    countThreshold: z.number().int().optional(),
    windowMinutes: z.number().int(),
    distinctField: z.string().optional(),
    distinctThreshold: z.number().int().optional(),
  }).optional(),
  lookbackMinutes: z.number().int().default(60),
  confidenceScore: z.number().min(0).max(1).default(0.8),
  falsePositiveRate: z.number().min(0).max(1).default(0),
  hitCount: z.number().int().default(0),
  isSigmaCompatible: z.boolean().default(false),
  sigmaId: z.string().nullable(),
  version: z.number().int().default(1),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type DetectionRule = z.infer<typeof DetectionRuleSchema>

// Severity → Priority mapping
export const SEVERITY_TO_PRIORITY: Record<Severity, AlertPriority> = {
  critical: 'P1',
  high: 'P2',
  medium: 'P3',
  low: 'P4',
  info: 'P5',
}

// Analyst feedback
export const AnalystFeedbackSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid(),
  tenantId: z.string().uuid(),
  analystId: z.string().uuid(),
  verdict: z.enum(['true_positive', 'false_positive', 'unclear']),
  notes: z.string().max(2000).nullable(),
  createdAt: z.date(),
})
export type AnalystFeedback = z.infer<typeof AnalystFeedbackSchema>
