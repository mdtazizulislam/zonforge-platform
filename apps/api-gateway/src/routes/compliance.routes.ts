import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { getDb, schema } from '@zonforge/db-client'
import {
  requirePermission, successResponse, errorResponse,
  parsePagination, buildPaginatedResponse,
} from '../middleware/core.middleware.js'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'api-gateway:compliance' })

export function createComplianceRouter() {
  const router = new Hono()

  // ── GET /v1/compliance/attack-coverage ───────────────────────
  // MITRE ATT&CK heatmap data

  router.get(
    '/v1/compliance/attack-coverage',
    requirePermission('compliance:read'),
    async (ctx) => {
      const user     = ctx.var.user
      const gapsOnly = ctx.req.query('gaps_only') === 'true'
      const db       = getDb()

      // Get all enabled rules (platform + tenant custom)
      const rules = await db.select({
        id:              schema.detectionRules.id,
        name:            schema.detectionRules.name,
        severity:        schema.detectionRules.severity,
        mitreTactics:    schema.detectionRules.mitreTactics,
        mitreTechniques: schema.detectionRules.mitreTechniques,
        mitreCoverage:   schema.detectionRules.mitreCoverageLevel,
        enabled:         schema.detectionRules.enabled,
        hitCount:        schema.detectionRules.hitCount,
        falsePositiveRate: schema.detectionRules.falsePositiveRate,
      })
        .from(schema.detectionRules)
        .where(and(
          eq(schema.detectionRules.enabled, true),
        ))

      // Build technique → rules mapping
      const coverageMap = new Map<string, {
        techniqueId:   string
        ruleIds:       string[]
        ruleNames:     string[]
        coverageLevel: string
        hitCount:      number
      }>()

      for (const rule of rules) {
        for (const technique of (rule.mitreTechniques as string[] ?? [])) {
          const existing = coverageMap.get(technique)
          if (existing) {
            existing.ruleIds.push(rule.id)
            existing.ruleNames.push(rule.name)
            existing.hitCount += rule.hitCount
          } else {
            coverageMap.set(technique, {
              techniqueId:   technique,
              ruleIds:       [rule.id],
              ruleNames:     [rule.name],
              coverageLevel: rule.mitreCoverage ?? 'full',
              hitCount:      rule.hitCount,
            })
          }
        }
      }

      // Known ATT&CK techniques (MVP subset)
      const ALL_TECHNIQUES = [
        { id: 'T1078',     name: 'Valid Accounts',          tacticId: 'TA0001' },
        { id: 'T1078.004', name: 'Cloud Accounts',          tacticId: 'TA0001' },
        { id: 'T1110',     name: 'Brute Force',             tacticId: 'TA0006' },
        { id: 'T1110.001', name: 'Password Guessing',       tacticId: 'TA0006' },
        { id: 'T1110.003', name: 'Password Spraying',       tacticId: 'TA0006' },
        { id: 'T1110.004', name: 'Credential Stuffing',     tacticId: 'TA0006' },
        { id: 'T1621',     name: 'MFA Request Generation',  tacticId: 'TA0006' },
        { id: 'T1550',     name: 'Use Alternate Auth',      tacticId: 'TA0006' },
        { id: 'T1550.001', name: 'App Access Token',        tacticId: 'TA0006' },
        { id: 'T1098',     name: 'Account Manipulation',    tacticId: 'TA0004' },
        { id: 'T1098.001', name: 'Add Cloud Credentials',   tacticId: 'TA0004' },
        { id: 'T1136',     name: 'Create Account',          tacticId: 'TA0003' },
        { id: 'T1136.003', name: 'Cloud Account',           tacticId: 'TA0003' },
        { id: 'T1530',     name: 'Data from Cloud Storage', tacticId: 'TA0010' },
        { id: 'T1213',     name: 'Data from Info Repos',    tacticId: 'TA0009' },
        { id: 'T1114.003', name: 'Email Forwarding Rule',   tacticId: 'TA0009' },
        { id: 'T1490',     name: 'Inhibit System Recovery', tacticId: 'TA0040' },
        { id: 'T1485',     name: 'Data Destruction',        tacticId: 'TA0040' },
        { id: 'T1021',     name: 'Remote Services',         tacticId: 'TA0008' },
        { id: 'T1071.004', name: 'DNS',                     tacticId: 'TA0011' },
        { id: 'T1566.002', name: 'Spearphishing Link',      tacticId: 'TA0001' },
      ]

      const result = ALL_TECHNIQUES
        .map(tech => {
          const coverage = coverageMap.get(tech.id)
          const status   = coverage ? 'covered' : 'gap'
          return {
            techniqueId:   tech.id,
            techniqueName: tech.name,
            tacticId:      tech.tacticId,
            status,
            ruleCount:     coverage?.ruleIds.length ?? 0,
            ruleIds:       coverage?.ruleIds ?? [],
            ruleNames:     coverage?.ruleNames ?? [],
            coverageLevel: coverage?.coverageLevel ?? null,
            hitCount:      coverage?.hitCount ?? 0,
          }
        })
        .filter(t => !gapsOnly || t.status === 'gap')

      const covered = result.filter(t => t.status === 'covered').length
      const total   = result.length

      return successResponse(ctx, {
        techniques:       result,
        summary: {
          total,
          covered,
          gaps:              total - covered,
          coveragePercent:   Math.round((covered / total) * 100),
        },
      })
    },
  )

  // ── GET /v1/compliance/audit-log ──────────────────────────────

  router.get(
    '/v1/compliance/audit-log',
    requirePermission('audit:read'),
    async (ctx) => {
      const user         = ctx.var.user
      const db           = getDb()
      const { limit, cursor } = parsePagination(ctx, 100)

      const logs = await db.select({
        id:           schema.auditLogs.id,
        actorEmail:   schema.auditLogs.actorEmail,
        actorRole:    schema.auditLogs.actorRole,
        actorIp:      schema.auditLogs.actorIp,
        action:       schema.auditLogs.action,
        resourceType: schema.auditLogs.resourceType,
        resourceId:   schema.auditLogs.resourceId,
        changes:      schema.auditLogs.changes,
        createdAt:    schema.auditLogs.createdAt,
      })
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.tenantId, user.tenantId))
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(limit + 1)

      const paginated = buildPaginatedResponse(logs, limit, l => l.createdAt.toISOString())
      return successResponse(ctx, paginated)
    },
  )

  // ── GET /v1/compliance/rules ──────────────────────────────────
  // Detection rules with ATT&CK mapping + quality metrics

  router.get(
    '/v1/compliance/rules',
    requirePermission('rules:read'),
    async (ctx) => {
      const user = ctx.var.user
      const db   = getDb()

      const rules = await db.select({
        id:              schema.detectionRules.id,
        name:            schema.detectionRules.name,
        description:     schema.detectionRules.description,
        severity:        schema.detectionRules.severity,
        enabled:         schema.detectionRules.enabled,
        mitreTactics:    schema.detectionRules.mitreTactics,
        mitreTechniques: schema.detectionRules.mitreTechniques,
        coverageLevel:   schema.detectionRules.mitreCoverageLevel,
        sourceTypes:     schema.detectionRules.sourceTypes,
        confidenceScore: schema.detectionRules.confidenceScore,
        falsePositiveRate: schema.detectionRules.falsePositiveRate,
        hitCount:        schema.detectionRules.hitCount,
        lastHitAt:       schema.detectionRules.lastHitAt,
        isCustom:        schema.detectionRules.tenantId,   // non-null = custom
      })
        .from(schema.detectionRules)
        .where(eq(schema.detectionRules.enabled, true))
        .orderBy(desc(schema.detectionRules.hitCount))

      return successResponse(ctx, rules)
    },
  )

  return router
}
