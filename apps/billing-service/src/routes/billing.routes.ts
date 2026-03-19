import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { BillingService } from '../services/billing.service.js'
import { handleStripeWebhook } from '../webhooks/stripe.webhook.js'
import {
  checkConnectorQuota, checkCustomRuleQuota,
  checkTenantActive, checkFeature,
} from '../services/plan-enforcement.service.js'
import { PLAN_PRICING, PLAN_ORDER } from '../plans.js'
import { createLogger } from '@zonforge/logger'
import type { PlanTier } from '@zonforge/shared-types'
import type { Context } from 'hono'

const log = createLogger({ service: 'billing-service:routes' })

const ChangePlanSchema = z.object({
  planTier:      z.enum(['starter', 'growth', 'business', 'enterprise', 'mssp']),
  billingCycle:  z.enum(['monthly', 'annual']).default('monthly'),
})

export function createBillingRouter(billing: BillingService) {
  const router = new Hono()

  // ── GET /v1/billing/subscription ─────────────
  // Current subscription + renewal info

  router.get('/v1/billing/subscription', async (ctx) => {
    const user = ctx.var.user
    const sub  = await billing.getSubscription(user.tenantId)
    return ctx.json({ success: true, data: sub, meta: meta(ctx) })
  })

  // ── GET /v1/billing/usage ─────────────────────
  // Current usage vs plan limits

  router.get('/v1/billing/usage', async (ctx) => {
    const user  = ctx.var.user
    const usage = await billing.getCurrentUsage(user.tenantId)
    return ctx.json({ success: true, data: usage, meta: meta(ctx) })
  })

  // ── GET /v1/billing/plans ─────────────────────
  // Public plan listing (no auth required)

  router.get('/v1/billing/plans', (ctx) => {
    const plans = PLAN_ORDER.map(tier => {
      const p = PLAN_PRICING[tier]
      return {
        tier:              p.tier,
        displayName:       p.displayName,
        description:       p.description,
        monthlyPriceCents: p.monthlyPriceCents,
        annualPriceCents:  p.annualPriceCents,
        currency:          p.currency,
        trialDays:         p.trialDays,
        highlighted:       p.highlighted,
        limits:            p.limits,
        features:          p.features,
      }
    })
    return ctx.json({ success: true, data: plans })
  })

  // ── POST /v1/billing/checkout ──────────────────
  // Create Stripe checkout session

  router.post(
    '/v1/billing/checkout',
    zValidator('json', ChangePlanSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { planTier, billingCycle } = ctx.req.valid('json')

      const baseUrl   = process.env['ZONFORGE_API_URL'] ?? 'https://app.zonforge.com'
      const successUrl = `${baseUrl}/settings?billing=success`
      const cancelUrl  = `${baseUrl}/settings?billing=cancelled`

      const session = await billing.createCheckoutSession(
        user.tenantId,
        planTier as PlanTier,
        billingCycle,
        successUrl,
        cancelUrl,
      )

      if (!session) {
        return ctx.json({ success: false,
          error: { code: 'BILLING_ERROR', message: 'Could not create checkout session' } }, 500)
      }

      return ctx.json({ success: true, data: session, meta: meta(ctx) })
    }
  )

  // ── POST /v1/billing/portal ────────────────────
  // Stripe billing portal (manage plan, payment method)

  router.post('/v1/billing/portal', async (ctx) => {
    const user    = ctx.var.user
    const baseUrl = process.env['ZONFORGE_API_URL'] ?? 'https://app.zonforge.com'

    const session = await billing.createPortalSession(
      user.tenantId,
      `${baseUrl}/settings`,
    )

    if (!session) {
      return ctx.json({ success: false,
        error: { code: 'BILLING_ERROR', message: 'Could not create portal session' } }, 500)
    }

    return ctx.json({ success: true, data: session, meta: meta(ctx) })
  })

  // ── POST /v1/billing/cancel ────────────────────

  router.post('/v1/billing/cancel', async (ctx) => {
    const user = ctx.var.user

    // Only TENANT_ADMIN can cancel
    if (!['TENANT_ADMIN', 'PLATFORM_ADMIN'].includes(user.role)) {
      return ctx.json({ success: false,
        error: { code: 'FORBIDDEN', message: 'Only tenant admins can cancel subscriptions' } }, 403)
    }

    await billing.cancelSubscription(user.tenantId, user.id)
    return ctx.json({ success: true,
      data: { message: 'Subscription will be cancelled at end of billing period' },
      meta: meta(ctx) })
  })

  // ── POST /internal/billing/enforce/connector ───
  // Internal quota check (called by ingestion-service before creating connector)

  router.post('/internal/billing/enforce/connector', async (ctx) => {
    const { tenantId } = await ctx.req.json() as { tenantId: string }
    const result = await checkConnectorQuota(tenantId)
    return ctx.json({ success: true, data: result })
  })

  // ── POST /internal/billing/enforce/rule ────────

  router.post('/internal/billing/enforce/rule', async (ctx) => {
    const { tenantId } = await ctx.req.json() as { tenantId: string }
    const result = await checkCustomRuleQuota(tenantId)
    return ctx.json({ success: true, data: result })
  })

  // ── POST /internal/billing/enforce/feature ─────

  router.post('/internal/billing/enforce/feature', async (ctx) => {
    const { tenantId, feature } = await ctx.req.json() as {
      tenantId: string
      feature: 'hasLlmNarratives' | 'hasPlaybooks' | 'hasSsoIntegration' | 'hasByok' | 'hasApiAccess'
    }
    const result = await checkFeature(tenantId, feature)
    return ctx.json({ success: true, data: result })
  })

  // ── POST /internal/webhooks/stripe ─────────────
  // Raw Stripe webhook — no auth, verified by signature

  router.post('/internal/webhooks/stripe', async (ctx) => {
    const rawBody  = await ctx.req.arrayBuffer()
    const sig      = ctx.req.header('stripe-signature') ?? ''

    try {
      const result = await handleStripeWebhook(
        Buffer.from(rawBody),
        sig,
        billing,
      )
      return ctx.json({ received: true, processed: result.processed })
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_SIGNATURE') {
        return ctx.json({ error: 'Invalid signature' }, 400)
      }
      log.error({ err }, 'Stripe webhook processing failed')
      return ctx.json({ error: 'Webhook error' }, 500)
    }
  })

  return router
}

function meta(ctx: Context) {
  return { requestId: ctx.var.requestId ?? 'unknown', timestamp: new Date() }
}
