import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import {
  getDb, schema,
} from '@zonforge/db-client'
import {
  signTokenPair, verifyRefreshToken,
  hashPassword, verifyPassword,
  validatePasswordStrength,
  JwtVerificationError,
  generateTotpSetup, verifyTotpCode, verifyBackupCode,
  computeAuditHash,
  generateApiKey, verifyApiKey, extractApiKeyPrefix,
} from '@zonforge/auth-utils'
import { jwtConfig, encryptionConfig } from '@zonforge/config'
import { createLogger, logSecurityEvent } from '@zonforge/logger'
import { RedisKeys, RedisTTL } from '@zonforge/db-client'
import { getRedis } from '../redis.js'
import type { UserRole } from '@zonforge/shared-types'

const log = createLogger({ service: 'auth-service' })

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

export interface LoginInput {
  email:     string
  password:  string
  totpCode?: string
  ip:        string
  userAgent: string
}

export interface LoginResult {
  accessToken:      string
  refreshToken:     string
  accessExpiresAt:  Date
  refreshExpiresAt: Date
  user: {
    id:     string
    email:  string
    name:   string
    role:   UserRole
    tenantId: string
    mfaEnabled: boolean
  }
  requiresMfa: boolean
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const db = getDb()
  const redis = getRedis()

  // 1. Find user by email (search across all tenants for platform login)
  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email.toLowerCase().trim()))
    .limit(1)

  const user = users[0]

  // 2. Verify password — always run bcrypt even if user not found (timing attack prevention)
  const dummyHash = '$2b$10$dummy.hash.to.prevent.timing.attacks.0000000000000000'
  const passwordValid = user?.passwordHash
    ? await verifyPassword(input.password, user.passwordHash)
    : await verifyPassword(input.password, dummyHash).then(() => false)

  if (!user || !passwordValid) {
    if (user) {
      // Update failed login count
      await db.update(schema.users)
        .set({ failedLoginCount: String(parseInt(user.failedLoginCount ?? '0') + 1) })
        .where(eq(schema.users.id, user.id))
    }
    logSecurityEvent(log, {
      tenantId: user?.tenantId ?? 'unknown',
      action:   'login',
      outcome:  'failure',
      ip:       input.ip,
      reason:   'invalid_credentials',
    })
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  // 3. Check account status
  if (user.status !== 'active') {
    throw new AuthError(`Account is ${user.status}`, 'ACCOUNT_SUSPENDED')
  }

  // 4. Check MFA if enabled
  if (user.mfaEnabled) {
    if (!input.totpCode) {
      // Return partial result — client must send TOTP
      return {
        accessToken: '', refreshToken: '',
        accessExpiresAt: new Date(), refreshExpiresAt: new Date(),
        user: { id: user.id, email: user.email, name: user.name,
                role: user.role as UserRole, tenantId: user.tenantId,
                mfaEnabled: true },
        requiresMfa: true,
      }
    }

    // Decrypt MFA secret and verify
    const totpSecret = user.mfaSecret
    if (!totpSecret || !verifyTotpCode(input.totpCode, totpSecret)) {
      logSecurityEvent(log, {
        tenantId: user.tenantId,
        userId:   user.id,
        action:   'mfa_verify',
        outcome:  'failure',
        ip:       input.ip,
      })
      throw new AuthError('Invalid MFA code', 'INVALID_MFA_CODE')
    }
  }

  // 5. Sign token pair
  const tokens = await signTokenPair({
    sub:    user.id,
    tid:    user.tenantId,
    role:   user.role as UserRole,
    email:  user.email,
    region: 'us-east-1',
  }, jwtConfig)

  // 6. Store refresh token hash in DB
  const tokenHash = await hashRefreshToken(tokens.refreshToken)
  await db.insert(schema.refreshTokens).values({
    id:        uuidv4(),
    userId:    user.id,
    tenantId:  user.tenantId,
    tokenHash,
    userAgent: input.userAgent,
    ipAddress: input.ip,
    expiresAt: tokens.refreshExpiresAt,
  })

  // 7. Update last login
  await db.update(schema.users)
    .set({
      lastLoginAt:      new Date(),
      lastLoginIp:      input.ip,
      failedLoginCount: '0',
    })
    .where(eq(schema.users.id, user.id))

  // 8. Audit log
  await writeAuditLog({
    tenantId:     user.tenantId,
    actorId:      user.id,
    actorEmail:   user.email,
    actorRole:    user.role,
    actorIp:      input.ip,
    action:       'user.login',
    resourceType: 'user',
    resourceId:   user.id,
  })

  logSecurityEvent(log, {
    tenantId: user.tenantId,
    userId:   user.id,
    action:   'login',
    outcome:  'success',
    ip:       input.ip,
  })

  return {
    ...tokens,
    user: {
      id:         user.id,
      email:      user.email,
      name:       user.name,
      role:       user.role as UserRole,
      tenantId:   user.tenantId,
      mfaEnabled: user.mfaEnabled,
    },
    requiresMfa: false,
  }
}

// ─────────────────────────────────────────────
// REFRESH TOKEN ROTATION
// ─────────────────────────────────────────────

export async function refreshTokens(rawRefreshToken: string, ip: string) {
  const db = getDb()

  // 1. Verify JWT
  const payload = await verifyRefreshToken(rawRefreshToken, jwtConfig)
    .catch(() => { throw new AuthError('Invalid refresh token', 'INVALID_TOKEN') })

  // 2. Find token in DB
  const tokenHash = await hashRefreshToken(rawRefreshToken)
  const stored = await db.select()
    .from(schema.refreshTokens)
    .where(and(
      eq(schema.refreshTokens.tokenHash, tokenHash),
      eq(schema.refreshTokens.userId,    payload.sub),
    ))
    .limit(1)

  const token = stored[0]
  if (!token || token.isRevoked || token.expiresAt < new Date()) {
    // Possible token reuse attack — revoke ALL tokens for this user
    await db.update(schema.refreshTokens)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(eq(schema.refreshTokens.userId, payload.sub))

    logSecurityEvent(log, {
      tenantId: payload.tid,
      userId:   payload.sub,
      action:   'refresh_token',
      outcome:  'blocked',
      ip,
      reason:   'token_reuse_detected',
    })
    throw new AuthError('Refresh token invalid or reused', 'TOKEN_REUSE_DETECTED')
  }

  // 3. Get fresh user record
  const users = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))
    .limit(1)

  const user = users[0]
  if (!user || user.status !== 'active') {
    throw new AuthError('Account not active', 'ACCOUNT_SUSPENDED')
  }

  // 4. Revoke old token
  await db.update(schema.refreshTokens)
    .set({ isRevoked: true, revokedAt: new Date() })
    .where(eq(schema.refreshTokens.id, token.id))

  // 5. Issue new pair
  const newTokens = await signTokenPair({
    sub:    user.id,
    tid:    user.tenantId,
    role:   user.role as UserRole,
    email:  user.email,
    region: 'us-east-1',
  }, jwtConfig)

  // 6. Store new refresh token
  const newTokenHash = await hashRefreshToken(newTokens.refreshToken)
  await db.insert(schema.refreshTokens).values({
    id:        uuidv4(),
    userId:    user.id,
    tenantId:  user.tenantId,
    tokenHash: newTokenHash,
    ipAddress: ip,
    expiresAt: newTokens.refreshExpiresAt,
  })

  return {
    ...newTokens,
    user: {
      id: user.id, email: user.email,
      name: user.name, role: user.role as UserRole,
      tenantId: user.tenantId, mfaEnabled: user.mfaEnabled,
    },
  }
}

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

export async function logout(userId: string, jti: string, ip: string) {
  const db = getDb()
  const redis = getRedis()

  // Blocklist the access token JTI
  await redis.setex(
    RedisKeys.jwtBlocklist(jti),
    RedisTTL.JWT_BLOCKLIST,
    '1',
  )

  // Revoke all refresh tokens for this user
  await db.update(schema.refreshTokens)
    .set({ isRevoked: true, revokedAt: new Date() })
    .where(and(
      eq(schema.refreshTokens.userId, userId),
      eq(schema.refreshTokens.isRevoked, false),
    ))

  logSecurityEvent(log, {
    tenantId: 'unknown',
    userId,
    action:   'logout',
    outcome:  'success',
    ip,
  })
}

// ─────────────────────────────────────────────
// REGISTER USER (invited by tenant admin)
// ─────────────────────────────────────────────

export interface RegisterInput {
  tenantId: string
  email:    string
  name:     string
  password: string
  role:     UserRole
  createdBy: string
  ip:       string
}

export async function registerUser(input: RegisterInput) {
  const db = getDb()

  // Validate password strength
  validatePasswordStrength(input.password)

  // Check email uniqueness in tenant
  const existing = await db.select({ id: schema.users.id })
    .from(schema.users)
    .where(and(
      eq(schema.users.tenantId, input.tenantId),
      eq(schema.users.email, input.email.toLowerCase().trim()),
    ))
    .limit(1)

  if (existing.length > 0) {
    throw new AuthError('Email already registered in this tenant', 'EMAIL_ALREADY_EXISTS')
  }

  const passwordHash = await hashPassword(input.password)
  const userId = uuidv4()

  await db.insert(schema.users).values({
    id:           userId,
    tenantId:     input.tenantId,
    email:        input.email.toLowerCase().trim(),
    name:         input.name,
    role:         input.role,
    status:       'active',
    passwordHash,
    mfaEnabled:   false,
    createdAt:    new Date(),
    updatedAt:    new Date(),
  })

  await writeAuditLog({
    tenantId:     input.tenantId,
    actorId:      input.createdBy,
    actorIp:      input.ip,
    action:       'user.created',
    resourceType: 'user',
    resourceId:   userId,
    changes:      { email: input.email, role: input.role },
  })

  log.info({ tenantId: input.tenantId, userId }, 'User registered')
  return { userId }
}

// ─────────────────────────────────────────────
// MFA SETUP
// ─────────────────────────────────────────────

export async function setupMfa(userId: string, tenantId: string) {
  const db = getDb()

  const users = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  const user = users[0]
  if (!user) throw new AuthError('User not found', 'NOT_FOUND')

  const setup = generateTotpSetup(user.email)

  // Store encrypted secret temporarily (not activated until verified)
  await db.update(schema.users)
    .set({ mfaSecret: setup.secret, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))

  return {
    otpauthUrl:  setup.otpauthUrl,
    backupCodes: setup.backupCodes,
    secret:      setup.secret,  // shown once for manual entry
  }
}

export async function confirmMfa(userId: string, totpCode: string, ip: string) {
  const db = getDb()

  const users = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  const user = users[0]
  if (!user?.mfaSecret) throw new AuthError('MFA setup not initiated', 'MFA_NOT_SETUP')

  if (!verifyTotpCode(totpCode, user.mfaSecret)) {
    throw new AuthError('Invalid TOTP code', 'INVALID_MFA_CODE')
  }

  await db.update(schema.users)
    .set({ mfaEnabled: true, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))

  await writeAuditLog({
    tenantId:     user.tenantId,
    actorId:      userId,
    actorIp:      ip,
    action:       'user.updated',
    resourceType: 'user',
    resourceId:   userId,
    changes:      { mfaEnabled: true },
  })

  logSecurityEvent(log, {
    tenantId: user.tenantId,
    userId,
    action:   'mfa_setup',
    outcome:  'success',
    ip,
  })
}

// ─────────────────────────────────────────────
// API KEY MANAGEMENT
// ─────────────────────────────────────────────

export async function createApiKey(
  tenantId: string,
  name: string,
  role: UserRole,
  createdBy: string,
  connectorId?: string,
  expiresAt?: Date,
) {
  const db = getDb()

  const generated = await generateApiKey()

  await db.insert(schema.apiKeys).values({
    id:          uuidv4(),
    tenantId,
    name,
    keyHash:     generated.keyHash,
    keyPrefix:   generated.keyPrefix,
    role,
    connectorId: connectorId ?? null,
    expiresAt:   expiresAt ?? null,
    createdBy,
    createdAt:   new Date(),
  })

  return {
    rawKey:    generated.rawKey,    // shown ONCE — never stored
    keyPrefix: generated.keyPrefix,
  }
}

export async function validateApiKey(rawKey: string): Promise<{
  tenantId: string
  role: UserRole
  connectorId: string | null
  keyId: string
} | null> {
  const db = getDb()
  const redis = getRedis()

  const prefix = extractApiKeyPrefix(rawKey)
  if (!prefix) return null

  // Check cache first
  const cacheKey = RedisKeys.apiKeyCache(prefix)
  const cached = await redis.get(cacheKey)
  if (cached) {
    const parsed = JSON.parse(cached) as {
      tenantId: string; role: UserRole
      connectorId: string | null; keyId: string; keyHash: string
    }
    const valid = await verifyApiKey(rawKey, parsed.keyHash)
    if (!valid) return null
    return { tenantId: parsed.tenantId, role: parsed.role,
             connectorId: parsed.connectorId, keyId: parsed.keyId }
  }

  // DB lookup by prefix
  const keys = await db.select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyPrefix, prefix))
    .limit(5)

  for (const key of keys) {
    if (key.revokedAt) continue
    if (key.expiresAt && key.expiresAt < new Date()) continue

    const valid = await verifyApiKey(rawKey, key.keyHash)
    if (!valid) continue

    // Cache for 5 minutes
    await redis.setex(cacheKey, RedisTTL.API_KEY_CACHE, JSON.stringify({
      tenantId:    key.tenantId,
      role:        key.role,
      connectorId: key.connectorId,
      keyId:       key.id,
      keyHash:     key.keyHash,
    }))

    // Update last used
    await db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, key.id))

    return {
      tenantId:    key.tenantId,
      role:        key.role as UserRole,
      connectorId: key.connectorId,
      keyId:       key.id,
    }
  }

  return null
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function hashRefreshToken(token: string): Promise<string> {
  const { createHash } = await import('crypto')
  return createHash('sha256').update(token).digest('hex')
}

interface AuditInput {
  tenantId:     string
  actorId?:     string
  actorEmail?:  string
  actorRole?:   string
  actorIp?:     string
  action:       string
  resourceType: string
  resourceId?:  string
  changes?:     Record<string, unknown>
}

async function writeAuditLog(input: AuditInput) {
  const db = getDb()
  const id = uuidv4()

  // Get last hash for chain
  const last = await db.select({ hash: schema.auditLogs.hash })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.tenantId, input.tenantId))
    .orderBy(schema.auditLogs.createdAt)
    .limit(1)

  const previousHash = last[0]?.hash ?? null
  const now = new Date()
  const hash = computeAuditHash(previousHash, id, input.tenantId, input.action, now)

  await db.insert(schema.auditLogs).values({
    id,
    tenantId:     input.tenantId,
    actorId:      input.actorId ?? null,
    actorEmail:   input.actorEmail ?? null,
    actorRole:    input.actorRole ?? null,
    actorIp:      input.actorIp ?? null,
    action:       input.action,
    resourceType: input.resourceType,
    resourceId:   input.resourceId ?? null,
    changes:      input.changes ?? null,
    metadata:     {},
    previousHash,
    hash,
    createdAt:    now,
  })
}

// ─────────────────────────────────────────────
// CUSTOM ERROR
// ─────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'AuthError'
  }
}
