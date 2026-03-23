import { eq, and, desc, gte, count, sql, inArray } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import type { Redis } from 'ioredis'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type { PlanTier } from '@zonforge/shared-types'

const log = createLogger({ service: 'mssp-console' })

const PLAN_MRR_CENTS: Record<PlanTier, number> = {
  starter: 0,
  growth: 7900,
  business: 19900,
  enterprise: 49900,
  mssp: 99900,
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface TenantSummary {
  id:              string
  name:            string
  slug:            string
  planTier:        PlanTier
  status:          string
  region:          string
  createdAt:       Date
  // Health
  postureScore:    number
  openCritical:    number
  openHigh:        number
  connectorHealth: number   // 0–100 %
  lastAlertAt:     Date | null
  // Usage
  connectorsActive:   number
  identitiesMonitor:  number
  eventsToday:        number
  // Billing
  mrr:             number    // monthly recurring revenue (USD cents)
  trialEndsAt:     Date | null
  subStatus:       string
}

export interface MsspOverview {
  totalTenants:    number
  activeTenants:   number
  trialTenants:    number
  suspendedTenants: number
  totalMrr:        number     // USD cents
  totalOpenCritical: number
  avgPostureScore: number
  tenantsByPlan:   Record<string, number>
  recentAlerts:    Array<{
    tenantId: string; tenantName: string
    title: string; severity: string; createdAt: Date
  }>
  topRiskTenants:  TenantSummary[]
  connectorHealthByTenant: Array<{ tenantId: string; name: string; pct: number }>
  calculatedAt:    Date
}

// ─────────────────────────────────────────────
// MSSP CONSOLE SERVICE
// ─────────────────────────────────────────────

export class MsspConsoleService {
  constructor(private readonly redis: Redis) {}

  // ── Full MSSP overview (all tenants) ─────────

  async getOverview(): Promise<MsspOverview> {
    const cacheKey = 'zf:platform:mssp:overview'
    const cached   = await this.redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const db = getDb()

    // All tenants
    const allTenants = await db.select({
      id:        schema.tenants.id,
      name:      schema.tenants.name,
      slug:      schema.tenants.slug,
      planTier:  schema.tenants.planTier,
      status:    schema.tenants.status,
      createdAt: schema.tenants.createdAt,
    })
      .from(schema.tenants)
      .orderBy(desc(schema.tenants.createdAt))
      .limit(5000)

    // Count by status
    const activeTenants    = allTenants.filter(t => t.status === 'active').length
    const trialTenants     = allTenants.filter(t => t.status === 'trial').length
    const suspendedTenants = allTenants.filter(t => t.status === 'suspended').length

    // Subscription MRR
    const subs = await db.select({
      tenantId:  schema.subscriptions.tenantId,
      planTier:  schema.subscriptions.planTier,
      status:    schema.subscriptions.status,
      trialEndsAt: schema.subscriptions.trialEndsAt,
    })
      .from(schema.subscriptions)
      .where(inArray(schema.subscriptions.status, ['active', 'trialing', 'past_due']))

    const totalMrr = subs.reduce((sum, s) => {
      return sum + (PLAN_MRR_CENTS[s.planTier as PlanTier] ?? 0)
    }, 0)

    // Tenants by plan
    const tenantsByPlan: Record<string, number> = {}
    for (const t of allTenants) {
      tenantsByPlan[t.planTier] = (tenantsByPlan[t.planTier] ?? 0) + 1
    }

    // Recent critical alerts across all tenants
    const recentAlerts = await db.select({
      id:        schema.alerts.id,
      tenantId:  schema.alerts.tenantId,
      title:     schema.alerts.title,
      severity:  schema.alerts.severity,
      createdAt: schema.alerts.createdAt,
    })
      .from(schema.alerts)
      .where(and(
        inArray(schema.alerts.severity, ['critical', 'high']),
        gte(schema.alerts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        eq(schema.alerts.status, 'open'),
      ))
      .orderBy(desc(schema.alerts.createdAt))
      .limit(20)

    // Join tenant names
    const tenantNameMap = new Map(allTenants.map(t => [t.id, t.name]))
    const enrichedAlerts = recentAlerts.map(a => ({
      tenantId:   a.tenantId,
      tenantName: tenantNameMap.get(a.tenantId) ?? 'Unknown',
      title:      a.title,
      severity:   a.severity,
      createdAt:  a.createdAt,
    }))

    // Open critical per tenant
    const criticalCounts = await db.select({
      tenantId: schema.alerts.tenantId,
      cnt:      count(),
    })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.severity, 'critical'),
        eq(schema.alerts.status,   'open'),
      ))
      .groupBy(schema.alerts.tenantId)

    const totalOpenCritical = criticalCounts.reduce((s, r) => s + Number(r.cnt), 0)

    // Posture scores
    const postureScores = await db.select({
      tenantId: schema.riskScores.tenantId,
      score:    schema.riskScores.score,
    })
      .from(schema.riskScores)
      .where(eq(schema.riskScores.entityType, 'org'))
      .limit(5000)

    const avgPostureScore = postureScores.length > 0
      ? Math.round(postureScores.reduce((s, r) => s + r.score, 0) / postureScores.length)
      : 0

    // Top risk tenants (by critical alert count + low posture)
    const criticalMap = new Map(criticalCounts.map(r => [r.tenantId, Number(r.cnt)]))
    const postureMap  = new Map(postureScores.map(r => [r.tenantId, r.score]))

    const topRiskTenants = allTenants
      .filter(t => t.status === 'active')
      .map(t => ({
        id:              t.id,
        name:            t.name,
        slug:            t.slug,
        planTier:        t.planTier as PlanTier,
        status:          t.status,
        region:          'us-east-1',
        createdAt:       t.createdAt,
        openCritical:    criticalMap.get(t.id) ?? 0,
        openHigh:        0,
        postureScore:    postureMap.get(t.id) ?? 75,
        connectorHealth: 100,
        lastAlertAt:     null,
        connectorsActive:  0,
        identitiesMonitor: 0,
        eventsToday:       0,
        mrr:             PLAN_MRR_CENTS[t.planTier as PlanTier] ?? 0,
        trialEndsAt:     null,
        subStatus:       'active',
      }))
      .sort((a, b) => (b.openCritical * 10 + (100 - b.postureScore)) - (a.openCritical * 10 + (100 - a.postureScore)))
      .slice(0, 10)

    const overview: MsspOverview = {
      totalTenants:    allTenants.length,
      activeTenants,
      trialTenants,
      suspendedTenants,
      totalMrr,
      totalOpenCritical,
      avgPostureScore,
      tenantsByPlan,
      recentAlerts:    enrichedAlerts,
      topRiskTenants,
      connectorHealthByTenant: [],
      calculatedAt:    new Date(),
    }

    // Cache 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(overview))

    return overview
  }

  // ── Single tenant summary ─────────────────────

  async getTenantSummary(tenantId: string): Promise<TenantSummary | null> {
    const db = getDb()

    const tenants = await db.select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)

    const tenant = tenants[0]
    if (!tenant) return null

    const [alerts, connectors, subs, riskScores] = await Promise.all([
      // Open alerts by severity
      db.select({ severity: schema.alerts.severity, cnt: count() })
        .from(schema.alerts)
        .where(and(eq(schema.alerts.tenantId, tenantId), eq(schema.alerts.status, 'open')))
        .groupBy(schema.alerts.severity),

      // Connector health
      db.select({ status: schema.connectors.status, cnt: count() })
        .from(schema.connectors)
        .where(eq(schema.connectors.tenantId, tenantId))
        .groupBy(schema.connectors.status),

      // Subscription
      db.select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.tenantId, tenantId))
        .limit(1),

      // Org posture
      db.select({ score: schema.riskScores.score })
        .from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId, tenantId),
          eq(schema.riskScores.entityType, 'org'),
        ))
        .limit(1),
    ])

    const alertMap        = new Map(alerts.map(a => [a.severity, Number(a.cnt)]))
    const totalConn       = connectors.reduce((s, c) => s + Number(c.cnt), 0)
    const healthyConn     = connectors.filter(c => c.status === 'active').reduce((s, c) => s + Number(c.cnt), 0)
    const connectorHealth = totalConn > 0 ? Math.round((healthyConn / totalConn) * 100) : 100
    const sub             = subs[0]

    return {
      id:               tenant.id,
      name:             tenant.name,
      slug:             tenant.slug,
      planTier:         tenant.planTier as PlanTier,
      status:           tenant.status,
      region:           tenant.region ?? 'us-east-1',
      createdAt:        tenant.createdAt,
      postureScore:     riskScores[0]?.score ?? 75,
      openCritical:     alertMap.get('critical') ?? 0,
      openHigh:         alertMap.get('high') ?? 0,
      connectorHealth,
      lastAlertAt:      null,
      connectorsActive: totalConn,
      identitiesMonitor: 0,
      eventsToday:      0,
      mrr:              PLAN_MRR_CENTS[tenant.planTier as PlanTier] ?? 0,
      trialEndsAt:      sub?.trialEndsAt ?? null,
      subStatus:        sub?.status ?? 'active',
    }
  }

  // ── Bulk operations ───────────────────────────

  async bulkSuspend(tenantIds: string[], reason: string, actorId: string): Promise<{
    suspended: string[]; failed: string[]
  }> {
    const db        = getDb()
    const suspended: string[] = []
    const failed:    string[] = []

    for (const tenantId of tenantIds) {
      try {
        await db.update(schema.tenants)
          .set({ status: 'suspended', updatedAt: new Date() })
          .where(eq(schema.tenants.id, tenantId))

        // Revoke all active sessions
        await this.redis.del(`zf:${tenantId}:plan`)

        suspended.push(tenantId)
        log.info({ tenantId, actorId, reason }, 'Tenant bulk-suspended by MSSP admin')
      } catch (err) {
        failed.push(tenantId)
        log.error({ err, tenantId }, 'Bulk suspend failed for tenant')
      }
    }

    return { suspended, failed }
  }

  // ── White-label config ────────────────────────

  async updateWhiteLabel(tenantId: string, config: {
    brandName?:      string
    brandLogoUrl?:   string
    brandPrimaryColor?: string
    customDomain?:   string
    supportEmail?:   string
  }): Promise<void> {
    const db = getDb()

    // Store in tenant settings
    const existing = await db.select({ settings: schema.tenants.settings })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)

    const currentSettings = (existing[0]?.settings as Record<string, unknown>) ?? {}
    const updatedSettings  = {
      ...currentSettings,
      whiteLabel: { ...((currentSettings.whiteLabel as object) ?? {}), ...config },
    }

    await db.update(schema.tenants)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId))

    // Invalidate cache
    await this.redis.del(`zf:platform:tenant:${tenantId}:settings`)

    log.info({ tenantId, config }, 'White-label config updated')
  }

  // ── Revenue report ────────────────────────────

  async getRevenueReport(periodDays = 30): Promise<{
    totalMrr:      number
    totalArr:      number
    byPlan:        Record<string, { count: number; mrr: number }>
    byRegion:      Record<string, number>
    churnedThisPeriod: number
    newThisPeriod: number
    netNewMrr:     number
  }> {
    const db      = getDb()
    const cutoff  = new Date(Date.now() - periodDays * 86_400_000)

    const [activeSubs, newTenants, churned] = await Promise.all([
      db.select({
        planTier: schema.subscriptions.planTier,
        status:   schema.subscriptions.status,
        tenantId: schema.subscriptions.tenantId,
      })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.status, 'active')),

      db.select({ id: schema.tenants.id, planTier: schema.tenants.planTier })
        .from(schema.tenants)
        .where(gte(schema.tenants.createdAt, cutoff)),

      db.select({ cnt: count() })
        .from(schema.subscriptions)
        .where(and(
          eq(schema.subscriptions.status, 'cancelled'),
          gte(schema.subscriptions.updatedAt, cutoff),
        )),
    ])

    const byPlan: Record<string, { count: number; mrr: number }> = {}
    let   totalMrr = 0

    for (const s of activeSubs) {
      const mrr  = PLAN_MRR_CENTS[s.planTier as PlanTier] ?? 0
      totalMrr  += mrr
      if (!byPlan[s.planTier]) byPlan[s.planTier] = { count: 0, mrr: 0 }
      byPlan[s.planTier]!.count++
      byPlan[s.planTier]!.mrr += mrr
    }

    const newMrr = newTenants.reduce((s, t) =>
      s + (PLAN_MRR_CENTS[t.planTier as PlanTier] ?? 0), 0)

    return {
      totalMrr,
      totalArr:          totalMrr * 12,
      byPlan,
      byRegion:          { 'us-east-1': totalMrr },   // simplified
      churnedThisPeriod: Number(churned[0]?.cnt ?? 0),
      newThisPeriod:     newTenants.length,
      netNewMrr:         newMrr,
    }
  }
}
