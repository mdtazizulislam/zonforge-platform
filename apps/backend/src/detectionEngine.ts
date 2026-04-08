import { createHash } from 'node:crypto';
import { getPool } from './db.js';
import { materializeAlertForFinding } from './alertSystem.js';

type DetectionRuleKey = 'suspicious_login' | 'brute_force' | 'privilege_escalation' | 'ingestion_anomaly';

type DetectionEvent = {
  id: number;
  tenantId: number;
  connectorId: number | null;
  sourceType: string;
  canonicalEventType: string;
  actorEmail: string | null;
  actorIp: string | null;
  targetResource: string | null;
  eventTime: string;
  sourceEventId: string | null;
  normalizedPayload: Record<string, unknown>;
};

type IngestionSecurityDetectionEvent = {
  id: number;
  tenantId: number;
  connectorId: number | null;
  sourceType: string | null;
  eventType: 'rate_limited' | 'replay_detected' | 'anomaly_detected';
  requestId: string | null;
  clientIp: string | null;
  tokenPrefix: string | null;
  reasonCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type DetectionRecordEvent = {
  normalizedEventId?: number | null;
  ingestionSecurityEventId?: number | null;
  eventKind: string;
  eventTime: string;
  sourceEventId?: string | null;
  actorEmail?: string | null;
  actorIp?: string | null;
  targetResource?: string | null;
  evidence: Record<string, unknown>;
};

type DetectionRecordInput = {
  detectionKey: string;
  ruleKey: DetectionRuleKey;
  tenantId: number;
  connectorId: number | null;
  severity: string;
  title: string;
  explanation: string;
  mitreTactic: string;
  mitreTechnique: string;
  sourceType: string;
  firstEventAt: string;
  lastEventAt: string;
  eventCount: number;
  evidence: Record<string, unknown>;
  eventRows: DetectionRecordEvent[];
};

type HistoricalEventRow = {
  id: number;
  actor_ip: string | null;
  target_resource: string | null;
  source_event_id: string | null;
  event_time: string | Date;
};

type AggregateRow = {
  first_event_at: string | Date;
  last_event_at: string | Date;
  event_count: number;
  event_ids: number[];
  source_event_ids: Array<string | null>;
};

const BRUTE_FORCE_THRESHOLD = Math.max(2, Number(process.env.ZONFORGE_DETECTION_BRUTE_FORCE_THRESHOLD ?? 5));
const BRUTE_FORCE_WINDOW_MINUTES = Math.max(1, Number(process.env.ZONFORGE_DETECTION_BRUTE_FORCE_WINDOW_MINUTES ?? 10));
const SUSPICIOUS_LOGIN_LOOKBACK_HOURS = Math.max(1, Number(process.env.ZONFORGE_DETECTION_SUSPICIOUS_LOGIN_LOOKBACK_HOURS ?? 24));
const INGESTION_ANOMALY_BUCKET_MINUTES = Math.max(1, Number(process.env.ZONFORGE_DETECTION_INGESTION_ANOMALY_BUCKET_MINUTES ?? 10));

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function hashDetectionKey(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex');
}

function bucketIso(value: string, windowMinutes: number): string {
  const timestamp = new Date(value).getTime();
  const bucketMs = windowMinutes * 60_000;
  return new Date(Math.floor(timestamp / bucketMs) * bucketMs).toISOString();
}

function buildEvidenceEvent(event: Pick<DetectionEvent, 'id' | 'eventTime' | 'actorEmail' | 'actorIp' | 'targetResource' | 'sourceEventId' | 'canonicalEventType'>) {
  return {
    normalizedEventId: String(event.id),
    canonicalEventType: event.canonicalEventType,
    eventTime: event.eventTime,
    actorEmail: event.actorEmail,
    actorIp: event.actorIp,
    targetResource: event.targetResource,
    sourceEventId: event.sourceEventId,
  };
}

function classifyPrivilegeSeverity(event: DetectionEvent): 'high' | 'critical' {
  const flattened = JSON.stringify({
    targetResource: event.targetResource,
    normalizedPayload: event.normalizedPayload,
  }).toLowerCase();

  return /(owner|admin|global admin|super.?user|root|privilege admin)/.test(flattened) ? 'critical' : 'high';
}

function emitRuleTriggered(payload: Record<string, unknown>) {
  console.info('detection_rule_triggered', payload);
  console.info('detection_rule_matched', payload);
}

async function insertDetection(input: DetectionRecordInput) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO detections (
       rule_id,
       tenant_id,
       connector_id,
       detection_key,
       rule_key,
       severity,
       title,
       explanation,
       mitre_tactic,
       mitre_technique,
       source_type,
       first_event_at,
       last_event_at,
       event_count,
       evidence_json,
       created_at,
       updated_at
     )
     SELECT
       dr.id,
       $1::integer,
       $2::bigint,
       $3::varchar(128),
       $4::varchar(64),
       $5::varchar(32),
       $6::text,
       $7::text,
       $8::varchar(128),
       $9::varchar(128),
       $10::varchar(64),
       $11::timestamptz,
       $12::timestamptz,
       $13::integer,
       $14::jsonb,
       NOW(),
       NOW()
     FROM detection_rules dr
     WHERE dr.rule_key = $4::varchar(64) AND dr.enabled = TRUE
     ON CONFLICT (detection_key) DO NOTHING
     RETURNING id`,
    [
      input.tenantId,
      input.connectorId,
      input.detectionKey,
      input.ruleKey,
      input.severity,
      input.title,
      input.explanation,
      input.mitreTactic,
      input.mitreTechnique,
      input.sourceType,
      input.firstEventAt,
      input.lastEventAt,
      input.eventCount,
      JSON.stringify(input.evidence),
    ],
  );

  const detectionId = result.rows[0]?.id as number | undefined;
  if (detectionId == null) {
    return null;
  }

  for (const eventRow of input.eventRows) {
    await pool.query(
      `INSERT INTO detection_events (
         detection_id,
         tenant_id,
         normalized_event_id,
         ingestion_security_event_id,
         event_kind,
         event_time,
         source_event_id,
         actor_email,
         actor_ip,
         target_resource,
         evidence_json,
         created_at
       ) VALUES (
         $1::bigint,
         $2::integer,
         $3::bigint,
         $4::bigint,
         $5::varchar(64),
         $6::timestamptz,
         $7::varchar(255),
         $8::varchar(255),
         $9::varchar(128),
         $10::varchar(512),
         $11::jsonb,
         NOW()
       )`,
      [
        detectionId,
        input.tenantId,
        eventRow.normalizedEventId ?? null,
        eventRow.ingestionSecurityEventId ?? null,
        eventRow.eventKind,
        eventRow.eventTime,
        eventRow.sourceEventId ?? null,
        eventRow.actorEmail ?? null,
        eventRow.actorIp ?? null,
        eventRow.targetResource ?? null,
        JSON.stringify(eventRow.evidence),
      ],
    );
  }

  console.info('detection_created', {
    detectionId: String(detectionId),
    tenantId: input.tenantId,
    ruleKey: input.ruleKey,
    severity: input.severity,
    sourceType: input.sourceType,
    eventCount: input.eventCount,
  });

  return detectionId;
}

async function insertLegacyFinding(input: DetectionRecordInput) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO detection_findings (
       rule_id,
       tenant_id,
       connector_id,
       finding_key,
       rule_key,
       severity,
       title,
       explanation,
       mitre_tactic,
       mitre_technique,
       source_type,
       first_event_at,
       last_event_at,
       event_count,
       evidence_json,
       created_at,
       updated_at
     )
     SELECT
       dr.id,
       $1::integer,
       $2::bigint,
       $3::varchar(128),
       $4::varchar(64),
       $5::varchar(32),
       $6::text,
       $7::text,
       $8::varchar(128),
       $9::varchar(128),
       $10::varchar(64),
       $11::timestamptz,
       $12::timestamptz,
       $13::integer,
       $14::jsonb,
       NOW(),
       NOW()
     FROM detection_rules dr
     WHERE dr.rule_key = $4::varchar(64) AND dr.enabled = TRUE
     ON CONFLICT (finding_key) DO NOTHING
     RETURNING id`,
    [
      input.tenantId,
      input.connectorId,
      input.detectionKey,
      input.ruleKey,
      input.severity,
      input.title,
      input.explanation,
      input.mitreTactic,
      input.mitreTechnique,
      input.sourceType,
      input.firstEventAt,
      input.lastEventAt,
      input.eventCount,
      JSON.stringify(input.evidence),
    ],
  );

  const createdId = result.rows[0]?.id as number | undefined;
  if (createdId == null) {
    return null;
  }

  console.info('detection_finding_created', {
    findingId: String(createdId),
    tenantId: input.tenantId,
    ruleKey: input.ruleKey,
    severity: input.severity,
    sourceType: input.sourceType,
    eventCount: input.eventCount,
  });

  try {
    await materializeAlertForFinding(Number(createdId));
  } catch (error) {
    console.error('alert_materialization_failed', {
      findingId: String(createdId),
      tenantId: input.tenantId,
      ruleKey: input.ruleKey,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return createdId;
}

async function persistDetection(input: DetectionRecordInput) {
  await insertDetection(input);
  await insertLegacyFinding(input);
}

async function evaluateSuspiciousLogin(event: DetectionEvent) {
  if (event.canonicalEventType !== 'signin_success' || !event.actorEmail || !event.actorIp) {
    return;
  }

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, actor_ip, target_resource, source_event_id, event_time
     FROM normalized_events
     WHERE tenant_id = $1
       AND canonical_event_type = 'signin_success'
       AND actor_email = $2
       AND actor_ip IS NOT NULL
       AND actor_ip <> $3
       AND event_time >= $4::timestamptz - ($5::text || ' hours')::interval
       AND event_time <= $4::timestamptz
       AND id <> $6
     ORDER BY event_time DESC
     LIMIT 5`,
    [event.tenantId, event.actorEmail, event.actorIp, event.eventTime, String(SUSPICIOUS_LOGIN_LOOKBACK_HOURS), event.id],
  );

  const historical = result.rows as HistoricalEventRow[];
  if (historical.length === 0) {
    return;
  }

  const firstEventAt = toIso(historical[historical.length - 1]!.event_time);
  const detectionKey = hashDetectionKey([
    event.tenantId,
    'suspicious_login',
    event.actorEmail.toLowerCase(),
    event.actorIp,
    event.eventTime.slice(0, 10),
  ]);

  emitRuleTriggered({
    tenantId: event.tenantId,
    ruleKey: 'suspicious_login',
    normalizedEventId: String(event.id),
    actorEmail: event.actorEmail,
    actorIp: event.actorIp,
    historicalIpCount: historical.length,
  });

  const historicalEvents = historical.map((row) => ({
    normalizedEventId: row.id,
    eventKind: 'normalized_event',
    eventTime: toIso(row.event_time),
    sourceEventId: row.source_event_id,
    actorEmail: event.actorEmail,
    actorIp: row.actor_ip,
    targetResource: row.target_resource,
    evidence: {
      normalizedEventId: String(row.id),
      canonicalEventType: 'signin_success',
      eventTime: toIso(row.event_time),
      actorEmail: event.actorEmail,
      actorIp: row.actor_ip,
      targetResource: row.target_resource,
      sourceEventId: row.source_event_id,
    },
  }));

  await persistDetection({
    detectionKey,
    ruleKey: 'suspicious_login',
    tenantId: event.tenantId,
    connectorId: event.connectorId,
    severity: 'medium',
    title: 'Suspicious login detected',
    explanation: `${event.actorEmail} signed in successfully from ${event.actorIp}, which differs from recent successful sign-in IP activity for the same tenant-scoped account.`,
    mitreTactic: 'Initial Access',
    mitreTechnique: 'T1078 Valid Accounts',
    sourceType: event.sourceType,
    firstEventAt,
    lastEventAt: event.eventTime,
    eventCount: historical.length + 1,
    evidence: {
      actorEmail: event.actorEmail,
      currentIp: event.actorIp,
      historicalIps: historical.map((row) => row.actor_ip).filter(Boolean),
      events: [
        buildEvidenceEvent(event),
        ...historical.map((row) => ({
          normalizedEventId: String(row.id),
          canonicalEventType: 'signin_success',
          eventTime: toIso(row.event_time),
          actorEmail: event.actorEmail,
          actorIp: row.actor_ip,
          targetResource: row.target_resource,
          sourceEventId: row.source_event_id,
        })),
      ],
    },
    eventRows: [
      {
        normalizedEventId: event.id,
        eventKind: 'normalized_event',
        eventTime: event.eventTime,
        sourceEventId: event.sourceEventId,
        actorEmail: event.actorEmail,
        actorIp: event.actorIp,
        targetResource: event.targetResource,
        evidence: buildEvidenceEvent(event),
      },
      ...historicalEvents,
    ],
  });
}

async function evaluateBruteForce(event: DetectionEvent) {
  if (event.canonicalEventType !== 'signin_failure' || (!event.actorEmail && !event.actorIp)) {
    return;
  }

  const pool = getPool();
  const actorValue = event.actorEmail ?? event.actorIp ?? '';
  const actorField = event.actorEmail ? 'actor_email' : 'actor_ip';
  const result = await pool.query(
    `SELECT
       MIN(event_time) AS first_event_at,
       MAX(event_time) AS last_event_at,
       COUNT(*)::int AS event_count,
       ARRAY_AGG(id ORDER BY event_time DESC) AS event_ids,
       ARRAY_AGG(source_event_id ORDER BY event_time DESC) AS source_event_ids
     FROM normalized_events
     WHERE tenant_id = $1
       AND canonical_event_type = 'signin_failure'
       AND ${actorField} = $2
       AND event_time >= $3::timestamptz - ($4::text || ' minutes')::interval
       AND event_time <= $3::timestamptz`,
    [event.tenantId, actorValue, event.eventTime, String(BRUTE_FORCE_WINDOW_MINUTES)],
  );

  const aggregate = result.rows[0] as AggregateRow | undefined;
  const eventCount = Number(aggregate?.event_count ?? 0);
  if (eventCount < BRUTE_FORCE_THRESHOLD || !aggregate?.first_event_at || !aggregate.last_event_at) {
    return;
  }

  const detectionKey = hashDetectionKey([
    event.tenantId,
    'brute_force',
    actorField,
    actorValue.toLowerCase(),
    bucketIso(toIso(aggregate.last_event_at), BRUTE_FORCE_WINDOW_MINUTES),
  ]);

  emitRuleTriggered({
    tenantId: event.tenantId,
    ruleKey: 'brute_force',
    normalizedEventId: String(event.id),
    actorField,
    actorValue,
    eventCount,
  });

  await persistDetection({
    detectionKey,
    ruleKey: 'brute_force',
    tenantId: event.tenantId,
    connectorId: event.connectorId,
    severity: 'high',
    title: 'Brute force activity detected',
    explanation: `${eventCount} failed sign-in events were observed within ${BRUTE_FORCE_WINDOW_MINUTES} minutes for ${event.actorEmail ?? event.actorIp}.`,
    mitreTactic: 'Credential Access',
    mitreTechnique: 'T1110 Brute Force',
    sourceType: event.sourceType,
    firstEventAt: toIso(aggregate.first_event_at),
    lastEventAt: toIso(aggregate.last_event_at),
    eventCount,
    evidence: {
      actorEmail: event.actorEmail,
      actorIp: event.actorIp,
      threshold: BRUTE_FORCE_THRESHOLD,
      windowMinutes: BRUTE_FORCE_WINDOW_MINUTES,
      normalizedEventIds: (aggregate.event_ids ?? []).slice(0, 10).map((id) => String(id)),
      sourceEventIds: (aggregate.source_event_ids ?? []).filter((value): value is string => typeof value === 'string').slice(0, 10),
    },
    eventRows: [
      {
        normalizedEventId: event.id,
        eventKind: 'normalized_event_window',
        eventTime: event.eventTime,
        sourceEventId: event.sourceEventId,
        actorEmail: event.actorEmail,
        actorIp: event.actorIp,
        targetResource: event.targetResource,
        evidence: {
          actorEmail: event.actorEmail,
          actorIp: event.actorIp,
          threshold: BRUTE_FORCE_THRESHOLD,
          windowMinutes: BRUTE_FORCE_WINDOW_MINUTES,
          normalizedEventIds: (aggregate.event_ids ?? []).slice(0, 10).map((id) => String(id)),
          sourceEventIds: (aggregate.source_event_ids ?? []).filter((value): value is string => typeof value === 'string').slice(0, 10),
        },
      },
    ],
  });
}

async function evaluatePrivilegeEscalation(event: DetectionEvent) {
  if (event.canonicalEventType !== 'privilege_change') {
    return;
  }

  const severity = classifyPrivilegeSeverity(event);
  const detectionKey = hashDetectionKey([
    event.tenantId,
    'privilege_escalation',
    event.sourceEventId ?? event.id,
  ]);

  emitRuleTriggered({
    tenantId: event.tenantId,
    ruleKey: 'privilege_escalation',
    normalizedEventId: String(event.id),
    actorEmail: event.actorEmail,
    targetResource: event.targetResource,
    severity,
  });

  await persistDetection({
    detectionKey,
    ruleKey: 'privilege_escalation',
    tenantId: event.tenantId,
    connectorId: event.connectorId,
    severity,
    title: 'Privilege escalation activity detected',
    explanation: `${event.actorEmail ?? 'An identity'} performed a privilege-related change${event.targetResource ? ` affecting ${event.targetResource}` : ''}.`,
    mitreTactic: 'Privilege Escalation',
    mitreTechnique: 'T1098 Account Manipulation',
    sourceType: event.sourceType,
    firstEventAt: event.eventTime,
    lastEventAt: event.eventTime,
    eventCount: 1,
    evidence: {
      actorEmail: event.actorEmail,
      actorIp: event.actorIp,
      targetResource: event.targetResource,
      events: [buildEvidenceEvent(event)],
    },
    eventRows: [
      {
        normalizedEventId: event.id,
        eventKind: 'normalized_event',
        eventTime: event.eventTime,
        sourceEventId: event.sourceEventId,
        actorEmail: event.actorEmail,
        actorIp: event.actorIp,
        targetResource: event.targetResource,
        evidence: buildEvidenceEvent(event),
      },
    ],
  });
}

function buildIngestionAnomalyTitle(event: IngestionSecurityDetectionEvent) {
  switch (event.eventType) {
    case 'rate_limited':
      return 'Ingestion throttling detected';
    case 'replay_detected':
      return 'Ingestion replay activity detected';
    default:
      return 'Ingestion anomaly detected';
  }
}

function buildIngestionAnomalyExplanation(event: IngestionSecurityDetectionEvent) {
  switch (event.eventType) {
    case 'rate_limited':
      return `The ingestion edge rate-limited connector traffic${event.clientIp ? ` from ${event.clientIp}` : ''}${event.reasonCode ? ` due to ${event.reasonCode}` : ''}.`;
    case 'replay_detected':
      return 'The ingestion edge rejected a replayed source event before queueing a duplicate batch.';
    default:
      return `The ingestion edge recorded anomaly telemetry${event.reasonCode ? ` for ${event.reasonCode}` : ''}.`;
  }
}

function buildIngestionAnomalySeverity(event: IngestionSecurityDetectionEvent): 'medium' | 'high' {
  if (event.eventType === 'rate_limited') {
    return 'high';
  }
  if (event.reasonCode === 'queue_overload' || event.reasonCode === 'payload_too_large') {
    return 'high';
  }
  return 'medium';
}

export async function evaluateDetectionsForIngestionSecurityEvent(event: IngestionSecurityDetectionEvent) {
  try {
    const severity = buildIngestionAnomalySeverity(event);
    const detectionKey = hashDetectionKey([
      event.tenantId,
      'ingestion_anomaly',
      event.eventType,
      event.reasonCode,
      event.tokenPrefix,
      event.clientIp,
      bucketIso(event.createdAt, INGESTION_ANOMALY_BUCKET_MINUTES),
    ]);

    emitRuleTriggered({
      tenantId: event.tenantId,
      ruleKey: 'ingestion_anomaly',
      ingestionSecurityEventId: String(event.id),
      securityEventType: event.eventType,
      reasonCode: event.reasonCode,
      severity,
    });

    await persistDetection({
      detectionKey,
      ruleKey: 'ingestion_anomaly',
      tenantId: event.tenantId,
      connectorId: event.connectorId,
      severity,
      title: buildIngestionAnomalyTitle(event),
      explanation: buildIngestionAnomalyExplanation(event),
      mitreTactic: 'Impact',
      mitreTechnique: 'T1499 Endpoint Denial of Service',
      sourceType: event.sourceType ?? 'ingestion',
      firstEventAt: event.createdAt,
      lastEventAt: event.createdAt,
      eventCount: 1,
      evidence: {
        requestId: event.requestId,
        clientIp: event.clientIp,
        tokenPrefix: event.tokenPrefix,
        securityEventType: event.eventType,
        reasonCode: event.reasonCode,
        metadata: event.metadata ?? {},
      },
      eventRows: [
        {
          ingestionSecurityEventId: event.id,
          eventKind: event.eventType,
          eventTime: event.createdAt,
          actorIp: event.clientIp,
          targetResource: event.tokenPrefix,
          evidence: {
            requestId: event.requestId,
            clientIp: event.clientIp,
            tokenPrefix: event.tokenPrefix,
            securityEventType: event.eventType,
            reasonCode: event.reasonCode,
            metadata: event.metadata ?? {},
          },
        },
      ],
    });
  } catch (error) {
    console.error('detection_evaluation_failed', {
      tenantId: event.tenantId,
      ingestionSecurityEventId: String(event.id),
      ruleContext: event.eventType,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function evaluateDetectionsForNormalizedEvent(event: DetectionEvent) {
  try {
    await evaluateSuspiciousLogin(event);
    await evaluateBruteForce(event);
    await evaluatePrivilegeEscalation(event);
  } catch (error) {
    console.error('detection_evaluation_failed', {
      tenantId: event.tenantId,
      normalizedEventId: String(event.id),
      ruleContext: event.canonicalEventType,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
