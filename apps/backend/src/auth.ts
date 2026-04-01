import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool, getTenantByUserId } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

export interface JWTPayload {
  userId: number;
  email: string;
  tokenType: 'access';
  sessionId: string;
}

export interface AuthTokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresAt: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

function accessTokenTtlSeconds(): number {
  if (ACCESS_TOKEN_TTL.endsWith('m')) {
    return Number(ACCESS_TOKEN_TTL.slice(0, -1)) * 60;
  }

  if (ACCESS_TOKEN_TTL.endsWith('h')) {
    return Number(ACCESS_TOKEN_TTL.slice(0, -1)) * 3600;
  }

  return 900;
}

export function createAccessToken(payload: Omit<JWTPayload, 'tokenType'>): string {
  return jwt.sign({ ...payload, tokenType: 'access' }, JWT_SECRET, { expiresIn: accessTokenTtlSeconds() });
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    if (payload.tokenType !== 'access') {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

async function issueRefreshToken(userId: number, tokenFamily?: string, rotatedFromId?: number, metadata?: { ip?: string | null; userAgent?: string | null }) {
  const pool = getPool();
  const refreshToken = randomBytes(48).toString('hex');
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
  const family = tokenFamily || randomUUID();

  const insert = await pool.query(
    `INSERT INTO auth_refresh_tokens (
      user_id,
      token_hash,
      token_family,
      expires_at,
      rotated_from_id,
      created_ip,
      user_agent
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id, expires_at, token_family`,
    [
      userId,
      tokenHash,
      family,
      expiresAt,
      rotatedFromId ?? null,
      metadata?.ip ?? null,
      metadata?.userAgent ?? null,
    ],
  );

  return {
    refreshToken,
    tokenFamily: String(insert.rows[0].token_family),
    expiresAt: String(insert.rows[0].expires_at),
  };
}

async function issueAuthTokens(userId: number, email: string, metadata?: { ip?: string | null; userAgent?: string | null }): Promise<AuthTokenBundle> {
  const sessionId = randomUUID();
  const accessToken = createAccessToken({ userId, email, sessionId });
  const refresh = await issueRefreshToken(userId, undefined, undefined, metadata);

  return {
    accessToken,
    refreshToken: refresh.refreshToken,
    expiresInSeconds: accessTokenTtlSeconds(),
    refreshExpiresAt: refresh.expiresAt,
  };
}

export async function registerUser(
  email: string,
  password: string,
  metadata?: { ip?: string | null; userAgent?: string | null },
): Promise<{ userId: number; tokens: AuthTokenBundle }> {
  const pool = getPool();
  const passwordHash = await hashPassword(password);

  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );

    const user = result.rows[0];
    const tokens = await issueAuthTokens(user.id, user.email, metadata);

    return { userId: user.id, tokens };
  } catch (error) {
    throw new Error('User registration failed');
  }
}

export async function loginUser(
  email: string,
  password: string,
  metadata?: { ip?: string | null; userAgent?: string | null },
): Promise<{ userId: number; tokens: AuthTokenBundle }> {
  const pool = getPool();

  try {
    const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const tokens = await issueAuthTokens(user.id, user.email, metadata);
    return { userId: user.id, tokens };
  } catch (error) {
    throw new Error((error as Error).message || 'Login failed');
  }
}

export async function rotateRefreshToken(
  refreshToken: string,
  metadata?: { ip?: string | null; userAgent?: string | null },
): Promise<{ userId: number; email: string; tokens: AuthTokenBundle }> {
  const pool = getPool();
  const tokenHash = hashRefreshToken(refreshToken);

  const existing = await pool.query(
    `SELECT rt.id, rt.user_id, rt.token_family, rt.expires_at, rt.revoked_at, u.email
     FROM auth_refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );

  const row = existing.rows[0];
  if (!row) {
    throw new Error('Invalid refresh token');
  }

  if (row.revoked_at) {
    throw new Error('Refresh token already revoked');
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error('Refresh token expired');
  }

  await pool.query(
    `UPDATE auth_refresh_tokens
     SET revoked_at = NOW(),
         revoked_reason = 'rotated',
         last_used_at = NOW()
     WHERE id = $1`,
    [row.id],
  );

  const sessionId = randomUUID();
  const accessToken = createAccessToken({ userId: row.user_id, email: row.email, sessionId });
  const nextRefresh = await issueRefreshToken(row.user_id, row.token_family, row.id, metadata);

  return {
    userId: Number(row.user_id),
    email: String(row.email),
    tokens: {
      accessToken,
      refreshToken: nextRefresh.refreshToken,
      expiresInSeconds: accessTokenTtlSeconds(),
      refreshExpiresAt: nextRefresh.expiresAt,
    },
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const pool = getPool();
  const tokenHash = hashRefreshToken(refreshToken);

  await pool.query(
    `UPDATE auth_refresh_tokens
     SET revoked_at = NOW(),
         revoked_reason = 'logout',
         last_used_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );
}

export async function getUserById(userId: number) {
  const pool = getPool();

  try {
    const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  const pool = getPool();

  try {
    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

export async function getTenantIdForUser(userId: number): Promise<number | null> {
  const tenant = await getTenantByUserId(userId);
  return tenant?.id || null;
}
