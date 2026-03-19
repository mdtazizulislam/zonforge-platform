import { z } from 'zod'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'detection-engine:rule-loader' })

// ─────────────────────────────────────────────
// DETECTION RULE SCHEMA (Zod)
// Validates YAML rule files at load time
// ─────────────────────────────────────────────

const MitreEntrySchema = z.object({
  id:   z.string(),
  name: z.string(),
})

const MitreSchema = z.object({
  tactics:        z.array(MitreEntrySchema).min(1),
  techniques:     z.array(MitreEntrySchema.extend({
    sub_techniques: z.array(MitreEntrySchema).optional(),
  })).min(1),
  coverage_level: z.enum(['full', 'partial']).default('full'),
})

const ConditionSchema = z.object({
  field:    z.string(),
  operator: z.enum([
    'eq', 'neq', 'in', 'not_in', 'contains', 'contains_any',
    'gte', 'lte', 'gt', 'lt', 'regex', 'is_new',
    'not_in_baseline', 'is_same_domain', 'is_distinct',
  ]),
  value:          z.unknown().optional(),
  baseline_metric: z.string().optional(),
  baseline_days:   z.number().optional(),
  is_new:          z.boolean().optional(),
})

const AggregateSchema = z.object({
  count_min:              z.number().int().optional(),
  count_max:              z.number().int().optional(),
  distinct_target_count_min: z.number().int().optional(),
  window_minutes:         z.number().int().optional(),
  or_volume_mb_min:       z.number().optional(),
})

const SequenceStepSchema = z.object({
  name:         z.string(),
  conditions:   z.array(ConditionSchema),
  aggregate:    AggregateSchema.optional(),
  within_minutes: z.number().int().optional(),
  must_follow:  z.string().optional(),
})

const DetectionSchema = z.object({
  type:         z.enum([
    'threshold', 'sequence', 'correlation', 'anomaly_threshold',
    'anomaly_correlation', 'baseline_deviation', 'pattern',
  ]),
  window_minutes: z.number().int(),
  group_by:     z.array(z.string()),
  conditions:   z.array(ConditionSchema).optional(),
  steps:        z.array(SequenceStepSchema).optional(),
  filters:      z.array(ConditionSchema).optional(),
  and_conditions: z.array(ConditionSchema.extend({
    within_minutes: z.number().optional(),
    for_same_target: z.boolean().optional(),
  })).optional(),
  or_conditions:  z.array(ConditionSchema).optional(),
  aggregate:    AggregateSchema.optional(),
  count_min:    z.number().int().optional(),
  correlation_check: z.object({
    type:                    z.string(),
    min_distance_km:         z.number().optional(),
    require_distinct_countries: z.boolean().optional(),
    min_events:              z.number().optional(),
  }).optional(),
  anomaly_check: z.object({
    metric:              z.string(),
    std_dev_threshold:   z.number(),
  }).optional(),
  anomaly_checks: z.array(z.object({
    metric:            z.string(),
    std_dev_threshold: z.number().optional(),
    threshold_min:     z.number().optional(),
    is_new:            z.boolean().optional(),
  })).optional(),
  require_anomaly_count: z.number().optional(),
  pattern_check: z.object({
    type:                      z.string(),
    min_events:                z.number(),
    max_interval_std_dev_seconds: z.number().optional(),
    max_interval_mean_seconds: z.number().optional(),
  }).optional(),
})

const AlertConfigSchema = z.object({
  title:               z.string(),
  description:         z.string(),
  priority:            z.enum(['P1', 'P2', 'P3', 'P4', 'P5']),
  recommended_actions: z.array(z.string()),
})

export const RuleSchema = z.object({
  id:               z.string(),
  name:             z.string(),
  description:      z.string(),
  severity:         z.enum(['critical', 'high', 'medium', 'low', 'info']),
  enabled:          z.boolean().default(true),
  mitre:            MitreSchema,
  source_types:     z.array(z.string()),
  event_categories: z.array(z.string()).optional(),
  detection:        DetectionSchema,
  alert:            AlertConfigSchema,
  confidence_score:     z.number().min(0).max(1),
  false_positive_notes: z.string().optional(),
})

export type DetectionRule = z.infer<typeof RuleSchema>

// ─────────────────────────────────────────────
// RULE LOADER
// Loads and validates all YAML rules from disk
// ─────────────────────────────────────────────

export class RuleLoader {
  private rules: Map<string, DetectionRule> = new Map()

  loadFromDirectory(dirPath: string): {
    loaded:  number
    failed:  number
    rules:   DetectionRule[]
    errors:  string[]
  } {
    const errors: string[] = []
    let   loaded  = 0
    let   failed  = 0

    const files = readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

    for (const file of files) {
      const fullPath = join(dirPath, file)
      try {
        const content = readFileSync(fullPath, 'utf-8')

        // YAML files may contain multiple documents (separated by ---)
        const docs = yaml.loadAll(content) as Array<Record<string, unknown>>

        for (const doc of docs) {
          if (!doc || typeof doc !== 'object') continue

          const parsed = RuleSchema.safeParse(doc)
          if (!parsed.success) {
            const errs = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
            errors.push(`${file}: ${errs.join(', ')}`)
            failed++
            log.warn({ file, errors: errs }, 'Rule validation failed')
            continue
          }

          this.rules.set(parsed.data.id, parsed.data)
          loaded++
          log.debug({ ruleId: parsed.data.id, name: parsed.data.name }, 'Rule loaded')
        }
      } catch (err) {
        errors.push(`${file}: ${err instanceof Error ? err.message : 'Parse error'}`)
        failed++
        log.error({ err, file }, 'Failed to load rule file')
      }
    }

    log.info({ loaded, failed, total: loaded + failed }, 'Rule loading complete')
    return { loaded, failed, rules: Array.from(this.rules.values()), errors }
  }

  getRule(id: string): DetectionRule | undefined {
    return this.rules.get(id)
  }

  getAllRules(): DetectionRule[] {
    return Array.from(this.rules.values())
  }

  getEnabledRules(): DetectionRule[] {
    return this.getAllRules().filter(r => r.enabled)
  }

  getEnabledRulesForSourceType(sourceType: string): DetectionRule[] {
    return this.getEnabledRules().filter(r =>
      r.source_types.includes(sourceType) ||
      r.source_types.includes('*'),
    )
  }

  getRulesByMitreTechnique(techniqueId: string): DetectionRule[] {
    return this.getEnabledRules().filter(r =>
      r.mitre.techniques.some(t => t.id === techniqueId),
    )
  }

  // Get ATT&CK coverage summary
  getCoverageSummary(): Map<string, {
    techniqueId:   string
    techniqueName: string
    ruleIds:       string[]
    coverageLevel: string
  }> {
    const coverage = new Map<string, {
      techniqueId:   string
      techniqueName: string
      ruleIds:       string[]
      coverageLevel: string
    }>()

    for (const rule of this.getEnabledRules()) {
      for (const tech of rule.mitre.techniques) {
        const existing = coverage.get(tech.id)
        if (existing) {
          existing.ruleIds.push(rule.id)
        } else {
          coverage.set(tech.id, {
            techniqueId:   tech.id,
            techniqueName: tech.name,
            ruleIds:       [rule.id],
            coverageLevel: rule.mitre.coverage_level,
          })
        }
      }
    }

    return coverage
  }
}

// Default rules directory path
export function getDefaultRulesPath(): string {
  const __dir = dirname(fileURLToPath(import.meta.url))
  return join(__dir, '../../../../security/threat-rules')
}
