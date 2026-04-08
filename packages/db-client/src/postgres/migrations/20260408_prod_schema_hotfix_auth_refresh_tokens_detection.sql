ALTER TABLE auth_refresh_tokens
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES user_sessions(session_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_session
  ON auth_refresh_tokens(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS detections (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT REFERENCES detection_rules(id) ON DELETE SET NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connector_id BIGINT REFERENCES connector_configs(id) ON DELETE SET NULL,
  detection_key VARCHAR(128) NOT NULL UNIQUE,
  rule_key VARCHAR(64) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
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
);

CREATE TABLE IF NOT EXISTS detection_events (
  id BIGSERIAL PRIMARY KEY,
  detection_id BIGINT NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  normalized_event_id BIGINT REFERENCES normalized_events(id) ON DELETE SET NULL,
  ingestion_security_event_id BIGINT REFERENCES ingestion_security_events(id) ON DELETE SET NULL,
  event_kind VARCHAR(64) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  source_event_id VARCHAR(255),
  actor_email VARCHAR(255),
  actor_ip VARCHAR(128),
  target_resource VARCHAR(512),
  evidence_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_detections_detection_key
  ON detections(detection_key);

CREATE INDEX IF NOT EXISTS ix_detections_tenant_created
  ON detections(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_detections_tenant_rule
  ON detections(tenant_id, rule_key, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_detections_tenant_severity
  ON detections(tenant_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_detection_events_detection_created
  ON detection_events(detection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_detection_events_tenant_time
  ON detection_events(tenant_id, event_time DESC);

ALTER TABLE risk_scores
  ADD COLUMN IF NOT EXISTS top_factors_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE risk_scores
  ADD COLUMN IF NOT EXISTS signal_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE risk_scores
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;

ALTER TABLE risk_scores
  ADD COLUMN IF NOT EXISTS last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_risk_scores_tenant_entity
  ON risk_scores(tenant_id, entity_type, score DESC, entity_key ASC);

CREATE INDEX IF NOT EXISTS ix_risk_scores_tenant_calculated
  ON risk_scores(tenant_id, last_calculated_at DESC);