import { eq, and, gte, desc, count, inArray } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type { EvidenceItem, ToolName } from '../models/investigation.js'
import { v4 as uuid } from 'uuid'

const log = createLogger({ service: 'ai-soc-analyst:evidence' })

// ─────────────────────────────────────────────
// EVIDENCE COLLECTOR
//
// Implements all tool functions available to
// the AI analyst agent. Each function:
//   - queries existing platform data (never external calls)
//   - returns structured evidence
//   - marks each piece as supporting TP or FP
// ─────────────────────────────────────────────

export class EvidenceCollector {
  constructor(private readonly tenantId: string) {}

  async dispatch(
    toolName: ToolName,
    input:    Record<string, unknown>,
  ): Promise<{ result: unknown; evidence: EvidenceItem }> {
    switch (toolName) {
      case 'get_alert_details':
        return this.getAlertDetails(input.alert_id as string)
      case 'get_user_activity_history':
        return this.getUserActivityHistory(input.user_id as string, (input.lookback_hours as number) ?? 168)
      case 'get_ip_reputation':
        return this.getIpReputation(input.ip_address as string)
      case 'get_related_alerts':
        return this.getRelatedAlerts(input.entity_id as string, input.entity_type as string, (input.lookback_days as number) ?? 7)
      case 'get_user_risk_score':
        return this.getUserRiskScore(input.user_id as string)
      case 'query_event_timeline':
        return this.queryEventTimeline(input.actor_id as string, input.start_time as string, input.end_time as string, input.event_types as string[] | undefined)
      case 'check_peer_comparison':
        return this.checkPeerComparison(input.user_id as string, input.metric as string)
      case 'get_mitre_technique_context':
        return this.getMitreTechniqueContext(input.technique_id as string)
      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  }

  // ── 1. Alert details ──────────────────────────

  private async getAlertDetails(alertId: string) {
    const db = getDb()
    const alerts = await db.select()
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.id, alertId),
        eq(schema.alerts.tenantId, this.tenantId),
      ))
      .limit(1)

    const alert = alerts[0]
    const result = alert ?? { error: 'Alert not found' }

    return {
      result,
      evidence: this.makeEvidence('alert_history', 'alerts_db', 'Alert Details',
        `Alert: ${alert?.title ?? 'Unknown'} (${alert?.severity}, ${alert?.status})`,
        result,
        alert?.severity === 'critical' || alert?.severity === 'high',
        false,
      ),
    }
  }

  // ── 2. User activity history ──────────────────

  private async getUserActivityHistory(userId: string, lookbackHours: number) {
    const db     = getDb()
    const cutoff = new Date(Date.now() - lookbackHours * 3_600_000)

    // Check ClickHouse for events
    const chHost = process.env['ZONFORGE_CLICKHOUSE_HOST'] ?? 'http://localhost:8123'
    let events: unknown[] = []

    try {
      const sql = `
        SELECT event_action, actor_ip, actor_ip_country, outcome, event_time, source_type
        FROM events
        WHERE tenant_id = '${this.tenantId}'
          AND actor_user_id = '${userId.replace(/'/g, '')}'
          AND event_time >= '${cutoff.toISOString()}'
        ORDER BY event_time DESC
        LIMIT 100
        FORMAT JSON
      `
      const resp = await fetch(`${chHost}/?query=${encodeURIComponent(sql)}&readonly=1`, {
        signal: AbortSignal.timeout(5000),
      })
      if (resp.ok) {
        const data = await resp.json() as { data?: unknown[] }
        events = data.data ?? []
      }
    } catch { /* ClickHouse unavailable */ }

    // Also check risk score
    const riskRows = await db.select()
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId, this.tenantId),
        eq(schema.riskScores.entityId, userId),
      ))
      .limit(1)

    const risk = riskRows[0]

    const result = {
      userId,
      recentEventCount:  events.length,
      riskScore:         risk?.score ?? null,
      riskSeverity:      risk?.severity ?? null,
      sampleEvents:      events.slice(0, 20),
      lookbackHours,
    }

    const isHighRisk = (risk?.score ?? 0) >= 70 || events.length === 0
    return {
      result,
      evidence: this.makeEvidence(
        'user_behavior', 'clickhouse+db',
        `User Activity: ${userId}`,
        `${events.length} events in ${lookbackHours}h window. Risk score: ${risk?.score ?? 'N/A'} (${risk?.severity ?? 'unknown'})`,
        result,
        isHighRisk,
        !isHighRisk && events.length > 0,
      ),
    }
  }

  // ── 3. IP reputation ──────────────────────────

  private async getIpReputation(ip: string) {
    const db = getDb()

    // Check threat intelligence IOC store (Postgres)
    const iocRows = await db.select()
      .from(schema.threatIntelIocs)
      .where(and(
        eq(schema.threatIntelIocs.iocValue, ip),
        eq(schema.threatIntelIocs.iocType, 'ip'),
      ))
      .limit(5)

    const isMalicious  = iocRows.length > 0
    const maxConfidence = iocRows.length > 0
      ? Math.max(...iocRows.map(r => Number(r.confidence) * 100))
      : 0

    const result = {
      ip,
      isMalicious,
      confidence:      maxConfidence,
      threatTypes:     iocRows.flatMap(r => r.tags ?? []),
      sourceFeeds:     iocRows.map(r => r.feedSource),
      knownCountries:  [] as string[],
    }

    return {
      result,
      evidence: this.makeEvidence(
        'ip_reputation', 'threat_intel_cache',
        `IP Reputation: ${ip}`,
        isMalicious
          ? `⚠️ MALICIOUS IP — confidence ${maxConfidence.toFixed(0)}%. Feeds: ${iocRows.map(r => r.feedSource).join(', ')}`
          : `Clean IP — not found in threat intelligence feeds`,
        result,
        isMalicious,
        !isMalicious,
      ),
    }
  }

  // ── 4. Related alerts ─────────────────────────

  private async getRelatedAlerts(entityId: string, entityType: string, lookbackDays: number) {
    const db     = getDb()
    const cutoff = new Date(Date.now() - lookbackDays * 86_400_000)

    let alertsQuery
    if (entityType === 'user') {
      alertsQuery = await db.select({
        id: schema.alerts.id, title: schema.alerts.title,
        severity: schema.alerts.severity, status: schema.alerts.status,
        createdAt: schema.alerts.createdAt,
      })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, this.tenantId),
          eq(schema.alerts.affectedUserId, entityId),
          gte(schema.alerts.createdAt, cutoff),
        ))
        .orderBy(desc(schema.alerts.createdAt))
        .limit(20)
    } else {
      alertsQuery = await db.select({
        id: schema.alerts.id, title: schema.alerts.title,
        severity: schema.alerts.severity, status: schema.alerts.status,
        createdAt: schema.alerts.createdAt,
      })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, this.tenantId),
          gte(schema.alerts.createdAt, cutoff),
        ))
        .orderBy(desc(schema.alerts.createdAt))
        .limit(10)
    }

    const criticalOrHigh = alertsQuery.filter(a => ['critical', 'high'].includes(a.severity))

    const result = {
      entityId, entityType, lookbackDays,
      totalRelatedAlerts:  alertsQuery.length,
      criticalHighCount:   criticalOrHigh.length,
      alerts:              alertsQuery,
    }

    return {
      result,
      evidence: this.makeEvidence(
        'alert_history', 'alerts_db',
        `Related Alerts for ${entityType}: ${entityId}`,
        `Found ${alertsQuery.length} related alerts (${criticalOrHigh.length} critical/high) in ${lookbackDays}d`,
        result,
        criticalOrHigh.length > 1,
        alertsQuery.length === 0,
      ),
    }
  }

  // ── 5. User risk score ────────────────────────

  private async getUserRiskScore(userId: string) {
    const db = getDb()
    const rows = await db.select()
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId, this.tenantId),
        eq(schema.riskScores.entityId, userId),
        eq(schema.riskScores.entityType, 'user'),
      ))
      .limit(1)

    const score = rows[0]
    const result = score
      ? { ...score, calculatedAt: score.calculatedAt }
      : { userId, score: null, severity: 'unknown', message: 'No risk score calculated yet' }

    const isHighRisk = score && score.score >= 70

    return {
      result,
      evidence: this.makeEvidence(
        'risk_score', 'risk_scoring_engine',
        `Risk Score: ${userId}`,
        score
          ? `Risk score: ${score.score}/100 (${score.severity}). Confidence: ${score.confidenceBand}`
          : `No risk score available for ${userId}`,
        result,
        !!isHighRisk,
        !isHighRisk,
      ),
    }
  }

  // ── 6. Event timeline ─────────────────────────

  private async queryEventTimeline(
    actorId:    string,
    startTime:  string,
    endTime:    string,
    eventTypes?: string[],
  ) {
    const chHost = process.env['ZONFORGE_CLICKHOUSE_HOST'] ?? 'http://localhost:8123'
    let events: unknown[] = []

    try {
      const typeFilter = eventTypes?.length
        ? `AND event_action IN (${eventTypes.map(t => `'${t.replace(/'/g, '')}'`).join(',')})`
        : ''

      const sql = `
        SELECT event_time, source_type, event_action, event_category,
               actor_ip, actor_ip_country, outcome, target_resource
        FROM events
        WHERE tenant_id = '${this.tenantId}'
          AND (actor_user_id = '${actorId.replace(/'/g,'')}' OR actor_ip = '${actorId.replace(/'/g,'')}')
          AND event_time BETWEEN '${startTime}' AND '${endTime}'
          ${typeFilter}
        ORDER BY event_time ASC
        LIMIT 500
        FORMAT JSON
      `

      const resp = await fetch(`${chHost}/?query=${encodeURIComponent(sql)}&readonly=1`, {
        signal: AbortSignal.timeout(8000),
      })
      if (resp.ok) {
        const data = await resp.json() as { data?: unknown[] }
        events = data.data ?? []
      }
    } catch { /* ClickHouse unavailable */ }

    const result = {
      actorId, startTime, endTime,
      eventCount: events.length,
      timeline:   events,
    }

    return {
      result,
      evidence: this.makeEvidence(
        'timeline_event', 'clickhouse',
        `Event Timeline: ${actorId}`,
        `${events.length} events between ${startTime} and ${endTime}`,
        result,
        events.length > 50,
        events.length === 0,
      ),
    }
  }

  // ── 7. Peer comparison ────────────────────────

  private async checkPeerComparison(userId: string, metric: string) {
    // Simplified peer comparison using risk scores as proxy
    const db = getDb()
    const allScores = await db.select({ score: schema.riskScores.score })
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId, this.tenantId),
        eq(schema.riskScores.entityType, 'user'),
      ))
      .limit(100)

    const userRows = await db.select({ score: schema.riskScores.score })
      .from(schema.riskScores)
      .where(and(
        eq(schema.riskScores.tenantId, this.tenantId),
        eq(schema.riskScores.entityId, userId),
      ))
      .limit(1)

    const userScore = userRows[0]?.score ?? 0
    const peerScores = allScores.map(r => r.score)
    const avg = peerScores.length > 0
      ? Math.round(peerScores.reduce((s, v) => s + v, 0) / peerScores.length)
      : 0
    const percentile = peerScores.filter(s => s <= userScore).length / Math.max(peerScores.length, 1) * 100

    const result = {
      userId, metric,
      userValue:       userScore,
      peerAverage:     avg,
      percentile:      Math.round(percentile),
      peerCount:       peerScores.length,
      isOutlier:       percentile >= 90,
    }

    return {
      result,
      evidence: this.makeEvidence(
        'peer_comparison', 'risk_scoring_engine',
        `Peer Comparison: ${userId} (${metric})`,
        `User is at ${Math.round(percentile)}th percentile among ${peerScores.length} peers. ${result.isOutlier ? '⚠️ Statistical outlier' : 'Within normal range'}`,
        result,
        result.isOutlier,
        !result.isOutlier,
      ),
    }
  }

  // ── 8. MITRE technique context ────────────────

  private async getMitreTechniqueContext(techniqueId: string) {
    const MITRE_CONTEXT: Record<string, { name: string; description: string; commonTools: string[]; detectionGuidance: string }> = {
      'T1110': { name: 'Brute Force', description: 'Adversaries may use brute force techniques to gain access to accounts when passwords are unknown or hashed.', commonTools: ['Hydra', 'Medusa', 'Burp Suite', 'credential stuffing lists'], detectionGuidance: 'Monitor authentication logs for many failed attempts followed by success. Alert on >5 failures in 60s.' },
      'T1078': { name: 'Valid Accounts', description: 'Adversaries may obtain and abuse credentials of existing accounts.', commonTools: ['Mimikatz', 'credential dumps', 'phishing kits'], detectionGuidance: 'Monitor for logins from unusual locations/times, MFA bypass, impossible travel.' },
      'T1098': { name: 'Account Manipulation', description: 'Adversaries may manipulate accounts to maintain persistence or elevate privileges.', commonTools: ['PowerShell', 'Azure AD cmdlets', 'AWS CLI'], detectionGuidance: 'Alert on unexpected role/group membership changes, especially to privileged roles.' },
      'T1530': { name: 'Data from Cloud Storage', description: 'Adversaries may access data from improperly secured cloud storage.', commonTools: ['AWS CLI', 'Google Cloud SDK', 'Azure Storage Explorer'], detectionGuidance: 'Monitor for bulk downloads, unusual API access patterns, access from new locations.' },
      'T1114.003': { name: 'Email Forwarding Rule', description: 'Adversaries may setup email forwarding rules to collect sensitive information.', commonTools: ['PowerShell', 'Outlook', 'Exchange admin portal'], detectionGuidance: 'Alert on any inbox rules created that forward to external domains.' },
      'T1021': { name: 'Remote Services', description: 'Adversaries may use valid accounts to log into a service specifically designed to accept remote connections.', commonTools: ['SSH', 'RDP', 'VPN', 'PSExec'], detectionGuidance: 'Monitor for a single account authenticating to many systems in a short window.' },
      'T1550.001': { name: 'Application Access Token', description: 'Adversaries may use stolen application access tokens to bypass authentication.', commonTools: ['Token theft scripts', 'OAuth phishing pages'], detectionGuidance: 'Monitor OAuth consent grants for suspicious scopes (Mail.ReadWrite, Files.ReadWrite.All).' },
    }

    const context = MITRE_CONTEXT[techniqueId] ?? {
      name: techniqueId,
      description: 'MITRE ATT&CK technique context not available in local database.',
      commonTools: [],
      detectionGuidance: 'Refer to attack.mitre.org for guidance.',
    }

    const result = { techniqueId, ...context }

    return {
      result,
      evidence: this.makeEvidence(
        'threat_intel', 'mitre_db',
        `MITRE ${techniqueId}: ${context.name}`,
        context.detectionGuidance,
        result,
        false,
        false,
      ),
    }
  }

  // ── Helper ────────────────────────────────────

  private makeEvidence(
    type:        EvidenceItem['type'],
    source:      string,
    title:       string,
    description: string,
    data:        unknown,
    supportsTP:  boolean,
    supportsFP:  boolean,
    relevance:   EvidenceItem['relevance'] = 'medium',
  ): EvidenceItem {
    return {
      id:          uuid(),
      type,
      source,
      title,
      description,
      data,
      collectedAt: new Date(),
      relevance:   supportsTP ? 'high' : supportsFP ? 'medium' : relevance,
      supportsTP,
      supportsFP,
    }
  }
}
