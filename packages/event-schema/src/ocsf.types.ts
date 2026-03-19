import { z } from 'zod'

// ─────────────────────────────────────────────
// OCSF — Open Cybersecurity Schema Framework
// https://schema.ocsf.io
// ─────────────────────────────────────────────

// OCSF Class UIDs used by ZonForge Sentinel
export const OCSF_CLASSES = {
  AUTHENTICATION:        3002,
  ACCOUNT_CHANGE:        3001,
  API_ACTIVITY:          6003,
  NETWORK_ACTIVITY:      4001,
  FILE_SYSTEM_ACTIVITY:  1001,
  PROCESS_ACTIVITY:      1007,
  DNS_ACTIVITY:          4003,
  SCHEDULED_JOB_ACTIVITY:1006,
  SECURITY_FINDING:      2001,
  VULNERABILITY_FINDING: 2002,
  CONFIG_STATE_CHANGE:   5001,
} as const
export type OcsfClassUid = typeof OCSF_CLASSES[keyof typeof OCSF_CLASSES]

// OCSF Category UIDs
export const OCSF_CATEGORIES = {
  SYSTEM_ACTIVITY:       1,
  FINDINGS:              2,
  IDENTITY_ACCESS:       3,
  NETWORK_ACTIVITY:      4,
  DISCOVERY:             5,
  APPLICATION_ACTIVITY:  6,
} as const

// OCSF Severity ID mapping
export const OCSF_SEVERITY = {
  UNKNOWN:    0,
  INFORMATIONAL: 1,
  LOW:        2,
  MEDIUM:     3,
  HIGH:       4,
  CRITICAL:   5,
  FATAL:      6,
} as const

// OCSF Activity IDs for Authentication class
export const OCSF_AUTH_ACTIVITY = {
  UNKNOWN:    0,
  LOGON:      1,
  LOGOFF:     2,
  AUTHENTICATION_TICKET: 3,
  SERVICE_TICKET_REQUEST: 4,
  SERVICE_TICKET_RENEW: 5,
} as const

// OCSF Status IDs
export const OCSF_STATUS = {
  UNKNOWN:   0,
  SUCCESS:   1,
  FAILURE:   2,
  OTHER:     99,
} as const

// ─────────────────────────────────────────────
// NORMALIZED EVENT SCHEMA (OCSF-aligned)
// This is the canonical internal event format
// stored in ClickHouse after normalization
// ─────────────────────────────────────────────

export const NormalizedEventSchema = z.object({
  // ── Identifiers ──────────────────────────
  eventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  connectorId: z.string().uuid(),

  // ── OCSF Classification ───────────────────
  ocsfClassUid: z.number().int(),
  ocsfCategoryUid: z.number().int(),
  ocsfActivityId: z.number().int().default(0),
  ocsfSeverityId: z.number().int().default(0),
  schemaVersion: z.number().int().default(1),

  // ── Internal Classification ───────────────
  sourceType: z.string(),           // e.g. "m365_entra"
  eventCategory: z.string(),        // e.g. "authentication"
  eventAction: z.string(),          // e.g. "login_success"
  outcome: z.enum(['success', 'failure', 'unknown']),

  // ── Actor ─────────────────────────────────
  actorUserId: z.string().uuid().nullable(),
  actorUserEmail: z.string().email().nullable(),
  actorUserName: z.string().nullable(),
  actorUserType: z.enum(['user', 'admin', 'service_account', 'system', 'unknown']).default('unknown'),
  actorIp: z.string().nullable(),
  actorIpCountry: z.string().nullable(),
  actorIpCity: z.string().nullable(),
  actorIpIsVpn: z.boolean().nullable(),
  actorIpIsTor: z.boolean().nullable(),
  actorUserAgent: z.string().nullable(),
  actorDeviceId: z.string().nullable(),

  // ── Target ────────────────────────────────
  targetAssetId: z.string().uuid().nullable(),
  targetResource: z.string().nullable(),
  targetResourceType: z.string().nullable(),

  // ── Threat Intel Enrichment ───────────────
  threatIntelMatched: z.boolean().default(false),
  threatIntelIocType: z.string().nullable(),
  threatIntelConfidence: z.number().min(0).max(1).nullable(),
  threatIntelFeedSource: z.string().nullable(),

  // ── Timestamps ────────────────────────────
  eventTime: z.date(),              // vendor-reported — use for all queries
  ingestedAt: z.date(),             // platform ingestion time

  // ── Raw Payload Reference ─────────────────
  rawPayloadRef: z.string().nullable(), // S3 key for encrypted raw payload

  // ── Additional Fields ────────────────────
  metadata: z.record(z.unknown()).default({}),
})
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>

// Raw event before normalization (from collector)
export const RawEventSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  connectorId: z.string().uuid(),
  sourceType: z.string(),
  receivedAt: z.date(),
  payload: z.record(z.unknown()),   // raw vendor payload
  schemaHint: z.string().optional(),
})
export type RawEvent = z.infer<typeof RawEventSchema>

// Ingestion batch (what collectors send)
export const IngestionBatchSchema = z.object({
  tenantId: z.string().uuid(),
  connectorId: z.string().uuid(),
  sourceType: z.string(),
  events: z.array(z.record(z.unknown())).min(1).max(1000),
  batchId: z.string().uuid(),
  collectedAt: z.date(),
})
export type IngestionBatch = z.infer<typeof IngestionBatchSchema>
