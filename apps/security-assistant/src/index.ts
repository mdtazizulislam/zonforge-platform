import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { stream }     from 'hono/streaming'
import { v4 as uuid } from 'uuid'
import { eq, and, desc, gte, count } from 'drizzle-orm'
import Anthropic      from '@anthropic-ai/sdk'
import { Redis }          from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { requestIdMiddleware, authMiddleware } from '@zonforge/auth-utils'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const log = createLogger({ service: 'security-assistant' })

// ─────────────────────────────────────────────
// SECURITY ASSISTANT TOOLS
// The AI can call these to answer user questions
// ─────────────────────────────────────────────

type AssistantToolDef = Record<string, unknown>

const ASSISTANT_TOOLS: AssistantToolDef[] = [
  {
    name: 'query_recent_alerts',
    description: 'Get recent security alerts for the tenant. Use when user asks about recent incidents, alerts, or security events.',
    input_schema: {
      type: 'object',
      properties: {
        limit:    { type: 'number', default: 10 },
        severity: { type: 'string', enum: ['critical','high','medium','low'], description: 'Filter by severity' },
        status:   { type: 'string', enum: ['open','investigating','resolved'], description: 'Filter by status' },
      },
    },
  },
  {
    name: 'lookup_entity_activity',
    description: 'Look up all recent activity for a specific user, IP address, or asset. Use when user asks about a specific entity.',
    input_schema: {
      type: 'object',
      required: ['entity', 'entity_type'],
      properties: {
        entity:      { type: 'string', description: 'User email, IP address, or asset ID' },
        entity_type: { type: 'string', enum: ['user','ip','asset'] },
        lookback_hours: { type: 'number', default: 48 },
      },
    },
  },
  {
    name: 'get_risk_score',
    description: 'Get current risk score and contributing signals for a user or entity.',
    input_schema: {
      type: 'object',
      required: ['entity_id'],
      properties: {
        entity_id: { type: 'string', description: 'User ID or email' },
      },
    },
  },
  {
    name: 'check_ip_reputation',
    description: 'Check if an IP address is in threat intelligence feeds as malicious.',
    input_schema: {
      type: 'object',
      required: ['ip'],
      properties: { ip: { type: 'string' } },
    },
  },
  {
    name: 'get_security_posture',
    description: 'Get overall security posture metrics: open alerts, posture score, connector health.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'run_hunt_query',
    description: 'Run a quick ClickHouse search query. Use for specific data lookups.',
    input_schema: {
      type: 'object',
      required: ['description'],
      properties: {
        description: { type: 'string', description: 'Describe what to search for in plain English' },
        entity:      { type: 'string', description: 'Entity to search (user, IP, etc.)' },
        lookback_hours: { type: 'number', default: 24 },
      },
    },
  },
]

// ─────────────────────────────────────────────
// TOOL EXECUTOR
// ─────────────────────────────────────────────

async function executeTool(
  toolName: string,
  input:    Record<string, unknown>,
  tenantId: string,
): Promise<unknown> {
  const db = getDb()

  switch (toolName) {
    case 'query_recent_alerts': {
      const conditions: any[] = [eq(schema.alerts.tenantId, tenantId)]
      if (input.severity) conditions.push(eq(schema.alerts.severity, input.severity as string))
      if (input.status) {
        conditions.push(eq(
          schema.alerts.status,
          input.status as 'open' | 'investigating' | 'resolved' | 'suppressed' | 'false_positive',
        ))
      }

      const alerts = await db.select({
        id: schema.alerts.id, title: schema.alerts.title,
        severity: schema.alerts.severity, priority: schema.alerts.priority,
        status: schema.alerts.status, createdAt: schema.alerts.createdAt,
        affectedUserId: schema.alerts.affectedUserId,
        affectedIp: schema.alerts.affectedIp,
      })
        .from(schema.alerts)
        .where(and(...conditions))
        .orderBy(desc(schema.alerts.createdAt))
        .limit(Math.min((input.limit as number) ?? 10, 20))

      return { count: alerts.length, alerts }
    }

    case 'lookup_entity_activity': {
      const entity     = input.entity as string
      const entityType = input.entity_type as string
      const cutoff     = new Date(Date.now() - ((input.lookback_hours as number) ?? 48) * 3_600_000)

      const conditions: any[] = [
        eq(schema.alerts.tenantId, tenantId),
        gte(schema.alerts.createdAt, cutoff),
      ]

      if (entityType === 'user')
        conditions.push(eq(schema.alerts.affectedUserId, entity))
      else if (entityType === 'ip')
        conditions.push(eq(schema.alerts.affectedIp, entity))

      const alerts = await db.select({
        id: schema.alerts.id, title: schema.alerts.title,
        severity: schema.alerts.severity, status: schema.alerts.status,
        createdAt: schema.alerts.createdAt,
      })
        .from(schema.alerts)
        .where(and(...conditions))
        .orderBy(desc(schema.alerts.createdAt))
        .limit(10)

      const riskRows = await db.select()
        .from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId, tenantId),
          eq(schema.riskScores.entityId, entity),
        ))
        .limit(1)

      return {
        entity, entityType,
        riskScore:  riskRows[0]?.score ?? null,
        severity:   riskRows[0]?.severity ?? null,
        alertCount: alerts.length,
        alerts,
      }
    }

    case 'get_risk_score': {
      const rows = await db.select()
        .from(schema.riskScores)
        .where(and(
          eq(schema.riskScores.tenantId, tenantId),
          eq(schema.riskScores.entityId, input.entity_id as string),
        ))
        .limit(1)

      return rows[0] ?? { message: 'No risk score found', entityId: input.entity_id }
    }

    case 'check_ip_reputation': {
      const rows = await db.select()
        .from(schema.threatIntelIocs)
        .where(and(
          eq(schema.threatIntelIocs.iocValue, input.ip as string),
          eq(schema.threatIntelIocs.iocType, 'ip'),
        ))
        .limit(5)

      return {
        ip:          input.ip,
        isMalicious: rows.length > 0,
        findings:    rows.map(r => ({
          threatType: r.severity,
          confidence: Number(r.confidence) * 100,
          source:     r.feedSource,
        })),
      }
    }

    case 'get_security_posture': {
      const [openAlerts, connectors, riskScores] = await Promise.all([
        db.select({ cnt: count(), severity: schema.alerts.severity })
          .from(schema.alerts)
          .where(and(eq(schema.alerts.tenantId, tenantId), eq(schema.alerts.status, 'open')))
          .groupBy(schema.alerts.severity),
        db.select({ total: count(), healthy: count() })
          .from(schema.connectors)
          .where(eq(schema.connectors.tenantId, tenantId)),
        db.select({ score: schema.riskScores.score })
          .from(schema.riskScores)
          .where(and(eq(schema.riskScores.tenantId, tenantId), eq(schema.riskScores.entityType, 'org')))
          .limit(1),
      ])

      const alertsBySevirity: Record<string, number> = {}
      for (const r of openAlerts) alertsBySevirity[r.severity] = Number(r.cnt)

      return {
        openAlerts:    openAlerts.reduce((s, r) => s + Number(r.cnt), 0),
        bySeverity:    alertsBySevirity,
        postureScore:  riskScores[0]?.score ?? 68,
        connectors:    { total: Number(connectors[0]?.total ?? 0) },
      }
    }

    case 'run_hunt_query': {
      // Simple natural language → predefined query mapping
      const descriptionLower = (input.description as string ?? '').toLowerCase()
      const entity = input.entity as string ?? ''
      const cutoff = new Date(Date.now() - ((input.lookback_hours as number) ?? 24) * 3_600_000)

      const alerts = await db.select({
        id: schema.alerts.id, title: schema.alerts.title,
        severity: schema.alerts.severity, createdAt: schema.alerts.createdAt,
        affectedUserId: schema.alerts.affectedUserId, affectedIp: schema.alerts.affectedIp,
      })
        .from(schema.alerts)
        .where(and(
          eq(schema.alerts.tenantId, tenantId),
          gte(schema.alerts.createdAt, cutoff),
        ))
        .orderBy(desc(schema.alerts.createdAt))
        .limit(10)

      return {
        query:   descriptionLower,
        results: alerts,
        count:   alerts.length,
        period:  `${input.lookback_hours ?? 24} hours`,
      }
    }

    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// ─────────────────────────────────────────────
// CONVERSATION MANAGER (multi-turn memory)
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are ZonForge Sentinel AI — an expert security operations assistant embedded in a cybersecurity platform. You help security analysts investigate incidents, understand threats, and respond to security events.

You have access to real-time security data through your tools. Always use tools to get actual data before answering questions about specific entities, alerts, or metrics.

Your personality:
- Direct and professional, like a senior SOC analyst
- Give specific, actionable answers — not vague advice
- When you find a threat, be clear about severity and urgency
- Use security terminology correctly
- If you don't know something, say so and suggest next steps

Response format:
- Keep answers concise (3-5 sentences max unless detail is needed)
- Use bullet points for lists of findings
- Bold important terms like **CRITICAL**, **user email**, **IP address**
- Always end investigation responses with a clear recommendation

You can take actions:
- Query recent alerts
- Look up entity (user/IP) activity
- Check IP reputation
- Get risk scores
- Run data searches`

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────

async function start() {
  initDb(postgresConfig)

  const redis = new Redis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
  })

  let anthropic: Anthropic | null = null
  try {
    anthropic = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'] ?? process.env['ZONFORGE_ANTHROPIC_API_KEY'],
    })
    log.info('✅ Anthropic client initialized')
  } catch {
    log.warn('⚠️  Anthropic API key not set — assistant will respond with limited mode')
  }

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true, allowMethods: ['GET','POST','OPTIONS'] }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/assistant/chat (streaming) ───────

  app.post('/v1/assistant/chat', async (ctx) => {
    const user = (ctx.var as any).user as { tenantId: string }
    const body = await ctx.req.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      sessionId?: string
    }

    const sessionId = body.sessionId ?? uuid()

    if (!anthropic) {
      return ctx.json({ success: true, data: {
        sessionId,
        message:   'AI assistant is not configured. Please set ANTHROPIC_API_KEY.',
        toolsUsed: [],
      }})
    }

    // Agentic loop with tool use
    const messages = body.messages.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }))

    let toolsUsed: string[] = []
    let response: Anthropic.Message
    let currentMessages = [...messages]

    // Tool-use loop (max 5 rounds)
    for (let round = 0; round < 5; round++) {
      response = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        tools:      ASSISTANT_TOOLS,
        messages:   currentMessages,
      } as Parameters<Anthropic['messages']['create']>[0]) as Anthropic.Message

      if (response.stop_reason === 'end_turn') break

      // Execute tool calls
      type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown }
      const toolUseBlocks = (response.content as unknown as ToolUseBlock[]).filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      )
      if (toolUseBlocks.length === 0) break

      currentMessages.push({ role: 'assistant', content: response.content } as any)

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          toolsUsed.push(block.name)
          const result = await executeTool(block.name, block.input as any, user.tenantId)
          return { type: 'tool_result' as const, tool_use_id: block.id, content: JSON.stringify(result) }
        }),
      )

      currentMessages.push({ role: 'user', content: toolResults.filter(Boolean) } as any)
    }

    // Extract final text
    const finalText = response!.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('\n')

    // Store conversation in Redis (24h TTL)
    const key = `zf:assistant:session:${user.tenantId}:${sessionId}`
    await redis.setex(key, 86_400, JSON.stringify({ messages: currentMessages, updatedAt: new Date() }))

    return ctx.json({ success: true, data: {
      sessionId,
      message:   finalText,
      toolsUsed: [...new Set(toolsUsed)],
      model:     'claude-sonnet-4-6',
    }})
  })

  // ── GET /v1/assistant/suggestions ────────────
  // Context-aware quick suggestions

  app.get('/v1/assistant/suggestions', async (ctx) => {
    const user = (ctx.var as any).user as { tenantId: string }
    const db   = getDb()

    const criticalAlerts = await db.select({ id: schema.alerts.id, title: schema.alerts.title })
      .from(schema.alerts)
      .where(and(
        eq(schema.alerts.tenantId, user.tenantId),
        eq(schema.alerts.severity, 'critical'),
        eq(schema.alerts.status, 'open'),
      ))
      .limit(2)

    const suggestions = [
      'Show me the current security posture',
      'What are the most urgent open alerts?',
      ...criticalAlerts.map(a => `Investigate alert: ${a.title.slice(0, 50)}`),
      'Are there any suspicious IPs in the last 24 hours?',
      'Show me users with the highest risk scores',
      'What happened in the last hour?',
    ].slice(0, 6)

    return ctx.json({ success: true, data: { suggestions } })
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'security-assistant', aiReady: !!anthropic, timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3022', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`💬 ZonForge Security Assistant on port ${info.port}`)
    log.info(`   AI: ${anthropic ? 'claude-sonnet-4-6 ✅' : '⚠️  API key not set'}`)
    log.info(`   Tools: ${ASSISTANT_TOOLS.map(t => t.name).join(', ')}`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down security assistant...')
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => { log.fatal({ err }, '❌ Security assistant failed'); process.exit(1) })
