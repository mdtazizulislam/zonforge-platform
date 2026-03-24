import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDatabase, getPool } from './db.js';
import { registerUser, loginUser, verifyJWT } from './auth.js';
import { createCheckoutSessionForUser, getBillingStatusForUser, processStripeWebhookEvent, validateStripeEnvOrThrow, verifyWebhookSignature } from './stripe.js';

const app = new Hono();

// Enable CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
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
app.post('/auth/register', async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }

    const { userId, token } = await registerUser(email, password);
    return c.json({ success: true, userId, token, redirectUrl: '/success' });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post('/auth/login', async (c) => {
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
app.get('/api/user', async (c) => {
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
    return c.json({ error: (error as Error).message }, 400);
  }
}

// Stripe webhook
app.post('/billing/webhook', handleBillingWebhook);

// Keep legacy route for compatibility
app.post('/webhook/stripe', async (c) => {
  return handleBillingWebhook(c);
});

app.post('/billing/checkout-session', async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const checkout = await createCheckoutSessionForUser(userId);
    return c.json({
      sessionId: checkout.sessionId,
      url: checkout.url,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.get('/billing/status', async (c) => {
  try {
    const userId = requireAuthUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const status = await getBillingStatusForUser(userId);
    return c.json({ billing: status });
  } catch (error) {
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
