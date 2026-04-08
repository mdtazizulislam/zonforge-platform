import { getPool } from './db.js';

export type RiskEntityType = 'org' | 'user' | 'asset';
export type RiskScoreBand = 'info' | 'low' | 'medium' | 'high' | 'critical';

type AlertSignalRow = {
  id: number;
  tenant_id: number;
  rule_key: string;
  principal_type: string;
  principal_key: string;
  title: string | null;
  severity: string;
  status: string;
  finding_count: number;
  affected_user_id: string | null;
  evidence_json: Record<string, unknown> | Array<Record<string, unknown>> | null;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
};

type FindingSignalRow = {
  id: number;
  tenant_id: number;
  rule_key: string;
  severity: string;
  title: string;
  event_count: number;
  evidence_json: Record<string, unknown> | null;
  first_event_at: string | Date;
  last_event_at: string | Date;
};

type RiskScoreRow = {
  id: number;
  tenant_id: number;
  entity_type: RiskEntityType;
  entity_key: string;
  entity_label: string;
  score: number;
  score_band: RiskScoreBand;
  top_factors_json: Array<Record<string, unknown>> | null;
  signal_count: number;
  last_event_at: string | Date | null;
  last_calculated_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
};

type RiskFactor = {
  factorKey: string;
  label: string;
  contribution: number;
  signalCount: number;
  weight: number;
  lastSeenAt: string | null;
};

type EntityAccumulator = {
  entityType: RiskEntityType;
  entityKey: string;
  entityLabel: string;
  total: number;
  signalCount: number;
  lastEventAt: string | null;
  factors: Map<string, RiskFactor>;
};

type PaginationCursor = {
  score: number;
  entityKey: string;
};

const RISK_LOOKBACK_DAYS = Math.max(7, Number(process.env.ZONFORGE_RISK_LOOKBACK_DAYS ?? 30));

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundContribution(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeRiskSeverity(value: string | null | undefined): RiskScoreBand {
  switch ((value ?? '').toLowerCase()) {
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

function scoreBandForScore(score: number): RiskScoreBand {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  if (score >= 15) return 'low';
  return 'info';
}

function severityWeight(severity: string | null | undefined): number {
  switch (normalizeRiskSeverity(severity)) {
    case 'critical':
      return 32;
    case 'high':
      return 24;
    case 'medium':
      return 16;
    case 'low':
      return 8;
    default:
      return 3;
  }
}

function ruleWeight(ruleKey: string | null | undefined): number {
  switch ((ruleKey ?? '').toLowerCase()) {
    case 'privilege_escalation':
      return 1.3;
    case 'brute_force':
      return 1.15;
    case 'suspicious_login':
      return 1;
    default:
      return 1;
  }
}

function alertStatusWeight(status: string | null | undefined): number {
  switch ((status ?? '').toLowerCase()) {
    case 'in_progress':
      return 0.9;
    case 'resolved':
      return 0.2;
    default:
      return 1;
  }
}

function recencyWeight(value: string | Date | null | undefined): number {
  if (!value) return 0;

  const ageMs = Date.now() - new Date(value).getTime();
  const ageHours = ageMs / 3_600_000;
  if (ageHours <= 24) return 1;
  if (ageHours <= 72) return 0.75;
  if (ageHours <= 24 * 7) return 0.5;
  if (ageHours <= 24 * 14) return 0.3;
  if (ageHours <= 24 * 30) return 0.15;
  return 0.05;
}

function groupedAlertWeight(findingCount: number | null | undefined): number {
  const extraFindings = Math.max(0, Number(findingCount ?? 1) - 1);
  return 1 + Math.min(0.3, extraFindings * 0.06);
}

function factorLabelFromRule(ruleKey: string | null | undefined): string {
  switch ((ruleKey ?? '').toLowerCase()) {
    case 'privilege_escalation':
      return 'Privilege escalation activity';
    case 'brute_force':
      return 'Brute force activity';
    case 'suspicious_login':
      return 'Suspicious login activity';
    default:
      return 'Security signal activity';
  }
}

function decodeCursor(cursor: string | null | undefined): PaginationCursor | null {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<PaginationCursor>;
    if (typeof parsed.score !== 'number' || typeof parsed.entityKey !== 'string' || !parsed.entityKey.trim()) {
      return null;
    }
    return { score: parsed.score, entityKey: parsed.entityKey };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeResource(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

function extractFindingUserKey(finding: FindingSignalRow): string | null {
  return normalizeEmail(typeof finding.evidence_json?.actorEmail === 'string' ? finding.evidence_json.actorEmail : null);
}

function extractFindingAssetKey(finding: FindingSignalRow): string | null {
  const evidence = finding.evidence_json ?? {};
  if (typeof evidence.targetResource === 'string') {
    return normalizeResource(evidence.targetResource);
  }

  const events = Array.isArray(evidence.events) ? evidence.events : [];
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const candidate = normalizeResource((event as Record<string, unknown>).targetResource as string | null | undefined);
    if (candidate) return candidate;
  }

  return null;
}

function normalizeEntityKey(entityType: RiskEntityType, entityKey: string): string {
  if (entityType === 'org') return 'org';
  if (entityType === 'user') return normalizeEmail(entityKey) ?? '';
  return normalizeResource(entityKey) ?? '';
}

function getAccumulatorKey(entityType: RiskEntityType, entityKey: string) {
  return `${entityType}:${entityKey}`;
}

function getOrCreateAccumulator(
  store: Map<string, EntityAccumulator>,
  entityType: RiskEntityType,
  entityKey: string,
  entityLabel?: string | null,
): EntityAccumulator {
  const key = getAccumulatorKey(entityType, entityKey);
  let accumulator = store.get(key);
  if (!accumulator) {
    accumulator = {
      entityType,
      entityKey,
      entityLabel: entityLabel?.trim() || entityKey,
      total: 0,
      signalCount: 0,
      lastEventAt: null,
      factors: new Map<string, RiskFactor>(),
    };
    store.set(key, accumulator);
  } else if (entityLabel?.trim()) {
    accumulator.entityLabel = entityLabel.trim();
  }
  return accumulator;
}

function addFactor(
  accumulator: EntityAccumulator,
  factorKey: string,
  label: string,
  contribution: number,
  weight: number,
  lastSeenAt: string | null,
) {
  const nextContribution = roundContribution(contribution);
  if (nextContribution <= 0) {
    return;
  }

  accumulator.total += nextContribution;
  accumulator.signalCount += 1;
  if (!accumulator.lastEventAt || (lastSeenAt && new Date(lastSeenAt) > new Date(accumulator.lastEventAt))) {
    accumulator.lastEventAt = lastSeenAt;
  }

  const existing = accumulator.factors.get(factorKey);
  if (existing) {
    existing.contribution = roundContribution(existing.contribution + nextContribution);
    existing.signalCount += 1;
    existing.weight = Math.max(existing.weight, roundContribution(weight));
    if (!existing.lastSeenAt || (lastSeenAt && new Date(lastSeenAt) > new Date(existing.lastSeenAt))) {
      existing.lastSeenAt = lastSeenAt;
    }
    return;
  }

  accumulator.factors.set(factorKey, {
    factorKey,
    label,
    contribution: nextContribution,
    signalCount: 1,
    weight: roundContribution(weight),
    lastSeenAt,
  });
}

function serializeFactors(accumulator: EntityAccumulator): RiskFactor[] {
  return Array.from(accumulator.factors.values())
    .sort((left, right) => right.contribution - left.contribution || right.signalCount - left.signalCount || left.label.localeCompare(right.label))
    .slice(0, 5)
    .map((factor) => ({
      factorKey: factor.factorKey,
      label: factor.label,
      contribution: roundContribution(factor.contribution),
      signalCount: factor.signalCount,
      weight: roundContribution(factor.weight),
      lastSeenAt: factor.lastSeenAt,
    }));
}

function alertContribution(alert: AlertSignalRow): number {
  const base = severityWeight(alert.severity);
  const recency = recencyWeight(alert.last_seen_at);
  const status = alertStatusWeight(alert.status);
  const rule = ruleWeight(alert.rule_key);
  const grouped = groupedAlertWeight(alert.finding_count);

  return base * recency * status * rule * grouped;
}

function findingContribution(finding: FindingSignalRow): number {
  const base = severityWeight(finding.severity) * 0.4;
  const recency = recencyWeight(finding.last_event_at);
  const rule = ruleWeight(finding.rule_key);
  const grouped = 1 + Math.min(0.2, Math.max(0, finding.event_count - 1) * 0.03);

  return base * recency * rule * grouped;
}

async function loadTenantName(tenantId: number): Promise<string> {
  const pool = getPool();
  const result = await pool.query('SELECT name FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
  return typeof result.rows[0]?.name === 'string' && result.rows[0].name.trim()
    ? result.rows[0].name.trim()
    : `Tenant ${tenantId}`;
}

async function calculateTenantRiskScores(tenantId: number): Promise<Array<Omit<RiskScoreRow, 'id' | 'created_at' | 'updated_at'>>> {
  const pool = getPool();
  const [tenantName, alertsResult, findingsResult] = await Promise.all([
    loadTenantName(tenantId),
    pool.query(
      `SELECT id, tenant_id, rule_key, principal_type, principal_key, title, severity, status,
              finding_count, affected_user_id, evidence_json, first_seen_at, last_seen_at
       FROM alerts
       WHERE tenant_id = $1
         AND last_seen_at >= NOW() - ($2::text || ' days')::interval`,
      [tenantId, String(RISK_LOOKBACK_DAYS)],
    ),
    pool.query(
      `SELECT id, tenant_id, rule_key, severity, title, event_count, evidence_json, first_event_at, last_event_at
       FROM detection_findings
       WHERE tenant_id = $1
         AND last_event_at >= NOW() - ($2::text || ' days')::interval`,
      [tenantId, String(RISK_LOOKBACK_DAYS)],
    ),
  ]);

  const accumulators = new Map<string, EntityAccumulator>();
  const org = getOrCreateAccumulator(accumulators, 'org', 'org', tenantName);

  const alerts = alertsResult.rows as AlertSignalRow[];
  const findings = findingsResult.rows as FindingSignalRow[];

  let activeAlertCount = 0;
  let openCriticalAlerts = 0;
  let openHighAlerts = 0;

  for (const alert of alerts) {
    const lastSeenAt = toIso(alert.last_seen_at);
    const contribution = alertContribution(alert);
    const factorKey = `alert:${alert.rule_key}:${normalizeRiskSeverity(alert.severity)}`;
    const label = factorLabelFromRule(alert.rule_key);
    addFactor(org, factorKey, label, contribution, severityWeight(alert.severity) * ruleWeight(alert.rule_key), lastSeenAt);

    if (alert.status === 'open' || alert.status === 'in_progress') {
      activeAlertCount += 1;
      if (normalizeRiskSeverity(alert.severity) === 'critical') openCriticalAlerts += 1;
      if (normalizeRiskSeverity(alert.severity) === 'high') openHighAlerts += 1;
    }

    const userKey = normalizeEmail(alert.affected_user_id) ?? (alert.principal_type === 'user' ? normalizeEmail(alert.principal_key) : null);
    if (userKey) {
      const user = getOrCreateAccumulator(accumulators, 'user', userKey, userKey);
      addFactor(user, factorKey, label, contribution, severityWeight(alert.severity) * ruleWeight(alert.rule_key), lastSeenAt);
    }

    const assetKey = alert.principal_type === 'resource' ? normalizeResource(alert.principal_key) : null;
    if (assetKey) {
      const asset = getOrCreateAccumulator(accumulators, 'asset', assetKey, assetKey);
      addFactor(asset, factorKey, label, contribution, severityWeight(alert.severity) * ruleWeight(alert.rule_key), lastSeenAt);
    }
  }

  for (const finding of findings) {
    const lastSeenAt = toIso(finding.last_event_at);
    const contribution = findingContribution(finding);
    const factorKey = `finding:${finding.rule_key}:${normalizeRiskSeverity(finding.severity)}`;
    const label = `${factorLabelFromRule(finding.rule_key)} detections`;
    addFactor(org, factorKey, label, contribution, severityWeight(finding.severity) * 0.4 * ruleWeight(finding.rule_key), lastSeenAt);

    const userKey = extractFindingUserKey(finding);
    if (userKey) {
      const user = getOrCreateAccumulator(accumulators, 'user', userKey, userKey);
      addFactor(user, factorKey, label, contribution, severityWeight(finding.severity) * 0.4 * ruleWeight(finding.rule_key), lastSeenAt);
    }

    const assetKey = extractFindingAssetKey(finding);
    if (assetKey) {
      const asset = getOrCreateAccumulator(accumulators, 'asset', assetKey, assetKey);
      addFactor(asset, factorKey, label, contribution, severityWeight(finding.severity) * 0.4 * ruleWeight(finding.rule_key), lastSeenAt);
    }
  }

  const openAlertPressure = roundContribution(Math.min(18, (openCriticalAlerts * 6) + (openHighAlerts * 3) + Math.max(0, activeAlertCount - openCriticalAlerts - openHighAlerts)));
  addFactor(org, 'org:open_alert_pressure', 'Open alert pressure', openAlertPressure, 1, org.lastEventAt);

  const results: Array<Omit<RiskScoreRow, 'id' | 'created_at' | 'updated_at'>> = [];
  const calculatedAt = new Date().toISOString();

  for (const accumulator of accumulators.values()) {
    const score = clampScore(accumulator.total);
    const scoreBand = scoreBandForScore(score);
    results.push({
      tenant_id: tenantId,
      entity_type: accumulator.entityType,
      entity_key: accumulator.entityKey,
      entity_label: accumulator.entityLabel,
      score,
      score_band: scoreBand,
      top_factors_json: serializeFactors(accumulator) as Array<Record<string, unknown>>,
      signal_count: accumulator.signalCount,
      last_event_at: accumulator.lastEventAt,
      last_calculated_at: calculatedAt,
    });
  }

  return results;
}

export async function recalculateTenantRiskScores(tenantId: number) {
  const pool = getPool();

  try {
    const calculated = await calculateTenantRiskScores(tenantId);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const retainedKeys = calculated.map((row) => `${row.entity_type}:${row.entity_key}`);
      if (retainedKeys.length > 0) {
        await client.query(
          `DELETE FROM risk_scores
           WHERE tenant_id = $1
             AND (entity_type || ':' || entity_key) <> ALL($2::text[])`,
          [tenantId, retainedKeys],
        );
      } else {
        await client.query('DELETE FROM risk_scores WHERE tenant_id = $1', [tenantId]);
      }

      for (const row of calculated) {
        const existing = await client.query(
          `SELECT id, score, score_band
           FROM risk_scores
           WHERE tenant_id = $1 AND entity_type = $2 AND entity_key = $3
           LIMIT 1`,
          [tenantId, row.entity_type, row.entity_key],
        );

        const prior = existing.rows[0] as { id: number; score: number; score_band: string } | undefined;
        await client.query(
          `INSERT INTO risk_scores (
             tenant_id,
             entity_type,
             entity_key,
             entity_label,
             score,
             score_band,
             top_factors_json,
             signal_count,
             last_event_at,
             last_calculated_at,
             created_at,
             updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
           ON CONFLICT (tenant_id, entity_type, entity_key)
           DO UPDATE SET
             entity_label = EXCLUDED.entity_label,
             score = EXCLUDED.score,
             score_band = EXCLUDED.score_band,
             top_factors_json = EXCLUDED.top_factors_json,
             signal_count = EXCLUDED.signal_count,
             last_event_at = EXCLUDED.last_event_at,
             last_calculated_at = EXCLUDED.last_calculated_at,
             updated_at = NOW()`,
          [
            row.tenant_id,
            row.entity_type,
            row.entity_key,
            row.entity_label,
            row.score,
            row.score_band,
            JSON.stringify(row.top_factors_json ?? []),
            row.signal_count,
            row.last_event_at,
            row.last_calculated_at,
          ],
        );

        console.info('risk_score_calculated', {
          tenantId,
          entityType: row.entity_type,
          entityKey: row.entity_key,
          score: row.score,
          scoreBand: row.score_band,
          signalCount: row.signal_count,
        });

        if (!prior || prior.score !== row.score || prior.score_band !== row.score_band) {
          console.info('risk_score_updated', {
            tenantId,
            entityType: row.entity_type,
            entityKey: row.entity_key,
            previousScore: prior?.score ?? null,
            nextScore: row.score,
            previousBand: prior?.score_band ?? null,
            nextBand: row.score_band,
          });
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => null);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('risk_score_failed', {
      tenantId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

export async function ensureTenantRiskScores(tenantId: number) {
  await recalculateTenantRiskScores(tenantId);
}

export async function getRiskScoreForTenant(tenantId: number, entityType: RiskEntityType, entityKey: string): Promise<RiskScoreRow | null> {
  const normalizedKey = normalizeEntityKey(entityType, entityKey);
  if (!normalizedKey) {
    return null;
  }

  const pool = getPool();
  const result = await pool.query(
    `SELECT *
     FROM risk_scores
     WHERE tenant_id = $1 AND entity_type = $2 AND entity_key = $3
     LIMIT 1`,
    [tenantId, entityType, normalizedKey],
  );

  return (result.rows[0] as RiskScoreRow | undefined) ?? null;
}

export async function listRiskScoresForTenant(input: {
  tenantId: number;
  entityType: Extract<RiskEntityType, 'user' | 'asset'>;
  limit: number;
  cursor?: string | null;
}) {
  const pool = getPool();
  const cursor = decodeCursor(input.cursor);
  const params: unknown[] = [input.tenantId, input.entityType];
  const conditions = ['tenant_id = $1', 'entity_type = $2'];

  if (cursor) {
    params.push(cursor.score, cursor.entityKey);
    conditions.push(`(score < $${params.length - 1} OR (score = $${params.length - 1} AND entity_key > $${params.length}))`);
  }

  params.push(input.limit + 1);

  const result = await pool.query(
    `SELECT *
     FROM risk_scores
     WHERE ${conditions.join(' AND ')}
     ORDER BY score DESC, entity_key ASC
     LIMIT $${params.length}`,
    params,
  );

  const rows = result.rows as RiskScoreRow[];
  const items = rows.slice(0, input.limit);
  const hasMore = rows.length > input.limit;
  const nextCursor = hasMore && items.length > 0
    ? encodeCursor({ score: Number(items[items.length - 1]!.score), entityKey: items[items.length - 1]!.entity_key })
    : null;

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM risk_scores
     WHERE tenant_id = $1 AND entity_type = $2`,
    [input.tenantId, input.entityType],
  );

  return {
    items,
    nextCursor,
    hasMore,
    totalCount: Number(totalResult.rows[0]?.count ?? 0),
  };
}

export async function buildTenantRiskSummary(tenantId: number) {
  const pool = getPool();
  const [orgRow, topUsers, topAssets, alertCounts, connectorHealth, mttdMetrics] = await Promise.all([
    getRiskScoreForTenant(tenantId, 'org', 'org'),
    pool.query(
      `SELECT entity_key
       FROM risk_scores
       WHERE tenant_id = $1 AND entity_type = 'user'
       ORDER BY score DESC, entity_key ASC
       LIMIT 5`,
      [tenantId],
    ),
    pool.query(
      `SELECT entity_key
       FROM risk_scores
       WHERE tenant_id = $1 AND entity_type = 'asset'
       ORDER BY score DESC, entity_key ASC
       LIMIT 5`,
      [tenantId],
    ),
    pool.query(
      `SELECT severity, COUNT(*)::int AS count
       FROM alerts
       WHERE tenant_id = $1 AND status IN ('open', 'in_progress')
       GROUP BY severity`,
      [tenantId],
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE status = 'connected' AND COALESCE(consecutive_errors, 0) = 0)::int AS healthy_count
       FROM connector_configs
       WHERE tenant_id = $1`,
      [tenantId],
    ),
    pool.query(
      `SELECT detection_gap_minutes
       FROM alerts
       WHERE tenant_id = $1
         AND detection_gap_minutes IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1000`,
      [tenantId],
    ),
  ]);

  const openCriticalAlerts = Number(alertCounts.rows.find((row: any) => String(row.severity).toLowerCase() === 'critical')?.count ?? 0);
  const openHighAlerts = Number(alertCounts.rows.find((row: any) => String(row.severity).toLowerCase() === 'high')?.count ?? 0);

  const connectorRow = connectorHealth.rows[0] as { total_count?: number; healthy_count?: number } | undefined;
  const totalConnectors = Number(connectorRow?.total_count ?? 0);
  const healthyConnectors = Number(connectorRow?.healthy_count ?? 0);
  const connectorHealthScore = totalConnectors > 0 ? Math.round((healthyConnectors / totalConnectors) * 100) : 0;

  const userScoresResult = await pool.query(
    `SELECT AVG(score)::numeric(10,2) AS avg_score
     FROM risk_scores
     WHERE tenant_id = $1 AND entity_type = 'user'`,
    [tenantId],
  );

  const avgUserRiskScore = Math.round(Number(userScoresResult.rows[0]?.avg_score ?? 0));
  const mttdValues = (mttdMetrics.rows as Array<{ detection_gap_minutes: number | null }>).map((row) => Number(row.detection_gap_minutes ?? NaN)).filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  const postureScore = Math.max(0, 100 - Number(orgRow?.score ?? 0));

  return {
    postureScore,
    orgRiskScore: Number(orgRow?.score ?? 0),
    orgScoreBand: orgRow?.score_band ?? 'info',
    openCriticalAlerts,
    openHighAlerts,
    avgUserRiskScore,
    topRiskUserIds: topUsers.rows.map((row: any) => String(row.entity_key)),
    topRiskAssetIds: topAssets.rows.map((row: any) => String(row.entity_key)),
    connectorHealthScore,
    mttdP50Minutes: mttdValues.length > 0 ? mttdValues[Math.floor((mttdValues.length - 1) * 0.5)] ?? null : null,
    calculatedAt: toIso(orgRow?.last_calculated_at) ?? new Date().toISOString(),
  };
}

export function normalizeRiskEntityType(value: string | null | undefined): RiskEntityType | null {
  switch ((value ?? '').toLowerCase()) {
    case 'org':
      return 'org';
    case 'user':
    case 'users':
      return 'user';
    case 'asset':
    case 'assets':
      return 'asset';
    default:
      return null;
  }
}

export function normalizeRiskEntityKey(entityType: RiskEntityType, entityKey: string) {
  return normalizeEntityKey(entityType, entityKey);
}