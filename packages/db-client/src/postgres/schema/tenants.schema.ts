import {
  pgTable, pgEnum, uuid, text, boolean, timestamp,
  integer, jsonb, bigint, index, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export const tenantStatusEnum = pgEnum('tenant_status', [
  'active', 'suspended', 'trial', 'cancelled', 'snapshot',
])

export const planTierEnum = pgEnum('plan_tier', [
  'starter', 'growth', 'business', 'enterprise', 'mssp',
])

export const regionEnum = pgEnum('region', [
  'us-east-1', 'eu-west-1', 'ap-southeast-1',
])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active', 'past_due', 'cancelled', 'trialing',
])

// ─────────────────────────────────────────────
// TENANTS
// ─────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       text('name').notNull(),
  slug:       text('slug').notNull(),
  planTier:   planTierEnum('plan_tier').notNull().default('starter'),
  region:     regionEnum('region').notNull().default('us-east-1'),
  status:     tenantStatusEnum('status').notNull().default('trial'),
  settings:   jsonb('settings').notNull().default({}),
  // Billing
  stripeCustomerId: text('stripe_customer_id'),
  // BYOK
  kmsKeyArn:  text('kms_key_arn'),
  kmsKeyStatus: text('kms_key_status').default('platform_managed'),
  // Timestamps
  trialEndsAt:  timestamp('trial_ends_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:    timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  slugIdx:     uniqueIndex('tenants_slug_idx').on(t.slug),
  statusIdx:   index('tenants_status_idx').on(t.status),
}))

// ─────────────────────────────────────────────
// SUBSCRIPTIONS
// ─────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  tenantId:              uuid('tenant_id').notNull().references(() => tenants.id),
  stripeSubscriptionId:  text('stripe_subscription_id').unique(),
  planTier:              planTierEnum('plan_tier').notNull(),
  status:                subscriptionStatusEnum('status').notNull().default('trialing'),
  currentPeriodStart:    timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd:      timestamp('current_period_end', { withTimezone: true }).notNull(),
  trialEndsAt:           timestamp('trial_ends_at', { withTimezone: true }),
  cancelAtPeriodEnd:     boolean('cancel_at_period_end').notNull().default(false),
  cancelledAt:           timestamp('cancelled_at', { withTimezone: true }),
  createdAt:             timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('subscriptions_tenant_idx').on(t.tenantId),
}))

// ─────────────────────────────────────────────
// USAGE RECORDS
// ─────────────────────────────────────────────

export const usageRecords = pgTable('usage_records', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
  periodStart:    timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd:      timestamp('period_end', { withTimezone: true }).notNull(),
  identityCount:  integer('identity_count').notNull().default(0),
  eventCount:     bigint('event_count', { mode: 'bigint' }).notNull().default(0n),
  apiCallCount:   integer('api_call_count').notNull().default(0),
  connectorCount: integer('connector_count').notNull().default(0),
  storageGb:      integer('storage_gb').notNull().default(0),
  recordedAt:     timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantPeriodIdx: index('usage_records_tenant_period_idx').on(t.tenantId, t.periodStart),
}))

// ─────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
  subscriptions: many(subscriptions),
  usageRecords:  many(usageRecords),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  tenant: one(tenants, { fields: [subscriptions.tenantId], references: [tenants.id] }),
}))
