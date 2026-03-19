import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { v4 as uuid } from 'uuid'
import { eq, and, desc, gte, count } from 'drizzle-orm'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { requestIdMiddleware, authMiddleware } from '@zonforge/auth-utils'
import { z } from 'zod'

const log = createLogger({ service: 'poc-management' })

// ─────────────────────────────────────────────
// POC DOMAIN TYPES
// ─────────────────────────────────────────────

type PocStatus = 'active' | 'extended' | 'converting' | 'converted' | 'churned' | 'expired'
type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

interface PocMilestone {
  id:          string
  name:        string
  description: string
  dueDay:      number      // day of POC (e.g. day 7, day 14, day 30)
  status:      MilestoneStatus
  completedAt?: Date
  notes?:      string
  autoCheck:   boolean     // can we verify this automatically?
  metricKey?:  string      // what metric to check
  metricTarget?: number
}

interface PocEngagement {
  id:              string
  tenantId:        string
  companyName:     string
  contactName:     string
  contactEmail:    string
  contactTitle:    string
  industry:        string
  companySize:     string
  useCase:         string       // primary security problem
  estimatedDealSize: number    // USD annual

  status:          PocStatus
  startDate:       Date
  endDate:         Date
  extendedUntil?:  Date
  trialDays:       number

  // Success criteria agreed with customer
  successCriteria: string[]
  milestones:      PocMilestone[]

  // Value realized during POC
  valueRealized: {
    alertsDetected:      number
    falsePositivesPrevented: number
    mttdImprovement:     number   // %
    hoursAnaylstSaved:   number
    incidentsContained:  number
    estimatedRoiMultiple: number
  }

  // Engagement health
  healthScore:     number     // 0-100
  lastActivity:    Date
  loginCount:      number
  featuresUsed:    string[]
  churnRisk:       'low' | 'medium' | 'high'
  churnReason?:    string

  // ZonForge sales owner
  salesOwner:      string
  notes:           string
  createdAt:       Date
  updatedAt:       Date
}

// ─────────────────────────────────────────────
// DEFAULT POC MILESTONES (30-day playbook)
// ─────────────────────────────────────────────

const DEFAULT_MILESTONES: Omit<PocMilestone, 'id' | 'status' | 'completedAt'>[] = [
  {
    name:        'Day 1: First Connector Live',
    description: 'Connect at least one data source (M365, AWS, or Google Workspace)',
    dueDay:      1,
    autoCheck:   true,
    metricKey:   'active_connectors',
    metricTarget: 1,
  },
  {
    name:        'Day 7: First Alert Generated',
    description: 'Platform generates at least one security alert from real data',
    dueDay:      7,
    autoCheck:   true,
    metricKey:   'total_alerts',
    metricTarget: 1,
  },
  {
    name:        'Day 7: Team Onboarding Complete',
    description: 'Primary analysts complete onboarding walkthrough',
    dueDay:      7,
    autoCheck:   false,
  },
  {
    name:        'Day 14: First True Positive Confirmed',
    description: 'Analyst reviews and confirms at least one real security finding',
    dueDay:      14,
    autoCheck:   true,
    metricKey:   'resolved_alerts',
    metricTarget: 1,
  },
  {
    name:        'Day 14: Risk Score Baseline',
    description: 'Behavioral AI has profiled top 10 users',
    dueDay:      14,
    autoCheck:   true,
    metricKey:   'risk_profiles',
    metricTarget: 5,
  },
  {
    name:        'Day 21: First Playbook Executed',
    description: 'At least one automated playbook runs and creates ticket/notification',
    dueDay:      21,
    autoCheck:   true,
    metricKey:   'playbook_executions',
    metricTarget: 1,
  },
  {
    name:        'Day 21: Compliance Report Generated',
    description: 'Run SOC2/ISO27001 compliance assessment',
    dueDay:      21,
    autoCheck:   false,
  },
  {
    name:        'Day 28: Executive Demo',
    description: 'Present board-level security report to executive sponsor',
    dueDay:      28,
    autoCheck:   false,
  },
  {
    name:        'Day 30: ROI Report Delivered',
    description: 'Share value realization report with customer',
    dueDay:      30,
    autoCheck:   false,
  },
  {
    name:        'Day 30: Commercial Discussion',
    description: 'Procurement/contract review call scheduled',
    dueDay:      30,
    autoCheck:   false,
  },
]

// ─────────────────────────────────────────────
// POC HEALTH CALCULATOR
// ─────────────────────────────────────────────

async function calculatePocHealth(
  poc: PocEngagement,
  db:  ReturnType<typeof getDb>,
): Promise<{ score: number; churnRisk: PocEngagement['churnRisk']; signals: string[] }> {
  const signals: string[] = []
  let   score = 100

  const daysSinceStart = Math.floor((Date.now() - poc.startDate.getTime()) / 86_400_000)
  const daysLeft       = Math.max(0, poc.trialDays - daysSinceStart)

  // Check milestone completion
  const completed  = poc.milestones.filter(m => m.status === 'completed').length
  const due        = poc.milestones.filter(m => m.dueDay <= daysSinceStart).length
  const completionRate = due > 0 ? (completed / due) : 1

  if (completionRate < 0.5) {
    score -= 30
    signals.push(`Only ${completed}/${due} due milestones completed`)
  } else if (completionRate < 0.8) {
    score -= 15
    signals.push(`${completed}/${due} milestones on track`)
  }

  // Check recent login activity
  const daysSinceActivity = Math.floor((Date.now() - poc.lastActivity.getTime()) / 86_400_000)
  if (daysSinceActivity > 7) {
    score -= 25
    signals.push(`No activity for ${daysSinceActivity} days — high churn risk`)
  } else if (daysSinceActivity > 3) {
    score -= 10
    signals.push(`Low activity in last ${daysSinceActivity} days`)
  }

  // Check connector health for this tenant
  const connectors = await db.select({ cnt: count(), healthy: count() })
    .from(schema.connectors)
    .where(eq(schema.connectors.tenantId, poc.tenantId))
  const connCount = Number(connectors[0]?.cnt ?? 0)
  if (connCount === 0) {
    score -= 20
    signals.push('No connectors configured — customer may not have gotten started')
  }

  // Check alert volume
  const cutoff  = new Date(Date.now() - 7 * 86_400_000)
  const alerts  = await db.select({ cnt: count() })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.tenantId, poc.tenantId), gte(schema.alerts.createdAt, cutoff)))
  const alertCount = Number(alerts[0]?.cnt ?? 0)
  if (alertCount === 0 && daysSinceStart > 3) {
    score -= 15
    signals.push('No alerts generated — data may not be flowing')
  }

  // Time pressure
  if (daysLeft <= 5 && daysLeft > 0) {
    signals.push(`⚠️ Only ${daysLeft} days left in trial`)
  }

  score = Math.max(0, score)
  const churnRisk: PocEngagement['churnRisk'] =
    score >= 70 ? 'low' : score >= 40 ? 'medium' : 'high'

  return { score, churnRisk, signals }
}

// ─────────────────────────────────────────────
// ROI CALCULATOR
// ─────────────────────────────────────────────

async function calculateRoi(
  tenantId: string,
  periodDays: number,
  db: ReturnType<typeof getDb>,
): Promise<{
  alertsDetected:          number
  estimatedFalsePositives: number
  analystHoursSaved:       number
  incidentsContained:      number
  estimatedRoiMultiple:    number
  roiNarrative:            string
}> {
  const cutoff = new Date(Date.now() - periodDays * 86_400_000)

  const [alerts, playbooks] = await Promise.all([
    db.select({ severity: schema.alerts.severity, status: schema.alerts.status })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.tenantId, tenantId), gte(schema.alerts.createdAt, cutoff)))
      .limit(500),
    db.select({ cnt: count() })
      .from(schema.playbookExecutions)
      .where(and(eq(schema.playbookExecutions.tenantId, tenantId), gte(schema.playbookExecutions.createdAt, cutoff))),
  ])

  const totalAlerts    = alerts.length
  const fpCount        = alerts.filter(a => a.status === 'false_positive').length
  const resolved       = alerts.filter(a => a.status === 'resolved').length
  const playbookCount  = Number(playbooks[0]?.cnt ?? 0)

  // Industry benchmarks for ROI calculation
  const manualInvestigationMinutes = 45    // avg per alert without ZonForge
  const aiInvestigationMinutes     = 8     // avg per alert with ZonForge AI SOC
  const analystHourlyRate          = 85    // USD

  const minutesSaved       = (manualInvestigationMinutes - aiInvestigationMinutes) * totalAlerts
  const hoursSaved         = Math.round(minutesSaved / 60)
  const dollarsSaved       = hoursSaved * analystHourlyRate
  const breachCostAvoided  = resolved > 0 ? resolved * 50_000 : 0   // avg breach = $50k
  const totalValue         = dollarsSaved + breachCostAvoided

  // ZonForge cost (approximate Business plan)
  const subscriptionCost   = 999 * (periodDays / 30)
  const roiMultiple        = subscriptionCost > 0 ? Math.round(totalValue / subscriptionCost) : 0

  const roiNarrative = `During the ${periodDays}-day POC, ZonForge detected ${totalAlerts} security events, ` +
    `saving approximately ${hoursSaved} analyst hours ($${dollarsSaved.toLocaleString()}) through AI-assisted investigation. ` +
    `With ${playbookCount} automated playbook executions, your team responded ${Math.round((manualInvestigationMinutes / aiInvestigationMinutes))}× faster than manual workflows. ` +
    `Estimated ROI: ${roiMultiple}× your annual subscription cost.`

  return {
    alertsDetected:          totalAlerts,
    estimatedFalsePositives: fpCount,
    analystHoursSaved:       hoursSaved,
    incidentsContained:      resolved,
    estimatedRoiMultiple:    roiMultiple,
    roiNarrative,
  }
}

// ─────────────────────────────────────────────
// SCHEMAS
// ─────────────────────────────────────────────

const CreatePocSchema = z.object({
  companyName:       z.string().min(1).max(200),
  contactName:       z.string().min(1).max(200),
  contactEmail:      z.string().email(),
  contactTitle:      z.string().max(100).default(''),
  industry:          z.string().max(100).default('Technology'),
  companySize:       z.enum(['1-50','51-200','201-500','501-2000','2001+']).default('201-500'),
  useCase:           z.string().max(500).default(''),
  estimatedDealSize: z.number().min(0).default(50_000),
  trialDays:         z.number().int().min(7).max(90).default(30),
  successCriteria:   z.array(z.string()).default([]),
  salesOwner:        z.string().default(''),
})

const UpdateMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  status:      z.enum(['pending','in_progress','completed','blocked']),
  notes:       z.string().max(500).optional(),
})

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────

async function start() {
  initDb(postgresConfig)
  log.info('✅ PostgreSQL connected')

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/poc ──────────────────────────────
  // Create a new POC engagement

  app.post('/v1/poc',
    zValidator('json', CreatePocSchema),
    async (ctx) => {
      const user = ctx.var.user
      const body = ctx.req.valid('json')
      const db   = getDb()

      if (!['TENANT_ADMIN','PLATFORM_ADMIN'].includes(user.role)) {
        return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
      }

      const pocId    = uuid()
      const startDate = new Date()
      const endDate   = new Date(startDate.getTime() + body.trialDays * 86_400_000)

      // Build milestones
      const milestones: PocMilestone[] = DEFAULT_MILESTONES.map(m => ({
        ...m,
        id:     uuid(),
        status: 'pending' as MilestoneStatus,
      }))

      const poc: Omit<PocEngagement, 'valueRealized' | 'healthScore' | 'churnRisk'> = {
        id:              pocId,
        tenantId:        user.tenantId,
        companyName:     body.companyName,
        contactName:     body.contactName,
        contactEmail:    body.contactEmail,
        contactTitle:    body.contactTitle,
        industry:        body.industry,
        companySize:     body.companySize,
        useCase:         body.useCase,
        estimatedDealSize: body.estimatedDealSize,
        status:          'active',
        startDate,
        endDate,
        trialDays:       body.trialDays,
        successCriteria: body.successCriteria.length > 0 ? body.successCriteria : [
          'Detect at least 1 real security threat during trial',
          'Complete full team onboarding within 7 days',
          'Generate first compliance report',
          'Demonstrate 40%+ reduction in analyst alert review time',
        ],
        milestones,
        lastActivity:    new Date(),
        loginCount:      0,
        featuresUsed:    [],
        salesOwner:      body.salesOwner || user.email,
        notes:           '',
        createdAt:       new Date(),
        updatedAt:       new Date(),
      }

      await db.insert(schema.pocEngagements).values({
        ...poc,
        milestones:     milestones,
        successCriteria: poc.successCriteria,
        featuresUsed:   [],
        valueRealized:  {},
        healthScore:    100,
        churnRisk:      'low',
      } as any)

      log.info({ pocId, company: body.companyName, tenantId: user.tenantId }, 'POC created')

      return ctx.json({ success: true, data: {
        pocId,
        company:    body.companyName,
        startDate,
        endDate,
        trialDays:  body.trialDays,
        milestones: milestones.length,
        message:    `30-day POC playbook activated. ${milestones.length} milestones configured.`,
      } }, 201)
    })

  // ── GET /v1/poc ───────────────────────────────

  app.get('/v1/poc', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const pocs = await db.select()
      .from(schema.pocEngagements)
      .where(eq(schema.pocEngagements.tenantId, user.tenantId))
      .orderBy(desc(schema.pocEngagements.createdAt))
      .limit(50)

    // Recalculate health for each
    const enriched = await Promise.all(pocs.map(async (poc) => {
      const health = await calculatePocHealth(poc as any, db)
      return { ...poc, ...health }
    }))

    return ctx.json({ success: true, data: enriched })
  })

  // ── GET /v1/poc/:id ───────────────────────────

  app.get('/v1/poc/:id', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const [poc] = await db.select()
      .from(schema.pocEngagements)
      .where(and(
        eq(schema.pocEngagements.id, ctx.req.param('id')),
        eq(schema.pocEngagements.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

    const health  = await calculatePocHealth(poc as any, db)
    const roi     = await calculateRoi(poc.tenantId, poc.trialDays ?? 30, db)

    const daysSinceStart = Math.floor((Date.now() - new Date(poc.startDate).getTime()) / 86_400_000)
    const daysLeft       = Math.max(0, (poc.trialDays ?? 30) - daysSinceStart)
    const progressPct    = Math.min(100, Math.round((daysSinceStart / (poc.trialDays ?? 30)) * 100))

    return ctx.json({ success: true, data: {
      ...poc,
      ...health,
      roi,
      daysSinceStart,
      daysLeft,
      progressPct,
    }})
  })

  // ── PATCH /v1/poc/:id/milestone ──────────────

  app.patch('/v1/poc/:id/milestone',
    zValidator('json', UpdateMilestoneSchema),
    async (ctx) => {
      const user = ctx.var.user
      const { milestoneId, status, notes } = ctx.req.valid('json')
      const db   = getDb()

      const [poc] = await db.select({ milestones: schema.pocEngagements.milestones })
        .from(schema.pocEngagements)
        .where(and(
          eq(schema.pocEngagements.id, ctx.req.param('id')),
          eq(schema.pocEngagements.tenantId, user.tenantId),
        ))
        .limit(1)

      if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

      const milestones = (poc.milestones as PocMilestone[]).map(m =>
        m.id === milestoneId
          ? { ...m, status, notes: notes ?? m.notes, completedAt: status === 'completed' ? new Date() : m.completedAt }
          : m,
      )

      await db.update(schema.pocEngagements)
        .set({ milestones, updatedAt: new Date() })
        .where(eq(schema.pocEngagements.id, ctx.req.param('id')))

      return ctx.json({ success: true, data: { updated: true, milestoneId, status } })
    })

  // ── GET /v1/poc/:id/roi ───────────────────────

  app.get('/v1/poc/:id/roi', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const [poc] = await db.select({ tenantId: schema.pocEngagements.tenantId, trialDays: schema.pocEngagements.trialDays })
      .from(schema.pocEngagements)
      .where(and(
        eq(schema.pocEngagements.id, ctx.req.param('id')),
        eq(schema.pocEngagements.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!poc) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

    const roi = await calculateRoi(poc.tenantId, poc.trialDays ?? 30, db)
    return ctx.json({ success: true, data: roi })
  })

  // ── POST /v1/poc/:id/convert ──────────────────

  app.post('/v1/poc/:id/convert', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    await db.update(schema.pocEngagements)
      .set({ status: 'converted', updatedAt: new Date() })
      .where(and(
        eq(schema.pocEngagements.id, ctx.req.param('id')),
        eq(schema.pocEngagements.tenantId, user.tenantId),
      ))

    log.info({ pocId: ctx.req.param('id') }, '🎉 POC converted to paid customer!')
    return ctx.json({ success: true, data: { converted: true } })
  })

  // ── GET /v1/poc/dashboard/summary ────────────
  // Platform-admin view of all POCs

  app.get('/v1/poc/dashboard/summary', async (ctx) => {
    const user = ctx.var.user
    if (user.role !== 'PLATFORM_ADMIN') return ctx.json({ success: false, error: { code: 'FORBIDDEN' } }, 403)
    const db   = getDb()

    const allPocs = await db.select({
      status: schema.pocEngagements.status,
      estimatedDealSize: schema.pocEngagements.estimatedDealSize,
    })
      .from(schema.pocEngagements)
      .limit(500)

    const pipeline = {
      active:    allPocs.filter(p => p.status === 'active').length,
      converting: allPocs.filter(p => p.status === 'converting').length,
      converted:  allPocs.filter(p => p.status === 'converted').length,
      churned:    allPocs.filter(p => p.status === 'churned').length,
      totalPipelineValue: allPocs
        .filter(p => ['active','converting'].includes(p.status))
        .reduce((s, p) => s + (p.estimatedDealSize ?? 0), 0),
      totalArValue: allPocs
        .filter(p => p.status === 'converted')
        .reduce((s, p) => s + (p.estimatedDealSize ?? 0), 0),
    }

    return ctx.json({ success: true, data: pipeline })
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'poc-management', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3026', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🧪 ZonForge POC Management on port ${info.port}`)
    log.info(`   Default milestones: ${DEFAULT_MILESTONES.length} (30-day playbook)`)
    log.info(`   Auto-health scoring + ROI calculator`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down POC management...')
    await closeDb(); process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => { log.fatal({ err }, '❌ POC management failed'); process.exit(1) })
