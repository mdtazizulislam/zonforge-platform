import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, integer, jsonb, real, index, uniqueIndex,
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

export const simulationResults = pgTable('simulation_results', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  scenarioId:          text('scenario_id').notNull(),
  scenarioName:        text('scenario_name').notNull(),
  category:            text('category').notNull(),
  mitreTechniques:     text('mitre_techniques').array().notNull().default([]),
  expectedRules:       text('expected_rules').array().notNull().default([]),
  status:              text('status').notNull().default('pending'),
  evaluationStatus:    text('evaluation_status').notNull().default('timeout'),
  detectionRatePct:    integer('detection_rate_pct').notNull().default(0),
  detectionsFound:     integer('detections_found').notNull().default(0),
  eventsInjected:      integer('events_injected').notNull().default(0),
  gapRules:            text('gap_rules').array().notNull().default([]),
  detections:          jsonb('detections').notNull().default([]),
  gaps:                text('gaps').array().notNull().default([]),
  recommendations:     text('recommendations').array().notNull().default([]),
  summary:             text('summary').notNull().default(''),
  sandboxed:           boolean('sandboxed').notNull().default(true),
  simulationMarker:    text('simulation_marker').notNull(),
  triggeredBy:         text('triggered_by').notNull().default('manual'),
  completedAt:         timestamp('completed_at', { withTimezone: true }),
  durationMs:          integer('duration_ms'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantCreatedIdx:    index('simulation_results_tenant_created_idx').on(t.tenantId, t.createdAt),
  tenantStatusIdx:     index('simulation_results_tenant_status_idx').on(t.tenantId, t.status),
  tenantScenarioIdx:   index('simulation_results_tenant_scenario_idx').on(t.tenantId, t.scenarioId),
}))

export const securityScores = pgTable('security_scores', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  overallScore:        integer('overall_score').notNull().default(0),
  overallGrade:        text('overall_grade').notNull().default('F'),
  categoryScores:      jsonb('category_scores').notNull().default([]),
  totalSimulations:    integer('total_simulations').notNull().default(0),
  passRate:            integer('pass_rate').notNull().default(0),
  criticalGaps:        text('critical_gaps').array().notNull().default([]),
  trend:               text('trend').notNull().default('stable'),
  calculatedAt:        timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantUniqueIdx:     uniqueIndex('security_scores_tenant_uidx').on(t.tenantId),
  tenantCalculatedIdx: index('security_scores_tenant_calculated_idx').on(t.tenantId, t.calculatedAt),
}))

export const savedHunts = pgTable('saved_hunts', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  name:                text('name').notNull(),
  description:         text('description').notNull().default(''),
  templateId:          text('template_id'),
  query:               text('query').notNull(),
  parameters:          jsonb('parameters').notNull().default({}),
  runCount:            integer('run_count').notNull().default(0),
  lastRunAt:           timestamp('last_run_at', { withTimezone: true }),
  createdBy:           uuid('created_by').references(() => users.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantCreatedIdx:    index('saved_hunts_tenant_created_idx').on(t.tenantId, t.createdAt),
  tenantTemplateIdx:   index('saved_hunts_tenant_template_idx').on(t.tenantId, t.templateId),
}))

export const supplyChainScans = pgTable('supply_chain_scans', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  projectName:         text('project_name').notNull(),
  ecosystem:           text('ecosystem').array().notNull().default([]),
  status:              text('status').notNull().default('queued'),
  manifestFiles:       text('manifest_files').array().notNull().default([]),
  manifestContent:     text('manifest_content'),
  filename:            text('filename'),
  totalPackages:       integer('total_packages').notNull().default(0),
  directDeps:          integer('direct_deps').notNull().default(0),
  transitiveDeps:      integer('transitive_deps').notNull().default(0),
  findings:            jsonb('findings').notNull().default([]),
  sbom:                jsonb('sbom').notNull().default([]),
  cveMapping:          jsonb('cve_mapping').notNull().default([]),
  riskScore:           integer('risk_score').notNull().default(0),
  supplyChainGrade:    text('supply_chain_grade').notNull().default('A'),
  criticalCount:       integer('critical_count').notNull().default(0),
  highCount:           integer('high_count').notNull().default(0),
  mediumCount:         integer('medium_count').notNull().default(0),
  lowCount:            integer('low_count').notNull().default(0),
  scanProgress:        integer('scan_progress').notNull().default(0),
  scannedBy:           uuid('scanned_by').references(() => users.id),
  startedAt:           timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:         timestamp('completed_at', { withTimezone: true }),
  durationMs:          integer('duration_ms').notNull().default(0),
  errorMessage:        text('error_message'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantCreatedIdx:    index('supply_chain_scans_tenant_created_idx').on(t.tenantId, t.createdAt),
  tenantStatusIdx:     index('supply_chain_scans_tenant_status_idx').on(t.tenantId, t.status),
}))

export const honeypots = pgTable('honeypots', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  type:                text('type').notNull(),
  name:                text('name').notNull(),
  placement:           text('placement'),
  value:               text('value'),
  description:         text('description').notNull().default(''),
  status:              text('status').notNull().default('active'),
  decoyValue:          text('decoy_value').notNull(),
  trackingToken:       text('tracking_token').notNull(),
  deployedTo:          text('deployed_to').notNull().default(''),
  tags:                text('tags').array().notNull().default([]),
  triggers:            jsonb('triggers').notNull().default([]),
  alertOnTrigger:      boolean('alert_on_trigger').notNull().default(true),
  alertSeverity:       text('alert_severity').notNull().default('critical'),
  instructions:        jsonb('instructions').notNull().default([]),
  triggeredAt:         timestamp('triggered_at', { withTimezone: true }),
  lastTriggeredAt:     timestamp('last_triggered_at', { withTimezone: true }),
  retiredAt:           timestamp('retired_at', { withTimezone: true }),
  triggerCount:        integer('trigger_count').notNull().default(0),
  lastTriggerDetails:  jsonb('last_trigger_details'),
  deployedAt:          timestamp('deployed_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:           uuid('created_by').references(() => users.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantCreatedIdx:    index('honeypots_tenant_created_idx').on(t.tenantId, t.createdAt),
  tenantStatusIdx:     index('honeypots_tenant_status_idx').on(t.tenantId, t.status),
  tokenUniqueIdx:      uniqueIndex('honeypots_tracking_token_uidx').on(t.trackingToken),
}))

export const honeypotTriggers = pgTable('honeypot_triggers', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  honeypotId:          uuid('honeypot_id').notNull().references(() => honeypots.id),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  triggeredAt:         timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  confidence:          text('confidence').notNull().default('definite'),
  triggerType:         text('trigger_type').notNull(),
  sourceIp:            text('source_ip'),
  userAgent:           text('user_agent'),
  requestPath:         text('request_path'),
  rawRequest:          jsonb('raw_request').notNull().default({}),
  alertId:             uuid('alert_id').references(() => alerts.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTriggeredIdx:  index('honeypot_triggers_tenant_triggered_idx').on(t.tenantId, t.triggeredAt),
  honeypotTriggeredIdx:index('honeypot_triggers_honeypot_triggered_idx').on(t.honeypotId, t.triggeredAt),
}))

export const digitalTwins = pgTable('digital_twins', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  name:                text('name').notNull(),
  nodes:               jsonb('nodes').notNull().default([]),
  edges:               jsonb('edges').notNull().default([]),
  builtFrom:           text('built_from').array().notNull().default([]),
  nodeCount:           integer('node_count').notNull().default(0),
  edgeCount:           integer('edge_count').notNull().default(0),
  builtAt:             timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:           uuid('created_by').references(() => users.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantCreatedIdx:    index('digital_twins_tenant_created_idx').on(t.tenantId, t.createdAt),
  tenantBuiltIdx:      index('digital_twins_tenant_built_idx').on(t.tenantId, t.builtAt),
}))

export const twinSimulations = pgTable('twin_simulations', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  twinId:                  uuid('twin_id').notNull().references(() => digitalTwins.id),
  tenantId:                uuid('tenant_id').notNull().references(() => tenants.id),
  attackPaths:             jsonb('attack_paths').notNull().default([]),
  criticalPathCount:       integer('critical_path_count').notNull().default(0),
  undetectedSteps:         integer('undetected_steps').notNull().default(0),
  overallRiskScore:        integer('overall_risk_score').notNull().default(0),
  detectability:           integer('detectability').notNull().default(0),
  topVulnerableNodes:      jsonb('top_vulnerable_nodes').notNull().default([]),
  topUndetectedTech:       jsonb('top_undetected_tech').notNull().default([]),
  recommendedControls:     text('recommended_controls').array().notNull().default([]),
  deploymentRiskLevel:     text('deployment_risk_level').notNull().default('safe'),
  deploymentRecommendation:text('deployment_recommendation').notNull().default(''),
  durationMs:              integer('duration_ms').notNull().default(0),
  runAt:                   timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:               timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantRunIdx:            index('twin_simulations_tenant_run_idx').on(t.tenantId, t.runAt),
  twinRunIdx:              index('twin_simulations_twin_run_idx').on(t.twinId, t.runAt),
}))

export const ssoConfigs = pgTable('sso_configs', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  provider:            text('provider').notNull(),
  enabled:             boolean('enabled').notNull().default(true),
  idpEntityId:         text('idp_entity_id').notNull(),
  idpSsoUrl:           text('idp_sso_url').notNull(),
  idpCertificate:      text('idp_certificate').notNull(),
  idpMetadataUrl:      text('idp_metadata_url'),
  attributeMap:        jsonb('attribute_map').notNull().default({}),
  jitEnabled:          boolean('jit_enabled').notNull().default(true),
  jitDefaultRole:      text('jit_default_role').notNull().default('SECURITY_ANALYST'),
  allowedDomains:      text('allowed_domains').array().notNull().default([]),
  loginCount:          integer('login_count').notNull().default(0),
  lastUsedAt:          timestamp('last_used_at', { withTimezone: true }),
  configuredBy:        uuid('configured_by').references(() => users.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantUniqueIdx:     uniqueIndex('sso_configs_tenant_uidx').on(t.tenantId),
}))

export const scimConfigs = pgTable('scim_configs', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  enabled:             boolean('enabled').notNull().default(true),
  version:             text('version').notNull().default('2.0'),
  bearerToken:         text('bearer_token').notNull(),
  scimBaseUrl:         text('scim_base_url').notNull(),
  provisionUsers:      boolean('provision_users').notNull().default(true),
  deprovisionUsers:    boolean('deprovision_users').notNull().default(true),
  syncGroups:          boolean('sync_groups').notNull().default(false),
  defaultRole:         text('default_role').notNull().default('READ_ONLY'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantUniqueIdx:     uniqueIndex('scim_configs_tenant_uidx').on(t.tenantId),
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
