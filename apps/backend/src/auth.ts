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
  sessionId: string;
}

export interface UserSessionView {
  id: string;
  current: boolean;
  deviceLabel: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string | null;
  lastIpAddress: string | null;
  userAgent: string | null;
  mfaRequired: boolean;
  mfaVerifiedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface AuthEventInput {
  tenantId?: number | null;
  userId?: number | null;
  sessionId?: string | null;
  eventType: string;
  ip?: string | null;
  userAgent?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
}

type SessionMetadata = {
  ip?: string | null;
  userAgent?: string | null;
};

type DeviceSnapshot = {
  deviceType: string;
  browser: string;
  operatingSystem: string;
};

type UserSessionRow = {
  session_id: string;
  user_id: number;
  tenant_id: number;
  token_family: string;
  created_ip: string | null;
  last_ip: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  operating_system: string | null;
  mfa_required: boolean;
  mfa_verified_at: string | Date | null;
  last_seen_at: string | Date | null;
  created_at: string | Date;
  revoked_at: string | Date | null;
  revoked_reason: string | null;
};

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

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function deriveDeviceSnapshot(userAgent: string | null | undefined): DeviceSnapshot {
  const normalized = (userAgent ?? '').toLowerCase();

  const browser = normalized.includes('edg/')
    ? 'Edge'
    : normalized.includes('chrome/')
      ? 'Chrome'
      : normalized.includes('firefox/')
        ? 'Firefox'
        : normalized.includes('safari/') && !normalized.includes('chrome/')
          ? 'Safari'
          : normalized.includes('postmanruntime')
            ? 'Postman'
            : normalized.includes('curl/')
              ? 'curl'
              : 'Unknown';

  const operatingSystem = normalized.includes('windows')
    ? 'Windows'
    : normalized.includes('mac os') || normalized.includes('macintosh')
      ? 'macOS'
      : normalized.includes('android')
        ? 'Android'
        : normalized.includes('iphone') || normalized.includes('ipad') || normalized.includes('ios')
          ? 'iOS'
          : normalized.includes('linux')
            ? 'Linux'
            : 'Unknown';

  const deviceType = normalized.includes('ipad') || normalized.includes('tablet')
    ? 'tablet'
    : normalized.includes('mobile') || normalized.includes('iphone') || normalized.includes('android')
      ? 'mobile'
      : 'desktop';

  return {
    deviceType,
    browser,
    operatingSystem,
  };
}

function buildDeviceLabel(snapshot: DeviceSnapshot): string {
  const browser = snapshot.browser === 'Unknown' ? 'Browser' : snapshot.browser;
  const operatingSystem = snapshot.operatingSystem === 'Unknown' ? 'Unknown OS' : snapshot.operatingSystem;
  return `${browser} on ${operatingSystem}`;
}

async function resolvePrimaryTenantId(target: Queryable, userId: number): Promise<number | null> {
  const membership = await target.query(
    `SELECT tenant_id
     FROM tenant_memberships
     WHERE user_id = $1
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    [userId],
  );

  if (membership.rows[0]?.tenant_id) {
    return Number(membership.rows[0].tenant_id);
  }

  const legacyTenant = await target.query(
    `SELECT id
     FROM tenants
     WHERE user_id = $1
     ORDER BY created_at ASC, id ASC
     LIMIT 1`,
    [userId],
  );

  return legacyTenant.rows[0]?.id ? Number(legacyTenant.rows[0].id) : null;
}

export async function recordAuthEvent(target: Queryable, input: AuthEventInput): Promise<void> {
  await target.query(
    `INSERT INTO auth_events (
      tenant_id,
      user_id,
      session_id,
      event_type,
      ip_address,
      user_agent,
      error_code,
      metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.tenantId ?? null,
      input.userId ?? null,
      input.sessionId ?? null,
      input.eventType,
      input.ip ?? null,
      input.userAgent ?? null,
      input.errorCode ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

async function createUserSession(
  target: Queryable,
  input: {
    userId: number;
    tenantId: number;
    sessionId?: string;
    tokenFamily?: string;
    metadata?: SessionMetadata;
  },
) {
  const sessionId = input.sessionId ?? randomUUID();
  const tokenFamily = input.tokenFamily ?? randomUUID();
  const snapshot = deriveDeviceSnapshot(input.metadata?.userAgent);

  const insert = await target.query(
    `INSERT INTO user_sessions (
      session_id,
      tenant_id,
      user_id,
      token_family,
      created_ip,
      last_ip,
      user_agent,
      device_type,
      browser,
      operating_system,
      last_seen_at,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
    RETURNING session_id, token_family`,
    [
      sessionId,
      input.tenantId,
      input.userId,
      tokenFamily,
      input.metadata?.ip ?? null,
      input.metadata?.ip ?? null,
      input.metadata?.userAgent ?? null,
      snapshot.deviceType,
      snapshot.browser,
      snapshot.operatingSystem,
    ],
  );

  return {
    sessionId: String(insert.rows[0].session_id),
    tokenFamily: String(insert.rows[0].token_family),
  };
}

async function upsertSessionForFamily(
  target: Queryable,
  input: {
    userId: number;
    tenantId: number | null;
    tokenFamily: string;
    metadata?: SessionMetadata;
  },
): Promise<{ sessionId: string; tokenFamily: string } | null> {
  if (!input.tenantId) {
    return null;
  }

  const existing = await target.query(
    `SELECT session_id, token_family
     FROM user_sessions
     WHERE token_family = $1
     LIMIT 1`,
    [input.tokenFamily],
  );

  if (existing.rows[0]?.session_id) {
    const sessionId = String(existing.rows[0].session_id);
    await touchUserSession(target, sessionId, input.metadata);
    return {
      sessionId,
      tokenFamily: String(existing.rows[0].token_family),
    };
  }

  return createUserSession(target, {
    userId: input.userId,
    tenantId: input.tenantId,
    tokenFamily: input.tokenFamily,
    metadata: input.metadata,
  });
}

async function touchUserSession(target: Queryable, sessionId: string, metadata?: SessionMetadata): Promise<void> {
  const snapshot = deriveDeviceSnapshot(metadata?.userAgent);

  await target.query(
    `UPDATE user_sessions
     SET last_seen_at = NOW(),
         last_ip = COALESCE($2, last_ip),
         user_agent = COALESCE($3, user_agent),
         device_type = COALESCE($4, device_type),
         browser = COALESCE($5, browser),
         operating_system = COALESCE($6, operating_system),
         updated_at = NOW()
     WHERE session_id = $1`,
    [
      sessionId,
      metadata?.ip ?? null,
      metadata?.userAgent ?? null,
      snapshot.deviceType,
      snapshot.browser,
      snapshot.operatingSystem,
    ],
  );
}

async function revokeTokenFamily(
  target: Queryable,
  input: {
    tokenFamily: string;
    sessionId?: string | null;
    revokedReason: string;
  },
): Promise<void> {
  await target.query(
    `UPDATE auth_refresh_tokens
     SET revoked_at = COALESCE(revoked_at, NOW()),
         revoked_reason = COALESCE(revoked_reason, $2),
         last_used_at = COALESCE(last_used_at, NOW())
     WHERE token_family = $1`,
    [input.tokenFamily, input.revokedReason],
  );

  if (input.sessionId) {
    await target.query(
      `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, NOW()),
           revoked_reason = COALESCE(revoked_reason, $2),
           updated_at = NOW()
       WHERE session_id = $1`,
      [input.sessionId, input.revokedReason],
    );
  }
}

async function issueRefreshToken(
  target: Queryable,
  input: {
    userId: number;
    sessionId?: string | null;
    tokenFamily?: string;
    rotatedFromId?: number | null;
    metadata?: SessionMetadata;
  },
) {
  const refreshToken = randomBytes(48).toString('hex');
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
  const family = input.tokenFamily || randomUUID();

  const insert = await target.query(
    `INSERT INTO auth_refresh_tokens (
      user_id,
      session_id,
      token_hash,
      token_family,
      expires_at,
      rotated_from_id,
      created_ip,
      user_agent
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id, expires_at, token_family`,
    [
      input.userId,
      input.sessionId ?? null,
      tokenHash,
      family,
      expiresAt,
      input.rotatedFromId ?? null,
      input.metadata?.ip ?? null,
      input.metadata?.userAgent ?? null,
    ],
  );

  return {
    refreshToken,
    tokenFamily: String(insert.rows[0].token_family),
    expiresAt: String(insert.rows[0].expires_at),
  };
}

async function issueAuthTokens(
  target: Queryable,
  userId: number,
  email: string,
  tenantId: number | null,
  metadata?: SessionMetadata,
): Promise<AuthTokenBundle> {
  let sessionId: string = randomUUID();
  let tokenFamily: string | undefined;

  if (tenantId) {
    const session = await createUserSession(target, {
      userId,
      tenantId,
      metadata,
    });
    sessionId = session.sessionId;
    tokenFamily = session.tokenFamily;
  }

  const accessToken = createAccessToken({ userId, email, sessionId });
  const refresh = await issueRefreshToken(target, {
    userId,
    sessionId: tokenFamily ? sessionId : null,
    tokenFamily,
    metadata,
  });

  return {
    accessToken,
    refreshToken: refresh.refreshToken,
    expiresInSeconds: accessTokenTtlSeconds(),
    refreshExpiresAt: refresh.expiresAt,
    sessionId,
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

function normalizeAuthError(error: unknown, fallbackCode: string, fallbackMessage: string): never {
  if (error instanceof AuthFlowError) {
    throw error;
  }

  throw new AuthFlowError(500, fallbackCode, fallbackMessage);
}

export async function verifyActiveAccessToken(token: string): Promise<JWTPayload | null> {
  const payload = verifyJWT(token);
  if (!payload) {
    return null;
  }

  const pool = getPool();
  const result = await pool.query(
    `SELECT revoked_at
     FROM user_sessions
     WHERE session_id = $1 AND user_id = $2
     LIMIT 1`,
    [payload.sessionId, payload.userId],
  );

  if (result.rows.length === 0) {
    return payload;
  }

  if (result.rows[0]?.revoked_at) {
    return null;
  }

  return payload;
}

function mapUserSession(row: UserSessionRow, currentSessionId?: string | null): UserSessionView {
  const snapshot: DeviceSnapshot = {
    deviceType: row.device_type ?? 'desktop',
    browser: row.browser ?? 'Unknown',
    operatingSystem: row.operating_system ?? 'Unknown',
  };

  return {
    id: row.session_id,
    current: Boolean(currentSessionId && row.session_id === currentSessionId),
    deviceLabel: buildDeviceLabel(snapshot),
    deviceType: snapshot.deviceType,
    browser: snapshot.browser,
    operatingSystem: snapshot.operatingSystem,
    ipAddress: row.created_ip,
    lastIpAddress: row.last_ip,
    userAgent: row.user_agent,
    mfaRequired: Boolean(row.mfa_required),
    mfaVerifiedAt: toIso(row.mfa_verified_at),
    lastSeenAt: toIso(row.last_seen_at),
    createdAt: new Date(row.created_at).toISOString(),
    revokedAt: toIso(row.revoked_at),
    revokedReason: row.revoked_reason,
  };
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

    const tokens = await issueAuthTokens(client, userId, userEmail, invite.tenant_id, input.metadata);

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

    normalizeAuthError(error, 'invite_accept_failed', 'Unable to accept the invitation right now.');
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

    const tokens = await issueAuthTokens(client, userId, userEmail, tenantId, metadata);

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
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1',
      [email],
    );

    if (result.rows.length === 0) {
      throw new AuthFlowError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    const user = result.rows[0] as { id: number; email: string; password_hash: string };
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      throw new AuthFlowError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    const tenantId = await resolvePrimaryTenantId(client, user.id);
    const tokens = await issueAuthTokens(client, user.id, user.email, tenantId, metadata);
    await client.query('COMMIT');

    const context = await buildAuthenticatedUserContext(user.id);
    return { userId: user.id, tokens, context };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AuthFlowError) {
      throw error;
    }

    normalizeAuthError(error, 'login_failed', 'Login failed.');
  } finally {
    client.release();
  }
}

export async function rotateRefreshToken(
  refreshToken: string,
  metadata?: { ip?: string | null; userAgent?: string | null },
): Promise<{ userId: number; email: string; tenantId: number | null; sessionId: string | null; tokens: AuthTokenBundle }> {
  const pool = getPool();
  const tokenHash = hashRefreshToken(refreshToken);
  const client = await pool.connect();
  let transactionFinished = false;

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT
         rt.id,
         rt.user_id,
         rt.session_id,
         rt.token_family,
         rt.expires_at,
         rt.revoked_at,
         rt.revoked_reason,
         u.email,
         us.revoked_at AS session_revoked_at,
         COALESCE(
           us.tenant_id,
           (
             SELECT tm.tenant_id
             FROM tenant_memberships tm
             WHERE tm.user_id = rt.user_id
             ORDER BY tm.created_at ASC, tm.id ASC
             LIMIT 1
           ),
           (
             SELECT t.id
             FROM tenants t
             WHERE t.user_id = rt.user_id
             ORDER BY t.created_at ASC, t.id ASC
             LIMIT 1
           )
         ) AS tenant_id
       FROM auth_refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       LEFT JOIN user_sessions us ON us.session_id = rt.session_id
       WHERE rt.token_hash = $1
       LIMIT 1
       FOR UPDATE OF rt`,
      [tokenHash],
    );

    const row = existing.rows[0] as {
      id: number;
      user_id: number;
      session_id: string | null;
      token_family: string;
      expires_at: string;
      revoked_at: string | null;
      revoked_reason: string | null;
      email: string;
      session_revoked_at: string | null;
      tenant_id: number | null;
    } | undefined;

    if (!row) {
      throw new AuthFlowError(401, 'invalid_refresh_token', 'Refresh token is invalid or expired.');
    }

    if (row.revoked_at) {
      if (row.revoked_reason === 'rotated' || row.revoked_reason === 'reuse_detected') {
        await revokeTokenFamily(client, {
          tokenFamily: row.token_family,
          sessionId: row.session_id,
          revokedReason: 'reuse_detected',
        });

        await recordAuthEvent(client, {
          tenantId: row.tenant_id,
          userId: row.user_id,
          sessionId: row.session_id,
          eventType: 'refresh_token_reuse_detected',
          ip: metadata?.ip ?? null,
          userAgent: metadata?.userAgent ?? null,
          errorCode: 'refresh_token_reuse_detected',
        });

        await client.query('COMMIT');
        transactionFinished = true;

        throw new AuthFlowError(401, 'refresh_token_reuse_detected', 'Refresh token reuse detected. Session revoked.');
      }

      throw new AuthFlowError(401, 'invalid_refresh_token', 'Refresh token is invalid or expired.');
    }

    if (row.session_revoked_at) {
      throw new AuthFlowError(401, 'session_revoked', 'Session has been revoked.');
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE auth_refresh_tokens
         SET revoked_at = NOW(),
             revoked_reason = 'expired',
             last_used_at = NOW()
         WHERE id = $1`,
        [row.id],
      );

      throw new AuthFlowError(401, 'invalid_refresh_token', 'Refresh token is invalid or expired.');
    }

    const session = await upsertSessionForFamily(client, {
      userId: row.user_id,
      tenantId: row.tenant_id,
      tokenFamily: row.token_family,
      metadata,
    });

    const sessionId = session?.sessionId ?? row.session_id ?? null;

    if (!row.session_id && sessionId) {
      await client.query(
        `UPDATE auth_refresh_tokens
         SET session_id = $2
         WHERE id = $1`,
        [row.id, sessionId],
      );
    }

    await client.query(
      `UPDATE auth_refresh_tokens
       SET revoked_at = NOW(),
           revoked_reason = 'rotated',
           last_used_at = NOW()
       WHERE id = $1`,
      [row.id],
    );

    if (sessionId) {
      await touchUserSession(client, sessionId, metadata);
    }

    const effectiveSessionId = sessionId ?? randomUUID();

    const accessToken = createAccessToken({
      userId: row.user_id,
      email: row.email,
      sessionId: effectiveSessionId,
    });
    const nextRefresh = await issueRefreshToken(client, {
      userId: row.user_id,
      sessionId,
      tokenFamily: row.token_family,
      rotatedFromId: row.id,
      metadata,
    });

    await client.query('COMMIT');
    transactionFinished = true;

    return {
      userId: Number(row.user_id),
      email: String(row.email),
      tenantId: row.tenant_id ? Number(row.tenant_id) : null,
      sessionId: effectiveSessionId,
      tokens: {
        accessToken,
        refreshToken: nextRefresh.refreshToken,
        expiresInSeconds: accessTokenTtlSeconds(),
        refreshExpiresAt: nextRefresh.expiresAt,
        sessionId: effectiveSessionId,
      },
    };
  } catch (error) {
    if (!transactionFinished) {
      await client.query('ROLLBACK');
    }

    if (error instanceof AuthFlowError) {
      throw error;
    }

    normalizeAuthError(error, 'refresh_failed', 'Unable to rotate the session right now.');
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(
  refreshToken: string,
  metadata?: SessionMetadata,
): Promise<{ userId: number | null; tenantId: number | null; sessionId: string | null; revoked: boolean }> {
  const pool = getPool();
  const tokenHash = hashRefreshToken(refreshToken);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT
         rt.id,
         rt.user_id,
         rt.session_id,
         rt.token_family,
         COALESCE(
           us.tenant_id,
           (
             SELECT tm.tenant_id
             FROM tenant_memberships tm
             WHERE tm.user_id = rt.user_id
             ORDER BY tm.created_at ASC, tm.id ASC
             LIMIT 1
           ),
           (
             SELECT t.id
             FROM tenants t
             WHERE t.user_id = rt.user_id
             ORDER BY t.created_at ASC, t.id ASC
             LIMIT 1
           )
         ) AS tenant_id
       FROM auth_refresh_tokens rt
       LEFT JOIN user_sessions us ON us.session_id = rt.session_id
       WHERE rt.token_hash = $1
       LIMIT 1
       FOR UPDATE OF rt`,
      [tokenHash],
    );

    const row = result.rows[0] as {
      id: number;
      user_id: number;
      session_id: string | null;
      token_family: string;
      tenant_id: number | null;
    } | undefined;

    if (!row) {
      await client.query('COMMIT');
      return { userId: null, tenantId: null, sessionId: null, revoked: false };
    }

    await revokeTokenFamily(client, {
      tokenFamily: row.token_family,
      sessionId: row.session_id,
      revokedReason: 'logout',
    });

    await recordAuthEvent(client, {
      tenantId: row.tenant_id,
      userId: row.user_id,
      sessionId: row.session_id,
      eventType: 'logout',
      ip: metadata?.ip ?? null,
      userAgent: metadata?.userAgent ?? null,
    });

    await client.query('COMMIT');
    return {
      userId: row.user_id,
      tenantId: row.tenant_id ? Number(row.tenant_id) : null,
      sessionId: row.session_id,
      revoked: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    normalizeAuthError(error, 'logout_failed', 'Could not complete logout.');
  } finally {
    client.release();
  }
}

export async function revokeCurrentSessionByAccessToken(
  accessToken: string,
  metadata?: SessionMetadata,
): Promise<{ userId: number | null; tenantId: number | null; sessionId: string | null; revoked: boolean }> {
  const payload = verifyJWT(accessToken);
  if (!payload) {
    return { userId: null, tenantId: null, sessionId: null, revoked: false };
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT session_id, tenant_id, token_family
       FROM user_sessions
       WHERE session_id = $1 AND user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [payload.sessionId, payload.userId],
    );

    const row = result.rows[0] as { session_id: string; tenant_id: number; token_family: string } | undefined;
    if (!row) {
      await client.query('COMMIT');
      return { userId: payload.userId, tenantId: null, sessionId: payload.sessionId, revoked: false };
    }

    await revokeTokenFamily(client, {
      tokenFamily: row.token_family,
      sessionId: row.session_id,
      revokedReason: 'logout',
    });

    await recordAuthEvent(client, {
      tenantId: row.tenant_id,
      userId: payload.userId,
      sessionId: row.session_id,
      eventType: 'logout',
      ip: metadata?.ip ?? null,
      userAgent: metadata?.userAgent ?? null,
    });

    await client.query('COMMIT');
    return {
      userId: payload.userId,
      tenantId: row.tenant_id,
      sessionId: row.session_id,
      revoked: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    normalizeAuthError(error, 'logout_failed', 'Could not complete logout.');
  } finally {
    client.release();
  }
}

export async function listUserSessions(
  userId: number,
  tenantId: number,
  currentSessionId?: string | null,
): Promise<UserSessionView[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       session_id,
       user_id,
       tenant_id,
       token_family,
       created_ip,
       last_ip,
       user_agent,
       device_type,
       browser,
       operating_system,
       mfa_required,
       mfa_verified_at,
       last_seen_at,
       created_at,
       revoked_at,
       revoked_reason
     FROM user_sessions
     WHERE tenant_id = $1 AND user_id = $2
     ORDER BY created_at DESC`,
    [tenantId, userId],
  );

  return (result.rows as UserSessionRow[]).map((row) => mapUserSession(row, currentSessionId));
}

export async function revokeUserSession(input: {
  actorUserId: number;
  tenantId: number;
  sessionId: string;
  metadata?: SessionMetadata;
}): Promise<{ revoked: boolean; session: UserSessionView }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT
         session_id,
         user_id,
         tenant_id,
         token_family,
         created_ip,
         last_ip,
         user_agent,
         device_type,
         browser,
         operating_system,
         mfa_required,
         mfa_verified_at,
         last_seen_at,
         created_at,
         revoked_at,
         revoked_reason
       FROM user_sessions
       WHERE tenant_id = $1 AND session_id = $2
       LIMIT 1
       FOR UPDATE`,
      [input.tenantId, input.sessionId],
    );

    const session = result.rows[0] as UserSessionRow | undefined;
    if (!session) {
      throw new AuthFlowError(404, 'session_not_found', 'Session not found.');
    }

    if (session.user_id !== input.actorUserId) {
      throw new AuthFlowError(403, 'session_forbidden', 'You cannot revoke another user\'s session.');
    }

    await revokeTokenFamily(client, {
      tokenFamily: session.token_family,
      sessionId: session.session_id,
      revokedReason: 'session_revoked',
    });

    await recordAuthEvent(client, {
      tenantId: session.tenant_id,
      userId: input.actorUserId,
      sessionId: session.session_id,
      eventType: 'session_revoked',
      ip: input.metadata?.ip ?? null,
      userAgent: input.metadata?.userAgent ?? null,
      metadata: {
        revokedSessionId: session.session_id,
      },
    });

    const updated = await client.query(
      `SELECT
         session_id,
         user_id,
         tenant_id,
         token_family,
         created_ip,
         last_ip,
         user_agent,
         device_type,
         browser,
         operating_system,
         mfa_required,
         mfa_verified_at,
         last_seen_at,
         created_at,
         revoked_at,
         revoked_reason
       FROM user_sessions
       WHERE session_id = $1
       LIMIT 1`,
      [session.session_id],
    );

    await client.query('COMMIT');

    return {
      revoked: true,
      session: mapUserSession(updated.rows[0] as UserSessionRow),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AuthFlowError) {
      throw error;
    }

    normalizeAuthError(error, 'session_revoke_failed', 'Could not revoke the session.');
  } finally {
    client.release();
  }
}

export async function revokeAllUserSessions(input: {
  userId: number;
  tenantId: number;
  metadata?: SessionMetadata;
}): Promise<{ revokedCount: number }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const revokedSessions = await client.query(
      `UPDATE user_sessions
       SET revoked_at = COALESCE(revoked_at, NOW()),
           revoked_reason = COALESCE(revoked_reason, 'logout_all'),
           updated_at = NOW()
       WHERE tenant_id = $1 AND user_id = $2
       RETURNING session_id`,
      [input.tenantId, input.userId],
    );

    await client.query(
      `UPDATE auth_refresh_tokens
       SET revoked_at = COALESCE(revoked_at, NOW()),
           revoked_reason = COALESCE(revoked_reason, 'logout_all'),
           last_used_at = COALESCE(last_used_at, NOW())
       WHERE user_id = $1`,
      [input.userId],
    );

    await recordAuthEvent(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      eventType: 'logout_all',
      ip: input.metadata?.ip ?? null,
      userAgent: input.metadata?.userAgent ?? null,
      metadata: {
        revokedCount: revokedSessions.rowCount ?? revokedSessions.rows.length,
      },
    });

    await client.query('COMMIT');

    return {
      revokedCount: revokedSessions.rowCount ?? revokedSessions.rows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    normalizeAuthError(error, 'logout_all_failed', 'Could not revoke all sessions.');
  } finally {
    client.release();
  }
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