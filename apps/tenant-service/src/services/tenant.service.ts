import { eq, and, isNull } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb, schema } from '@zonforge/db-client'
import { RedisKeys, RedisTTL } from '@zonforge/db-client'
import { PLAN_LIMITS, type PlanTier, TenantSettingsSchema } from '@zonforge/shared-types'
import { computeAuditHash } from '@zonforge/auth-utils'
import { createLogger } from '@zonforge/logger'
import type Redis from 'ioredis'

const log = createLogger({ service: 'tenant-service' })

// ─────────────────────────────────────────────
// CREATE TENANT
// ─────────────────────────────────────────────

export interface CreateTenantInput {
  name:       string
  slug:       string
  planTier:   PlanTier
  region:     'us-east-1' | 'eu-west-1' | 'ap-southeast-1'
  createdBy:  string
  settings?:  Partial<typeof TenantSettingsSchema._type>
}

export async function createTenant(input: CreateTenantInput) {
  const db = getDb()

  // Check slug uniqueness
  const existing = await db.select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, input.slug))
    .limit(1)

  if (existing.length > 0) {
    throw new TenantError('Slug already in use', 'SLUG_TAKEN')
  }

  const tenantId = uuidv4()
  const now      = new Date()

  // Merge defaults with provided settings
  const settings = TenantSettingsSchema.parse({
    ...input.settings,
    retentionDays: PLAN_LIMITS[input.planTier].retentionDays,
  })

  await db.insert(schema.tenants).values({
    id:        tenantId,
    name:      input.name,
    slug:      input.slug,
    planTier:  input.planTier,
    region:    input.region,
    status:    input.planTier === 'starter' ? 'trial' : 'active',
    settings,
    trialEndsAt: input.planTier === 'starter'
      ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      : null,
    createdAt: now,
    updatedAt: now,
  })

  // Create initial subscription record
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  await db.insert(schema.subscriptions).values({
    id:                 uuidv4(),
    tenantId,
    planTier:           input.planTier,
    status:             'trialing',
    currentPeriodStart: now,
    currentPeriodEnd:   periodEnd,
    trialEndsAt:        settings.retentionDays > 0
      ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      : null,
    createdAt: now,
    updatedAt: now,
  })

  await writeAuditLog({
    tenantId,
    actorId:      input.createdBy,
    action:       'tenant.created',
    resourceType: 'tenant',
    resourceId:   tenantId,
    changes:      { name: input.name, slug: input.slug, planTier: input.planTier },
  })

  log.info({ tenantId, slug: input.slug }, 'Tenant created')
  return { tenantId, slug: input.slug }
}

// ─────────────────────────────────────────────
// GET TENANT
// ─────────────────────────────────────────────

export async function getTenant(tenantId: string, redis: Redis) {
  // Check cache
  const cached = await redis.get(RedisKeys.tenantSettings(tenantId))
  if (cached) return JSON.parse(cached)

  const db = getDb()
  const rows = await db.select()
    .from(schema.tenants)
    .where(and(
      eq(schema.tenants.id, tenantId),
      isNull(schema.tenants.deletedAt),
    ))
    .limit(1)

  const tenant = rows[0]
  if (!tenant) throw new TenantError('Tenant not found', 'NOT_FOUND')

  // Cache for 10 minutes
  await redis.setex(
    RedisKeys.tenantSettings(tenantId),
    RedisTTL.TENANT_SETTINGS,
    JSON.stringify(tenant),
  )

  return tenant
}

// ─────────────────────────────────────────────
// UPDATE TENANT SETTINGS
// ─────────────────────────────────────────────

export async function updateTenantSettings(
  tenantId: string,
  updates: Partial<typeof TenantSettingsSchema._type>,
  actorId: string,
  actorIp: string,
  redis: Redis,
) {
  const db = getDb()

  const tenant = await getTenant(tenantId, redis)

  const newSettings = TenantSettingsSchema.parse({
    ...tenant.settings,
    ...updates,
  })

  await db.update(schema.tenants)
    .set({ settings: newSettings, updatedAt: new Date() })
    .where(eq(schema.tenants.id, tenantId))

  // Invalidate cache
  await redis.del(RedisKeys.tenantSettings(tenantId))

  await writeAuditLog({
    tenantId,
    actorId,
    actorIp,
    action:       'settings.updated',
    resourceType: 'tenant',
    resourceId:   tenantId,
    changes:      updates,
  })

  log.info({ tenantId }, 'Tenant settings updated')
  return newSettings
}

// ─────────────────────────────────────────────
// SUSPEND / ACTIVATE TENANT (PLATFORM_ADMIN)
// ─────────────────────────────────────────────

export async function suspendTenant(
  tenantId: string,
  reason: string,
  actorId: string,
  redis: Redis,
) {
  const db = getDb()

  await db.update(schema.tenants)
    .set({ status: 'suspended', updatedAt: new Date() })
    .where(eq(schema.tenants.id, tenantId))

  await redis.del(RedisKeys.tenantSettings(tenantId))

  await writeAuditLog({
    tenantId,
    actorId,
    action:       'admin.tenant_suspended',
    resourceType: 'tenant',
    resourceId:   tenantId,
    changes:      { reason },
  })

  log.warn({ tenantId, reason }, 'Tenant suspended')
}

// ─────────────────────────────────────────────
// PLAN ENFORCEMENT
// ─────────────────────────────────────────────

export interface PlanLimitCheck {
  allowed:   boolean
  reason?:   string
  current?:  number
  limit?:    number
}

export async function checkPlanLimit(
  tenantId:  string,
  metric:    'connectors' | 'customRules' | 'identities',
  redis:     Redis,
): Promise<PlanLimitCheck> {
  const db     = getDb()
  const tenant = await getTenant(tenantId, redis)
  const limits = PLAN_LIMITS[tenant.planTier as PlanTier]

  if (metric === 'connectors') {
    const count = await db.select({ id: schema.connectors.id })
      .from(schema.connectors)
      .where(and(
        eq(schema.connectors.tenantId, tenantId),
        eq(schema.connectors.status, 'active'),
      ))
    const current = count.length
    const limit   = limits.maxConnectors
    if (current >= limit) {
      return { allowed: false, reason: `Plan limit: max ${limit} connectors`, current, limit }
    }
    return { allowed: true, current, limit }
  }

  if (metric === 'customRules') {
    const count = await db.select({ id: schema.detectionRules.id })
      .from(schema.detectionRules)
      .where(and(
        eq(schema.detectionRules.tenantId, tenantId),
        eq(schema.detectionRules.enabled, true),
      ))
    const current = count.length
    const limit   = limits.maxCustomRules
    if (current >= limit) {
      return { allowed: false, reason: `Plan limit: max ${limit} custom rules`, current, limit }
    }
    return { allowed: true, current, limit }
  }

  return { allowed: true }
}

export function checkFeatureAccess(
  planTier: PlanTier,
  feature: keyof typeof PLAN_LIMITS['starter'],
): boolean {
  return !!PLAN_LIMITS[planTier][feature]
}

// ─────────────────────────────────────────────
// GET USAGE SUMMARY
// ─────────────────────────────────────────────

export async function getUsageSummary(tenantId: string, redis: Redis) {
  const tenant = await getTenant(tenantId, redis)
  const limits = PLAN_LIMITS[tenant.planTier as PlanTier]

  const db = getDb()

  const [connectorCount, ruleCount] = await Promise.all([
    db.select({ id: schema.connectors.id })
      .from(schema.connectors)
      .where(eq(schema.connectors.tenantId, tenantId)),
    db.select({ id: schema.detectionRules.id })
      .from(schema.detectionRules)
      .where(eq(schema.detectionRules.tenantId, tenantId)),
  ])

  return {
    planTier:       tenant.planTier,
    connectors:     { current: connectorCount.length, limit: limits.maxConnectors },
    customRules:    { current: ruleCount.length,       limit: limits.maxCustomRules },
    retentionDays:  limits.retentionDays,
    features: {
      llmNarratives:  limits.hasLlmNarratives,
      playbooks:      limits.hasPlaybooks,
      ssoIntegration: limits.hasSsoIntegration,
      byok:           limits.hasByok,
      apiAccess:      limits.hasApiAccess,
    },
  }
}

// ─────────────────────────────────────────────
// LIST TENANTS (PLATFORM_ADMIN)
// ─────────────────────────────────────────────

export async function listTenants(
  limit  = 50,
  cursor?: string,
) {
  const db  = getDb()
  const rows = await db.select({
    id:       schema.tenants.id,
    name:     schema.tenants.name,
    slug:     schema.tenants.slug,
    planTier: schema.tenants.planTier,
    status:   schema.tenants.status,
    region:   schema.tenants.region,
    createdAt:schema.tenants.createdAt,
  })
  .from(schema.tenants)
  .where(isNull(schema.tenants.deletedAt))
  .orderBy(schema.tenants.createdAt)
  .limit(limit + 1)

  const hasMore    = rows.length > limit
  const items      = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null

  return { items, nextCursor, hasMore, totalCount: items.length }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

interface AuditInput {
  tenantId: string; actorId?: string; actorIp?: string
  action: string; resourceType: string
  resourceId?: string; changes?: Record<string, unknown>
}

async function writeAuditLog(input: AuditInput) {
  const db = getDb()
  const id = uuidv4()

  const last = await db.select({ hash: schema.auditLogs.hash })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.tenantId, input.tenantId))
    .orderBy(schema.auditLogs.createdAt)
    .limit(1)

  const previousHash = last[0]?.hash ?? null
  const now  = new Date()
  const hash = computeAuditHash(previousHash, id, input.tenantId, input.action, now)

  await db.insert(schema.auditLogs).values({
    id, tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    actorIp: input.actorIp ?? null,
    action:  input.action,
    resourceType: input.resourceType,
    resourceId:   input.resourceId ?? null,
    changes:      input.changes ?? null,
    metadata:     {},
    previousHash, hash, createdAt: now,
  })
}

export class TenantError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'TenantError'
  }
}
