import { createHmac, timingSafeEqual, randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'

// ─────────────────────────────────────────────
// API KEY — Generation + Hashing + HMAC
//
// Format: zf_{prefix8}_{random48}
// Example: zf_a3f9bc12_Xk2mP9nQrTvWxYzAb3cDeF4gHiJkLmNo5pQrSt
//
// Storage: only keyHash (bcrypt) stored in DB
// Display: only keyPrefix shown after creation
// ─────────────────────────────────────────────

const API_KEY_PREFIX = 'zf_'
const BCRYPT_ROUNDS = 10

export interface GeneratedApiKey {
  rawKey: string        // shown ONCE to user — never stored
  keyHash: string       // stored in DB
  keyPrefix: string     // first 8 chars after "zf_" — shown in UI
}

// ── Generate a new API key ────────────────────

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const prefix = randomBytes(4).toString('hex')             // 8 hex chars
  const body   = randomBytes(24).toString('base64url')      // 32 url-safe chars
  const rawKey = `${API_KEY_PREFIX}${prefix}_${body}`

  const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS)

  return { rawKey, keyHash, keyPrefix: prefix }
}

// ── Verify API key against stored hash ───────

export async function verifyApiKey(
  rawKey: string,
  storedHash: string,
): Promise<boolean> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return false
  try {
    return await bcrypt.compare(rawKey, storedHash)
  } catch {
    return false
  }
}

// ── Extract prefix from raw key (for DB lookup) ──

export function extractApiKeyPrefix(rawKey: string): string | null {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null
  const parts = rawKey.split('_')
  return parts[1] ?? null   // "a3f9bc12"
}

// ─────────────────────────────────────────────
// HMAC SIGNATURE
// Used for:
//   1. Collector → Ingestion API (event submission)
//   2. Platform → Customer webhook (outbound alerts)
// ─────────────────────────────────────────────

export interface HmacConfig {
  secret: string
  algorithm?: 'sha256' | 'sha512'
}

// ── Sign a payload ────────────────────────────

export function signHmac(
  payload: string,
  config: HmacConfig,
): string {
  return createHmac(config.algorithm ?? 'sha256', config.secret)
    .update(payload)
    .digest('hex')
}

// ── Verify incoming HMAC signature ───────────
// Uses timingSafeEqual to prevent timing attacks

export function verifyHmac(
  payload: string,
  signature: string,
  config: HmacConfig,
): boolean {
  const expected = signHmac(payload, config)
  try {
    const a = Buffer.from(expected,  'hex')
    const b = Buffer.from(signature, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Build collector request signature ─────────
// Header: X-ZonForge-Signature: t={timestamp},v1={hmac}
// Payload signed: `${timestamp}.${JSON.stringify(body)}`

export function buildCollectorSignature(
  body: unknown,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const payload = `${timestamp}.${JSON.stringify(body)}`
  const sig     = signHmac(payload, { secret })
  return `t=${timestamp},v1=${sig}`
}

export function verifyCollectorSignature(
  body: unknown,
  header: string,
  secret: string,
  toleranceSeconds = 300,   // 5 minutes
): boolean {
  const parts     = header.split(',')
  const tPart     = parts.find(p => p.startsWith('t='))
  const sigPart   = parts.find(p => p.startsWith('v1='))
  if (!tPart || !sigPart) return false

  const timestamp = parseInt(tPart.replace('t=', ''), 10)
  const signature = sigPart.replace('v1=', '')

  if (isNaN(timestamp)) return false

  // Replay attack prevention
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > toleranceSeconds) return false

  const payload = `${timestamp}.${JSON.stringify(body)}`
  return verifyHmac(payload, signature, { secret })
}

// ─────────────────────────────────────────────
// PASSWORD HASHING (bcrypt)
// ─────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password)
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function validatePasswordStrength(password: string): void {
  if (password.length < 12) {
    throw new PasswordValidationError('Password must be at least 12 characters')
  }
  if (!/[A-Z]/.test(password)) {
    throw new PasswordValidationError('Password must contain at least one uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    throw new PasswordValidationError('Password must contain at least one lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    throw new PasswordValidationError('Password must contain at least one number')
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new PasswordValidationError('Password must contain at least one special character')
  }
}

export class PasswordValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PasswordValidationError'
  }
}

// ─────────────────────────────────────────────
// FIELD-LEVEL ENCRYPTION (AES-256-GCM)
// Used for: connector credentials, MFA secrets
// ─────────────────────────────────────────────

import { createCipheriv, createDecipheriv } from 'crypto'

const ENCRYPTION_ALGO = 'aes-256-gcm'
const IV_LENGTH = 12      // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16

export function encryptField(plaintext: string, keyHex: string): { encrypted: string; iv: string } {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)')

  const iv     = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ])

  return {
    encrypted: encrypted.toString('base64'),
    iv:        iv.toString('base64'),
  }
}

export function decryptField(encryptedBase64: string, ivBase64: string, keyHex: string): string {
  const key       = Buffer.from(keyHex, 'hex')
  const iv        = Buffer.from(ivBase64, 'base64')
  const data      = Buffer.from(encryptedBase64, 'base64')

  const authTag   = data.subarray(data.length - AUTH_TAG_LENGTH)
  const ciphertext = data.subarray(0, data.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ENCRYPTION_ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
}

// Convenience: encrypt a JSON object
export function encryptJson(obj: unknown, keyHex: string): { encrypted: string; iv: string } {
  return encryptField(JSON.stringify(obj), keyHex)
}

export function decryptJson<T>(encryptedBase64: string, ivBase64: string, keyHex: string): T {
  const json = decryptField(encryptedBase64, ivBase64, keyHex)
  return JSON.parse(json) as T
}

// ─────────────────────────────────────────────
// AUDIT LOG HASH CHAIN
// Each audit record includes SHA-256 of:
//   hash(previousHash + id + tenantId + action + createdAt)
// ─────────────────────────────────────────────

export function computeAuditHash(
  previousHash: string | null,
  id: string,
  tenantId: string,
  action: string,
  createdAt: Date,
): string {
  const content = [
    previousHash ?? 'GENESIS',
    id,
    tenantId,
    action,
    createdAt.toISOString(),
  ].join('|')

  return createHash('sha256').update(content).digest('hex')
}

export function verifyAuditChain(records: Array<{
  id: string
  tenantId: string
  action: string
  createdAt: Date
  hash: string
  previousHash: string | null
}>): { valid: boolean; brokenAtIndex: number | null } {
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!
    const expected = computeAuditHash(
      record.previousHash,
      record.id,
      record.tenantId,
      record.action,
      record.createdAt,
    )
    if (expected !== record.hash) {
      return { valid: false, brokenAtIndex: i }
    }
  }
  return { valid: true, brokenAtIndex: null }
}

// ── DB-backed API key validation ──────────────────────────────────
// Dynamically imports db-client to avoid circular dependency at build time

export async function validateApiKeyFromDb(rawKey: string): Promise<{
  tenantId: string
  role: string
  connectorId: string | null
  keyId: string
} | null> {
  try {
    const prefix = extractApiKeyPrefix(rawKey)
    if (!prefix) return null

    const { getDb, schema } = await import('@zonforge/db-client')
    const { eq } = await import('drizzle-orm')
    const db = getDb()

    const rows = await db.select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.keyPrefix, prefix))
      .limit(1)

    const row = rows[0]
    if (!row || row.revokedAt) return null

    const verified = await verifyApiKey(rawKey, row.keyHash)
    if (!verified) return null

    await db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, row.id))

    return {
      tenantId:    row.tenantId,
      role:        row.role ?? 'API_CONNECTOR',
      connectorId: row.connectorId ?? null,
      keyId:       row.id,
    }
  } catch {
    return null
  }
}
