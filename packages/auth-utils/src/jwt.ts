import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { v4 as uuidv4 } from 'uuid'
import type { JwtPayload, UserRole } from '@zonforge/shared-types'

// ─────────────────────────────────────────────
// JWT — Access Token + Refresh Token
// Algorithm: HS256 (HMAC-SHA256)
// Access  token: 15 minutes
// Refresh token: 7 days (rotation on every use)
// ─────────────────────────────────────────────

export interface JwtConfig {
  secret: string          // min 32 chars
  accessExpirySeconds: number   // 900 = 15min
  refreshExpirySeconds: number  // 604800 = 7 days
  issuer: string
  audience: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessExpiresAt: Date
  refreshExpiresAt: Date
  jti: string
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

// ── Sign access token ─────────────────────────

export async function signAccessToken(
  payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>,
  config: JwtConfig,
): Promise<{ token: string; expiresAt: Date; jti: string }> {
  const jti = uuidv4()
  const now = Math.floor(Date.now() / 1000)
  const exp = now + config.accessExpirySeconds

  const token = await new SignJWT({
    sub:   payload.sub,
    tid:   payload.tid,
    role:  payload.role,
    email: payload.email,
    region: payload.region,
    jti,
  } satisfies Partial<JWTPayload>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .sign(getSecretKey(config.secret))

  return { token, expiresAt: new Date(exp * 1000), jti }
}

// ── Sign refresh token ────────────────────────

export async function signRefreshToken(
  userId: string,
  tenantId: string,
  config: JwtConfig,
): Promise<{ token: string; expiresAt: Date; jti: string }> {
  const jti = uuidv4()
  const now = Math.floor(Date.now() / 1000)
  const exp = now + config.refreshExpirySeconds

  const token = await new SignJWT({ sub: userId, tid: tenantId, type: 'refresh', jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .sign(getSecretKey(config.secret))

  return { token, expiresAt: new Date(exp * 1000), jti }
}

// ── Sign both tokens (full pair) ──────────────

export async function signTokenPair(
  payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>,
  config: JwtConfig,
): Promise<TokenPair> {
  const [access, refresh] = await Promise.all([
    signAccessToken(payload, config),
    signRefreshToken(payload.sub, payload.tid, config),
  ])
  return {
    accessToken:      access.token,
    refreshToken:     refresh.token,
    accessExpiresAt:  access.expiresAt,
    refreshExpiresAt: refresh.expiresAt,
    jti:              access.jti,
  }
}

// ── Verify access token ───────────────────────

export interface VerifiedToken {
  sub: string
  tid: string
  role: UserRole
  email: string
  region: string
  jti: string
  iat: number
  exp: number
}

export async function verifyAccessToken(
  token: string,
  config: JwtConfig,
): Promise<VerifiedToken> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(config.secret), {
      issuer:   config.issuer,
      audience: config.audience,
    })

    if (!payload['sub'] || !payload['tid'] || !payload['role']) {
      throw new Error('Invalid token payload: missing required fields')
    }

    return {
      sub:    payload['sub'] as string,
      tid:    payload['tid'] as string,
      role:   payload['role'] as UserRole,
      email:  payload['email'] as string,
      region: payload['region'] as string,
      jti:    payload['jti'] as string,
      iat:    payload['iat'] as number,
      exp:    payload['exp'] as number,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token verification failed'
    throw new JwtVerificationError(msg)
  }
}

// ── Verify refresh token ──────────────────────

export async function verifyRefreshToken(
  token: string,
  config: JwtConfig,
): Promise<{ sub: string; tid: string; jti: string }> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(config.secret), {
      issuer:   config.issuer,
      audience: config.audience,
    })

    if (payload['type'] !== 'refresh') {
      throw new Error('Not a refresh token')
    }

    return {
      sub: payload['sub'] as string,
      tid: payload['tid'] as string,
      jti: payload['jti'] as string,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Refresh token verification failed'
    throw new JwtVerificationError(msg)
  }
}

// ── Custom error ──────────────────────────────

export class JwtVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JwtVerificationError'
  }
}
