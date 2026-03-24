import Stripe from 'stripe';
import { getPool } from './db.js';
import { getUserById } from './auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

type BillingStatusRow = {
  id: number;
  owner_user_id: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_price_id: string | null;
  subscription_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  last_webhook_event_id: string | null;
  created_at: string;
  updated_at: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateStripeEnvOrThrow() {
  requiredEnv('STRIPE_SECRET_KEY');
  requiredEnv('STRIPE_WEBHOOK_SECRET');
  requiredEnv('STRIPE_PRICE_ID');
  requiredEnv('STRIPE_SUCCESS_URL');
  requiredEnv('STRIPE_CANCEL_URL');
}

export async function createCheckoutSessionForUser(userId: number) {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const pool = getPool();
  const existing = await pool.query<BillingStatusRow>(
    'SELECT * FROM billing_subscriptions WHERE owner_user_id = $1 LIMIT 1',
    [userId]
  );

  let stripeCustomerId = existing.rows[0]?.stripe_customer_id || null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        owner_user_id: String(userId),
      },
    });
    stripeCustomerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [
      {
        price: requiredEnv('STRIPE_PRICE_ID'),
        quantity: 1,
      },
    ],
    success_url: requiredEnv('STRIPE_SUCCESS_URL'),
    cancel_url: requiredEnv('STRIPE_CANCEL_URL'),
    client_reference_id: String(userId),
    metadata: {
      owner_user_id: String(userId),
    },
  });

  await pool.query(
    `INSERT INTO billing_subscriptions (
      owner_user_id,
      stripe_customer_id,
      stripe_checkout_session_id,
      stripe_price_id,
      subscription_status,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (owner_user_id)
    DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
      stripe_price_id = EXCLUDED.stripe_price_id,
      subscription_status = EXCLUDED.subscription_status,
      updated_at = NOW()`,
    [userId, stripeCustomerId, session.id, requiredEnv('STRIPE_PRICE_ID'), 'checkout_created']
  );

  return {
    sessionId: session.id,
    url: session.url,
  };
}

export async function getBillingStatusForUser(userId: number): Promise<BillingStatusRow | null> {
  const pool = getPool();
  const result = await pool.query<BillingStatusRow>(
    'SELECT * FROM billing_subscriptions WHERE owner_user_id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

function unixToDate(value: number | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  return new Date(value * 1000);
}

async function upsertBillingByCustomerId(params: {
  ownerUserId: number | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePriceId: string | null;
  subscriptionStatus: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  eventId: string;
}) {
  const pool = getPool();

  const ownerResult = await pool.query<{ owner_user_id: number }>(
    'SELECT owner_user_id FROM billing_subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
    [params.stripeCustomerId]
  );

  const resolvedOwnerId = params.ownerUserId || ownerResult.rows[0]?.owner_user_id;
  if (!resolvedOwnerId) {
    throw new Error(`No billing owner found for customer ${params.stripeCustomerId}`);
  }

  await pool.query(
    `INSERT INTO billing_subscriptions (
      owner_user_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_checkout_session_id,
      stripe_price_id,
      subscription_status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      last_webhook_event_id,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
    ON CONFLICT (owner_user_id)
    DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, billing_subscriptions.stripe_subscription_id),
      stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, billing_subscriptions.stripe_checkout_session_id),
      stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, billing_subscriptions.stripe_price_id),
      subscription_status = EXCLUDED.subscription_status,
      current_period_start = COALESCE(EXCLUDED.current_period_start, billing_subscriptions.current_period_start),
      current_period_end = COALESCE(EXCLUDED.current_period_end, billing_subscriptions.current_period_end),
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      last_webhook_event_id = EXCLUDED.last_webhook_event_id,
      updated_at = NOW()`,
    [
      resolvedOwnerId,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.stripeCheckoutSessionId,
      params.stripePriceId,
      params.subscriptionStatus,
      params.currentPeriodStart,
      params.currentPeriodEnd,
      params.cancelAtPeriodEnd,
      params.eventId,
    ]
  );
}

export function verifyWebhookSignature(body: string, signature: string): any {
  try {
    return stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error) {
    throw new Error('Invalid webhook signature');
  }
}

async function handleCheckoutCompleted(eventId: string, session: Stripe.Checkout.Session) {
  if (!session.customer || typeof session.customer !== 'string') {
    throw new Error('Missing Stripe customer in checkout session');
  }

  const ownerUserId = session.client_reference_id ? parseInt(session.client_reference_id, 10) : null;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;

  let currentPeriodStart: Date | null = null;
  let currentPeriodEnd: Date | null = null;
  let cancelAtPeriodEnd = false;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    currentPeriodStart = unixToDate(subscription.current_period_start);
    currentPeriodEnd = unixToDate(subscription.current_period_end);
    cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  }

  await upsertBillingByCustomerId({
    ownerUserId,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: session.id,
    stripePriceId: requiredEnv('STRIPE_PRICE_ID'),
    subscriptionStatus: 'active',
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    eventId,
  });
}

async function handleSubscriptionEvent(eventId: string, subscription: Stripe.Subscription) {
  if (!subscription.customer || typeof subscription.customer !== 'string') {
    throw new Error('Missing Stripe customer in subscription event');
  }

  await upsertBillingByCustomerId({
    ownerUserId: null,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    stripeCheckoutSessionId: null,
    stripePriceId: subscription.items.data[0]?.price?.id || null,
    subscriptionStatus: subscription.status,
    currentPeriodStart: unixToDate(subscription.current_period_start),
    currentPeriodEnd: unixToDate(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    eventId,
  });
}

async function handleInvoicePaid(eventId: string, invoice: Stripe.Invoice) {
  if (!invoice.customer || typeof invoice.customer !== 'string') {
    throw new Error('Missing Stripe customer in invoice.paid event');
  }

  await upsertBillingByCustomerId({
    ownerUserId: null,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    stripeCheckoutSessionId: null,
    stripePriceId: invoice.lines.data[0]?.price?.id || null,
    subscriptionStatus: 'active',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    eventId,
  });
}

async function handleInvoiceFailed(eventId: string, invoice: Stripe.Invoice) {
  if (!invoice.customer || typeof invoice.customer !== 'string') {
    throw new Error('Missing Stripe customer in invoice.payment_failed event');
  }

  await upsertBillingByCustomerId({
    ownerUserId: null,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    stripeCheckoutSessionId: null,
    stripePriceId: invoice.lines.data[0]?.price?.id || null,
    subscriptionStatus: 'past_due',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    eventId,
  });
}

export async function processStripeWebhookEvent(event: Stripe.Event) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertEvent = await client.query(
      'INSERT INTO billing_webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
      [event.id, event.type]
    );

    if (insertEvent.rows.length === 0) {
      await client.query('ROLLBACK');
      return { processed: false, duplicate: true };
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.id, event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event.id, event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.id, event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.id, event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }

    return { processed: true, duplicate: false };
  } catch (error) {
    const cleanupClient = await pool.connect();
    try {
      await cleanupClient.query('DELETE FROM billing_webhook_events WHERE event_id = $1', [event.id]);
    } finally {
      cleanupClient.release();
    }
    throw error;
  }
}
