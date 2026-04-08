import { createHash } from 'node:crypto';
import { getPool } from './db.js';
import { recalculateTenantRiskScores } from './riskScoring.js';

type FindingRow = {
  id: number;
  tenant_id: number;
  rule_key: string;
  severity: string;
  title: string;
  explanation: string;
  mitre_tactic: string;
  mitre_technique: string;
  first_event_at: string | Date;
  last_event_at: string | Date;
  event_count: number;
  evidence_json: Record<string, unknown> | null;
};

type AlertRow = {
  id: number;
  severity: string;
  created_at: string | Date;
  first_seen_at: string | Date;
  status: string;
};

type AlertEventInput = {
  alertId: number;
  tenantId: number;
  eventType: string;
  actorUserId?: number | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  payload?: Record<string, unknown> | null;
};

const ALERT_GROUP_WINDOW_HOURS = Math.max(1, Number(process.env.ZONFORGE_ALERT_GROUP_WINDOW_HOURS ?? 6));
const ALERT_MTTD_SLA_MINUTES = Math.max(1, Number(process.env.ZONFORGE_ALERT_MTTD_SLA_MINUTES ?? 30));

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function normalizeSeverity(severity: string | null | undefined): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

function severityRank(severity: string | null | undefined): number {
  switch (normalizeSeverity(severity)) {
    case 'critical':
      return 5;
    case 'high':
      return 4;
    case 'medium':
      return 3;
    case 'low':
      return 2;
    default:
      return 1;
  }
}

function maxSeverity(left: string | null | undefined, right: string | null | undefined) {
  return severityRank(left) >= severityRank(right) ? normalizeSeverity(left) : normalizeSeverity(right);
}

function severityToPriority(severity: string): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' {
  switch (normalizeSeverity(severity)) {
    case 'critical':
      return 'P1';
    case 'high':
      return 'P2';
    case 'medium':
      return 'P3';
    case 'low':
      return 'P4';
    default:
      return 'P5';
  }
}

export function normalizeAlertLifecycleStatus(status: string | null | undefined): 'open' | 'in_progress' | 'resolved' {
  switch ((status ?? '').toLowerCase()) {
    case 'investigating':
    case 'in_progress':
      return 'in_progress';
    case 'resolved':
      return 'resolved';
    default:
      return 'open';
  }
}

function hashGroupingKey(parts: Array<string | number | null | undefined>) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex');
}

function derivePrincipal(finding: FindingRow) {
  const evidence = finding.evidence_json ?? {};
  const actorEmail = typeof evidence.actorEmail === 'string' ? evidence.actorEmail.trim().toLowerCase() : '';
  const actorIp = typeof evidence.actorIp === 'string'
    ? evidence.actorIp.trim()
    : typeof evidence.currentIp === 'string'
      ? evidence.currentIp.trim()
      : '';
  const targetResource = typeof evidence.targetResource === 'string' ? evidence.targetResource.trim() : '';

  if (actorEmail) {
    return {
      principalType: 'user',
      principalKey: actorEmail,
      affectedUserId: actorEmail,
      affectedIp: actorIp || null,
    };
  }

  if (actorIp) {
    return {
      principalType: 'ip',
      principalKey: actorIp,
      affectedUserId: null,
      affectedIp: actorIp,
    };
  }

  if (targetResource) {
    return {
      principalType: 'resource',
      principalKey: targetResource,
      affectedUserId: null,
      affectedIp: null,
    };
  }

  return {
    principalType: 'finding',
    principalKey: `finding:${finding.id}`,
    affectedUserId: null,
    affectedIp: null,
  };
}

function buildRecommendedActions(finding: FindingRow) {
  const severity = normalizeSeverity(finding.severity);
  const defaultSteps = [
    'Review the grouped finding history and confirm whether the activity is expected.',
    'Validate the affected identity or source before changing alert status.',
    'Document containment and triage notes before resolving the alert.',
  ];

  if (finding.rule_key === 'brute_force') {
    return [
      'Validate sign-in failure volume and consider temporary access controls for the affected identity or IP.',
      ...defaultSteps,
    ];
  }

  if (finding.rule_key === 'privilege_escalation') {
    return [
      'Review the privilege change and confirm whether elevated access should remain in place.',
      ...defaultSteps,
    ];
  }

  if (severity === 'critical' || severity === 'high') {
    return [
      'Assess containment priority immediately and confirm whether the affected identity should be isolated.',
      ...defaultSteps,
    ];
  }

  return defaultSteps;
}

function buildEvidenceList(finding: FindingRow, principalType: string, principalKey: string) {
  const evidence = finding.evidence_json ?? {};
  const items: Array<Record<string, unknown>> = [
    {
      kind: 'summary',
      ruleKey: finding.rule_key,
      principalType,
      principalKey,
      eventCount: Number(finding.event_count ?? 1),
    },
  ];

  const events = Array.isArray(evidence.events) ? evidence.events : [];
  for (const event of events.slice(0, 10)) {
    if (!event || typeof event !== 'object') continue;
    const row = event as Record<string, unknown>;
    items.push({
      kind: 'event',
      normalizedEventId: row.normalizedEventId,
      canonicalEventType: row.canonicalEventType,
      eventTime: row.eventTime,
      actorEmail: row.actorEmail,
      actorIp: row.actorIp,
      targetResource: row.targetResource,
      sourceEventId: row.sourceEventId,
    });
  }

  for (const key of ['historicalIps', 'threshold', 'windowMinutes', 'normalizedEventIds', 'sourceEventIds']) {
    if (Object.prototype.hasOwnProperty.call(evidence, key)) {
      items.push({ kind: key, value: evidence[key] });
    }
  }

  return items;
}

function detectionGapMinutes(createdAt: string | Date, firstSeenAt: string | Date) {
  const minutes = Math.round((new Date(createdAt).getTime() - new Date(firstSeenAt).getTime()) / 60_000);
  return Math.max(0, minutes);
}

async function insertAlertEvent(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, input: AlertEventInput) {
  await client.query(
    `INSERT INTO alert_events (
       alert_id,
       tenant_id,
       event_type,
       actor_user_id,
       previous_status,
       new_status,
       payload_json,
       created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [
      input.alertId,
      input.tenantId,
      input.eventType,
      input.actorUserId ?? null,
      input.previousStatus ?? null,
      input.newStatus ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
    ],
  );
}

export async function materializeAlertForFinding(findingId: number) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const findingResult = await client.query(
      `SELECT id, tenant_id, rule_key, severity, title, explanation, mitre_tactic, mitre_technique,
              first_event_at, last_event_at, event_count, evidence_json
       FROM detection_findings
       WHERE id = $1
       LIMIT 1`,
      [findingId],
    );

    const finding = findingResult.rows[0] as FindingRow | undefined;
    if (!finding) {
      await client.query('ROLLBACK');
      return;
    }

    const principal = derivePrincipal(finding);
    const groupingKey = hashGroupingKey([finding.tenant_id, finding.rule_key, principal.principalType, principal.principalKey]);
    const evidenceList = buildEvidenceList(finding, principal.principalType, principal.principalKey);
    const recommendedActions = buildRecommendedActions(finding);

    await client.query(
      'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
      [finding.tenant_id, groupingKey],
    );

    const existingResult = await client.query(
      `SELECT id, severity, created_at, first_seen_at, status
       FROM alerts
       WHERE tenant_id = $1
         AND rule_key = $2
         AND principal_key = $3
         AND status IN ('open', 'in_progress')
         AND last_seen_at >= $4::timestamptz - ($5::text || ' hours')::interval
       ORDER BY last_seen_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [finding.tenant_id, finding.rule_key, principal.principalKey, finding.last_event_at, String(ALERT_GROUP_WINDOW_HOURS)],
    );

    const existing = existingResult.rows[0] as AlertRow | undefined;
    if (existing) {
      const attachResult = await client.query(
        `INSERT INTO alert_findings (alert_id, finding_id, created_at)
         VALUES ($1,$2,NOW())
         ON CONFLICT (finding_id) DO NOTHING
         RETURNING alert_id`,
        [existing.id, finding.id],
      );

      if ((attachResult.rowCount ?? 0) > 0) {
        const nextSeverity = maxSeverity(existing.severity, finding.severity);
        const nextFirstSeenAt = new Date(existing.first_seen_at) <= new Date(finding.first_event_at)
          ? existing.first_seen_at
          : finding.first_event_at;
        const gapMinutes = detectionGapMinutes(existing.created_at, nextFirstSeenAt);

        await client.query(
          `UPDATE alerts
           SET severity = $2,
               priority = $3,
               affected_user_id = COALESCE(affected_user_id, $4),
               affected_ip = COALESCE(affected_ip, $5),
               mitre_tactics_json = CASE
                 WHEN COALESCE(mitre_tactics_json, '[]'::jsonb) ? $6 THEN mitre_tactics_json
                 ELSE COALESCE(mitre_tactics_json, '[]'::jsonb) || to_jsonb($6::text)
               END,
               mitre_techniques_json = CASE
                 WHEN COALESCE(mitre_techniques_json, '[]'::jsonb) ? $7 THEN mitre_techniques_json
                 ELSE COALESCE(mitre_techniques_json, '[]'::jsonb) || to_jsonb($7::text)
               END,
               finding_count = finding_count + 1,
               first_seen_at = LEAST(first_seen_at, $8::timestamptz),
               last_seen_at = GREATEST(last_seen_at, $9::timestamptz),
               first_signal_time = LEAST(first_signal_time, $8::timestamptz),
               evidence_json = $10::jsonb,
               detection_gap_minutes = $11,
               mttd_sla_breached = $12,
               updated_at = NOW()
           WHERE id = $1`,
          [
            existing.id,
            nextSeverity,
            severityToPriority(nextSeverity),
            principal.affectedUserId,
            principal.affectedIp,
            finding.mitre_tactic,
            finding.mitre_technique,
            finding.first_event_at,
            finding.last_event_at,
            JSON.stringify(evidenceList),
            gapMinutes,
            gapMinutes > ALERT_MTTD_SLA_MINUTES,
          ],
        );

        await insertAlertEvent(client, {
          alertId: existing.id,
          tenantId: finding.tenant_id,
          eventType: 'alert_grouped',
          payload: {
            findingId: String(finding.id),
            ruleKey: finding.rule_key,
            principalKey: principal.principalKey,
            lastSeenAt: toIso(finding.last_event_at),
          },
        });

        console.info('alert_grouped', {
          alertId: String(existing.id),
          findingId: String(finding.id),
          tenantId: finding.tenant_id,
          ruleKey: finding.rule_key,
          principalKey: principal.principalKey,
        });
      }

      await client.query('COMMIT');
      await recalculateTenantRiskScores(finding.tenant_id).catch((error) => {
        console.error('risk_score_failed', {
          tenantId: finding.tenant_id,
          trigger: 'alert_grouped',
          error: error instanceof Error ? error.message : 'unknown',
        });
      });
      return;
    }

    const insertAlertResult = await client.query(
      `INSERT INTO alerts (
         tenant_id,
         rule_key,
         grouping_key,
         principal_type,
         principal_key,
         title,
         description,
         severity,
         priority,
         status,
         affected_user_id,
         affected_ip,
         evidence_json,
         mitre_tactics_json,
         mitre_techniques_json,
         detection_gap_minutes,
         mttd_sla_breached,
         recommended_actions_json,
         first_signal_time,
         first_seen_at,
         last_seen_at,
         finding_count,
         created_at,
         updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,1,NOW(),NOW()
       )
       RETURNING id, created_at`,
      [
        finding.tenant_id,
        finding.rule_key,
        groupingKey,
        principal.principalType,
        principal.principalKey,
        finding.title,
        finding.explanation,
        normalizeSeverity(finding.severity),
        severityToPriority(finding.severity),
        principal.affectedUserId,
        principal.affectedIp,
        JSON.stringify(evidenceList),
        JSON.stringify([finding.mitre_tactic]),
        JSON.stringify([finding.mitre_technique]),
        0,
        false,
        JSON.stringify(recommendedActions),
        finding.first_event_at,
        finding.first_event_at,
        finding.last_event_at,
      ],
    );

    const alertRow = insertAlertResult.rows[0] as { id: number; created_at: string | Date };
    const gapMinutes = detectionGapMinutes(alertRow.created_at, finding.first_event_at);

    await client.query(
      `UPDATE alerts
       SET detection_gap_minutes = $2,
           mttd_sla_breached = $3
       WHERE id = $1`,
      [alertRow.id, gapMinutes, gapMinutes > ALERT_MTTD_SLA_MINUTES],
    );

    await client.query(
      `INSERT INTO alert_findings (alert_id, finding_id, created_at)
       VALUES ($1,$2,NOW())
       ON CONFLICT (finding_id) DO NOTHING`,
      [alertRow.id, finding.id],
    );

    await insertAlertEvent(client, {
      alertId: alertRow.id,
      tenantId: finding.tenant_id,
      eventType: 'alert_created',
      newStatus: 'open',
      payload: {
        findingId: String(finding.id),
        ruleKey: finding.rule_key,
        principalKey: principal.principalKey,
        firstSeenAt: toIso(finding.first_event_at),
        lastSeenAt: toIso(finding.last_event_at),
      },
    });

    await client.query('COMMIT');

    console.info('alert_created', {
      alertId: String(alertRow.id),
      findingId: String(finding.id),
      tenantId: finding.tenant_id,
      ruleKey: finding.rule_key,
      principalKey: principal.principalKey,
      severity: normalizeSeverity(finding.severity),
    });

    await recalculateTenantRiskScores(finding.tenant_id).catch((error) => {
      console.error('risk_score_failed', {
        tenantId: finding.tenant_id,
        trigger: 'alert_created',
        error: error instanceof Error ? error.message : 'unknown',
      });
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    console.error('alert_materialization_failed', {
      findingId: String(findingId),
      error: error instanceof Error ? error.message : 'unknown',
    });
  } finally {
    client.release();
  }
}

export async function updateAlertStatusForTenant(input: {
  tenantId: number;
  alertId: string;
  status: string;
  actorUserId: number;
  notes?: string;
}) {
  if (!/^\d+$/.test(input.alertId)) {
    return false;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `SELECT id, status
       FROM alerts
       WHERE tenant_id = $1 AND id = $2::bigint
       LIMIT 1
       FOR UPDATE`,
      [input.tenantId, input.alertId],
    );

    const current = currentResult.rows[0] as { id: number; status: string } | undefined;
    if (!current) {
      await client.query('ROLLBACK');
      return false;
    }

    const nextStatus = normalizeAlertLifecycleStatus(input.status);
    await client.query(
      `UPDATE alerts
       SET status = $3::varchar(32),
           resolved_at = CASE WHEN $4::text = 'resolved' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2::bigint`,
      [input.tenantId, input.alertId, nextStatus, nextStatus],
    );

    await insertAlertEvent(client, {
      alertId: current.id,
      tenantId: input.tenantId,
      eventType: 'alert_status_changed',
      actorUserId: input.actorUserId,
      previousStatus: normalizeAlertLifecycleStatus(current.status),
      newStatus: nextStatus,
      payload: input.notes ? { notes: input.notes } : null,
    });

    await client.query('COMMIT');

    console.info('alert_status_changed', {
      alertId: String(current.id),
      tenantId: input.tenantId,
      previousStatus: normalizeAlertLifecycleStatus(current.status),
      newStatus: nextStatus,
      actorUserId: input.actorUserId,
    });

    await recalculateTenantRiskScores(input.tenantId).catch((error) => {
      console.error('risk_score_failed', {
        tenantId: input.tenantId,
        trigger: 'alert_status_changed',
        error: error instanceof Error ? error.message : 'unknown',
      });
    });

    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

export async function assignAlertForTenant(input: {
  tenantId: number;
  alertId: string;
  analystId: string;
}) {
  if (!/^\d+$/.test(input.alertId)) {
    return false;
  }

  const pool = getPool();
  const result = await pool.query(
    `UPDATE alerts
     SET assigned_to = $3,
         assigned_at = NOW(),
         updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2::bigint
     RETURNING id`,
    [input.tenantId, input.alertId, input.analystId],
  );

  return (result.rowCount ?? 0) > 0;
}