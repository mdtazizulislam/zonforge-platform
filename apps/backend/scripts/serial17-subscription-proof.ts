import dotenv from 'dotenv';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: new URL('../.env', import.meta.url) });

process.env.ZONFORGE_USE_PGMEM = '1';
process.env.ZONFORGE_SKIP_SERVER_START = '1';

const { initDatabase, getPool } = await import('../src/db.ts');
const { setStripeClientForTesting } = await import('../src/stripe.ts');
const { createAccessToken } = await import('../src/auth.ts');
const { ensureTenantPlanAssigned } = await import('../src/billing/tenantPlans.ts');

type MockState = {
  customerId: string;
  checkoutSessionId: string;
  subscriptionId: string;
  activePriceId: string;
  activePlanCode: string;
  pendingPlanCode: string;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  billingInterval: 'month' | 'year';
};

const nowUnix = Math.floor(Date.now() / 1000);
const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY must be set in the environment to run this proof script.');
}
const verifier = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

const mockState: MockState = {
  customerId: 'cus_serial17_proof',
  checkoutSessionId: 'cs_serial17_proof',
  subscriptionId: 'sub_serial17_proof',
  activePriceId: process.env.STRIPE_PRICE_ID_GROWTH || 'price_test_monthly_growth',
  activePlanCode: 'growth',
  pendingPlanCode: 'growth',
  subscriptionStatus: 'incomplete',
  cancelAtPeriodEnd: false,
  billingInterval: 'month',
};

function buildSubscription(tenantId: number, userId: string) {
  return {
    id: mockState.subscriptionId,
    object: 'subscription',
    customer: mockState.customerId,
    status: mockState.subscriptionStatus,
    cancel_at_period_end: mockState.cancelAtPeriodEnd,
    current_period_start: nowUnix,
    current_period_end: nowUnix + 30 * 24 * 60 * 60,
    metadata: {
      tenantId: String(tenantId),
      planCode: mockState.pendingPlanCode,
      billingInterval: mockState.billingInterval === 'year' ? 'annual' : 'monthly',
      userId,
    },
    items: {
      data: [
        {
          id: 'si_serial17_proof',
          price: {
            id: mockState.activePriceId,
            recurring: {
              interval: mockState.billingInterval,
            },
          },
        },
      ],
    },
  };
}

setStripeClientForTesting({
  customers: {
    create: async () => ({
      id: mockState.customerId,
    }),
  },
  checkout: {
    sessions: {
      create: async (input: {
        line_items: Array<{ price: string }>;
        metadata?: Record<string, string>;
      }) => {
        mockState.pendingPlanCode = String(input.metadata?.planCode ?? 'growth');
        mockState.activePriceId = String(input.line_items[0]?.price ?? mockState.activePriceId);
        mockState.billingInterval = input.metadata?.billingInterval === 'annual' ? 'year' : 'month';
        return {
          id: mockState.checkoutSessionId,
          url: `https://checkout.stripe.test/session/${mockState.checkoutSessionId}`,
        };
      },
    },
  },
  subscriptions: {
    retrieve: async (_subscriptionId: string) => buildSubscription(proofContext.tenantId, proofContext.userId),
    update: async (_subscriptionId: string, update: { cancel_at_period_end?: boolean }) => {
      mockState.cancelAtPeriodEnd = Boolean(update.cancel_at_period_end);
      return buildSubscription(proofContext.tenantId, proofContext.userId);
    },
  },
  billingPortal: {
    sessions: {
      create: async () => ({
        url: 'https://billing.stripe.test/portal/serial17',
      }),
    },
  },
  webhooks: verifier.webhooks,
} as unknown);

const { default: app } = await import('../src/index.ts');

const proofContext = {
  tenantId: 0,
  userId: '0',
  email: `serial17.${Date.now()}@example.com`,
  accessToken: '',
};

function authHeaders() {
  return {
    Authorization: `Bearer ${proofContext.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await app.request(path, init);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function sendSignedWebhook(event: Record<string, unknown>, signature?: string) {
  const payload = JSON.stringify(event);
  const webhookSignature = signature ?? verifier.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_serial17_proof',
  });

  const response = await app.request('/v1/billing/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': webhookSignature,
    },
    body: payload,
  });

  return {
    status: response.status,
    body: JSON.parse(await response.text()),
  };
}

await initDatabase();

const pool = getPool();
const insertedUser = await pool.query(
  `INSERT INTO users (
    email,
    password_hash,
    full_name,
    status,
    email_verified,
    email_verified_at,
    updated_at
  ) VALUES ($1, $2, $3, 'active', true, NOW(), NOW())
  RETURNING id`,
  [proofContext.email, 'serial17-proof-hash', 'Serial 17 Proof'],
);
const insertedTenant = await pool.query(
  `INSERT INTO tenants (
    name,
    slug,
    plan,
    onboarding_status,
    user_id,
    created_at,
    updated_at
  ) VALUES ($1, $2, 'free', 'pending', $3, NOW(), NOW())
  RETURNING id`,
  ['Serial 17 Proof Workspace', `serial17-proof-${Date.now()}`, insertedUser.rows[0].id],
);
await pool.query(
  `INSERT INTO tenant_memberships (tenant_id, user_id, role)
   VALUES ($1, $2, 'owner')`,
  [insertedTenant.rows[0].id, insertedUser.rows[0].id],
);

proofContext.tenantId = Number(insertedTenant.rows[0].id);
proofContext.userId = String(insertedUser.rows[0].id);
await ensureTenantPlanAssigned(proofContext.tenantId, Number(proofContext.userId));

proofContext.accessToken = createAccessToken({
  userId: Number(proofContext.userId),
  email: proofContext.email,
  sessionId: randomUUID(),
});

const signup = {
  status: 200,
  body: {
    user: { id: proofContext.userId, email: proofContext.email },
    tenant: { id: proofContext.tenantId },
    accessToken: proofContext.accessToken,
  },
};

const checkout = await requestJson('/v1/billing/checkout', {
  method: 'POST',
  headers: authHeaders(),
  body: JSON.stringify({
    planCode: 'growth',
    billingCycle: 'monthly',
  }),
});

const invalidSignatureAttempt = await sendSignedWebhook({
  id: 'evt_serial17_invalid',
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: mockState.checkoutSessionId,
      object: 'checkout.session',
      customer: mockState.customerId,
      customer_email: proofContext.email,
      subscription: mockState.subscriptionId,
      client_reference_id: String(proofContext.tenantId),
      metadata: {
        tenantId: String(proofContext.tenantId),
        planCode: 'growth',
        billingInterval: 'monthly',
        userId: proofContext.userId,
      },
    },
  },
}, 'invalid-signature');

const checkoutCompletedEvent = {
  id: 'evt_serial17_checkout_completed',
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: mockState.checkoutSessionId,
      object: 'checkout.session',
      customer: mockState.customerId,
      customer_email: proofContext.email,
      subscription: mockState.subscriptionId,
      client_reference_id: String(proofContext.tenantId),
      metadata: {
        tenantId: String(proofContext.tenantId),
        planCode: 'growth',
        billingInterval: 'monthly',
        userId: proofContext.userId,
      },
    },
  },
};

const checkoutCompleted = await sendSignedWebhook(checkoutCompletedEvent);

mockState.subscriptionStatus = 'active';

const invoicePaidEvent = {
  id: 'evt_serial17_invoice_paid',
  object: 'event',
  type: 'invoice.payment_succeeded',
  data: {
    object: {
      id: 'in_serial17_paid',
      object: 'invoice',
      customer: mockState.customerId,
      customer_email: proofContext.email,
      subscription: mockState.subscriptionId,
      amount_due: 19900,
      amount_paid: 19900,
      currency: 'usd',
      billing_reason: 'subscription_create',
      lines: {
        data: [
          {
            price: {
              id: process.env.STRIPE_PRICE_ID_GROWTH || 'price_test_monthly_growth',
            },
            period: {
              end: nowUnix + 30 * 24 * 60 * 60,
            },
          },
        ],
      },
      status_transitions: {
        paid_at: nowUnix,
      },
    },
  },
};

const invoicePaid = await sendSignedWebhook(invoicePaidEvent);

const planAfterPayment = await requestJson('/v1/me/plan', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${proofContext.accessToken}`,
  },
});

const subscriptionUpdatedEvent = {
  id: 'evt_serial17_subscription_updated',
  object: 'event',
  type: 'customer.subscription.updated',
  data: {
    object: buildSubscription(proofContext.tenantId, proofContext.userId),
  },
};

const subscriptionUpdated = await sendSignedWebhook(subscriptionUpdatedEvent);

mockState.pendingPlanCode = 'business';
mockState.activePriceId = process.env.STRIPE_PRICE_ID_BUSINESS || 'price_test_monthly_business';
mockState.subscriptionStatus = 'past_due';

const invoiceFailedEvent = {
  id: 'evt_serial17_invoice_failed',
  object: 'event',
  type: 'invoice.payment_failed',
  data: {
    object: {
      id: 'in_serial17_failed',
      object: 'invoice',
      customer: mockState.customerId,
      customer_email: proofContext.email,
      subscription: mockState.subscriptionId,
      amount_due: 49900,
      amount_paid: 0,
      currency: 'usd',
      billing_reason: 'subscription_update',
      lines: {
        data: [
          {
            price: {
              id: process.env.STRIPE_PRICE_ID_BUSINESS || 'price_test_monthly_business',
            },
            period: {
              end: nowUnix + 30 * 24 * 60 * 60,
            },
          },
        ],
      },
    },
  },
};

const invoiceFailed = await sendSignedWebhook(invoiceFailedEvent);

const planAfterFailedPayment = await requestJson('/v1/me/plan', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${proofContext.accessToken}`,
  },
});

mockState.cancelAtPeriodEnd = true;

const subscriptionDeletedEvent = {
  id: 'evt_serial17_subscription_deleted',
  object: 'event',
  type: 'customer.subscription.deleted',
  data: {
    object: buildSubscription(proofContext.tenantId, proofContext.userId),
  },
};

const subscriptionDeleted = await sendSignedWebhook(subscriptionDeletedEvent);

const finalPlanState = await requestJson('/v1/me/plan', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${proofContext.accessToken}`,
  },
});

const billingSubscription = await requestJson('/v1/billing/subscription', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${proofContext.accessToken}`,
  },
});

const subscriptionRow = await pool.query(
  `SELECT tenant_id, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id, subscription_status, billing_interval, cancel_at_period_end
   FROM tenant_subscriptions
   WHERE tenant_id = $1`,
  [proofContext.tenantId],
);
const invoiceRows = await pool.query(
  `SELECT stripe_invoice_id, status, amount_paid_cents, amount_due_cents
   FROM invoices
   WHERE tenant_id = $1
   ORDER BY id ASC`,
  [proofContext.tenantId],
);
const webhookRows = await pool.query(
  `SELECT event_id, event_type, status
   FROM billing_webhook_events
   WHERE event_id LIKE 'evt_serial17_%'
   ORDER BY created_at ASC`,
);
const auditRows = await pool.query(
  `SELECT event_type, source, message
   FROM billing_audit_logs
   WHERE tenant_id = $1
   ORDER BY id ASC`,
  [proofContext.tenantId],
);
const planRows = await pool.query(
  `SELECT t.plan, p.code AS current_plan_code
   FROM tenants t
   LEFT JOIN plans p ON p.id = t.current_plan_id
   WHERE t.id = $1`,
  [proofContext.tenantId],
);

const planHistory = await pool.query(
  `SELECT event_type, message
   FROM billing_audit_logs
   WHERE tenant_id = $1 AND event_type IN ('billing.plan_activated', 'billing.payment_failed', 'billing.plan_downgraded')
   ORDER BY id ASC`,
  [proofContext.tenantId],
);

const result = {
  serial: 17,
  timestamp: new Date().toISOString(),
  tenantId: proofContext.tenantId,
  userId: proofContext.userId,
  assertions: {
    checkoutSessionCreated: checkout.status === 200 && Boolean(checkout.body?.session_id),
    stripeUrlReturned: checkout.status === 200 && typeof checkout.body?.url === 'string' && checkout.body.url.startsWith('https://checkout.stripe.test/'),
    webhookReceived: webhookRows.rows.length >= 4,
    signatureVerified: invalidSignatureAttempt.status === 400 && checkoutCompleted.status === 200,
    planUpdatedAfterPayment: planAfterPayment.body?.plan?.code === 'growth' && Boolean(planHistory.rows.find((row) => row.event_type === 'billing.plan_activated')),
    failedPaymentDidNotUpdatePlan: planAfterFailedPayment.body?.plan?.code === 'growth' && Boolean(planHistory.rows.find((row) => row.event_type === 'billing.payment_failed')),
    dbSubscriptionRowExists: subscriptionRow.rows.length === 1,
    billingLogsRecorded: auditRows.rows.length >= 4,
  },
  responses: {
    signup,
    checkout,
    invalidSignatureAttempt,
    checkoutCompleted,
    invoicePaid,
    planAfterPayment,
    subscriptionUpdated,
    invoiceFailed,
    planAfterFailedPayment,
    subscriptionDeleted,
    finalPlanState,
    billingSubscription,
  },
  database: {
    subscriptionRow: subscriptionRow.rows[0] ?? null,
    invoices: invoiceRows.rows,
    tenantPlan: planRows.rows[0] ?? null,
    webhookEvents: webhookRows.rows,
    auditLogEvents: auditRows.rows,
    planHistory: planHistory.rows,
  },
};

console.log(JSON.stringify(result, null, 2));