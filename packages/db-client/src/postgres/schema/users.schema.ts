import {
  pgTable, pgEnum, uuid, text, boolean,
  timestamp, index, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.schema.js'

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', [
  'PLATFORM_ADMIN',
  'TENANT_ADMIN',
  'SECURITY_ANALYST',
  'READ_ONLY',
  'API_CONNECTOR',
])

export const userStatusEnum = pgEnum('user_status', [
  'active', 'suspended', 'pending_mfa', 'invited',
])

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────

export const users = pgTable('users', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
  email:          text('email').notNull(),
  name:           text('name').notNull(),
  role:           userRoleEnum('role').notNull().default('SECURITY_ANALYST'),
  status:         userStatusEnum('status').notNull().default('active'),
  passwordHash:   text('password_hash'),
  // MFA
  mfaEnabled:     boolean('mfa_enabled').notNull().default(false),
  mfaSecret:      text('mfa_secret'),           // encrypted at app layer
  mfaBackupCodes: text('mfa_backup_codes'),     // encrypted JSON array
  // SSO
  ssoProvider:    text('sso_provider'),
  ssoSubjectId:   text('sso_subject_id'),
  // Identity context (synced from IdP)
  department:     text('department'),
  jobTitle:       text('job_title'),
  managerId:      uuid('manager_id'),
  isContractor:   boolean('is_contractor').notNull().default(false),
  privilegeGroups: text('privilege_groups').array().notNull().default([]),
  mfaEnrolled:    boolean('mfa_enrolled').notNull().default(false),
  lastPasswordChangeAt: timestamp('last_password_change_at', { withTimezone: true }),
  lastAccessReviewAt:   timestamp('last_access_review_at', { withTimezone: true }),
  idpSyncedAt:    timestamp('idp_synced_at', { withTimezone: true }),
  // Activity
  lastLoginAt:    timestamp('last_login_at', { withTimezone: true }),
  lastLoginIp:    text('last_login_ip'),
  failedLoginCount: text('failed_login_count').default('0'),
  // Timestamps
  invitedAt:      timestamp('invited_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:      timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  tenantEmailIdx:  uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
  tenantIdx:       index('users_tenant_idx').on(t.tenantId),
  roleIdx:         index('users_role_idx').on(t.role),
}))

// ─────────────────────────────────────────────
// REFRESH TOKENS
// ─────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  tokenHash:    text('token_hash').notNull().unique(),
  userAgent:    text('user_agent'),
  ipAddress:    text('ip_address'),
  isRevoked:    boolean('is_revoked').notNull().default(false),
  expiresAt:    timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt:    timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  userIdx:      index('refresh_tokens_user_idx').on(t.userId),
  tokenHashIdx: index('refresh_tokens_hash_idx').on(t.tokenHash),
}))

// ─────────────────────────────────────────────
// API KEYS
// ─────────────────────────────────────────────

export const apiKeys = pgTable('api_keys', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  name:         text('name').notNull(),
  keyHash:      text('key_hash').notNull().unique(),
  keyPrefix:    text('key_prefix').notNull(),   // first 8 chars shown in UI
  role:         userRoleEnum('role').notNull().default('API_CONNECTOR'),
  connectorId:  uuid('connector_id'),           // bound to specific connector
  lastUsedAt:   timestamp('last_used_at', { withTimezone: true }),
  lastUsedIp:   text('last_used_ip'),
  expiresAt:    timestamp('expires_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt:    timestamp('revoked_at', { withTimezone: true }),
  createdBy:    uuid('created_by').references(() => users.id),
}, (t) => ({
  tenantIdx:   index('api_keys_tenant_idx').on(t.tenantId),
  keyHashIdx:  index('api_keys_hash_idx').on(t.keyHash),
}))

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant:        one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  refreshTokens: many(refreshTokens),
  apiKeys:       many(apiKeys),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user:   one(users,   { fields: [refreshTokens.userId],   references: [users.id] }),
  tenant: one(tenants, { fields: [refreshTokens.tenantId], references: [tenants.id] }),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  tenant: one(tenants, { fields: [apiKeys.tenantId], references: [tenants.id] }),
}))
