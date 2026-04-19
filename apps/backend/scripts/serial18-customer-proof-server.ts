import dotenv from 'dotenv'
import Stripe from 'stripe'
import { serve } from '@hono/node-server'

dotenv.config({ path: new URL('../.env', import.meta.url) })

process.env.ZONFORGE_USE_PGMEM = '1'
process.env.ZONFORGE_SKIP_SERVER_START = '1'
process.env.NODE_ENV = process.env.NODE_ENV || 'development'
process.env.PORT = process.env.PORT || '3000'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'serial18_customer_proof_local_secret_that_is_long_enough_for_validation_2026'
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_serial18_customer_proof'
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_serial18_customer_proof'
process.env.STRIPE_PRICE_ID_STARTER = process.env.STRIPE_PRICE_ID_STARTER || 'price_serial18_starter_monthly'
process.env.STRIPE_PRICE_ID_STARTER_MONTHLY = process.env.STRIPE_PRICE_ID_STARTER_MONTHLY || 'price_serial18_starter_monthly'
process.env.STRIPE_PRICE_ID_STARTER_ANNUAL = process.env.STRIPE_PRICE_ID_STARTER_ANNUAL || 'price_serial18_starter_annual'
process.env.STRIPE_PRICE_ID_GROWTH = process.env.STRIPE_PRICE_ID_GROWTH || 'price_serial18_growth_monthly'
process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY || 'price_serial18_growth_monthly'
process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL = process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL || 'price_serial18_growth_annual'
process.env.STRIPE_PRICE_ID_BUSINESS_MONTHLY = process.env.STRIPE_PRICE_ID_BUSINESS_MONTHLY || 'price_serial18_business_monthly'
process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL = process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL || 'price_serial18_business_annual'
process.env.STRIPE_SUCCESS_URL = process.env.STRIPE_SUCCESS_URL || 'http://127.0.0.1:4175/customer-dashboard?payment=success'
process.env.STRIPE_CANCEL_URL = process.env.STRIPE_CANCEL_URL || 'http://127.0.0.1:4175/billing?payment=cancelled'

const proofAppOrigin = process.env.SERIAL18_PROOF_APP_ORIGIN || 'http://127.0.0.1:4175'

const { initDatabase } = await import('../src/db.ts')
const { setStripeClientForTesting } = await import('../src/stripe.ts')
const { default: app } = await import('../src/index.ts')

let customerCounter = 1
let checkoutCounter = 1
let portalCounter = 1
let lastCheckout = null

const stripeVerifier = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
})

setStripeClientForTesting({
  customers: {
    create: async () => ({
      id: `cus_serial18_${customerCounter++}`,
    }),
  },
  checkout: {
    sessions: {
      create: async (input: {
        metadata?: Record<string, string>
      }) => {
        const sessionId = `cs_serial18_${checkoutCounter++}`
        const planCode = String(input.metadata?.planCode ?? 'growth')
        const billingInterval = String(input.metadata?.billingInterval ?? 'monthly')
        const url = `${proofAppOrigin}/billing?mock_checkout=1&session_id=${sessionId}&plan=${planCode}&billingCycle=${billingInterval}`

        lastCheckout = {
          sessionId,
          planCode,
          billingInterval,
          url,
          createdAt: new Date().toISOString(),
        }

        return {
          id: sessionId,
          url,
        }
      },
    },
  },
  billingPortal: {
    sessions: {
      create: async () => ({
        url: `${proofAppOrigin}/billing?mock_portal=1&session=${portalCounter++}`,
      }),
    },
  },
  subscriptions: {
    update: async (subscriptionId: string, update: { cancel_at_period_end?: boolean }) => ({
      id: subscriptionId,
      cancel_at_period_end: Boolean(update.cancel_at_period_end),
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      items: {
        data: [
          {
            price: {
              id: process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY,
              recurring: { interval: 'month' },
            },
          },
        ],
      },
    }),
  },
  webhooks: stripeVerifier.webhooks,
} as unknown)

await initDatabase()

const port = Number(process.env.PORT || '3000')
const server = serve({
  fetch: async (request) => {
    const url = new URL(request.url)
    if (url.pathname === '/proof/last-checkout') {
      return Response.json({ lastCheckout })
    }

    return app.fetch(request)
  },
  port,
})

console.log(`serial-18 customer proof backend listening on http://127.0.0.1:${port}`)

const shutdown = (signal: string) => {
  console.log(`serial-18 customer proof backend stopping (${signal})`)
  server.close()
  process.exit(0)
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))