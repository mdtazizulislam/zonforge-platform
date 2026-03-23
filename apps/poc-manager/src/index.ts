import { Hono }        from 'hono'
import { serve }       from '@hono/node-server'
import { cors }        from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator }  from '@hono/zod-validator'
import { v4 as uuid }  from 'uuid'
import { eq, and, desc, gte, count } from 'drizzle-orm'
import Anthropic       from '@anthropic-ai/sdk'
import { Redis as IORedis } from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import {
  CreatePocSchema, UpdateCriteriaSchema,
  AddCheckInSchema, MarkTaskDoneSchema, ClosePocSchema,
  DEFAULT_MILESTONES, DEFAULT_CRITERIA,
  type PocRecord, type PocEngagementMetrics,
  type SuccessCriteriaStatus,
} from './models/poc.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'poc-manager' })

type AuthUser = {
  tenantId: string
}

function getAuthUser(ctx: any): AuthUser {
  return (ctx.var as any).user as AuthUser
}

// ─────────────────────────────────────────────
// ENGAGEMENT SCORER
// Queries platform usage to measure POC health
// ─────────────────────────────────────────────

async function computeEngagement(
  tenantId: string,
  db:       ReturnType<typeof getDb>,
): Promise<PocEngagementMetrics> {
  const cutoff7d = new Date(Date.now() - 7 * 86_400_000)

  const [alerts, playbooks, rules, connectors, auditLogs] = await Promise.all([
    db.select({ cnt: count() })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.tenantId, tenantId), gte(schema.alerts.createdAt, cutoff7d))),
    db.select({ cnt: count() })
      .from(schema.playbooks)
      .where(and(eq(schema.playbooks.tenantId, tenantId))),
    db.select({ cnt: count() })
      .from(schema.detectionRules)
      .where(and(eq(schema.detectionRules.tenantId, tenantId), eq(schema.detectionRules.enabled, true))),
    db.select({ cnt: count() })
      .from(schema.connectors)
      .where(and(eq(schema.connectors.tenantId, tenantId), eq(schema.connectors.status, 'active'))),
    db.select({ cnt: count() })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.tenantId, tenantId), gte(schema.auditLogs.createdAt, cutoff7d))),
  ])

  const alertCount     = Number(alerts[0]?.cnt ?? 0)
  const playbookCount  = Number(playbooks[0]?.cnt ?? 0)
  const ruleCount      = Number(rules[0]?.cnt ?? 0)
  const connectorCount = Number(connectors[0]?.cnt ?? 0)
  const loginCount     = Number(auditLogs[0]?.cnt ?? 0)

  // Composite engagement score
  const score = Math.min(100, Math.round(
    connectorCount * 15 +   // each connector = 15pts
    Math.min(alertCount, 10) * 3 +  // up to 10 alerts = 30pts
    playbookCount * 10 +
    Math.min(ruleCount, 5) * 2 +
    Math.min(loginCount, 5) * 3,
  ))

  return {
    totalLogins:          loginCount,
    alertsInvestigated:   alertCount,
    playbooksCreated:     playbookCount,
    threatHuntsRun:       0,
    reportsGenerated:     0,
    connectorsConfigured: connectorCount,
    dashboardVisits:      loginCount,
    engagementScore:      score,
    engagementLevel:      score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low',
  }
}

// ─────────────────────────────────────────────
// ROI REPORT GENERATOR
// ─────────────────────────────────────────────

async function generateRoiReport(
  poc:       PocRecord,
  metrics:   PocEngagementMetrics,
  db:        ReturnType<typeof getDb>,
): Promise<string> {
  const achievedCriteria = poc.successCriteria.filter(c => c.status === 'achieved')
  const score = poc.successScore

  // Try AI narrative first
  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? process.env['ZONFORGE_ANTHROPIC_API_KEY']
  if (apiKey) {
    try {
      const ai = new Anthropic({ apiKey })
      const resp = await ai.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Generate a professional executive ROI report for a cybersecurity POC evaluation.

Company: ${poc.companyName} (${poc.industry}, ${poc.companySize})
Champion: ${poc.championName}, ${poc.championTitle}
POC Duration: ${poc.durationDays} days
Target Plan: ${poc.targetPlan} ($${poc.targetMrr}/mo)

Success Criteria Results:
${poc.successCriteria.map(c => `- ${c.title}: ${c.status} (target: ${c.target}${c.actual ? `, actual: ${c.actual}` : ''})`).join('\n')}

Platform Usage:
- Connectors configured: ${metrics.connectorsConfigured}
- Alerts investigated: ${metrics.alertsInvestigated}
- Playbooks created: ${metrics.playbooksCreated}
- Engagement score: ${metrics.engagementScore}/100

Write a 400-word executive summary report with:
1. Key findings (3 bullet points)
2. Value demonstrated
3. ROI calculation (if target MRR > 0: estimate hours saved × $75/hr vs subscription cost)
4. Clear recommendation

Use professional tone suitable for CISO + CFO audience.`,
        }],
      })
      const text = resp.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
      if (text.length > 200) return text
    } catch { /* fallback */ }
  }

  // Fallback template
  return `# POC Evaluation Report — ${poc.companyName}

**Evaluation Period:** ${poc.startDate} — ${poc.actualEndDate ?? poc.endDate}
**Champion:** ${poc.championName}, ${poc.championTitle}
**Evaluator:** ZonForge Sentinel ${poc.targetPlan.charAt(0).toUpperCase() + poc.targetPlan.slice(1)} Plan

---

## Executive Summary

${poc.companyName} conducted a ${poc.durationDays}-day proof-of-concept evaluation of ZonForge Sentinel. The platform was assessed against ${poc.successCriteria.length} pre-defined success criteria.

**Overall Score: ${score}/100** — ${score >= 80 ? '✅ RECOMMENDED FOR PURCHASE' : score >= 60 ? '⚡ CONDITIONAL APPROVAL' : '⚠️ FURTHER EVALUATION NEEDED'}

---

## Success Criteria Results

${poc.successCriteria.map(c => `**${c.title}** (${c.weight}/5 weight)
Target: ${c.target}
Result: ${c.actual ?? 'Not measured'}
Status: ${c.status === 'achieved' ? '✅ ACHIEVED' : c.status === 'not_achieved' ? '❌ NOT ACHIEVED' : '⏳ IN PROGRESS'}
`).join('\n')}

---

## Platform Adoption

| Metric | Value |
|--------|-------|
| Connectors Configured | ${metrics.connectorsConfigured} |
| Alerts Investigated | ${metrics.alertsInvestigated} |
| Playbooks Created | ${metrics.playbooksCreated} |
| Team Engagement | ${metrics.engagementLevel.toUpperCase()} (${metrics.engagementScore}/100) |

---

## ROI Estimate

${poc.targetMrr > 0 ? `
**Annual Investment:** $${poc.targetMrr * 12 / 1000}k/year
**Analyst Time Saved:** ~${metrics.alertsInvestigated * 45} minutes saved during POC
**Projected Annual Savings:** ${Math.round(metrics.alertsInvestigated * 45 * 12 / 60)} analyst hours × $75/hr = $${Math.round(metrics.alertsInvestigated * 45 * 12 / 60 * 75).toLocaleString()}/year
**ROI:** ${Math.round(((metrics.alertsInvestigated * 45 * 12 / 60 * 75) / (poc.targetMrr * 12) - 1) * 100)}% first-year return
` : 'ROI calculation requires target MRR to be set.'}

---

## Recommendation

${achievedCriteria.length}/${poc.successCriteria.length} success criteria achieved.
${score >= 80 ? 'We recommend proceeding with the full subscription.' : score >= 60 ? 'We recommend proceeding with the following conditions addressed.' : 'We recommend an extended evaluation period to address open criteria.'}

---
*Generated by ZonForge Sentinel POC Manager · ${new Date().toLocaleDateString()}*`
}

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const redis = new IORedis({
    host: redisConfig.host, port: redisConfig.port,
    password: redisConfig.password, tls: redisConfig.tls ? {} : undefined,
    maxRetriesPerRequest: 3,
  })

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/poc — Create new POC ─────────────

  app.post('/v1/poc',
    zValidator('json', CreatePocSchema),
    async (ctx) => {
      const user = getAuthUser(ctx)
      const body = ctx.req.valid('json')
      const db   = getDb()

      // Create a dedicated tenant for this POC
      const pocTenantId = uuid()
      const pocSlug     = `poc-${body.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)}-${Date.now().toString(36)}`

      await db.insert(schema.tenants).values({
        id:        pocTenantId,
        name:      `${body.companyName} (POC)`,
        slug:      pocSlug,
        planTier:  body.targetPlan as any,
        status:    'trial',
        region:    'us-east-1',
        settings:  { isPoc: true, pocDurationDays: body.durationDays },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Build milestones
      const milestones = DEFAULT_MILESTONES.map((m, i) => ({
        ...m,
        id:    uuid(),
        tasks: m.tasks.map(t => ({ ...t })),
      }))

      // Build success criteria (default + custom)
      const criteria = [
        ...DEFAULT_CRITERIA.map(c => ({
          ...c,
          id:     uuid(),
          status: 'not_started' as SuccessCriteriaStatus,
        })),
        ...body.customCriteria.map(c => ({
          ...c,
          id:          uuid(),
          status:      'not_started' as SuccessCriteriaStatus,
          description: c.description ?? '',
        })),
      ]

      const startDate = new Date()
      const endDate   = new Date(startDate.getTime() + body.durationDays * 86_400_000)

      const pocId = uuid()
      await db.insert(schema.pocRecords).values({
        id:          pocId,
        tenantId:    pocTenantId,
        companyName: body.companyName,
        companySize: body.companySize,
        industry:    body.industry,
        country:     body.country,
        championName:  body.championName,
        championEmail: body.championEmail,
        championTitle: body.championTitle,
        economicBuyerName: body.economicBuyerName ?? null,
        dealOwner:   body.dealOwner,
        targetPlan:  body.targetPlan,
        targetMrr:   body.targetMrr,
        competitorsMentioned: body.competitorsMentioned,
        status:      'active',
        startDate:   startDate.toISOString(),
        endDate:     endDate.toISOString(),
        durationDays: body.durationDays,
        successCriteria:  criteria,
        milestones,
        checkIns:    [],
        criteriaMetCount:   0,
        criteriaTotalCount: criteria.length,
        successScore:  0,
        currentWeek:   1,
        createdAt:   new Date(),
        updatedAt:   new Date(),
      })

      log.info({ pocId, company: body.companyName, tenantId: pocTenantId }, '🎯 POC created')

      return ctx.json({ success: true, data: {
        pocId,
        pocTenantId,
        pocSlug,
        championEmail: body.championEmail,
        loginUrl:      `https://app.zonforge.com/poc/${pocSlug}/setup`,
        expiresAt:     endDate.toISOString(),
        durationDays:  body.durationDays,
        message:       `POC tenant created for ${body.companyName}. Send ${body.championName} the setup link.`,
      }}, 201)
    })

  // ── GET /v1/poc — List all POCs (platform admin) ─

  app.get('/v1/poc', async (ctx) => {
    const user = getAuthUser(ctx)
    const db   = getDb()

    const pocs = await db.select()
      .from(schema.pocRecords)
      .orderBy(desc(schema.pocRecords.createdAt))
      .limit(50)

    return ctx.json({ success: true, data: pocs })
  })

  // ── GET /v1/poc/:id — POC detail ─────────────

  app.get('/v1/poc/:id', async (ctx) => {
    const user = getAuthUser(ctx)
    const db   = getDb()

    const [poc] = await db.select()
      .from(schema.pocRecords)
      .where(eq(schema.pocRecords.id, ctx.req.param('id')))
      .limit(1)

    if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

    // Compute live engagement
    const engagement = await computeEngagement(poc.tenantId, db)

    return ctx.json({ success: true, data: { ...poc, engagement } })
  })

  // ── PATCH /v1/poc/:id/criteria ───────────────

  app.patch('/v1/poc/:id/criteria',
    zValidator('json', UpdateCriteriaSchema),
    async (ctx) => {
      const db  = getDb()
      const { criteriaId, status, actual, notes, evidenceUrl } = ctx.req.valid('json')

      const [poc] = await db.select()
        .from(schema.pocRecords)
        .where(eq(schema.pocRecords.id, ctx.req.param('id')))
        .limit(1)

      if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

      const criteria = (poc.successCriteria as any[]).map(c =>
        c.id === criteriaId
          ? { ...c, status, actual: actual ?? c.actual, notes: notes ?? c.notes, evidenceUrl: evidenceUrl ?? c.evidenceUrl }
          : c,
      )

      const metCount = criteria.filter(c => c.status === 'achieved').length
      const score    = criteria.length > 0
        ? Math.round((criteria.reduce((s: number, c: any) =>
            s + (c.status === 'achieved' ? c.weight : 0), 0)
          / criteria.reduce((s: number, c: any) => s + c.weight, 0)) * 100)
        : 0

      await db.update(schema.pocRecords)
        .set({
          successCriteria:  criteria,
          criteriaMetCount: metCount,
          successScore:     score,
          updatedAt:        new Date(),
        })
        .where(eq(schema.pocRecords.id, ctx.req.param('id')))

      return ctx.json({ success: true, data: { criteriaId, status, metCount, score } })
    })

  // ── PATCH /v1/poc/:id/task ────────────────────

  app.patch('/v1/poc/:id/task',
    zValidator('json', MarkTaskDoneSchema),
    async (ctx) => {
      const db  = getDb()
      const { milestoneId, taskId, completed } = ctx.req.valid('json')

      const [poc] = await db.select()
        .from(schema.pocRecords)
        .where(eq(schema.pocRecords.id, ctx.req.param('id')))
        .limit(1)

      if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

      const milestones = (poc.milestones as any[]).map(m => {
        if (m.id !== milestoneId) return m
        return {
          ...m,
          tasks: m.tasks.map((t: any) =>
            t.id === taskId ? { ...t, completed, completedAt: completed ? new Date().toISOString() : null } : t,
          ),
          completedAt: m.tasks.every((t: any) => t.id === taskId ? completed : t.completed)
            ? new Date().toISOString() : null,
        }
      })

      await db.update(schema.pocRecords)
        .set({ milestones, updatedAt: new Date() })
        .where(eq(schema.pocRecords.id, ctx.req.param('id')))

      return ctx.json({ success: true, data: { milestoneId, taskId, completed } })
    })

  // ── POST /v1/poc/:id/check-in ─────────────────

  app.post('/v1/poc/:id/check-in',
    zValidator('json', AddCheckInSchema),
    async (ctx) => {
      const db   = getDb()
      const body = ctx.req.valid('json')

      const [poc] = await db.select()
        .from(schema.pocRecords)
        .where(eq(schema.pocRecords.id, ctx.req.param('id')))
        .limit(1)

      if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

      const checkIns = [
        ...(poc.checkIns as any[]),
        { ...body, date: new Date().toISOString(), id: uuid() },
      ]

      await db.update(schema.pocRecords)
        .set({ checkIns, updatedAt: new Date() })
        .where(eq(schema.pocRecords.id, ctx.req.param('id')))

      return ctx.json({ success: true, data: { logged: true } }, 201)
    })

  // ── POST /v1/poc/:id/roi-report ───────────────

  app.post('/v1/poc/:id/roi-report', async (ctx) => {
    const db = getDb()

    const [poc] = await db.select()
      .from(schema.pocRecords)
      .where(eq(schema.pocRecords.id, ctx.req.param('id')))
      .limit(1)

    if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

    const engagement = await computeEngagement(poc.tenantId, db)
    const report     = await generateRoiReport(poc as any, engagement, db)

    return ctx.json({ success: true, data: { report, engagement, score: poc.successScore } })
  })

  // ── POST /v1/poc/:id/close ────────────────────

  app.post('/v1/poc/:id/close',
    zValidator('json', ClosePocSchema),
    async (ctx) => {
      const db   = getDb()
      const body = ctx.req.valid('json')
      const id   = ctx.req.param('id')

      await db.update(schema.pocRecords)
        .set({
          status:       body.outcome,
          wonAt:        body.outcome === 'won'  ? new Date().toISOString() : null,
          lostAt:       body.outcome === 'lost' ? new Date().toISOString() : null,
          dealValue:    body.dealValue ?? null,
          lostReason:   body.lostReason ?? null,
          lostNotes:    body.lostNotes ?? null,
          actualEndDate: new Date().toISOString(),
          updatedAt:    new Date(),
        })
        .where(eq(schema.pocRecords.id, id))

      log.info({ pocId: id, outcome: body.outcome, dealValue: body.dealValue }, `POC closed: ${body.outcome}`)

      return ctx.json({ success: true, data: { closed: true, outcome: body.outcome } })
    })

  // ── GET /v1/poc/stats — Sales pipeline stats ──

  app.get('/v1/poc/stats', async (ctx) => {
    const db  = getDb()
    const all = await db.select({
      status:     schema.pocRecords.status,
      targetMrr:  schema.pocRecords.targetMrr,
      dealValue:  schema.pocRecords.dealValue,
    })
      .from(schema.pocRecords)
      .limit(500)

    const active  = all.filter(p => p.status === 'active').length
    const won     = all.filter(p => p.status === 'won')
    const lost    = all.filter(p => p.status === 'lost').length
    const wonMrr  = won.reduce((s, p) => s + Number(p.dealValue ?? p.targetMrr ?? 0), 0)
    const winRate = (active + won.length + lost) > 0
      ? Math.round((won.length / (active + won.length + lost)) * 100)
      : 0

    return ctx.json({ success: true, data: {
      totalPocs:  all.length,
      active,
      won:        won.length,
      lost,
      review:     all.filter(p => p.status === 'review').length,
      pipeline:   all.filter(p => ['active','review'].includes(p.status)).reduce((s, p) => s + Number(p.targetMrr ?? 0), 0),
      closedMrr:  wonMrr,
      winRate:    `${winRate}%`,
    }})
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'poc-manager', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3025', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🎯 ZonForge POC Manager on port ${info.port}`)
    log.info(`   4-week structured trial framework`)
    log.info(`   AI-generated ROI reports`)
    log.info(`   Win rate tracking + pipeline analytics`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down POC manager...')
    await closeDb(); await redis.quit(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => { log.fatal({ err }, '❌ POC manager failed'); process.exit(1) })
