-- ─────────────────────────────────────────────────────────────────
-- ZonForge Sentinel — ClickHouse Schema
-- Database: zonforge_events
-- Engine: ReplicatedMergeTree (use MergeTree for single-node dev)
-- ─────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS zonforge_events;

-- ─────────────────────────────────────────────────────────────────
-- MAIN EVENTS TABLE
-- Partition by tenant + month for efficient per-tenant queries
-- TTL enforced per plan tier (30/90/180/365 days)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zonforge_events.events (

    -- ── Identifiers ──────────────────────────────────────────────
    event_id          UUID         NOT NULL,
    tenant_id         UUID         NOT NULL,
    connector_id      UUID         NOT NULL,

    -- ── OCSF Classification ──────────────────────────────────────
    ocsf_class_uid       UInt16       NOT NULL DEFAULT 0,
    ocsf_category_uid    UInt16       NOT NULL DEFAULT 0,
    ocsf_activity_id     UInt8        NOT NULL DEFAULT 0,
    ocsf_severity_id     UInt8        NOT NULL DEFAULT 0,
    schema_version       UInt8        NOT NULL DEFAULT 1,

    -- ── Internal Classification ───────────────────────────────────
    source_type          LowCardinality(String)  NOT NULL,
    event_category       LowCardinality(String)  NOT NULL,
    event_action         String                  NOT NULL,
    outcome              LowCardinality(String)  NOT NULL DEFAULT 'unknown',

    -- ── Actor ─────────────────────────────────────────────────────
    actor_user_id        Nullable(UUID),
    actor_user_email     Nullable(String),
    actor_user_name      Nullable(String),
    actor_user_type      LowCardinality(String)  NOT NULL DEFAULT 'unknown',
    actor_ip             Nullable(IPv6),
    actor_ip_country     Nullable(LowCardinality(String)),
    actor_ip_city        Nullable(String),
    actor_ip_is_vpn      Nullable(Bool),
    actor_ip_is_tor      Nullable(Bool),
    actor_user_agent     Nullable(String),
    actor_device_id      Nullable(String),

    -- ── Target ────────────────────────────────────────────────────
    target_asset_id      Nullable(UUID),
    target_resource      Nullable(String),
    target_resource_type Nullable(LowCardinality(String)),

    -- ── Threat Intel Enrichment ───────────────────────────────────
    threat_intel_matched    Bool    NOT NULL DEFAULT false,
    threat_intel_ioc_type   Nullable(LowCardinality(String)),
    threat_intel_confidence Nullable(Float32),
    threat_intel_feed       Nullable(LowCardinality(String)),

    -- ── Timestamps ────────────────────────────────────────────────
    event_time      DateTime64(3, 'UTC')  NOT NULL,  -- vendor time (query key)
    ingested_at     DateTime64(3, 'UTC')  NOT NULL DEFAULT now64(),

    -- ── Raw Payload Reference ─────────────────────────────────────
    raw_payload_ref Nullable(String),   -- S3 key for encrypted raw payload

    -- ── Additional Metadata ───────────────────────────────────────
    metadata        String NOT NULL DEFAULT '{}'   -- JSON string

)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(event_time))
ORDER BY (tenant_id, event_time, event_id)
TTL event_time + toIntervalDay(365)   -- max retention; per-tenant TTL enforced by cleanup job
SETTINGS
    index_granularity = 8192,
    ttl_only_drop_parts = 1;


-- ─────────────────────────────────────────────────────────────────
-- DETECTION SIGNALS TABLE (analytics copy for correlation queries)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zonforge_events.detection_signals (

    signal_id           UUID         NOT NULL,
    tenant_id           UUID         NOT NULL,
    rule_id             Nullable(UUID),
    detection_type      LowCardinality(String) NOT NULL,
    entity_type         LowCardinality(String) NOT NULL,
    entity_id           String       NOT NULL,
    confidence          Float32      NOT NULL,
    severity            LowCardinality(String) NOT NULL,
    mitre_tactics       Array(String) NOT NULL DEFAULT [],
    mitre_techniques    Array(String) NOT NULL DEFAULT [],
    evidence_event_ids  Array(String) NOT NULL DEFAULT [],
    first_signal_time   DateTime64(3, 'UTC') NOT NULL,
    detected_at         DateTime64(3, 'UTC') NOT NULL DEFAULT now64(),
    correlated_finding_id Nullable(UUID),
    alert_id            Nullable(UUID),
    metadata            String NOT NULL DEFAULT '{}'

)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMM(detected_at))
ORDER BY (tenant_id, entity_id, detected_at)
TTL detected_at + toIntervalDay(90);


-- ─────────────────────────────────────────────────────────────────
-- USER ACTIVITY SUMMARY (pre-aggregated for anomaly baselines)
-- Materialized view updated on every event insert
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zonforge_events.user_activity_hourly (

    tenant_id        UUID        NOT NULL,
    actor_user_id    UUID        NOT NULL,
    hour_bucket      DateTime    NOT NULL,
    event_count      UInt32      NOT NULL DEFAULT 0,
    login_count      UInt16      NOT NULL DEFAULT 0,
    failed_login_count UInt16    NOT NULL DEFAULT 0,
    unique_ips       UInt16      NOT NULL DEFAULT 0,
    unique_countries UInt8       NOT NULL DEFAULT 0,
    unique_resources UInt16      NOT NULL DEFAULT 0,
    data_volume_mb   Float32     NOT NULL DEFAULT 0,
    api_call_count   UInt32      NOT NULL DEFAULT 0

)
ENGINE = SummingMergeTree()
PARTITION BY (tenant_id, toYYYYMM(hour_bucket))
ORDER BY (tenant_id, actor_user_id, hour_bucket)
TTL hour_bucket + toIntervalDay(90);


-- ─────────────────────────────────────────────────────────────────
-- CONNECTOR INGESTION METRICS (for pipeline monitoring)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zonforge_events.ingestion_metrics (

    tenant_id       UUID      NOT NULL,
    connector_id    UUID      NOT NULL,
    source_type     LowCardinality(String) NOT NULL,
    hour_bucket     DateTime  NOT NULL,
    event_count     UInt32    NOT NULL DEFAULT 0,
    error_count     UInt16    NOT NULL DEFAULT 0,
    dedup_count     UInt16    NOT NULL DEFAULT 0,
    lag_seconds_p95 Float32   NOT NULL DEFAULT 0

)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour_bucket)
ORDER BY (tenant_id, connector_id, hour_bucket)
TTL hour_bucket + toIntervalDay(30);


-- ─────────────────────────────────────────────────────────────────
-- USEFUL QUERIES (reference)
-- ─────────────────────────────────────────────────────────────────

-- Recent failed logins for tenant (last 24h):
-- SELECT actor_user_email, actor_ip, count() as fail_count
-- FROM zonforge_events.events
-- WHERE tenant_id = ? AND event_action = 'login_failed'
--   AND event_time > now() - INTERVAL 24 HOUR
-- GROUP BY actor_user_email, actor_ip
-- ORDER BY fail_count DESC

-- Impossible travel detection query:
-- SELECT e1.actor_user_id, e1.actor_ip_country as country1,
--        e2.actor_ip_country as country2,
--        dateDiff('minute', e1.event_time, e2.event_time) as gap_minutes
-- FROM zonforge_events.events e1
-- JOIN zonforge_events.events e2
--   ON e1.actor_user_id = e2.actor_user_id
--   AND e1.tenant_id = e2.tenant_id
-- WHERE e1.tenant_id = ?
--   AND e1.event_action = 'login_success'
--   AND e2.event_action = 'login_success'
--   AND e1.actor_ip_country != e2.actor_ip_country
--   AND dateDiff('minute', e1.event_time, e2.event_time) BETWEEN 0 AND 120
--   AND e1.event_time > now() - INTERVAL 7 DAY
