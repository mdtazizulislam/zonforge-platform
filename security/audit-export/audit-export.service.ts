import { createHash, createHmac } from 'crypto'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'
import { getDb, schema } from '@zonforge/db-client'
import { createLogger } from '@zonforge/logger'
import { env } from '@zonforge/config'

const log = createLogger({ service: 'audit-export' })

// ─────────────────────────────────────────────
// WORM AUDIT LOG EXPORT
//
// Exports audit log entries to the S3 WORM bucket
// (Object Lock COMPLIANCE mode, 7-year retention).
//
// Export format: newline-delimited JSON with:
//   - Full audit entry
//   - Running SHA-256 hash chain verification
//   - Export manifest (entry count, date range, signature)
//
// Schedule: nightly at 3 AM UTC
// Partition: s3://zonforge-audit-{env}/{tenantId}/{YYYY}/{MM}/{DD}/audit.jsonl.gz
// ─────────────────────────────────────────────

export interface AuditExportResult {
  tenantId:     string
  exportDate:   string
  entriesExported: number
  s3Key:        string
  manifestKey:  string
  hashChainValid: boolean
  exportSizeBytes: number
}

export class AuditExportService {
  private s3: S3Client | null = null

  private async getS3Client(): Promise<S3Client> {
    if (this.s3) return this.s3

    const roleArn = process.env['ZONFORGE_AUDIT_EXPORT_ROLE_ARN']
    if (roleArn) {
      // Assume dedicated audit export role with write-only access to WORM bucket
      const sts     = new STSClient({ region: 'us-east-1' })
      const assumed = await sts.send(new AssumeRoleCommand({
        RoleArn:         roleArn,
        RoleSessionName: `zonforge-audit-export-${Date.now()}`,
        DurationSeconds: 3600,
      }))

      this.s3 = new S3Client({
        region: process.env['AWS_REGION'] ?? 'us-east-1',
        credentials: {
          accessKeyId:     assumed.Credentials!.AccessKeyId!,
          secretAccessKey: assumed.Credentials!.SecretAccessKey!,
          sessionToken:    assumed.Credentials!.SessionToken,
        },
      })
    } else {
      this.s3 = new S3Client({ region: process.env['AWS_REGION'] ?? 'us-east-1' })
    }

    return this.s3
  }

  // ── Export audit log for a single tenant + date ──

  async exportTenantDay(
    tenantId:   string,
    exportDate: Date,
  ): Promise<AuditExportResult> {
    const db         = getDb()
    const bucketName = process.env['ZONFORGE_AUDIT_BUCKET'] ?? `zonforge-audit-${env.ZONFORGE_ENV}`

    const dayStart = new Date(exportDate)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1)

    // Fetch all entries for this day, ordered by creation time
    const entries = await db.select()
      .from(schema.auditLogs)
      .where(and(
        eq(schema.auditLogs.tenantId, tenantId),
        gte(schema.auditLogs.createdAt, dayStart),
        lte(schema.auditLogs.createdAt, dayEnd),
      ))
      .orderBy(schema.auditLogs.createdAt)
      .limit(100_000)

    if (entries.length === 0) {
      return {
        tenantId,
        exportDate:     exportDate.toISOString().slice(0, 10),
        entriesExported: 0,
        s3Key:          '',
        manifestKey:    '',
        hashChainValid: true,
        exportSizeBytes: 0,
      }
    }

    // ── Verify hash chain ──────────────────────

    let hashChainValid = true
    let prevHash:      string | null = null

    for (const entry of entries) {
      // Recompute expected hash
      const expectedHash = computeAuditHash(
        prevHash,
        entry.id,
        entry.tenantId,
        entry.action,
        entry.createdAt,
      )

      if (entry.hash !== expectedHash) {
        log.error({
          tenantId,
          entryId:      entry.id,
          expectedHash,
          actualHash:   entry.hash,
        }, '⚠️  AUDIT CHAIN INTEGRITY VIOLATION DETECTED')
        hashChainValid = false
      }

      prevHash = entry.hash
    }

    // ── Build JSONL export ─────────────────────

    const lines = entries.map(e => JSON.stringify({
      id:           e.id,
      tenantId:     e.tenantId,
      actorId:      e.actorId,
      actorEmail:   e.actorEmail,
      actorRole:    e.actorRole,
      actorIp:      e.actorIp,
      action:       e.action,
      resourceType: e.resourceType,
      resourceId:   e.resourceId,
      changes:      e.changes,
      metadata:     e.metadata,
      previousHash: e.previousHash,
      hash:         e.hash,
      createdAt:    e.createdAt.toISOString(),
    }))

    const jsonlContent = lines.join('\n')

    // ── Gzip compress ──────────────────────────

    const { gzipSync } = await import('zlib')
    const compressed   = gzipSync(Buffer.from(jsonlContent))

    // ── Build S3 key ───────────────────────────

    const dateStr = exportDate.toISOString().slice(0, 10)
    const [year, month, day] = dateStr.split('-')
    const s3Key     = `${tenantId}/${year}/${month}/${day}/audit.jsonl.gz`
    const manifestKey = `${tenantId}/${year}/${month}/${day}/manifest.json`

    // ── Compute content hash for integrity ────

    const contentHash = createHash('sha256').update(compressed).digest('hex')
    const hmacKey     = process.env['ZONFORGE_AUDIT_HMAC_SECRET'] ?? 'audit-hmac-key'
    const contentHmac = createHmac('sha256', hmacKey)
      .update(compressed)
      .digest('hex')

    // ── Manifest ───────────────────────────────

    const manifest = {
      exportDate:        dateStr,
      tenantId,
      entriesExported:   entries.length,
      firstEntryId:      entries[0]!.id,
      lastEntryId:       entries[entries.length - 1]!.id,
      firstEntryAt:      entries[0]!.createdAt,
      lastEntryAt:       entries[entries.length - 1]!.createdAt,
      hashChainValid,
      finalHash:         prevHash,
      contentSha256:     contentHash,
      contentHmac:       contentHmac,
      exportedAt:        new Date().toISOString(),
      exportVersion:     '1.0',
      s3Key,
      retentionPolicy:   'COMPLIANCE',
      retentionYears:    7,
    }

    // ── Write to WORM S3 bucket ────────────────

    const s3 = await this.getS3Client()

    // Write JSONL
    await s3.send(new PutObjectCommand({
      Bucket:              bucketName,
      Key:                 s3Key,
      Body:                compressed,
      ContentType:         'application/x-ndjson',
      ContentEncoding:     'gzip',
      Metadata: {
        'x-zf-tenant-id':    tenantId,
        'x-zf-export-date':  dateStr,
        'x-zf-entry-count':  String(entries.length),
        'x-zf-chain-valid':  String(hashChainValid),
        'x-zf-content-hash': contentHash,
      },
      // Object Lock retention — COMPLIANCE mode (cannot be overwritten or deleted)
      ObjectLockMode:             'COMPLIANCE',
      ObjectLockRetainUntilDate:  new Date(
        Date.now() + 7 * 365 * 24 * 60 * 60 * 1000,
      ),
      ChecksumAlgorithm: 'SHA256',
      ChecksumSHA256:    Buffer.from(contentHash, 'hex').toString('base64'),
    }))

    // Write manifest
    await s3.send(new PutObjectCommand({
      Bucket:      bucketName,
      Key:         manifestKey,
      Body:        JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
      ObjectLockMode:             'COMPLIANCE',
      ObjectLockRetainUntilDate:  new Date(
        Date.now() + 7 * 365 * 24 * 60 * 60 * 1000,
      ),
    }))

    log.info({
      tenantId,
      exportDate:     dateStr,
      entries:        entries.length,
      hashChainValid,
      s3Key,
      sizeBytes:      compressed.length,
    }, 'Audit export complete')

    return {
      tenantId,
      exportDate:       dateStr,
      entriesExported:  entries.length,
      s3Key,
      manifestKey,
      hashChainValid,
      exportSizeBytes:  compressed.length,
    }
  }

  // ── Export all tenants for a given day ────────

  async exportAllTenantsDay(exportDate: Date): Promise<{
    exported:  number
    failed:    number
    skipped:   number
    results:   AuditExportResult[]
  }> {
    const db = getDb()

    const tenants = await db.select({ id: schema.tenants.id })
      .from(schema.tenants)
      .limit(10_000)

    const results:  AuditExportResult[] = []
    let   exported  = 0
    let   failed    = 0
    let   skipped   = 0

    for (const { id } of tenants) {
      try {
        const result = await this.exportTenantDay(id, exportDate)
        if (result.entriesExported === 0) {
          skipped++
        } else {
          results.push(result)
          exported++
          if (!result.hashChainValid) {
            log.error({ tenantId: id }, '🚨 HASH CHAIN INTEGRITY FAILURE — INVESTIGATE IMMEDIATELY')
          }
        }
      } catch (err) {
        log.error({ err, tenantId: id }, 'Audit export failed for tenant')
        failed++
      }
    }

    log.info({ exported, failed, skipped, date: exportDate.toISOString().slice(0, 10) },
      'Daily audit export run complete')

    return { exported, failed, skipped, results }
  }
}

// ─────────────────────────────────────────────
// HASH CHAIN HELPERS
// ─────────────────────────────────────────────

export function computeAuditHash(
  previousHash: string | null,
  entryId:      string,
  tenantId:     string,
  action:       string,
  createdAt:    Date,
): string {
  const content = [
    previousHash ?? 'GENESIS',
    entryId,
    tenantId,
    action,
    createdAt.toISOString(),
  ].join(':')

  return createHash('sha256').update(content).digest('hex')
}

// ─────────────────────────────────────────────
// AUDIT CHAIN VERIFIER
//
// Independently verifies hash chain integrity
// without connecting to S3 — uses DB only.
// Run by compliance auditors.
// ─────────────────────────────────────────────

export async function verifyAuditChain(
  tenantId:  string,
  fromDate:  Date,
  toDate:    Date,
): Promise<{
  valid:       boolean
  totalEntries: number
  violations:  Array<{ entryId: string; at: Date; expected: string; actual: string }>
}> {
  const db      = getDb()
  const entries = await db.select()
    .from(schema.auditLogs)
    .where(and(
      eq(schema.auditLogs.tenantId, tenantId),
      gte(schema.auditLogs.createdAt, fromDate),
      lte(schema.auditLogs.createdAt, toDate),
    ))
    .orderBy(schema.auditLogs.createdAt)
    .limit(500_000)

  const violations: Array<{ entryId: string; at: Date; expected: string; actual: string }> = []
  let   prevHash: string | null = null

  for (const entry of entries) {
    const expected = computeAuditHash(
      prevHash, entry.id, entry.tenantId, entry.action, entry.createdAt,
    )

    if (entry.hash !== expected) {
      violations.push({
        entryId:  entry.id,
        at:       entry.createdAt,
        expected,
        actual:   entry.hash,
      })
    }

    prevHash = entry.hash
  }

  return {
    valid:        violations.length === 0,
    totalEntries: entries.length,
    violations,
  }
}
