import { getPool } from '../db.js';

export type LockedPlanCode = 'free' | 'starter' | 'growth' | 'business' | 'enterprise';
export type TenantPlanStatus = 'active' | 'canceled' | 'trial';
export type PlanFeatureKey = 'detections' | 'alerts' | 'risk' | 'investigation' | 'ai';
export type PlanFeatureLevel = boolean | 'basic' | 'limited' | 'full';
export type PlanLimitKey = 'max_connectors' | 'max_identities' | 'events_per_minute';

export type PlanFeatures = {
  detections: 'basic' | 'full';
  alerts: boolean | 'basic' | 'full';
  risk: boolean | 'limited' | 'full';
  investigation: boolean | 'basic' | 'full';
  ai: boolean;
  sso?: boolean;
  compliance?: boolean;
  sla?: boolean;
  dedicated_support?: boolean;
  full_platform?: boolean;
};

export type PlanLimits = {
  max_connectors: number | null;
  max_identities: number | null;
  events_per_minute: number | null;
  retention_days: number | null;
};

export type TenantPlanUsage = {
  connectors: number;
  identities: number;
  eventsPerMinute: number;
};

export type PlanCatalogItem = {
  id: number;
  code: LockedPlanCode;
  name: string;
  priceMonthly: number | null;
  limits: PlanLimits;
  features: PlanFeatures;
  isActive: boolean;
};

export type TenantPlanState = {
  tenantId: number;
  status: TenantPlanStatus;
  startedAt: string | null;
  expiresAt: string | null;
  plan: PlanCatalogItem;
  limits: PlanLimits;
  features: PlanFeatures;
  usage: TenantPlanUsage;
};

type SeedPlan = {
  code: LockedPlanCode;
  name: string;
  priceMonthly: number | null;
  maxConnectors: number | null;
  maxIdentities: number | null;
  eventsPerMinute: number | null;
  retentionDays: number | null;
  description: string;
  features: PlanFeatures;
};

type TenantPlanRow = {
  tenant_id: number;
  plan_status: string | null;
  started_at: string | Date | null;
  expires_at: string | Date | null;
  plan_id: number;
  plan_code: LockedPlanCode;
  plan_name: string;
  price_monthly: number | string | null;
  max_connectors: number | null;
  max_identities: number | null;
  events_per_minute: number | null;
  retention_days: number | null;
  features_json: unknown;
  is_active: boolean;
};

const PLAN_ORDER: LockedPlanCode[] = ['free', 'starter', 'growth', 'business', 'enterprise'];
const UNLIMITED_LIMIT = 1_000_000_000;

export const LOCKED_PLAN_CATALOG: ReadonlyArray<SeedPlan> = [
  {
    code: 'free',
    name: 'Free',
    priceMonthly: 0,
    maxConnectors: 1,
    maxIdentities: 50,
    eventsPerMinute: 500,
    retentionDays: 30,
    description: 'Free tier for initial workspace onboarding and basic monitoring.',
    features: {
      detections: 'basic',
      alerts: 'basic',
      risk: false,
      investigation: false,
      ai: false,
    },
  },
  {
    code: 'starter',
    name: 'Starter',
    priceMonthly: 49,
    maxConnectors: 2,
    maxIdentities: 100,
    eventsPerMinute: 1000,
    retentionDays: 30,
    description: 'Starter operations tier with alerting and limited risk visibility.',
    features: {
      detections: 'basic',
      alerts: true,
      risk: 'limited',
      investigation: false,
      ai: false,
    },
  },
  {
    code: 'growth',
    name: 'Growth',
    priceMonthly: 199,
    maxConnectors: 3,
    maxIdentities: 200,
    eventsPerMinute: 2000,
    retentionDays: 90,
    description: 'Growth tier with full detections, alerts, risk, and basic investigations.',
    features: {
      detections: 'full',
      alerts: 'full',
      risk: true,
      investigation: 'basic',
      ai: false,
    },
  },
  {
    code: 'business',
    name: 'Business',
    priceMonthly: 499,
    maxConnectors: 10,
    maxIdentities: 1000,
    eventsPerMinute: 10000,
    retentionDays: 180,
    description: 'Business tier with full platform access and AI-enabled workflows.',
    features: {
      detections: 'full',
      alerts: 'full',
      risk: 'full',
      investigation: 'full',
      ai: true,
    },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null,
    maxConnectors: null,
    maxIdentities: null,
    eventsPerMinute: null,
    retentionDays: null,
    description: 'Enterprise tier with negotiated limits, SSO, compliance, SLA, and dedicated support.',
    features: {
      detections: 'full',
      alerts: 'full',
      risk: 'full',
      investigation: 'full',
      ai: true,
      sso: true,
      compliance: true,
      sla: true,
      dedicated_support: true,
      full_platform: true,
    },
  },
];

function planRank(code: LockedPlanCode): number {
  const rank = PLAN_ORDER.indexOf(code);
  return rank >= 0 ? rank : 0;
}

function normalizeFeatures(value: unknown): PlanFeatures {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return LOCKED_PLAN_CATALOG[0].features;
  }

  const record = value as Record<string, unknown>;
  return {
    detections: record.detections === 'full' ? 'full' : 'basic',
    alerts: record.alerts === 'full' ? 'full' : record.alerts === 'basic' ? 'basic' : Boolean(record.alerts),
    risk: record.risk === 'full' ? 'full' : record.risk === 'limited' ? 'limited' : Boolean(record.risk),
    investigation: record.investigation === 'full'
      ? 'full'
      : record.investigation === 'basic'
        ? 'basic'
        : Boolean(record.investigation),
    ai: Boolean(record.ai),
    sso: Boolean(record.sso),
    compliance: Boolean(record.compliance),
    sla: Boolean(record.sla),
    dedicated_support: Boolean(record.dedicated_support),
    full_platform: Boolean(record.full_platform),
  };
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function toCatalogItem(row: TenantPlanRow): PlanCatalogItem {
  return {
    id: Number(row.plan_id),
    code: row.plan_code,
    name: row.plan_name,
    priceMonthly: row.price_monthly == null ? null : Number(row.price_monthly),
    limits: {
      max_connectors: row.max_connectors == null ? null : Number(row.max_connectors),
      max_identities: row.max_identities == null ? null : Number(row.max_identities),
      events_per_minute: row.events_per_minute == null ? null : Number(row.events_per_minute),
      retention_days: row.retention_days == null ? null : Number(row.retention_days),
    },
    features: normalizeFeatures(row.features_json),
    isActive: Boolean(row.is_active),
  };
}

async function getTenantUsage(tenantId: number): Promise<TenantPlanUsage> {
  const pool = getPool();
  const hourStart = new Date();
  hourStart.setMinutes(0, 0, 0);

  const [connectorsResult, identitiesResult, eventsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS count
       FROM connector_configs
       WHERE tenant_id = $1`,
      [tenantId],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT user_id) AS count
       FROM tenant_memberships
       WHERE tenant_id = $1`,
      [tenantId],
    ),
    pool.query(
      `SELECT COALESCE(current_value, 0) AS count
       FROM usage_counters
       WHERE tenant_id = $1
         AND metric_code = 'EVENTS_PER_MIN'
         AND period = 'hour'
         AND period_start = $2
       LIMIT 1`,
      [tenantId, hourStart],
    ),
  ]);

  return {
    connectors: Number(connectorsResult.rows[0]?.count ?? 0),
    identities: Number(identitiesResult.rows[0]?.count ?? 0),
    eventsPerMinute: Number(eventsResult.rows[0]?.count ?? 0),
  };
}

export function normalizePlanCode(value: string | null | undefined): LockedPlanCode {
  const normalized = String(value ?? 'free').trim().toLowerCase();
  if (PLAN_ORDER.includes(normalized as LockedPlanCode)) {
    return normalized as LockedPlanCode;
  }

  return 'free';
}

export function getSeedPlanByCode(code: LockedPlanCode): SeedPlan {
  return LOCKED_PLAN_CATALOG.find((plan) => plan.code === code) ?? LOCKED_PLAN_CATALOG[0];
}

export async function writePlanAuditLog(input: {
  tenantId: number;
  actorUserId?: number | null;
  eventType: string;
  source?: string;
  requestId?: string | null;
  previousPlan?: string | null;
  nextPlan?: string | null;
  featureKey?: string | null;
  limitKey?: string | null;
  message: string;
  payload?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO billing_audit_logs (
      tenant_id,
      user_id,
      event_type,
      source,
      message,
      plan_code,
      payload_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.tenantId,
      input.actorUserId ?? null,
      input.eventType,
      input.source ?? 'plan_service',
      input.message,
      input.nextPlan ?? input.previousPlan ?? null,
      JSON.stringify({
        previous_plan: input.previousPlan ?? null,
        next_plan: input.nextPlan ?? null,
        feature_key: input.featureKey ?? null,
        limit_key: input.limitKey ?? null,
        request_id: input.requestId ?? null,
        ...(input.payload ?? {}),
      }),
    ],
  );
}

async function getPlanIdByCode(clientLike: { query: typeof getPool extends () => infer P ? P extends { query: infer Q } ? Q : never : never }, code: LockedPlanCode): Promise<number> {
  const result = await clientLike.query(
    `SELECT id
     FROM plans
     WHERE code = $1
     LIMIT 1`,
    [code],
  );

  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Plan ${code} is missing from plans table`);
  }

  return Number(id);
}

async function upsertLegacyTenantSubscription(clientLike: { query: typeof getPool extends () => infer P ? P extends { query: infer Q } ? Q : never : never }, tenantId: number, planId: number, status: TenantPlanStatus) {
  const mappedStatus = status === 'trial' ? 'trialing' : status === 'canceled' ? 'canceled' : 'active';
  await clientLike.query(
    `INSERT INTO tenant_subscriptions (
      tenant_id,
      plan_id,
      subscription_status,
      current_period_start,
      updated_at
    ) VALUES ($1,$2,$3,NOW(),NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      subscription_status = EXCLUDED.subscription_status,
      updated_at = NOW()`,
    [tenantId, planId, mappedStatus],
  );
}

async function queryTenantPlanRow(tenantId: number): Promise<TenantPlanRow | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       t.id AS tenant_id,
       COALESCE(active_tp.status, 'active') AS plan_status,
       active_tp.started_at,
       active_tp.expires_at,
       p.id AS plan_id,
       p.code AS plan_code,
       p.name AS plan_name,
       p.price_monthly,
       p.max_connectors,
       p.max_identities,
       p.events_per_minute,
       p.retention_days,
       p.features_json,
       p.is_active
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT tp.plan_id, tp.status, tp.started_at, tp.expires_at
       FROM tenant_plans tp
       WHERE tp.tenant_id = t.id
       ORDER BY
         CASE tp.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 ELSE 2 END,
         tp.started_at DESC,
         tp.id DESC
       LIMIT 1
     ) active_tp ON TRUE
     LEFT JOIN plans p
       ON p.id = COALESCE(t.current_plan_id, active_tp.plan_id)
     WHERE t.id = $1
     LIMIT 1`,
    [tenantId],
  );

  return (result.rows[0] as TenantPlanRow | undefined) ?? null;
}

export async function ensureTenantPlanAssigned(
  tenantId: number,
  actorUserId?: number | null,
  requestId?: string | null,
): Promise<TenantPlanState> {
  const existing = await queryTenantPlanRow(tenantId);
  if (existing?.plan_id) {
    return getTenantPlanState(tenantId);
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const freePlanId = await getPlanIdByCode(client, 'free');
    await client.query(
      `INSERT INTO tenant_plans (
        tenant_id,
        plan_id,
        status,
        started_at,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,NOW(),NOW(),NOW())`,
      [tenantId, freePlanId, 'active'],
    );
    await client.query(
      `UPDATE tenants
       SET current_plan_id = $1,
           plan = 'free',
           updated_at = NOW()
       WHERE id = $2`,
      [freePlanId, tenantId],
    );
    await upsertLegacyTenantSubscription(client, tenantId, freePlanId, 'active');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await writePlanAuditLog({
    tenantId,
    actorUserId,
    eventType: 'plan_assigned',
    requestId,
    previousPlan: null,
    nextPlan: 'free',
    message: 'Default FREE plan assigned to tenant.',
  });

  return getTenantPlanState(tenantId);
}

export async function getTenantPlanState(tenantId: number): Promise<TenantPlanState> {
  const row = await queryTenantPlanRow(tenantId);
  if (!row?.plan_id) {
    return ensureTenantPlanAssigned(tenantId);
  }

  const plan = toCatalogItem(row);
  const usage = await getTenantUsage(tenantId);

  return {
    tenantId,
    status: (row.plan_status === 'trial' || row.plan_status === 'canceled') ? row.plan_status : 'active',
    startedAt: toIso(row.started_at),
    expiresAt: toIso(row.expires_at),
    plan,
    limits: plan.limits,
    features: plan.features,
    usage,
  };
}

export async function getActivePlans(): Promise<PlanCatalogItem[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       id AS plan_id,
       code AS plan_code,
       name AS plan_name,
       price_monthly,
       max_connectors,
       max_identities,
       events_per_minute,
       retention_days,
       features_json,
       is_active
     FROM plans
     WHERE is_active = true`,
  );

  return (result.rows as Array<{
    plan_id: number;
    plan_code: LockedPlanCode;
    plan_name: string;
    price_monthly: number | string | null;
    max_connectors: number | null;
    max_identities: number | null;
    events_per_minute: number | null;
    retention_days: number | null;
    features_json: unknown;
    is_active: boolean;
  }>).map((row) => ({
    id: Number(row.plan_id),
    code: normalizePlanCode(row.plan_code),
    name: row.plan_name,
    priceMonthly: row.price_monthly == null ? null : Number(row.price_monthly),
    limits: {
      max_connectors: row.max_connectors == null ? null : Number(row.max_connectors),
      max_identities: row.max_identities == null ? null : Number(row.max_identities),
      events_per_minute: row.events_per_minute == null ? null : Number(row.events_per_minute),
      retention_days: row.retention_days == null ? null : Number(row.retention_days),
    },
    features: normalizeFeatures(row.features_json),
    isActive: Boolean(row.is_active),
  })).sort((left, right) => planRank(left.code) - planRank(right.code));
}

export async function assignTenantPlan(input: {
  tenantId: number;
  planCode: LockedPlanCode;
  actorUserId: number;
  requestId?: string | null;
  status?: TenantPlanStatus;
  expiresAt?: string | null;
}): Promise<TenantPlanState> {
  const previous = await getTenantPlanState(input.tenantId);
  const nextCode = normalizePlanCode(input.planCode);
  const nextStatus = input.status ?? 'active';
  if (previous.plan.code === nextCode && previous.status === nextStatus) {
    return previous;
  }

  const pool = getPool();
  const client = await pool.connect();
  let nextPlanId = 0;

  try {
    await client.query('BEGIN');
    nextPlanId = await getPlanIdByCode(client, nextCode);
    await client.query(
      `UPDATE tenant_plans
       SET status = 'canceled',
           updated_at = NOW(),
           expires_at = COALESCE(expires_at, NOW())
       WHERE tenant_id = $1
         AND status IN ('active', 'trial')`,
      [input.tenantId],
    );
    await client.query(
      `INSERT INTO tenant_plans (
        tenant_id,
        plan_id,
        status,
        started_at,
        expires_at,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,NOW(),$4,NOW(),NOW())`,
      [input.tenantId, nextPlanId, nextStatus, input.expiresAt ?? null],
    );
    await client.query(
      `UPDATE tenants
       SET current_plan_id = $1,
           plan = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [nextPlanId, nextCode, input.tenantId],
    );
    await upsertLegacyTenantSubscription(client, input.tenantId, nextPlanId, nextStatus);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const eventType = planRank(nextCode) > planRank(previous.plan.code) ? 'plan_upgraded' : 'plan_downgraded';
  await writePlanAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    eventType,
    requestId: input.requestId,
    previousPlan: previous.plan.code,
    nextPlan: nextCode,
    message: `Tenant plan changed from ${previous.plan.code} to ${nextCode}.`,
    payload: {
      plan_status: nextStatus,
    },
  });

  return getTenantPlanState(input.tenantId);
}

export async function cancelTenantPlan(input: {
  tenantId: number;
  actorUserId: number;
  requestId?: string | null;
}): Promise<TenantPlanState> {
  const current = await getTenantPlanState(input.tenantId);
  if (current.plan.code === 'free') {
    return current;
  }

  const next = await assignTenantPlan({
    tenantId: input.tenantId,
    planCode: 'free',
    actorUserId: input.actorUserId,
    requestId: input.requestId,
  });

  await writePlanAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    eventType: 'plan_canceled',
    requestId: input.requestId,
    previousPlan: current.plan.code,
    nextPlan: next.plan.code,
    message: `Tenant plan canceled and downgraded from ${current.plan.code} to free.`,
  });

  return next;
}

export function isFeatureEnabled(state: TenantPlanState, featureKey: PlanFeatureKey, requiredLevel: 'summary' | 'basic' | 'full' = 'basic'): boolean {
  const feature = state.features[featureKey];

  if (typeof feature === 'boolean') {
    return feature;
  }

  if (requiredLevel === 'summary') {
    return feature === 'limited' || feature === 'basic' || feature === 'full';
  }

  if (requiredLevel === 'basic') {
    return feature === 'basic' || feature === 'full' || feature === 'limited';
  }

  return feature === 'full';
}

export function getLimitValue(state: TenantPlanState, limitKey: PlanLimitKey): number | null {
  const value = state.limits[limitKey];
  return value == null ? null : Number(value);
}

export function normalizeLimitForComparison(limit: number | null): number {
  return limit == null ? UNLIMITED_LIMIT : limit;
}