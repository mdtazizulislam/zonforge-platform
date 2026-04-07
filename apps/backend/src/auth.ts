import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool, getTenantByUserId, getUserWorkspaceContext } from './db.js';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const DEFAULT_ONBOARDING_STEPS = [
  { stepKey: 'welcome', isComplete: false, payload: null },
  { stepKey: 'connect_environment', isComplete: false, payload: null },
  { stepKey: 'first_scan', isComplete: false, payload: null },
] as const;

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

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

export interface AuthenticatedUserContext {
  user: {
    id: string;
    email: string;
    fullName: string;
    name: string;
    status: string;
    emailVerified: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    onboardingStatus: string;
  };
  membership: {
    role: string;
  } | null;
}

export interface WorkspaceSignupInput {
  fullName: string;
  workspaceName: string;
  email: string;
  password: string;
}

export class AuthFlowError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
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

function displayName(fullName: string | null | undefined, email: string): string {
  if (fullName?.trim()) {
    return fullName.trim();
  }

  return email.split('@')[0] ?? 'User';
}

function normalizeWorkspaceSlug(workspaceName: string): string {
  const normalized = workspaceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return normalized.slice(0, 48) || 'workspace';
}

async function resolveUniqueWorkspaceSlug(client: PoolClient, workspaceName: string): Promise<string> {
  const baseSlug = normalizeWorkspaceSlug(workspaceName);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${randomBytes(2).toString('hex')}`;
    const candidate = `${baseSlug}${suffix}`;
    const existing = await client.query('SELECT id FROM tenants WHERE slug = $1 LIMIT 1', [candidate]);
    if (existing.rows.length === 0) {
      return candidate;
    }
  }

  throw new AuthFlowError(409, 'workspace_conflict', 'This workspace name is not available. Try another.');
}

export function createAccessToken(payload: Omit<JWTPayload, 'tokenType'>): string {
  return jwt.sign({ ...payload, tokenType: 'access' }, JWT_SECRET, { expiresIn: accessTokenTtlSeconds() });
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || typeof decoded !== 'object') {
      return null;
    }

    const payload = decoded as jwt.JwtPayload;
    if (payload.tokenType !== 'access' || typeof payload.userId !== 'number' || typeof payload.email !== 'string' || typeof payload.sessionId !== 'string') {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      tokenType: 'access',
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}

function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

async function issueRefreshToken(target: Queryable, userId: number, tokenFamily?: string, rotatedFromId?: number, metadata?: { ip?: string | null; userAgent?: string | null }) {
  const refreshToken = randomBytes(48).toString('hex');
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
  const family = tokenFamily || randomUUID();

  const insert = await target.query(
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

async function issueAuthTokens(target: Queryable, userId: number, email: string, metadata?: { ip?: string | null; userAgent?: string | null }): Promise<AuthTokenBundle> {
  const sessionId = randomUUID();
  const accessToken = createAccessToken({ userId, email, sessionId });
  const refresh = await issueRefreshToken(target, userId, undefined, undefined, metadata);

  return {
    accessToken,
    refreshToken: refresh.refreshToken,
    expiresInSeconds: accessTokenTtlSeconds(),
    refreshExpiresAt: refresh.expiresAt,
  };
}

function normalizePgError(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string; detail?: string };

  if (pgError?.code === '23505') {
    if ((pgError.constraint ?? '').includes('users_email') || (pgError.detail ?? '').includes('(email)')) {
      throw new AuthFlowError(409, 'email_exists', 'An account with this email already exists.');
    }

    if ((pgError.constraint ?? '').includes('ux_tenants_slug') || (pgError.constraint ?? '').includes('tenants_slug')) {
      throw new AuthFlowError(409, 'workspace_conflict', 'This workspace name is not available. Try another.');
    }
  }

  if (error instanceof AuthFlowError) {
    throw error;
  }

  throw new AuthFlowError(500, 'signup_failed', 'Unable to create workspace right now. Please try again.');
}

export async function buildAuthenticatedUserContext(userId: number): Promise<AuthenticatedUserContext | null> {
  const context = await getUserWorkspaceContext(userId);
  if (!context) {
    return null;
  }

  const fullName = displayName(context.user.fullName, context.user.email);
  const tenantPlan = context.tenant.plan ?? 'starter';
  const onboardingStatus = context.tenant.onboardingStatus ?? 'pending';

  return {
    user: {
      id: String(context.user.id),
      email: context.user.email,
      fullName,
      name: fullName,
      status: context.user.status ?? 'active',
      emailVerified: context.user.emailVerified,
    },
    tenant: {
      id: String(context.tenant.id),
      name: context.tenant.name,
      slug: context.tenant.slug ?? '',
      plan: tenantPlan,
      onboardingStatus,
    },
    membership: context.membership
      ? { role: context.membership.role }
      : null,
  };
}

export async function createWorkspaceSignup(
  input: WorkspaceSignupInput,
  metadata?: { ip?: string | null; userAgent?: string | null },
): Promise<{ userId: number; tokens: AuthTokenBundle; context: AuthenticatedUserContext }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingUser = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [input.email]);
    if (existingUser.rows.length > 0) {
      throw new AuthFlowError(409, 'email_exists', 'An account with this email already exists.');
    }

    const passwordHash = await hashPassword(input.password);
    const slug = await resolveUniqueWorkspaceSlug(client, input.workspaceName);

    const userInsert = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        full_name,
        status,
        email_verified,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
      RETURNING id, email`,
      [input.email, passwordHash, input.fullName, 'active', false],
    );

    const userId = Number(userInsert.rows[0].id);
    const userEmail = String(userInsert.rows[0].email);

    const tenantInsert = await client.query(
      `INSERT INTO tenants (
        name,
        slug,
        plan,
        onboarding_status,
        user_id,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
      RETURNING id`,
      [input.workspaceName, slug, 'starter', 'pending', userId],
    );

    const tenantId = Number(tenantInsert.rows[0].id);

    await client.query(
      `INSERT INTO tenant_memberships (
        tenant_id,
        user_id,
        role,
        invited_by_user_id,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [tenantId, userId, 'owner', null],
    );

    for (const step of DEFAULT_ONBOARDING_STEPS) {
      await client.query(
        `INSERT INTO onboarding_progress (
          tenant_id,
          step_key,
          is_complete,
          payload_json,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,NOW(),NOW())`,
        [tenantId, step.stepKey, step.isComplete, step.payload ? JSON.stringify(step.payload) : null],
      );
    }

    const tokens = await issueAuthTokens(client, userId, userEmail, metadata);

    await client.query('COMMIT');

    const context = await buildAuthenticatedUserContext(userId);
    if (!context) {
      throw new AuthFlowError(500, 'signup_failed', 'Unable to create workspace right now. Please try again.');
    }

    return {
      userId,
      tokens,
      context,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    normalizePgError(error);
  } finally {
    client.release();
  }
}

export async function registerUser(
  email: string,
  password: string,
  metadata?: { ip?: string | null; userAgent?: string | null },
): Promise<{ userId: number; tokens: AuthTokenBundle; context: AuthenticatedUserContext }> {
  const workspaceName = `${email.split('@')[0] || 'workspace'} workspace`;
  return createWorkspaceSignup(
    {
      fullName: email.split('@')[0] || 'Workspace Owner',
      workspaceName,
      email,
      password,
    },
    metadata,
  );
}

export async function loginUser(
  email: string,
  password: string,
  metadata?: { ip?: string | null; userAgent?: string | null },
): Promise<{ userId: number; tokens: AuthTokenBundle; context: AuthenticatedUserContext | null }> {
  const pool = getPool();

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1',
      [email],
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0] as { id: number; email: string; password_hash: string };
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const tokens = await issueAuthTokens(pool, user.id, user.email, metadata);
    const context = await buildAuthenticatedUserContext(user.id);
    return { userId: user.id, tokens, context };
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

  const row = existing.rows[0] as {
    id: number;
    user_id: number;
    token_family: string;
    expires_at: string;
    revoked_at: string | null;
    email: string;
  } | undefined;

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
  const nextRefresh = await issueRefreshToken(pool, row.user_id, row.token_family, row.id, metadata);

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
    const result = await pool.query(
      'SELECT id, email, full_name, status, COALESCE(email_verified, email_verified_at IS NOT NULL, false) AS email_verified FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

export async function getUserByEmail(email: string) {
  const pool = getPool();

  try {
    const result = await pool.query(
      'SELECT id, email, full_name, status, COALESCE(email_verified, email_verified_at IS NOT NULL, false) AS email_verified FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

export async function getTenantIdForUser(userId: number): Promise<number | null> {
  const tenant = await getTenantByUserId(userId);
  return tenant?.id || null;
}