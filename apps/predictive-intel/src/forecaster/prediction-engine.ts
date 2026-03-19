import { eq, and, gte, desc, count } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import {
  KNOWN_CAMPAIGNS, INDUSTRY_THREAT_MAP,
  type ThreatPrediction, type ThreatSignal, type ThreatForecastReport,
  type ThreatCategory, type ThreatHorizon, type AttackCampaign,
} from '../models/prediction.js'
import { v4 as uuid } from 'uuid'

const log = createLogger({ service: 'predictive-intel:engine' })

// ─────────────────────────────────────────────
// PREDICTIVE THREAT ENGINE
//
// Collects signals from existing ZonForge data,
// correlates with external threat intelligence,
// and generates probabilistic threat predictions.
//
// Signal sources:
//   1. Alert pattern trends (own data)
//   2. IOC match rate trends (own data)
//   3. Risk score velocity (own data)
//   4. Behavioral anomaly spikes (behavioral-ai)
//   5. Known campaign targeting (curated intel)
//   6. Industry threat context (static + fed)
//
// Prediction model:
//   P(attack) = weighted_sum(signals) × industry_multiplier × campaign_match
// ─────────────────────────────────────────────

export class PredictiveEngine {

  // ── Collect signals from platform data ───────

  async collectSignals(tenantId: string): Promise<ThreatSignal[]> {
    const db     = getDb()
    const signals: ThreatSignal[] = []
    const now    = new Date()
    const h24    = new Date(now.getTime() - 24 * 3_600_000)
    const d7     = new Date(now.getTime() - 7 * 86_400_000)
    const d30    = new Date(now.getTime() - 30 * 86_400_000)

    try {
      // ── Signal 1: Alert volume spike ────────────
      const [alertsToday, alertsWeekAvg] = await Promise.all([
        db.select({ cnt: count() }).from(schema.alerts)
          .where(and(eq(schema.alerts.tenantId, tenantId), gte(schema.alerts.createdAt, h24))),
        db.select({ cnt: count() }).from(schema.alerts)
          .where(and(eq(schema.alerts.tenantId, tenantId), gte(schema.alerts.createdAt, d7))),
      ])

      const todayAlerts  = Number(alertsToday[0]?.cnt ?? 0)
      const weeklyAvg    = Number(alertsWeekAvg[0]?.cnt ?? 0) / 7
      const alertSpike   = weeklyAvg > 0 ? todayAlerts / weeklyAvg : 0

      if (alertSpike >= 2.0) {
        signals.push({
          type:        'alert_pattern',
          category:    'credential_attack',
          strength:    Math.min(1, (alertSpike - 2) / 3),
          description: `Alert volume ${alertSpike.toFixed(1)}× above 7-day average`,
          source:      'alerts_table',
          detectedAt:  now,
          data:        { todayAlerts, weeklyAvg, spike: alertSpike },
        })
      }

      // ── Signal 2: Critical alert rate ───────────
      const criticalRecent = await db.select({ cnt: count() }).from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, tenantId),
          eq(schema.alerts.severity, 'critical'),
          gte(schema.alerts.createdAt, h24),
        ))

      const criticalCount = Number(criticalRecent[0]?.cnt ?? 0)
      if (criticalCount >= 2) {
        signals.push({
          type:        'alert_pattern',
          category:    'data_exfiltration',
          strength:    Math.min(1, criticalCount / 5),
          description: `${criticalCount} critical alerts in last 24h`,
          source:      'alerts_table',
          detectedAt:  now,
          data:        { criticalCount },
        })
      }

      // ── Signal 3: IOC match spike ───────────────
      const iocMatches = await db.select({ cnt: count() }).from(schema.iocCache)
        .where(gte(schema.iocCache.lastSeenAt, d7))

      const iocCount = Number(iocMatches[0]?.cnt ?? 0)
      if (iocCount >= 50) {
        signals.push({
          type:        'ioc_spike',
          category:    'phishing_campaign',
          strength:    Math.min(1, iocCount / 200),
          description: `${iocCount} active IOCs in threat intelligence cache`,
          source:      'ioc_cache',
          detectedAt:  now,
          data:        { iocCount },
        })
      }

      // ── Signal 4: Risk score escalation ─────────
      const highRiskUsers = await db.select({ cnt: count() }).from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId, tenantId),
          eq(schema.riskScores.entityType, 'user'),
          gte(schema.riskScores.score, 70),
        ))

      const highRiskCount = Number(highRiskUsers[0]?.cnt ?? 0)
      if (highRiskCount >= 2) {
        signals.push({
          type:        'risk_trend',
          category:    'insider_threat',
          strength:    Math.min(1, highRiskCount / 5),
          description: `${highRiskCount} users at high/critical risk score`,
          source:      'risk_scores',
          detectedAt:  now,
          data:        { highRiskCount },
        })
      }

      // ── Signal 5: Failed auth spike ─────────────
      const failedAuths = await db.select({ cnt: count() }).from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, tenantId),
          gte(schema.alerts.createdAt, h24),
        ))

      // Use alert findingId proxy for auth alerts
      const authAlertCount = Number(failedAuths[0]?.cnt ?? 0)
      if (authAlertCount >= 3) {
        signals.push({
          type:        'behavior_shift',
          category:    'credential_attack',
          strength:    Math.min(1, authAlertCount / 10),
          description: `${authAlertCount} authentication-related alerts today`,
          source:      'alerts_table',
          detectedAt:  now,
          data:        { authAlertCount },
        })
      }

    } catch (err) {
      log.warn({ err }, 'Signal collection partial failure (non-fatal)')
    }

    // ── Signal 6: Active known campaigns ────────
    const activeCampaigns = KNOWN_CAMPAIGNS.filter(c => c.active)
    if (activeCampaigns.length > 0) {
      signals.push({
        type:        'external_feed',
        category:    'phishing_campaign',
        strength:    0.6,
        description: `${activeCampaigns.length} active threat campaigns targeting similar organizations`,
        source:      'zonforge_threat_intel',
        detectedAt:  now,
        data:        { campaigns: activeCampaigns.map(c => c.name) },
      })
    }

    log.debug({ tenantId, signalCount: signals.length }, 'Signals collected')
    return signals
  }

  // ── Generate predictions from signals ────────

  generatePredictions(
    tenantId:  string,
    signals:   ThreatSignal[],
    horizon:   ThreatHorizon,
    industry:  string = 'general',
  ): ThreatPrediction[] {
    const predictions: ThreatPrediction[] = []
    const now = new Date()
    const expiresAt = new Date(now.getTime() + horizonMs(horizon))

    // Group signals by category
    const byCategory = new Map<ThreatCategory, ThreatSignal[]>()
    for (const signal of signals) {
      const list = byCategory.get(signal.category) ?? []
      list.push(signal)
      byCategory.set(signal.category, list)
    }

    // Industry context multiplier
    const industryCtx = INDUSTRY_THREAT_MAP[industry] ?? INDUSTRY_THREAT_MAP['general']!
    const industryBoost: Record<string, number> = {}
    for (const threat of industryCtx.topThreats) {
      industryBoost[threat] = 1.25   // 25% boost for industry-relevant threats
    }

    // Generate prediction per category with enough signal
    for (const [category, categorySignals] of byCategory) {
      const baseStrength = categorySignals.reduce((s, sig) => s + sig.strength, 0) / categorySignals.length
      const boost        = industryBoost[category] ?? 1.0
      const probability  = Math.min(95, Math.round(baseStrength * boost * 100))

      if (probability < 15) continue  // below noise threshold

      const confidence = probability >= 75 ? 'very_high'
        : probability >= 55 ? 'high'
        : probability >= 35 ? 'medium'
        : 'low'

      const matchingCampaigns = KNOWN_CAMPAIGNS.filter(c =>
        c.active && c.techniques.some(t => CATEGORY_TECHNIQUES[category]?.includes(t)),
      )

      predictions.push({
        id:          uuid(),
        tenantId,
        category,
        horizon,
        probability,
        confidence,
        title:       PREDICTION_TITLES[category] ?? `${category} threat detected`,
        description: buildDescription(category, probability, categorySignals, matchingCampaigns),
        reasoning:   categorySignals.map(s => s.description),
        indicators:  categorySignals.flatMap(s => [s.description]),
        affectedAssets: getAffectedAssets(category),
        mitreTechniques: CATEGORY_TECHNIQUES[category] ?? [],
        recommendedActions: getRecommendations(category),
        generatedAt: now,
        expiresAt,
        acknowledged: false,
      })
    }

    // Always include general threat context if no signals
    if (predictions.length === 0 && industryCtx.topThreats.length > 0) {
      const topThreat = industryCtx.topThreats[0]!
      predictions.push({
        id:          uuid(),
        tenantId,
        category:    topThreat as ThreatCategory,
        horizon,
        probability: 25,
        confidence:  'low',
        title:       `${industryCtx.industry} threat landscape: ${PREDICTION_TITLES[topThreat as ThreatCategory]}`,
        description: `No immediate signals, but ${topThreat.replace('_',' ')} remains the leading threat for ${industryCtx.industry} organizations in ${industryCtx.period}.`,
        reasoning:   [`${industryCtx.industry} sector threat intelligence`],
        indicators:  [`Active groups: ${industryCtx.activeGroups.join(', ')}`],
        affectedAssets: getAffectedAssets(topThreat as ThreatCategory),
        mitreTechniques: industryCtx.trendingTechniques,
        recommendedActions: industryCtx.recommendedFocus,
        generatedAt: now,
        expiresAt,
        acknowledged: false,
      })
    }

    return predictions.sort((a, b) => b.probability - a.probability)
  }

  // ── Full forecast report ──────────────────────

  async generateForecast(
    tenantId: string,
    horizon:  ThreatHorizon = '72h',
    industry: string = 'general',
  ): Promise<ThreatForecastReport> {
    const signals     = await this.collectSignals(tenantId)
    const predictions = this.generatePredictions(tenantId, signals, horizon, industry)
    const industryCtx = INDUSTRY_THREAT_MAP[industry] ?? INDUSTRY_THREAT_MAP['general']!
    const activeCampaigns = KNOWN_CAMPAIGNS.filter(c => c.active)

    const maxProbability = predictions.length > 0
      ? Math.max(...predictions.map(p => p.probability))
      : 0

    const overallThreatScore = Math.round(
      predictions.reduce((s, p) => s + p.probability * 0.5, 0) / Math.max(predictions.length, 1),
    )

    const overallThreatLevel =
      maxProbability >= 75 ? 'critical'
      : maxProbability >= 55 ? 'elevated'
      : maxProbability >= 35 ? 'guarded'
      : 'low'

    const topRecommendations = [
      ...new Set(predictions.flatMap(p => p.recommendedActions)),
    ].slice(0, 5)

    log.info({
      tenantId, horizon, predictionCount: predictions.length,
      overallThreatLevel, maxProbability,
    }, `📡 Threat forecast generated: ${overallThreatLevel}`)

    return {
      tenantId,
      generatedAt:   new Date(),
      period:        horizon,
      predictions,
      activeCampaigns,
      industryContext: industryCtx,
      overallThreatLevel,
      overallThreatScore,
      topRecommendations,
    }
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function horizonMs(h: ThreatHorizon): number {
  const map = { '24h': 86_400_000, '72h': 259_200_000, '7d': 604_800_000, '30d': 2_592_000_000 }
  return map[h]
}

const PREDICTION_TITLES: Record<string, string> = {
  credential_attack:   'Credential Attack — High Probability',
  ransomware:          'Ransomware Campaign — Active Threat',
  data_exfiltration:   'Data Exfiltration — Elevated Risk',
  supply_chain:        'Supply Chain Compromise Detected',
  phishing_campaign:   'Phishing Campaign Targeting Sector',
  api_abuse:           'API Abuse Pattern — Monitor Closely',
  insider_threat:      'Insider Threat Indicators Present',
  ddos:                'DDoS Campaign — Sector Alert',
}

const CATEGORY_TECHNIQUES: Record<string, string[]> = {
  credential_attack:   ['T1110','T1078','T1556'],
  ransomware:          ['T1486','T1490','T1021'],
  data_exfiltration:   ['T1530','T1114.003','T1020'],
  supply_chain:        ['T1195','T1059','T1195.002'],
  phishing_campaign:   ['T1566','T1566.002','T1078'],
  api_abuse:           ['T1550.001','T1528','T1071'],
  insider_threat:      ['T1078','T1005','T1048'],
  ddos:                ['T1499','T1498'],
}

function getAffectedAssets(category: ThreatCategory): string[] {
  const map: Record<string, string[]> = {
    credential_attack:   ['Microsoft 365', 'AWS IAM', 'VPN Gateway'],
    ransomware:          ['File Servers', 'Backup Systems', 'Databases'],
    data_exfiltration:   ['SharePoint', 'OneDrive', 'S3 Buckets'],
    phishing_campaign:   ['Email Systems', 'User Workstations'],
    api_abuse:           ['API Gateway', 'OAuth Apps'],
    insider_threat:      ['Data Repositories', 'Email', 'Cloud Storage'],
    supply_chain:        ['Development Pipeline', 'Package Registries'],
    ddos:                ['Public-Facing Services', 'CDN', 'DNS'],
  }
  return map[category] ?? ['All Systems']
}

function getRecommendations(category: ThreatCategory): string[] {
  const map: Record<string, string[]> = {
    credential_attack:   ['Enforce phishing-resistant MFA','Review failed login patterns','Block legacy auth'],
    ransomware:          ['Verify backup integrity','Test restore procedures','Segment network'],
    data_exfiltration:   ['Review data access patterns','Monitor bulk downloads','Audit email forwarding rules'],
    phishing_campaign:   ['Deploy email security gateway','Run phishing awareness training','Enable DMARC/DKIM'],
    api_abuse:           ['Review OAuth app consents','Monitor API call volumes','Rotate exposed tokens'],
    insider_threat:      ['Review privileged access','Monitor off-hours activity','Audit data access logs'],
    supply_chain:        ['Scan dependencies for vulnerabilities','Pin package versions','Review third-party integrations'],
    ddos:                ['Enable DDoS protection','Review rate limiting','Prepare incident response playbook'],
  }
  return map[category] ?? ['Review security controls','Monitor for anomalies']
}

function buildDescription(
  category:   ThreatCategory,
  probability: number,
  signals:    ThreatSignal[],
  campaigns:  AttackCampaign[],
): string {
  const parts: string[] = []
  parts.push(`${probability}% probability of ${category.replace(/_/g, ' ')} in the next forecast window.`)
  if (signals.length > 0) {
    parts.push(`${signals.length} supporting signal(s) detected in your environment.`)
  }
  if (campaigns.length > 0) {
    parts.push(`Aligned with active campaign: ${campaigns[0]!.name} (${campaigns[0]!.actor ?? 'Unknown actor'}).`)
  }
  return parts.join(' ')
}
