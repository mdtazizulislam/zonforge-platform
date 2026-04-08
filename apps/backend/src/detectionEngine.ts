import { createHash } from 'node:crypto';
import { getPool } from './db.js';

type DetectionRuleKey = 'suspicious_login' | 'brute_force' | 'privilege_escalation';

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

type DetectionFindingInput = {
  findingKey: string;
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

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

function hashFindingKey(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex');
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

async function insertFinding(input: DetectionFindingInput) {
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
      input.findingKey,
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

  const createdId = result.rows[0]?.id;
  if (createdId != null) {
    console.info('detection_finding_created', {
      findingId: String(createdId),
      tenantId: input.tenantId,
      ruleKey: input.ruleKey,
      severity: input.severity,
      sourceType: input.sourceType,
      eventCount: input.eventCount,
    });
  }
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
  const findingKey = hashFindingKey([
    event.tenantId,
    'suspicious_login',
    event.actorEmail.toLowerCase(),
    event.actorIp,
    event.eventTime.slice(0, 10),
  ]);

  console.info('detection_rule_matched', {
    tenantId: event.tenantId,
    ruleKey: 'suspicious_login',
    normalizedEventId: String(event.id),
    actorEmail: event.actorEmail,
    actorIp: event.actorIp,
    historicalIpCount: historical.length,
  });

  await insertFinding({
    findingKey,
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

  const bucketTime = new Date(aggregate.last_event_at).getTime();
  const bucketStart = new Date(Math.floor(bucketTime / (BRUTE_FORCE_WINDOW_MINUTES * 60_000)) * BRUTE_FORCE_WINDOW_MINUTES * 60_000).toISOString();
  const findingKey = hashFindingKey([
    event.tenantId,
    'brute_force',
    actorField,
    actorValue.toLowerCase(),
    bucketStart,
  ]);

  console.info('detection_rule_matched', {
    tenantId: event.tenantId,
    ruleKey: 'brute_force',
    normalizedEventId: String(event.id),
    actorField,
    actorValue,
    eventCount,
  });

  await insertFinding({
    findingKey,
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
  });
}

async function evaluatePrivilegeEscalation(event: DetectionEvent) {
  if (event.canonicalEventType !== 'privilege_change') {
    return;
  }

  const severity = classifyPrivilegeSeverity(event);
  const findingKey = hashFindingKey([
    event.tenantId,
    'privilege_escalation',
    event.sourceEventId ?? event.id,
  ]);

  console.info('detection_rule_matched', {
    tenantId: event.tenantId,
    ruleKey: 'privilege_escalation',
    normalizedEventId: String(event.id),
    actorEmail: event.actorEmail,
    targetResource: event.targetResource,
    severity,
  });

  await insertFinding({
    findingKey,
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
  });
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