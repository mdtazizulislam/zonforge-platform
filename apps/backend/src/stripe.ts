import Stripe from 'stripe';
import { getPool, getPlanByCode, getTenantSubscription, getTenantById } from './db.js';

type LegacySubscriptionStatus = 'active' | 'past_due' | 'canceled'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// ─────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────

export interface TenantBillingStatus {
  tenantId: number;
  tenantName: string;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  limits: {
    maxUsers: number | null;
    maxConnectors: number | null;
    maxEventsPerMonth: number | null;
    retentionDays: number | null;
  } | null;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string | null;
}

export interface CheckoutSessionOptions {
  billingInterval?: 'monthly' | 'annual';
  successUrl?: string;
  cancelUrl?: string;
  actorUserId?: number;
  source?: string;
}

// ─────────────────────────────────────────────
// ENVIRONMENT & VALIDATION
// ─────────────────────────────────────────────

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
  // Plan-specific price IDs optional; can fall back to STRIPE_PRICE_ID_* pattern
}

function getStripePriceIdForPlan(planCode: string, billingInterval: 'monthly' | 'annual' = 'monthly'): string {
  const normalizedPlanCode = planCode.toUpperCase();
  const intervalSpecific = process.env[`STRIPE_PRICE_ID_${normalizedPlanCode}_${billingInterval.toUpperCase()}`];
  const monthlyFallback = billingInterval === 'monthly'
    ? process.env[`STRIPE_PRICE_ID_${normalizedPlanCode}`]
    : '';

  if (intervalSpecific) {
    return intervalSpecific;
  }

  if (monthlyFallback) {
    return monthlyFallback;
  }

  if (billingInterval === 'monthly' && planCode === 'growth') {
    return process.env['STRIPE_PRICE_ID'] || '';
  }

  return '';
}

function withCheckoutSessionId(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    return parsed.toString();
  } catch {
    return url.includes('?')
      ? `${url}&session_id={CHECKOUT_SESSION_ID}`
      : `${url}?session_id={CHECKOUT_SESSION_ID}`;
  }
}

async function writeBillingAuditLog(input: {
  tenantId?: number | null;
  userId?: number | null;
  eventType: string;
  planCode?: string | null;
  billingInterval?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  source?: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO billing_audit_logs (
      tenant_id,
      user_id,
      event_type,
      plan_code,
      billing_interval,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_checkout_session_id,
      source,
      message,
      payload_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.tenantId ?? null,
      input.userId ?? null,
      input.eventType,
      input.planCode ?? null,
      input.billingInterval ?? null,
      input.stripeCustomerId ?? null,
      input.stripeSubscriptionId ?? null,
      input.stripeCheckoutSessionId ?? null,
      input.source ?? 'backend',
      input.message ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
    ],
  );
}

function normalizeLegacySubscriptionStatus(status: string | null | undefined): LegacySubscriptionStatus {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'active' || normalized === 'trialing') {
    return 'active'
  }
  if (normalized === 'past_due' || normalized === 'incomplete' || normalized === 'unpaid') {
    return 'past_due'
  }
  return 'canceled'
}

async function ensureTenantForUser(userId: number, email: string) {
  const pool = getPool()
  const existingTenant = await pool.query('SELECT id FROM tenants WHERE user_id = $1 LIMIT 1', [userId])
  if (existingTenant.rows[0]?.id) {
    return Number(existingTenant.rows[0].id)
  }

  const tenantInsert = await pool.query(
    'INSERT INTO tenants (name, plan, user_id) VALUES ($1, $2, $3) RETURNING id',
    [email.split('@')[0] + '-tenant', 'starter', userId],
  )
  return Number(tenantInsert.rows[0]?.id)
}

async function resolveOrCreateUserFromStripe(params: {
  stripeCustomerId: string | null
  email: string | null
}) {
  const pool = getPool()

  if (params.stripeCustomerId) {
    const byCustomer = await pool.query(
      'SELECT id, email FROM users WHERE stripe_customer_id = $1 LIMIT 1',
      [params.stripeCustomerId],
    )
    if (byCustomer.rows[0]) {
      await ensureTenantForUser(Number(byCustomer.rows[0].id), String(byCustomer.rows[0].email))
      return {
        id: Number(byCustomer.rows[0].id),
        email: String(byCustomer.rows[0].email),
      }
    }
  }

  if (params.email) {
    const byEmail = await pool.query(
      'SELECT id, email FROM users WHERE email = $1 LIMIT 1',
      [params.email],
    )
    if (byEmail.rows[0]) {
      if (params.stripeCustomerId) {
        await pool.query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2 AND (stripe_customer_id IS NULL OR stripe_customer_id = $1)',
          [params.stripeCustomerId, byEmail.rows[0].id],
        )
      }
      await ensureTenantForUser(Number(byEmail.rows[0].id), String(byEmail.rows[0].email))
      return {
        id: Number(byEmail.rows[0].id),
        email: String(byEmail.rows[0].email),
      }
    }
  }

  const resolvedEmail = params.email ?? `${params.stripeCustomerId ?? 'stripe-user'}@stripe-webhook.local`
  const inserted = await pool.query(
    `INSERT INTO users (email, stripe_customer_id, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email`,
    [resolvedEmail, params.stripeCustomerId, 'stripe_webhook_managed_no_login'],
  )

  await ensureTenantForUser(Number(inserted.rows[0].id), String(inserted.rows[0].email))
  return {
    id: Number(inserted.rows[0].id),
    email: String(inserted.rows[0].email),
  }
}

async function syncLegacySubscriptionForUser(params: {
  userId: number
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  planCode: string | null
  subscriptionStatus: string
  currentPeriodEnd: Date | null
}) {
  const pool = getPool()
  const planCode = params.planCode ?? 'starter'
  const status = normalizeLegacySubscriptionStatus(params.subscriptionStatus)

  const existing = params.stripeSubscriptionId
    ? await pool.query(
      'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1 LIMIT 1',
      [params.stripeSubscriptionId],
    )
    : await pool.query(
      'SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1',
      [params.userId],
    )

  if (existing.rows[0]?.id) {
    await pool.query(
      `UPDATE subscriptions
       SET stripe_customer_id = COALESCE($1, stripe_customer_id),
           stripe_subscription_id = COALESCE($2, stripe_subscription_id),
           plan = $3,
           status = $4,
           current_period_end = COALESCE($5, current_period_end),
           updated_at = NOW()
       WHERE id = $6`,
      [
        params.stripeCustomerId,
        params.stripeSubscriptionId,
        planCode,
        status,
        params.currentPeriodEnd,
        existing.rows[0].id,
      ],
    )
    return
  }

  await pool.query(
    `INSERT INTO subscriptions (
       stripe_customer_id,
       stripe_subscription_id,
       plan,
       status,
       current_period_end,
       user_id,
       created_at,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      planCode,
      status,
      params.currentPeriodEnd,
      params.userId,
    ],
  )
}

// ─────────────────────────────────────────────
// CHECKOUT & SUBSCRIPTION MANAGEMENT
// ─────────────────────────────────────────────

export async function createCheckoutSessionForTenant(
  tenantId: number,
  planCode: string,
  options: CheckoutSessionOptions = {},
): Promise<CheckoutSessionResponse> {
  const pool = getPool();
  const billingInterval = options.billingInterval ?? 'monthly';

  // Verify tenant exists
  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // Verify plan exists
  const plan = await getPlanByCode(planCode);
  if (!plan) {
    throw new Error(`Plan not found: ${planCode}`);
  }

  // Get or create Stripe customer
  const existing = await getTenantSubscription(tenantId);
  let stripeCustomerId = existing?.stripe_customer_id || null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: tenant.name,
      metadata: {
        tenantId: String(tenantId),
        tenantName: tenant.name,
      },
    });
    stripeCustomerId = customer.id;
  }

  // Get Stripe price ID for the plan
  const stripePriceId = getStripePriceIdForPlan(planCode, billingInterval);
  if (!stripePriceId) {
    throw new Error(`No Stripe price configured for plan: ${planCode} (${billingInterval})`);
  }

  const successUrl = options.successUrl || process.env.STRIPE_SUCCESS_URL || 'https://zonforge.com/dashboard?payment=success';
  const cancelUrl = options.cancelUrl || process.env.STRIPE_CANCEL_URL || 'https://zonforge.com/pricing?payment=cancelled';

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [
      {
        price: stripePriceId,
        quantity: 1,
      },
    ],
    success_url: withCheckoutSessionId(successUrl),
    cancel_url: cancelUrl,
    client_reference_id: String(tenantId),
    metadata: {
      tenantId: String(tenantId),
      planCode,
      billingInterval,
      userId: String(tenant.user_id),
      environment: process.env.NODE_ENV ?? 'production',
    },
    subscription_data: {
      metadata: {
        tenantId: String(tenantId),
        planCode,
        billingInterval,
        userId: String(tenant.user_id),
      },
    },
  });

  // Record stripe_customer → tenant mapping (idempotent)
  await pool.query(
    `INSERT INTO stripe_customers (tenant_id, user_id, stripe_customer_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (stripe_customer_id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       user_id = EXCLUDED.user_id,
       updated_at = NOW()`,
    [tenantId, tenant.user_id, stripeCustomerId],
  );

  // Upsert tenant subscription record
  await pool.query(
    `INSERT INTO tenant_subscriptions (
      tenant_id,
      plan_id,
      stripe_customer_id,
      stripe_checkout_session_id,
      billing_interval,
      subscription_status,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
      billing_interval = EXCLUDED.billing_interval,
      subscription_status = EXCLUDED.subscription_status,
      updated_at = NOW()`,
    [tenantId, plan.id, stripeCustomerId, session.id, billingInterval, 'checkout_created']
  );

  console.log(JSON.stringify({
    event: 'billing_checkout_created',
    sessionId: session.id,
    tenantId,
    planCode,
    billingInterval,
    environment: process.env.NODE_ENV ?? 'production',
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    tenantId,
    userId: options.actorUserId ?? tenant.user_id,
    eventType: 'billing.checkout_created',
    planCode,
    billingInterval,
    stripeCustomerId,
    stripeCheckoutSessionId: session.id,
    source: options.source ?? 'backend',
    message: `Checkout created for ${planCode} (${billingInterval})`,
    payload: {
      tenantId,
      planCode,
      billingInterval,
      successUrl,
      cancelUrl,
      sessionId: session.id,
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

export async function getTenantBillingStatus(tenantId: number): Promise<TenantBillingStatus | null> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    return null;
  }

  const subscription = await getTenantSubscription(tenantId);

  if (!subscription) {
    return {
      tenantId,
      tenantName: tenant.name,
      planCode: null,
      planName: null,
      subscriptionStatus: 'none',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      limits: null,
    };
  }

  return {
    tenantId,
    tenantName: tenant.name,
    planCode: subscription.plan_code,
    planName: subscription.plan_name,
    subscriptionStatus: subscription.subscription_status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeCustomerId: subscription.stripe_customer_id,
    stripeSubscriptionId: subscription.stripe_subscription_id,
    limits: {
      maxUsers: subscription.max_users,
      maxConnectors: subscription.max_connectors,
      maxEventsPerMonth: subscription.max_events_per_month,
      retentionDays: subscription.retention_days,
    },
  };
}

export async function createBillingPortalSession(tenantId: number): Promise<{ url: string }> {
  const subscription = await getTenantSubscription(tenantId);
  if (!subscription || !subscription.stripe_customer_id) {
    throw new Error('No active Stripe customer for tenant');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: requiredEnv('STRIPE_SUCCESS_URL'),
  });

  return { url: session.url };
}

export async function changeTenantPlan(tenantId: number, newPlanCode: string): Promise<TenantBillingStatus | null> {
  const pool = getPool();

  const subscription = await getTenantSubscription(tenantId);
  if (!subscription || !subscription.stripe_subscription_id) {
    throw new Error('No active subscription for tenant');
  }

  const newPlan = await getPlanByCode(newPlanCode);
  if (!newPlan) {
    throw new Error(`Plan not found: ${newPlanCode}`);
  }

  const stripePriceId = getStripePriceIdForPlan(newPlanCode);
  if (!stripePriceId) {
    throw new Error(`No Stripe price configured for plan: ${newPlanCode}`);
  }

  // Update Stripe subscription
  const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
  
  await stripe.subscriptions.update(subscription.stripe_subscription_id, {
    items: [
      {
        id: stripeSubscription.items.data[0]!.id,
        price: stripePriceId,
      },
    ],
    proration_behavior: 'create_prorations',
  });

  // Update local DB
  await pool.query(
    `UPDATE tenant_subscriptions
     SET plan_id = $1, updated_at = NOW()
     WHERE tenant_id = $2`,
    [newPlan.id, tenantId]
  );

  return getTenantBillingStatus(tenantId);
}

export async function cancelTenantSubscription(tenantId: number): Promise<TenantBillingStatus | null> {
  const pool = getPool();

  const subscription = await getTenantSubscription(tenantId);
  if (!subscription || !subscription.stripe_subscription_id) {
    throw new Error('No active subscription for tenant');
  }

  // Mark for cancellation at period end
  await stripe.subscriptions.update(subscription.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  // Update local DB
  await pool.query(
    `UPDATE tenant_subscriptions
     SET cancel_at_period_end = true, updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId]
  );

  return getTenantBillingStatus(tenantId);
}

// ─────────────────────────────────────────────
// WEBHOOK HANDLING
// ─────────────────────────────────────────────

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

function unixToDate(value: number | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  return new Date(value * 1000);
}

async function upsertTenantSubscriptionFromStripe(params: {
  tenantId: number | null;
  planCode?: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePriceId: string | null;
  subscriptionStatus: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  eventId: string;
  rawEventJson?: Record<string, unknown>;
}) {
  const pool = getPool();

  // Resolve tenant ID from Stripe customer if not provided
  let tenantId = params.tenantId;
  if (!tenantId) {
    const result = await pool.query(
      'SELECT tenant_id FROM tenant_subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
      [params.stripeCustomerId]
    );
    tenantId = result.rows[0]?.tenant_id;
  }

  if (!tenantId) {
    throw new Error(`Cannot resolve tenant for Stripe customer ${params.stripeCustomerId}`);
  }

  let resolvedPlanCode = params.planCode?.toLowerCase() ?? null;
  if (!resolvedPlanCode && params.stripePriceId) {
    const mapping = [
      { code: 'starter', env: process.env['STRIPE_PRICE_ID_STARTER'] },
      { code: 'growth', env: process.env['STRIPE_PRICE_ID_GROWTH'] },
      { code: 'business', env: process.env['STRIPE_PRICE_ID_BUSINESS'] },
      { code: 'enterprise', env: process.env['STRIPE_PRICE_ID_ENTERPRISE'] },
    ].find(x => x.env && x.env === params.stripePriceId)

    if (mapping) {
      resolvedPlanCode = mapping.code
    }
  }

  let planId = null;
  if (resolvedPlanCode) {
    const planByCode = await pool.query('SELECT id FROM plans WHERE code = $1 LIMIT 1', [resolvedPlanCode]);
    planId = planByCode.rows[0]?.id ?? null;
  }

  // Get existing subscription for fallback plan_id
  const existing = await pool.query(
    'SELECT plan_id FROM tenant_subscriptions WHERE tenant_id = $1 LIMIT 1',
    [tenantId]
  );
  const existingPlanId = existing.rows[0]?.plan_id ?? null;
  const finalPlanId = planId ?? existingPlanId;

  if (!finalPlanId) {
    throw new Error(`Unable to resolve plan_id for tenant ${tenantId}`);
  }

  await pool.query(
    `INSERT INTO tenant_subscriptions (
      tenant_id,
      plan_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_checkout_session_id,
      subscription_status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      last_webhook_event_id,
      stripe_price_id,
      raw_latest_event_json,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, tenant_subscriptions.stripe_subscription_id),
      stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, tenant_subscriptions.stripe_checkout_session_id),
      subscription_status = EXCLUDED.subscription_status,
      current_period_start = COALESCE(EXCLUDED.current_period_start, tenant_subscriptions.current_period_start),
      current_period_end = COALESCE(EXCLUDED.current_period_end, tenant_subscriptions.current_period_end),
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      last_webhook_event_id = EXCLUDED.last_webhook_event_id,
      stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, tenant_subscriptions.stripe_price_id),
      raw_latest_event_json = EXCLUDED.raw_latest_event_json,
      updated_at = NOW()`,
    [
      tenantId,
      finalPlanId,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.stripeCheckoutSessionId,
      params.subscriptionStatus,
      params.currentPeriodStart,
      params.currentPeriodEnd,
      params.cancelAtPeriodEnd,
      params.eventId,
      params.stripePriceId,
      params.rawEventJson ? JSON.stringify(params.rawEventJson) : null,
    ]
  );

  // ─── PLAN ACTIVATION LOGIC (09.5) ───
  // Mirror subscription status into tenants.plan for fast plan-based queries
  const upperStatus = params.subscriptionStatus.toUpperCase();
  if ((upperStatus === 'ACTIVE' || upperStatus === 'TRIALING') && resolvedPlanCode) {
    await pool.query('UPDATE tenants SET plan = $1 WHERE id = $2', [resolvedPlanCode, tenantId]);
    console.log(JSON.stringify({
      event: 'plan_activated',
      tenantId,
      planCode: resolvedPlanCode,
      status: params.subscriptionStatus,
      timestamp: Date.now(),
    }));
    await writeBillingAuditLog({
      tenantId,
      eventType: 'billing.plan_activated',
      planCode: resolvedPlanCode,
      stripeCustomerId: params.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      stripeCheckoutSessionId: params.stripeCheckoutSessionId,
      source: 'stripe_webhook',
      message: `Plan activated: ${resolvedPlanCode}`,
      payload: {
        eventId: params.eventId,
        status: params.subscriptionStatus,
      },
    });
  } else if (upperStatus === 'CANCELED') {
    await pool.query('UPDATE tenants SET plan = $1 WHERE id = $2', ['starter', tenantId]);
    console.log(JSON.stringify({
      event: 'plan_downgraded',
      tenantId,
      reason: 'subscription_canceled',
      downgradedTo: 'starter',
      timestamp: Date.now(),
    }));
    await writeBillingAuditLog({
      tenantId,
      eventType: 'billing.plan_downgraded',
      planCode: 'starter',
      stripeCustomerId: params.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      stripeCheckoutSessionId: params.stripeCheckoutSessionId,
      source: 'stripe_webhook',
      message: 'Subscription canceled; tenant downgraded to starter',
      payload: {
        eventId: params.eventId,
        status: params.subscriptionStatus,
      },
    });
  }
  // PAST_DUE: keep existing plan — grace period (no downgrade)
}

async function handleCheckoutCompleted(eventId: string, session: Stripe.Checkout.Session, rawEvent?: Stripe.Event) {
  if (!session.customer || typeof session.customer !== 'string') {
    throw new Error('Missing Stripe customer in checkout session');
  }

  const tenantId = session.client_reference_id ? parseInt(session.client_reference_id, 10) : null;
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

  await upsertTenantSubscriptionFromStripe({
    tenantId,
    planCode: typeof session.metadata?.planCode === 'string' ? session.metadata.planCode : null,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: session.id,
    stripePriceId: session.line_items?.data[0]?.price?.id || null,
    subscriptionStatus: 'ACTIVE',
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    eventId,
    rawEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
  });

  console.log(JSON.stringify({
    event: 'webhook_checkout_completed',
    sessionId: session.id,
    tenantId,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    tenantId,
    eventType: 'billing.checkout_completed',
    planCode: typeof session.metadata?.planCode === 'string' ? session.metadata.planCode : null,
    billingInterval: typeof session.metadata?.billingInterval === 'string' ? session.metadata.billingInterval : null,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: session.id,
    source: 'stripe_webhook',
    message: 'Stripe checkout session completed',
    payload: rawEvent as unknown as Record<string, unknown> | null,
  });

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: session.customer,
    email: typeof session.customer_email === 'string' ? session.customer_email : null,
  })

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    planCode: typeof session.metadata?.planCode === 'string' ? session.metadata.planCode : null,
    subscriptionStatus: 'active',
    currentPeriodEnd,
  })
}

async function handleSubscriptionEvent(eventId: string, subscription: Stripe.Subscription, rawEvent?: Stripe.Event) {
  if (!subscription.customer || typeof subscription.customer !== 'string') {
    throw new Error('Missing Stripe customer in subscription event');
  }

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: subscription.customer,
    email: null,
  })

  let planCode: string | null = null
  const priceId = subscription.items.data[0]?.price?.id ?? null
  if (priceId) {
    const mapping = [
      { code: 'starter', env: process.env['STRIPE_PRICE_ID_STARTER'] },
      { code: 'growth', env: process.env['STRIPE_PRICE_ID_GROWTH'] },
      { code: 'business', env: process.env['STRIPE_PRICE_ID_BUSINESS'] },
      { code: 'enterprise', env: process.env['STRIPE_PRICE_ID_ENTERPRISE'] },
    ].find(x => x.env && x.env === priceId)
    planCode = mapping?.code ?? null
  }

  const subStatus = subscription.status === 'active' ? 'ACTIVE' : subscription.status.toUpperCase();

  await upsertTenantSubscriptionFromStripe({
    tenantId: null,
    planCode: null,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    stripeCheckoutSessionId: null,
    stripePriceId: subscription.items.data[0]?.price?.id || null,
    subscriptionStatus: subStatus,
    currentPeriodStart: unixToDate(subscription.current_period_start),
    currentPeriodEnd: unixToDate(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    eventId,
    rawEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
  });

  console.log(JSON.stringify({
    event: 'webhook_subscription_updated',
    subscriptionId: subscription.id,
    status: subStatus,
    planCode,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    eventType: 'billing.subscription_updated',
    planCode,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    source: 'stripe_webhook',
    message: `Subscription updated: ${subStatus}`,
    payload: rawEvent as unknown as Record<string, unknown> | null,
  });

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    planCode,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: unixToDate(subscription.current_period_end),
  })
}

async function handleInvoicePaid(eventId: string, invoice: Stripe.Invoice, rawEvent?: Stripe.Event) {
  if (!invoice.customer || typeof invoice.customer !== 'string') {
    throw new Error('Missing Stripe customer in invoice.paid event');
  }

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: invoice.customer,
    email: typeof invoice.customer_email === 'string' ? invoice.customer_email : null,
  })

  let planCode: string | null = null
  const priceId = invoice.lines.data[0]?.price?.id ?? null
  if (priceId) {
    const mapping = [
      { code: 'starter', env: process.env['STRIPE_PRICE_ID_STARTER'] },
      { code: 'growth', env: process.env['STRIPE_PRICE_ID_GROWTH'] },
      { code: 'business', env: process.env['STRIPE_PRICE_ID_BUSINESS'] },
      { code: 'enterprise', env: process.env['STRIPE_PRICE_ID_ENTERPRISE'] },
    ].find(x => x.env && x.env === priceId)
    planCode = mapping?.code ?? null
  }

  const currentPeriodEnd = invoice.lines.data[0]?.period?.end
    ? unixToDate(invoice.lines.data[0]?.period?.end)
    : null

  await upsertTenantSubscriptionFromStripe({
    tenantId: null,
    planCode: null,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    stripeCheckoutSessionId: null,
    stripePriceId: invoice.lines.data[0]?.price?.id || null,
    subscriptionStatus: 'ACTIVE',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    eventId,
    rawEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
  });

  console.log(JSON.stringify({
    event: 'webhook_invoice_paid',
    invoiceId: invoice.id,
    planCode,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    eventType: 'billing.invoice_paid',
    planCode,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    source: 'stripe_webhook',
    message: 'Invoice paid',
    payload: rawEvent as unknown as Record<string, unknown> | null,
  });

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    planCode,
    subscriptionStatus: 'active',
    currentPeriodEnd,
  })
}

async function handleInvoiceFailed(eventId: string, invoice: Stripe.Invoice, rawEvent?: Stripe.Event) {
  if (!invoice.customer || typeof invoice.customer !== 'string') {
    throw new Error('Missing Stripe customer in invoice.payment_failed event');
  }

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: invoice.customer,
    email: typeof invoice.customer_email === 'string' ? invoice.customer_email : null,
  })

  let planCode: string | null = null
  const priceId = invoice.lines.data[0]?.price?.id ?? null
  if (priceId) {
    const mapping = [
      { code: 'starter', env: process.env['STRIPE_PRICE_ID_STARTER'] },
      { code: 'growth', env: process.env['STRIPE_PRICE_ID_GROWTH'] },
      { code: 'business', env: process.env['STRIPE_PRICE_ID_BUSINESS'] },
      { code: 'enterprise', env: process.env['STRIPE_PRICE_ID_ENTERPRISE'] },
    ].find(x => x.env && x.env === priceId)
    planCode = mapping?.code ?? null
  }

  await upsertTenantSubscriptionFromStripe({
    tenantId: null,
    planCode: null,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    stripeCheckoutSessionId: null,
    stripePriceId: invoice.lines.data[0]?.price?.id || null,
    subscriptionStatus: 'PAST_DUE',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    eventId,
    rawEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
  });

  console.log(JSON.stringify({
    event: 'webhook_invoice_payment_failed',
    invoiceId: invoice.id,
    planCode,
    gracePeriod: true,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    eventType: 'billing.payment_failed',
    planCode,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    source: 'stripe_webhook',
    message: 'Invoice payment failed',
    payload: rawEvent as unknown as Record<string, unknown> | null,
  });

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    planCode,
    subscriptionStatus: 'past_due',
    currentPeriodEnd: null,
  })
}

export async function processStripeWebhookEvent(event: Stripe.Event) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const insertEvent = await client.query(
      `INSERT INTO billing_webhook_events (event_id, event_type, status, processed_at, payload_json)
       VALUES ($1, $2, 'processed', NOW(), $3)
       ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.id, event.type, JSON.stringify(event)]
    );
    if (insertEvent.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ event: 'webhook_duplicate_ignored', eventId: event.id, type: event.type, timestamp: Date.now() }));
      return { processed: false, duplicate: true };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(JSON.stringify({ event: 'webhook_received', eventId: event.id, type: event.type, timestamp: Date.now() }));

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.id, event.data.object as Stripe.Checkout.Session, event);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(event.id, event.data.object as Stripe.Subscription, event);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.id, event.data.object as Stripe.Invoice, event);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.id, event.data.object as Stripe.Invoice, event);
        break;
      default:
        console.log(JSON.stringify({ event: 'webhook_event_ignored', type: event.type, timestamp: Date.now() }));
        break;
    }

    return { processed: true, duplicate: false };
  } catch (error) {
    const cleanupClient = await pool.connect();
    try {
      await cleanupClient.query(
        `UPDATE billing_webhook_events SET status = 'failed', error_message = $1 WHERE event_id = $2`,
        [(error as Error).message?.slice(0, 500) ?? 'unknown', event.id]
      );
    } finally {
      cleanupClient.release();
    }
    console.error(JSON.stringify({ event: 'webhook_processing_error', eventId: event.id, type: event.type, error: (error as Error).message, timestamp: Date.now() }));
    throw error;
  }
}

// ─────────────────────────────────────────────
// PLAN ENFORCEMENT
// ─────────────────────────────────────────────

export async function getTenantPlanLimits(tenantId: number): Promise<{
  maxUsers: number | null;
  maxConnectors: number | null;
  maxEventsPerMonth: number | null;
  retentionDays: number | null;
}> {
  const subscription = await getTenantSubscription(tenantId);
  
  if (!subscription) {
    return {
      maxUsers: null,
      maxConnectors: null,
      maxEventsPerMonth: null,
      retentionDays: null,
    };
  }

  return {
    maxUsers: subscription.max_users,
    maxConnectors: subscription.max_connectors,
    maxEventsPerMonth: subscription.max_events_per_month,
    retentionDays: subscription.retention_days,
  };
}

export async function assertTenantFeatureAllowed(tenantId: number, featureCode: string): Promise<boolean> {
  // Placeholder for feature-level enforcement
  // Extend this based on features_json in plans table
  return true;
}

export async function assertTenantQuota(tenantId: number, metricCode: string, attemptedValue: number): Promise<boolean> {
  const pool = getPool();
  const limits = await getTenantPlanLimits(tenantId);
  
  const limitMap: { [key: string]: number | null } = {
    max_users: limits.maxUsers,
    max_connectors: limits.maxConnectors,
    max_events_per_month: limits.maxEventsPerMonth,
  };

  const limit = limitMap[metricCode];
  if (limit === null || limit === undefined) {
    return true; // No limit, allow
  }

  // Check current usage
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const usage = await pool.query(
    'SELECT current_value FROM usage_counters WHERE tenant_id = $1 AND metric_code = $2 AND period_start <= $3 AND period_end >= $3',
    [tenantId, metricCode, now]
  );

  const currentUsage = usage.rows[0]?.current_value || 0;
  return currentUsage + attemptedValue <= limit;
}

