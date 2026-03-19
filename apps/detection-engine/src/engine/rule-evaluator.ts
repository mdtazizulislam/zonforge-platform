import { v4 as uuidv4 } from 'uuid'
import { queryEvents } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import type { DetectionRule } from '../rules/rule-loader.js'

const log = createLogger({ service: 'detection-engine:evaluator' })

// ─────────────────────────────────────────────
// RULE EVALUATOR
//
// Evaluates a detection rule against recent
// normalized events in ClickHouse.
//
// Returns: DetectionMatch[] (may be empty)
// ─────────────────────────────────────────────

export interface DetectionMatch {
  ruleId:           string
  ruleName:         string
  tenantId:         string
  entityId:         string
  entityType:       'user' | 'ip' | 'asset' | 'session'
  confidence:       number
  severity:         string
  mitreTactics:     string[]
  mitreTechniques:  string[]
  evidenceEventIds: string[]
  firstSignalTime:  Date
  detectedAt:       Date
  metadata:         Record<string, unknown>
}

export class RuleEvaluator {

  // ── Main evaluate method ───────────────────

  async evaluate(
    rule:     DetectionRule,
    tenantId: string,
  ): Promise<DetectionMatch[]> {
    try {
      switch (rule.detection.type) {
        case 'threshold':
          return await this.evaluateThreshold(rule, tenantId)
        case 'sequence':
          return await this.evaluateSequence(rule, tenantId)
        case 'baseline_deviation':
          return await this.evaluateBaselineDeviation(rule, tenantId)
        case 'correlation':
          return await this.evaluateCorrelation(rule, tenantId)
        case 'anomaly_threshold':
          return await this.evaluateAnomalyThreshold(rule, tenantId)
        default:
          log.warn({ ruleId: rule.id, type: rule.detection.type },
            'Detection type not yet implemented')
          return []
      }
    } catch (err) {
      log.error({ err, ruleId: rule.id, tenantId }, 'Rule evaluation error')
      return []
    }
  }

  // ── THRESHOLD detection ────────────────────
  // Count events matching conditions within window
  // Group by specified fields, emit match if count >= threshold

  private async evaluateThreshold(
    rule:     DetectionRule,
    tenantId: string,
  ): Promise<DetectionMatch[]> {
    const windowMinutes = rule.detection.window_minutes
    const groupBy       = rule.detection.group_by
    const conditions    = rule.detection.conditions ?? []
    const countMin      = rule.detection.count_min
                         ?? rule.detection.aggregate?.count_min
                         ?? 1

    // Build ClickHouse WHERE clause from conditions
    const whereClauses  = this.buildWhereClauses(conditions)
    const groupByFields = groupBy.map(f => this.mapField(f)).join(', ')

    const sql = `
      SELECT
        ${groupByFields},
        count()             AS event_count,
        min(event_time)     AS first_event_time,
        max(event_time)     AS last_event_time,
        groupArray(event_id) AS event_ids
      FROM events
      WHERE
        tenant_id = {tenantId:UUID}
        AND event_time >= now() - INTERVAL ${windowMinutes} MINUTE
        ${whereClauses.length > 0 ? 'AND ' + whereClauses.join(' AND ') : ''}
      GROUP BY ${groupByFields}
      HAVING event_count >= ${countMin}
      LIMIT 100
    `

    const rows = await queryEvents<{
      actor_user_id:   string | null
      actor_ip:        string | null
      event_count:     string
      first_event_time: string
      last_event_time: string
      event_ids:       string[]
    }>(sql, { tenantId })

    return rows.map(row => ({
      ruleId:           rule.id,
      ruleName:         rule.name,
      tenantId,
      entityId:         row.actor_user_id ?? row.actor_ip ?? tenantId,
      entityType:       row.actor_user_id ? 'user' : 'ip',
      confidence:       rule.confidence_score,
      severity:         rule.severity,
      mitreTactics:     rule.mitre.tactics.map(t => t.id),
      mitreTechniques:  rule.mitre.techniques.map(t => t.id),
      evidenceEventIds: Array.isArray(row.event_ids)
        ? row.event_ids.slice(0, 20)
        : [],
      firstSignalTime:  new Date(row.first_event_time),
      detectedAt:       new Date(),
      metadata: {
        event_count:    parseInt(row.event_count, 10),
        group_values:   { actor_user_id: row.actor_user_id, actor_ip: row.actor_ip },
        window_minutes: windowMinutes,
      },
    }))
  }

  // ── SEQUENCE detection ─────────────────────
  // Steps must occur in order within the window

  private async evaluateSequence(
    rule:     DetectionRule,
    tenantId: string,
  ): Promise<DetectionMatch[]> {
    const steps         = rule.detection.steps ?? []
    const windowMinutes = rule.detection.window_minutes
    const groupBy       = rule.detection.group_by

    if (steps.length < 2) return []

    // Step 1: find entities matching the first step
    const firstStep   = steps[0]!
    const firstWhere  = this.buildWhereClauses(firstStep.conditions)
    const groupFields = groupBy.map(f => this.mapField(f)).join(', ')
    const countMin    = firstStep.aggregate?.count_min ?? 1

    const firstSql = `
      SELECT
        ${groupFields},
        count()             AS step_count,
        min(event_time)     AS first_time,
        max(event_time)     AS last_time,
        groupArray(event_id) AS event_ids
      FROM events
      WHERE
        tenant_id = {tenantId:UUID}
        AND event_time >= now() - INTERVAL ${windowMinutes} MINUTE
        ${firstWhere.length > 0 ? 'AND ' + firstWhere.join(' AND ') : ''}
      GROUP BY ${groupFields}
      HAVING step_count >= ${countMin}
      LIMIT 200
    `

    const firstMatches = await queryEvents<{
      actor_user_id: string | null
      actor_ip:      string | null
      step_count:    string
      first_time:    string
      last_time:     string
      event_ids:     string[]
    }>(firstSql, { tenantId })

    if (firstMatches.length === 0) return []

    const matches: DetectionMatch[] = []

    // Step 2: for each first-step match, check if subsequent steps also match
    for (const firstMatch of firstMatches) {
      const entityId    = firstMatch.actor_user_id ?? firstMatch.actor_ip ?? ''
      const stepEndTime = new Date(firstMatch.last_time)
      let   allStepsMet = true
      const allEventIds = [...(firstMatch.event_ids ?? [])]

      for (let i = 1; i < steps.length; i++) {
        const step        = steps[i]!
        const stepWhere   = this.buildWhereClauses(step.conditions)
        const withinMin   = step.within_minutes ?? windowMinutes

        const stepSql = `
          SELECT count() AS cnt, groupArray(event_id) AS ids
          FROM events
          WHERE
            tenant_id = {tenantId:UUID}
            AND event_time BETWEEN {startTime:DateTime64} AND {endTime:DateTime64}
            AND (actor_user_id = {entityId:String} OR actor_ip = {entityId:String})
            ${stepWhere.length > 0 ? 'AND ' + stepWhere.join(' AND ') : ''}
          LIMIT 1
        `

        const stepResult = await queryEvents<{
          cnt: string
          ids: string[]
        }>(stepSql, {
          tenantId,
          entityId,
          startTime: stepEndTime.toISOString().replace('T', ' ').replace('Z', ''),
          endTime: new Date(stepEndTime.getTime() + withinMin * 60_000)
            .toISOString().replace('T', ' ').replace('Z', ''),
        })

        if (!stepResult[0] || parseInt(stepResult[0].cnt, 10) === 0) {
          allStepsMet = false
          break
        }
        allEventIds.push(...(stepResult[0].ids ?? []))
      }

      if (allStepsMet) {
        matches.push({
          ruleId:           rule.id,
          ruleName:         rule.name,
          tenantId,
          entityId,
          entityType:       firstMatch.actor_user_id ? 'user' : 'ip',
          confidence:       rule.confidence_score,
          severity:         rule.severity,
          mitreTactics:     rule.mitre.tactics.map(t => t.id),
          mitreTechniques:  rule.mitre.techniques.map(t => t.id),
          evidenceEventIds: allEventIds.slice(0, 30),
          firstSignalTime:  new Date(firstMatch.first_time),
          detectedAt:       new Date(),
          metadata: {
            steps_completed: steps.length,
            sequence_type:   rule.detection.type,
          },
        })
      }
    }

    return matches
  }

  // ── BASELINE DEVIATION detection ──────────

  private async evaluateBaselineDeviation(
    rule:     DetectionRule,
    tenantId: string,
  ): Promise<DetectionMatch[]> {
    // Simplified: find login events from countries not seen in last 30 days
    // Full implementation integrates with anomaly-service baselines
    const conditions = rule.detection.conditions ?? []
    const newCountryCondition = conditions.find(
      c => c.operator === 'not_in_baseline' && c.baseline_metric === 'login_countries',
    )

    if (!newCountryCondition) return []

    const windowMinutes = rule.detection.window_minutes
    const baselineDays  = newCountryCondition.baseline_days ?? 30

    const sql = `
      SELECT
        actor_user_id,
        actor_ip_country AS new_country,
        event_id,
        event_time
      FROM events
      WHERE
        tenant_id = {tenantId:UUID}
        AND event_time >= now() - INTERVAL ${windowMinutes} MINUTE
        AND event_action IN ('login_success')
        AND outcome = 'success'
        AND actor_ip_country IS NOT NULL
        AND actor_ip_country NOT IN (
          SELECT DISTINCT actor_ip_country
          FROM events
          WHERE
            tenant_id = {tenantId:UUID}
            AND event_time BETWEEN
              now() - INTERVAL ${baselineDays} DAY
              AND now() - INTERVAL ${windowMinutes} MINUTE
            AND event_action IN ('login_success')
            AND outcome = 'success'
        )
      LIMIT 100
    `

    const rows = await queryEvents<{
      actor_user_id: string
      new_country:   string
      event_id:      string
      event_time:    string
    }>(sql, { tenantId })

    return rows.map(row => ({
      ruleId:           rule.id,
      ruleName:         rule.name,
      tenantId,
      entityId:         row.actor_user_id,
      entityType:       'user' as const,
      confidence:       rule.confidence_score,
      severity:         rule.severity,
      mitreTactics:     rule.mitre.tactics.map(t => t.id),
      mitreTechniques:  rule.mitre.techniques.map(t => t.id),
      evidenceEventIds: [row.event_id],
      firstSignalTime:  new Date(row.event_time),
      detectedAt:       new Date(),
      metadata:         { new_country: row.new_country },
    }))
  }

  // ── CORRELATION detection ──────────────────
  // Geo impossible travel check

  private async evaluateCorrelation(
    rule:     DetectionRule,
    tenantId: string,
  ): Promise<DetectionMatch[]> {
    const check = rule.detection.correlation_check
    if (check?.type !== 'geo_impossible_travel') return []

    const windowMinutes = rule.detection.window_minutes
    const minKm         = check.min_distance_km ?? 500

    // Find pairs of logins from different countries within time window
    const sql = `
      SELECT
        e1.actor_user_id,
        e1.actor_ip_country AS country1,
        e2.actor_ip_country AS country2,
        e1.event_id         AS event_id_1,
        e2.event_id         AS event_id_2,
        e1.event_time       AS time1,
        e2.event_time       AS time2,
        dateDiff('minute', e1.event_time, e2.event_time) AS gap_minutes
      FROM events e1
      JOIN events e2 ON
        e1.tenant_id        = e2.tenant_id
        AND e1.actor_user_id = e2.actor_user_id
        AND e1.actor_ip_country != e2.actor_ip_country
        AND e1.event_id     != e2.event_id
        AND e2.event_time    > e1.event_time
      WHERE
        e1.tenant_id = {tenantId:UUID}
        AND e1.event_time >= now() - INTERVAL ${windowMinutes} MINUTE
        AND e1.event_action IN ('login_success')
        AND e1.outcome = 'success'
        AND e2.event_action IN ('login_success')
        AND e2.outcome = 'success'
        AND e1.actor_ip_country IS NOT NULL
        AND e2.actor_ip_country IS NOT NULL
        AND gap_minutes <= ${windowMinutes}
      LIMIT 50
    `

    const rows = await queryEvents<{
      actor_user_id: string
      country1:      string
      country2:      string
      event_id_1:    string
      event_id_2:    string
      time1:         string
      time2:         string
      gap_minutes:   string
    }>(sql, { tenantId })

    return rows.map(row => ({
      ruleId:           rule.id,
      ruleName:         rule.name,
      tenantId,
      entityId:         row.actor_user_id,
      entityType:       'user' as const,
      confidence:       rule.confidence_score,
      severity:         rule.severity,
      mitreTactics:     rule.mitre.tactics.map(t => t.id),
      mitreTechniques:  rule.mitre.techniques.map(t => t.id),
      evidenceEventIds: [row.event_id_1, row.event_id_2],
      firstSignalTime:  new Date(row.time1),
      detectedAt:       new Date(),
      metadata: {
        country1:    row.country1,
        country2:    row.country2,
        gap_minutes: parseInt(row.gap_minutes, 10),
      },
    }))
  }

  // ── ANOMALY_THRESHOLD detection ────────────

  private async evaluateAnomalyThreshold(
    rule:     DetectionRule,
    tenantId: string,
  ): Promise<DetectionMatch[]> {
    // Simplified threshold-based detection for anomaly rules
    // Full anomaly detection is handled by anomaly-service
    return this.evaluateThreshold(rule, tenantId)
  }

  // ── Query builder helpers ──────────────────

  private buildWhereClauses(conditions: Array<{
    field:    string
    operator: string
    value?:   unknown
  }>): string[] {
    const clauses: string[] = []

    for (const cond of conditions) {
      const col = this.mapField(cond.field)

      // Skip special operators handled elsewhere
      if (['not_in_baseline', 'is_new', 'is_same_domain',
           'is_distinct'].includes(cond.operator)) continue

      switch (cond.operator) {
        case 'eq':
          clauses.push(`${col} = '${this.escapeValue(cond.value)}'`)
          break
        case 'neq':
          clauses.push(`${col} != '${this.escapeValue(cond.value)}'`)
          break
        case 'in':
          if (Array.isArray(cond.value)) {
            const vals = cond.value.map(v => `'${this.escapeValue(v)}'`).join(', ')
            clauses.push(`${col} IN (${vals})`)
          }
          break
        case 'not_in':
          if (Array.isArray(cond.value)) {
            const vals = cond.value.map(v => `'${this.escapeValue(v)}'`).join(', ')
            clauses.push(`${col} NOT IN (${vals})`)
          }
          break
        case 'contains':
          clauses.push(`${col} ILIKE '%${this.escapeValue(cond.value)}%'`)
          break
        case 'contains_any':
          if (Array.isArray(cond.value)) {
            const subClauses = cond.value.map(v =>
              `${col} ILIKE '%${this.escapeValue(v)}%'`,
            ).join(' OR ')
            clauses.push(`(${subClauses})`)
          }
          break
        case 'gte':
          clauses.push(`${col} >= ${Number(cond.value)}`)
          break
        case 'lte':
          clauses.push(`${col} <= ${Number(cond.value)}`)
          break
      }
    }

    return clauses
  }

  private mapField(field: string): string {
    const fieldMap: Record<string, string> = {
      'actor_user_id':       'actor_user_id',
      'actor_ip':            'actor_ip',
      'actor_user_type':     'actor_user_type',
      'actor_ip_country':    'actor_ip_country',
      'event_action':        'event_action',
      'event_category':      'event_category',
      'outcome':             'outcome',
      'source_type':         'source_type',
      'target_asset_id':     'target_asset_id',
      'target_resource':     'target_resource',
      'tenant_id':           'tenant_id',
      'metadata.awsUserIdentityType':
                             "JSONExtractString(metadata, 'awsUserIdentityType')",
      'metadata.riskLevel':  "JSONExtractString(metadata, 'riskLevel')",
      'metadata.awsRequestParams.policyArn':
                             "JSONExtractString(metadata, 'awsRequestParams', 'policyArn')",
      'metadata.forwardToExternal':
                             "JSONExtractBool(metadata, 'forwardToExternal')",
    }
    return fieldMap[field] ?? field
  }

  private escapeValue(value: unknown): string {
    return String(value).replace(/'/g, "\\'")
  }
}
