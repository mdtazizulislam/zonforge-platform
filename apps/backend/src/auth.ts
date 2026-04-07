import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool, getTenantByUserId, getUserWorkspaceContext } from './db.js';
import { assertValidPassword } from './security.js';

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

export type TenantMembershipRole = 'owner' | 'admin' | 'analyst' | 'viewer';
export type TenantInviteRole = Exclude<TenantMembershipRole, 'owner'>;

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

export interface TeamInvitePreview {
  id: string;
  email: string;
  role: TenantInviteRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  inviter: {
    id: string;
    email: string;
    fullName: string;
  } | null;
  existingUser: boolean;
}

export interface TeamInviteAcceptanceResult {
  userId: number;
  tokens: AuthTokenBundle;
  context: AuthenticatedUserContext;
  invite: TeamInvitePreview;
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

export function normalizeTenantRole(role: string | null | undefined): TenantMembershipRole {
  switch ((role ?? '').trim().toLowerCase()) {
    case 'owner':
      return 'owner';
    case 'admin':
      return 'admin';
    case 'analyst':
      return 'analyst';
    case 'viewer':
    case 'member':
    default:
      return 'viewer';
  }
}

export function assertTenantInviteRole(role: unknown): TenantInviteRole {
  const normalized = normalizeTenantRole(typeof role === 'string' ? role : 'viewer');
  if (normalized === 'owner') {
    throw new AuthFlowError(400, 'invalid_role', 'owner cannot be assigned through invitations.');
  }

  return normalized;
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

function inviteStatus(row: { accepted_at: string | Date | null; revoked_at: string | Date | null; expires_at: string | Date }): TeamInvitePreview['status'] {
  if (row.accepted_at) {
    return 'accepted';
  }

  if (row.revoked_at) {
    return 'revoked';
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return 'expired';
  }

  return 'pending';
}

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function requireFullName(value: string | null | undefined): string {
  const fullName = value?.trim() ?? '';
  if (fullName.length < 2) {
    throw new AuthFlowError(400, 'invalid_full_name', 'Full name must be at least 2 characters.');
  }

  return fullName;
}

async function writeTeamAudit(
  target: Queryable,
  input: { tenantId: number; userId: number; eventType: string; message: string; payload?: Record<string, unknown> | null },
) {
  await target.query(
    `INSERT INTO billing_audit_logs (
      tenant_id,
      user_id,
      event_type,
      source,
      message,
      payload_json
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.tenantId,
      input.userId,
      input.eventType,
      'team',
      input.message,
      input.payload ? JSON.stringify(input.payload) : null,
    ],
  );
}

type InviteLookupRow = {
  id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string | null;
  email: string;
  role: string;
  expires_at: string | Date;
  accepted_at: string | Date | null;
  revoked_at: string | Date | null;
  invited_by_user_id: number | null;
  inviter_email: string | null;
  inviter_full_name: string | null;
};

async function fetchInviteByTokenHash(target: Queryable, tokenHash: string, forUpdate = false): Promise<InviteLookupRow | null> {
  const result = await target.query(
    `SELECT
       ti.id,
       ti.tenant_id,
       t.name AS tenant_name,
       t.slug AS tenant_slug,
       LOWER(ti.email) AS email,
       ti.role,
       ti.expires_at,
       ti.accepted_at,
       ti.revoked_at,
       ti.invited_by_user_id,
       inviter.email AS inviter_email,
       inviter.full_name AS inviter_full_name
     FROM tenant_invitations ti
     JOIN tenants t ON t.id = ti.tenant_id
     LEFT JOIN users inviter ON inviter.id = ti.invited_by_user_id
     WHERE ti.token_hash = $1
     ${forUpdate ? 'FOR UPDATE OF ti' : ''}
     LIMIT 1`,
    [tokenHash],
  );

  return (result.rows[0] as InviteLookupRow | undefined) ?? null;
}

function toInvitePreview(row: InviteLookupRow, existingUser: boolean): TeamInvitePreview {
  return {
    id: String(row.id),
    email: row.email,
    role: assertTenantInviteRole(row.role),
    status: inviteStatus(row),
    expiresAt: new Date(row.expires_at).toISOString(),
    tenant: {
      id: String(row.tenant_id),
      name: row.tenant_name,
      slug: row.tenant_slug ?? '',
    },
    inviter: row.invited_by_user_id && row.inviter_email
      ? {
          id: String(row.invited_by_user_id),
          email: row.inviter_email,
          fullName: displayName(row.inviter_full_name, row.inviter_email),
        }
      : null,
    existingUser,
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
      ? { role: normalizeTenantRole(context.membership.role) }
      : null,
  };
}

export async function getTeamInvitePreview(token: string): Promise<TeamInvitePreview> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new AuthFlowError(400, 'invite_token_required', 'Invite token is required.');
  }

  const pool = getPool();
  const invite = await fetchInviteByTokenHash(pool, hashInvitationToken(normalizedToken));
  if (!invite) {
    throw new AuthFlowError(404, 'invite_not_found', 'Invitation not found.');
  }

  const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [invite.email]);
  return toInvitePreview(invite, existingUser.rows.length > 0);
}

export async function acceptTeamInvite(input: {
  token: string;
  password?: string | null;
  fullName?: string | null;
  authUserId?: number | null;
  metadata?: { ip?: string | null; userAgent?: string | null };
}): Promise<TeamInviteAcceptanceResult> {
  const normalizedToken = input.token.trim();
  if (!normalizedToken) {
    throw new AuthFlowError(400, 'invite_token_required', 'Invite token is required.');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const invite = await fetchInviteByTokenHash(client, hashInvitationToken(normalizedToken), true);
    if (!invite) {
      throw new AuthFlowError(404, 'invite_not_found', 'Invitation not found.');
    }

    if (inviteStatus(invite) !== 'pending') {
      throw new AuthFlowError(409, 'invite_not_active', 'This invitation is no longer active.');
    }

    const inviteRole = assertTenantInviteRole(invite.role);
    let userId: number;
    let userEmail = invite.email;

    if (input.authUserId) {
      const authenticatedUserResult = await client.query(
        'SELECT id, email FROM users WHERE id = $1 LIMIT 1',
        [input.authUserId],
      );

      const authenticatedUser = authenticatedUserResult.rows[0] as { id: number; email: string } | undefined;
      if (!authenticatedUser) {
        throw new AuthFlowError(401, 'unauthorized', 'Unauthorized');
      }

      if (authenticatedUser.email.toLowerCase() !== invite.email) {
        throw new AuthFlowError(403, 'invite_email_mismatch', 'This invitation belongs to a different email address.');
      }

      userId = Number(authenticatedUser.id);
      userEmail = authenticatedUser.email;
    } else {
      const existingUserResult = await client.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1',
        [invite.email],
      );

      const existingUser = existingUserResult.rows[0] as { id: number; email: string; password_hash: string } | undefined;
      if (existingUser) {
        const password = input.password?.trim() ?? '';
        if (!password) {
          throw new AuthFlowError(400, 'password_required', 'Password is required to accept this invitation.');
        }

        if (!(await verifyPassword(password, existingUser.password_hash))) {
          throw new AuthFlowError(401, 'invalid_credentials', 'Invalid email or password.');
        }

        userId = Number(existingUser.id);
        userEmail = existingUser.email;
      } else {
        const fullName = requireFullName(input.fullName ?? null);
        const password = assertValidPassword(input.password ?? '');
        const passwordHash = await hashPassword(password);
        const insertUser = await client.query(
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
          [invite.email, passwordHash, fullName, 'active', false],
        );

        userId = Number(insertUser.rows[0].id);
        userEmail = String(insertUser.rows[0].email);
      }
    }

    const existingContext = await getUserWorkspaceContext(userId);
    if (existingContext?.tenant.id && existingContext.tenant.id !== invite.tenant_id) {
      throw new AuthFlowError(
        409,
        'workspace_membership_conflict',
        'This email already belongs to another workspace and cannot accept this invitation.',
      );
    }

    const existingMembership = await client.query(
      `SELECT id
       FROM tenant_memberships
       WHERE tenant_id = $1 AND user_id = $2
       LIMIT 1`,
      [invite.tenant_id, userId],
    );

    if (existingMembership.rows.length > 0) {
      throw new AuthFlowError(409, 'already_member', 'This user is already a member of the workspace.');
    }

    await client.query(
      `INSERT INTO tenant_memberships (
        tenant_id,
        user_id,
        role,
        invited_by_user_id,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [invite.tenant_id, userId, inviteRole, invite.invited_by_user_id],
    );

    await client.query(
      `UPDATE tenant_invitations
       SET accepted_by_user_id = $2,
           accepted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [invite.id, userId],
    );

    await writeTeamAudit(client, {
      tenantId: invite.tenant_id,
      userId,
      eventType: 'team.invite.accepted',
      message: 'Team invitation accepted',
      payload: {
        inviteId: invite.id,
        email: invite.email,
        role: inviteRole,
      },
    });

    const tokens = await issueAuthTokens(client, userId, userEmail, input.metadata);

    await client.query('COMMIT');

    const context = await buildAuthenticatedUserContext(userId);
    if (!context) {
      throw new AuthFlowError(500, 'invite_accept_failed', 'Unable to establish a session for the invited user.');
    }

    return {
      userId,
      tokens,
      context,
      invite: toInvitePreview(invite, true),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AuthFlowError) {
      throw error;
    }

    throw error;
  } finally {
    client.release();
  }
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