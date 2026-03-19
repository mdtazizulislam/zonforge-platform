import { Worker, Queue } from 'bullmq'
import { v4 as uuid } from 'uuid'
import { eq, and, gte } from 'drizzle-orm'
import type Redis from 'ioredis'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'supply-chain:monitor' })

export const SUPPLY_CHAIN_QUEUE = 'zf:supply-chain-scans'

export interface ScanJobData {
  scanId:       string
  tenantId:     string
  projectName:  string
  ecosystem:    string
  manifestContent: string
  filename:     string
  triggeredBy:  string
}

// ─────────────────────────────────────────────
// CONTINUOUS REPOSITORY MONITOR
//
// Every 6 hours, checks if any tenant has
// registered repositories and re-scans their
// manifests against updated threat intelligence.
//
// New CVEs drop daily. A package that was safe
// yesterday may be critical today.
// ─────────────────────────────────────────────

export function createMonitorWorker(
  redis: Redis,
  scanFn: (data: ScanJobData) => Promise<void>,
): Worker {
  const worker = new Worker<ScanJobData>(
    SUPPLY_CHAIN_QUEUE,
    async (job) => {
      await scanFn(job.data)
    },
    {
      connection:  redis,
      concurrency: 4,
      limiter: { max: 20, duration: 60_000 },
    },
  )

  worker.on('completed', (job) => {
    log.info({ jobId: job.id, scanId: job.data.scanId }, 'Supply chain scan completed')
  })

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'Supply chain scan failed')
  })

  worker.on('error', (err) => log.error({ err }, 'Supply chain worker error'))

  return worker
}

// ─────────────────────────────────────────────
// SCHEDULER — rescan registered repos every 6h
// ─────────────────────────────────────────────

export async function scheduleRepositoryRescan(
  redis: Redis,
  tenantId: string,
): Promise<void> {
  const db    = getDb()
  const queue = new Queue(SUPPLY_CHAIN_QUEUE, { connection: redis })

  // Find scans from last 7 days (recently registered manifests)
  const recentScans = await db.select({
    id:              schema.supplyChainScans.id,
    tenantId:        schema.supplyChainScans.tenantId,
    projectName:     schema.supplyChainScans.projectName,
    ecosystem:       schema.supplyChainScans.ecosystem,
    manifestContent: schema.supplyChainScans.manifestContent,
    filename:        schema.supplyChainScans.filename,
  })
    .from(schema.supplyChainScans)
    .where(and(
      eq(schema.supplyChainScans.tenantId, tenantId),
      gte(schema.supplyChainScans.createdAt, new Date(Date.now() - 7 * 86_400_000)),
    ))
    .limit(50)

  for (const scan of recentScans) {
    if (!scan.manifestContent) continue

    const newScanId = uuid()
    await queue.add(`rescan-${scan.id}`, {
      scanId:          newScanId,
      tenantId:        scan.tenantId,
      projectName:     scan.projectName ?? 'Unknown',
      ecosystem:       scan.ecosystem ?? 'npm',
      manifestContent: scan.manifestContent as string,
      filename:        scan.filename ?? 'package.json',
      triggeredBy:     'scheduler',
    }, {
      delay:    Math.random() * 60_000,   // stagger by up to 1 min
      priority: 10,
    })

    log.debug({ scanId: newScanId, project: scan.projectName }, 'Scheduled rescan')
  }

  await queue.close()
  log.info({ tenantId, count: recentScans.length }, '⏰ Repository rescan scheduled')
}

// ─────────────────────────────────────────────
// ALERT GENERATOR
//
// When a scan finds critical findings,
// injects an alert into the alert pipeline
// so SOC analysts are notified.
// ─────────────────────────────────────────────

export async function generateSupplyChainAlert(
  tenantId:      string,
  scanId:        string,
  projectName:   string,
  criticalCount: number,
  highCount:     number,
  topFindings:   Array<{ name: string; threat: string; riskLevel: string }>,
): Promise<void> {
  if (criticalCount === 0 && highCount === 0) return

  const db = getDb()

  const severity = criticalCount > 0 ? 'critical' : 'high'
  const topPkg   = topFindings[0]

  await db.insert(schema.alerts).values({
    id:          uuid(),
    tenantId,
    findingId:   `ZF-SUPPLY-${scanId.slice(0, 8).toUpperCase()}`,
    title:       `Supply Chain Risk: ${criticalCount + highCount} dangerous packages in ${projectName}`,
    description: `Supply chain scan detected ${criticalCount} critical and ${highCount} high-risk packages. Top finding: ${topPkg?.name ?? 'unknown'} — ${topPkg?.threat ?? 'unknown threat'}. Immediate review required.`,
    severity,
    priority:    severity === 'critical' ? 'P1' : 'P2',
    status:      'open',
    mitreTechniques: ['T1195.002'],  // Software Supply Chain
    mitreTactics:    ['TA0001'],     // Initial Access
    affectedUserId:  null,
    affectedIp:      null,
    evidence:        topFindings,
    metadata: {
      scanId,
      projectName,
      criticalCount,
      highCount,
      source: 'supply-chain-intel',
    },
    mttdSlaBreached:    false,
    detectionGapMinutes: 0,
    createdAt:          new Date(),
    updatedAt:          new Date(),
  })

  log.warn({ tenantId, scanId, severity, criticalCount, highCount },
    `🚨 Supply chain alert created for ${projectName}`)
}
