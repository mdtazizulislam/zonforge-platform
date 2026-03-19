import { createClient, type ClickHouseClient } from '@clickhouse/client'
import type { NormalizedEvent } from '@zonforge/event-schema'

// ─────────────────────────────────────────────
// ClickHouse Client
// ─────────────────────────────────────────────

let _client: ClickHouseClient | null = null

export interface ClickHouseConfig {
  host: string       // e.g. http://localhost:8123
  database: string
  username: string
  password: string
}

export function initClickHouse(config: ClickHouseConfig): ClickHouseClient {
  if (_client) return _client
  _client = createClient({
    host:     config.host,
    database: config.database,
    username: config.username,
    password: config.password,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
    },
    compression: { response: true, request: false },
    request_timeout: 30_000,
    max_open_connections: 20,
  })
  return _client
}

export function getClickHouse(): ClickHouseClient {
  if (!_client) throw new Error('ClickHouse not initialized. Call initClickHouse() first.')
  return _client
}

export async function closeClickHouse() {
  if (_client) {
    await _client.close()
    _client = null
  }
}

// ─────────────────────────────────────────────
// EVENT WRITER
// ─────────────────────────────────────────────

export async function insertEvents(events: NormalizedEvent[]): Promise<void> {
  const ch = getClickHouse()

  const rows = events.map(e => ({
    event_id:               e.eventId,
    tenant_id:              e.tenantId,
    connector_id:           e.connectorId,
    ocsf_class_uid:         e.ocsfClassUid,
    ocsf_category_uid:      e.ocsfCategoryUid,
    ocsf_activity_id:       e.ocsfActivityId,
    ocsf_severity_id:       e.ocsfSeverityId,
    schema_version:         e.schemaVersion,
    source_type:            e.sourceType,
    event_category:         e.eventCategory,
    event_action:           e.eventAction,
    outcome:                e.outcome,
    actor_user_id:          e.actorUserId,
    actor_user_email:       e.actorUserEmail,
    actor_user_name:        e.actorUserName,
    actor_user_type:        e.actorUserType,
    actor_ip:               e.actorIp,
    actor_ip_country:       e.actorIpCountry,
    actor_ip_city:          e.actorIpCity,
    actor_ip_is_vpn:        e.actorIpIsVpn,
    actor_ip_is_tor:        e.actorIpIsTor,
    actor_user_agent:       e.actorUserAgent,
    actor_device_id:        e.actorDeviceId,
    target_asset_id:        e.targetAssetId,
    target_resource:        e.targetResource,
    target_resource_type:   e.targetResourceType,
    threat_intel_matched:   e.threatIntelMatched,
    threat_intel_ioc_type:  e.threatIntelIocType,
    threat_intel_confidence: e.threatIntelConfidence,
    threat_intel_feed:      e.threatIntelFeedSource,
    event_time:             e.eventTime.toISOString().replace('T', ' ').replace('Z', ''),
    ingested_at:            e.ingestedAt.toISOString().replace('T', ' ').replace('Z', ''),
    raw_payload_ref:        e.rawPayloadRef,
    metadata:               JSON.stringify(e.metadata),
  }))

  await ch.insert({
    table: 'events',
    values: rows,
    format: 'JSONEachRow',
  })
}

// ─────────────────────────────────────────────
// QUERY HELPERS
// ─────────────────────────────────────────────

export async function queryEvents<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const ch = getClickHouse()
  const result = await ch.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  })
  return result.json<T[]>()
}

// Count events for a tenant in a time range
export async function countTenantEvents(
  tenantId: string,
  fromDate: Date,
  toDate: Date,
): Promise<number> {
  const rows = await queryEvents<{ cnt: string }>(
    `SELECT count() as cnt FROM events
     WHERE tenant_id = {tenantId:UUID}
       AND event_time BETWEEN {from:DateTime64} AND {to:DateTime64}`,
    {
      tenantId,
      from: fromDate.toISOString().replace('T', ' ').replace('Z', ''),
      to:   toDate.toISOString().replace('T', ' ').replace('Z', ''),
    }
  )
  return parseInt(rows[0]?.cnt ?? '0', 10)
}

// Get events for a user in time window (for detection queries)
export async function getUserEvents(
  tenantId: string,
  userId: string,
  fromDate: Date,
  eventActions?: string[],
): Promise<Record<string, unknown>[]> {
  const actionFilter = eventActions && eventActions.length > 0
    ? `AND event_action IN ({actions:Array(String)})`
    : ''

  return queryEvents(
    `SELECT event_id, event_time, event_action, outcome,
            actor_ip, actor_ip_country, actor_device_id,
            target_resource, metadata
     FROM events
     WHERE tenant_id = {tenantId:UUID}
       AND actor_user_id = {userId:UUID}
       AND event_time >= {from:DateTime64}
     ${actionFilter}
     ORDER BY event_time DESC
     LIMIT 500`,
    {
      tenantId,
      userId,
      from: fromDate.toISOString().replace('T', ' ').replace('Z', ''),
      ...(eventActions ? { actions: eventActions } : {}),
    }
  )
}
