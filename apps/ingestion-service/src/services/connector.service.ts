import { eq, and, isNull } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb, schema } from '@zonforge/db-client'
import { encryptJson, decryptJson, computeAuditHash } from '@zonforge/auth-utils'
import { encryptionConfig } from '@zonforge/config'
import { createLogger } from '@zonforge/logger'
import type { ConnectorType } from '@zonforge/shared-types'
import { validateConnector } from './connector-validator.service.js'

const log = createLogger({ service: 'ingestion-service:connectors' })

// ─────────────────────────────────────────────
// CONNECTOR SERVICE — CRUD + Health
// ─────────────────────────────────────────────

export interface CreateConnectorInput {
  tenantId:            string
  name:                string
  type:                ConnectorType
  config:              Record<string, unknown>  // raw, will be encrypted
  pollIntervalMinutes: number
  createdBy:           string
}

export interface UpdateConnectorInput {
  name?:               string
  config?:             Record<string, unknown>
  pollIntervalMinutes?: number
  status?:             'active' | 'paused'
}

export class ConnectorService {

  // ── Create connector ───────────────────────

  async createConnector(input: CreateConnectorInput) {
    const db = getDb()

    // Encrypt sensitive config
    const { encrypted, iv } = encryptJson(input.config, encryptionConfig.key)

    const id  = uuidv4()
    const now = new Date()

    await db.insert(schema.connectors).values({
      id,
      tenantId:            input.tenantId,
      name:                input.name,
      type:                input.type as any,
      status:              'pending_auth',
      configEncrypted:     encrypted,
      configIv:            iv,
      pollIntervalMinutes: input.pollIntervalMinutes,
      lastCursorState:     {},
      consecutiveErrors:   0,
      eventRatePerHour:    0,
      totalEventsIngested: 0n,
      createdAt:           now,
      updatedAt:           now,
      createdBy:           input.createdBy,
    })

    await this.writeAuditLog({
      tenantId:     input.tenantId,
      actorId:      input.createdBy,
      action:       'connector.created',
      resourceType: 'connector',
      resourceId:   id,
      changes:      { name: input.name, type: input.type },
    })

    log.info({ tenantId: input.tenantId, connectorId: id, type: input.type },
      'Connector created')

    return { connectorId: id }
  }

  // ── Get connector (decrypted) ──────────────

  async getConnector(connectorId: string, tenantId: string) {
    const db   = getDb()
    const rows = await db.select()
      .from(schema.connectors)
      .where(and(
        eq(schema.connectors.id,       connectorId),
        eq(schema.connectors.tenantId, tenantId),
      ))
      .limit(1)

    const connector = rows[0]
    if (!connector) return null

    // Return without decrypted config (use getConfig() for that)
    const { configEncrypted, configIv, ...safe } = connector
    return { ...safe, hasConfig: !!configEncrypted }
  }

  // ── Get decrypted config (internal use only) ──

  async getConfig(
    connectorId: string,
    tenantId:    string,
  ): Promise<Record<string, unknown> | null> {
    const db   = getDb()
    const rows = await db.select({
      configEncrypted: schema.connectors.configEncrypted,
      configIv:        schema.connectors.configIv,
      tenantId:        schema.connectors.tenantId,
    })
      .from(schema.connectors)
      .where(and(
        eq(schema.connectors.id,       connectorId),
        eq(schema.connectors.tenantId, tenantId),
      ))
      .limit(1)

    const row = rows[0]
    if (!row || !row.configEncrypted) return null

    return decryptJson<Record<string, unknown>>(
      row.configEncrypted,
      row.configIv,
      encryptionConfig.key,
    )
  }

  // ── List connectors ────────────────────────

  async listConnectors(tenantId: string) {
    const db  = getDb()
    const rows = await db.select({
      id:                  schema.connectors.id,
      name:                schema.connectors.name,
      type:                schema.connectors.type,
      status:              schema.connectors.status,
      pollIntervalMinutes: schema.connectors.pollIntervalMinutes,
      lastPollAt:          schema.connectors.lastPollAt,
      lastEventAt:         schema.connectors.lastEventAt,
      lastErrorAt:         schema.connectors.lastErrorAt,
      lastErrorMessage:    schema.connectors.lastErrorMessage,
      consecutiveErrors:   schema.connectors.consecutiveErrors,
      eventRatePerHour:    schema.connectors.eventRatePerHour,
      totalEventsIngested: schema.connectors.totalEventsIngested,
      createdAt:           schema.connectors.createdAt,
      updatedAt:           schema.connectors.updatedAt,
    })
      .from(schema.connectors)
      .where(eq(schema.connectors.tenantId, tenantId))
      .orderBy(schema.connectors.createdAt)

    return rows.map(r => ({
      ...r,
      lagMinutes: r.lastEventAt
        ? Math.floor((Date.now() - r.lastEventAt.getTime()) / 60_000)
        : null,
      isHealthy:
        r.status === 'active' &&
        r.consecutiveErrors === 0 &&
        (!r.lastEventAt || Date.now() - r.lastEventAt.getTime() < 30 * 60_000),
    }))
  }

  // ── Update connector ───────────────────────

  async updateConnector(
    connectorId: string,
    tenantId:    string,
    updates:     UpdateConnectorInput,
    actorId:     string,
  ) {
    const db = getDb()

    const updateFields: Partial<typeof schema.connectors.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (updates.name) updateFields.name = updates.name
    if (updates.pollIntervalMinutes) updateFields.pollIntervalMinutes = updates.pollIntervalMinutes
    if (updates.status) updateFields.status = updates.status as any

    if (updates.config) {
      const { encrypted, iv } = encryptJson(updates.config, encryptionConfig.key)
      updateFields.configEncrypted = encrypted
      updateFields.configIv        = iv
      updateFields.status          = 'pending_auth'
    }

    await db.update(schema.connectors)
      .set(updateFields)
      .where(and(
        eq(schema.connectors.id,       connectorId),
        eq(schema.connectors.tenantId, tenantId),
      ))

    await this.writeAuditLog({
      tenantId,
      actorId,
      action:       'connector.updated',
      resourceType: 'connector',
      resourceId:   connectorId,
      changes:      { ...updates, config: updates.config ? '[REDACTED]' : undefined },
    })
  }

  // ── Delete (soft) connector ───────────────

  async deleteConnector(
    connectorId: string,
    tenantId:    string,
    actorId:     string,
  ) {
    const db = getDb()

    // Soft delete by setting status to paused and clearing config
    await db.update(schema.connectors)
      .set({
        status:          'paused',
        configEncrypted: '',
        configIv:        '',
        updatedAt:       new Date(),
      })
      .where(and(
        eq(schema.connectors.id,       connectorId),
        eq(schema.connectors.tenantId, tenantId),
      ))

    await this.writeAuditLog({
      tenantId,
      actorId,
      action:       'connector.deleted',
      resourceType: 'connector',
      resourceId:   connectorId,
    })

    log.info({ tenantId, connectorId }, 'Connector deleted (soft)')
  }

  // ── Validate connector ────────────────────

  async validateConnectorById(connectorId: string, tenantId: string) {
    return validateConnector(connectorId, tenantId)
  }

  // ── Record connector error ─────────────────

  async recordError(connectorId: string, errorMessage: string) {
    const db = getDb()

    await db.update(schema.connectors)
      .set({
        lastErrorAt:      new Date(),
        lastErrorMessage: errorMessage.slice(0, 1000),
        status:           'error',
        updatedAt:        new Date(),
      })
      .where(eq(schema.connectors.id, connectorId))
  }

  // ── Audit helper ──────────────────────────

  private async writeAuditLog(input: {
    tenantId: string; actorId?: string; actorIp?: string
    action: string; resourceType: string
    resourceId?: string; changes?: Record<string, unknown>
  }) {
    const db  = getDb()
    const id  = uuidv4()
    const now = new Date()

    const last = await db.select({ hash: schema.auditLogs.hash })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, input.tenantId))
      .orderBy(schema.auditLogs.createdAt)
      .limit(1)

    const prevHash = last[0]?.hash ?? null
    const hash     = computeAuditHash(prevHash, id, input.tenantId, input.action, now)

    await db.insert(schema.auditLogs).values({
      id, tenantId: input.tenantId,
      actorId:      input.actorId ?? null,
      actorIp:      input.actorIp ?? null,
      action:       input.action,
      resourceType: input.resourceType,
      resourceId:   input.resourceId ?? null,
      changes:      input.changes ?? null,
      metadata:     {},
      previousHash: prevHash,
      hash,
      createdAt:    now,
    })
  }
}
