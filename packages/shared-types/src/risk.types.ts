import { z } from 'zod'
import { SeveritySchema } from './detection.types.js'

// ─────────────────────────────────────────────
// RISK SCORING TYPES
// ─────────────────────────────────────────────

export const RiskEntityTypeSchema = z.enum([
  'user',
  'asset',
  'session',
  'org',
])
export type RiskEntityType = z.infer<typeof RiskEntityTypeSchema>

export const ContributingSignalSchema = z.object({
  signalType: z.string(),
  description: z.string(),
  contribution: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  sourceAlertId: z.string().uuid().nullable(),
  sourceRuleId: z.string().uuid().nullable(),
  detectedAt: z.date(),
})
export type ContributingSignal = z.infer<typeof ContributingSignalSchema>

export const AnalystOverrideSchema = z.object({
  previousScore: z.number().int().min(0).max(100),
  newScore: z.number().int().min(0).max(100),
  justification: z.string().min(10),
  analystId: z.string().uuid(),
  analystEmail: z.string().email(),
  overriddenAt: z.date(),
})
export type AnalystOverride = z.infer<typeof AnalystOverrideSchema>

export const RiskScoreSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  entityType: RiskEntityTypeSchema,
  entityId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  severity: SeveritySchema,
  confidenceBand: z.enum(['low', 'medium', 'high']),
  contributingSignals: z.array(ContributingSignalSchema),
  analystOverride: AnalystOverrideSchema.nullable(),
  calculatedAt: z.date(),
  validUntil: z.date(),
  decayRate: z.number().min(0).max(1).default(0.05),
})
export type RiskScore = z.infer<typeof RiskScoreSchema>

// Score → Severity mapping
export const scoreToSeverity = (score: number): z.infer<typeof SeveritySchema> => {
  if (score >= 85) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 50) return 'medium'
  if (score >= 25) return 'low'
  return 'info'
}

// Org posture score
export const OrgPostureSchema = z.object({
  tenantId: z.string().uuid(),
  postureScore: z.number().int().min(0).max(100), // 100 = best posture
  openCriticalAlerts: z.number().int(),
  openHighAlerts: z.number().int(),
  averageUserRiskScore: z.number(),
  topRiskUserIds: z.array(z.string().uuid()),
  topRiskAssetIds: z.array(z.string().uuid()),
  connectorHealthScore: z.number().int().min(0).max(100),
  rulesCoverage: z.number().min(0).max(1),
  mttdP50Minutes: z.number().nullable(),
  mttdP95Minutes: z.number().nullable(),
  calculatedAt: z.date(),
})
export type OrgPosture = z.infer<typeof OrgPostureSchema>

// ─────────────────────────────────────────────
// ASSET TYPES
// ─────────────────────────────────────────────

export const AssetTypeSchema = z.enum([
  'server',
  'workstation',
  'cloud_resource',
  'database',
  'api_endpoint',
  'saas_application',
  'network_device',
  'container',
  'storage_bucket',
  'identity_provider',
])
export type AssetType = z.infer<typeof AssetTypeSchema>

export const AssetSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  type: AssetTypeSchema,
  hostname: z.string().nullable(),
  ipAddresses: z.array(z.string()),
  isInternetFacing: z.boolean().default(false),
  criticality: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  cloudProvider: z.enum(['aws', 'azure', 'gcp', 'other']).nullable(),
  cloudAccountId: z.string().nullable(),
  cloudRegion: z.string().nullable(),
  cloudResourceId: z.string().nullable(),
  tags: z.record(z.string()).default({}),
  riskScore: z.number().int().min(0).max(100).default(0),
  vulnerabilityCount: z.object({
    critical: z.number().int(),
    high: z.number().int(),
    medium: z.number().int(),
    low: z.number().int(),
  }).default({ critical: 0, high: 0, medium: 0, low: 0 }),
  lastSeenAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Asset = z.infer<typeof AssetSchema>

// ─────────────────────────────────────────────
// VULNERABILITY TYPES
// ─────────────────────────────────────────────
export const VulnerabilitySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  assetId: z.string().uuid(),
  cveId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  cvssScore: z.number().min(0).max(10),
  severity: SeveritySchema,
  isInternetFacing: z.boolean().default(false),
  isExploitAvailable: z.boolean().default(false),
  remediationGuidance: z.string().nullable(),
  detectedAt: z.date(),
  remediatedAt: z.date().nullable(),
  sourceScanner: z.string(),
  createdAt: z.date(),
})
export type Vulnerability = z.infer<typeof VulnerabilitySchema>
