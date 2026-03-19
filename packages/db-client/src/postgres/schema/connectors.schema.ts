import {
  pgTable, pgEnum, uuid, text, boolean, timestamp,
  integer, jsonb, bigint, real, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.schema.js'

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export const connectorTypeEnum = pgEnum('connector_type', [
  'm365_entra', 'aws_cloudtrail', 'google_workspace',
  'azure_activity', 'gcp_audit', 'api_gateway_aws',
  'api_gateway_kong', 'cloudflare_waf', 'aws_waf',
  'generic_syslog', 'generic_webhook', 'vulnerability_scan_upload',
  'edr_crowdstrike', 'edr_sentinelone',
])

export const connectorStatusEnum = pgEnum('connector_status', [
  'active', 'degraded', 'error', 'paused', 'pending_auth',
])

export const assetTypeEnum = pgEnum('asset_type', [
  'server', 'workstation', 'cloud_resource', 'database',
  'api_endpoint', 'saas_application', 'network_device',
  'container', 'storage_bucket', 'identity_provider',
])

export const criticalityEnum = pgEnum('criticality', [
  'critical', 'high', 'medium', 'low',
])

// ─────────────────────────────────────────────
// CONNECTORS
// ─────────────────────────────────────────────

export const connectors = pgTable('connectors', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  tenantId:             uuid('tenant_id').notNull().references(() => tenants.id),
  name:                 text('name').notNull(),
  type:                 connectorTypeEnum('type').notNull(),
  status:               connectorStatusEnum('status').notNull().default('pending_auth'),
  // Config stored encrypted (AES-256-GCM via auth-utils)
  configEncrypted:      text('config_encrypted').notNull().default('{}'),
  configIv:             text('config_iv').notNull().default(''),
  pollIntervalMinutes:  integer('poll_interval_minutes').notNull().default(5),
  // Pagination state (per connector type)
  lastCursorState:      jsonb('last_cursor_state').default({}),
  // Health
  lastPollAt:           timestamp('last_poll_at', { withTimezone: true }),
  lastEventAt:          timestamp('last_event_at', { withTimezone: true }),
  lastErrorAt:          timestamp('last_error_at', { withTimezone: true }),
  lastErrorMessage:     text('last_error_message'),
  consecutiveErrors:    integer('consecutive_errors').notNull().default(0),
  eventRatePerHour:     real('event_rate_per_hour').notNull().default(0),
  totalEventsIngested:  bigint('total_events_ingested', { mode: 'bigint' }).notNull().default(0n),
  // Timestamps
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy:            uuid('created_by'),
}, (t) => ({
  tenantIdx:  index('connectors_tenant_idx').on(t.tenantId),
  statusIdx:  index('connectors_status_idx').on(t.status),
  typeIdx:    index('connectors_type_idx').on(t.type),
}))

// ─────────────────────────────────────────────
// CONNECTOR HEALTH LOG
// ─────────────────────────────────────────────

export const connectorHealthLog = pgTable('connector_health_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  connectorId:  uuid('connector_id').notNull().references(() => connectors.id),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  status:       connectorStatusEnum('status').notNull(),
  eventCount:   integer('event_count').notNull().default(0),
  lagMinutes:   integer('lag_minutes').notNull().default(0),
  errorMessage: text('error_message'),
  recordedAt:   timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  connectorIdx: index('health_log_connector_idx').on(t.connectorId, t.recordedAt),
}))

// ─────────────────────────────────────────────
// ASSETS
// ─────────────────────────────────────────────

export const assets = pgTable('assets', {
  id:                uuid('id').primaryKey().defaultRandom(),
  tenantId:          uuid('tenant_id').notNull().references(() => tenants.id),
  name:              text('name').notNull(),
  type:              assetTypeEnum('type').notNull(),
  hostname:          text('hostname'),
  ipAddresses:       text('ip_addresses').array().notNull().default([]),
  isInternetFacing:  boolean('is_internet_facing').notNull().default(false),
  criticality:       criticalityEnum('criticality').notNull().default('medium'),
  // Cloud context
  cloudProvider:     text('cloud_provider'),
  cloudAccountId:    text('cloud_account_id'),
  cloudRegion:       text('cloud_region'),
  cloudResourceId:   text('cloud_resource_id'),
  // Risk
  riskScore:         integer('risk_score').notNull().default(0),
  vulnCountCritical: integer('vuln_count_critical').notNull().default(0),
  vulnCountHigh:     integer('vuln_count_high').notNull().default(0),
  vulnCountMedium:   integer('vuln_count_medium').notNull().default(0),
  vulnCountLow:      integer('vuln_count_low').notNull().default(0),
  // Metadata
  tags:              jsonb('tags').notNull().default({}),
  lastSeenAt:        timestamp('last_seen_at', { withTimezone: true }),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx:          index('assets_tenant_idx').on(t.tenantId),
  internetFacingIdx:  index('assets_internet_facing_idx').on(t.tenantId, t.isInternetFacing),
  riskScoreIdx:       index('assets_risk_score_idx').on(t.tenantId, t.riskScore),
}))

// ─────────────────────────────────────────────
// VULNERABILITIES
// ─────────────────────────────────────────────

export const severityEnum = pgEnum('severity', [
  'critical', 'high', 'medium', 'low', 'info',
])

export const vulnerabilities = pgTable('vulnerabilities', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  assetId:             uuid('asset_id').notNull().references(() => assets.id),
  cveId:               text('cve_id'),
  title:               text('title').notNull(),
  description:         text('description'),
  cvssScore:           real('cvss_score').notNull(),
  severity:            severityEnum('severity').notNull(),
  isInternetFacing:    boolean('is_internet_facing').notNull().default(false),
  isExploitAvailable:  boolean('is_exploit_available').notNull().default(false),
  remediationGuidance: text('remediation_guidance'),
  detectedAt:          timestamp('detected_at', { withTimezone: true }).notNull(),
  remediatedAt:        timestamp('remediated_at', { withTimezone: true }),
  sourceScanner:       text('source_scanner').notNull(),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  assetIdx:         index('vulns_asset_idx').on(t.assetId),
  tenantSeverityIdx: index('vulns_tenant_severity_idx').on(t.tenantId, t.severity),
  cveIdx:           index('vulns_cve_idx').on(t.cveId),
}))

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────

export const connectorsRelations = relations(connectors, ({ one, many }) => ({
  tenant:     one(tenants, { fields: [connectors.tenantId], references: [tenants.id] }),
  healthLogs: many(connectorHealthLog),
}))

export const assetsRelations = relations(assets, ({ one, many }) => ({
  tenant:          one(tenants, { fields: [assets.tenantId], references: [tenants.id] }),
  vulnerabilities: many(vulnerabilities),
}))

export const vulnerabilitiesRelations = relations(vulnerabilities, ({ one }) => ({
  asset:  one(assets,   { fields: [vulnerabilities.assetId],  references: [assets.id] }),
  tenant: one(tenants,  { fields: [vulnerabilities.tenantId], references: [tenants.id] }),
}))
