import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDatabase, getPool } from './db.js';
import { registerUser, loginUser, verifyJWT, getTenantIdForUser } from './auth.js';
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

const app = new Hono();
const API_PREFIX = '/v1';

app.onError((error, c) => {
  console.error('Unhandled application error:', error);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} (${durationMs}ms)`);
});

// Enable CORS
app.use('*', cors({
  origin: (origin) => {
    const allowedOrigins = new Set([
      'https://zonforge.com',
      'https://www.zonforge.com',
      'http://localhost:3000',
      'http://localhost:4000',
      'http://localhost:4173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:4000',
      'http://127.0.0.1:4173',
    ]);

    if (!origin) {
      return 'https://zonforge.com';
    }

    if (allowedOrigins.has(origin) || origin.endsWith('.netlify.app')) {
      return origin;
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

  const token = authHeader.replace('Bearer ', '');
  const payload = verifyJWT(token);
  if (!payload) {
    return null;
  }

  return payload.userId;
}

// Auth routes
app.post(`${API_PREFIX}/auth/register`, async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }

    const { userId, token } = await registerUser(email, password);
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

    return c.json({ success: true, userId, token, redirectUrl: '/success' });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402)
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/auth/login`, async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }

    const { userId, token } = await loginUser(email, password);
    return c.json({ success: true, userId, token });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Protected route example
app.get(`${API_PREFIX}/users`, async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const payload = verifyJWT(token);

  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401);
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
      return c.json({ error: 'No signature' }, 400);
    }

    const body = await c.req.text();
    const event = verifyWebhookSignature(body, signature);

    const result = await processStripeWebhookEvent(event);
    if (result.duplicate) {
      return c.json({ received: true, duplicate: true });
    }

    return c.json({ received: true });
  } catch (error) {
    console.error('✗ Webhook error:', error);
    if ((error as Error).message === 'Invalid webhook signature') {
      return c.json({ error: (error as Error).message }, 400);
    }
    return c.json({ error: (error as Error).message }, 500);
  }
}

// Stripe webhook
app.post(`${API_PREFIX}/billing/webhook`, handleBillingWebhook);

// Keep legacy route for compatibility
app.post(`${API_PREFIX}/webhook/stripe`, async (c) => {
  return handleBillingWebhook(c);
});

app.post(`${API_PREFIX}/billing/checkout-session`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return c.json({ error: 'User has no associated tenant' }, 400);
    }

    const { planCode } = await c.req.json();
    if (!planCode) {
      return c.json({ error: 'Plan code required' }, 400);
    }

    const checkout = await createCheckoutSessionForTenant(tenantId, planCode);
    return c.json({
      sessionId: checkout.sessionId,
      url: checkout.url,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.get(`${API_PREFIX}/billing/status`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return c.json({ error: 'User has no associated tenant' }, 400);
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
    return c.json({ error: (error as Error).message }, 400);
  }
});

// GET /billing/subscription — detailed subscription object (09.6)
app.get(`${API_PREFIX}/billing/subscription`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) return c.json({ error: 'User has no associated tenant' }, 400);
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
        hasStripeCustomer: Boolean(subscription.stripeCustomerId),
        limits: subscription.limits,
      },
      eligible_for_checkout: !subscription.stripeSubscriptionId || subscription.subscriptionStatus === 'none',
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
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
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.get(`${API_PREFIX}/billing/usage`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return c.json({ error: 'User has no associated tenant' }, 400);
    }

    const usage = await getUsageSummary(tenantId);
    return c.json({
      plan: usage.plan,
      status: usage.status,
      limits: usage.limits,
      usage: usage.usage,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/billing/portal`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return c.json({ error: 'User has no associated tenant' }, 400);
    }

    const portal = await createBillingPortalSession(tenantId);
    return c.json({ url: portal.url });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/billing/change-plan`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return c.json({ error: 'User has no associated tenant' }, 400);
    }

    const { planCode } = await c.req.json();
    if (!planCode) {
      return c.json({ error: 'Plan code required' }, 400);
    }

    const updated = await changeTenantPlan(tenantId, planCode);
    return c.json({ billing: updated });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/billing/cancel`, async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return c.json({ error: 'User has no associated tenant' }, 400);
    }

    const cancelled = await cancelTenantSubscription(tenantId);
    return c.json({ billing: cancelled });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
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
    validateStripeEnvOrThrow();

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
