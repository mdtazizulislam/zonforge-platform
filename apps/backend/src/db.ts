import { Pool, Client } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✓ Connected to database.');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        stripe_customer_id VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        email_verified_at TIMESTAMPTZ,
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(128) NOT NULL,
        plan_code VARCHAR(64),
        billing_interval VARCHAR(20),
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        stripe_checkout_session_id VARCHAR(255),
        source VARCHAR(64) NOT NULL DEFAULT 'backend',
        message TEXT,
        payload_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        token_family UUID NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        rotated_from_id BIGINT REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL,
        revoked_at TIMESTAMPTZ,
        revoked_reason VARCHAR(64),
        last_used_at TIMESTAMPTZ,
        created_ip VARCHAR(128),
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(128) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_events (
        id BIGSERIAL PRIMARY KEY,
        to_email VARCHAR(255) NOT NULL,
        email_type VARCHAR(64) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        payload_json JSONB,
        provider_response TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversion_events (
        id BIGSERIAL PRIMARY KEY,
        event_name VARCHAR(64) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        session_id VARCHAR(128),
        source VARCHAR(64) NOT NULL DEFAULT 'backend',
        metadata_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGSERIAL PRIMARY KEY,
        event_name VARCHAR(128) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        page_path VARCHAR(512),
        source VARCHAR(64) NOT NULL DEFAULT 'web',
        metadata_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_requests (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        topic VARCHAR(120) NOT NULL,
        message TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS error_reports (
        id BIGSERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        page_path VARCHAR(512),
        stack TEXT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        metadata_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS security_alerts (
        id BIGSERIAL PRIMARY KEY,
        alert_id UUID NOT NULL UNIQUE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        title TEXT,
        description TEXT,
        severity VARCHAR(16) NOT NULL DEFAULT 'info',
        priority VARCHAR(8),
        status VARCHAR(32) NOT NULL DEFAULT 'open',
        affected_user_id VARCHAR(255),
        affected_ip VARCHAR(255),
        evidence_json JSONB,
        mitre_tactics_json JSONB,
        mitre_techniques_json JSONB,
        detection_gap_minutes INTEGER,
        mttd_sla_breached BOOLEAN NOT NULL DEFAULT false,
        assigned_to VARCHAR(255),
        recommended_actions_json JSONB,
        first_signal_time TIMESTAMPTZ,
        llm_narrative_json JSONB,
        llm_narrative_generated_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS connector_configs (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'configured',
        config_json JSONB,
        poll_interval_minutes INTEGER DEFAULT 15,
        last_poll_at TIMESTAMPTZ,
        last_event_at TIMESTAMPTZ,
        last_error_message TEXT,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        event_rate_per_hour INTEGER NOT NULL DEFAULT 0,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_investigations (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        alert_id VARCHAR(255) NOT NULL,
        alert_title TEXT,
        alert_severity VARCHAR(32),
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        verdict VARCHAR(64),
        confidence INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        executive_summary TEXT,
        detailed_report TEXT,
        recommendations_json JSONB,
        ioc_list_json JSONB,
        thoughts_json JSONB,
        evidence_json JSONB,
        total_steps INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        agent_model VARCHAR(255),
        review_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS title TEXT`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS priority VARCHAR(8)`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS affected_user_id VARCHAR(255)`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS affected_ip VARCHAR(255)`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS evidence_json JSONB`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS mitre_tactics_json JSONB`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS mitre_techniques_json JSONB`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS detection_gap_minutes INTEGER`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS mttd_sla_breached BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255)`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS recommended_actions_json JSONB`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS first_signal_time TIMESTAMPTZ`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS llm_narrative_json JSONB`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS llm_narrative_generated_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS name VARCHAR(255)`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS type VARCHAR(128)`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'configured'`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS config_json JSONB`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS poll_interval_minutes INTEGER DEFAULT 15`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS last_error_message TEXT`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS event_rate_per_hour INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS alert_id VARCHAR(255)`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS alert_title TEXT`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS alert_severity VARCHAR(32)`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'queued'`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS verdict VARCHAR(64)`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS confidence INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS summary TEXT`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS executive_summary TEXT`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS detailed_report TEXT`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS recommendations_json JSONB`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS ioc_list_json JSONB`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS thoughts_json JSONB`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS evidence_json JSONB`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS total_steps INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS duration_ms INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS agent_model VARCHAR(255)`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS review_notes TEXT`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE ai_investigations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

    await client.query(`CREATE INDEX IF NOT EXISTS ix_security_alerts_tenant ON security_alerts(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_security_alerts_status ON security_alerts(tenant_id, status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_connector_configs_tenant ON connector_configs(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_ai_investigations_tenant ON ai_investigations(tenant_id, created_at DESC)`);

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
    await client.query(`CREATE INDEX IF NOT EXISTS ix_billing_audit_logs_tenant ON billing_audit_logs(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_billing_audit_logs_event_type ON billing_audit_logs(event_type, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_user ON auth_refresh_tokens(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_family ON auth_refresh_tokens(token_family, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_email_events_type ON email_events(email_type, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_conversion_events_name ON conversion_events(event_name, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_analytics_events_name ON analytics_events(event_name, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_support_requests_status ON support_requests(status, created_at DESC)`);

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

    const planStripeConfig = [
      {
        code: 'growth',
        monthly: process.env.STRIPE_PRICE_ID_GROWTH ?? process.env.STRIPE_PRICE_ID ?? null,
        annual: process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL ?? null,
      },
      {
        code: 'business',
        monthly: process.env.STRIPE_PRICE_ID_BUSINESS ?? null,
        annual: process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL ?? null,
      },
      {
        code: 'enterprise',
        monthly: process.env.STRIPE_PRICE_ID_ENTERPRISE ?? null,
        annual: process.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL ?? null,
      },
      {
        code: 'mssp',
        monthly: process.env.STRIPE_PRICE_ID_MSSP ?? null,
        annual: process.env.STRIPE_PRICE_ID_MSSP_ANNUAL ?? null,
      },
    ];

    for (const config of planStripeConfig) {
      await client.query(
        `UPDATE plans
         SET stripe_monthly_price_id = COALESCE($1, stripe_monthly_price_id),
             stripe_annual_price_id = COALESCE($2, stripe_annual_price_id),
             updated_at = NOW()
         WHERE code = $3`,
        [config.monthly, config.annual, config.code],
      );
    }

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
