import { Hono }       from 'hono'
import { serve }      from '@hono/node-server'
import { cors }       from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { zValidator } from '@hono/zod-validator'
import { Worker, Queue } from 'bullmq'
import { v4 as uuid } from 'uuid'
import { eq, and, desc } from 'drizzle-orm'
import { Redis as IORedis } from 'ioredis'
import { initDb, closeDb, getDb, schema } from '@zonforge/db-client'
import { postgresConfig, redisConfig, env } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import { PackageRiskEngine } from './engines/package-risk-engine.js'
import { parseManifest } from './scanners/manifest-parser.js'
import {
  ScanRequestSchema, scoreToGrade,
  type SupplyChainScanResult, type SbomEntry,
} from './models/supply-chain.js'
import {
  requestIdMiddleware, authMiddleware,
} from '@zonforge/auth-utils'

const log = createLogger({ service: 'supply-chain-intel' })
const SCAN_QUEUE = 'zf:supply-chain-scans'

// ─────────────────────────────────────────────
// SBOM GENERATOR
// ─────────────────────────────────────────────

function generateSbom(packages: any[], findings: any[]): SbomEntry[] {
  const riskMap = new Map(findings.map(f => [f.name, f.riskLevel]))

  return packages.map(p => ({
    name:        p.name,
    version:     p.version,
    ecosystem:   p.ecosystem,
    license:     'UNKNOWN',   // would call registry API in production
    isDirect:    p.isDirect,
    depth:       p.isDirect ? 0 : 1,
    riskLevel:   riskMap.get(p.name) ?? 'safe',
  }))
}

// ─────────────────────────────────────────────
// RISK SCORE CALCULATOR
// ─────────────────────────────────────────────

function calculateRiskScore(findings: any[]): number {
  if (findings.length === 0) return 0

  const weights = { critical: 25, high: 15, medium: 5, low: 1, safe: 0 }
  const total = findings.reduce((s: number, f: any) => s + (weights[f.riskLevel as keyof typeof weights] ?? 0), 0)

  // Normalize to 0–100
  return Math.min(100, total)
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
    maxRetriesPerRequest: null, enableReadyCheck: false,
  })
  redis.on('connect', () => log.info('✅ Redis connected'))
  redis.on('error', (e: unknown) => log.error({ err: e }, 'Redis error'))

  const engine = new PackageRiskEngine()
  const queue  = new Queue(SCAN_QUEUE, { connection: redis as any })

  // ── BullMQ Worker ─────────────────────────────

  const worker = new Worker<{
    scanId:     string
    tenantId:   string
    packages:   Array<{ name: string; version: string; isDirect: boolean; ecosystem: string }>
    projectName: string
  }>(
    SCAN_QUEUE,
    async (job) => {
      const { scanId, tenantId, packages, projectName } = job.data
      const db = getDb()

      log.info({ scanId, packageCount: packages.length }, '🔍 Starting supply chain scan')

      // Update status
      await db.update(schema.supplyChainScans)
        .set({ status: 'scanning', updatedAt: new Date() })
        .where(eq(schema.supplyChainScans.id, scanId))

      try {
        const startTime = Date.now()

        // Analyze packages (with progress updates)
        const findings = await engine.analyzePackages(
          packages as any[],
          scanId,
          async (done, total) => {
            await db.update(schema.supplyChainScans)
              .set({ scanProgress: Math.round((done / total) * 100), updatedAt: new Date() })
              .where(eq(schema.supplyChainScans.id, scanId))
          },
        )

        const sbom        = generateSbom(packages, findings)
        const riskScore   = calculateRiskScore(findings)
        const grade       = scoreToGrade(riskScore)
        const cveMapping  = engine.buildCveMapping(findings)

        await db.update(schema.supplyChainScans)
          .set({
            status:       'completed',
            findings,
            sbom,
            cveMapping,
            riskScore,
            supplyChainGrade: grade,
            criticalCount: findings.filter((f: any) => f.riskLevel === 'critical').length,
            highCount:     findings.filter((f: any) => f.riskLevel === 'high').length,
            mediumCount:   findings.filter((f: any) => f.riskLevel === 'medium').length,
            lowCount:      findings.filter((f: any) => f.riskLevel === 'low').length,
            completedAt:   new Date(),
            durationMs:    Date.now() - startTime,
            updatedAt:     new Date(),
          })
          .where(eq(schema.supplyChainScans.id, scanId))

        log.info({
          scanId, riskScore, grade,
          critical: findings.filter((f: any) => f.riskLevel === 'critical').length,
          total: findings.length,
        }, `✅ Supply chain scan complete: ${projectName}`)

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error({ err, scanId }, 'Scan failed')
        await db.update(schema.supplyChainScans)
          .set({ status: 'failed', errorMessage: msg, updatedAt: new Date() })
          .where(eq(schema.supplyChainScans.id, scanId))
      }
    },
    { connection: redis as any, concurrency: 3 },
  )

  worker.on('error', err => log.error({ err }, 'Scan worker error'))

  // ─────────────────────────────────────────────
  // REST API
  // ─────────────────────────────────────────────

  const app = new Hono()
  app.use('*', requestIdMiddleware)
  app.use('*', cors({ origin: ['http://localhost:5173', 'https://app.zonforge.com'], credentials: true }))
  app.use('*', secureHeaders())
  app.use('/v1/*', authMiddleware)

  // ── POST /v1/supply-chain/scan ─────────────────

  app.post('/v1/supply-chain/scan', async (ctx) => {
    const user = ctx.var.user

    // Support both JSON and multipart (file upload)
    let projectName = 'unnamed-project'
    let packages:    Array<{ name: string; version: string; isDirect: boolean; ecosystem: string }> = []
    let ecosystems:  string[] = []

    const contentType = ctx.req.header('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const form = await ctx.req.parseBody()
      const projectNameValue = form['projectName']
      projectName = typeof projectNameValue === 'string' ? projectNameValue : projectName
      const manifestValue = form['manifest']
      const file  = manifestValue instanceof File ? manifestValue : null

      if (file) {
        const content = await file.text()
        const parsed  = parseManifest(file.name, content)
        packages  = parsed.packages.map(p => ({ ...p }))
        ecosystems = [...new Set(packages.map(p => p.ecosystem))]
        log.info({ filename: file.name, type: parsed.type, count: packages.length }, 'Manifest parsed')
      }
    } else {
      const body = await ctx.req.json() as any
      projectName = body.projectName ?? projectName

      if (body.manifestContent && body.manifestFilename) {
        const parsed = parseManifest(body.manifestFilename, body.manifestContent)
        packages  = parsed.packages.map(p => ({ ...p }))
        ecosystems = [...new Set(packages.map(p => p.ecosystem))]
      } else if (body.packages) {
        packages  = body.packages
        ecosystems = [body.ecosystem ?? 'npm']
      }
    }

    if (packages.length === 0) {
      return ctx.json({ success: false, error: { code: 'NO_PACKAGES', message: 'No packages found to scan' } }, 400)
    }

    const db = getDb()
    const scanId = uuid()

    await db.insert(schema.supplyChainScans).values({
      id:           scanId,
      tenantId:     user.tenantId,
      projectName,
      ecosystem:    ecosystems,
      status:       'queued',
      totalPackages: packages.length,
      directDeps:   packages.filter(p => p.isDirect).length,
      transitiveDeps: packages.filter(p => !p.isDirect).length,
      findings:     [],
      sbom:         [],
      cveMapping:   [],
      riskScore:    0,
      supplyChainGrade: 'A',
      criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0,
      scanProgress: 0,
      manifestFiles: [],
      scannedBy:    user.id,
      startedAt:    new Date(),
      completedAt:  null,
      durationMs:   0,
      createdAt:    new Date(),
      updatedAt:    new Date(),
    })

    await queue.add(`scan-${scanId}`, { scanId, tenantId: user.tenantId, packages, projectName })

    return ctx.json({ success: true, data: {
      scanId, status: 'queued',
      totalPackages: packages.length,
      message: `Scanning ${packages.length} packages. Results in ~${Math.ceil(packages.length / 10 * 2)}s`,
    } }, 202)
  })

  // ── GET /v1/supply-chain/scans ─────────────────

  app.get('/v1/supply-chain/scans', async (ctx) => {
    const user  = ctx.var.user
    const db    = getDb()
    const limit = parseInt(ctx.req.query('limit') ?? '20', 10)

    const scans = await db.select()
      .from(schema.supplyChainScans)
      .where(eq(schema.supplyChainScans.tenantId, user.tenantId))
      .orderBy(desc(schema.supplyChainScans.createdAt))
      .limit(limit)

    return ctx.json({ success: true, data: scans })
  })

  // ── GET /v1/supply-chain/scans/:id ────────────

  app.get('/v1/supply-chain/scans/:id', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()

    const [scan] = await db.select()
      .from(schema.supplyChainScans)
      .where(and(
        eq(schema.supplyChainScans.id, ctx.req.param('id')),
        eq(schema.supplyChainScans.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!scan) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)
    return ctx.json({ success: true, data: scan })
  })

  // ── GET /v1/supply-chain/scans/:id/sbom ───────

  app.get('/v1/supply-chain/scans/:id/sbom', async (ctx) => {
    const user = ctx.var.user
    const db   = getDb()
    const fmt  = ctx.req.query('format') ?? 'json'

    const [scan] = await db.select({ sbom: schema.supplyChainScans.sbom, projectName: schema.supplyChainScans.projectName })
      .from(schema.supplyChainScans)
      .where(and(
        eq(schema.supplyChainScans.id, ctx.req.param('id')),
        eq(schema.supplyChainScans.tenantId, user.tenantId),
      ))
      .limit(1)

    if (!scan) return ctx.json({ success: false, error: { code: 'NOT_FOUND' } }, 404)

    if (fmt === 'cyclonedx') {
      // CycloneDX 1.4 format (industry standard SBOM)
      const cyclonedx = {
        bomFormat:   'CycloneDX',
        specVersion: '1.4',
        version:     1,
        metadata:    {
          timestamp:  new Date().toISOString(),
          component:  { type: 'application', name: scan.projectName },
        },
        components: (scan.sbom as SbomEntry[]).map(e => ({
          type:    'library',
          name:    e.name,
          version: e.version,
          purl:    `pkg:${e.ecosystem}/${e.name}@${e.version}`,
        })),
      }
      return ctx.json(cyclonedx)
    }

    return ctx.json({ success: true, data: scan.sbom })
  })

  // ── POST /v1/supply-chain/check-package ───────
  // Quick single-package check

  app.post('/v1/supply-chain/check-package', async (ctx) => {
    const body = await ctx.req.json() as { name: string; version: string; ecosystem: string }
    const pkg  = {
      name: body.name, version: body.version,
      isDirect: true, ecosystem: (body.ecosystem ?? 'npm') as any,
    }
    const finding = await engine.analyzePackage(pkg, 'quick-check')
    return ctx.json({ success: true, data: {
      package: { name: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem },
      finding,
      riskLevel: finding?.riskLevel ?? 'safe',
      threats: finding?.threatCategories ?? [],
    }})
  })

  app.get('/health', (ctx) => ctx.json({ status: 'ok', service: 'supply-chain-intel', timestamp: new Date() }))

  const port = parseInt(process.env['PORT'] ?? '3016', 10)
  serve({ fetch: app.fetch, port }, info => {
    log.info(`🚀 ZonForge Supply Chain Intelligence on port ${info.port}`)
    log.info(`   Supports: npm, pypi, maven, gradle, go, cargo, nuget, rubygems`)
    log.info(`   CVE source: OSV.dev API (real-time)`)
  })

  async function shutdown(sig: string) {
    log.info({ sig }, 'Shutting down supply chain service...')
    await worker.close()
    await queue.close()
    await closeDb()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch(err => {
  log.fatal({ err }, '❌ Supply chain service failed to start')
  process.exit(1)
})
