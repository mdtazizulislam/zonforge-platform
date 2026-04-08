import { Pool, Client } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export type UserWorkspaceContext = {
  user: {
    id: number;
    email: string;
    fullName: string | null;
    status: string | null;
    emailVerified: boolean;
  };
  tenant: {
    id: number;
    name: string;
    slug: string | null;
    plan: string | null;
    onboardingStatus: string | null;
    onboardingStartedAt: string | Date | null;
    onboardingCompletedAt: string | Date | null;
  };
  membership: {
    id: number;
    role: string;
  } | null;
};

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
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active'
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    await client.query(`
      UPDATE users
      SET email_verified = true
      WHERE email_verified_at IS NOT NULL AND email_verified = false
    `);

    await client.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS slug VARCHAR(255)
    `);

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(32) NOT NULL DEFAULT 'pending'
    `);

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    await client.query(`
      UPDATE tenants
      SET slug = CONCAT(
        TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(COALESCE(name, 'workspace')), '[^a-z0-9]+', '-', 'g')),
        '-',
        id
      )
      WHERE slug IS NULL OR slug = ''
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_slug
      ON tenants(slug)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(32) NOT NULL DEFAULT 'viewer',
        invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, user_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_tenant_memberships_user
      ON tenant_memberships(user_id, created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_tenant_memberships_tenant
      ON tenant_memberships(tenant_id, created_at DESC)
    `);

    await client.query(`
      ALTER TABLE tenant_memberships
      ALTER COLUMN role SET DEFAULT 'viewer'
    `);

    await client.query(`
      UPDATE tenant_memberships
      SET role = 'viewer', updated_at = NOW()
      WHERE LOWER(role) = 'member'
    `);

    await client.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id, role)
      SELECT t.id, t.user_id, 'owner'
      FROM tenants t
      LEFT JOIN tenant_memberships tm
        ON tm.tenant_id = t.id
       AND tm.user_id = t.user_id
      WHERE tm.id IS NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_invitations (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'viewer',
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        accepted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        revoked_reason VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      UPDATE tenant_invitations
      SET role = 'viewer', updated_at = NOW()
      WHERE LOWER(role) = 'member'
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_tenant_invitations_tenant
      ON tenant_invitations(tenant_id, created_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_tenant_invitations_email
      ON tenant_invitations(LOWER(email), created_at DESC)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_invitations_active_email
      ON tenant_invitations(tenant_id, LOWER(email))
      WHERE accepted_at IS NULL AND revoked_at IS NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_progress (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        step_key VARCHAR(64) NOT NULL,
        is_complete BOOLEAN NOT NULL DEFAULT false,
        payload_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, step_key)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_onboarding_progress_tenant
      ON onboarding_progress(tenant_id, updated_at DESC)
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
      CREATE TABLE IF NOT EXISTS user_sessions (
        id BIGSERIAL PRIMARY KEY,
        session_id UUID NOT NULL UNIQUE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_family UUID NOT NULL UNIQUE,
        created_ip VARCHAR(128),
        last_ip VARCHAR(128),
        user_agent TEXT,
        device_type VARCHAR(32) NOT NULL DEFAULT 'desktop',
        browser VARCHAR(64) NOT NULL DEFAULT 'Unknown',
        operating_system VARCHAR(64) NOT NULL DEFAULT 'Unknown',
        mfa_required BOOLEAN NOT NULL DEFAULT false,
        mfa_verified_at TIMESTAMPTZ,
        step_up_verified_at TIMESTAMPTZ,
        step_up_method VARCHAR(32),
        step_up_expires_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        revoked_reason VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_events (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        session_id UUID REFERENCES user_sessions(session_id) ON DELETE SET NULL,
        event_type VARCHAR(64) NOT NULL,
        ip_address VARCHAR(128),
        user_agent TEXT,
        error_code VARCHAR(64),
        metadata_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS mfa_enrollments (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        method VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        secret_ciphertext TEXT,
        recovery_codes_ciphertext TEXT,
        enrolled_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES user_sessions(session_id) ON DELETE SET NULL,
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

    await client.query(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS step_up_verified_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS step_up_method VARCHAR(32)`);
    await client.query(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS step_up_expires_at TIMESTAMPTZ`);

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
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        config_json JSONB,
        secret_ciphertext TEXT,
        secret_storage_provider VARCHAR(64),
        secret_reference VARCHAR(255),
        secret_fingerprint VARCHAR(128),
        secret_key_version INTEGER NOT NULL DEFAULT 1,
        secret_last_rotated_at TIMESTAMPTZ,
        secret_rotation_count INTEGER NOT NULL DEFAULT 0,
        poll_interval_minutes INTEGER DEFAULT 15,
        last_poll_at TIMESTAMPTZ,
        last_event_at TIMESTAMPTZ,
        last_validated_at TIMESTAMPTZ,
        last_error_message TEXT,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        event_rate_per_hour INTEGER NOT NULL DEFAULT 0,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS connector_ingestion_tokens (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id BIGINT NOT NULL REFERENCES connector_configs(id) ON DELETE CASCADE,
        token_prefix VARCHAR(24) NOT NULL,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        label VARCHAR(128) NOT NULL DEFAULT 'default',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        last_used_ip VARCHAR(128),
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ingestion_request_logs (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL,
        request_id VARCHAR(128) NOT NULL,
        batch_id VARCHAR(128) NOT NULL,
        source_type VARCHAR(64) NOT NULL,
        accepted_count INTEGER NOT NULL DEFAULT 0,
        rejected_count INTEGER NOT NULL DEFAULT 0,
        payload_bytes INTEGER NOT NULL DEFAULT 0,
        queue_job_id VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(request_id),
        UNIQUE(batch_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ingestion_security_events (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL,
        token_id BIGINT REFERENCES connector_ingestion_tokens(id) ON DELETE SET NULL,
        request_id VARCHAR(128),
        source_type VARCHAR(64),
        event_type VARCHAR(64) NOT NULL,
        client_ip VARCHAR(128),
        token_prefix VARCHAR(24),
        reason_code VARCHAR(64),
        metadata_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS raw_ingestion_events (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL,
        request_id VARCHAR(128) NOT NULL,
        batch_id VARCHAR(128) NOT NULL,
        batch_index INTEGER NOT NULL,
        source_type VARCHAR(64) NOT NULL,
        source_event_id VARCHAR(255),
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload_json JSONB NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        processed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(batch_id, batch_index)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS normalized_events (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL,
        source_type VARCHAR(64) NOT NULL,
        canonical_event_type VARCHAR(128) NOT NULL,
        actor_email VARCHAR(255),
        actor_ip VARCHAR(128),
        target_resource VARCHAR(512),
        event_time TIMESTAMPTZ NOT NULL,
        ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        severity VARCHAR(32),
        raw_event_id BIGINT REFERENCES raw_ingestion_events(id) ON DELETE SET NULL,
        source_event_id VARCHAR(255),
        normalized_payload_json JSONB NOT NULL,
        UNIQUE(raw_event_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS detection_rules (
        id BIGSERIAL PRIMARY KEY,
        rule_key VARCHAR(64) NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        severity VARCHAR(32) NOT NULL,
        mitre_tactic VARCHAR(128) NOT NULL,
        mitre_technique VARCHAR(128) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS detection_findings (
        id BIGSERIAL PRIMARY KEY,
        rule_id BIGINT REFERENCES detection_rules(id) ON DELETE SET NULL,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL,
        finding_key VARCHAR(128) NOT NULL UNIQUE,
        rule_key VARCHAR(64) NOT NULL,
        severity VARCHAR(32) NOT NULL,
        title TEXT NOT NULL,
        explanation TEXT NOT NULL,
        mitre_tactic VARCHAR(128) NOT NULL,
        mitre_technique VARCHAR(128) NOT NULL,
        source_type VARCHAR(64),
        first_event_at TIMESTAMPTZ NOT NULL,
        last_event_at TIMESTAMPTZ NOT NULL,
        event_count INTEGER NOT NULL DEFAULT 1,
        evidence_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rule_key VARCHAR(64) NOT NULL,
        grouping_key VARCHAR(128) NOT NULL,
        principal_type VARCHAR(32) NOT NULL,
        principal_key VARCHAR(255) NOT NULL,
        title TEXT,
        description TEXT,
        severity VARCHAR(32) NOT NULL,
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
        assigned_at TIMESTAMPTZ,
        recommended_actions_json JSONB,
        first_signal_time TIMESTAMPTZ,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        finding_count INTEGER NOT NULL DEFAULT 1,
        llm_narrative_json JSONB,
        llm_narrative_generated_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_findings (
        id BIGSERIAL PRIMARY KEY,
        alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
        finding_id BIGINT NOT NULL REFERENCES detection_findings(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_events (
        id BIGSERIAL PRIMARY KEY,
        alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_type VARCHAR(64) NOT NULL,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        previous_status VARCHAR(32),
        new_status VARCHAR(32),
        payload_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS risk_scores (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entity_type VARCHAR(16) NOT NULL,
        entity_key VARCHAR(512) NOT NULL,
        entity_label VARCHAR(512) NOT NULL,
        score INTEGER NOT NULL,
        score_band VARCHAR(32) NOT NULL,
        top_factors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        signal_count INTEGER NOT NULL DEFAULT 0,
        last_event_at TIMESTAMPTZ,
        last_calculated_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, entity_type, entity_key)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS failed_ingestion_events (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL,
        raw_event_id BIGINT REFERENCES raw_ingestion_events(id) ON DELETE SET NULL,
        request_id VARCHAR(128),
        batch_id VARCHAR(128),
        source_type VARCHAR(64) NOT NULL,
        payload_json JSONB NOT NULL,
        error_message TEXT NOT NULL,
        failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        retry_count INTEGER NOT NULL DEFAULT 0
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
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending'`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS config_json JSONB`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS secret_ciphertext TEXT`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS secret_storage_provider VARCHAR(64)`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS secret_reference VARCHAR(255)`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS secret_fingerprint VARCHAR(128)`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS secret_key_version INTEGER NOT NULL DEFAULT 1`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS secret_last_rotated_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS secret_rotation_count INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS poll_interval_minutes INTEGER DEFAULT 15`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS last_error_message TEXT`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS event_rate_per_hour INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE connector_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE connector_configs ALTER COLUMN status SET DEFAULT 'pending'`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS connector_id BIGINT REFERENCES connector_configs(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS token_prefix VARCHAR(24)`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS token_hash VARCHAR(128)`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS label VARCHAR(128) NOT NULL DEFAULT 'default'`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active'`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS last_used_ip VARCHAR(128)`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE connector_ingestion_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`UPDATE connector_ingestion_tokens SET rotated_at = COALESCE(rotated_at, created_at, NOW()) WHERE rotated_at IS NULL`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(128)`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS batch_id VARCHAR(128)`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS source_type VARCHAR(64)`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS accepted_count INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS rejected_count INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS payload_bytes INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS queue_job_id VARCHAR(128)`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'queued'`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS error_message TEXT`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE ingestion_request_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS token_id BIGINT REFERENCES connector_ingestion_tokens(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS request_id VARCHAR(128)`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS source_type VARCHAR(64)`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(64)`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS client_ip VARCHAR(128)`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS token_prefix VARCHAR(24)`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS reason_code VARCHAR(64)`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS metadata_json JSONB`);
    await client.query(`ALTER TABLE ingestion_security_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS request_id VARCHAR(128)`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS batch_id VARCHAR(128)`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS batch_index INTEGER`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS source_type VARCHAR(64)`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(255)`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS payload_json JSONB`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'queued'`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS error_message TEXT`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE raw_ingestion_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS source_type VARCHAR(64)`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS canonical_event_type VARCHAR(128)`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS actor_email VARCHAR(255)`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS actor_ip VARCHAR(128)`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS target_resource VARCHAR(512)`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS event_time TIMESTAMPTZ`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS severity VARCHAR(32)`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS raw_event_id BIGINT REFERENCES raw_ingestion_events(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(255)`);
    await client.query(`ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS normalized_payload_json JSONB`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS rule_key VARCHAR(64)`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS title TEXT`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS severity VARCHAR(32)`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS mitre_tactic VARCHAR(128)`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS mitre_technique VARCHAR(128)`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE detection_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS rule_id BIGINT REFERENCES detection_rules(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS finding_key VARCHAR(128)`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS rule_key VARCHAR(64)`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS severity VARCHAR(32)`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS title TEXT`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS explanation TEXT`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS mitre_tactic VARCHAR(128)`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS mitre_technique VARCHAR(128)`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS source_type VARCHAR(64)`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS first_event_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS event_count INTEGER NOT NULL DEFAULT 1`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS evidence_json JSONB`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE detection_findings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS raw_event_id BIGINT REFERENCES raw_ingestion_events(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS request_id VARCHAR(128)`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS batch_id VARCHAR(128)`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS source_type VARCHAR(64)`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS payload_json JSONB`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS error_message TEXT`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await client.query(`ALTER TABLE failed_ingestion_events ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0`);
    await client.query(`
      UPDATE connector_configs
      SET status = CASE
        WHEN is_enabled = false THEN 'disabled'
        WHEN LOWER(COALESCE(status, '')) IN ('active', 'degraded', 'connected') THEN 'connected'
        WHEN LOWER(COALESCE(status, '')) IN ('error', 'failed') THEN 'failed'
        WHEN LOWER(COALESCE(status, '')) IN ('paused', 'disabled') THEN 'disabled'
        ELSE 'pending'
      END
      WHERE status IS NULL
         OR LOWER(COALESCE(status, '')) IN ('configured', 'pending_auth', 'active', 'degraded', 'error', 'paused', 'connected', 'failed', 'disabled')
    `);

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
    await client.query(`CREATE INDEX IF NOT EXISTS ix_connector_configs_type_status ON connector_configs(tenant_id, type, status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_ai_investigations_tenant ON ai_investigations(tenant_id, created_at DESC)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_connector_ingestion_tokens_hash ON connector_ingestion_tokens(token_hash)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_connector_ingestion_tokens_connector ON connector_ingestion_tokens(connector_id, status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_connector_ingestion_tokens_tenant ON connector_ingestion_tokens(tenant_id, status, created_at DESC)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_request_logs_request ON ingestion_request_logs(request_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_request_logs_batch ON ingestion_request_logs(batch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_ingestion_request_logs_tenant ON ingestion_request_logs(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_ingestion_request_logs_status ON ingestion_request_logs(status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_ingestion_security_events_created ON ingestion_security_events(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_ingestion_security_events_tenant_type ON ingestion_security_events(tenant_id, event_type, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_ingestion_security_events_connector ON ingestion_security_events(connector_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_tenant ON raw_ingestion_events(tenant_id, received_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_connector ON raw_ingestion_events(connector_id, received_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_status ON raw_ingestion_events(status, received_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_source_type ON raw_ingestion_events(source_type, received_at DESC)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_raw_ingestion_events_batch_position ON raw_ingestion_events(batch_id, batch_index)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_raw_ingestion_events_source_event ON raw_ingestion_events(tenant_id, connector_id, source_type, source_event_id) WHERE source_event_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_normalized_events_tenant_event_time ON normalized_events(tenant_id, event_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_normalized_events_connector ON normalized_events(connector_id, event_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_normalized_events_source_type ON normalized_events(source_type, event_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_normalized_events_event_type ON normalized_events(canonical_event_type, event_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_normalized_events_actor_email ON normalized_events(tenant_id, actor_email, event_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_normalized_events_actor_ip ON normalized_events(tenant_id, actor_ip, event_time DESC)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_normalized_events_raw_event ON normalized_events(raw_event_id) WHERE raw_event_id IS NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_detection_rules_rule_key ON detection_rules(rule_key)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_detection_findings_finding_key ON detection_findings(finding_key)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_detection_findings_tenant_created ON detection_findings(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_detection_findings_tenant_rule ON detection_findings(tenant_id, rule_key, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_detection_findings_tenant_severity ON detection_findings(tenant_id, severity, created_at DESC)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_alerts_grouping_key ON alerts(tenant_id, grouping_key, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_alerts_tenant_created ON alerts(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_alerts_tenant_status ON alerts(tenant_id, status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_alerts_tenant_grouping_window ON alerts(tenant_id, rule_key, principal_key, last_seen_at DESC)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_findings_finding ON alert_findings(finding_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_findings_pair ON alert_findings(alert_id, finding_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_alert_findings_alert ON alert_findings(alert_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_alert_events_alert ON alert_events(alert_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_alert_events_tenant_type ON alert_events(tenant_id, event_type, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_risk_scores_tenant_entity ON risk_scores(tenant_id, entity_type, score DESC, entity_key ASC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_risk_scores_tenant_calculated ON risk_scores(tenant_id, last_calculated_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_failed_ingestion_events_tenant ON failed_ingestion_events(tenant_id, failed_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_failed_ingestion_events_source_type ON failed_ingestion_events(source_type, failed_at DESC)`);

    await client.query(`
      INSERT INTO detection_rules (
        rule_key,
        title,
        description,
        severity,
        mitre_tactic,
        mitre_technique,
        enabled,
        created_at,
        updated_at
      ) VALUES
        ('suspicious_login', 'Suspicious login', 'Successful sign-in from an IP that differs from recent tenant-scoped successful activity for the same identity.', 'medium', 'Initial Access', 'T1078 Valid Accounts', TRUE, NOW(), NOW()),
        ('brute_force', 'Brute force', 'Repeated sign-in failures for the same tenant-scoped identity or IP inside a bounded time window.', 'high', 'Credential Access', 'T1110 Brute Force', TRUE, NOW(), NOW()),
        ('privilege_escalation', 'Privilege escalation', 'Privilege or role change activity that may expand administrative access.', 'high', 'Privilege Escalation', 'T1098 Account Manipulation', TRUE, NOW(), NOW())
      ON CONFLICT (rule_key) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          severity = EXCLUDED.severity,
          mitre_tactic = EXCLUDED.mitre_tactic,
          mitre_technique = EXCLUDED.mitre_technique,
          enabled = EXCLUDED.enabled,
          updated_at = NOW()
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
    await client.query(`CREATE INDEX IF NOT EXISTS ix_billing_audit_logs_tenant ON billing_audit_logs(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_billing_audit_logs_event_type ON billing_audit_logs(event_type, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_user_sessions_user ON user_sessions(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_user_sessions_tenant ON user_sessions(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_user_sessions_active ON user_sessions(user_id, tenant_id, revoked_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_events_tenant ON auth_events(tenant_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_events_user ON auth_events(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_events_type ON auth_events(event_type, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_user ON auth_refresh_tokens(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_family ON auth_refresh_tokens(token_family, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_session ON auth_refresh_tokens(session_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_mfa_enrollments_user ON mfa_enrollments(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ix_mfa_enrollments_tenant ON mfa_enrollments(tenant_id, created_at DESC)`);
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
  const context = await getUserWorkspaceContext(userId);
  if (context?.tenant) {
    return {
      id: context.tenant.id,
      name: context.tenant.name,
      slug: context.tenant.slug,
      plan: context.tenant.plan,
      onboarding_status: context.tenant.onboardingStatus,
    };
  }

  const result = await pool.query('SELECT * FROM tenants WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0] || null;
}

export async function getTenantById(tenantId: number) {
  const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  return result.rows[0] || null;
}

export async function getUserWorkspaceContext(userId: number): Promise<UserWorkspaceContext | null> {
  const membershipResult = await pool.query(
    `SELECT
       u.id AS user_id,
       u.email,
       u.full_name,
       u.status AS user_status,
       COALESCE(u.email_verified, u.email_verified_at IS NOT NULL, false) AS email_verified,
       t.id AS tenant_id,
       t.name AS tenant_name,
       t.slug AS tenant_slug,
       t.plan AS tenant_plan,
       t.onboarding_status,
       t.onboarding_started_at,
       t.onboarding_completed_at,
       tm.id AS membership_id,
       tm.role AS membership_role
     FROM users u
     JOIN tenant_memberships tm ON tm.user_id = u.id
     JOIN tenants t ON t.id = tm.tenant_id
     WHERE u.id = $1
     ORDER BY tm.created_at ASC, tm.id ASC
     LIMIT 1`,
    [userId],
  );

  const membershipRow = membershipResult.rows[0] as {
    user_id?: number;
    email?: string;
    full_name?: string | null;
    user_status?: string | null;
    email_verified?: boolean;
    tenant_id?: number;
    tenant_name?: string;
    tenant_slug?: string | null;
    tenant_plan?: string | null;
    onboarding_status?: string | null;
    onboarding_started_at?: string | Date | null;
    onboarding_completed_at?: string | Date | null;
    membership_id?: number;
    membership_role?: string | null;
  } | undefined;

  if (membershipRow?.tenant_id && membershipRow.email && membershipRow.tenant_name) {
    return {
      user: {
        id: Number(membershipRow.user_id),
        email: membershipRow.email,
        fullName: membershipRow.full_name ?? null,
        status: membershipRow.user_status ?? null,
        emailVerified: Boolean(membershipRow.email_verified),
      },
      tenant: {
        id: Number(membershipRow.tenant_id),
        name: membershipRow.tenant_name,
        slug: membershipRow.tenant_slug ?? null,
        plan: membershipRow.tenant_plan ?? null,
        onboardingStatus: membershipRow.onboarding_status ?? null,
        onboardingStartedAt: membershipRow.onboarding_started_at ?? null,
        onboardingCompletedAt: membershipRow.onboarding_completed_at ?? null,
      },
      membership: membershipRow.membership_id
        ? {
            id: Number(membershipRow.membership_id),
            role: membershipRow.membership_role ?? 'member',
          }
        : null,
    };
  }

  const legacyResult = await pool.query(
    `SELECT
       u.id AS user_id,
       u.email,
       u.full_name,
       u.status AS user_status,
       COALESCE(u.email_verified, u.email_verified_at IS NOT NULL, false) AS email_verified,
       t.id AS tenant_id,
       t.name AS tenant_name,
       t.slug AS tenant_slug,
       t.plan AS tenant_plan,
       t.onboarding_status,
       t.onboarding_started_at,
       t.onboarding_completed_at
     FROM users u
     LEFT JOIN tenants t ON t.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );

  const legacyRow = legacyResult.rows[0] as {
    user_id?: number;
    email?: string;
    full_name?: string | null;
    user_status?: string | null;
    email_verified?: boolean;
    tenant_id?: number;
    tenant_name?: string;
    tenant_slug?: string | null;
    tenant_plan?: string | null;
    onboarding_status?: string | null;
    onboarding_started_at?: string | Date | null;
    onboarding_completed_at?: string | Date | null;
  } | undefined;

  if (!legacyRow?.tenant_id || !legacyRow.email || !legacyRow.tenant_name) {
    return null;
  }

  return {
    user: {
      id: Number(legacyRow.user_id),
      email: legacyRow.email,
      fullName: legacyRow.full_name ?? null,
      status: legacyRow.user_status ?? null,
      emailVerified: Boolean(legacyRow.email_verified),
    },
    tenant: {
      id: Number(legacyRow.tenant_id),
      name: legacyRow.tenant_name,
      slug: legacyRow.tenant_slug ?? null,
      plan: legacyRow.tenant_plan ?? null,
      onboardingStatus: legacyRow.onboarding_status ?? null,
      onboardingStartedAt: legacyRow.onboarding_started_at ?? null,
      onboardingCompletedAt: legacyRow.onboarding_completed_at ?? null,
    },
    membership: null,
  };
}
