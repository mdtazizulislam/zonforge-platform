import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import { BillingService } from '../services/billing.service.js'

const log = createLogger({ service: 'billing-service:usage-worker' })

// ─────────────────────────────────────────────
// USAGE SNAPSHOT WORKER
//
// Runs nightly at 1 AM UTC.
// Takes a snapshot of usage metrics for each
// active tenant and stores in usage_records table.
// Used for billing reconciliation and usage dashboards.
// ─────────────────────────────────────────────

export async function runUsageSnapshot(billing: BillingService): Promise<{
  tenantsProcessed: number
  errors:           number
}> {
  const db   = getDb()
  const now  = new Date()

  // Period: start of current month to now
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd   = now

  // Get all active tenants
  const tenants = await db.select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.status, 'active'))
    .limit(5000)

  log.info({ tenantCount: tenants.length }, 'Starting usage snapshot')

  let processed = 0
  let errors    = 0

  for (const { id: tenantId } of tenants) {
    try {
      const usage = await billing.getCurrentUsage(tenantId)

      await db.insert(schema.usageRecords).values({
        id:               uuidv4(),
        tenantId,
        periodStart,
        periodEnd,
        identityCount:    usage.identitiesMonitor,
        eventCount:       BigInt(usage.eventsThisMonth),
        apiCallCount:     usage.apiCallsThisMonth,
        connectorCount:   usage.connectorsActive,
        storageGb:        usage.storageGb,
        recordedAt:       now,
      })

      processed++
    } catch (err) {
      log.error({ err, tenantId }, 'Usage snapshot failed for tenant')
      errors++
    }
  }

  log.info({ processed, errors }, 'Usage snapshot complete')
  return { tenantsProcessed: processed, errors }
}

// ─────────────────────────────────────────────
// USAGE ALERT WORKER
//
// Checks if any tenant is approaching their plan limits.
// Sends warning notifications at 80% and 100% usage.
// ─────────────────────────────────────────────

export async function checkUsageAlerts(billing: BillingService): Promise<void> {
  const db = getDb()

  const tenants = await db.select({ id: schema.tenants.id, planTier: schema.tenants.planTier })
    .from(schema.tenants)
    .where(eq(schema.tenants.status, 'active'))
    .limit(5000)

  for (const tenant of tenants) {
    try {
      const usage = await billing.getCurrentUsage(tenant.id)

      const warnings: string[] = []

      // Connector limit
      if (usage.usagePct.connectors >= 100) {
        warnings.push(`Connector limit reached (${usage.connectorsActive}/${usage.planLimits.maxConnectors})`)
      } else if (usage.usagePct.connectors >= 80) {
        warnings.push(`Connector usage at ${usage.usagePct.connectors}% of plan limit`)
      }

      // Identity limit
      if (usage.usagePct.identities >= 100) {
        warnings.push(`Identity limit reached (${usage.identitiesMonitor}/${usage.planLimits.maxIdentities})`)
      } else if (usage.usagePct.identities >= 80) {
        warnings.push(`Identity usage at ${usage.usagePct.identities}% of plan limit`)
      }

      if (warnings.length > 0) {
        log.warn({ tenantId: tenant.id, planTier: tenant.planTier, warnings },
          'Tenant approaching plan limits')
        // TODO: send upgrade nudge notification via alert-service
      }

    } catch (err) {
      log.error({ err, tenantId: tenant.id }, 'Usage alert check failed')
    }
  }
}

// ─────────────────────────────────────────────
// TRIAL EXPIRY WORKER
//
// Handles trial expirations:
//   - Sends warning 3 days before trial ends
//   - Downgrades to restricted mode on expiry
// ─────────────────────────────────────────────

export async function checkTrialExpirations(): Promise<void> {
  const db  = getDb()
  const now = new Date()

  // Find subscriptions where trial ends in next 3 days
  const expiringSoon = await db.select({
    tenantId:    schema.subscriptions.tenantId,
    trialEndsAt: schema.subscriptions.trialEndsAt,
  })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'trialing'))
    .limit(500)

  for (const sub of expiringSoon) {
    if (!sub.trialEndsAt) continue

    const daysLeft = Math.floor(
      (sub.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    )

    if (daysLeft <= 0) {
      // Trial expired — enforce limits
      log.info({ tenantId: sub.tenantId }, 'Trial expired — enforcing plan limits')
      await db.update(schema.subscriptions)
        .set({ status: 'active', updatedAt: now })   // active but on starter plan
        .where(eq(schema.subscriptions.tenantId, sub.tenantId))

    } else if (daysLeft <= 3) {
      log.info({ tenantId: sub.tenantId, daysLeft }, 'Trial expiring soon — send warning')
      // TODO: emit notification via alert-service
    }
  }
}
