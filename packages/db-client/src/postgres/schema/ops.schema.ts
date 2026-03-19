import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, integer, jsonb, real, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.schema.js'
import { users } from './users.schema.js'
import { alerts } from './detection.schema.js'

// ─────────────────────────────────────────────
// PLAYBOOKS
// ─────────────────────────────────────────────

export const playbookStatusEnum = pgEnum('playbook_exec_status', [
  'pending_approval', 'running', 'completed', 'failed', 'cancelled',
])

export const playbooks = pgTable('playbooks', {
  id:                uuid('id').primaryKey().defaultRandom(),
  tenantId:          uuid('tenant_id').references(() => tenants.id), // null = platform default
  name:              text('name').notNull(),
  description:       text('description').notNull(),
  triggerSeverities: text('trigger_severities').array().notNull().default([]),
  triggerRuleIds:    uuid('trigger_rule_ids').array().notNull().default([]),
  actions:           jsonb('actions').notNull().default([]),
  enabled:           boolean('enabled').notNull().default(true),
  executionCount:    integer('execution_count').notNull().default(0),
  lastExecutedAt:    timestamp('last_executed_at', { withTimezone: true }),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:         uuid('created_by').references(() => users.id),
}, (t) => ({
  tenantIdx: index('playbooks_tenant_idx').on(t.tenantId),
}))

export const playbookExecutions = pgTable('playbook_executions', {
  id:                uuid('id').primaryKey().defaultRandom(),
  playbookId:        uuid('playbook_id').notNull().references(() => playbooks.id),
  alertId:           uuid('alert_id').notNull().references(() => alerts.id),
  tenantId:          uuid('tenant_id').notNull().references(() => tenants.id),
  triggeredBy:       uuid('triggered_by').notNull().references(() => users.id),
  status:            playbookStatusEnum('status').notNull().default('pending_approval'),
  actionsCompleted:  jsonb('actions_completed').notNull().default([]),
  approvedBy:        uuid('approved_by').references(() => users.id),
  approvedAt:        timestamp('approved_at', { withTimezone: true }),
  completedAt:       timestamp('completed_at', { withTimezone: true }),
  errorMessage:      text('error_message'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx:  index('exec_tenant_idx').on(t.tenantId, t.createdAt),
  alertIdx:   index('exec_alert_idx').on(t.alertId),
}))

// ─────────────────────────────────────────────
// AUDIT LOGS (append-only + hash-chained)
// ─────────────────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  actorId:      uuid('actor_id'),
  actorEmail:   text('actor_email'),
  actorRole:    text('actor_role'),
  actorIp:      text('actor_ip'),
  action:       text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId:   text('resource_id'),
  changes:      jsonb('changes'),
  metadata:     jsonb('metadata').notNull().default({}),
  // Hash chain for tamper detection
  previousHash: text('previous_hash'),
  hash:         text('hash').notNull(),
  // Immutable timestamp — no updatedAt
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx:  index('audit_tenant_time_idx').on(t.tenantId, t.createdAt),
  actionIdx:      index('audit_action_idx').on(t.action),
  actorIdx:       index('audit_actor_idx').on(t.actorId),
}))

// ─────────────────────────────────────────────
// THREAT INTELLIGENCE
// ─────────────────────────────────────────────

export const iocTypeEnum = pgEnum('ioc_type', [
  'ip', 'domain', 'url', 'file_hash_md5',
  'file_hash_sha1', 'file_hash_sha256',
  'email', 'user_agent',
])

export const threatIntelIocs = pgTable('threat_intel_iocs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  iocType:      iocTypeEnum('ioc_type').notNull(),
  iocValue:     text('ioc_value').notNull(),
  confidence:   real('confidence').notNull().default(0.5),  // 0.0 - 1.0
  severity:     text('severity').notNull().default('medium'),
  feedSource:   text('feed_source').notNull(),
  description:  text('description'),
  tags:         text('tags').array().notNull().default([]),
  expiresAt:    timestamp('expires_at', { withTimezone: true }),
  firstSeenAt:  timestamp('first_seen_at', { withTimezone: true }).notNull(),
  lastSeenAt:   timestamp('last_seen_at', { withTimezone: true }).notNull(),
  hitCount:     integer('hit_count').notNull().default(0),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  iocValueIdx:    index('ioc_value_idx').on(t.iocType, t.iocValue),
  expiryIdx:      index('ioc_expiry_idx').on(t.expiresAt),
  feedIdx:        index('ioc_feed_idx').on(t.feedSource),
}))

export const threatIntelMatches = pgTable('threat_intel_matches', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  eventId:      text('event_id').notNull(),  // ClickHouse event_id
  iocId:        uuid('ioc_id').notNull().references(() => threatIntelIocs.id),
  iocType:      iocTypeEnum('ioc_type').notNull(),
  iocValue:     text('ioc_value').notNull(),
  matchedField: text('matched_field').notNull(), // e.g. "actor_ip"
  confidence:   real('confidence').notNull(),
  alertId:      uuid('alert_id').references(() => alerts.id),
  matchedAt:    timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx:    index('ti_matches_tenant_idx').on(t.tenantId, t.matchedAt),
  eventIdx:     index('ti_matches_event_idx').on(t.eventId),
}))

// ─────────────────────────────────────────────
// ANOMALY BASELINES (per user per metric)
// ─────────────────────────────────────────────

export const anomalyBaselines = pgTable('anomaly_baselines', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
  userId:         uuid('user_id').notNull(),
  metricName:     text('metric_name').notNull(), // login_hour, country_cluster, api_volume, etc.
  baselineData:   jsonb('baseline_data').notNull().default({}),
  sampleCount:    integer('sample_count').notNull().default(0),
  meanValue:      real('mean_value'),
  stdDevValue:    real('std_dev_value'),
  lastUpdatedAt:  timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  validFromDate:  timestamp('valid_from_date', { withTimezone: true }).notNull(),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantUserMetricIdx: index('baselines_user_metric_idx').on(t.tenantId, t.userId, t.metricName),
}))

// ─────────────────────────────────────────────
// POC RECORDS (sales engineering trials)
// ─────────────────────────────────────────────

export const pocRecords = pgTable('poc_records', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  tenantId:             uuid('tenant_id').notNull().references(() => tenants.id),
  companyName:          text('company_name').notNull(),
  companySize:          text('company_size').notNull(),
  industry:             text('industry').notNull(),
  country:              text('country').notNull(),
  championName:         text('champion_name').notNull(),
  championEmail:        text('champion_email').notNull(),
  championTitle:        text('champion_title').notNull(),
  economicBuyerName:    text('economic_buyer_name'),
  dealOwner:            text('deal_owner').notNull(),
  targetPlan:           text('target_plan').notNull(),
  targetMrr:            integer('target_mrr').notNull().default(0),
  competitorsMentioned: text('competitors_mentioned').array().notNull().default([]),
  status:               text('status').notNull().default('active'),
  startDate:            text('start_date').notNull(),
  endDate:              text('end_date').notNull(),
  durationDays:         integer('duration_days').notNull().default(30),
  actualEndDate:        text('actual_end_date'),
  successCriteria:      jsonb('success_criteria').notNull().default([]),
  milestones:           jsonb('milestones').notNull().default([]),
  checkIns:             jsonb('check_ins').notNull().default([]),
  criteriaMetCount:     integer('criteria_met_count').notNull().default(0),
  criteriaTotalCount:   integer('criteria_total_count').notNull().default(0),
  successScore:         integer('success_score').notNull().default(0),
  currentWeek:          integer('current_week').notNull().default(1),
  wonAt:                text('won_at'),
  lostAt:               text('lost_at'),
  lostReason:           text('lost_reason'),
  lostNotes:            text('lost_notes'),
  dealValue:            integer('deal_value'),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx:            index('poc_records_tenant_idx').on(t.tenantId),
  statusIdx:            index('poc_records_status_idx').on(t.status),
  createdIdx:           index('poc_records_created_idx').on(t.createdAt),
}))

export const pocEngagements = pgTable('poc_engagements', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  tenantId:             uuid('tenant_id').notNull().references(() => tenants.id),
  companyName:          text('company_name').notNull(),
  contactName:          text('contact_name').notNull(),
  contactEmail:         text('contact_email').notNull(),
  contactTitle:         text('contact_title').notNull(),
  industry:             text('industry').notNull(),
  companySize:          text('company_size').notNull(),
  useCase:              text('use_case').notNull(),
  estimatedDealSize:    integer('estimated_deal_size').notNull().default(0),
  status:               text('status').notNull().default('active'),
  startDate:            timestamp('start_date', { withTimezone: true }).notNull(),
  endDate:              timestamp('end_date', { withTimezone: true }).notNull(),
  extendedUntil:        timestamp('extended_until', { withTimezone: true }),
  trialDays:            integer('trial_days').notNull().default(30),
  successCriteria:      text('success_criteria').array().notNull().default([]),
  milestones:           jsonb('milestones').notNull().default([]),
  valueRealized:        jsonb('value_realized').notNull().default({}),
  healthScore:          integer('health_score').notNull().default(100),
  lastActivity:         timestamp('last_activity', { withTimezone: true }).notNull().defaultNow(),
  loginCount:           integer('login_count').notNull().default(0),
  featuresUsed:         text('features_used').array().notNull().default([]),
  churnRisk:            text('churn_risk').notNull().default('low'),
  churnReason:          text('churn_reason'),
  salesOwner:           text('sales_owner').notNull(),
  notes:                text('notes').notNull().default(''),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx:            index('poc_engagements_tenant_idx').on(t.tenantId),
  statusIdx:            index('poc_engagements_status_idx').on(t.status),
  createdIdx:           index('poc_engagements_created_idx').on(t.createdAt),
}))

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────

export const playbooksRelations = relations(playbooks, ({ one, many }) => ({
  tenant:     one(tenants, { fields: [playbooks.tenantId], references: [tenants.id] }),
  executions: many(playbookExecutions),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
}))

export const threatIntelMatchesRelations = relations(threatIntelMatches, ({ one }) => ({
  tenant: one(tenants, { fields: [threatIntelMatches.tenantId], references: [tenants.id] }),
  ioc:    one(threatIntelIocs, { fields: [threatIntelMatches.iocId], references: [threatIntelIocs.id] }),
}))
