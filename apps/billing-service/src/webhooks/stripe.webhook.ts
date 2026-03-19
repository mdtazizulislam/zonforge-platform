import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type { BillingService } from '../services/billing.service.js'
import type { PlanTier } from '@zonforge/shared-types'

const log = createLogger({ service: 'billing-service:webhook' })

// ─────────────────────────────────────────────
// STRIPE WEBHOOK HANDLER
//
// Processes these events:
//   checkout.session.completed     → activate subscription
//   invoice.payment_succeeded      → mark subscription active
//   invoice.payment_failed         → mark subscription past_due
//   customer.subscription.updated  → sync plan tier
//   customer.subscription.deleted  → downgrade to starter
//
// All events are idempotent (safe to replay).
// ─────────────────────────────────────────────

export async function handleStripeWebhook(
  rawBody:   Buffer | string,
  signature: string,
  billing:   BillingService,
): Promise<{ processed: boolean; event?: string }> {
  const webhookSecret = process.env['ZONFORGE_STRIPE_WEBHOOK_SECRET']

  if (!webhookSecret) {
    log.warn('Stripe webhook secret not configured — skipping signature verification')
    return { processed: false }
  }

  const stripeKey = process.env['ZONFORGE_STRIPE_SECRET_KEY']
  if (!stripeKey) {
    log.warn('Stripe not configured — webhook skipped')
    return { processed: false }
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    log.error({ err }, 'Stripe webhook signature verification failed')
    throw new Error('INVALID_SIGNATURE')
  }

  log.info({ eventType: event.type, eventId: event.id }, 'Processing Stripe webhook')

  try {
    switch (event.type) {

      // ── Checkout completed → activate subscription ──

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const tenantId = session.metadata?.tenantId
        const planTier = session.metadata?.planTier as PlanTier

        if (!tenantId || !planTier) {
          log.warn({ session: session.id }, 'Missing metadata in checkout session')
          break
        }

        await activateSubscription(
          tenantId,
          planTier,
          session.subscription as string,
          session.customer as string,
        )

        log.info({ tenantId, planTier, sessionId: session.id },
          'Checkout completed — subscription activated')
        break
      }

      // ── Payment succeeded → ensure active status ────

      case 'invoice.payment_succeeded': {
        const invoice   = event.data.object as Stripe.Invoice
        const subId     = invoice.subscription as string
        const customerId = invoice.customer as string

        if (!subId) break

        const tenantId = await getTenantByCustomer(customerId)
        if (!tenantId) break

        await updateSubscriptionStatus(tenantId, subId, 'active')
        log.info({ tenantId, invoiceId: invoice.id }, 'Payment succeeded')
        break
      }

      // ── Payment failed → mark past_due ─────────────

      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const tenantId = await getTenantByCustomer(customerId)
        if (!tenantId) break

        await updateSubscriptionStatus(tenantId, invoice.subscription as string, 'past_due')

        log.warn({ tenantId, invoiceId: invoice.id }, 'Payment failed — subscription past due')
        break
      }

      // ── Subscription updated → sync plan tier ───────

      case 'customer.subscription.updated': {
        const sub        = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const tenantId   = await getTenantByCustomer(customerId)
        if (!tenantId) break

        const planTier = sub.metadata?.planTier as PlanTier | undefined
        if (planTier) {
          await billing.changePlan(tenantId, planTier, 'stripe_webhook')
        }

        const status = sub.status === 'active' ? 'active'
          : sub.status === 'trialing' ? 'trialing'
          : sub.status === 'past_due' ? 'past_due'
          : 'cancelled'

        await updateSubscriptionStatus(tenantId, sub.id, status)

        log.info({ tenantId, subId: sub.id, status }, 'Subscription updated')
        break
      }

      // ── Subscription cancelled → downgrade to starter ─

      case 'customer.subscription.deleted': {
        const sub        = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const tenantId   = await getTenantByCustomer(customerId)
        if (!tenantId) break

        // Downgrade to starter (free)
        await billing.changePlan(tenantId, 'starter', 'stripe_webhook')
        await updateSubscriptionStatus(tenantId, sub.id, 'cancelled')

        log.info({ tenantId, subId: sub.id }, 'Subscription cancelled — downgraded to starter')
        break
      }

      // ── Trial ending reminder ────────────────────────

      case 'customer.subscription.trial_will_end': {
        const sub        = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const tenantId   = await getTenantByCustomer(customerId)
        if (!tenantId) break

        const trialEnd = sub.trial_end
          ? new Date(sub.trial_end * 1000)
          : null

        log.info({ tenantId, trialEnd }, 'Trial ending soon — notify tenant')
        // TODO: send email notification via alert-service
        break
      }

      default:
        log.debug({ eventType: event.type }, 'Unhandled Stripe event type')
    }

    return { processed: true, event: event.type }

  } catch (err) {
    log.error({ err, eventType: event.type, eventId: event.id }, 'Webhook handler error')
    throw err
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function activateSubscription(
  tenantId:   string,
  planTier:   PlanTier,
  stripeSubId: string,
  customerId: string,
): Promise<void> {
  const db  = getDb()
  const now = new Date()

  await db.update(schema.subscriptions)
    .set({
      planTier,
      status:              'active',
      stripeSubscriptionId: stripeSubId,
      stripeCustomerId:     customerId,
      updatedAt:           now,
    })
    .where(eq(schema.subscriptions.tenantId, tenantId))

  await db.update(schema.tenants)
    .set({ planTier, status: 'active', updatedAt: now })
    .where(eq(schema.tenants.id, tenantId))
}

async function updateSubscriptionStatus(
  tenantId:   string,
  stripeSubId: string,
  status:     string,
): Promise<void> {
  const db = getDb()
  await db.update(schema.subscriptions)
    .set({ status: status as any, updatedAt: new Date() })
    .where(eq(schema.subscriptions.tenantId, tenantId))
}

async function getTenantByCustomer(customerId: string): Promise<string | null> {
  const db = getDb()
  const rows = await db.select({ tenantId: schema.subscriptions.tenantId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.stripeCustomerId, customerId))
    .limit(1)
  return rows[0]?.tenantId ?? null
}
