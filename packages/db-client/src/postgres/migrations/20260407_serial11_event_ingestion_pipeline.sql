CREATE TABLE IF NOT EXISTS connector_ingestion_tokens (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id BIGINT NOT NULL REFERENCES connector_configs(id) ON DELETE CASCADE,
  token_prefix VARCHAR(24) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  label VARCHAR(128) NOT NULL DEFAULT 'default',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_used_ip VARCHAR(128),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

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
);

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
);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_connector_ingestion_tokens_hash ON connector_ingestion_tokens(token_hash);
CREATE INDEX IF NOT EXISTS ix_connector_ingestion_tokens_connector ON connector_ingestion_tokens(connector_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_connector_ingestion_tokens_tenant ON connector_ingestion_tokens(tenant_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_request_logs_request ON ingestion_request_logs(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_request_logs_batch ON ingestion_request_logs(batch_id);
CREATE INDEX IF NOT EXISTS ix_ingestion_request_logs_tenant ON ingestion_request_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ingestion_request_logs_status ON ingestion_request_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_tenant ON raw_ingestion_events(tenant_id, received_at DESC);
CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_connector ON raw_ingestion_events(connector_id, received_at DESC);
CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_status ON raw_ingestion_events(status, received_at DESC);
CREATE INDEX IF NOT EXISTS ix_raw_ingestion_events_source_type ON raw_ingestion_events(source_type, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_raw_ingestion_events_batch_position ON raw_ingestion_events(batch_id, batch_index);
CREATE UNIQUE INDEX IF NOT EXISTS ux_raw_ingestion_events_source_event ON raw_ingestion_events(tenant_id, connector_id, source_type, source_event_id) WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_normalized_events_tenant_event_time ON normalized_events(tenant_id, event_time DESC);
CREATE INDEX IF NOT EXISTS ix_normalized_events_connector ON normalized_events(connector_id, event_time DESC);
CREATE INDEX IF NOT EXISTS ix_normalized_events_source_type ON normalized_events(source_type, event_time DESC);
CREATE INDEX IF NOT EXISTS ix_normalized_events_event_type ON normalized_events(canonical_event_type, event_time DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_normalized_events_raw_event ON normalized_events(raw_event_id) WHERE raw_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_failed_ingestion_events_tenant ON failed_ingestion_events(tenant_id, failed_at DESC);
CREATE INDEX IF NOT EXISTS ix_failed_ingestion_events_source_type ON failed_ingestion_events(source_type, failed_at DESC);