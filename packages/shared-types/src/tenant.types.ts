import { z } from 'zod'

// ─────────────────────────────────────────────
// TENANT TYPES
// ─────────────────────────────────────────────

export const TenantStatusSchema = z.enum([
  'active',
  'suspended',
  'trial',
  'cancelled',
  'snapshot', // free-tier breach check only
])
export type TenantStatus = z.infer<typeof TenantStatusSchema>

export const PlanTierSchema = z.enum([
  'starter',
  'growth',
  'business',
  'enterprise',
  'mssp',
])
export type PlanTier = z.infer<typeof PlanTierSchema>

export const RegionSchema = z.enum([
  'us-east-1',
  'eu-west-1',
  'ap-southeast-1',
])
export type Region = z.infer<typeof RegionSchema>

export const TenantSettingsSchema = z.object({
  retentionDays: z.number().int().min(7).max(3650).default(90),
  businessHoursStart: z.number().int().min(0).max(23).default(8),
  businessHoursEnd: z.number().int().min(0).max(23).default(19),
  businessTimezone: z.string().default('UTC'),
  safeIps: z.array(z.string()).default([]),
  safeUserIds: z.array(z.string().uuid()).default([]),
  notificationEmail: z.string().email().optional(),
  notificationSlackWebhook: z.string().url().optional(),
  notificationWebhook: z.string().url().optional(),
  mfaRequired: z.boolean().default(false),
  allowedSsoProviders: z.array(z.string()).default([]),
  featureFlags: z.record(z.boolean()).default({}),
  eventBusType: z.enum(['bullmq', 'kafka']).default('bullmq'),
})
export type TenantSettings = z.infer<typeof TenantSettingsSchema>

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  planId: z.string().uuid(),
  planTier: PlanTierSchema,
  region: RegionSchema,
  status: TenantStatusSchema,
  settings: TenantSettingsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})
export type Tenant = z.infer<typeof TenantSchema>

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  planTier: PlanTierSchema.default('starter'),
  region: RegionSchema.default('us-east-1'),
  settings: TenantSettingsSchema.partial().optional(),
})
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>

// Plan limits per tier
export const PLAN_LIMITS: Record<PlanTier, {
  maxIdentities: number
  maxConnectors: number
  maxEventsPerMinute: number
  retentionDays: number
  maxCustomRules: number
  hasLlmNarratives: boolean
  hasPlaybooks: boolean
  hasSsoIntegration: boolean
  hasByok: boolean
  hasApiAccess: boolean
}> = {
  starter: {
    maxIdentities: 50,
    maxConnectors: 1,
    maxEventsPerMinute: 500,
    retentionDays: 30,
    maxCustomRules: 0,
    hasLlmNarratives: false,
    hasPlaybooks: false,
    hasSsoIntegration: false,
    hasByok: false,
    hasApiAccess: false,
  },
  growth: {
    maxIdentities: 200,
    maxConnectors: 3,
    maxEventsPerMinute: 2000,
    retentionDays: 90,
    maxCustomRules: 5,
    hasLlmNarratives: true,
    hasPlaybooks: false,
    hasSsoIntegration: false,
    hasByok: false,
    hasApiAccess: false,
  },
  business: {
    maxIdentities: 1000,
    maxConnectors: 10,
    maxEventsPerMinute: 10000,
    retentionDays: 180,
    maxCustomRules: 50,
    hasLlmNarratives: true,
    hasPlaybooks: true,
    hasSsoIntegration: true,
    hasByok: false,
    hasApiAccess: true,
  },
  enterprise: {
    maxIdentities: 999999,
    maxConnectors: 999,
    maxEventsPerMinute: 100000,
    retentionDays: 365,
    maxCustomRules: 999,
    hasLlmNarratives: true,
    hasPlaybooks: true,
    hasSsoIntegration: true,
    hasByok: true,
    hasApiAccess: true,
  },
  mssp: {
    maxIdentities: 999999,
    maxConnectors: 999,
    maxEventsPerMinute: 500000,
    retentionDays: 365,
    maxCustomRules: 999,
    hasLlmNarratives: true,
    hasPlaybooks: true,
    hasSsoIntegration: true,
    hasByok: true,
    hasApiAccess: true,
  },
}
