import {
  pgTable, pgEnum, uuid, text, boolean, timestamp,
  integer, jsonb, real, index, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.schema.js'
import { users } from './users.schema.js'
import { assets } from './connectors.schema.js'

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export const alertStatusEnum = pgEnum('alert_status', [
  'open', 'investigating', 'resolved', 'suppressed', 'false_positive',
])

export const alertPriorityEnum = pgEnum('alert_priority', [
  'P1', 'P2', 'P3', 'P4', 'P5',
])

export const detectionTypeEnum = pgEnum('detection_type', [
  'rule', 'anomaly', 'threat_intel', 'correlation',
])

export const entityTypeEnum = pgEnum('entity_type', [
  'user', 'asset', 'session', 'ip',
])

export const riskEntityTypeEnum = pgEnum('risk_entity_type', [
  'user', 'asset', 'session', 'org',
])

// ─────────────────────────────────────────────
// DETECTION RULES
// ─────────────────────────────────────────────

export const detectionRules = pgTable('detection_rules', {
  id:                uuid('id').primaryKey().defaultRandom(),
  tenantId:          uuid('tenant_id').references(() => tenants.id), // null = platform rule
  name:              text('name').notNull(),
  description:       text('description').notNull(),
  severity:          text('severity').notNull().default('medium'),
  enabled:           boolean('enabled').notNull().default(true),
  // MITRE ATT&CK
  mitreTactics:      text('mitre_tactics').array().notNull().default([]),
  mitreTechniques:   text('mitre_techniques').array().notNull().default([]),
  mitreSubTechniques: text('mitre_sub_techniques').array().notNull().default([]),
  mitreCoverageLevel: text('mitre_coverage_level').notNull().default('full'),
  // Rule definition
  sourceTypes:       text('source_types').array().notNull().default([]),
  conditions:        jsonb('conditions').notNull().default([]),
  aggregation:       jsonb('aggregation').default({}),
  lookbackMinutes:   integer('lookback_minutes').notNull().default(60),
  // Quality metrics
  confidenceScore:   real('confidence_score').notNull().default(0.8),
  falsePositiveRate: real('false_positive_rate').notNull().default(0),
  hitCount:          integer('hit_count').notNull().default(0),
  lastHitAt:         timestamp('last_hit_at', { withTimezone: true }),
  // Sigma
  isSigmaCompatible: boolean('is_sigma_compatible').notNull().default(false),
  sigmaId:           text('sigma_id'),
  sigmaYaml:         text('sigma_yaml'),
  version:           integer('version').notNull().default(1),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:         uuid('created_by').references(() => users.id),
}, (t) => ({
  tenantIdx:   index('rules_tenant_idx').on(t.tenantId),
  enabledIdx:  index('rules_enabled_idx').on(t.enabled),
}))

// ─────────────────────────────────────────────
// DETECTION SIGNALS (pre-alert)
// ─────────────────────────────────────────────

export const detectionSignals = pgTable('detection_signals', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  tenantId:             uuid('tenant_id').notNull().references(() => tenants.id),
  ruleId:               uuid('rule_id').references(() => detectionRules.id),
  detectionType:        detectionTypeEnum('detection_type').notNull(),
  entityType:           entityTypeEnum('entity_type').notNull(),
  entityId:             text('entity_id').notNull(),
  confidence:           real('confidence').notNull(),
  severity:             text('severity').notNull(),
  mitreTactics:         text('mitre_tactics').array().notNull().default([]),
  mitreTechniques:      text('mitre_techniques').array().notNull().default([]),
  evidenceEventIds:     text('evidence_event_ids').array().notNull().default([]),
  firstSignalTime:      timestamp('first_signal_time', { withTimezone: true }).notNull(),
  detectedAt:           timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  correlatedFindingId:  uuid('correlated_finding_id'),
  alertId:              uuid('alert_id'),
  metadata:             jsonb('metadata').notNull().default({}),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantEntityIdx:  index('signals_tenant_entity_idx').on(t.tenantId, t.entityId),
  tenantTimeIdx:    index('signals_tenant_time_idx').on(t.tenantId, t.detectedAt),
  correlationIdx:   index('signals_correlation_idx').on(t.correlatedFindingId),
}))

// ─────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────

export const alerts = pgTable('alerts', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  tenantId:              uuid('tenant_id').notNull().references(() => tenants.id),
  findingId:             uuid('finding_id').notNull(),
  title:                 text('title').notNull(),
  description:           text('description').notNull(),
  severity:              text('severity').notNull(),
  priority:              alertPriorityEnum('priority').notNull(),
  status:                alertStatusEnum('status').notNull().default('open'),
  // Evidence
  evidence:              jsonb('evidence').notNull().default([]),
  // LLM Narrative
  llmNarrative:          jsonb('llm_narrative'),
  llmNarrativeGeneratedAt: timestamp('llm_narrative_generated_at', { withTimezone: true }),
  // MITRE
  mitreTactics:          text('mitre_tactics').array().notNull().default([]),
  mitreTechniques:       text('mitre_techniques').array().notNull().default([]),
  // Recommended actions
  recommendedActions:    text('recommended_actions').array().notNull().default([]),
  // Affected entities
  affectedUserId:        uuid('affected_user_id').references(() => users.id),
  affectedAssetId:       uuid('affected_asset_id').references(() => assets.id),
  affectedIp:            text('affected_ip'),
  // Assignment
  assignedTo:            uuid('assigned_to').references(() => users.id),
  assignedAt:            timestamp('assigned_at', { withTimezone: true }),
  // MTTD tracking
  firstSignalTime:       timestamp('first_signal_time', { withTimezone: true }).notNull(),
  detectionGapMinutes:   integer('detection_gap_minutes'),
  mttdSlaTargetMinutes:  integer('mttd_sla_target_minutes'),
  mttdSlaBreached:       boolean('mttd_sla_breached').notNull().default(false),
  // Timestamps
  createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt:            timestamp('resolved_at', { withTimezone: true }),
}, (t) => ({
  tenantStatusIdx:   index('alerts_tenant_status_idx').on(t.tenantId, t.status),
  tenantPriorityIdx: index('alerts_tenant_priority_idx').on(t.tenantId, t.priority),
  tenantCreatedIdx:  index('alerts_tenant_created_idx').on(t.tenantId, t.createdAt),
  findingIdx:        uniqueIndex('alerts_finding_idx').on(t.tenantId, t.findingId),
  assignedToIdx:     index('alerts_assigned_idx').on(t.assignedTo),
}))

// ─────────────────────────────────────────────
// ANALYST FEEDBACK
// ─────────────────────────────────────────────

export const analystFeedback = pgTable('analyst_feedback', {
  id:           uuid('id').primaryKey().defaultRandom(),
  alertId:      uuid('alert_id').notNull().references(() => alerts.id),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  analystId:    uuid('analyst_id').notNull().references(() => users.id),
  verdict:      text('verdict').notNull(),   // true_positive | false_positive | unclear
  notes:        text('notes'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────
// RISK SCORES
// ─────────────────────────────────────────────

export const riskScores = pgTable('risk_scores', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  entityType:          riskEntityTypeEnum('entity_type').notNull(),
  entityId:            uuid('entity_id').notNull(),
  score:               integer('score').notNull().default(0),
  severity:            text('severity').notNull().default('info'),
  confidenceBand:      text('confidence_band').notNull().default('low'),
  contributingSignals: jsonb('contributing_signals').notNull().default([]),
  analystOverride:     jsonb('analyst_override'),
  decayRate:           real('decay_rate').notNull().default(0.05),
  calculatedAt:        timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  validUntil:          timestamp('valid_until', { withTimezone: true }).notNull(),
}, (t) => ({
  tenantEntityIdx: uniqueIndex('risk_scores_entity_idx').on(t.tenantId, t.entityType, t.entityId),
  tenantScoreIdx:  index('risk_scores_score_idx').on(t.tenantId, t.score),
}))

// ─────────────────────────────────────────────
// ORG POSTURE (materialized per tenant)
// ─────────────────────────────────────────────

export const orgPosture = pgTable('org_posture', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  postureScore:        integer('posture_score').notNull().default(50),
  openCriticalAlerts:  integer('open_critical_alerts').notNull().default(0),
  openHighAlerts:      integer('open_high_alerts').notNull().default(0),
  avgUserRiskScore:    real('avg_user_risk_score').notNull().default(0),
  topRiskUserIds:      uuid('top_risk_user_ids').array().notNull().default([]),
  topRiskAssetIds:     uuid('top_risk_asset_ids').array().notNull().default([]),
  connectorHealthScore: integer('connector_health_score').notNull().default(100),
  rulesCoverage:       real('rules_coverage').notNull().default(0),
  mttdP50Minutes:      real('mttd_p50_minutes'),
  mttdP95Minutes:      real('mttd_p95_minutes'),
  calculatedAt:        timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: uniqueIndex('org_posture_tenant_idx').on(t.tenantId),
}))

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  tenant:   one(tenants, { fields: [alerts.tenantId], references: [tenants.id] }),
  feedback: many(analystFeedback),
}))

export const detectionRulesRelations = relations(detectionRules, ({ one }) => ({
  tenant: one(tenants, { fields: [detectionRules.tenantId], references: [tenants.id] }),
}))
