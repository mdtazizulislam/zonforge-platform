import { eq, and, desc, gte, count } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { Redis } from 'ioredis'
import { getDb, schema } from '@zonforge/db-client'
import { RedisKeys, RedisTTL } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type { Severity } from '@zonforge/shared-types'

const log = createLogger({ service: 'risk-scoring-engine' })

// ─────────────────────────────────────────────
// RISK SCORING WEIGHTS
//
// UserRisk = (W_behavior × BehaviorScore)
//          + (W_threatintel × ThreatIntelScore)
//          + (W_correlation × CorrelationScore)
//          + (W_history × AlertHistoryScore)
//          × (1 + PrivilegeBonus)
//          - TrustAdjustment
// ─────────────────────────────────────────────

const WEIGHTS = {
  behavior:     0.30,
  threatIntel:  0.25,
  correlation:  0.25,
  alertHistory: 0.15,
  exposure:     0.05,
} as const

const PRIVILEGE_BONUS: Record<string, number> = {
  PLATFORM_ADMIN: 0.50,
  TENANT_ADMIN:   0.40,
  SECURITY_ANALYST: 0.10,
  READ_ONLY:      0.00,
  API_CONNECTOR:  0.20,
}

// Severity → base score contribution
const SEVERITY_SCORES: Record<string, number> = {
  critical: 100,
  high:     75,
  medium:   45,
  low:      20,
  info:     5,
}

// Score decay: points lost per day after 7 days of silence
const USER_DECAY_RATE  = 5    // points/day
const ASSET_DECAY_RATE = 3    // points/day
const DECAY_START_DAYS = 7    // grace period before decay begins

// ─────────────────────────────────────────────
// RISK SCORING SERVICE
// ─────────────────────────────────────────────

export interface ScoreInput {
  tenantId:  string
  entityId:  string
  entityType: 'user' | 'asset' | 'org'
}

export interface ContributingSignalEntry {
  signalType:    string
  description:   string
  contribution:  number
  weight:        number
  sourceAlertId: string | null
  detectedAt:    Date
}

export interface ScoringResult {
  tenantId:           string
  entityId:           string
  entityType:         string
  score:              number
  severity:           Severity
  confidenceBand:     'low' | 'medium' | 'high'
  contributingSignals: ContributingSignalEntry[]
  recommendedActions: string[]
  calculatedAt:       Date
  validUntil:         Date
}

export class RiskScoringService {
  constructor(private readonly redis: Redis) {}

  // ── Score a user ───────────────────────────

  async scoreUser(tenantId: string, userId: string): Promise<ScoringResult> {
    const db           = getDb()
    const contributing: ContributingSignalEntry[] = []
    let   rawScore     = 0

    // ── 1. Behavior score (recent alert severity) ──────────────

    const recentAlerts = await db.select({
      id:        schema.alerts.id,
      severity:  schema.alerts.severity,
      status:    schema.alerts.status,
      createdAt: schema.alerts.createdAt,
    })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId, tenantId),
        eq(schema.alerts.affectedUserId, userId),
        gte(schema.alerts.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      ))
      .orderBy(desc(schema.alerts.createdAt))
      .limit(20)

    let behaviorScore = 0
    for (const alert of recentAlerts) {
      if (['false_positive', 'suppressed'].includes(alert.status ?? '')) continue
      const base = SEVERITY_SCORES[alert.severity] ?? 10
      // Recency decay: full weight for alerts in last 7 days, 50% for 7-30 days
      const daysAgo    = (Date.now() - alert.createdAt.getTime()) / 86_400_000
      const recencyMul = daysAgo <= 7 ? 1.0 : 0.5
      behaviorScore   += base * recencyMul
    }
    behaviorScore = Math.min(behaviorScore, 100)

    if (behaviorScore > 0) {
      contributing.push({
        signalType:    'behavior',
        description:   `${recentAlerts.length} recent alerts (last 30 days)`,
        contribution:  behaviorScore * WEIGHTS.behavior,
        weight:        WEIGHTS.behavior,
        sourceAlertId: recentAlerts[0]?.id ?? null,
        detectedAt:    new Date(),
      })
    }
    rawScore += behaviorScore * WEIGHTS.behavior

    // ── 2. Threat intel score ──────────────────────────────────

    let tiMatches: Array<{ id: string; confidence: number }> = []
    try {
      tiMatches = await db.select({
        id: schema.threatIntelMatches.id,
        confidence: schema.threatIntelMatches.confidence,
      })
        .from(schema.threatIntelMatches)
        .where(and(
          eq(schema.threatIntelMatches.tenantId, tenantId),
        ))
        .limit(5)
    } catch (err) {
      log.warn({ err, tenantId },
        'Threat intel unavailable during scoreUser; continuing with baseline scoring')
    }

    // Simplified: check if user's IP has threat intel hits in recent alerts
    const tiScore = tiMatches.length > 0
      ? Math.min(tiMatches.reduce((s, m) => s + m.confidence * 100, 0), 100)
      : 0

    if (tiScore > 0) {
      contributing.push({
        signalType:    'threat_intel',
        description:   `${tiMatches.length} threat intelligence matches`,
        contribution:  tiScore * WEIGHTS.threatIntel,
        weight:        WEIGHTS.threatIntel,
        sourceAlertId: null,
        detectedAt:    new Date(),
      })
    }
    rawScore += tiScore * WEIGHTS.threatIntel

    // ── 3. Correlation score (correlated finding involvement) ───

    const correlatedSignals = await db.select({ id: schema.detectionSignals.id,
                                                 confidence: schema.detectionSignals.confidence,
                                                 severity: schema.detectionSignals.severity })
      .from(schema.detectionSignals)
      .where(and(
        eq(schema.detectionSignals.tenantId, tenantId),
        eq(schema.detectionSignals.entityId, userId),
        gte(schema.detectionSignals.detectedAt, new Date(Date.now() - 72 * 60 * 60 * 1000)),
      ))
      .limit(10)

    let correlationScore = 0
    for (const sig of correlatedSignals) {
      correlationScore += (sig.confidence * (SEVERITY_SCORES[sig.severity] ?? 20))
    }
    correlationScore = Math.min(correlationScore, 100)

    if (correlationScore > 0) {
      contributing.push({
        signalType:    'correlation',
        description:   `${correlatedSignals.length} detection signals (72h window)`,
        contribution:  correlationScore * WEIGHTS.correlation,
        weight:        WEIGHTS.correlation,
        sourceAlertId: null,
        detectedAt:    new Date(),
      })
    }
    rawScore += correlationScore * WEIGHTS.correlation

    // ── 4. Alert history score (chronic vs one-time) ────────────

    const historicAlertCount = await db.select({ value: count() })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId, tenantId),
        eq(schema.alerts.affectedUserId, userId),
        gte(schema.alerts.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
      ))

    const totalAlerts = historicAlertCount[0]?.value ?? 0
    const historyScore = Math.min(totalAlerts * 5, 100)

    if (historyScore > 0) {
      contributing.push({
        signalType:    'alert_history',
        description:   `${totalAlerts} alerts in past 90 days`,
        contribution:  historyScore * WEIGHTS.alertHistory,
        weight:        WEIGHTS.alertHistory,
        sourceAlertId: null,
        detectedAt:    new Date(),
      })
    }
    rawScore += historyScore * WEIGHTS.alertHistory

    // ── 5. Privilege multiplier ─────────────────────────────────

    const user = await db.select({ role: schema.users.role })
      .from(schema.users)
      .where(and(
        eq(schema.users.id, userId),
        eq(schema.users.tenantId, tenantId),
      ))
      .limit(1)

    const role          = user[0]?.role ?? 'READ_ONLY'
    const privilegeBonus = PRIVILEGE_BONUS[role] ?? 0.0
    rawScore           *= (1 + privilegeBonus)

    if (privilegeBonus > 0) {
      contributing.push({
        signalType:    'privilege',
        description:   `Privileged role: ${role} (+${(privilegeBonus * 100).toFixed(0)}%)`,
        contribution:  rawScore * privilegeBonus / (1 + privilegeBonus),
        weight:        privilegeBonus,
        sourceAlertId: null,
        detectedAt:    new Date(),
      })
    }

    // ── 6. Apply decay ──────────────────────────────────────────

    const lastAlertDate = recentAlerts[0]?.createdAt
    rawScore            = this.applyDecay(rawScore, lastAlertDate, USER_DECAY_RATE)

    // ── 7. Clamp and derive severity ────────────────────────────

    const score    = Math.min(Math.max(Math.round(rawScore), 0), 100)
    const severity = this.scoreToSeverity(score)
    const confidence = this.scoreToConfidenceBand(contributing.length, recentAlerts.length)

    const result: ScoringResult = {
      tenantId,
      entityId:           userId,
      entityType:         'user',
      score,
      severity,
      confidenceBand:     confidence,
      contributingSignals: contributing.sort((a, b) => b.contribution - a.contribution),
      recommendedActions: this.getRecommendedActions(score, severity, role),
      calculatedAt:       new Date(),
      validUntil:         new Date(Date.now() + 24 * 60 * 60 * 1000),
    }

    // Cache and save
    await this.saveScore(result)
    return result
  }

  // ── Score an asset ─────────────────────────

  async scoreAsset(tenantId: string, assetId: string): Promise<ScoringResult> {
    const db       = getDb()
    const contributing: ContributingSignalEntry[] = []
    let   rawScore = 0

    // Vulnerability score
    const asset = await db.select()
      .from(schema.assets)
      .where(and(
        eq(schema.assets.id,       assetId),
        eq(schema.assets.tenantId, tenantId),
      ))
      .limit(1)

    const assetRecord = asset[0]
    if (!assetRecord) {
      return this.zeroScore(tenantId, assetId, 'asset')
    }

    // CVE score
    const vulnScore =
      (assetRecord.vulnCountCritical * 40) +
      (assetRecord.vulnCountHigh     * 25) +
      (assetRecord.vulnCountMedium   * 10) +
      (assetRecord.vulnCountLow      *  3)

    const clampedVuln = Math.min(vulnScore, 80)
    if (clampedVuln > 0) {
      contributing.push({
        signalType:    'vulnerability',
        description:   `${assetRecord.vulnCountCritical} critical, ${assetRecord.vulnCountHigh} high CVEs`,
        contribution:  clampedVuln,
        weight:        0.50,
        sourceAlertId: null,
        detectedAt:    new Date(),
      })
    }
    rawScore += clampedVuln

    // Internet-facing bonus
    if (assetRecord.isInternetFacing) {
      rawScore += 15
      contributing.push({
        signalType:    'exposure',
        description:   'Asset is internet-facing',
        contribution:  15,
        weight:        0.15,
        sourceAlertId: null,
        detectedAt:    new Date(),
      })
    }

    // Active alerts
    const activeAlerts = await db.select({ severity: schema.alerts.severity })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId,      tenantId),
        eq(schema.alerts.affectedAssetId, assetId),
        eq(schema.alerts.status,        'open'),
      ))
      .limit(10)

    const alertScore = activeAlerts.reduce((s, a) =>
      s + (SEVERITY_SCORES[a.severity] ?? 10) * 0.3, 0,
    )
    if (alertScore > 0) {
      rawScore += Math.min(alertScore, 30)
      contributing.push({
        signalType:    'active_alerts',
        description:   `${activeAlerts.length} open alerts targeting this asset`,
        contribution:  alertScore,
        weight:        0.35,
        sourceAlertId: null,
        detectedAt:    new Date(),
      })
    }

    const score    = Math.min(Math.max(Math.round(rawScore), 0), 100)
    const severity = this.scoreToSeverity(score)
    const result: ScoringResult = {
      tenantId,
      entityId:           assetId,
      entityType:         'asset',
      score,
      severity,
      confidenceBand:     'medium',
      contributingSignals: contributing,
      recommendedActions: this.getAssetRecommendations(score, assetRecord),
      calculatedAt:       new Date(),
      validUntil:         new Date(Date.now() + 24 * 60 * 60 * 1000),
    }

    await this.saveScore(result)
    return result
  }

  // ── Org posture score ──────────────────────

  async scoreOrgPosture(tenantId: string): Promise<{
    postureScore:       number
    openCriticalAlerts: number
    openHighAlerts:     number
    avgUserRiskScore:   number
    topRiskUserIds:     string[]
    topRiskAssetIds:    string[]
    connectorHealthScore: number
    mttdP50Minutes:     number | null
    calculatedAt:       Date
  }> {
    const db = getDb()

    // Count open P1/P2 alerts
    const alertCounts = await db.select({
      priority: schema.alerts.priority,
      cnt:      count(),
    })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId, tenantId),
        eq(schema.alerts.status, 'open'),
      ))
      .groupBy(schema.alerts.priority)

    const openCritical = alertCounts.find(r => r.priority === 'P1')?.cnt ?? 0
    const openHigh     = alertCounts.find(r => r.priority === 'P2')?.cnt ?? 0

    // Average user risk score
    const userScores = await db.select({ score: schema.riskScores.score })
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId,   tenantId),
        eq(schema.riskScores.entityType, 'user'),
      ))
      .limit(100)

    const avgUserScore = userScores.length > 0
      ? userScores.reduce((s, r) => s + r.score, 0) / userScores.length
      : 0

    // Top risk users
    const topRiskUsers = await db.select({ entityId: schema.riskScores.entityId })
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId,   tenantId),
        eq(schema.riskScores.entityType, 'user'),
      ))
      .orderBy(desc(schema.riskScores.score))
      .limit(5)

    const topRiskAssets = await db.select({ entityId: schema.riskScores.entityId })
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId,   tenantId),
        eq(schema.riskScores.entityType, 'asset'),
      ))
      .orderBy(desc(schema.riskScores.score))
      .limit(5)

    // Connector health (% healthy)
    const connectors = await db.select({
      status: schema.connectors.status,
      cnt:    count(),
    })
      .from(schema.connectors)
      .where(eq(schema.connectors.tenantId, tenantId))
      .groupBy(schema.connectors.status)

    const totalConnectors   = connectors.reduce((s, r) => s + Number(r.cnt), 0)
    const activeConnectors  = connectors.find(r => r.status === 'active')?.cnt ?? 0
    const connectorHealth   = totalConnectors > 0
      ? Math.round((Number(activeConnectors) / totalConnectors) * 100)
      : 100

    // MTTD P50 (median detection time in minutes)
    const mttdAlerts = await db.select({ gap: schema.alerts.detectionGapMinutes })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId, tenantId),
        gte(schema.alerts.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      ))
      .limit(200)

    const mttdValues = mttdAlerts
      .map(r => r.gap)
      .filter((g): g is number => g !== null && g > 0)
      .sort((a, b) => a - b)

    const mttdP50 = mttdValues.length > 0
      ? mttdValues[Math.floor(mttdValues.length / 2)] ?? null
      : null

    // Posture score (100 = perfect, lower = worse)
    // Formula: base 100 - penalties for open alerts, low health, high user risk
    const posture = Math.max(
      0,
      100
        - openCritical * 15
        - openHigh     * 5
        - Math.floor(avgUserScore * 0.20)
        - (100 - connectorHealth) * 0.20,
    )

    const result = {
      postureScore:       Math.round(posture),
      openCriticalAlerts: Number(openCritical),
      openHighAlerts:     Number(openHigh),
      avgUserRiskScore:   Math.round(avgUserScore),
      topRiskUserIds:     topRiskUsers.map(r => r.entityId),
      topRiskAssetIds:    topRiskAssets.map(r => r.entityId),
      connectorHealthScore: connectorHealth,
      mttdP50Minutes:     mttdP50 ?? null,
      calculatedAt:       new Date(),
    }

    // Cache posture
    await this.redis.setex(
      RedisKeys.orgPosture(tenantId),
      RedisTTL.ORG_POSTURE,
      JSON.stringify(result),
    )

    return result
  }

  // ── Save score to DB + cache ───────────────

  private async saveScore(result: ScoringResult): Promise<void> {
    const db = getDb()

    await db.insert(schema.riskScores)
      .values({
        id:                  uuidv4(),
        tenantId:            result.tenantId,
        entityType:          result.entityType as any,
        entityId:            result.entityId,
        score:               result.score,
        severity:            result.severity,
        confidenceBand:      result.confidenceBand,
        contributingSignals: result.contributingSignals,
        analystOverride:     null,
        decayRate:           result.entityType === 'user' ? USER_DECAY_RATE / 100 : ASSET_DECAY_RATE / 100,
        calculatedAt:        result.calculatedAt,
        validUntil:          result.validUntil,
      })
      .onConflictDoUpdate({
        target: [
          schema.riskScores.tenantId,
          schema.riskScores.entityType,
          schema.riskScores.entityId,
        ],
        set: {
          score:               result.score,
          severity:            result.severity,
          confidenceBand:      result.confidenceBand,
          contributingSignals: result.contributingSignals,
          calculatedAt:        result.calculatedAt,
          validUntil:          result.validUntil,
        },
      })

    // Cache for 5 minutes
    await this.redis.setex(
      RedisKeys.riskScore(result.tenantId, result.entityType, result.entityId),
      RedisTTL.RISK_SCORE,
      JSON.stringify({ score: result.score, severity: result.severity }),
    )

    log.debug({
      tenantId:   result.tenantId,
      entityType: result.entityType,
      entityId:   result.entityId.slice(0, 8) + '...',
      score:      result.score,
      severity:   result.severity,
    }, 'Risk score updated')
  }

  // ── Apply time-based decay ─────────────────

  private applyDecay(score: number, lastEventDate?: Date, ratePerDay = USER_DECAY_RATE): number {
    if (!lastEventDate || score === 0) return score
    const daysIdle = (Date.now() - lastEventDate.getTime()) / 86_400_000

    if (daysIdle <= DECAY_START_DAYS) return score

    const decayDays   = daysIdle - DECAY_START_DAYS
    const decayAmount = decayDays * ratePerDay
    return Math.max(0, score - decayAmount)
  }

  // ── Helpers ────────────────────────────────

  scoreToSeverity(score: number): Severity {
    if (score >= 85) return 'critical'
    if (score >= 70) return 'high'
    if (score >= 50) return 'medium'
    if (score >= 25) return 'low'
    return 'info'
  }

  private scoreToConfidenceBand(
    signalCount: number,
    alertCount:  number,
  ): 'low' | 'medium' | 'high' {
    const total = signalCount + alertCount
    if (total >= 5) return 'high'
    if (total >= 2) return 'medium'
    return 'low'
  }

  private getRecommendedActions(
    score:    number,
    severity: string,
    role:     string,
  ): string[] {
    if (score >= 85) return [
      'Immediate analyst investigation required',
      `Consider suspending ${role} account pending review`,
      'Revoke active sessions and require re-authentication',
      'Review all recent activity for unauthorized actions',
    ]
    if (score >= 70) return [
      'Analyst review within 4 hours',
      'Verify recent actions with user through out-of-band channel',
      'Monitor for further suspicious activity',
    ]
    if (score >= 50) return [
      'Review within 24 hours',
      'Monitor for score escalation',
    ]
    return ['Queue for weekly review']
  }

  private getAssetRecommendations(
    score:  number,
    asset:  Record<string, unknown>,
  ): string[] {
    const actions: string[] = []
    if (score >= 70) {
      actions.push('Immediately patch critical CVEs on this asset')
      if (asset['isInternetFacing']) {
        actions.push('Consider taking this internet-facing asset offline for patching')
      }
    }
    if (score >= 50) {
      actions.push('Schedule patch window within 72 hours')
      actions.push('Review active alerts targeting this asset')
    }
    return actions.length > 0 ? actions : ['No immediate action required']
  }

  private zeroScore(tenantId: string, entityId: string, entityType: string): ScoringResult {
    return {
      tenantId, entityId, entityType,
      score: 0, severity: 'info', confidenceBand: 'low',
      contributingSignals: [], recommendedActions: [],
      calculatedAt: new Date(),
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }
  }

  // ── Score decay worker ─────────────────────

  async runDecayForTenant(tenantId: string): Promise<number> {
    const db     = getDb()
    const scores = await db.select()
      .from(schema.riskScores)
      .where(eq(schema.riskScores.tenantId, tenantId))
      .limit(5000)

    let updated = 0
    for (const record of scores) {
      const decayed = this.applyDecay(
        record.score,
        record.calculatedAt,
        record.entityType === 'user' ? USER_DECAY_RATE : ASSET_DECAY_RATE,
      )

      if (decayed !== record.score) {
        await db.update(schema.riskScores)
          .set({
            score:       Math.round(decayed),
            severity:    this.scoreToSeverity(Math.round(decayed)),
            calculatedAt: new Date(),
          })
          .where(eq(schema.riskScores.id, record.id))
        updated++
      }
    }

    return updated
  }
}
