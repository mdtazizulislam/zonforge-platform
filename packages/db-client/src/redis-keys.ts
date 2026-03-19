/**
 * ─────────────────────────────────────────────────────────────────
 * ZonForge Sentinel — Redis Key Namespace Design
 * ─────────────────────────────────────────────────────────────────
 *
 * Pattern: zf:{tenant_id}:{domain}:{entity}:{key}
 *
 * Rules:
 *  1. Every key MUST start with zf:{tenant_id}: (isolation)
 *  2. Platform-level keys use zf:platform:
 *  3. TTL is mandatory on all keys — no persistent Redis keys
 *  4. JSON values use JSON.stringify (never nested Redis structures)
 * ─────────────────────────────────────────────────────────────────
 */

export const RedisKeys = {

  // ── Rate limiting ─────────────────────────────────────────────
  // TTL: 60 seconds (sliding window)
  rateLimit: (tenantId: string, endpoint: string, identifier: string) =>
    `zf:${tenantId}:ratelimit:${endpoint}:${identifier}`,

  // ── JWT revocation (jti blocklist) ───────────────────────────
  // TTL: same as token expiry
  jwtBlocklist: (jti: string) =>
    `zf:platform:jwt:blocklist:${jti}`,

  // ── API key lookup cache ──────────────────────────────────────
  // TTL: 5 minutes
  apiKeyCache: (keyPrefix: string) =>
    `zf:platform:apikey:${keyPrefix}`,

  // ── Tenant settings cache ─────────────────────────────────────
  // TTL: 10 minutes — invalidated on settings update
  tenantSettings: (tenantId: string) =>
    `zf:${tenantId}:settings`,

  // ── Tenant plan limits cache ──────────────────────────────────
  // TTL: 5 minutes
  tenantPlan: (tenantId: string) =>
    `zf:${tenantId}:plan`,

  // ── Event deduplication ───────────────────────────────────────
  // SET of event_ids — TTL: 24 hours
  eventDedup: (tenantId: string, connectorId: string) =>
    `zf:${tenantId}:dedup:${connectorId}`,

  // ── IOC hot cache (threat intel) ─────────────────────────────
  // HASH — key=ioc_value, value=JSON IOC record — TTL: 1 hour
  iocCache: (iocType: string) =>
    `zf:platform:ioc:${iocType}`,

  // ── Detection state window ────────────────────────────────────
  // SORTED SET by event_time — TTL: lookback window duration
  detectionWindow: (tenantId: string, ruleId: string, entityId: string) =>
    `zf:${tenantId}:detection:window:${ruleId}:${entityId}`,

  // ── Anomaly baseline cache ────────────────────────────────────
  // TTL: 4 hours (refreshed by baseline cron)
  anomalyBaseline: (tenantId: string, userId: string, metric: string) =>
    `zf:${tenantId}:anomaly:baseline:${userId}:${metric}`,

  // ── Alert deduplication ───────────────────────────────────────
  // TTL: 24 hours — prevents duplicate alerts for same finding
  alertDedup: (tenantId: string, findingId: string) =>
    `zf:${tenantId}:alert:dedup:${findingId}`,

  // ── Connector health state ────────────────────────────────────
  // TTL: 10 minutes
  connectorHealth: (tenantId: string, connectorId: string) =>
    `zf:${tenantId}:connector:health:${connectorId}`,

  // ── Connector last cursor state ───────────────────────────────
  // TTL: 7 days
  connectorCursor: (connectorId: string) =>
    `zf:platform:connector:cursor:${connectorId}`,

  // ── Ingestion rate counter ────────────────────────────────────
  // INCR counter — TTL: 60 seconds (sliding window per tenant)
  ingestionRate: (tenantId: string) =>
    `zf:${tenantId}:ingestion:rate:${Math.floor(Date.now() / 60000)}`,

  // ── Usage counters (for plan enforcement) ────────────────────
  // TTL: until end of billing period
  usageCounter: (tenantId: string, metric: 'events' | 'api_calls') =>
    `zf:${tenantId}:usage:${metric}:${new Date().toISOString().slice(0, 7)}`, // YYYY-MM

  // ── Risk score cache ──────────────────────────────────────────
  // TTL: 5 minutes (hot read path for dashboard)
  riskScore: (tenantId: string, entityType: string, entityId: string) =>
    `zf:${tenantId}:risk:${entityType}:${entityId}`,

  // ── Org posture cache ─────────────────────────────────────────
  // TTL: 5 minutes
  orgPosture: (tenantId: string) =>
    `zf:${tenantId}:posture`,

  // ── LLM narrative queue lock ──────────────────────────────────
  // TTL: 2 minutes (prevents duplicate LLM calls for same alert)
  llmNarrativeLock: (alertId: string) =>
    `zf:platform:llm:lock:${alertId}`,

  // ── Playbook approval state ───────────────────────────────────
  // TTL: 10 minutes (approval window)
  playbookApproval: (executionId: string) =>
    `zf:platform:playbook:approval:${executionId}`,

} as const

// TTL constants (seconds)
export const RedisTTL = {
  RATE_LIMIT:         60,
  JWT_BLOCKLIST:      900,       // 15 minutes (matches access token expiry)
  API_KEY_CACHE:      300,       // 5 minutes
  TENANT_SETTINGS:    600,       // 10 minutes
  TENANT_PLAN:        300,       // 5 minutes
  EVENT_DEDUP:        86400,     // 24 hours
  IOC_CACHE:          3600,      // 1 hour
  DETECTION_WINDOW:   7200,      // 2 hours
  ANOMALY_BASELINE:   14400,     // 4 hours
  ALERT_DEDUP:        86400,     // 24 hours
  CONNECTOR_HEALTH:   600,       // 10 minutes
  CONNECTOR_CURSOR:   604800,    // 7 days
  RISK_SCORE:         300,       // 5 minutes
  ORG_POSTURE:        300,       // 5 minutes
  LLM_LOCK:           120,       // 2 minutes
  PLAYBOOK_APPROVAL:  600,       // 10 minutes
} as const
