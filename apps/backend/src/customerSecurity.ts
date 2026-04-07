import { Hono } from 'hono';
import { getPool, getUserWorkspaceContext } from './db.js';
import { sendError } from './security.js';

type TenantAccess = {
  userId: number;
  tenantId: number;
  email: string;
  fullName: string;
  tenantName: string;
  tenantSlug: string;
  tenantPlan: string;
  onboardingStatus: string;
  membershipRole: string;
  emailVerified: boolean;
};

type AlertRow = {
  alert_id: string;
  tenant_id: number;
  title: string | null;
  description: string | null;
  severity: string;
  priority: string | null;
  status: string;
  affected_user_id: string | null;
  affected_ip: string | null;
  evidence_json: unknown[] | null;
  mitre_tactics_json: string[] | null;
  mitre_techniques_json: string[] | null;
  detection_gap_minutes: number | null;
  mttd_sla_breached: boolean | null;
  assigned_to: string | null;
  recommended_actions_json: string[] | null;
  first_signal_time: string | Date | null;
  llm_narrative_json: Record<string, unknown> | null;
  llm_narrative_generated_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  resolved_at: string | Date | null;
};

type ConnectorRow = {
  id: number;
  tenant_id: number;
  name: string;
  type: string;
  status: string;
  config_json: Record<string, unknown> | null;
  poll_interval_minutes: number | null;
  last_poll_at: string | Date | null;
  last_event_at: string | Date | null;
  last_error_message: string | null;
  consecutive_errors: number | null;
  event_rate_per_hour: number | null;
  is_enabled: boolean;
  updated_at: string | Date;
};

type InvestigationRow = {
  id: number;
  tenant_id: number;
  alert_id: string;
  alert_title: string | null;
  alert_severity: string | null;
  status: string;
  verdict: string | null;
  confidence: number | null;
  summary: string | null;
  executive_summary: string | null;
  detailed_report: string | null;
  recommendations_json: string[] | null;
  ioc_list_json: string[] | null;
  thoughts_json: unknown[] | null;
  evidence_json: unknown[] | null;
  total_steps: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  agent_model: string | null;
  review_notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function severityToPriority(severity: string): string {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical': return 'P1';
    case 'high': return 'P2';
    case 'medium': return 'P3';
    case 'low': return 'P4';
    default: return 'P5';
  }
}

function severityScore(severity: string): number {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical': return 90;
    case 'high': return 72;
    case 'medium': return 48;
    case 'low': return 22;
    default: return 10;
  }
}

function normalizeAlertStatus(status: string): string {
  const normalized = (status ?? '').toLowerCase();
  if (['open', 'investigating', 'resolved', 'suppressed', 'false_positive'].includes(normalized)) {
    return normalized;
  }
  return 'open';
}

function normalizeConnectorStatus(status: string, isEnabled: boolean): string {
  if (!isEnabled) return 'paused';
  const normalized = (status ?? '').toLowerCase();
  if (['active', 'degraded', 'error', 'configured', 'paused'].includes(normalized)) {
    return normalized;
  }
  return 'configured';
}

function connectorSummary(row: ConnectorRow) {
  const status = normalizeConnectorStatus(row.status, row.is_enabled);
  const lagMinutes = row.last_event_at
    ? Math.max(0, Math.round((Date.now() - new Date(row.last_event_at).getTime()) / 60_000))
    : null;

  return {
    id: String(row.id),
    name: row.name,
    type: row.type,
    status,
    lastPollAt: toIso(row.last_poll_at),
    lastEventAt: toIso(row.last_event_at),
    lastErrorMessage: row.last_error_message,
    consecutiveErrors: Number(row.consecutive_errors ?? 0),
    eventRatePerHour: Number(row.event_rate_per_hour ?? 0),
    isHealthy: status === 'active' && Number(row.consecutive_errors ?? 0) === 0,
    lagMinutes,
  };
}

function alertSummary(row: AlertRow) {
  const severity = (row.severity ?? 'info').toLowerCase();
  return {
    id: row.alert_id,
    tenantId: String(row.tenant_id),
    title: row.title ?? row.description ?? `Security alert ${row.alert_id.slice(0, 8)}`,
    severity,
    priority: row.priority ?? severityToPriority(severity),
    status: normalizeAlertStatus(row.status),
    affectedUserId: row.affected_user_id ?? undefined,
    affectedIp: row.affected_ip ?? undefined,
    mitreTactics: row.mitre_tactics_json ?? [],
    mitreTechniques: row.mitre_techniques_json ?? [],
    detectionGapMinutes: row.detection_gap_minutes ?? undefined,
    mttdSlaBreached: Boolean(row.mttd_sla_breached ?? false),
    assignedTo: row.assigned_to ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    resolvedAt: toIso(row.resolved_at) ?? undefined,
  };
}

function alertDetail(row: AlertRow) {
  return {
    ...alertSummary(row),
    description: row.description ?? row.title ?? 'No description available.',
    evidence: row.evidence_json ?? [],
    llmNarrative: row.llm_narrative_json ?? undefined,
    llmNarrativeGeneratedAt: toIso(row.llm_narrative_generated_at) ?? undefined,
    firstSignalTime: toIso(row.first_signal_time) ?? undefined,
    recommendedActions: row.recommended_actions_json ?? [],
  };
}

function investigationView(row: InvestigationRow) {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    alertId: row.alert_id,
    alertTitle: row.alert_title ?? undefined,
    alertSeverity: row.alert_severity ?? undefined,
    status: row.status,
    verdict: row.verdict,
    confidence: Number(row.confidence ?? 0),
    summary: row.summary ?? undefined,
    executiveSummary: row.executive_summary ?? undefined,
    detailedReport: row.detailed_report ?? undefined,
    recommendations: row.recommendations_json ?? [],
    iocList: row.ioc_list_json ?? [],
    thoughts: row.thoughts_json ?? [],
    evidence: row.evidence_json ?? [],
    totalSteps: Number(row.total_steps ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    durationMs: Number(row.duration_ms ?? 0),
    agentModel: row.agent_model ?? 'zonforge-backend-deterministic-v1',
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function recommendationsForAlert(alert: ReturnType<typeof alertDetail>) {
  const steps = [
    `Review the alert history for ${alert.affectedUserId ?? alert.affectedIp ?? 'the affected entity'}.`,
    'Validate whether the triggering activity is expected or authorized.',
    'Capture analyst notes and escalation context before closing the incident.',
  ];

  if (alert.severity === 'critical') {
    return [
      'Prioritize containment and confirm whether access should be restricted immediately.',
      ...steps,
    ];
  }

  if (alert.severity === 'high') {
    return [
      'Confirm scope and isolate the affected identity or endpoint if risk is still active.',
      ...steps,
    ];
  }

  return steps;
}

function buildInvestigationDraft(alert: ReturnType<typeof alertDetail> | null) {
  const createdAt = new Date();
  const alertSeverity = alert?.severity ?? 'info';
  const confidenceBase = alert ? severityScore(alertSeverity) : 35;
  const confidence = Math.min(92, Math.max(40, confidenceBase - 6));
  const recommendations = alert ? recommendationsForAlert(alert) : [
    'Review the underlying alert context before taking action.',
    'Correlate the incident with recent user activity and IP history.',
    'Document findings and decide whether escalation is required.',
  ];
  const evidence = alert ? [
    {
      title: alert.title,
      description: alert.description,
      supportsTP: ['critical', 'high'].includes(alert.severity),
      supportsFP: alert.status === 'false_positive',
    },
    ...(alert.evidence ?? []).map((item) => ({
      title: 'Alert evidence',
      description: typeof item === 'string' ? item : JSON.stringify(item),
      supportsTP: true,
      supportsFP: false,
    })),
  ] : [];
  const thoughts = [
    {
      type: 'observation',
      content: alert
        ? `Alert ${alert.id} is currently ${alert.status} with severity ${alert.severity}.`
        : 'No alert context was provided for this investigation.',
    },
    {
      type: 'reasoning',
      content: alert
        ? `The current evidence suggests the incident should be triaged around ${alert.affectedUserId ?? alert.affectedIp ?? 'the affected entity'} first.`
        : 'Without alert metadata, the investigation should stay in analyst review until more evidence is collected.',
    },
    {
      type: 'conclusion',
      content: recommendations.join('\n'),
    },
  ];
  const executiveSummary = alert
    ? `${alert.title} is the current focus. Severity is ${alert.severity.toUpperCase()} and the incident remains ${alert.status.replace('_', ' ')}.`
    : 'A manual investigation was created without linked alert context.';
  const summary = alert
    ? `Reviewed ${alert.title}. Primary next step: ${recommendations[0]}`
    : recommendations[0];
  const detailedReport = [
    `Investigation created at ${createdAt.toISOString()}`,
    alert ? `Linked alert: ${alert.id}` : 'Linked alert: none',
    `Executive summary: ${executiveSummary}`,
    '',
    'Recommended actions:',
    ...recommendations.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');

  return {
    alertSeverity,
    confidence,
    status: confidence < 85 ? 'awaiting_approval' : 'completed',
    summary,
    executiveSummary,
    detailedReport,
    recommendations,
    iocList: [alert?.affectedIp, alert?.affectedUserId].filter(Boolean),
    thoughts,
    evidence,
    totalSteps: thoughts.length,
    totalTokens: 0,
    durationMs: 50,
    agentModel: 'zonforge-backend-deterministic-v1',
  };
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * fraction)));
  return values[index] ?? null;
}

async function getTenantAccess(c: any, requireAuthUserId: (c: any) => number | null): Promise<TenantAccess | Response> {
  const userId = requireAuthUserId(c);
  if (!userId) {
    return sendError(c, 401, 'unauthorized', 'Unauthorized');
  }

  const context = await getUserWorkspaceContext(userId);
  if (!context) {
    return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
  }

  return {
    userId,
    tenantId: context.tenant.id,
    email: context.user.email,
    fullName: context.user.fullName?.trim() || context.user.email.split('@')[0] || 'User',
    tenantName: context.tenant.name,
    tenantSlug: context.tenant.slug ?? '',
    tenantPlan: context.tenant.plan ?? 'starter',
    onboardingStatus: context.tenant.onboardingStatus ?? 'pending',
    membershipRole: context.membership?.role ?? 'owner',
    emailVerified: context.user.emailVerified,
  };
}

async function getAlertForTenant(tenantId: number, alertId: string): Promise<AlertRow | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT *
     FROM security_alerts
     WHERE tenant_id = $1 AND alert_id = $2
     LIMIT 1`,
    [tenantId, alertId],
  );
  return (result.rows[0] as AlertRow | undefined) ?? null;
}

async function getConnectorsForTenant(tenantId: number): Promise<ConnectorRow[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT *
     FROM connector_configs
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId],
  );
  return result.rows as ConnectorRow[];
}

async function buildRiskSummary(tenantId: number) {
  const pool = getPool();
  const [alertCounts, riskyUsers, connectors] = await Promise.all([
    pool.query(
      `SELECT severity, COUNT(*)::int AS count
       FROM security_alerts
       WHERE tenant_id = $1 AND status IN ('open', 'investigating')
       GROUP BY severity`,
      [tenantId],
    ),
    pool.query(
      `SELECT affected_user_id,
              AVG(CASE severity
                    WHEN 'critical' THEN 90
                    WHEN 'high' THEN 72
                    WHEN 'medium' THEN 48
                    WHEN 'low' THEN 22
                    ELSE 10 END)::numeric(10,2) AS avg_score
       FROM security_alerts
       WHERE tenant_id = $1
         AND affected_user_id IS NOT NULL
         AND status IN ('open', 'investigating')
       GROUP BY affected_user_id
       ORDER BY avg_score DESC
       LIMIT 5`,
      [tenantId],
    ),
    getConnectorsForTenant(tenantId),
  ]);

  const critical = Number(alertCounts.rows.find((row: any) => row.severity === 'critical')?.count ?? 0);
  const high = Number(alertCounts.rows.find((row: any) => row.severity === 'high')?.count ?? 0);
  const scores = riskyUsers.rows.map((row: any) => Number(row.avg_score ?? 0)).filter((value: number) => Number.isFinite(value));
  const avgUserRiskScore = scores.length > 0
    ? Math.round(scores.reduce((sum: number, value: number) => sum + value, 0) / scores.length)
    : 0;
  const connectorSummaries = connectors.map(connectorSummary);
  const healthyConnectors = connectorSummaries.filter((item) => item.isHealthy).length;
  const connectorHealthScore = connectorSummaries.length > 0
    ? Math.round((healthyConnectors / connectorSummaries.length) * 100)
    : 0;

  return {
    postureScore: 0,
    openCriticalAlerts: critical,
    openHighAlerts: high,
    avgUserRiskScore,
    topRiskUserIds: riskyUsers.rows.map((row: any) => String(row.affected_user_id)),
    topRiskAssetIds: [],
    connectorHealthScore,
    mttdP50Minutes: null,
    calculatedAt: new Date().toISOString(),
  };
}

async function buildAssistantReply(tenantId: number, message: string) {
  const normalized = message.trim().toLowerCase();
  const pool = getPool();
  const [latestAlertRow, riskSummary, investigationRows, connectors] = await Promise.all([
    pool.query(
      `SELECT *
       FROM security_alerts
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    ),
    buildRiskSummary(tenantId),
    pool.query(
      `SELECT *
       FROM ai_investigations
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [tenantId],
    ),
    getConnectorsForTenant(tenantId),
  ]);

  const latestAlert = latestAlertRow.rows[0] ? alertDetail(latestAlertRow.rows[0] as AlertRow) : null;
  const investigations = (investigationRows.rows as InvestigationRow[]).map(investigationView);
  const toolsUsed: string[] = [];

  if (latestAlert) toolsUsed.push('alerts');
  if (investigations.length > 0) toolsUsed.push('investigations');
  toolsUsed.push('risk-summary');

  if ((normalized.includes('latest alert') || normalized.includes('explain')) && latestAlert) {
    return {
      message: `${latestAlert.title} is the latest alert. Severity is ${latestAlert.severity.toUpperCase()}, status is ${latestAlert.status.replace('_', ' ')}, and the primary recommendation is: ${recommendationsForAlert(latestAlert)[0]}`,
      toolsUsed,
    };
  }

  if (normalized.includes('summarize') && normalized.includes('risk')) {
    return {
      message: `Current posture data shows ${riskSummary.openCriticalAlerts} critical alerts and ${riskSummary.openHighAlerts} high alerts. Average user risk is ${riskSummary.avgUserRiskScore}/100, connector health is ${riskSummary.connectorHealthScore}%, and ${investigations.length} recent investigations are available for review.`,
      toolsUsed,
    };
  }

  if (normalized.includes('what should i do first') || normalized.includes('do first') || normalized.includes('priority')) {
    if (latestAlert) {
      return {
        message: `Start with ${latestAlert.title}. Confirm whether ${latestAlert.affectedUserId ?? latestAlert.affectedIp ?? 'the affected entity'} should be contained, then review the most recent investigation and validate connector coverage before closing the incident.`,
        toolsUsed,
      };
    }

    if (connectors.length === 0) {
      return {
        message: 'No alerts are active right now. The first priority is connecting a data source so the platform can start collecting real security telemetry.',
        toolsUsed: ['connectors'],
      };
    }
  }

  return {
    message: latestAlert
      ? `I can help with ${latestAlert.title}, summarize current risk, or walk through the ${investigations.length} most recent investigations. Ask about the latest alert, your risk summary, or first-response priorities.`
      : 'I can summarize your current risk, explain recent investigations, and point out the next operational step based on your connector and alert state.',
    toolsUsed,
  };
}

export function createCustomerSecurityRouter(requireAuthUserId: (c: any) => number | null) {
  const router = new Hono();

  router.get('/v1/auth/me', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    return c.json({
      user: {
        id: String(access.userId),
        email: access.email,
        fullName: access.fullName,
        name: access.fullName,
        status: 'active',
        emailVerified: access.emailVerified,
      },
      tenant: {
        id: String(access.tenantId),
        name: access.tenantName,
        slug: access.tenantSlug,
        plan: access.tenantPlan,
        onboardingStatus: access.onboardingStatus,
      },
      membership: {
        role: access.membershipRole,
      },
      id: String(access.userId),
      email: access.email,
      name: access.fullName,
      role: access.membershipRole,
      tenantId: String(access.tenantId),
      mfaEnabled: false,
    });
  });

  router.get('/v1/onboarding/status', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const pool = getPool();
    const stepsResult = await pool.query(
      `SELECT step_key, is_complete, payload_json, updated_at
       FROM onboarding_progress
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC`,
      [access.tenantId],
    );

    const steps = stepsResult.rows.map((row: any) => ({
      stepKey: String(row.step_key),
      isComplete: Boolean(row.is_complete),
      payload: row.payload_json ?? null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    }));

    return c.json({
      tenantId: String(access.tenantId),
      onboardingStatus: access.onboardingStatus,
      steps,
    });
  });

  router.get('/v1/alerts', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const severity = c.req.query('severity');
    const status = c.req.query('status');
    const priority = c.req.query('priority');
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), 100);

    const conditions = ['tenant_id = $1'];
    const params: unknown[] = [access.tenantId];

    if (severity) {
      params.push(String(severity).toLowerCase());
      conditions.push(`severity = $${params.length}`);
    }
    if (status) {
      params.push(String(status).toLowerCase());
      conditions.push(`status = $${params.length}`);
    }
    if (priority) {
      params.push(String(priority).toUpperCase());
      conditions.push(`priority = $${params.length}`);
    }

    params.push(limit + 1);

    const pool = getPool();
    const result = await pool.query(
      `SELECT *
       FROM security_alerts
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    const rows = result.rows as AlertRow[];
    const items = rows.slice(0, limit).map(alertSummary);

    return c.json({
      items,
      nextCursor: rows.length > limit ? items[items.length - 1]?.createdAt ?? null : null,
      hasMore: rows.length > limit,
      totalCount: items.length,
    });
  });

  router.get('/v1/alerts/:id', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const alert = await getAlertForTenant(access.tenantId, c.req.param('id'));
    if (!alert) {
      return sendError(c, 404, 'not_found', 'Alert not found');
    }

    return c.json(alertDetail(alert));
  });

  router.patch('/v1/alerts/:id/status', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const alertId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const status = normalizeAlertStatus(String(body.status ?? 'open'));

    const pool = getPool();
    const result = await pool.query(
      `UPDATE security_alerts
       SET status = $3,
           resolved_at = CASE WHEN $3 = 'resolved' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE tenant_id = $1 AND alert_id = $2
       RETURNING alert_id`,
      [access.tenantId, alertId, status],
    );

    if (result.rowCount === 0) {
      return sendError(c, 404, 'not_found', 'Alert not found');
    }

    return c.json({ updated: true });
  });

  router.post('/v1/alerts/:id/feedback', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const alert = await getAlertForTenant(access.tenantId, c.req.param('id'));
    if (!alert) {
      return sendError(c, 404, 'not_found', 'Alert not found');
    }

    return c.json({ feedback_saved: true });
  });

  router.post('/v1/alerts/:id/assign', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const body = await c.req.json().catch(() => ({}));
    const analystId = typeof body.analystId === 'string' ? body.analystId.trim() : '';

    const pool = getPool();
    const result = await pool.query(
      `UPDATE security_alerts
       SET assigned_to = $3,
           updated_at = NOW()
       WHERE tenant_id = $1 AND alert_id = $2
       RETURNING alert_id`,
      [access.tenantId, c.req.param('id'), analystId || access.email],
    );

    if (result.rowCount === 0) {
      return sendError(c, 404, 'not_found', 'Alert not found');
    }

    return c.json({ assigned: true });
  });

  router.get('/v1/risk/summary', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    return c.json(await buildRiskSummary(access.tenantId));
  });

  router.get('/v1/metrics/mttd', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const pool = getPool();
    const result = await pool.query(
      `SELECT priority, detection_gap_minutes
       FROM security_alerts
       WHERE tenant_id = $1
         AND detection_gap_minutes IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1000`,
      [access.tenantId],
    );

    const grouped = new Map<string, number[]>();
    for (const row of result.rows as Array<{ priority: string | null; detection_gap_minutes: number | null }>) {
      const priority = (row.priority ?? 'P3').toUpperCase();
      const gap = Number(row.detection_gap_minutes ?? NaN);
      if (!Number.isFinite(gap) || gap < 0) continue;

      const values = grouped.get(priority) ?? [];
      values.push(gap);
      grouped.set(priority, values);
    }

    const metrics = Object.fromEntries(
      Array.from(grouped.entries()).map(([priority, values]) => {
        const sorted = values.slice().sort((left, right) => left - right);
        return [priority, {
          p50: percentile(sorted, 0.5),
          p75: percentile(sorted, 0.75),
          p90: percentile(sorted, 0.9),
          p95: percentile(sorted, 0.95),
          p99: percentile(sorted, 0.99),
          count: sorted.length,
        }];
      }),
    );

    return c.json(metrics);
  });

  router.get('/v1/connectors', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const connectors = await getConnectorsForTenant(access.tenantId);
    return c.json(connectors.map(connectorSummary));
  });

  router.post('/v1/connectors', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    if (!name || !type) {
      return sendError(c, 400, 'invalid_connector', 'name and type are required');
    }

    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO connector_configs (
         tenant_id, name, type, status, config_json, poll_interval_minutes, is_enabled
       ) VALUES ($1, $2, $3, 'configured', $4, $5, true)
       RETURNING id`,
      [
        access.tenantId,
        name,
        type,
        typeof body.config === 'object' && body.config ? JSON.stringify(body.config) : JSON.stringify({}),
        Number(body.pollIntervalMinutes ?? 15),
      ],
    );

    return c.json({ connectorId: String(result.rows[0].id) }, 201);
  });

  router.get('/v1/connectors/:id/validate', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const pool = getPool();
    const result = await pool.query(
      `SELECT *
       FROM connector_configs
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [access.tenantId, Number(c.req.param('id'))],
    );

    const row = result.rows[0] as ConnectorRow | undefined;
    if (!row) {
      return sendError(c, 404, 'not_found', 'Connector not found');
    }

    return c.json({
      valid: true,
      status: normalizeConnectorStatus(row.status, row.is_enabled),
      message: row.last_error_message ? 'Connector has recorded an error state.' : 'Connector configuration is reachable.',
      latencyMs: 0,
      sampleEventCount: 0,
      lastEventAt: toIso(row.last_event_at),
      errors: row.last_error_message ? [row.last_error_message] : [],
    });
  });

  router.patch('/v1/connectors/:id', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const body = await c.req.json().catch(() => ({}));
    const updates: string[] = [];
    const params: unknown[] = [access.tenantId, Number(c.req.param('id'))];

    if (typeof body.name === 'string' && body.name.trim()) {
      params.push(body.name.trim());
      updates.push(`name = $${params.length}`);
    }
    if (typeof body.status === 'string' && body.status.trim()) {
      params.push(body.status.trim().toLowerCase());
      updates.push(`status = $${params.length}`);
    }
    if (typeof body.config === 'object' && body.config) {
      params.push(JSON.stringify(body.config));
      updates.push(`config_json = $${params.length}`);
    }
    if (typeof body.enabled === 'boolean') {
      params.push(body.enabled);
      updates.push(`is_enabled = $${params.length}`);
    }

    if (updates.length === 0) {
      return c.json({ updated: true });
    }

    params.push(new Date().toISOString());
    const pool = getPool();
    const result = await pool.query(
      `UPDATE connector_configs
       SET ${updates.join(', ')}, updated_at = $${params.length}
       WHERE tenant_id = $1 AND id = $2
       RETURNING id`,
      params,
    );

    if (result.rowCount === 0) {
      return sendError(c, 404, 'not_found', 'Connector not found');
    }

    return c.json({ updated: true });
  });

  router.get('/v1/health/pipeline', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const details = (await getConnectorsForTenant(access.tenantId)).map(connectorSummary);
    const healthy = details.filter((item) => item.isHealthy).length;
    const degraded = details.filter((item) => item.status === 'degraded' || item.consecutiveErrors > 0).length;
    const error = details.filter((item) => item.status === 'error').length;

    return c.json({
      connectors: {
        total: details.length,
        healthy,
        degraded,
        error,
        details,
      },
      queues: {},
      summary: {
        overallStatus: error > 0 ? 'error' : degraded > 0 ? 'degraded' : 'healthy',
      },
    });
  });

  router.get('/v1/assistant/suggestions', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const risk = await buildRiskSummary(access.tenantId);
    const suggestions = [
      'Explain latest alert',
      'Summarize my risk',
      'What should I do first?',
    ];

    if (risk.openCriticalAlerts > 0) {
      suggestions.unshift(`Focus on ${risk.openCriticalAlerts} critical alerts`);
    }

    return c.json({ suggestions: Array.from(new Set(suggestions)).slice(0, 5) });
  });

  router.post('/v1/assistant/chat', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const body = await c.req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const latest = messages.filter((item: any) => item?.role === 'user').at(-1);
    const prompt = typeof latest?.content === 'string' ? latest.content : '';

    if (!prompt.trim()) {
      return sendError(c, 400, 'invalid_request', 'messages must include a user prompt');
    }

    const reply = await buildAssistantReply(access.tenantId, prompt);
    return c.json({
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      message: reply.message,
      model: 'zonforge-backend-deterministic-v1',
      toolsUsed: reply.toolsUsed,
    });
  });

  router.get('/v1/investigations', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), 100);
    const pool = getPool();
    const result = await pool.query(
      `SELECT *
       FROM ai_investigations
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [access.tenantId, limit],
    );

    return c.json((result.rows as InvestigationRow[]).map(investigationView));
  });

  router.get('/v1/investigations/stats', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const pool = getPool();
    const result = await pool.query(
      `SELECT
          COUNT(*)::int AS total_investigations,
          COUNT(*) FILTER (WHERE verdict = 'true_positive')::int AS true_positives,
          COUNT(*) FILTER (WHERE verdict = 'false_positive')::int AS false_positives,
          COUNT(*) FILTER (WHERE status = 'awaiting_approval')::int AS pending_review
       FROM ai_investigations
       WHERE tenant_id = $1`,
      [access.tenantId],
    );

    const row = result.rows[0] as Record<string, number | string>;
    const totalInvestigations = Number(row.total_investigations ?? 0);
    const truePositives = Number(row.true_positives ?? 0);
    const falsePositives = Number(row.false_positives ?? 0);
    const pendingReview = Number(row.pending_review ?? 0);

    return c.json({
      totalInvestigations,
      truePositives,
      falsePositives,
      pendingReview,
      tpRate: totalInvestigations > 0 ? Math.round((truePositives / totalInvestigations) * 100) : 0,
      fpRate: totalInvestigations > 0 ? Math.round((falsePositives / totalInvestigations) * 100) : 0,
      period: 'all_time',
    });
  });

  router.get('/v1/investigations/:id', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const pool = getPool();
    const result = await pool.query(
      `SELECT *
       FROM ai_investigations
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [access.tenantId, Number(c.req.param('id'))],
    );

    const investigation = result.rows[0] as InvestigationRow | undefined;
    if (!investigation) {
      return sendError(c, 404, 'not_found', 'Investigation not found');
    }

    return c.json(investigationView(investigation));
  });

  router.post('/v1/investigations', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const body = await c.req.json().catch(() => ({}));
    const alertId = typeof body.alertId === 'string' ? body.alertId.trim() : '';
    if (!alertId) {
      return sendError(c, 400, 'invalid_request', 'alertId is required');
    }

    const alert = await getAlertForTenant(access.tenantId, alertId);
    const draft = buildInvestigationDraft(alert ? alertDetail(alert) : null);
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO ai_investigations (
         tenant_id,
         alert_id,
         alert_title,
         alert_severity,
         status,
         confidence,
         summary,
         executive_summary,
         detailed_report,
         recommendations_json,
         ioc_list_json,
         thoughts_json,
         evidence_json,
         total_steps,
         total_tokens,
         duration_ms,
         agent_model
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
       )
       RETURNING id, status`,
      [
        access.tenantId,
        alertId,
        alert?.title ?? null,
        alert?.severity ?? null,
        draft.status,
        draft.confidence,
        draft.summary,
        draft.executiveSummary,
        draft.detailedReport,
        JSON.stringify(draft.recommendations),
        JSON.stringify(draft.iocList),
        JSON.stringify(draft.thoughts),
        JSON.stringify(draft.evidence),
        draft.totalSteps,
        draft.totalTokens,
        draft.durationMs,
        draft.agentModel,
      ],
    );

    return c.json({
      investigationId: String(result.rows[0].id),
      status: result.rows[0].status,
      message: draft.summary,
    }, 201);
  });

  router.post('/v1/investigations/:id/review', async (c) => {
    const access = await getTenantAccess(c, requireAuthUserId);
    if (access instanceof Response) return access;

    const body = await c.req.json().catch(() => ({}));
    const verdict = typeof body.verdict === 'string' ? body.verdict.trim() : '';
    if (!verdict) {
      return sendError(c, 400, 'invalid_request', 'verdict is required');
    }

    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
    const pool = getPool();
    const result = await pool.query(
      `UPDATE ai_investigations
       SET verdict = $3,
           status = 'completed',
           review_notes = $4,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id`,
      [access.tenantId, Number(c.req.param('id')), verdict, notes],
    );

    if (result.rowCount === 0) {
      return sendError(c, 404, 'not_found', 'Investigation not found');
    }

    return c.json({ reviewed: true });
  });

  return router;
}