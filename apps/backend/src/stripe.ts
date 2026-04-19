import Stripe from 'stripe';
import { getPool, getPlanByCode, getTenantSubscription, getTenantById } from './db.js';
import { sendProductEmail } from './email.js';
import { trackConversionEvent } from './growth.js';
import {
  assignTenantPlan,
  cancelTenantPlan as cancelTenantPlanState,
  getTenantPlanState,
  normalizePlanCode,
  type LockedPlanCode,
} from './billing/tenantPlans.js';

type LegacySubscriptionStatus = 'active' | 'past_due' | 'canceled';
type BillingInterval = 'monthly' | 'annual';

let stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

function getStripeClient(): Stripe {
  return stripeClient;
}

export function setStripeClientForTesting(client: unknown | null) {
  stripeClient = (client ?? new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
  })) as Stripe;
}

// ─────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────

export interface TenantBillingStatus {
  tenantId: number;
  tenantName: string;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string;
  billingInterval: BillingInterval | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId?: string | null;
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

function normalizeBillingInterval(value: string | null | undefined): BillingInterval {
  return value === 'annual' ? 'annual' : 'monthly';
}

function normalizeStripeSubscriptionStatus(status: string | null | undefined): string {
  return String(status ?? 'unknown').trim().toLowerCase();
}

function isPaidActivationStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStripeSubscriptionStatus(status);
  return normalized === 'active' || normalized === 'trialing';
}

async function getStripePriceIdForPlan(planCode: string, billingInterval: BillingInterval = 'monthly'): Promise<string> {
  const normalizedPlanCode = normalizePlanCode(planCode);
  const plan = await getPlanByCode(normalizedPlanCode);
  const dbSpecific = billingInterval === 'annual'
    ? plan?.stripe_annual_price_id
    : plan?.stripe_monthly_price_id;
  const envSpecific = process.env[`STRIPE_PRICE_ID_${normalizedPlanCode.toUpperCase()}_${billingInterval.toUpperCase()}`];
  const monthlyFallback = billingInterval === 'monthly'
    ? process.env[`STRIPE_PRICE_ID_${normalizedPlanCode.toUpperCase()}`]
    : '';

  if (dbSpecific) {
    return String(dbSpecific);
  }

  if (envSpecific) {
    return envSpecific;
  }

  if (monthlyFallback) {
    return monthlyFallback;
  }

  if (billingInterval === 'monthly' && normalizedPlanCode === 'growth') {
    return process.env['STRIPE_PRICE_ID'] || '';
  }

  return '';
}

async function resolvePlanCodeFromPriceId(priceId: string | null | undefined): Promise<LockedPlanCode | null> {
  if (!priceId) {
    return null;
  }

  const pool = getPool();
  const result = await pool.query(
    `SELECT code
     FROM plans
     WHERE stripe_monthly_price_id = $1 OR stripe_annual_price_id = $1
     LIMIT 1`,
    [priceId],
  );

  const code = result.rows[0]?.code;
  return code ? normalizePlanCode(String(code)) : null;
}

function withCheckoutSessionId(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('session_id')) {
      return url;
    }

    const query = parsed.search ? `${parsed.search}&session_id={CHECKOUT_SESSION_ID}` : '?session_id={CHECKOUT_SESSION_ID}';
    return `${parsed.origin}${parsed.pathname}${query}${parsed.hash}`;
  } catch {
    if (url.includes('session_id=')) {
      return url;
    }

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

function unixToDate(value: number | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  return new Date(value * 1000);
}

function readPeriodStart(subscription: Stripe.Subscription | null): Date | null {
  const raw = (subscription as Stripe.Subscription & { current_period_start?: number }).current_period_start;
  return unixToDate(raw ?? null);
}

function readPeriodEnd(subscription: Stripe.Subscription | null): Date | null {
  const raw = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  return unixToDate(raw ?? null);
}

function readPriceIdFromSubscription(subscription: Stripe.Subscription | null): string | null {
  return subscription?.items.data[0]?.price?.id ?? null;
}

function readIntervalFromSubscription(subscription: Stripe.Subscription | null): BillingInterval | null {
  const interval = subscription?.items.data[0]?.price?.recurring?.interval;
  if (interval === 'year') {
    return 'annual';
  }

  if (interval === 'month') {
    return 'monthly';
  }

  return null;
}

async function getTenantOwnerUserId(tenantId: number): Promise<number> {
  const tenant = await getTenantById(tenantId);
  if (!tenant?.user_id) {
    throw new Error(`Tenant ${tenantId} owner user is missing`);
  }

  return Number(tenant.user_id);
}

async function getUserEmail(userId: number): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [userId]);
  return result.rows[0]?.email ? String(result.rows[0].email) : null;
}

async function resolveTenantIdFromStripeCustomer(stripeCustomerId: string): Promise<number | null> {
  const pool = getPool();

  const customerMapping = await pool.query(
    `SELECT tenant_id
     FROM stripe_customers
     WHERE stripe_customer_id = $1
     LIMIT 1`,
    [stripeCustomerId],
  );
  if (customerMapping.rows[0]?.tenant_id) {
    return Number(customerMapping.rows[0].tenant_id);
  }

  const subscriptionMapping = await pool.query(
    `SELECT tenant_id
     FROM tenant_subscriptions
     WHERE stripe_customer_id = $1
     LIMIT 1`,
    [stripeCustomerId],
  );

  return subscriptionMapping.rows[0]?.tenant_id ? Number(subscriptionMapping.rows[0].tenant_id) : null;
}

async function upsertStripeCustomerMapping(params: {
  tenantId: number;
  userId: number;
  stripeCustomerId: string;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO stripe_customers (tenant_id, user_id, stripe_customer_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (stripe_customer_id)
     DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       user_id = EXCLUDED.user_id,
       updated_at = NOW()`,
    [params.tenantId, params.userId, params.stripeCustomerId],
  );
}

async function getActivePlanIdForTenant(tenantId: number): Promise<number> {
  const state = await getTenantPlanState(tenantId);
  return Number(state.plan.id);
}

async function upsertInvoiceRecord(params: {
  tenantId: number | null;
  invoice: Stripe.Invoice;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: string;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO invoices (
      tenant_id,
      stripe_invoice_id,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      amount_due_cents,
      amount_paid_cents,
      currency,
      billing_reason,
      invoice_pdf_url,
      paid_at,
      due_at,
      payload_json,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    ON CONFLICT (stripe_invoice_id)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      status = EXCLUDED.status,
      amount_due_cents = EXCLUDED.amount_due_cents,
      amount_paid_cents = EXCLUDED.amount_paid_cents,
      currency = EXCLUDED.currency,
      billing_reason = EXCLUDED.billing_reason,
      invoice_pdf_url = EXCLUDED.invoice_pdf_url,
      paid_at = EXCLUDED.paid_at,
      due_at = EXCLUDED.due_at,
      payload_json = EXCLUDED.payload_json,
      updated_at = NOW()`,
    [
      params.tenantId,
      params.invoice.id,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.status,
      params.invoice.amount_due ?? null,
      params.invoice.amount_paid ?? null,
      params.invoice.currency ?? null,
      params.invoice.billing_reason ?? null,
      params.invoice.invoice_pdf ?? null,
      params.invoice.status_transitions?.paid_at ? unixToDate(params.invoice.status_transitions.paid_at) : null,
      params.invoice.due_date ? unixToDate(params.invoice.due_date) : null,
      JSON.stringify(params.invoice),
    ],
  );
}

async function upsertTenantSubscriptionRecord(params: {
  tenantId: number;
  activePlanCode?: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePriceId: string | null;
  billingInterval?: BillingInterval | null;
  subscriptionStatus: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastWebhookEventId?: string | null;
  lastInvoiceId?: string | null;
  rawLatestEventJson?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  const activePlanId = params.activePlanCode
    ? Number((await getPlanByCode(normalizePlanCode(params.activePlanCode)))?.id ?? 0)
    : await getActivePlanIdForTenant(params.tenantId);

  if (!activePlanId) {
    throw new Error(`Unable to resolve active plan for tenant ${params.tenantId}`);
  }

  await pool.query(
    `INSERT INTO tenant_subscriptions (
      tenant_id,
      plan_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_checkout_session_id,
      billing_interval,
      subscription_status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      last_webhook_event_id,
      last_invoice_id,
      stripe_price_id,
      raw_latest_event_json,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, tenant_subscriptions.stripe_subscription_id),
      stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, tenant_subscriptions.stripe_checkout_session_id),
      billing_interval = COALESCE(EXCLUDED.billing_interval, tenant_subscriptions.billing_interval),
      subscription_status = EXCLUDED.subscription_status,
      current_period_start = COALESCE(EXCLUDED.current_period_start, tenant_subscriptions.current_period_start),
      current_period_end = COALESCE(EXCLUDED.current_period_end, tenant_subscriptions.current_period_end),
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      last_webhook_event_id = COALESCE(EXCLUDED.last_webhook_event_id, tenant_subscriptions.last_webhook_event_id),
      last_invoice_id = COALESCE(EXCLUDED.last_invoice_id, tenant_subscriptions.last_invoice_id),
      stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, tenant_subscriptions.stripe_price_id),
      raw_latest_event_json = COALESCE(EXCLUDED.raw_latest_event_json, tenant_subscriptions.raw_latest_event_json),
      updated_at = NOW()`,
    [
      params.tenantId,
      activePlanId,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.stripeCheckoutSessionId,
      params.billingInterval,
      params.subscriptionStatus,
      params.currentPeriodStart,
      params.currentPeriodEnd,
      params.cancelAtPeriodEnd,
      params.lastWebhookEventId ?? null,
      params.lastInvoiceId ?? null,
      params.stripePriceId,
      params.rawLatestEventJson ? JSON.stringify(params.rawLatestEventJson) : null,
    ],
  );
}

function normalizeLegacySubscriptionStatus(status: string | null | undefined): LegacySubscriptionStatus {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'active' || normalized === 'trialing') {
    return 'active';
  }
  if (normalized === 'past_due' || normalized === 'incomplete' || normalized === 'unpaid') {
    return 'past_due';
  }
  return 'canceled';
}

async function ensureTenantForUser(userId: number, email: string) {
  const pool = getPool();
  const existingTenant = await pool.query('SELECT id FROM tenants WHERE user_id = $1 LIMIT 1', [userId]);
  if (existingTenant.rows[0]?.id) {
    return Number(existingTenant.rows[0].id);
  }

  const tenantInsert = await pool.query(
    'INSERT INTO tenants (name, plan, user_id) VALUES ($1, $2, $3) RETURNING id',
    [email.split('@')[0] + '-tenant', 'starter', userId],
  );
  return Number(tenantInsert.rows[0]?.id);
}

async function resolveOrCreateUserFromStripe(params: {
  stripeCustomerId: string | null
  email: string | null
}) {
  const pool = getPool();

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
      };
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
      await ensureTenantForUser(Number(byEmail.rows[0].id), String(byEmail.rows[0].email));
      return {
        id: Number(byEmail.rows[0].id),
        email: String(byEmail.rows[0].email),
      };
    }
  }

  const resolvedEmail = params.email ?? `${params.stripeCustomerId ?? 'stripe-user'}@stripe-webhook.local`;
  const inserted = await pool.query(
    `INSERT INTO users (email, stripe_customer_id, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email`,
    [resolvedEmail, params.stripeCustomerId, 'stripe_webhook_managed_no_login'],
  );

  await ensureTenantForUser(Number(inserted.rows[0].id), String(inserted.rows[0].email));
  return {
    id: Number(inserted.rows[0].id),
    email: String(inserted.rows[0].email),
  };
}

async function syncLegacySubscriptionForUser(params: {
  userId: number
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  planCode: string | null
  subscriptionStatus: string
  currentPeriodEnd: Date | null
}) {
  const pool = getPool();
  const planCode = params.planCode ?? 'starter';
  const status = normalizeLegacySubscriptionStatus(params.subscriptionStatus);

  const existing = params.stripeSubscriptionId
    ? await pool.query(
      'SELECT id FROM subscriptions WHERE stripe_subscription_id = $1 LIMIT 1',
      [params.stripeSubscriptionId],
    )
    : await pool.query(
      'SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1',
      [params.userId],
    );

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
    return;
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
  );
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
  const billingInterval = normalizeBillingInterval(options.billingInterval ?? 'monthly');
  const nextPlanCode = normalizePlanCode(planCode);

  // Verify tenant exists
  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // Verify plan exists
  const plan = await getPlanByCode(nextPlanCode);
  if (!plan) {
    throw new Error(`Plan not found: ${nextPlanCode}`);
  }

  if (nextPlanCode === 'free') {
    throw new Error('Free plan does not require checkout');
  }

  if (nextPlanCode === 'enterprise') {
    throw new Error('Enterprise plan requires sales assistance');
  }

  const currentState = await getTenantPlanState(tenantId);
  const tenantOwnerUserId = Number(tenant.user_id);

  // Get or create Stripe customer
  const existing = await getTenantSubscription(tenantId);
  let stripeCustomerId = existing?.stripe_customer_id || null;

  if (!stripeCustomerId) {
    const ownerEmail = await getUserEmail(tenantOwnerUserId);
    const customer = await getStripeClient().customers.create({
      name: tenant.name,
      email: ownerEmail ?? undefined,
      metadata: {
        tenantId: String(tenantId),
        tenantName: tenant.name,
        ownerUserId: String(tenantOwnerUserId),
      },
    });
    stripeCustomerId = customer.id;
  }

  await upsertStripeCustomerMapping({
    tenantId,
    userId: tenantOwnerUserId,
    stripeCustomerId,
  });

  // Get Stripe price ID for the plan
  const stripePriceId = await getStripePriceIdForPlan(nextPlanCode, billingInterval);
  if (!stripePriceId) {
    throw new Error(`No Stripe price configured for plan: ${nextPlanCode} (${billingInterval})`);
  }

  const successUrl = options.successUrl || process.env.STRIPE_SUCCESS_URL || 'https://zonforge.com/dashboard?payment=success';
  const cancelUrl = options.cancelUrl || process.env.STRIPE_CANCEL_URL || 'https://zonforge.com/pricing?payment=cancelled';

  // Create checkout session
  const session = await getStripeClient().checkout.sessions.create({
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
      planCode: nextPlanCode,
      billingInterval,
      userId: String(tenantOwnerUserId),
      currentPlanCode: currentState.plan.code,
      environment: process.env.NODE_ENV ?? 'production',
    },
    subscription_data: {
      metadata: {
        tenantId: String(tenantId),
        planCode: nextPlanCode,
        billingInterval,
        userId: String(tenantOwnerUserId),
      },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  });

  // Upsert tenant subscription record
  await upsertTenantSubscriptionRecord({
    tenantId,
    activePlanCode: currentState.plan.code,
    stripeCustomerId,
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: session.id,
    stripePriceId,
    billingInterval,
    subscriptionStatus: 'checkout_created',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    rawLatestEventJson: {
      source: 'checkout_created',
      pendingPlanCode: nextPlanCode,
      pendingBillingInterval: billingInterval,
      sessionId: session.id,
    },
  });

  await pool.query(
    `UPDATE users
     SET stripe_customer_id = COALESCE(stripe_customer_id, $1),
         updated_at = NOW()
     WHERE id = $2`,
    [stripeCustomerId, tenantOwnerUserId],
  );

  console.log(JSON.stringify({
    event: 'billing_checkout_created',
    sessionId: session.id,
    tenantId,
    planCode: nextPlanCode,
    billingInterval,
    environment: process.env.NODE_ENV ?? 'production',
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    tenantId,
    userId: options.actorUserId ?? tenantOwnerUserId,
    eventType: 'billing.checkout_created',
    planCode: nextPlanCode,
    billingInterval,
    stripeCustomerId,
    stripeCheckoutSessionId: session.id,
    source: options.source ?? 'backend',
    message: `Checkout created for ${nextPlanCode} (${billingInterval})`,
    payload: {
      tenantId,
      planCode: nextPlanCode,
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

  const state = await getTenantPlanState(tenantId);
  const subscription = await getTenantSubscription(tenantId);

  if (!subscription) {
    return {
      tenantId,
      tenantName: tenant.name,
      planCode: state.plan.code,
      planName: state.plan.name,
      subscriptionStatus: state.status,
      billingInterval: null,
      currentPeriodStart: state.startedAt,
      currentPeriodEnd: state.expiresAt,
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeCheckoutSessionId: null,
      limits: null,
    };
  }

  return {
    tenantId,
    tenantName: tenant.name,
    planCode: state.plan.code,
    planName: state.plan.name,
    subscriptionStatus: subscription.subscription_status,
    billingInterval: normalizeBillingInterval(subscription.billing_interval),
    currentPeriodStart: subscription.current_period_start ?? state.startedAt,
    currentPeriodEnd: subscription.current_period_end ?? state.expiresAt,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeCustomerId: subscription.stripe_customer_id,
    stripeSubscriptionId: subscription.stripe_subscription_id,
    stripeCheckoutSessionId: subscription.stripe_checkout_session_id,
    limits: {
      maxUsers: subscription.max_users ?? null,
      maxConnectors: state.limits.max_connectors,
      maxEventsPerMonth: subscription.max_events_per_month ?? null,
      retentionDays: state.limits.retention_days,
    },
  };
}

export async function createBillingPortalSession(tenantId: number): Promise<{ url: string }> {
  const subscription = await getTenantSubscription(tenantId);
  if (!subscription || !subscription.stripe_customer_id) {
    throw new Error('No active Stripe customer for tenant');
  }

  const session = await getStripeClient().billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: process.env.STRIPE_SUCCESS_URL || 'https://app.zonforge.com/billing',
  });

  return { url: session.url };
}

export async function changeTenantPlan(tenantId: number, newPlanCode: string): Promise<TenantBillingStatus | null> {
  void tenantId;
  void newPlanCode;
  throw new Error('Direct plan changes are disabled. Use checkout and wait for Stripe webhook confirmation.');
}

export async function cancelTenantSubscription(tenantId: number): Promise<TenantBillingStatus | null> {
  const pool = getPool();

  const subscription = await getTenantSubscription(tenantId);
  if (!subscription || !subscription.stripe_subscription_id) {
    throw new Error('No active subscription for tenant');
  }

  // Mark for cancellation at period end
  await getStripeClient().subscriptions.update(subscription.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  // Update local DB
  await pool.query(
    `UPDATE tenant_subscriptions
     SET cancel_at_period_end = true,
         subscription_status = CASE
           WHEN LOWER(COALESCE(subscription_status, '')) IN ('active', 'trialing') THEN subscription_status
           ELSE 'cancel_scheduled'
         END,
         updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const actorUserId = await getTenantOwnerUserId(tenantId);
  await writeBillingAuditLog({
    tenantId,
    userId: actorUserId,
    eventType: 'billing.cancel_requested',
    planCode: (await getTenantPlanState(tenantId)).plan.code,
    stripeCustomerId: subscription.stripe_customer_id,
    stripeSubscriptionId: subscription.stripe_subscription_id,
    source: 'billing_api',
    message: 'Subscription set to cancel at period end',
    payload: {
      cancelAtPeriodEnd: true,
    },
  });

  return getTenantBillingStatus(tenantId);
}

// ─────────────────────────────────────────────
// WEBHOOK HANDLING
// ─────────────────────────────────────────────

export function verifyWebhookSignature(body: string, signature: string): any {
  try {
    return getStripeClient().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (error) {
    throw new Error('Invalid webhook signature');
  }
}
async function handleCheckoutCompleted(eventId: string, session: Stripe.Checkout.Session, rawEvent?: Stripe.Event) {
  if (!session.customer || typeof session.customer !== 'string') {
    throw new Error('Missing Stripe customer in checkout session');
  }

  const tenantId = session.client_reference_id
    ? parseInt(session.client_reference_id, 10)
    : session.metadata?.tenantId
      ? parseInt(session.metadata.tenantId, 10)
      : null;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
  const activeTenantId = tenantId ?? await resolveTenantIdFromStripeCustomer(session.customer);
  if (!activeTenantId) {
    throw new Error(`Cannot resolve tenant for checkout customer ${session.customer}`);
  }

  const ownerUserId = await getTenantOwnerUserId(activeTenantId);
  const currentState = await getTenantPlanState(activeTenantId);

  let subscription: Stripe.Subscription | null = null;
  if (subscriptionId) {
    subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
  }

  const stripePriceId = readPriceIdFromSubscription(subscription);
  const billingInterval = normalizeBillingInterval(
    typeof session.metadata?.billingInterval === 'string'
      ? session.metadata.billingInterval
      : readIntervalFromSubscription(subscription) ?? 'monthly',
  );

  await upsertStripeCustomerMapping({
    tenantId: activeTenantId,
    userId: ownerUserId,
    stripeCustomerId: session.customer,
  });

  await upsertTenantSubscriptionRecord({
    tenantId: activeTenantId,
    activePlanCode: currentState.plan.code,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: session.id,
    stripePriceId,
    billingInterval,
    subscriptionStatus: subscription ? normalizeStripeSubscriptionStatus(subscription.status) : 'checkout_completed',
    currentPeriodStart: readPeriodStart(subscription),
    currentPeriodEnd: readPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    lastWebhookEventId: eventId,
    rawLatestEventJson: {
      eventType: rawEvent?.type ?? 'checkout.session.completed',
      pendingPlanCode: typeof session.metadata?.planCode === 'string' ? session.metadata.planCode : null,
      pendingBillingInterval: billingInterval,
    },
  });

  console.log(JSON.stringify({
    event: 'webhook_checkout_completed',
    sessionId: session.id,
    tenantId: activeTenantId,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    tenantId: activeTenantId,
    eventType: 'billing.checkout_completed',
    planCode: typeof session.metadata?.planCode === 'string' ? session.metadata.planCode : null,
    billingInterval,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: session.id,
    source: 'stripe_webhook',
    message: 'Stripe checkout session completed; awaiting payment confirmation',
    payload: {
      eventId,
      status: subscription ? normalizeStripeSubscriptionStatus(subscription.status) : 'checkout_completed',
    },
  });

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: session.customer,
    email: typeof session.customer_email === 'string' ? session.customer_email : null,
  });

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscriptionId,
    planCode: currentState.plan.code,
    subscriptionStatus: subscription ? normalizeStripeSubscriptionStatus(subscription.status) : 'incomplete',
    currentPeriodEnd: readPeriodEnd(subscription),
  });

  if (typeof session.customer_email === 'string' && session.customer_email) {
    await sendProductEmail({
      toEmail: session.customer_email,
      emailType: 'payment_success',
      subject: 'Stripe checkout completed - payment confirmation pending',
      payload: {
        planCode: typeof session.metadata?.planCode === 'string' ? session.metadata.planCode : null,
        billingInterval,
        sessionId: session.id,
      },
    });
  }

  await trackConversionEvent({
    eventName: 'checkout_completed',
    userId: user.id,
    tenantId: activeTenantId,
    sessionId: session.id,
    source: 'stripe_webhook',
    metadata: {
      planCode: typeof session.metadata?.planCode === 'string' ? session.metadata.planCode : null,
      billingInterval,
    },
  });
}

async function handleSubscriptionEvent(eventId: string, subscription: Stripe.Subscription, rawEvent?: Stripe.Event) {
  if (!subscription.customer || typeof subscription.customer !== 'string') {
    throw new Error('Missing Stripe customer in subscription event');
  }

  const tenantId = subscription.metadata?.tenantId
    ? parseInt(subscription.metadata.tenantId, 10)
    : await resolveTenantIdFromStripeCustomer(subscription.customer);
  if (!tenantId) {
    throw new Error(`Cannot resolve tenant for Stripe customer ${subscription.customer}`);
  }

  const ownerUserId = await getTenantOwnerUserId(tenantId);
  const activeState = await getTenantPlanState(tenantId);
  const priceId = readPriceIdFromSubscription(subscription);
  const planCode = normalizePlanCode(
    subscription.metadata?.planCode
      ?? (await resolvePlanCodeFromPriceId(priceId))
      ?? activeState.plan.code,
  );
  const subscriptionStatus = normalizeStripeSubscriptionStatus(subscription.status);

  await upsertStripeCustomerMapping({
    tenantId,
    userId: ownerUserId,
    stripeCustomerId: subscription.customer,
  });

  await upsertTenantSubscriptionRecord({
    tenantId,
    activePlanCode: activeState.plan.code,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    stripeCheckoutSessionId: null,
    stripePriceId: priceId,
    billingInterval: readIntervalFromSubscription(subscription),
    subscriptionStatus,
    currentPeriodStart: readPeriodStart(subscription),
    currentPeriodEnd: readPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    lastWebhookEventId: eventId,
    rawLatestEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
  });

  console.log(JSON.stringify({
    event: 'webhook_subscription_updated',
    subscriptionId: subscription.id,
    status: subscriptionStatus,
    planCode,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    tenantId,
    eventType: 'billing.subscription_updated',
    planCode,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    billingInterval: readIntervalFromSubscription(subscription),
    source: 'stripe_webhook',
    message: `Subscription updated: ${subscriptionStatus}`,
    payload: {
      eventId,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  if (rawEvent?.type === 'customer.subscription.deleted') {
    await cancelTenantPlanState({
      tenantId,
      actorUserId: ownerUserId,
      requestId: eventId,
    });
    await upsertTenantSubscriptionRecord({
      tenantId,
      activePlanCode: 'free',
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      stripeCheckoutSessionId: null,
      stripePriceId: priceId,
      billingInterval: readIntervalFromSubscription(subscription),
      subscriptionStatus,
      currentPeriodStart: readPeriodStart(subscription),
      currentPeriodEnd: readPeriodEnd(subscription),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      lastWebhookEventId: eventId,
      rawLatestEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
    });

    await writeBillingAuditLog({
      tenantId,
      userId: ownerUserId,
      eventType: 'billing.plan_downgraded',
      planCode: 'free',
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      source: 'stripe_webhook',
      message: 'Subscription deleted; tenant downgraded to free',
      payload: { eventId },
    });
  }

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: subscription.customer,
    email: null,
  });

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    planCode: rawEvent?.type === 'customer.subscription.deleted' ? 'free' : activeState.plan.code,
    subscriptionStatus,
    currentPeriodEnd: readPeriodEnd(subscription),
  });
}

async function handleInvoicePaid(eventId: string, invoice: Stripe.Invoice, rawEvent?: Stripe.Event) {
  if (!invoice.customer || typeof invoice.customer !== 'string') {
    throw new Error('Missing Stripe customer in invoice.paid event');
  }

  const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
  const subscription = stripeSubscriptionId
    ? await getStripeClient().subscriptions.retrieve(stripeSubscriptionId)
    : null;
  const tenantId = subscription?.metadata?.tenantId
    ? parseInt(subscription.metadata.tenantId, 10)
    : await resolveTenantIdFromStripeCustomer(invoice.customer);
  if (!tenantId) {
    throw new Error(`Cannot resolve tenant for Stripe customer ${invoice.customer}`);
  }

  const ownerUserId = await getTenantOwnerUserId(tenantId);
  const priceId = invoice.lines.data[0]?.price?.id ?? readPriceIdFromSubscription(subscription);
  const planCode = normalizePlanCode(
    subscription?.metadata?.planCode
      ?? (await resolvePlanCodeFromPriceId(priceId))
      ?? (await getTenantPlanState(tenantId)).plan.code,
  );
  const subscriptionStatus = subscription ? normalizeStripeSubscriptionStatus(subscription.status) : 'active';
  const billingInterval = readIntervalFromSubscription(subscription);

  await upsertStripeCustomerMapping({
    tenantId,
    userId: ownerUserId,
    stripeCustomerId: invoice.customer,
  });

  await upsertInvoiceRecord({
    tenantId,
    invoice,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    status: 'paid',
  });

  await assignTenantPlan({
    tenantId,
    planCode,
    actorUserId: ownerUserId,
    requestId: eventId,
  });

  await upsertTenantSubscriptionRecord({
    tenantId,
    activePlanCode: planCode,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    stripeCheckoutSessionId: null,
    stripePriceId: priceId,
    billingInterval,
    subscriptionStatus,
    currentPeriodStart: readPeriodStart(subscription),
    currentPeriodEnd: readPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    lastWebhookEventId: eventId,
    lastInvoiceId: invoice.id,
    rawLatestEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
  });

  console.log(JSON.stringify({
    event: 'webhook_invoice_payment_succeeded',
    invoiceId: invoice.id,
    tenantId,
    planCode,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    tenantId,
    userId: ownerUserId,
    eventType: 'billing.invoice_payment_succeeded',
    planCode,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    billingInterval,
    source: 'stripe_webhook',
    message: 'Invoice payment succeeded; plan synchronized from webhook',
    payload: {
      eventId,
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
    },
  });

  await writeBillingAuditLog({
    tenantId,
    userId: ownerUserId,
    eventType: 'billing.plan_activated',
    planCode,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    billingInterval,
    source: 'stripe_webhook',
    message: `Plan activated after payment: ${planCode}`,
    payload: {
      eventId,
      invoiceId: invoice.id,
    },
  });

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: invoice.customer,
    email: typeof invoice.customer_email === 'string' ? invoice.customer_email : null,
  });

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    planCode,
    subscriptionStatus: 'active',
    currentPeriodEnd: readPeriodEnd(subscription),
  });

  await trackConversionEvent({
    eventName: 'checkout_completed',
    userId: user.id,
    tenantId,
    source: 'stripe_webhook',
    metadata: {
      invoiceId: invoice.id,
      planCode,
      billingInterval,
    },
  });
}

async function handleInvoiceFailed(eventId: string, invoice: Stripe.Invoice, rawEvent?: Stripe.Event) {
  if (!invoice.customer || typeof invoice.customer !== 'string') {
    throw new Error('Missing Stripe customer in invoice.payment_failed event');
  }

  const stripeSubscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
  const subscription = stripeSubscriptionId
    ? await getStripeClient().subscriptions.retrieve(stripeSubscriptionId)
    : null;
  const tenantId = subscription?.metadata?.tenantId
    ? parseInt(subscription.metadata.tenantId, 10)
    : await resolveTenantIdFromStripeCustomer(invoice.customer);
  if (!tenantId) {
    throw new Error(`Cannot resolve tenant for Stripe customer ${invoice.customer}`);
  }

  const ownerUserId = await getTenantOwnerUserId(tenantId);
  const currentState = await getTenantPlanState(tenantId);
  const priceId = invoice.lines.data[0]?.price?.id ?? readPriceIdFromSubscription(subscription);
  const billingInterval = readIntervalFromSubscription(subscription);

  await upsertStripeCustomerMapping({
    tenantId,
    userId: ownerUserId,
    stripeCustomerId: invoice.customer,
  });

  await upsertInvoiceRecord({
    tenantId,
    invoice,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    status: 'payment_failed',
  });

  await upsertTenantSubscriptionRecord({
    tenantId,
    activePlanCode: currentState.plan.code,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    stripeCheckoutSessionId: null,
    stripePriceId: priceId,
    billingInterval,
    subscriptionStatus: 'past_due',
    currentPeriodStart: readPeriodStart(subscription),
    currentPeriodEnd: readPeriodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    lastWebhookEventId: eventId,
    lastInvoiceId: invoice.id,
    rawLatestEventJson: rawEvent as unknown as Record<string, unknown> | undefined,
  });

  console.log(JSON.stringify({
    event: 'webhook_invoice_payment_failed',
    invoiceId: invoice.id,
    tenantId,
    planCode: currentState.plan.code,
    gracePeriod: true,
    timestamp: Date.now(),
  }));

  await writeBillingAuditLog({
    tenantId,
    userId: ownerUserId,
    eventType: 'billing.payment_failed',
    planCode: currentState.plan.code,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    billingInterval,
    source: 'stripe_webhook',
    message: 'Invoice payment failed; active plan unchanged',
    payload: {
      eventId,
      invoiceId: invoice.id,
    },
  });

  const user = await resolveOrCreateUserFromStripe({
    stripeCustomerId: invoice.customer,
    email: typeof invoice.customer_email === 'string' ? invoice.customer_email : null,
  });

  await syncLegacySubscriptionForUser({
    userId: user.id,
    stripeCustomerId: invoice.customer,
    stripeSubscriptionId,
    planCode: currentState.plan.code,
    subscriptionStatus: 'past_due',
    currentPeriodEnd: null,
  });

  if (typeof invoice.customer_email === 'string' && invoice.customer_email) {
    await sendProductEmail({
      toEmail: invoice.customer_email,
      emailType: 'payment_failed',
      subject: 'Payment failed - action required',
      payload: {
        invoiceId: invoice.id,
        planCode: currentState.plan.code,
        stripeCustomerId: invoice.customer,
      },
    });
  }
}

export async function processStripeWebhookEvent(event: Stripe.Event) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO billing_webhook_events (event_id, event_type, status, payload_json)
       VALUES ($1, $2, 'processing', $3)`,
      [event.id, event.type, JSON.stringify(event)]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      console.log(JSON.stringify({ event: 'webhook_duplicate_ignored', eventId: event.id, type: event.type, timestamp: Date.now() }));
      return { processed: false, duplicate: true };
    }
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

    const processedClient = await pool.connect();
    try {
      await processedClient.query(
        `UPDATE billing_webhook_events
         SET status = 'processed',
             processed_at = NOW(),
             error_message = NULL
         WHERE event_id = $1`,
        [event.id],
      );
    } finally {
      processedClient.release();
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

