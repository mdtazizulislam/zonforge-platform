import Stripe from 'stripe'
import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb, schema } from '@zonforge/db-client'
import { computeAuditHash } from '@zonforge/auth-utils'
import { createLogger } from '@zonforge/logger'
import {
  PLAN_PRICING, PLAN_ORDER, isUpgrade, type PlanPrice,
} from '../plans.js'
import type { PlanTier } from '@zonforge/shared-types'

const log = createLogger({ service: 'billing-service' })

// ─────────────────────────────────────────────
// BILLING SERVICE
//
// Manages Stripe subscriptions and plan changes.
// All billing events are written to audit log.
// Plan limits are enforced via tenant.planTier
// which is checked in every protected endpoint.
// ─────────────────────────────────────────────

export class BillingService {
  private readonly stripe: Stripe | null

  constructor() {
    const key = process.env['ZONFORGE_STRIPE_SECRET_KEY']
    this.stripe = key ? new Stripe(key, { apiVersion: '2024-04-10' }) : null

    if (!this.stripe) {
      log.warn('Stripe secret key not configured — billing operates in mock mode')
    }
  }

  // ── Get or create Stripe customer ────────────

  async getOrCreateCustomer(tenantId: string): Promise<string> {
    const db = getDb()

    // Check existing Stripe customer ID
    const subs = await db.select({
      stripeCustomerId: schema.subscriptions.stripeCustomerId,
    })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .limit(1)

    if (subs[0]?.stripeCustomerId) {
      return subs[0].stripeCustomerId
    }

    const tenant = await db.select({
      name: schema.tenants.name,
      slug: schema.tenants.slug,
    })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)

    if (!this.stripe) {
      return `cus_mock_${tenantId.slice(0, 8)}`
    }

    const customer = await this.stripe.customers.create({
      name:     tenant[0]?.name ?? 'Unknown Tenant',
      metadata: { tenantId, slug: tenant[0]?.slug ?? '' },
    })

    // Store customer ID
    await db.update(schema.subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(schema.subscriptions.tenantId, tenantId))

    log.info({ tenantId, customerId: customer.id }, 'Stripe customer created')
    return customer.id
  }

  // ── Create checkout session (hosted page) ────

  async createCheckoutSession(
    tenantId:   string,
    planTier:   PlanTier,
    billingCycle: 'monthly' | 'annual',
    successUrl: string,
    cancelUrl:  string,
  ): Promise<{ url: string; sessionId: string } | null> {
    if (!this.stripe) {
      log.warn('Stripe not configured — returning mock checkout URL')
      return {
        url:       `https://checkout.stripe.com/mock?tenant=${tenantId}&plan=${planTier}`,
        sessionId: `cs_mock_${uuidv4()}`,
      }
    }

    const plan       = PLAN_PRICING[planTier]
    const priceId    = billingCycle === 'monthly'
      ? plan.stripeMonthlyPriceId
      : plan.stripeAnnualPriceId

    if (!priceId) {
      log.error({ planTier, billingCycle }, 'Stripe price ID not configured')
      return null
    }

    const customerId = await this.getOrCreateCustomer(tenantId)

    const session = await this.stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancelUrl,
      metadata:    { tenantId, planTier },
      subscription_data: {
        trial_period_days: plan.trialDays,
        metadata:          { tenantId, planTier },
      },
    })

    log.info({ tenantId, planTier, sessionId: session.id }, 'Checkout session created')
    return { url: session.url!, sessionId: session.id }
  }

  // ── Create portal session (manage billing) ───

  async createPortalSession(
    tenantId:  string,
    returnUrl: string,
  ): Promise<{ url: string } | null> {
    if (!this.stripe) {
      return { url: `${returnUrl}?mock_portal=1` }
    }

    const customerId = await this.getOrCreateCustomer(tenantId)

    const session = await this.stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: returnUrl,
    })

    return { url: session.url }
  }

  // ── Get current subscription ─────────────────

  async getSubscription(tenantId: string) {
    const db = getDb()

    const subs = await db.select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .limit(1)

    return subs[0] ?? null
  }

  // ── Handle plan change (upgrade/downgrade) ───

  async changePlan(
    tenantId:  string,
    newTier:   PlanTier,
    actorId:   string,
    actorIp?:  string,
  ): Promise<void> {
    const db = getDb()

    const tenant = await db.select({
      planTier: schema.tenants.planTier,
    })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)

    const oldTier = (tenant[0]?.planTier ?? 'starter') as PlanTier
    const upgrade = isUpgrade(oldTier, newTier)

    log.info({
      tenantId, oldTier, newTier, upgrade, actorId,
    }, `Plan ${upgrade ? 'upgrade' : 'downgrade'}: ${oldTier} → ${newTier}`)

    // Update tenant plan
    await db.update(schema.tenants)
      .set({
        planTier:  newTier,
        status:    'active',
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenantId))

    // Update subscription record
    await db.update(schema.subscriptions)
      .set({
        planTier:  newTier,
        status:    'active',
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.tenantId, tenantId))

    // Audit log
    await this.writeAuditLog({
      tenantId,
      actorId,
      actorIp,
      action:       'billing.plan_changed',
      resourceType: 'subscription',
      changes:      { from: oldTier, to: newTier, upgrade },
    })

    // Clear tenant plan cache
    const redis = await this.getRedis()
    if (redis) {
      await redis.del(`zf:${tenantId}:plan`)
      await redis.del(`zf:platform:tenant:${tenantId}:settings`)
    }
  }

  // ── Cancel subscription at period end ────────

  async cancelSubscription(
    tenantId: string,
    actorId:  string,
  ): Promise<void> {
    const db = getDb()

    const subs = await db.select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .limit(1)

    const sub = subs[0]
    if (!sub) return

    // Cancel in Stripe
    if (this.stripe && sub.stripeSubscriptionId) {
      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      })
    }

    await db.update(schema.subscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(schema.subscriptions.tenantId, tenantId))

    await this.writeAuditLog({
      tenantId,
      actorId,
      action:       'billing.plan_changed',
      resourceType: 'subscription',
      changes:      { action: 'cancel_at_period_end' },
    })
  }

  // ── Get current usage ─────────────────────────

  async getCurrentUsage(tenantId: string): Promise<{
    eventsThisMonth:   number
    connectorsActive:  number
    identitiesMonitor: number
    apiCallsThisMonth: number
    storageGb:         number
    planLimits: {
      maxConnectors:      number
      maxEventsPerMinute: number
      maxIdentities:      number
      retentionDays:      number
      maxCustomRules:     number
    }
    planTier:     string
    usagePct: {
      connectors:  number
      identities:  number
    }
  }> {
    const db     = getDb()
    const now    = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Count active connectors
    const connCount = await db.select({ id: schema.connectors.id })
      .from(schema.connectors)
      .where(and(
        eq(schema.connectors.tenantId, tenantId),
        eq(schema.connectors.status,   'active'),
      ))

    // Count unique identities in risk scores
    const identityCount = await db.select({ id: schema.riskScores.entityId })
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId,   tenantId),
        eq(schema.riskScores.entityType, 'user'),
      ))

    // Get tenant plan
    const tenant = await db.select({
      planTier: schema.tenants.planTier,
    })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)

    const planTier = (tenant[0]?.planTier ?? 'starter') as PlanTier
    const limits   = PLAN_PRICING[planTier].limits

    const maxConn  = typeof limits.connectors === 'number'  ? limits.connectors  : 999
    const maxIdent = typeof limits.identities === 'number'  ? limits.identities  : 999_999

    const connPct  = maxConn  > 0 ? Math.round((connCount.length   / maxConn)  * 100) : 0
    const identPct = maxIdent > 0 ? Math.round((identityCount.length / maxIdent) * 100) : 0

    return {
      eventsThisMonth:   0,     // ClickHouse query (simplified to 0 for now)
      connectorsActive:  connCount.length,
      identitiesMonitor: identityCount.length,
      apiCallsThisMonth: 0,
      storageGb:         0,
      planLimits: {
        maxConnectors:      maxConn,
        maxEventsPerMinute: typeof limits.eventsPerMin === 'number' ? limits.eventsPerMin : 999_999,
        maxIdentities:      maxIdent,
        retentionDays:      limits.retentionDays,
        maxCustomRules:     typeof limits.customRules === 'number' ? limits.customRules : 999,
      },
      planTier,
      usagePct: {
        connectors:  connPct,
        identities:  identPct,
      },
    }
  }

  // ── Helpers ───────────────────────────────────

  private async getRedis() {
    try {
      const { getRedis } = await import('../../../apps/auth-service/src/redis.js')
      return getRedis()
    } catch {
      return null
    }
  }

  private async writeAuditLog(input: {
    tenantId: string; actorId?: string; actorIp?: string
    action: string; resourceType: string; changes?: Record<string, unknown>
  }): Promise<void> {
    const db  = getDb()
    const id  = uuidv4()
    const now = new Date()

    const last = await db.select({ hash: schema.auditLogs.hash })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, input.tenantId))
      .orderBy(schema.auditLogs.createdAt)
      .limit(1)

    const prevHash = last[0]?.hash ?? null
    const hash     = computeAuditHash(prevHash, id, input.tenantId, input.action, now)

    await db.insert(schema.auditLogs).values({
      id, tenantId: input.tenantId,
      actorId:      input.actorId ?? null,
      actorIp:      input.actorIp ?? null,
      action:       input.action as any,
      resourceType: input.resourceType,
      resourceId:   null,
      changes:      input.changes ?? null,
      metadata:     {},
      previousHash: prevHash,
      hash,
      createdAt:    now,
    })
  }
}
