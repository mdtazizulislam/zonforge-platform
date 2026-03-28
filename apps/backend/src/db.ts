import { Pool, Client } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('✓ PostgreSQL pool connection ready.');
});

pool.on('error', (error) => {
  console.error('✗ PostgreSQL pool error:', error);
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initDatabase() {
  const maxRetries = Number(process.env.DB_CONNECT_MAX_RETRIES || 5);
  const retryDelayMs = Number(process.env.DB_CONNECT_RETRY_MS || 2000);
  let client: Client | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    client = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      console.log(`DB connect attempt ${attempt}/${maxRetries}...`);
      await client.connect();
      console.log('✓ Connected to database.');
      break;
    } catch (error) {
      console.error(`✗ DB connect attempt ${attempt}/${maxRetries} failed:`, error);
      try {
        await client.end();
      } catch {
        // Ignore cleanup errors during retry.
      }

      if (attempt === maxRetries) {
        throw error;
      }

      await sleep(retryDelayMs);
    }
  }

  if (!client) {
    throw new Error('Database client not initialized.');
  }

  try {
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        stripe_customer_id VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        plan VARCHAR(50) DEFAULT 'starter',
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        plan VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        current_period_end TIMESTAMPTZ,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)
    `);

    await client.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ
    `);

    // ─── BILLING PLANS TABLE ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        stripe_monthly_price_id VARCHAR(255),
        stripe_annual_price_id VARCHAR(255),
        monthly_price_cents INTEGER DEFAULT 0,
        annual_price_cents INTEGER DEFAULT 0,
        max_users INTEGER,
        max_connectors INTEGER,
        max_events_per_month INTEGER,
        retention_days INTEGER NOT NULL DEFAULT 30,
        features_json JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── TENANT SUBSCRIPTIONS (TENANT-BASED BILLING) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL REFERENCES plans(id),
        stripe_customer_id VARCHAR(255) UNIQUE,
        stripe_subscription_id VARCHAR(255) UNIQUE,
        stripe_checkout_session_id VARCHAR(255),
        billing_interval VARCHAR(20) DEFAULT 'monthly',
        subscription_status VARCHAR(64) NOT NULL DEFAULT 'incomplete',
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        last_webhook_event_id VARCHAR(255),
        last_invoice_id VARCHAR(255),
        trial_start TIMESTAMPTZ,
        trial_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── USAGE COUNTERS (FOR QUOTA ENFORCEMENT) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_counters (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        metric_code VARCHAR(100) NOT NULL,
        metric VARCHAR(100),
        period_start TIMESTAMP NOT NULL,
        period_end TIMESTAMP NOT NULL,
        period VARCHAR(20),
        current_value INTEGER NOT NULL DEFAULT 0,
        value INTEGER NOT NULL DEFAULT 0,
        limit_value INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, metric_code, period_start, period_end)
      )
    `);

    await client.query(`
      ALTER TABLE usage_counters
      ADD COLUMN IF NOT EXISTS metric VARCHAR(100)
    `);

    await client.query(`
      ALTER TABLE usage_counters
      ADD COLUMN IF NOT EXISTS period VARCHAR(20)
    `);

    await client.query(`
      ALTER TABLE usage_counters
      ADD COLUMN IF NOT EXISTS value INTEGER NOT NULL DEFAULT 0
    `);

    // ─── BILLING WEBHOOK EVENTS (IDEMPOTENCY) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_webhook_events (
        event_id VARCHAR(255) PRIMARY KEY,
        event_type VARCHAR(128) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── LEGACY BILLING_SUBSCRIPTIONS (USER-BASED, FOR BACKWARD COMPAT) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id INTEGER NOT NULL REFERENCES users(id),
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        stripe_checkout_session_id VARCHAR(255),
        stripe_price_id VARCHAR(255),
        subscription_status VARCHAR(64) NOT NULL DEFAULT 'incomplete',
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        last_webhook_event_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ─── INDEXES ───
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_subscriptions_tenant
      ON tenant_subscriptions(tenant_id)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_subscriptions_stripe_customer
      ON tenant_subscriptions(stripe_customer_id)
      WHERE stripe_customer_id IS NOT NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_subscriptions_stripe_subscription
      ON tenant_subscriptions(stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_usage_counters_tenant
      ON usage_counters(tenant_id)
    `);

    // Legacy indexes
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_owner_user
      ON billing_subscriptions(owner_user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_users_email
      ON users(email)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_users_stripe_customer
      ON users(stripe_customer_id)
      WHERE stripe_customer_id IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_subscriptions_stripe_subscription
      ON subscriptions(stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_stripe_customer
      ON billing_subscriptions(stripe_customer_id)
      WHERE stripe_customer_id IS NOT NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_stripe_subscription
      ON billing_subscriptions(stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_checkout_session
      ON billing_subscriptions(stripe_checkout_session_id)
      WHERE stripe_checkout_session_id IS NOT NULL
    `);

    // ─── STRIPE CUSTOMERS EXPLICIT MAPPING TABLE (09.2) ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS stripe_customers (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_stripe_customers_tenant ON stripe_customers(tenant_id) WHERE tenant_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_stripe_customers_user ON stripe_customers(user_id) WHERE user_id IS NOT NULL`);

    // ─── BILLING WEBHOOK EVENTS ENHANCEMENTS (09.2) ───
    await client.query(`ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'processed'`);
    await client.query(`ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS error_message TEXT`);
    await client.query(`ALTER TABLE billing_webhook_events ADD COLUMN IF NOT EXISTS payload_json JSONB`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_billing_webhook_events_type ON billing_webhook_events(event_type)`);

    // ─── TENANT SUBSCRIPTIONS ENHANCEMENTS (09.2) ───
    await client.query(`ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)`);
    await client.query(`ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS raw_latest_event_json JSONB`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_tenant_subscriptions_status ON tenant_subscriptions(subscription_status)`);

    console.log('✓ Database tables created.');

    // ─── SEED PLANS ───
    await client.query(`
      INSERT INTO plans (code, name, description, monthly_price_cents, annual_price_cents, 
        max_users, max_connectors, max_events_per_month, retention_days, is_active)
      VALUES 
        ('starter', 'Starter', 'For small teams getting started', 0, 0, 
         50, 1, 21600000, 7, true),
        ('growth', 'Growth', 'For growing security teams', 29900, 24900,
         500, 5, 86400000, 90, true),
        ('business', 'Business', 'For enterprise security operations', 99900, 79900,
         2000, 20, 432000000, 180, true),
        ('enterprise', 'Enterprise', 'Contracted enterprise plan', 0, 0,
         NULL, NULL, NULL, 365, true)
      ON CONFLICT (code) DO NOTHING
    `);

    console.log('✓ Default plans seeded.');
    await client.end();
  } catch (error) {
    console.error('✗ Database initialization failed:', error);
    throw error;
  }
}

export function getPool() {
  return pool;
}

// ─── HELPER QUERIES ───

export async function getPlanByCode(code: string) {
  const result = await pool.query('SELECT * FROM plans WHERE code = $1 AND is_active = true', [code]);
  return result.rows[0] || null;
}

export async function getTenantSubscription(tenantId: number) {
  const result = await pool.query(
    `SELECT ts.*, p.code as plan_code, p.name as plan_name, p.max_users, p.max_connectors, 
            p.max_events_per_month, p.retention_days
     FROM tenant_subscriptions ts
     LEFT JOIN plans p ON ts.plan_id = p.id
     WHERE ts.tenant_id = $1`,
    [tenantId]
  );
  return result.rows[0] || null;
}

export async function getTenantByUserId(userId: number) {
  const result = await pool.query('SELECT * FROM tenants WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0] || null;
}

export async function getTenantById(tenantId: number) {
  const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  return result.rows[0] || null;
}
