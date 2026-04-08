import { getPool } from './db.js';
import {
  AuthFlowError,
  buildAuthenticatedUserContext,
  normalizeTenantRole,
  recordAuthEvent,
  type JWTPayload,
  type TenantMembershipRole,
  verifyActiveAccessToken,
  verifyPassword,
} from './auth.js';
import { getClientIp, sendError } from './security.js';

const STEP_UP_TTL_MINUTES = Math.max(1, Number(process.env.STEP_UP_TTL_MINUTES ?? 10));
const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED';

export type AuthContext = {
  payload: JWTPayload;
  userId: number;
  email: string;
  sessionId: string;
  tenantId: number | null;
  membershipRole: TenantMembershipRole | null;
  fullName: string;
  tenantName: string | null;
  tenantSlug: string;
  tenantPlan: string;
  onboardingStatus: string;
  onboardingStartedAt: string | Date | null;
  onboardingCompletedAt: string | Date | null;
  emailVerified: boolean;
};

export type TenantAccess = AuthContext & {
  tenantId: number;
  membershipRole: TenantMembershipRole;
  tenantName: string;
};

type ForbiddenAuditOptions = {
  action?: string;
  errorCode?: string;
  metadata?: Record<string, unknown> | null;
};

type OwnershipRequirement<T> = {
  access: TenantAccess;
  resource: T | null | undefined;
  canAccess: (resource: T) => boolean;
  forbiddenMessage: string;
  notFoundCode?: string;
  notFoundMessage?: string;
  action?: string;
  metadata?: Record<string, unknown> | ((resource: T | null) => Record<string, unknown>);
};

function fallbackName(email: string): string {
  return email.split('@')[0] ?? 'User';
}

function resolveMetadata<T>(
  metadata: Record<string, unknown> | ((resource: T | null) => Record<string, unknown>) | undefined,
  resource: T | null,
): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  return typeof metadata === 'function'
    ? metadata(resource)
    : metadata;
}

export function getBearerToken(c: any): string | null {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return null;
  }

  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

async function recordForbiddenAccessAttempt(c: any, access: AuthContext | TenantAccess, message: string, options?: ForbiddenAuditOptions): Promise<void> {
  await recordAuthEvent(getPool(), {
    tenantId: access.tenantId ?? null,
    userId: access.userId,
    sessionId: access.sessionId,
    eventType: 'forbidden_access_attempt',
    ip: getClientIp(c),
    userAgent: c.req.header('user-agent') ?? null,
    errorCode: options?.errorCode ?? 'forbidden',
    metadata: {
      action: options?.action ?? c.req.path,
      message,
      method: c.req.method,
      ...(options?.metadata ?? {}),
    },
  });
}

export async function requireAuth(c: any): Promise<AuthContext | Response> {
  const token = getBearerToken(c);
  if (!token) {
    return sendError(c, 401, 'unauthorized', 'Unauthorized');
  }

  const payload = await verifyActiveAccessToken(token);
  if (!payload) {
    return sendError(c, 401, 'unauthorized', 'Unauthorized');
  }

  const context = await buildAuthenticatedUserContext(payload.userId);
  if (!context) {
    return {
      payload,
      userId: payload.userId,
      email: payload.email,
      sessionId: payload.sessionId,
      tenantId: null,
      membershipRole: null,
      fullName: fallbackName(payload.email),
      tenantName: null,
      tenantSlug: '',
      tenantPlan: 'starter',
      onboardingStatus: 'pending',
      onboardingStartedAt: null,
      onboardingCompletedAt: null,
      emailVerified: false,
    };
  }

  return {
    payload,
    userId: payload.userId,
    email: context.user.email,
    sessionId: payload.sessionId,
    tenantId: Number(context.tenant.id),
    membershipRole: context.membership?.role ? normalizeTenantRole(context.membership.role) : null,
    fullName: context.user.fullName?.trim() || fallbackName(context.user.email),
    tenantName: context.tenant.name,
    tenantSlug: context.tenant.slug ?? '',
    tenantPlan: context.tenant.plan ?? 'starter',
    onboardingStatus: context.tenant.onboardingStatus ?? 'pending',
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
    emailVerified: context.user.emailVerified,
  };
}

export async function requireAuthUserId(c: any): Promise<number | null> {
  const access = await requireAuth(c);
  return access instanceof Response ? null : access.userId;
}

export async function requireTenantContext(c: any): Promise<TenantAccess | Response> {
  const access = await requireAuth(c);
  if (access instanceof Response) {
    return access;
  }

  if (!access.tenantId || !access.membershipRole || !access.tenantName) {
    return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
  }

  return {
    ...access,
    tenantId: access.tenantId,
    membershipRole: access.membershipRole,
    tenantName: access.tenantName,
  };
}

export async function requireRole(
  c: any,
  access: TenantAccess,
  roles: TenantMembershipRole[],
  message: string,
  options?: ForbiddenAuditOptions,
): Promise<Response | null> {
  if (roles.includes(access.membershipRole)) {
    return null;
  }

  await recordForbiddenAccessAttempt(c, access, message, {
    action: options?.action,
    errorCode: options?.errorCode ?? 'forbidden',
    metadata: {
      currentRole: access.membershipRole,
      requiredRoles: roles,
      ...(options?.metadata ?? {}),
    },
  });

  return sendError(c, 403, 'forbidden', message);
}

export async function requireOwnership<T>(c: any, input: OwnershipRequirement<T>): Promise<T | Response> {
  if (!input.resource) {
    await recordForbiddenAccessAttempt(c, input.access, input.notFoundMessage ?? 'Resource not found.', {
      action: input.action,
      errorCode: input.notFoundCode ?? 'not_found',
      metadata: resolveMetadata(input.metadata, null),
    });

    return sendError(c, 404, input.notFoundCode ?? 'not_found', input.notFoundMessage ?? 'Resource not found.');
  }

  if (input.canAccess(input.resource)) {
    return input.resource;
  }

  await recordForbiddenAccessAttempt(c, input.access, input.forbiddenMessage, {
    action: input.action,
    errorCode: 'forbidden',
    metadata: resolveMetadata(input.metadata, input.resource),
  });

  return sendError(c, 403, 'forbidden', input.forbiddenMessage);
}

export async function requireStepUpAuth(
  c: any,
  access: TenantAccess,
  message = 'Step-up authentication is required for this action.',
  options?: ForbiddenAuditOptions,
): Promise<Response | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT step_up_expires_at, revoked_at
     FROM user_sessions
     WHERE session_id = $1 AND user_id = $2 AND tenant_id = $3
     LIMIT 1`,
    [access.sessionId, access.userId, access.tenantId],
  );

  const session = result.rows[0] as {
    step_up_expires_at: string | Date | null;
    revoked_at: string | Date | null;
  } | undefined;

  const expiresAt = session?.step_up_expires_at ? new Date(session.step_up_expires_at).getTime() : 0;
  if (session && !session.revoked_at && expiresAt > Date.now()) {
    return null;
  }

  await recordForbiddenAccessAttempt(c, access, message, {
    action: options?.action,
    errorCode: STEP_UP_REQUIRED_CODE,
    metadata: options?.metadata,
  });

  return sendError(c, 403, STEP_UP_REQUIRED_CODE, message);
}

export async function verifyStepUpPassword(
  c: any,
  access: TenantAccess,
  password: string,
): Promise<{ verifiedAt: string; expiresAt: string; method: 'password' }> {
  if (!password.trim()) {
    throw new AuthFlowError(400, 'invalid_request', 'Password is required.');
  }

  const pool = getPool();
  const client = await pool.connect();
  let transactionFinished = false;

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT us.tenant_id, us.revoked_at, u.password_hash
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       WHERE us.session_id = $1 AND us.user_id = $2 AND us.tenant_id = $3
       LIMIT 1
       FOR UPDATE OF us`,
      [access.sessionId, access.userId, access.tenantId],
    );

    const row = result.rows[0] as {
      tenant_id: number;
      revoked_at: string | Date | null;
      password_hash: string;
    } | undefined;

    if (!row || row.revoked_at) {
      await recordAuthEvent(client, {
        tenantId: access.tenantId,
        userId: access.userId,
        sessionId: access.sessionId,
        eventType: 'step_up_failed',
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
        errorCode: 'session_not_found',
      });

      await client.query('COMMIT');
      transactionFinished = true;
      throw new AuthFlowError(401, 'session_not_found', 'Current session is not eligible for step-up verification.');
    }

    const passwordMatches = await verifyPassword(password, row.password_hash);
    if (!passwordMatches) {
      await recordAuthEvent(client, {
        tenantId: access.tenantId,
        userId: access.userId,
        sessionId: access.sessionId,
        eventType: 'step_up_failed',
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
        errorCode: 'invalid_credentials',
      });

      await client.query('COMMIT');
      transactionFinished = true;
      throw new AuthFlowError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    const verifiedAt = new Date();
    const expiresAt = new Date(verifiedAt.getTime() + STEP_UP_TTL_MINUTES * 60_000);

    await client.query(
      `UPDATE user_sessions
       SET step_up_verified_at = $4,
           step_up_method = 'password',
           step_up_expires_at = $5,
           updated_at = NOW()
       WHERE session_id = $1 AND user_id = $2 AND tenant_id = $3`,
      [access.sessionId, access.userId, access.tenantId, verifiedAt, expiresAt],
    );

    await recordAuthEvent(client, {
      tenantId: access.tenantId,
      userId: access.userId,
      sessionId: access.sessionId,
      eventType: 'step_up_verified',
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') ?? null,
      metadata: {
        method: 'password',
        expiresAt: expiresAt.toISOString(),
      },
    });

    await client.query('COMMIT');
    transactionFinished = true;

    return {
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      method: 'password',
    };
  } catch (error) {
    if (!transactionFinished) {
      await client.query('ROLLBACK');
    }

    if (error instanceof AuthFlowError) {
      throw error;
    }

    throw new AuthFlowError(500, 'step_up_failed', 'Step-up verification failed.');
  } finally {
    client.release();
  }
}