import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDatabase, getPool } from './db.js';
import { registerUser, loginUser, verifyJWT, getTenantIdForUser, rotateRefreshToken, revokeRefreshToken } from './auth.js';
import {
  createCheckoutSessionForTenant,
  getTenantBillingStatus,
  createBillingPortalSession,
  changeTenantPlan,
  cancelTenantSubscription,
  processStripeWebhookEvent,
  validateStripeEnvOrThrow,
  verifyWebhookSignature,
} from './stripe.js';
import {
  assertFeatureAllowed,
  assertQuota,
  getUsageSummary,
  incrementUsage,
  UpgradeRequiredError,
} from './billing/enforcement.js';
import { isActiveUser } from './middleware/isActiveUser.js';
import {
  AppError,
  assertCheckoutNotSpam,
  assertValidEmail,
  assertValidPassword,
  assertValidPlanId,
  authBillingRateLimitMiddleware,
  getClientIp,
  recordMonitoringSignal,
  requestContextMiddleware,
  sendError,
  validateProductionSecurityConfig,
} from './security.js';

const app = new Hono();
const API_PREFIX = '/v1';

function normalizeAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof UpgradeRequiredError) {
    return new AppError(402, 'upgrade_required', error.message, error.toResponse());
  }

  return new AppError(500, 'internal_error', 'Internal Server Error');
}

async function writeAuditLog(input: {
  eventType: string;
  message: string;
  userId?: number | null;
  tenantId?: number | null;
  source?: string;
  payload?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO billing_audit_logs (
      tenant_id,
      user_id,
      event_type,
      source,
      message,
      payload_json
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.tenantId ?? null,
      input.userId ?? null,
      input.eventType,
      input.source ?? 'backend',
      input.message,
      input.payload ? JSON.stringify(input.payload) : null,
    ],
  );
}

app.onError((error, c) => {
  const normalized = normalizeAppError(error);
  if (normalized.status >= 500) {
    recordMonitoringSignal('5xx_spike', {
      path: c.req.path,
      method: c.req.method,
    }).catch(() => null);
  }

  if (normalized.status >= 500) {
    console.error('Unhandled application error:', error);
  }

  return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
});

app.use('*', requestContextMiddleware);

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  if (c.res.status >= 500) {
    recordMonitoringSignal('5xx_spike', {
      path: c.req.path,
      method: c.req.method,
      status: c.res.status,
    }).catch(() => null);
  }

  console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} (${durationMs}ms)`);
});

app.use(`${API_PREFIX}/auth/*`, authBillingRateLimitMiddleware);
app.use(`${API_PREFIX}/billing/*`, authBillingRateLimitMiddleware);

// Enable CORS
app.use('*', cors({
  origin: (origin) => {
    if (!origin || origin === 'https://zonforge.com') {
      return 'https://zonforge.com';
    }

    return 'https://zonforge.com';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'zonforge-backend' });
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

function requireAuthUserId(c: any): number | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return null;
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const payload = verifyJWT(token);
  if (!payload) {
    return null;
  }

  return payload.userId;
}

function resolveFrontendOrigin(c: any): string {
  const candidates = [
    c.req.header('origin'),
    c.req.header('referer'),
    process.env.ZONFORGE_PUBLIC_APP_URL,
    'https://zonforge.com',
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      continue;
    }
  }

  return 'https://zonforge.com';
}

function normalizeCheckoutRequest(body: Record<string, unknown>) {
  const rawPlanId = body.plan_id ?? body.planId ?? body.planCode ?? body.plan ?? null;
  const rawBillingCycle = body.billing_cycle ?? body.billingCycle ?? 'monthly';

  const planId = assertValidPlanId(rawPlanId);
  const billingCycle = typeof rawBillingCycle === 'string' ? rawBillingCycle.trim().toLowerCase() : 'monthly';

  if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
    throw new AppError(400, 'invalid_billing_cycle', 'billing_cycle must be monthly or annual');
  }

  return {
    planId,
    billingCycle: billingCycle as 'monthly' | 'annual',
  };
}

async function handleCheckoutRequest(c: any) {
  const userId = requireAuthUserId(c);
  if (!userId) {
    return sendError(c, 401, 'unauthorized', 'Unauthorized');
  }

  const tenantId = await getTenantIdForUser(userId);
  if (!tenantId) {
    return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
  }

  const body = await c.req.json();
  const { planId, billingCycle } = normalizeCheckoutRequest(body);
  assertCheckoutNotSpam(userId, `${planId}:${billingCycle}`);

  if (planId === 'starter') {
    return sendError(c, 400, 'starter_checkout_forbidden', 'Starter plan does not require checkout');
  }

  if (planId === 'enterprise' || planId === 'mssp') {
    return sendError(c, 400, 'sales_required', 'This plan requires sales assistance');
  }

  const origin = resolveFrontendOrigin(c);
  const checkout = await createCheckoutSessionForTenant(tenantId, planId, {
    billingInterval: billingCycle,
    successUrl: `${origin}/dashboard?payment=success`,
    cancelUrl: `${origin}/pricing?payment=cancelled`,
    actorUserId: userId,
    source: 'api_checkout',
  });

  return c.json({
    plan_id: planId,
    billing_cycle: billingCycle,
    session_id: checkout.sessionId,
    session_url: checkout.url,
    sessionId: checkout.sessionId,
    url: checkout.url,
  });
}

// Auth routes
app.post(`${API_PREFIX}/auth/register`, async (c) => {
  try {
    const body = await c.req.json();
    const email = assertValidEmail(body.email);
    const password = assertValidPassword(body.password);
    const clientIp = getClientIp(c);
    const userAgent = c.req.header('user-agent') ?? null;

    const { userId, tokens } = await registerUser(email, password, {
      ip: clientIp,
      userAgent,
    });
    const pool = getPool();

    // Ensure one tenant exists for self-serve users (additive, backward compatible).
    const tenantRows = await pool.query('SELECT id FROM tenants WHERE user_id = $1 LIMIT 1', [userId]);
    let tenantId = tenantRows.rows[0]?.id as number | undefined;

    if (!tenantId) {
      const tenantInsert = await pool.query(
        'INSERT INTO tenants (name, plan, user_id) VALUES ($1, $2, $3) RETURNING id',
        [email.split('@')[0] + '-tenant', 'starter', userId],
      );
      tenantId = tenantInsert.rows[0]?.id as number | undefined;
    }

    if (tenantId) {
      const usage = await getUsageSummary(tenantId)
      await assertQuota(tenantId, 'IDENTITIES', usage.usage.IDENTITIES, 1)
      await incrementUsage(tenantId, 'IDENTITIES', 1)
    }

    await writeAuditLog({
      eventType: 'auth.register',
      message: 'User registered',
      userId,
      tenantId: tenantId ?? null,
      source: 'auth',
      payload: { email, clientIp },
    });

    return c.json({
      success: true,
      userId,
      token: tokens.accessToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresInSeconds,
      refresh_expires_at: tokens.refreshExpiresAt,
      redirectUrl: '/success',
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/auth/login`, async (c) => {
  try {
    const body = await c.req.json();
    const email = assertValidEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return sendError(c, 400, 'invalid_password', 'Password is required.');
    }
    const clientIp = getClientIp(c);
    const userAgent = c.req.header('user-agent') ?? null;

    const { userId, tokens } = await loginUser(email, password, {
      ip: clientIp,
      userAgent,
    });

    const tenantId = await getTenantIdForUser(userId);
    await writeAuditLog({
      eventType: 'auth.login',
      message: 'User login successful',
      userId,
      tenantId,
      source: 'auth',
      payload: { email, clientIp },
    });

    return c.json({
      success: true,
      userId,
      token: tokens.accessToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresInSeconds,
      refresh_expires_at: tokens.refreshExpiresAt,
    });
  } catch (error) {
    const normalized = normalizeAppError(error);

    if ((error as Error).message === 'Invalid credentials') {
      await writeAuditLog({
        eventType: 'auth.login_failed',
        message: 'Failed login attempt',
        source: 'auth',
        payload: {
          ip: getClientIp(c),
        },
      });

      await recordMonitoringSignal('failed_login', {
        path: c.req.path,
        ip: getClientIp(c),
      });

      return sendError(c, 401, 'invalid_credentials', 'Invalid email or password.');
    }

    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/auth/refresh`, async (c) => {
  try {
    const body = await c.req.json();
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
    if (!refreshToken) {
      return sendError(c, 400, 'refresh_token_required', 'refresh_token is required');
    }

    const rotated = await rotateRefreshToken(refreshToken, {
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') ?? null,
    });

    await writeAuditLog({
      eventType: 'auth.refresh',
      message: 'Access token refreshed',
      userId: rotated.userId,
      tenantId: await getTenantIdForUser(rotated.userId),
      source: 'auth',
      payload: { ip: getClientIp(c) },
    });

    return c.json({
      success: true,
      token: rotated.tokens.accessToken,
      access_token: rotated.tokens.accessToken,
      refresh_token: rotated.tokens.refreshToken,
      expires_in: rotated.tokens.expiresInSeconds,
      refresh_expires_at: rotated.tokens.refreshExpiresAt,
    });
  } catch (error) {
    return sendError(c, 401, 'invalid_refresh_token', 'Refresh token is invalid or expired.');
  }
});

app.post(`${API_PREFIX}/auth/logout`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    return c.json({ success: true });
  } catch {
    return sendError(c, 400, 'logout_failed', 'Could not complete logout.');
  }
});

// Protected route example
app.get(`${API_PREFIX}/users`, async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return sendError(c, 401, 'unauthorized', 'Unauthorized');
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const payload = verifyJWT(token);

  if (!payload) {
    return sendError(c, 401, 'invalid_token', 'Invalid token');
  }

  const pool = getPool();
  const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [payload.userId]);
  const user = result.rows[0];

  return c.json({ user });
});

async function handleBillingWebhook(c: any) {
  try {
    const signature = c.req.header('stripe-signature');

    if (!signature) {
      await recordMonitoringSignal('webhook_failure', {
        reason: 'missing_signature',
        path: c.req.path,
      });
      return sendError(c, 400, 'missing_signature', 'No signature');
    }

    const body = await c.req.text();
    const event = verifyWebhookSignature(body, signature);

    const result = await processStripeWebhookEvent(event);
    if (result.duplicate) {
      return c.json({ received: true, duplicate: true });
    }

    return c.json({ received: true });
  } catch (error) {
    await recordMonitoringSignal('webhook_failure', {
      reason: (error as Error).message,
      path: c.req.path,
    });

    console.error('✗ Webhook error:', error);
    if ((error as Error).message === 'Invalid webhook signature') {
      return sendError(c, 400, 'invalid_webhook_signature', 'Invalid webhook signature');
    }
    return sendError(c, 500, 'webhook_processing_failed', 'Webhook processing failed');
  }
}

// Stripe webhook
app.post(`${API_PREFIX}/billing/webhook`, handleBillingWebhook);

// Keep legacy route for compatibility
app.post(`${API_PREFIX}/webhook/stripe`, async (c) => {
  return handleBillingWebhook(c);
});

app.post(`${API_PREFIX}/billing/checkout`, async (c) => {
  try {
    return await handleCheckoutRequest(c);
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/checkout-session`, async (c) => {
  try {
    return await handleCheckoutRequest(c);
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/billing/status`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const status = await getTenantBillingStatus(tenantId);
    const usage = await getUsageSummary(tenantId);
    return c.json({
      billing: status,
      plan: usage.plan,
      statusCode: usage.status,
      limits: usage.limits,
      usage: usage.usage,
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

// GET /billing/subscription — detailed subscription object (09.6)
app.get(`${API_PREFIX}/billing/subscription`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) return sendError(c, 401, 'unauthorized', 'Unauthorized');
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    const subscription = await getTenantBillingStatus(tenantId);
    if (!subscription) return c.json({ subscription: null, eligible_for_checkout: true });
    return c.json({
      subscription: {
        tenantId: subscription.tenantId,
        planCode: subscription.planCode,
        planName: subscription.planName,
        status: subscription.subscriptionStatus,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        hasStripeCustomer: Boolean(subscription.stripeCustomerId),
        limits: subscription.limits,
      },
      eligible_for_checkout: !subscription.stripeSubscriptionId || subscription.subscriptionStatus === 'none',
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

// GET /billing/plans — plan catalog source-of-truth (09.6)
app.get(`${API_PREFIX}/billing/plans`, async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT code, name, description,
              monthly_price_cents, annual_price_cents,
              max_users, max_connectors, max_events_per_month,
              retention_days,
              (stripe_monthly_price_id IS NOT NULL) AS has_stripe_monthly,
              (stripe_annual_price_id IS NOT NULL) AS has_stripe_annual
       FROM plans
       WHERE is_active = true
       ORDER BY monthly_price_cents ASC`
    );
    return c.json({ plans: result.rows });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/billing/usage`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const usage = await getUsageSummary(tenantId);
    return c.json({
      plan: usage.plan,
      status: usage.status,
      limits: usage.limits,
      usage: usage.usage,
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/portal`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const portal = await createBillingPortalSession(tenantId);
    return c.json({ url: portal.url });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/change-plan`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const body = await c.req.json();
    const planCode = assertValidPlanId(body.planCode ?? body.plan_id);

    const updated = await changeTenantPlan(tenantId, planCode);
    await writeAuditLog({
      eventType: 'billing.plan_change',
      message: `Plan changed to ${planCode}`,
      userId,
      tenantId,
      source: 'billing',
      payload: { planCode },
    });
    return c.json({ billing: updated });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/cancel`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const cancelled = await cancelTenantSubscription(tenantId);
    await writeAuditLog({
      eventType: 'billing.plan_cancel',
      message: 'Subscription cancellation requested',
      userId,
      tenantId,
      source: 'billing',
    });
    return c.json({ billing: cancelled });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/billing/access-check`, isActiveUser, async (c) => {
  return c.json({ allowed: true, userId: requireAuthUserId(c) });
});

// Internal centralized enforcement endpoints (used by other services).
app.post(`${API_PREFIX}/billing/internal/assert-quota`, async (c) => {
  try {
    const { tenantId, metricCode, currentValue, increment } = await c.req.json() as {
      tenantId: number
      metricCode: 'CONNECTORS' | 'IDENTITIES' | 'EVENTS_PER_MIN'
      currentValue: number
      increment?: number
    };

    await assertQuota(Number(tenantId), metricCode, Number(currentValue), Number(increment ?? 1));
    return c.json({ allowed: true });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/billing/internal/assert-feature`, async (c) => {
  try {
    const { tenantId, featureCode } = await c.req.json() as {
      tenantId: number
      featureCode: 'AI_ANALYSIS' | 'ADVANCED_DETECTION' | 'EXPORT_REPORT' | 'THREAT_HUNTING'
    };
    await assertFeatureAllowed(Number(tenantId), featureCode);
    return c.json({ allowed: true });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/billing/internal/increment-usage`, async (c) => {
  try {
    const { tenantId, metricCode, increment } = await c.req.json() as {
      tenantId: number
      metricCode: 'CONNECTORS' | 'IDENTITIES' | 'EVENTS_PER_MIN'
      increment?: number
    };
    const value = await incrementUsage(Number(tenantId), metricCode, Number(increment ?? 1));
    return c.json({ ok: true, value });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/ai/analyze`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) return c.json({ error: 'User has no associated tenant' }, 400);
    await assertFeatureAllowed(tenantId, 'AI_ANALYSIS');
    return c.json({ ok: true, message: 'AI analysis accepted' });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/reports/export`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) return c.json({ error: 'User has no associated tenant' }, 400);
    await assertFeatureAllowed(tenantId, 'EXPORT_REPORT');
    return c.json({ ok: true, message: 'Export scheduled' });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Initialize and start
async function start() {
  try {
    await initDatabase();
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key_here') {
      console.error('SECURITY WARNING: JWT_SECRET is not set to a strong value');
    }

    validateStripeEnvOrThrow();
    validateProductionSecurityConfig();

    const port = parseInt(process.env.PORT || '3000', 10);
    serve({
      fetch: app.fetch,
      port,
    });

    console.log(`\n✓ ZonForge SaaS Backend starting on port ${port}\n`);
  } catch (error) {
    console.error('✗ Failed to start:', error);
    process.exit(1);
  }
}

export default app;

// Export for deployment
export const handler = app.fetch;

// Start server
start().catch((error) => {
  console.error('✗ Server failed to start:', error);
  process.exit(1);
});
