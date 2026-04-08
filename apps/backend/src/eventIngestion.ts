import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Hono } from 'hono';
import { Queue, QueueEvents, Worker, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { getPool } from './db.js';
import { evaluateDetectionsForNormalizedEvent } from './detectionEngine.js';
import { type TenantMembershipRole } from './auth.js';
import {
  requireRole as sharedRequireRole,
  requireStepUpAuth,
  requireTenantContext,
  type TenantAccess,
} from './authz.js';
import { getClientIp, getRequestId, sendError } from './security.js';

const INGESTION_QUEUE_NAME = 'zf-ingestion-events';
const EVENT_READ_ROLES: TenantMembershipRole[] = ['owner', 'admin', 'analyst', 'viewer'];
const TOKEN_MANAGER_ROLES: TenantMembershipRole[] = ['owner', 'admin'];
const SOURCE_TYPE_ALIASES: Record<string, CanonicalSourceType> = {
  aws: 'aws',
  microsoft365: 'microsoft365',
  microsoft_365: 'microsoft365',
  m365: 'microsoft365',
  google_workspace: 'google_workspace',
  googleworkspace: 'google_workspace',
  google: 'google_workspace',
};

const MAX_BATCH_SIZE = Math.max(1, Number(process.env.ZONFORGE_INGESTION_MAX_BATCH_SIZE ?? 100));
const MAX_PAYLOAD_BYTES = Math.max(1024, Number(process.env.ZONFORGE_INGESTION_MAX_PAYLOAD_BYTES ?? 512_000));
const MAX_EVENT_QUERY_LIMIT = Math.max(1, Number(process.env.ZONFORGE_EVENTS_QUERY_LIMIT ?? 100));
const INGESTION_RATE_LIMIT = Math.max(1, Number(process.env.ZONFORGE_INGESTION_RATE_LIMIT ?? 120));
const INGESTION_IP_RATE_LIMIT = Math.max(1, Number(process.env.ZONFORGE_INGESTION_IP_RATE_LIMIT ?? 240));
const INGESTION_RATE_WINDOW_MS = Math.max(1_000, Number(process.env.ZONFORGE_INGESTION_RATE_WINDOW_MS ?? 60_000));
const INGESTION_QUEUE_MAX_PENDING_JOBS = Math.max(1, Number(process.env.ZONFORGE_INGESTION_QUEUE_MAX_PENDING_JOBS ?? 1000));
const INGESTION_QUEUE_MAX_ACTIVE_JOBS = Math.max(1, Number(process.env.ZONFORGE_INGESTION_QUEUE_MAX_ACTIVE_JOBS ?? 250));
const INGESTION_ANOMALY_BATCH_RATIO = Math.min(1, Math.max(0.1, Number(process.env.ZONFORGE_INGESTION_ANOMALY_BATCH_RATIO ?? 0.8)));
const INGESTION_ANOMALY_PAYLOAD_RATIO = Math.min(1, Math.max(0.1, Number(process.env.ZONFORGE_INGESTION_ANOMALY_PAYLOAD_RATIO ?? 0.8)));
const INGESTION_ANOMALY_REJECTION_RATIO = Math.min(1, Math.max(0.1, Number(process.env.ZONFORGE_INGESTION_ANOMALY_REJECTION_RATIO ?? 0.5)));

const MAX_SOURCE_EVENT_ID_LENGTH = 255;
const MAX_EVENT_TYPE_LENGTH = 128;
const MAX_EMAIL_LENGTH = 255;
const MAX_IP_LENGTH = 128;
const MAX_TARGET_RESOURCE_LENGTH = 512;

type CanonicalSourceType = 'aws' | 'microsoft365' | 'google_workspace';
type IngestionSecurityEventType = 'rate_limited' | 'replay_detected' | 'anomaly_detected';

type IngestionTokenRecord = {
  token_id: number;
  tenant_id: number;
  connector_id: number;
  connector_name: string;
  connector_type: string;
  connector_enabled: boolean;
  token_prefix: string;
  token_status: string;
  token_expires_at: string | Date | null;
};

type IngestionEventInput = {
  requestIndex: number;
  eventId: string | null;
  timestamp: string;
  eventType: string;
  actor: {
    email: string | null;
    ip: string | null;
  };
  target: {
    resource: string | null;
  };
  metadata: Record<string, unknown>;
  original: Record<string, unknown>;
};

type ParsedIngestionRequest = {
  sourceType: CanonicalSourceType;
  acceptedEvents: IngestionEventInput[];
  rejected: Array<{ index: number; reason: string }>;
};

type EventJobPayload = {
  requestId: string;
  batchId: string;
  tenantId: number;
  connectorId: number;
  sourceType: CanonicalSourceType;
  events: IngestionEventInput[];
};

type QueueHealthSnapshot = {
  available: boolean;
  reason: string | null;
  counts: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
  };
  counters: {
    totalReceived: number;
    totalProcessed: number;
    totalFailed: number;
    totalDeadLettered: number;
  };
};

type PipelineAuditLog = (input: {
  eventType: string;
  message: string;
  userId?: number | null;
  tenantId?: number | null;
  source?: string;
  payload?: Record<string, unknown> | null;
}) => Promise<void>;

type EventPipelineOptions = {
  writeAuditLog: PipelineAuditLog;
};

type RawEventRow = {
  id: number;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

type NormalizedEventRow = {
  id: number;
  tenant_id: number;
  connector_id: number | null;
  source_type: string;
  canonical_event_type: string;
  actor_email: string | null;
  actor_ip: string | null;
  target_resource: string | null;
  event_time: string | Date;
  ingested_at: string | Date;
  severity: string | null;
  raw_event_id: number | null;
  source_event_id: string | null;
  normalized_payload_json: Record<string, unknown>;
};

class RetryableBatchError extends Error {}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeSourceType(value: unknown): CanonicalSourceType | null {
  const normalized = normalizeString(value).toLowerCase();
  return SOURCE_TYPE_ALIASES[normalized] ?? null;
}

function sourceTypeToConnectorType(sourceType: CanonicalSourceType): string {
  if (sourceType === 'microsoft365') {
    return 'microsoft_365';
  }
  return sourceType;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildTokenPrefix(token: string): string {
  return token.slice(0, 18);
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

async function requireRole(c: any, access: TenantAccess, allowed: TenantMembershipRole[], message: string, action?: string): Promise<Response | null> {
  return sharedRequireRole(c, access, allowed, message, action ? { action } : undefined);
}

function normalizeTimestamp(value: unknown): string | null {
  const input = normalizeString(value);
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function resolveCanonicalEventType(sourceType: CanonicalSourceType, event: IngestionEventInput): string {
  const eventType = event.eventType.toLowerCase();
  const metadata = event.metadata;
  const flattened = JSON.stringify({ sourceType, eventType, metadata }).toLowerCase();

  if ((eventType.includes('signin') || eventType.includes('login') || flattened.includes('consolelogin')) && (eventType.includes('fail') || flattened.includes('failure') || flattened.includes('denied'))) {
    return 'signin_failure';
  }

  if ((eventType.includes('signin') || eventType.includes('login') || flattened.includes('consolelogin')) && (eventType.includes('success') || flattened.includes('success') || flattened.includes('succeeded'))) {
    return 'signin_success';
  }

  if (eventType.includes('signin') || eventType.includes('login')) {
    return 'signin_attempt';
  }

  if (flattened.includes('privilege') || flattened.includes('role') || flattened.includes('admin') || flattened.includes('permission')) {
    return 'privilege_change';
  }

  if (flattened.includes('config') || flattened.includes('policy') || flattened.includes('setting')) {
    return 'config_change';
  }

  if (flattened.includes('file') || flattened.includes('drive') || flattened.includes('sharepoint') || flattened.includes('document')) {
    return 'file_access';
  }

  if (sourceType === 'aws' || flattened.includes('api') || flattened.includes('graph') || flattened.includes('endpoint')) {
    return 'api_call';
  }

  return 'api_call';
}

function resolveSeverity(canonicalEventType: string, event: IngestionEventInput): string | null {
  const explicit = normalizeOptionalString((event.original['severity'] ?? event.metadata['severity']) as unknown);
  if (explicit) {
    return explicit.toLowerCase();
  }

  if (canonicalEventType === 'signin_failure') return 'medium';
  if (canonicalEventType === 'privilege_change') return 'high';
  if (canonicalEventType === 'config_change') return 'medium';
  if (canonicalEventType === 'file_access') return 'low';
  return 'info';
}

function buildNormalizedPayload(sourceType: CanonicalSourceType, event: IngestionEventInput, canonicalEventType: string) {
  return {
    sourceType,
    canonicalEventType,
    actor: event.actor,
    target: event.target,
    metadata: event.metadata,
    original: event.original,
  };
}

function parseSingleEvent(input: unknown): { ok: true; event: IngestionEventInput } | { ok: false; reason: string } {
  if (!isRecord(input)) {
    return { ok: false, reason: 'Each event must be an object.' };
  }

  const record = input;
  const timestamp = normalizeTimestamp(record.timestamp ?? record.eventTime ?? record.time ?? record.createdAt);
  if (!timestamp) {
    return { ok: false, reason: 'Invalid or missing timestamp.' };
  }

  const eventType = normalizeString(record.eventType ?? record.activity ?? record.event_name ?? record.name);
  if (!eventType) {
    return { ok: false, reason: 'eventType is required.' };
  }
  if (eventType.length > MAX_EVENT_TYPE_LENGTH) {
    return { ok: false, reason: `eventType exceeds the maximum length of ${MAX_EVENT_TYPE_LENGTH}.` };
  }

  if (typeof record.actor !== 'undefined' && !isRecord(record.actor)) {
    return { ok: false, reason: 'actor must be an object.' };
  }
  if (typeof record.target !== 'undefined' && !isRecord(record.target)) {
    return { ok: false, reason: 'target must be an object.' };
  }
  if (typeof record.metadata !== 'undefined' && !isRecord(record.metadata)) {
    return { ok: false, reason: 'metadata must be an object.' };
  }

  const actor = asRecord(record.actor);
  const target = asRecord(record.target);
  const metadata = asRecord(record.metadata);
  const eventId = normalizeOptionalString(record.eventId ?? record.id ?? record.sourceEventId);
  if (eventId && eventId.length > MAX_SOURCE_EVENT_ID_LENGTH) {
    return { ok: false, reason: `eventId exceeds the maximum length of ${MAX_SOURCE_EVENT_ID_LENGTH}.` };
  }

  const actorEmail = normalizeOptionalString(actor.email ?? actor.userPrincipalName ?? actor.user);
  if (actorEmail && actorEmail.length > MAX_EMAIL_LENGTH) {
    return { ok: false, reason: `actor.email exceeds the maximum length of ${MAX_EMAIL_LENGTH}.` };
  }

  const actorIp = normalizeOptionalString(actor.ip ?? actor.ipAddress ?? record.ipAddress);
  if (actorIp && actorIp.length > MAX_IP_LENGTH) {
    return { ok: false, reason: `actor.ip exceeds the maximum length of ${MAX_IP_LENGTH}.` };
  }

  const targetResource = normalizeOptionalString(target.resource ?? target.name ?? record.resource ?? record.targetResource);
  if (targetResource && targetResource.length > MAX_TARGET_RESOURCE_LENGTH) {
    return { ok: false, reason: `target.resource exceeds the maximum length of ${MAX_TARGET_RESOURCE_LENGTH}.` };
  }

  return {
    ok: true,
    event: {
      requestIndex: -1,
      eventId,
      timestamp,
      eventType,
      actor: {
        email: actorEmail,
        ip: actorIp,
      },
      target: {
        resource: targetResource,
      },
      metadata,
      original: record,
    },
  };
}

function parseIngestionBody(rawBody: string): ParsedIngestionRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }

  const body = asRecord(parsed);
  const sourceType = normalizeSourceType(body.sourceType ?? body.source ?? body.connectorType);
  if (!sourceType) {
    throw new Error('sourceType is required and must be one of aws, microsoft365, or google_workspace.');
  }

  const events = Array.isArray(body.events) ? body.events : null;
  if (!events || events.length === 0) {
    throw new Error('events must be a non-empty array.');
  }

  if (events.length > MAX_BATCH_SIZE) {
    throw new Error(`events exceeds the maximum batch size of ${MAX_BATCH_SIZE}.`);
  }

  const seenEventIds = new Set<string>();
  const acceptedEvents: IngestionEventInput[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];

  events.forEach((entry, index) => {
    const result = parseSingleEvent(entry);
    if (!result.ok) {
      rejected.push({ index, reason: result.reason });
      return;
    }

    if (result.event.eventId && seenEventIds.has(result.event.eventId)) {
      rejected.push({ index, reason: 'Duplicate eventId in request batch.' });
      return;
    }

    if (result.event.eventId) {
      seenEventIds.add(result.event.eventId);
    }

    acceptedEvents.push({
      ...result.event,
      requestIndex: index,
    });
  });

  return {
    sourceType,
    acceptedEvents,
    rejected,
  };
}

async function getTenantAccess(c: any, _requireAuthUserId?: (c: any) => Promise<number | null>): Promise<TenantAccess | Response> {
  return requireTenantContext(c);
}

async function getConnectorForTenant(tenantId: number, connectorId: number) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, tenant_id, name, type, status, is_enabled, last_event_at, event_rate_per_hour
     FROM connector_configs
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, connectorId],
  );

  return result.rows[0] as {
    id: number;
    tenant_id: number;
    name: string;
    type: string;
    status: string;
    is_enabled: boolean;
    last_event_at: string | Date | null;
    event_rate_per_hour: number | null;
  } | undefined;
}

async function lookupActiveIngestionToken(rawToken: string): Promise<IngestionTokenRecord | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       cit.id AS token_id,
       cit.tenant_id,
       cit.connector_id,
       cit.token_prefix,
       cit.status AS token_status,
       cit.expires_at AS token_expires_at,
       cc.name AS connector_name,
       cc.type AS connector_type,
       cc.is_enabled AS connector_enabled
     FROM connector_ingestion_tokens cit
     INNER JOIN connector_configs cc
       ON cc.id = cit.connector_id
      AND cc.tenant_id = cit.tenant_id
     WHERE cit.token_hash = $1
       AND cit.status = 'active'
       AND cit.revoked_at IS NULL
       AND (cit.expires_at IS NULL OR cit.expires_at > NOW())
     LIMIT 1`,
    [hashToken(rawToken)],
  );

  return (result.rows[0] as IngestionTokenRecord | undefined) ?? null;
}

async function markTokenUsed(tokenId: number, ip: string) {
  const pool = getPool();
  await pool.query(
    `UPDATE connector_ingestion_tokens
     SET last_used_at = NOW(),
         last_used_ip = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [tokenId, ip],
  );
}

function extractIngestionToken(c: any): string | null {
  const preferred = normalizeString(c.req.header('x-zonforge-ingestion-key') ?? c.req.header('x-api-key'));
  if (preferred) {
    return preferred;
  }

  const auth = normalizeString(c.req.header('authorization'));
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return null;
}

type IngestionAuthResult =
  | { error: Response; context?: undefined }
  | {
      error: null;
      context: {
        tokenId: number;
        tenantId: number;
        connectorId: number;
        connectorType: string;
        connectorName: string;
        tokenPrefix: string;
      };
    };

async function authenticateIngestionRequest(c: any): Promise<IngestionAuthResult> {
  const rawToken = extractIngestionToken(c);
  if (!rawToken) {
    return {
      error: sendError(c, 401, 'ingestion_unauthorized', 'A valid ingestion credential is required.'),
    };
  }

  const token = await lookupActiveIngestionToken(rawToken);
  if (!token || !token.connector_enabled) {
    return {
      error: sendError(c, 401, 'ingestion_unauthorized', 'Ingestion credential is invalid or inactive.'),
    };
  }

  await markTokenUsed(token.token_id, getClientIp(c));

  return {
    error: null,
    context: {
      tokenId: token.token_id,
      tenantId: token.tenant_id,
      connectorId: token.connector_id,
      connectorType: token.connector_type,
      connectorName: token.connector_name,
      tokenPrefix: token.token_prefix,
    },
  };
}

class EventPipelineRuntime {
  private readonly auditLog: PipelineAuditLog;
  private readonly rateBuckets = new Map<string, RateBucket>();
  private readonly queueJobOptions: JobsOptions;
  private readonly counters = {
    totalReceived: 0,
    totalProcessed: 0,
    totalFailed: 0,
    totalDeadLettered: 0,
  };

  private redis: Redis | null = null;
  private workerRedis: Redis | null = null;
  private queue: Queue<EventJobPayload> | null = null;
  private queueEvents: QueueEvents | null = null;
  private worker: Worker<EventJobPayload> | null = null;
  private available = false;
  private reason: string | null = 'redis_not_configured';

  constructor(options: EventPipelineOptions) {
    this.auditLog = options.writeAuditLog;
    this.queueJobOptions = {
      attempts: Math.max(1, Number(process.env.ZONFORGE_QUEUE_MAX_RETRIES ?? 3)),
      backoff: {
        type: 'exponential',
        delay: Math.max(250, Number(process.env.ZONFORGE_QUEUE_BACKOFF_MS ?? 1_000)),
      },
      removeOnComplete: 250,
      removeOnFail: false,
    };
  }

  async start() {
    const host = normalizeString(process.env.ZONFORGE_REDIS_HOST);
    if (!host) {
      this.available = false;
      this.reason = 'redis_not_configured';
      console.warn('[ingestion] Redis not configured; ingestion queue disabled.');
      return;
    }

    try {
      const connection = {
        host,
        port: Number(process.env.ZONFORGE_REDIS_PORT ?? 6379),
        password: normalizeString(process.env.ZONFORGE_REDIS_PASSWORD) || undefined,
        tls: normalizeString(process.env.ZONFORGE_REDIS_TLS).toLowerCase() === 'true' ? {} : undefined,
        maxRetriesPerRequest: null as number | null,
        enableReadyCheck: false,
      };

      this.redis = new Redis(connection);
      this.workerRedis = new Redis(connection);
      this.queue = new Queue<EventJobPayload>(INGESTION_QUEUE_NAME, { connection });
      this.queueEvents = new QueueEvents(INGESTION_QUEUE_NAME, { connection });
      this.worker = new Worker<EventJobPayload>(
        INGESTION_QUEUE_NAME,
        async (job) => this.processJob(job.data, job.attemptsMade),
        {
          connection,
          concurrency: Math.max(1, Number(process.env.ZONFORGE_QUEUE_CONCURRENCY ?? 4)),
        },
      );

      this.worker.on('failed', async (job, error) => {
        if (!job) return;
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
          await this.deadLetterBatch(job.data, job.attemptsMade, error instanceof Error ? error.message : 'Worker failed');
        }
      });

      await Promise.all([
        this.redis.ping(),
        this.workerRedis.ping(),
        this.queue.waitUntilReady(),
        this.queueEvents.waitUntilReady(),
        this.worker.waitUntilReady(),
      ]);

      this.available = true;
      this.reason = null;
      console.log(`[ingestion] Queue runtime ready on ${INGESTION_QUEUE_NAME}.`);
    } catch (error) {
      this.available = false;
      this.reason = 'redis_connection_failed';
      console.error('[ingestion] Queue runtime failed to start:', error);
    }
  }

  isAvailable() {
    return this.available;
  }

  getAvailability() {
    return {
      available: this.available,
      reason: this.reason,
    };
  }

  private hitRateLimit(key: string, limit: number) {
    const now = Date.now();
    const current = this.rateBuckets.get(key);
    if (!current || now >= current.resetAt) {
      this.rateBuckets.set(key, { count: 1, resetAt: now + INGESTION_RATE_WINDOW_MS });
      return { allowed: true, remaining: limit - 1, resetAt: now + INGESTION_RATE_WINDOW_MS };
    }

    current.count += 1;
    this.rateBuckets.set(key, current);
    return {
      allowed: current.count <= limit,
      remaining: Math.max(0, limit - current.count),
      resetAt: current.resetAt,
    };
  }

  private async recordSecurityEvent(input: {
    tenantId?: number | null;
    connectorId?: number | null;
    tokenId?: number | null;
    requestId?: string | null;
    sourceType?: string | null;
    eventType: IngestionSecurityEventType;
    clientIp?: string | null;
    tokenPrefix?: string | null;
    reasonCode?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO ingestion_security_events (
           tenant_id, connector_id, token_id, request_id, source_type,
           event_type, client_ip, token_prefix, reason_code, metadata_json, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
        [
          input.tenantId ?? null,
          input.connectorId ?? null,
          input.tokenId ?? null,
          input.requestId ?? null,
          input.sourceType ?? null,
          input.eventType,
          input.clientIp ?? null,
          input.tokenPrefix ?? null,
          input.reasonCode ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ],
      );
    } catch (error) {
      console.error('[ingestion-security] failed to persist security event', {
        eventType: input.eventType,
        reasonCode: input.reasonCode,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  async assertRateLimit(c: any, input: {
    tokenId: number;
    tenantId: number;
    connectorId: number;
    tokenPrefix: string;
    clientIp: string;
    requestId: string;
  }) {
    const tokenKey = `token:${input.tenantId}:${input.tokenId}`;
    const ipKey = `ip:${input.tenantId}:${input.clientIp}`;
    const tokenResult = this.hitRateLimit(tokenKey, INGESTION_RATE_LIMIT);
    const ipResult = this.hitRateLimit(ipKey, INGESTION_IP_RATE_LIMIT);
    const remaining = Math.min(tokenResult.remaining, ipResult.remaining);
    const resetAt = Math.min(tokenResult.resetAt, ipResult.resetAt);

    c.header('X-RateLimit-Limit', String(Math.min(INGESTION_RATE_LIMIT, INGESTION_IP_RATE_LIMIT)));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.floor(resetAt / 1000)));

    if (tokenResult.allowed && ipResult.allowed) {
      return null;
    }

    const reasonCode = tokenResult.allowed ? 'ip_limit' : 'token_limit';
    await this.recordSecurityEvent({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      tokenId: input.tokenId,
      requestId: input.requestId,
      eventType: 'rate_limited',
      clientIp: input.clientIp,
      tokenPrefix: input.tokenPrefix,
      reasonCode,
      metadata: {
        tokenLimit: INGESTION_RATE_LIMIT,
        ipLimit: INGESTION_IP_RATE_LIMIT,
        resetAt: new Date(resetAt).toISOString(),
      },
    });
    c.header('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    return sendError(c, 429, 'ingestion_rate_limited', 'Too many ingestion requests. Please try again later.');
  }

  async recordReplayDetected(input: {
    tenantId: number;
    connectorId: number;
    tokenId?: number | null;
    requestId: string;
    sourceType: CanonicalSourceType;
    clientIp?: string | null;
    tokenPrefix?: string | null;
    eventIds: string[];
    reasonCode: string;
  }) {
    await this.recordSecurityEvent({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      tokenId: input.tokenId ?? null,
      requestId: input.requestId,
      sourceType: input.sourceType,
      eventType: 'replay_detected',
      clientIp: input.clientIp ?? null,
      tokenPrefix: input.tokenPrefix ?? null,
      reasonCode: input.reasonCode,
      metadata: {
        count: input.eventIds.length,
        eventIds: input.eventIds.slice(0, 10),
      },
    });
  }

  async recordAnomaly(input: {
    tenantId: number;
    connectorId: number;
    tokenId?: number | null;
    requestId: string;
    sourceType?: CanonicalSourceType | null;
    clientIp?: string | null;
    tokenPrefix?: string | null;
    reasonCode: string;
    metadata?: Record<string, unknown> | null;
  }) {
    await this.recordSecurityEvent({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      tokenId: input.tokenId ?? null,
      requestId: input.requestId,
      sourceType: input.sourceType ?? null,
      eventType: 'anomaly_detected',
      clientIp: input.clientIp ?? null,
      tokenPrefix: input.tokenPrefix ?? null,
      reasonCode: input.reasonCode,
      metadata: input.metadata ?? null,
    });
  }

  async detectReplayEventIds(input: {
    tenantId: number;
    connectorId: number;
    sourceType: CanonicalSourceType;
    eventIds: string[];
  }) {
    if (input.eventIds.length === 0) {
      return new Set<string>();
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT source_event_id
       FROM raw_ingestion_events
       WHERE tenant_id = $1
         AND connector_id = $2
         AND source_type = $3
         AND source_event_id = ANY($4::varchar[])`,
      [input.tenantId, input.connectorId, input.sourceType, input.eventIds],
    );

    return new Set(
      (result.rows as Array<{ source_event_id: string | null }>).flatMap((row) => row.source_event_id ? [row.source_event_id] : []),
    );
  }

  async assertQueueCapacity(c: any, input: {
    tenantId: number;
    connectorId: number;
    tokenId: number;
    tokenPrefix: string;
    requestId: string;
    sourceType: CanonicalSourceType;
    clientIp: string;
  }) {
    if (!this.queue || !this.available) {
      return null;
    }

    const counts = await this.queue.getJobCounts('waiting', 'active');
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    if (waiting + active < INGESTION_QUEUE_MAX_PENDING_JOBS && active < INGESTION_QUEUE_MAX_ACTIVE_JOBS) {
      return null;
    }

    await this.recordAnomaly({
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      tokenId: input.tokenId,
      tokenPrefix: input.tokenPrefix,
      requestId: input.requestId,
      sourceType: input.sourceType,
      clientIp: input.clientIp,
      reasonCode: 'queue_overload',
      metadata: {
        waiting,
        active,
        pendingLimit: INGESTION_QUEUE_MAX_PENDING_JOBS,
        activeLimit: INGESTION_QUEUE_MAX_ACTIVE_JOBS,
      },
    });
    c.header('Retry-After', '5');
    return sendError(c, 503, 'ingestion_backpressure', 'The ingestion pipeline is temporarily saturated. Please retry shortly.');
  }

  async recordRequestAnomalies(input: {
    tenantId: number;
    connectorId: number;
    tokenId: number;
    tokenPrefix: string;
    requestId: string;
    sourceType: CanonicalSourceType;
    clientIp: string;
    payloadBytes: number;
    submittedCount: number;
    acceptedCount: number;
    rejectedCount: number;
  }) {
    const tasks: Array<Promise<void>> = [];

    if (input.payloadBytes >= Math.floor(MAX_PAYLOAD_BYTES * INGESTION_ANOMALY_PAYLOAD_RATIO)) {
      tasks.push(this.recordAnomaly({
        tenantId: input.tenantId,
        connectorId: input.connectorId,
        tokenId: input.tokenId,
        tokenPrefix: input.tokenPrefix,
        requestId: input.requestId,
        sourceType: input.sourceType,
        clientIp: input.clientIp,
        reasonCode: 'near_payload_limit',
        metadata: {
          payloadBytes: input.payloadBytes,
          maxPayloadBytes: MAX_PAYLOAD_BYTES,
        },
      }));
    }

    if (input.submittedCount >= Math.ceil(MAX_BATCH_SIZE * INGESTION_ANOMALY_BATCH_RATIO)) {
      tasks.push(this.recordAnomaly({
        tenantId: input.tenantId,
        connectorId: input.connectorId,
        tokenId: input.tokenId,
        tokenPrefix: input.tokenPrefix,
        requestId: input.requestId,
        sourceType: input.sourceType,
        clientIp: input.clientIp,
        reasonCode: 'near_batch_limit',
        metadata: {
          submittedCount: input.submittedCount,
          maxBatchSize: MAX_BATCH_SIZE,
        },
      }));
    }

    const rejectionRatio = input.submittedCount > 0 ? input.rejectedCount / input.submittedCount : 0;
    if (rejectionRatio >= INGESTION_ANOMALY_REJECTION_RATIO) {
      tasks.push(this.recordAnomaly({
        tenantId: input.tenantId,
        connectorId: input.connectorId,
        tokenId: input.tokenId,
        tokenPrefix: input.tokenPrefix,
        requestId: input.requestId,
        sourceType: input.sourceType,
        clientIp: input.clientIp,
        reasonCode: 'high_rejection_ratio',
        metadata: {
          submittedCount: input.submittedCount,
          acceptedCount: input.acceptedCount,
          rejectedCount: input.rejectedCount,
          rejectionRatio,
        },
      }));
    }

    await Promise.all(tasks);
  }

  async enqueueBatch(input: EventJobPayload) {
    if (!this.queue || !this.available) {
      throw new Error(this.reason ?? 'queue_unavailable');
    }

    const job = await this.queue.add('ingest-batch', input, {
      ...this.queueJobOptions,
      jobId: input.batchId,
    });
    this.counters.totalReceived += input.events.length;
    return job;
  }

  async getQueueHealth(): Promise<QueueHealthSnapshot> {
    if (!this.queue || !this.available) {
      return {
        available: false,
        reason: this.reason,
        counts: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
        counters: { ...this.counters },
      };
    }

    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    return {
      available: true,
      reason: null,
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
      },
      counters: { ...this.counters },
    };
  }

  private async processJob(payload: EventJobPayload, attemptsMade: number) {
    console.info('[ingestion-worker] processing batch', {
      batchId: payload.batchId,
      tenantId: payload.tenantId,
      connectorId: payload.connectorId,
      sourceType: payload.sourceType,
      eventCount: payload.events.length,
      attemptsMade,
    });

    const maxEventTime = await this.processEvents(payload, attemptsMade);
    const pool = getPool();
    await pool.query(
      `UPDATE ingestion_request_logs
       SET status = 'processed',
           error_message = NULL,
           updated_at = NOW()
       WHERE batch_id = $1`,
      [payload.batchId],
    );

    if (maxEventTime) {
      await pool.query(
        `UPDATE connector_configs
         SET last_event_at = GREATEST(COALESCE(last_event_at, $3), $3),
             event_rate_per_hour = (
               SELECT COUNT(*)::int
               FROM normalized_events
               WHERE connector_id = $2
                 AND ingested_at >= NOW() - INTERVAL '1 hour'
             ),
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $1`,
        [payload.tenantId, payload.connectorId, maxEventTime],
      );
    }

    console.info('[ingestion-worker] processed batch', {
      batchId: payload.batchId,
      tenantId: payload.tenantId,
      connectorId: payload.connectorId,
    });
  }

  private async processEvents(payload: EventJobPayload, attemptsMade: number): Promise<string | null> {
    let maxEventTime: string | null = null;

    for (let index = 0; index < payload.events.length; index += 1) {
      const event = payload.events[index]!;
      const rawEventId = await this.upsertRawEvent(payload, index, event, attemptsMade);

      try {
        if ((event.metadata['simulateRetry'] ?? event.original['simulateRetry']) === true) {
          throw new RetryableBatchError('Simulated retryable worker failure');
        }

        if (event.eventId) {
          const duplicate = await this.findDuplicateSourceEvent(payload, rawEventId, event.eventId);
          if (duplicate) {
            await this.recordReplayDetected({
              tenantId: payload.tenantId,
              connectorId: payload.connectorId,
              requestId: payload.requestId,
              sourceType: payload.sourceType,
              eventIds: [event.eventId],
              reasonCode: 'worker_duplicate_source_event',
            });
            await this.markRawEventProcessed(rawEventId, attemptsMade, 'duplicate_source_event_id');
            continue;
          }
        }

        const canonicalEventType = resolveCanonicalEventType(payload.sourceType, event);
        const normalizedPayload = buildNormalizedPayload(payload.sourceType, event, canonicalEventType);
        const severity = resolveSeverity(canonicalEventType, event);
        const pool = getPool();
        const normalizedInsert = await pool.query(
          `INSERT INTO normalized_events (
             tenant_id, connector_id, source_type, canonical_event_type,
             actor_email, actor_ip, target_resource, event_time,
             ingested_at, severity, raw_event_id, source_event_id, normalized_payload_json
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12)
           ON CONFLICT (raw_event_id) DO NOTHING
           RETURNING id`,
          [
            payload.tenantId,
            payload.connectorId,
            payload.sourceType,
            canonicalEventType,
            event.actor.email,
            event.actor.ip,
            event.target.resource,
            event.timestamp,
            severity,
            rawEventId,
            event.eventId,
            JSON.stringify(normalizedPayload),
          ],
        );

        const normalizedEventId = Number(normalizedInsert.rows[0]?.id ?? NaN);
        if (Number.isFinite(normalizedEventId)) {
          await evaluateDetectionsForNormalizedEvent({
            id: normalizedEventId,
            tenantId: payload.tenantId,
            connectorId: payload.connectorId,
            sourceType: payload.sourceType,
            canonicalEventType,
            actorEmail: event.actor.email,
            actorIp: event.actor.ip,
            targetResource: event.target.resource,
            eventTime: event.timestamp,
            sourceEventId: event.eventId,
            normalizedPayload,
          });
        }

        await this.markRawEventProcessed(rawEventId, attemptsMade, null);
        this.counters.totalProcessed += 1;
        if (!maxEventTime || new Date(event.timestamp).getTime() > new Date(maxEventTime).getTime()) {
          maxEventTime = event.timestamp;
        }
      } catch (error) {
        if (error instanceof RetryableBatchError) {
          await this.markRawEventFailed(rawEventId, attemptsMade, error.message, 'failed');
          throw error;
        }

        const message = error instanceof Error ? error.message : 'Normalization failed';
        await this.recordPermanentFailure(payload, rawEventId, event, attemptsMade, message, 'failed');
        console.error('[ingestion-worker] event normalization failed', {
          batchId: payload.batchId,
          rawEventId,
          tenantId: payload.tenantId,
          connectorId: payload.connectorId,
          sourceType: payload.sourceType,
          error: message,
        });
      }
    }

    return maxEventTime;
  }

  private async upsertRawEvent(payload: EventJobPayload, batchIndex: number, event: IngestionEventInput, attemptsMade: number) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO raw_ingestion_events (
         tenant_id, connector_id, request_id, batch_id, batch_index,
         source_type, source_event_id, received_at, payload_json,
         status, error_message, retry_count, processed_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,'queued',NULL,$9,NULL,NOW())
       ON CONFLICT (batch_id, batch_index) DO UPDATE
       SET source_event_id = EXCLUDED.source_event_id,
           payload_json = EXCLUDED.payload_json,
           status = 'queued',
           error_message = NULL,
           retry_count = EXCLUDED.retry_count,
           processed_at = NULL,
           updated_at = NOW()
       RETURNING id`,
      [
        payload.tenantId,
        payload.connectorId,
        payload.requestId,
        payload.batchId,
        batchIndex,
        payload.sourceType,
        event.eventId,
        JSON.stringify(event.original),
        attemptsMade,
      ],
    );

    return Number((result.rows[0] as RawEventRow).id);
  }

  private async findDuplicateSourceEvent(payload: EventJobPayload, rawEventId: number, sourceEventId: string) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id
       FROM raw_ingestion_events
       WHERE tenant_id = $1
         AND connector_id = $2
         AND source_type = $3
         AND source_event_id = $4
         AND id <> $5
       LIMIT 1`,
      [payload.tenantId, payload.connectorId, payload.sourceType, sourceEventId, rawEventId],
    );
    return result.rows.length > 0;
  }

  private async markRawEventProcessed(rawEventId: number, attemptsMade: number, errorMessage: string | null) {
    const pool = getPool();
    await pool.query(
      `UPDATE raw_ingestion_events
       SET status = 'processed',
           error_message = $2,
           retry_count = $3,
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [rawEventId, errorMessage, attemptsMade],
    );
  }

  private async markRawEventFailed(rawEventId: number, attemptsMade: number, errorMessage: string, status: 'failed' | 'dead_letter') {
    const pool = getPool();
    await pool.query(
      `UPDATE raw_ingestion_events
       SET status = $2,
           error_message = $3,
           retry_count = $4,
           processed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [rawEventId, status, errorMessage, attemptsMade],
    );
  }

  private async recordPermanentFailure(
    payload: EventJobPayload,
    rawEventId: number,
    event: IngestionEventInput,
    attemptsMade: number,
    errorMessage: string,
    status: 'failed' | 'dead_letter',
  ) {
    const pool = getPool();
    await this.markRawEventFailed(rawEventId, attemptsMade, errorMessage, status);
    await pool.query(
      `INSERT INTO failed_ingestion_events (
         tenant_id, connector_id, raw_event_id, request_id, batch_id,
         source_type, payload_json, error_message, failed_at, retry_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)`,
      [
        payload.tenantId,
        payload.connectorId,
        rawEventId,
        payload.requestId,
        payload.batchId,
        payload.sourceType,
        JSON.stringify(event.original),
        errorMessage,
        attemptsMade,
      ],
    );
    this.counters.totalFailed += 1;
  }

  private async deadLetterBatch(payload: EventJobPayload, attemptsMade: number, errorMessage: string) {
    const pool = getPool();
    await pool.query(
      `UPDATE ingestion_request_logs
       SET status = 'dead_letter',
           error_message = $2,
           updated_at = NOW()
       WHERE batch_id = $1`,
      [payload.batchId, errorMessage],
    );

    for (let index = 0; index < payload.events.length; index += 1) {
      const event = payload.events[index]!;
      const rawEventId = await this.upsertRawEvent(payload, index, event, attemptsMade);
      await this.recordPermanentFailure(payload, rawEventId, event, attemptsMade, errorMessage, 'dead_letter');
    }

    this.counters.totalDeadLettered += payload.events.length;
    console.error('[ingestion-worker] batch dead-lettered', {
      batchId: payload.batchId,
      tenantId: payload.tenantId,
      connectorId: payload.connectorId,
      attemptsMade,
      error: errorMessage,
    });
  }

  async createConnectorToken(access: TenantAccess, connectorId: number, label: string | null) {
    const connector = await getConnectorForTenant(access.tenantId, connectorId);
    if (!connector) {
      return { error: 'not_found' as const };
    }

    const rawToken = `zfi_${randomBytes(8).toString('hex')}_${randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(rawToken);
    const tokenPrefix = buildTokenPrefix(rawToken);
    const pool = getPool();

    await pool.query(
      `UPDATE connector_ingestion_tokens
       SET status = 'revoked',
           revoked_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND connector_id = $2
         AND status = 'active'`,
      [access.tenantId, connectorId],
    );

    await pool.query(
      `INSERT INTO connector_ingestion_tokens (
         tenant_id, connector_id, token_prefix, token_hash, label,
         status, rotated_at, created_by_user_id, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,'active',NOW(),$6,NOW(),NOW())`,
      [access.tenantId, connectorId, tokenPrefix, tokenHash, label ?? 'default', access.userId],
    );

    await this.auditLog({
      tenantId: access.tenantId,
      userId: access.userId,
      source: 'connector_ingestion',
      eventType: 'connector.ingestion_token_rotated',
      message: 'Connector ingestion token rotated',
      payload: {
        connectorId,
        connectorName: connector.name,
        connectorType: connector.type,
        tokenPrefix,
      },
    });

    return {
      error: null,
      payload: {
        connectorId: String(connectorId),
        token: rawToken,
        tokenPrefix,
        status: 'active',
        rotatedAt: new Date().toISOString(),
      },
    };
  }

  async revokeConnectorToken(access: TenantAccess, connectorId: number) {
    const connector = await getConnectorForTenant(access.tenantId, connectorId);
    if (!connector) {
      return { error: 'not_found' as const };
    }

    const pool = getPool();
    const result = await pool.query(
      `UPDATE connector_ingestion_tokens
       SET status = 'revoked',
           revoked_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND connector_id = $2
         AND status = 'active'
       RETURNING token_prefix`,
      [access.tenantId, connectorId],
    );

    await this.auditLog({
      tenantId: access.tenantId,
      userId: access.userId,
      source: 'connector_ingestion',
      eventType: 'connector.ingestion_token_revoked',
      message: 'Connector ingestion token revoked',
      payload: {
        connectorId,
        connectorName: connector.name,
        connectorType: connector.type,
        revokedCount: result.rowCount,
      },
    });

    return { error: null, payload: { revoked: (result.rowCount ?? 0) > 0 } };
  }

  async getConnectorTokenStatus(access: TenantAccess, connectorId: number) {
    const connector = await getConnectorForTenant(access.tenantId, connectorId);
    if (!connector) {
      return { error: 'not_found' as const };
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT token_prefix, status, rotated_at, expires_at, last_used_at, last_used_ip, revoked_at, created_at
       FROM connector_ingestion_tokens
       WHERE tenant_id = $1 AND connector_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [access.tenantId, connectorId],
    );

    const row = result.rows[0] as {
      token_prefix: string;
      status: string;
      rotated_at: string | Date | null;
      expires_at: string | Date | null;
      last_used_at: string | Date | null;
      last_used_ip: string | null;
      revoked_at: string | Date | null;
      created_at: string | Date | null;
    } | undefined;

    return {
      error: null,
      payload: {
        connectorId: String(connectorId),
        configured: Boolean(row),
        tokenPrefix: row?.token_prefix ?? null,
        status: row?.status ?? 'missing',
        rotatedAt: toIso(row?.rotated_at),
        expiresAt: toIso(row?.expires_at),
        lastUsedAt: toIso(row?.last_used_at),
        lastUsedIp: row?.last_used_ip ?? null,
        revokedAt: toIso(row?.revoked_at),
        createdAt: toIso(row?.created_at),
      },
    };
  }

  async close() {
    await Promise.allSettled([
      this.worker?.close(),
      this.queueEvents?.close(),
      this.queue?.close(),
      this.workerRedis?.quit(),
      this.redis?.quit(),
    ]);
  }
}

async function recordQueuedBatch(input: {
  tenantId: number;
  connectorId: number;
  requestId: string;
  batchId: string;
  sourceType: CanonicalSourceType;
  acceptedCount: number;
  rejectedCount: number;
  payloadBytes: number;
  queueJobId: string;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO ingestion_request_logs (
       tenant_id, connector_id, request_id, batch_id, source_type,
       accepted_count, rejected_count, payload_bytes, queue_job_id, status,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued',NOW(),NOW())
     ON CONFLICT (request_id) DO UPDATE
     SET batch_id = EXCLUDED.batch_id,
         source_type = EXCLUDED.source_type,
         accepted_count = EXCLUDED.accepted_count,
         rejected_count = EXCLUDED.rejected_count,
         payload_bytes = EXCLUDED.payload_bytes,
         queue_job_id = EXCLUDED.queue_job_id,
         status = EXCLUDED.status,
         updated_at = NOW()`,
    [
      input.tenantId,
      input.connectorId,
      input.requestId,
      input.batchId,
      input.sourceType,
      input.acceptedCount,
      input.rejectedCount,
      input.payloadBytes,
      input.queueJobId,
    ],
  );
}

function parsePositiveInt(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(max, Math.floor(parsed));
}

function eventListItem(row: NormalizedEventRow) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    connectorId: row.connector_id != null ? String(row.connector_id) : null,
    sourceType: row.source_type,
    canonicalEventType: row.canonical_event_type,
    actorEmail: row.actor_email,
    actorIp: row.actor_ip,
    targetResource: row.target_resource,
    eventTime: toIso(row.event_time),
    ingestedAt: toIso(row.ingested_at),
    severity: row.severity,
    rawEventId: row.raw_event_id != null ? String(row.raw_event_id) : null,
    sourceEventId: row.source_event_id,
    normalizedPayload: row.normalized_payload_json,
  };
}

export function createEventPipelineRuntime(options: EventPipelineOptions) {
  return new EventPipelineRuntime(options);
}

export function createEventPipelineRouter(runtime: EventPipelineRuntime) {
  const router = new Hono();

  router.post('/v1/events/ingest', async (c) => {
    const requestId = getRequestId(c);
    const clientIp = getClientIp(c);
    const auth = await authenticateIngestionRequest(c);
    if (auth.error) return auth.error;
    const authContext = auth.context;

    const rateLimited = await runtime.assertRateLimit(c, {
      tokenId: authContext.tokenId,
      tenantId: authContext.tenantId,
      connectorId: authContext.connectorId,
      tokenPrefix: authContext.tokenPrefix,
      clientIp,
      requestId,
    });
    if (rateLimited) return rateLimited;

    const contentLength = Number(c.req.header('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      await runtime.recordAnomaly({
        tenantId: authContext.tenantId,
        connectorId: authContext.connectorId,
        tokenId: authContext.tokenId,
        tokenPrefix: authContext.tokenPrefix,
        requestId,
        clientIp,
        reasonCode: 'payload_too_large',
        metadata: {
          contentLength,
          maxPayloadBytes: MAX_PAYLOAD_BYTES,
        },
      });
      return sendError(c, 413, 'payload_too_large', `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes.`);
    }

    const rawBody = await c.req.text();
    const payloadBytes = Buffer.byteLength(rawBody, 'utf8');
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      await runtime.recordAnomaly({
        tenantId: authContext.tenantId,
        connectorId: authContext.connectorId,
        tokenId: authContext.tokenId,
        tokenPrefix: authContext.tokenPrefix,
        requestId,
        clientIp,
        reasonCode: 'payload_too_large',
        metadata: {
          payloadBytes,
          maxPayloadBytes: MAX_PAYLOAD_BYTES,
        },
      });
      return sendError(c, 413, 'payload_too_large', `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes.`);
    }

    let parsed: ParsedIngestionRequest;
    try {
      parsed = parseIngestionBody(rawBody);
    } catch (error) {
      await runtime.recordAnomaly({
        tenantId: authContext.tenantId,
        connectorId: authContext.connectorId,
        tokenId: authContext.tokenId,
        tokenPrefix: authContext.tokenPrefix,
        requestId,
        clientIp,
        reasonCode: 'invalid_payload',
        metadata: {
          message: error instanceof Error ? error.message : 'Invalid ingestion payload.',
        },
      });
      return sendError(c, 400, 'invalid_ingestion_payload', error instanceof Error ? error.message : 'Invalid ingestion payload.');
    }

    const expectedConnectorType = sourceTypeToConnectorType(parsed.sourceType);
    if (authContext.connectorType !== expectedConnectorType) {
      await runtime.recordAnomaly({
        tenantId: authContext.tenantId,
        connectorId: authContext.connectorId,
        tokenId: authContext.tokenId,
        tokenPrefix: authContext.tokenPrefix,
        requestId,
        sourceType: parsed.sourceType,
        clientIp,
        reasonCode: 'source_type_mismatch',
        metadata: {
          expectedConnectorType,
          authenticatedConnectorType: authContext.connectorType,
        },
      });
      return sendError(c, 400, 'source_type_mismatch', 'sourceType does not match the authenticated connector credential.');
    }

    if (!runtime.isAvailable()) {
      await runtime.recordAnomaly({
        tenantId: authContext.tenantId,
        connectorId: authContext.connectorId,
        tokenId: authContext.tokenId,
        tokenPrefix: authContext.tokenPrefix,
        requestId,
        sourceType: parsed.sourceType,
        clientIp,
        reasonCode: 'queue_unavailable',
      });
      return sendError(c, 503, 'ingestion_queue_unavailable', 'The ingestion queue is not configured for this environment.');
    }

    const replayEventIds = await runtime.detectReplayEventIds({
      tenantId: authContext.tenantId,
      connectorId: authContext.connectorId,
      sourceType: parsed.sourceType,
      eventIds: parsed.acceptedEvents.flatMap((event) => event.eventId ? [event.eventId] : []),
    });
    if (replayEventIds.size > 0) {
      await runtime.recordReplayDetected({
        tenantId: authContext.tenantId,
        connectorId: authContext.connectorId,
        tokenId: authContext.tokenId,
        tokenPrefix: authContext.tokenPrefix,
        requestId,
        sourceType: parsed.sourceType,
        clientIp,
        eventIds: Array.from(replayEventIds),
        reasonCode: 'api_duplicate_source_event',
      });

      const replayRejected = parsed.acceptedEvents
        .map((event) => ({ event, index: event.requestIndex }))
        .filter(({ event }) => event.eventId && replayEventIds.has(event.eventId))
        .map(({ index }) => ({ index, reason: 'Replay detected.' }));

      parsed = {
        ...parsed,
        acceptedEvents: parsed.acceptedEvents.filter((event) => !event.eventId || !replayEventIds.has(event.eventId)),
        rejected: [...parsed.rejected, ...replayRejected],
      };
    }

    if (parsed.acceptedEvents.length === 0) {
      return sendError(c, replayEventIds.size > 0 ? 409 : 400, replayEventIds.size > 0 ? 'replay_detected' : 'invalid_ingestion_payload', replayEventIds.size > 0 ? 'All events in this request were previously ingested.' : 'No valid events were accepted from this batch.', {
        rejected: parsed.rejected,
      });
    }

    await runtime.recordRequestAnomalies({
      tenantId: authContext.tenantId,
      connectorId: authContext.connectorId,
      tokenId: authContext.tokenId,
      tokenPrefix: authContext.tokenPrefix,
      requestId,
      sourceType: parsed.sourceType,
      clientIp,
      payloadBytes,
      submittedCount: parsed.acceptedEvents.length + parsed.rejected.length,
      acceptedCount: parsed.acceptedEvents.length,
      rejectedCount: parsed.rejected.length,
    });

    const queueOverloaded = await runtime.assertQueueCapacity(c, {
      tenantId: authContext.tenantId,
      connectorId: authContext.connectorId,
      tokenId: authContext.tokenId,
      tokenPrefix: authContext.tokenPrefix,
      requestId,
      sourceType: parsed.sourceType,
      clientIp,
    });
    if (queueOverloaded) return queueOverloaded;

    const batchId = randomUUID();

    const job = await runtime.enqueueBatch({
      requestId,
      batchId,
      tenantId: authContext.tenantId,
      connectorId: authContext.connectorId,
      sourceType: parsed.sourceType,
      events: parsed.acceptedEvents,
    });

    await recordQueuedBatch({
      tenantId: authContext.tenantId,
      connectorId: authContext.connectorId,
      requestId,
      batchId,
      sourceType: parsed.sourceType,
      acceptedCount: parsed.acceptedEvents.length,
      rejectedCount: parsed.rejected.length,
      payloadBytes,
      queueJobId: String(job.id ?? batchId),
    });

    console.info('[ingestion-api] queued batch', {
      requestId,
      batchId,
      tenantId: authContext.tenantId,
      connectorId: authContext.connectorId,
      connectorName: authContext.connectorName,
      sourceType: parsed.sourceType,
      acceptedCount: parsed.acceptedEvents.length,
      rejectedCount: parsed.rejected.length,
      payloadBytes,
    });

    return c.json({
      requestId,
      batchId,
      acceptedCount: parsed.acceptedEvents.length,
      rejectedCount: parsed.rejected.length,
      rejected: parsed.rejected,
      queue: {
        name: INGESTION_QUEUE_NAME,
        jobId: String(job.id ?? batchId),
        status: 'queued',
      },
    }, 202);
  });

  router.get('/v1/events', async (c) => {
    const access = await getTenantAccess(c);
    if (access instanceof Response) return access;

    const denied = await requireRole(c, access, EVENT_READ_ROLES, 'You do not have permission to view events.', 'event.list');
    if (denied) return denied;

    const limit = parsePositiveInt(c.req.query('limit'), 25, MAX_EVENT_QUERY_LIMIT);
    const page = parsePositiveInt(c.req.query('page'), 1, 1_000);
    const offset = (page - 1) * limit;
    const sourceType = normalizeSourceType(c.req.query('sourceType'));
    const canonicalEventType = normalizeOptionalString(c.req.query('eventType'));
    const startDate = normalizeTimestamp(c.req.query('startDate'));
    const endDate = normalizeTimestamp(c.req.query('endDate'));

    const values: unknown[] = [access.tenantId];
    const filters = ['tenant_id = $1'];
    if (sourceType) {
      values.push(sourceType);
      filters.push(`source_type = $${values.length}`);
    }
    if (canonicalEventType) {
      values.push(canonicalEventType);
      filters.push(`canonical_event_type = $${values.length}`);
    }
    if (startDate) {
      values.push(startDate);
      filters.push(`event_time >= $${values.length}`);
    }
    if (endDate) {
      values.push(endDate);
      filters.push(`event_time <= $${values.length}`);
    }

    const whereClause = filters.join(' AND ');
    const pool = getPool();
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM normalized_events
       WHERE ${whereClause}`,
      values,
    );
    values.push(limit, offset);
    const rowsResult = await pool.query(
      `SELECT *
       FROM normalized_events
       WHERE ${whereClause}
       ORDER BY event_time DESC, id DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values,
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    return c.json({
      items: (rowsResult.rows as NormalizedEventRow[]).map(eventListItem),
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    });
  });

  router.get('/v1/events/:id', async (c) => {
    const access = await getTenantAccess(c);
    if (access instanceof Response) return access;

    const denied = await requireRole(c, access, EVENT_READ_ROLES, 'You do not have permission to view events.', 'event.detail');
    if (denied) return denied;

    const eventId = Number(c.req.param('id'));
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return sendError(c, 400, 'invalid_event_id', 'Event id is invalid.');
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT ne.*, rie.payload_json AS raw_payload_json, rie.status AS raw_status, rie.error_message AS raw_error_message
       FROM normalized_events ne
       LEFT JOIN raw_ingestion_events rie
         ON rie.id = ne.raw_event_id
       WHERE ne.tenant_id = $1 AND ne.id = $2
       LIMIT 1`,
      [access.tenantId, eventId],
    );

    const row = result.rows[0] as (NormalizedEventRow & {
      raw_payload_json?: Record<string, unknown> | null;
      raw_status?: string | null;
      raw_error_message?: string | null;
    }) | undefined;

    if (!row) {
      return sendError(c, 404, 'not_found', 'Event not found.');
    }

    return c.json({
      ...eventListItem(row),
      raw: {
        status: row.raw_status ?? null,
        errorMessage: row.raw_error_message ?? null,
        payload: row.raw_payload_json ?? null,
      },
    });
  });

  router.get('/v1/connectors/:id/ingestion-token', async (c) => {
    const access = await getTenantAccess(c);
    if (access instanceof Response) return access;

    const denied = await requireRole(c, access, TOKEN_MANAGER_ROLES, 'Only owners and admins can manage ingestion credentials.', 'connector.ingestion_token.status');
    if (denied) return denied;

    const connectorId = Number(c.req.param('id'));
    if (!Number.isFinite(connectorId) || connectorId <= 0) {
      return sendError(c, 400, 'invalid_connector_id', 'Connector id is invalid.');
    }

    const result = await runtime.getConnectorTokenStatus(access, connectorId);
    if (result.error === 'not_found') {
      return sendError(c, 404, 'not_found', 'Connector not found.');
    }
    return c.json(result.payload);
  });

  router.post('/v1/connectors/:id/ingestion-token', async (c) => {
    const access = await getTenantAccess(c);
    if (access instanceof Response) return access;

    const denied = await requireRole(c, access, TOKEN_MANAGER_ROLES, 'Only owners and admins can manage ingestion credentials.', 'connector.ingestion_token.rotate');
    if (denied) return denied;

    const stepUpRequired = await requireStepUpAuth(c, access, 'Step-up authentication is required to rotate ingestion credentials.', {
      action: 'connector.ingestion_token.rotate',
    });
    if (stepUpRequired) return stepUpRequired;

    const connectorId = Number(c.req.param('id'));
    if (!Number.isFinite(connectorId) || connectorId <= 0) {
      return sendError(c, 400, 'invalid_connector_id', 'Connector id is invalid.');
    }

    const body = await c.req.json().catch(() => ({}));
    const label = normalizeOptionalString(body.label);
    const result = await runtime.createConnectorToken(access, connectorId, label);
    if (result.error === 'not_found') {
      return sendError(c, 404, 'not_found', 'Connector not found.');
    }
    return c.json(result.payload, 201);
  });

  router.post('/v1/connectors/:id/rotate-ingestion-token', async (c) => {
    const access = await getTenantAccess(c);
    if (access instanceof Response) return access;

    const denied = await requireRole(c, access, TOKEN_MANAGER_ROLES, 'Only owners and admins can manage ingestion credentials.', 'connector.ingestion_token.rotate');
    if (denied) return denied;

    const stepUpRequired = await requireStepUpAuth(c, access, 'Step-up authentication is required to rotate ingestion credentials.', {
      action: 'connector.ingestion_token.rotate',
    });
    if (stepUpRequired) return stepUpRequired;

    const connectorId = Number(c.req.param('id'));
    if (!Number.isFinite(connectorId) || connectorId <= 0) {
      return sendError(c, 400, 'invalid_connector_id', 'Connector id is invalid.');
    }

    const body = await c.req.json().catch(() => ({}));
    const label = normalizeOptionalString(body.label);
    const result = await runtime.createConnectorToken(access, connectorId, label);
    if (result.error === 'not_found') {
      return sendError(c, 404, 'not_found', 'Connector not found.');
    }
    return c.json(result.payload, 201);
  });

  router.delete('/v1/connectors/:id/ingestion-token', async (c) => {
    const access = await getTenantAccess(c);
    if (access instanceof Response) return access;

    const denied = await requireRole(c, access, TOKEN_MANAGER_ROLES, 'Only owners and admins can manage ingestion credentials.', 'connector.ingestion_token.revoke');
    if (denied) return denied;

    const stepUpRequired = await requireStepUpAuth(c, access, 'Step-up authentication is required to revoke ingestion credentials.', {
      action: 'connector.ingestion_token.revoke',
    });
    if (stepUpRequired) return stepUpRequired;

    const connectorId = Number(c.req.param('id'));
    if (!Number.isFinite(connectorId) || connectorId <= 0) {
      return sendError(c, 400, 'invalid_connector_id', 'Connector id is invalid.');
    }

    const result = await runtime.revokeConnectorToken(access, connectorId);
    if (result.error === 'not_found') {
      return sendError(c, 404, 'not_found', 'Connector not found.');
    }
    return c.json(result.payload);
  });

  router.get('/internal/ingestion/queue-health', async (c) => {
    const access = await getTenantAccess(c);
    if (access instanceof Response) return access;

    const denied = await requireRole(c, access, TOKEN_MANAGER_ROLES, 'Only owners and admins can view ingestion queue health.', 'ingestion.queue_health');
    if (denied) return denied;

    const queue = await runtime.getQueueHealth();
    const pool = getPool();
    const [recentEvents, failures, requests, securityEvents] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM normalized_events
         WHERE tenant_id = $1 AND ingested_at >= NOW() - INTERVAL '24 hours'`,
        [access.tenantId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM failed_ingestion_events
         WHERE tenant_id = $1 AND failed_at >= NOW() - INTERVAL '24 hours'`,
        [access.tenantId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM ingestion_request_logs
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
        [access.tenantId],
      ),
      pool.query(
        `SELECT event_type, COUNT(*)::int AS total
         FROM ingestion_security_events
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
         GROUP BY event_type`,
        [access.tenantId],
      ),
    ]);

    const securityCounts = new Map(
      (securityEvents.rows as Array<{ event_type: string; total: number }>).map((row) => [row.event_type, Number(row.total ?? 0)]),
    );

    return c.json({
      queue,
      tenantSummary: {
        recentEvents24h: Number(recentEvents.rows[0]?.total ?? 0),
        failedEvents24h: Number(failures.rows[0]?.total ?? 0),
        requests24h: Number(requests.rows[0]?.total ?? 0),
      },
      securitySummary: {
        rateLimited24h: securityCounts.get('rate_limited') ?? 0,
        replayDetected24h: securityCounts.get('replay_detected') ?? 0,
        anomalyDetected24h: securityCounts.get('anomaly_detected') ?? 0,
      },
    });
  });

  return router;
}