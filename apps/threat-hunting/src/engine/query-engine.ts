import { createLogger } from '@zonforge/logger'
import { TEMPLATE_MAP } from '../templates/hunt-templates.js'

const log = createLogger({ service: 'threat-hunting:query-engine' })

// ─────────────────────────────────────────────
// CLICKHOUSE SAFE QUERY ENGINE
//
// Security model:
//   1. Read-only ClickHouse user (SELECT only)
//   2. Tenant isolation — every query gets
//      tenant_id injected as parameter
//   3. SQL injection prevention — only
//      parameterized queries allowed
//   4. Banned keywords block DDL/DML
//   5. Row + time limits enforced
//   6. Query timeout: 30 seconds max
// ─────────────────────────────────────────────

export interface QueryParams {
  tenant_id: string
  [key: string]: string | number
}

export interface QueryResult {
  columns:     string[]
  rows:        Array<Record<string, unknown>>
  rowCount:    number
  executionMs: number
  truncated:   boolean
  queryId:     string
}

export interface SavedHunt {
  id:           string
  tenantId:     string
  name:         string
  description:  string
  templateId?:  string
  query:        string
  parameters:   Record<string, unknown>
  lastRunAt?:   Date
  runCount:     number
  createdBy:    string
  createdAt:    Date
}

// ─────────────────────────────────────────────
// SQL SAFETY CHECKS
// ─────────────────────────────────────────────

const BANNED_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'CREATE',
  'ALTER', 'RENAME', 'ATTACH', 'DETACH', 'KILL', 'OPTIMIZE',
  'SYSTEM ', 'GRANT', 'REVOKE', 'SET ALLOW',
  'INTO OUTFILE', 'INTO DUMPFILE',
  'UNION ALL SELECT', 'UNION SELECT',
  '--', '/*', 'xp_', 'sp_',
]

const MAX_ROWS       = 5000
const MAX_TIMEOUT_MS = 30_000
const MAX_QUERY_LEN  = 8000

export function validateQuery(sql: string): { valid: boolean; error?: string } {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, error: 'Query must be a non-empty string' }
  }

  if (sql.length > MAX_QUERY_LEN) {
    return { valid: false, error: `Query too long (max ${MAX_QUERY_LEN} chars)` }
  }

  const upper = sql.toUpperCase()

  // Must be a SELECT
  const trimmed = sql.trim().toUpperCase()
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    return { valid: false, error: 'Only SELECT and WITH...SELECT queries are permitted' }
  }

  // Check banned keywords
  for (const kw of BANNED_KEYWORDS) {
    if (upper.includes(kw)) {
      return { valid: false, error: `Forbidden SQL keyword: ${kw}` }
    }
  }

  // Must reference events table
  if (!upper.includes('FROM EVENTS') && !upper.includes('FROM\nEVENTS') && !upper.includes('JOIN EVENTS')) {
    return { valid: false, error: 'Query must SELECT from the events table' }
  }

  // Must include tenant_id parameter placeholder
  if (!sql.includes('{tenant_id:UUID}')) {
    return { valid: false, error: 'Query must include {tenant_id:UUID} for tenant isolation' }
  }

  return { valid: true }
}

// ─────────────────────────────────────────────
// PARAMETER SUBSTITUTION
//
// ClickHouse native parameterized query format:
//   {param_name:Type}
// We pass params via URL query string.
// ─────────────────────────────────────────────

export function buildClickHouseUrl(
  baseUrl: string,
  params:  QueryParams,
): string {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/`)
  url.searchParams.set('output_format_json_quote_64bit_integers', '1')
  url.searchParams.set('max_result_rows', String(MAX_ROWS))
  url.searchParams.set('result_overflow_mode', 'break')
  url.searchParams.set('max_execution_time', String(MAX_TIMEOUT_MS / 1000))
  url.searchParams.set('readonly', '1')
  url.searchParams.set('format', 'JSONCompact')

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(`param_${k}`, String(v))
  }

  return url.toString()
}

// ─────────────────────────────────────────────
// QUERY EXECUTOR
// ─────────────────────────────────────────────

export async function executeHuntQuery(
  sql:      string,
  params:   QueryParams,
): Promise<QueryResult> {
  const queryId  = crypto.randomUUID()
  const start    = Date.now()
  const chHost   = process.env['ZONFORGE_CLICKHOUSE_HOST'] ?? 'http://localhost:8123'
  const chUser   = process.env['ZONFORGE_CLICKHOUSE_USER'] ?? 'zonforge_readonly'
  const chPass   = process.env['ZONFORGE_CLICKHOUSE_PASS'] ?? ''

  // Add implicit LIMIT safety net if not present
  const upperSql = sql.toUpperCase()
  const finalSql = upperSql.includes('LIMIT')
    ? sql
    : `${sql.trimEnd()}\nLIMIT ${MAX_ROWS}`

  log.info({ queryId, tenantId: params.tenant_id, sqlLen: finalSql.length }, 'Hunt query starting')

  const url = buildClickHouseUrl(chHost, params)

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-ClickHouse-Database': 'zonforge_events',
    'X-ClickHouse-Query-Id': queryId,
  }

  if (chUser) {
    headers['X-ClickHouse-User']     = chUser
    headers['X-ClickHouse-Key']      = chPass
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS)

  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers,
      body:    finalSql,
      signal:  controller.signal,
    })

    const executionMs = Date.now() - start

    if (!resp.ok) {
      const errText = await resp.text()
      log.error({ queryId, status: resp.status, errText }, 'ClickHouse query failed')
      throw new Error(`ClickHouse error ${resp.status}: ${errText.slice(0, 300)}`)
    }

    const data = await resp.json() as {
      meta: Array<{ name: string; type: string }>
      data: Array<unknown[]>
      rows: number
      rows_before_limit_at_least?: number
    }

    const columns = data.meta.map(m => m.name)
    const rows    = data.data.map(rowArr => {
      const obj: Record<string, unknown> = {}
      columns.forEach((col, i) => { obj[col] = (rowArr as unknown[])[i] })
      return obj
    })

    const truncated = (data.rows_before_limit_at_least ?? data.rows) > data.rows

    log.info({
      queryId, rowCount: rows.length, executionMs, truncated,
    }, 'Hunt query completed')

    return { columns, rows, rowCount: rows.length, executionMs, truncated, queryId }

  } catch (err) {
    const executionMs = Date.now() - start
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Query timeout after ${MAX_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─────────────────────────────────────────────
// TEMPLATE QUERY EXECUTOR
// ─────────────────────────────────────────────

export async function executeTemplate(
  templateId: string,
  tenantId:   string,
  overrides:  Record<string, string | number> = {},
): Promise<QueryResult> {
  const template = TEMPLATE_MAP.get(templateId)
  if (!template) {
    throw new Error(`Unknown hunt template: ${templateId}`)
  }

  // Build parameters from defaults + overrides
  const params: QueryParams = { tenant_id: tenantId }
  for (const p of template.parameters) {
    params[p.name] = overrides[p.name] ?? p.defaultValue
  }

  const validation = validateQuery(template.query)
  if (!validation.valid) {
    throw new Error(`Template query validation failed: ${validation.error}`)
  }

  return executeHuntQuery(template.query, params)
}

// ─────────────────────────────────────────────
// IOC PIVOT
// ─────────────────────────────────────────────

export async function pivotOnIoc(
  tenantId:      string,
  iocType:       'ip' | 'user' | 'domain' | 'hash',
  iocValue:      string,
  lookbackDays = 30,
): Promise<QueryResult> {
  const templateMap: Record<typeof iocType, string> = {
    ip:     'HT-IOC-001',
    user:   'HT-IOC-002',
    domain: 'HT-IOC-003',
    hash:   'HT-IOC-001',   // fallback to IP template structure
  }

  const paramMap: Record<typeof iocType, Record<string, string | number>> = {
    ip:     { ip_address: iocValue,  lookback_days: lookbackDays },
    user:   { user_id: iocValue,     lookback_days: lookbackDays },
    domain: { domain: `%${iocValue}%`, lookback_days: lookbackDays },
    hash:   { ip_address: iocValue,  lookback_days: lookbackDays },
  }

  return executeTemplate(templateMap[iocType], tenantId, paramMap[iocType])
}

// ─────────────────────────────────────────────
// HUNT → DETECTION RULE PROMOTION
// ─────────────────────────────────────────────

export interface PromotedRule {
  name:            string
  description:     string
  sourceHuntId:    string
  query:           string
  severity:        string
  mitreTechniques: string[]
  tenantId:        string
  createdBy:       string
}

export async function promoteHuntToRule(
  hunt:     SavedHunt,
  name:     string,
  severity: 'critical' | 'high' | 'medium' | 'low',
  tenantId: string,
  userId:   string,
): Promise<PromotedRule> {
  // Get MITRE techniques from template if hunt is based on one
  const template     = hunt.templateId ? TEMPLATE_MAP.get(hunt.templateId) : undefined
  const techniques   = template?.mitreTechniques ?? []

  const promoted: PromotedRule = {
    name,
    description: `Promoted from threat hunt: ${hunt.name}. ${hunt.description}`,
    sourceHuntId: hunt.id,
    query:        hunt.query,
    severity,
    mitreTechniques: techniques,
    tenantId,
    createdBy: userId,
  }

  // Persist to detection_rules table
  const { getDb, schema } = await import('@zonforge/db-client')
  const db  = getDb()
  const id  = crypto.randomUUID()

  await db.insert(schema.detectionRules).values({
    id,
    tenantId,
    name,
    description:    promoted.description,
    severity,
    enabled:        true,
    hitCount:       0,
    sourceTypes:    ['threat_hunt'],
    conditions:     [{ type: 'threat_hunt', query: hunt.query, sourceHuntId: hunt.id }],
    mitreTactics:   [],
    mitreTechniques: techniques,
    createdBy:      userId,
  })

  log.info({ huntId: hunt.id, ruleId: id, name, tenantId }, 'Hunt promoted to detection rule')
  return promoted
}
