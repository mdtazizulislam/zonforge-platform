import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { initDatabase, getPool } from './db.js';
import {
  AuthFlowError,
  acceptTeamInvite,
  createWorkspaceSignup,
  getTeamInvitePreview,
  getTenantIdForUser,
  listUserSessions,
  loginUser,
  recordAuthEvent,
  revokeAllUserSessions,
  revokeCurrentSessionByAccessToken,
  revokeRefreshToken,
  revokeUserSession,
  rotateRefreshToken,
} from './auth.js';
import { getBearerToken, requireAuth, requireAuthUserId, requireTenantContext, verifyStepUpPassword } from './authz.js';
import {
  createCheckoutSessionForTenant,
  getTenantBillingStatus,
  createBillingPortalSession,
  changeTenantPlan,
  cancelTenantSubscription,
  processStripeWebhookEvent,
  validateStripeEnvOrThrow,
  verifyWebhookSignature,
} from './stripe.js';
import {
  assertFeatureAllowed,
  assertQuota,
  getUsageSummary,
  incrementUsage,
  UpgradeRequiredError,
} from './billing/enforcement.js';
import { isActiveUser } from './middleware/isActiveUser.js';
import {
  AppError,
  assertCheckoutNotSpam,
  assertValidEmail,
  assertValidPassword,
  assertValidPlanId,
  authBillingRateLimitMiddleware,
  getClientIp,
  recordMonitoringSignal,
  requestContextMiddleware,
  sendError,
  validateProductionSecurityConfig,
} from './security.js';
import {
  consumeEmailVerificationToken,
  createEmailVerificationToken,
  getConversionFunnelSummary,
  storeErrorReport,
  storeSupportRequest,
  trackAnalyticsEvent,
  trackConversionEvent,
} from './growth.js';
import { sendProductEmail } from './email.js';
import { createCustomerSecurityRouter } from './customerSecurity.js';
import { createEventPipelineRouter, createEventPipelineRuntime } from './eventIngestion.js';

const app = new Hono();
const API_PREFIX = '/v1';
const customerSecurityRouter = createCustomerSecurityRouter();
const eventPipelineRuntime = createEventPipelineRuntime({ writeAuditLog });
const eventPipelineRouter = createEventPipelineRouter(eventPipelineRuntime);
const ALLOWED_WEB_ORIGINS = new Set([
  'https://zonforge.com',
  'https://www.zonforge.com',
  'https://app.zonforge.com',
  'https://admin.zonforge.com',
]);

function normalizeAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof UpgradeRequiredError) {
    return new AppError(402, 'upgrade_required', error.message, error.toResponse());
  }

  return new AppError(500, 'internal_error', 'Internal Server Error');
}

async function writeAuditLog(input: {
  eventType: string;
  message: string;
  userId?: number | null;
  tenantId?: number | null;
  source?: string;
  payload?: Record<string, unknown> | null;
}) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO billing_audit_logs (
      tenant_id,
      user_id,
      event_type,
      source,
      message,
      payload_json
    ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.tenantId ?? null,
      input.userId ?? null,
      input.eventType,
      input.source ?? 'backend',
      input.message,
      input.payload ? JSON.stringify(input.payload) : null,
    ],
  );
}

app.onError((error, c) => {
  const normalized = normalizeAppError(error);
  if (normalized.status >= 500) {
    recordMonitoringSignal('5xx_spike', {
      path: c.req.path,
      method: c.req.method,
    }).catch(() => null);
  }

  if (normalized.status >= 500) {
    console.error('Unhandled application error:', error);
  }

  return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
});

app.use('*', requestContextMiddleware);

app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  if (c.res.status >= 500) {
    recordMonitoringSignal('5xx_spike', {
      path: c.req.path,
      method: c.req.method,
      status: c.res.status,
    }).catch(() => null);
  }

  console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} (${durationMs}ms)`);
});

app.use(`${API_PREFIX}/auth/*`, authBillingRateLimitMiddleware);
app.use(`${API_PREFIX}/billing/*`, authBillingRateLimitMiddleware);

// Enable CORS
app.use('*', cors({
  origin: (origin) => {
    if (!origin) {
      return 'https://zonforge.com';
    }

    try {
      const parsed = new URL(origin);
      if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        return parsed.origin;
      }

      if (ALLOWED_WEB_ORIGINS.has(parsed.origin)) {
        return parsed.origin;
      }
    } catch {
      return 'https://zonforge.com';
    }

    return 'https://zonforge.com';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'zonforge-backend' });
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'healthy' });
});

function resolveFrontendOrigin(c: any): string {
  const candidates = [
    c.req.header('origin'),
    c.req.header('referer'),
    process.env.ZONFORGE_PUBLIC_APP_URL,
    'https://app.zonforge.com',
    'https://zonforge.com',
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      continue;
    }
  }

  return 'https://zonforge.com';
}

function assertValidFullName(value: unknown): string {
  const fullName = typeof value === 'string' ? value.trim() : '';
  if (fullName.length < 2) {
    throw new AppError(400, 'invalid_full_name', 'Full name must be at least 2 characters.');
  }
  return fullName;
}

function assertValidWorkspaceName(value: unknown): string {
  const workspaceName = typeof value === 'string' ? value.trim() : '';
  if (workspaceName.length < 2) {
    throw new AppError(400, 'invalid_workspace_name', 'Workspace name must be at least 2 characters.');
  }
  return workspaceName;
}

async function handleSignupRequest(c: any, legacyRoute = false) {
  const body = await c.req.json().catch(() => ({}));
  const email = assertValidEmail(body.email);
  const password = assertValidPassword(body.password);
  const clientIp = getClientIp(c);
  const userAgent = c.req.header('user-agent') ?? null;
  const fallbackName = email.split('@')[0] || 'Workspace Owner';
  const fullName = assertValidFullName(body.fullName ?? body.full_name ?? body.name ?? fallbackName);
  const workspaceName = assertValidWorkspaceName(
    body.workspaceName ?? body.workspace_name ?? body.company ?? body.companyName ?? body.workspace ?? `${fallbackName} Workspace`,
  );

  const signup = await createWorkspaceSignup(
    {
      fullName,
      workspaceName,
      email,
      password,
    },
    {
      ip: clientIp,
      userAgent,
    },
  );

  const tenantId = Number(signup.context.tenant.id);

  try {
    const usage = await getUsageSummary(tenantId);
    await assertQuota(tenantId, 'IDENTITIES', usage.usage.IDENTITIES, 1);
    await incrementUsage(tenantId, 'IDENTITIES', 1);
  } catch (error) {
    console.warn('Signup usage initialization failed:', error);
  }

  await writeAuditLog({
    eventType: legacyRoute ? 'auth.register' : 'auth.signup',
    message: 'Customer workspace created',
    userId: signup.userId,
    tenantId,
    source: 'auth',
    payload: {
      email,
      workspaceName,
      workspaceSlug: signup.context.tenant.slug,
      clientIp,
    },
  });

  await trackConversionEvent({
    eventName: 'signup',
    userId: signup.userId,
    tenantId,
    source: legacyRoute ? 'auth_register_api' : 'auth_signup_api',
    metadata: {
      emailDomain: email.split('@')[1] ?? null,
      workspaceSlug: signup.context.tenant.slug,
    },
  });

  try {
    const verificationToken = await createEmailVerificationToken(signup.userId);
    const verificationUrl = `https://zonforge.com/success.html?verify_token=${verificationToken}`;

    await sendProductEmail({
      toEmail: email,
      emailType: 'verification',
      subject: 'Verify your ZonForge email',
      payload: { verificationUrl, userId: signup.userId },
    });

    await sendProductEmail({
      toEmail: email,
      emailType: 'welcome',
      subject: 'Welcome to ZonForge Sentinel',
      payload: {
        workspaceName,
        firstActionUrl: 'https://app.zonforge.com/onboarding',
        onboarding: ['connect_environment', 'invite_team', 'review_dashboard'],
      },
    });
  } catch (error) {
    console.warn('Signup email workflow failed:', error);
  }

  return c.json({
    success: true,
    userId: signup.userId,
    user: signup.context.user,
    tenant: signup.context.tenant,
    membership: signup.context.membership,
    accessToken: signup.tokens.accessToken,
    refreshToken: signup.tokens.refreshToken,
    token: signup.tokens.accessToken,
    access_token: signup.tokens.accessToken,
    refresh_token: signup.tokens.refreshToken,
    expires_in: signup.tokens.expiresInSeconds,
    refresh_expires_at: signup.tokens.refreshExpiresAt,
    redirectUrl: signup.context.tenant.onboardingStatus === 'pending' ? '/onboarding' : '/customer-dashboard',
  });
}

app.route('/', eventPipelineRouter);
app.route('/', customerSecurityRouter);

function normalizeCheckoutRequest(body: Record<string, unknown>) {
  const rawPlanId = body.plan_id ?? body.planId ?? body.planCode ?? body.plan ?? null;
  const rawBillingCycle = body.billing_cycle ?? body.billingCycle ?? 'monthly';

  const planId = assertValidPlanId(rawPlanId);
  const billingCycle = typeof rawBillingCycle === 'string' ? rawBillingCycle.trim().toLowerCase() : 'monthly';

  if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
    throw new AppError(400, 'invalid_billing_cycle', 'billing_cycle must be monthly or annual');
  }

  return {
    planId,
    billingCycle: billingCycle as 'monthly' | 'annual',
  };
}

async function handleCheckoutRequest(c: any) {
  const userId = await requireAuthUserId(c);
  if (!userId) {
    return sendError(c, 401, 'unauthorized', 'Unauthorized');
  }

  const tenantId = await getTenantIdForUser(userId);
  if (!tenantId) {
    return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
  }

  const body = await c.req.json();
  const { planId, billingCycle } = normalizeCheckoutRequest(body);
  assertCheckoutNotSpam(userId, `${planId}:${billingCycle}`);

  if (planId === 'starter') {
    return sendError(c, 400, 'starter_checkout_forbidden', 'Starter plan does not require checkout');
  }

  if (planId === 'enterprise' || planId === 'mssp') {
    return sendError(c, 400, 'sales_required', 'This plan requires sales assistance');
  }

  const origin = resolveFrontendOrigin(c);
  const checkout = await createCheckoutSessionForTenant(tenantId, planId, {
    billingInterval: billingCycle,
    successUrl: `${origin}/dashboard?payment=success`,
    cancelUrl: `${origin}/pricing?payment=cancelled`,
    actorUserId: userId,
    source: 'api_checkout',
  });

  await trackConversionEvent({
    eventName: 'checkout_started',
    userId,
    tenantId,
    sessionId: checkout.sessionId,
    source: 'billing_api',
    metadata: {
      planId,
      billingCycle,
    },
  });

  return c.json({
    plan_id: planId,
    billing_cycle: billingCycle,
    session_id: checkout.sessionId,
    session_url: checkout.url,
    sessionId: checkout.sessionId,
    url: checkout.url,
  });
}

// Auth routes
app.post(`${API_PREFIX}/auth/signup`, async (c) => {
  try {
    return await handleSignupRequest(c);
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/auth/register`, async (c) => {
  try {
    return await handleSignupRequest(c, true);
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/auth/login`, async (c) => {
  try {
    const body = await c.req.json();
    const email = assertValidEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return sendError(c, 400, 'invalid_password', 'Password is required.');
    }
    const clientIp = getClientIp(c);
    const userAgent = c.req.header('user-agent') ?? null;

    const { userId, tokens, context } = await loginUser(email, password, {
      ip: clientIp,
      userAgent,
    });

    const tenantId = await getTenantIdForUser(userId);
    await writeAuditLog({
      eventType: 'auth.login',
      message: 'User login successful',
      userId,
      tenantId,
      source: 'auth',
      payload: { email, clientIp },
    });

    await trackConversionEvent({
      eventName: 'login',
      userId,
      tenantId,
      source: 'auth_api',
      metadata: { emailDomain: email.split('@')[1] ?? null },
    });

    await recordAuthEvent(getPool(), {
      tenantId,
      userId,
      sessionId: tokens.sessionId,
      eventType: 'login_success',
      ip: clientIp,
      userAgent,
      metadata: { email },
    });

    return c.json({
      success: true,
      userId,
      user: context?.user,
      tenant: context?.tenant,
      membership: context?.membership,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresInSeconds,
      refresh_expires_at: tokens.refreshExpiresAt,
    });
  } catch (error) {
    if (error instanceof AuthFlowError && error.code === 'invalid_credentials') {
      await writeAuditLog({
        eventType: 'auth.login_failed',
        message: 'Failed login attempt',
        source: 'auth',
        payload: {
          ip: getClientIp(c),
        },
      });

      await recordMonitoringSignal('failed_login', {
        path: c.req.path,
        ip: getClientIp(c),
      });

      await recordAuthEvent(getPool(), {
        eventType: 'login_failed',
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
        errorCode: 'invalid_credentials',
      });

      return sendError(c, 401, 'invalid_credentials', 'Invalid email or password.');
    }

    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/auth/invite`, async (c) => {
  try {
    const token = c.req.query('token')?.trim() ?? '';
    const invite = await getTeamInvitePreview(token);
    return c.json({ success: true, invite });
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/auth/invite/accept`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const clientIp = getClientIp(c);
    const userAgent = c.req.header('user-agent') ?? null;
    const accepted = await acceptTeamInvite({
      token: typeof body.token === 'string'
        ? body.token
        : typeof body.inviteToken === 'string'
          ? body.inviteToken
          : '',
      fullName: typeof body.fullName === 'string'
        ? body.fullName
        : typeof body.full_name === 'string'
          ? body.full_name
          : null,
      password: typeof body.password === 'string' ? body.password : null,
      authUserId: await requireAuthUserId(c),
      metadata: {
        ip: clientIp,
        userAgent,
      },
    });

    const tenantId = Number(accepted.context.tenant.id);

    await writeAuditLog({
      eventType: 'auth.invite_accepted',
      message: 'Team invitation accepted',
      userId: accepted.userId,
      tenantId,
      source: 'auth',
      payload: {
        email: accepted.context.user.email,
        role: accepted.context.membership?.role ?? null,
        clientIp,
      },
    });

    await trackConversionEvent({
      eventName: 'invite_accept',
      userId: accepted.userId,
      tenantId,
      source: 'auth_invite_accept_api',
      metadata: {
        role: accepted.context.membership?.role ?? null,
      },
    });

    return c.json({
      success: true,
      userId: accepted.userId,
      user: accepted.context.user,
      tenant: accepted.context.tenant,
      membership: accepted.context.membership,
      invite: accepted.invite,
      accessToken: accepted.tokens.accessToken,
      refreshToken: accepted.tokens.refreshToken,
      token: accepted.tokens.accessToken,
      access_token: accepted.tokens.accessToken,
      refresh_token: accepted.tokens.refreshToken,
      expires_in: accepted.tokens.expiresInSeconds,
      refresh_expires_at: accepted.tokens.refreshExpiresAt,
      redirectUrl: accepted.context.tenant.onboardingStatus === 'completed' ? '/customer-dashboard' : '/onboarding',
    });
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/auth/refresh`, async (c) => {
  try {
    const body = await c.req.json();
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
    if (!refreshToken) {
      return sendError(c, 400, 'refresh_token_required', 'refresh_token is required');
    }

    const rotated = await rotateRefreshToken(refreshToken, {
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') ?? null,
    });

    await writeAuditLog({
      eventType: 'auth.refresh',
      message: 'Access token refreshed',
      userId: rotated.userId,
      tenantId: rotated.tenantId,
      source: 'auth',
      payload: { ip: getClientIp(c) },
    });

    await recordAuthEvent(getPool(), {
      tenantId: rotated.tenantId,
      userId: rotated.userId,
      sessionId: rotated.sessionId,
      eventType: 'refresh_success',
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') ?? null,
    });

    return c.json({
      success: true,
      token: rotated.tokens.accessToken,
      access_token: rotated.tokens.accessToken,
      refresh_token: rotated.tokens.refreshToken,
      expires_in: rotated.tokens.expiresInSeconds,
      refresh_expires_at: rotated.tokens.refreshExpiresAt,
    });
  } catch (error) {
    const authError = error instanceof AuthFlowError
      ? error
      : new AuthFlowError(401, 'invalid_refresh_token', 'Refresh token is invalid or expired.');

    if (authError.code !== 'refresh_token_reuse_detected') {
      await recordAuthEvent(getPool(), {
        eventType: 'refresh_failed',
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
        errorCode: authError.code,
      });
    }

    return sendError(c, authError.status, authError.code, authError.message);
  }
});

app.post(`${API_PREFIX}/auth/step-up/verify`, async (c) => {
  const access = await requireTenantContext(c);
  if (access instanceof Response) {
    return access;
  }

  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';

  try {
    const result = await verifyStepUpPassword(c, access, password);
    return c.json({
      success: true,
      stepUp: {
        method: result.method,
        verifiedAt: result.verifiedAt,
        expiresAt: result.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/auth/logout`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
    const accessToken = getBearerToken(c);
    if (refreshToken) {
      await revokeRefreshToken(refreshToken, {
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
      });
    } else if (accessToken) {
      await revokeCurrentSessionByAccessToken(accessToken, {
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
      });
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    return sendError(c, 400, 'logout_failed', 'Could not complete logout.');
  }
});

app.post(`${API_PREFIX}/auth/logout-all`, async (c) => {
  const access = await requireTenantContext(c);
  if (access instanceof Response) return access;

  try {
    const result = await revokeAllUserSessions({
      userId: access.userId,
      tenantId: access.tenantId,
      metadata: {
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
      },
    });

    await writeAuditLog({
      eventType: 'auth.logout_all',
      message: 'All sessions revoked',
      tenantId: access.tenantId,
      userId: access.userId,
      source: 'auth',
      payload: {
        revokedCount: result.revokedCount,
        ip: getClientIp(c),
      },
    });

    return c.json({ success: true, revokedCount: result.revokedCount });
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    return sendError(c, 400, 'logout_all_failed', 'Could not revoke all sessions.');
  }
});

app.get(`${API_PREFIX}/auth/sessions`, async (c) => {
  const access = await requireTenantContext(c);
  if (access instanceof Response) return access;

  const items = await listUserSessions(access.userId, access.tenantId, access.sessionId);
  return c.json({ success: true, items });
});

app.delete(`${API_PREFIX}/auth/sessions/:id`, async (c) => {
  const access = await requireTenantContext(c);
  if (access instanceof Response) return access;

  const sessionId = c.req.param('id')?.trim() ?? '';
  if (!/^[0-9a-fA-F-]{36}$/.test(sessionId)) {
    return sendError(c, 400, 'invalid_session_id', 'Session id is invalid.');
  }

  try {
    const revoked = await revokeUserSession({
      actorUserId: access.userId,
      tenantId: access.tenantId,
      sessionId,
      metadata: {
        ip: getClientIp(c),
        userAgent: c.req.header('user-agent') ?? null,
      },
    });

    await writeAuditLog({
      eventType: 'auth.session_revoked',
      message: 'Session revoked',
      tenantId: access.tenantId,
      userId: access.userId,
      source: 'auth',
      payload: {
        revokedSessionId: sessionId,
        ip: getClientIp(c),
      },
    });

    return c.json({ success: true, revoked: revoked.revoked, session: revoked.session });
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return sendError(c, error.status, error.code, error.message);
    }

    return sendError(c, 400, 'session_revoke_failed', 'Could not revoke the session.');
  }
});

app.get(`${API_PREFIX}/auth/verify-email`, async (c) => {
  try {
    const token = c.req.query('token')?.trim();
    if (!token) {
      return sendError(c, 400, 'verification_token_required', 'Verification token is required.');
    }

    const userId = await consumeEmailVerificationToken(token);
    if (!userId) {
      return sendError(c, 400, 'invalid_verification_token', 'Verification token is invalid or expired.');
    }

    return c.json({ success: true, userId });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/support/contact`, async (c) => {
  try {
    const body = await c.req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = assertValidEmail(body.email);
    const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim() : 'general';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name || !message) {
      return sendError(c, 400, 'invalid_support_request', 'name and message are required.');
    }

    const userId = await requireAuthUserId(c);
    const tenantId = userId ? await getTenantIdForUser(userId) : null;

    const supportRecord = await storeSupportRequest({
      name,
      email,
      topic,
      message,
      userId,
      tenantId,
    });

    await sendProductEmail({
      toEmail: email,
      emailType: 'support_received',
      subject: 'ZonForge support request received',
      payload: {
        supportId: supportRecord.id,
        topic,
      },
    });

    await writeAuditLog({
      eventType: 'support.contact_created',
      message: 'Support request submitted',
      userId,
      tenantId,
      source: 'support',
      payload: {
        supportId: supportRecord.id,
        topic,
      },
    });

    return c.json({ success: true, support_id: supportRecord.id, created_at: supportRecord.created_at });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/support/error-report`, async (c) => {
  try {
    const body = await c.req.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return sendError(c, 400, 'invalid_error_report', 'message is required.');
    }

    const userId = await requireAuthUserId(c);
    const tenantId = userId ? await getTenantIdForUser(userId) : null;

    await storeErrorReport({
      message,
      pagePath: typeof body.page_path === 'string' ? body.page_path : null,
      stack: typeof body.stack === 'string' ? body.stack : null,
      userId,
      tenantId,
      metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : null,
    });

    return c.json({ success: true });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/analytics/track`, async (c) => {
  try {
    const body = await c.req.json();
    const eventName = typeof body.event === 'string' ? body.event.trim() : '';
    if (!eventName) {
      return sendError(c, 400, 'event_required', 'event is required.');
    }

    const userId = await requireAuthUserId(c);
    const tenantId = userId ? await getTenantIdForUser(userId) : null;

    await trackAnalyticsEvent({
      eventName,
      userId,
      tenantId,
      pagePath: typeof body.page_path === 'string' ? body.page_path : c.req.path,
      source: typeof body.source === 'string' ? body.source : 'landing',
      metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : null,
    });

    return c.json({ success: true });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/analytics/funnel`, async (c) => {
  try {
    const hoursRaw = c.req.query('hours');
    const hours = Number(hoursRaw ?? '24');
    const summary = await getConversionFunnelSummary(Number.isFinite(hours) && hours > 0 ? hours : 24);

    const dropoffSignupToCheckout = summary.signup > 0
      ? Number((((summary.signup - summary.checkout_started) / summary.signup) * 100).toFixed(2))
      : 0;
    const dropoffCheckoutToPaid = summary.checkout_started > 0
      ? Number((((summary.checkout_started - summary.checkout_completed) / summary.checkout_started) * 100).toFixed(2))
      : 0;

    return c.json({
      hours: Number.isFinite(hours) && hours > 0 ? hours : 24,
      funnel: summary,
      dropoff: {
        signup_to_checkout_started_percent: dropoffSignupToCheckout,
        checkout_started_to_completed_percent: dropoffCheckoutToPaid,
      },
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/onboarding/get-started`, async (c) => {
  const userId = await requireAuthUserId(c);
  if (!userId) {
    return sendError(c, 401, 'unauthorized', 'Unauthorized');
  }

  const tenantId = await getTenantIdForUser(userId);
  const steps = [
    { id: 'connect_source', title: 'Connect your first data source', path: '/connectors', done: false },
    { id: 'run_detection', title: 'Run first threat detection', path: '/detections', done: false },
    { id: 'invite_team', title: 'Invite one teammate', path: '/settings/team', done: false },
  ];

  return c.json({ tenant_id: tenantId, steps, first_action: steps[0] });
});

app.get(`${API_PREFIX}/growth/proof`, async (c) => {
  try {
    const pool = getPool();
    const emailFilter = c.req.query('email');
    const whereSql = emailFilter ? 'WHERE to_email = $1' : '';

    const emailEvents = emailFilter
      ? await pool.query(
        `SELECT id, to_email, email_type, status, created_at
         FROM email_events
         ${whereSql}
         ORDER BY id DESC
         LIMIT 20`,
        [emailFilter],
      )
      : await pool.query(
        `SELECT id, to_email, email_type, status, created_at
         FROM email_events
         ORDER BY id DESC
         LIMIT 20`,
      );

    const conversionEvents = await pool.query(
      `SELECT id, event_name, user_id, tenant_id, source, created_at
       FROM conversion_events
       ORDER BY id DESC
       LIMIT 50`,
    );

    const analyticsEvents = await pool.query(
      `SELECT id, event_name, page_path, source, created_at
       FROM analytics_events
       ORDER BY id DESC
       LIMIT 50`,
    );

    const supportEvents = await pool.query(
      `SELECT id, email, topic, status, created_at
       FROM support_requests
       ORDER BY id DESC
       LIMIT 20`,
    );

    return c.json({
      emails: emailEvents.rows,
      conversions: conversionEvents.rows,
      analytics: analyticsEvents.rows,
      support: supportEvents.rows,
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

// Protected route example
app.get(`${API_PREFIX}/users`, async (c) => {
  const access = await requireAuth(c);
  if (access instanceof Response) {
    return access;
  }

  const pool = getPool();
  const result = await pool.query('SELECT id, email FROM users WHERE id = $1', [access.userId]);
  const user = result.rows[0];

  return c.json({ user });
});

async function handleBillingWebhook(c: any) {
  try {
    const signature = c.req.header('stripe-signature');

    if (!signature) {
      await recordMonitoringSignal('webhook_failure', {
        reason: 'missing_signature',
        path: c.req.path,
      });
      return sendError(c, 400, 'missing_signature', 'No signature');
    }

    const body = await c.req.text();
    const event = verifyWebhookSignature(body, signature);

    const result = await processStripeWebhookEvent(event);
    if (result.duplicate) {
      return c.json({ received: true, duplicate: true });
    }

    return c.json({ received: true });
  } catch (error) {
    await recordMonitoringSignal('webhook_failure', {
      reason: (error as Error).message,
      path: c.req.path,
    });

    console.error('✗ Webhook error:', error);
    if ((error as Error).message === 'Invalid webhook signature') {
      return sendError(c, 400, 'invalid_webhook_signature', 'Invalid webhook signature');
    }
    return sendError(c, 500, 'webhook_processing_failed', 'Webhook processing failed');
  }
}

// Stripe webhook
app.post(`${API_PREFIX}/billing/webhook`, handleBillingWebhook);

// Keep legacy route for compatibility
app.post(`${API_PREFIX}/webhook/stripe`, async (c) => {
  return handleBillingWebhook(c);
});

app.post(`${API_PREFIX}/billing/checkout`, async (c) => {
  try {
    return await handleCheckoutRequest(c);
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/checkout-session`, async (c) => {
  try {
    return await handleCheckoutRequest(c);
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/billing/status`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const status = await getTenantBillingStatus(tenantId);
    const usage = await getUsageSummary(tenantId);
    return c.json({
      billing: status,
      plan: usage.plan,
      statusCode: usage.status,
      limits: usage.limits,
      usage: usage.usage,
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

// GET /billing/subscription — detailed subscription object (09.6)
app.get(`${API_PREFIX}/billing/subscription`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) return sendError(c, 401, 'unauthorized', 'Unauthorized');
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    const subscription = await getTenantBillingStatus(tenantId);
    if (!subscription) return c.json({ subscription: null, eligible_for_checkout: true });
    return c.json({
      subscription: {
        tenantId: subscription.tenantId,
        planCode: subscription.planCode,
        planName: subscription.planName,
        status: subscription.subscriptionStatus,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        hasStripeCustomer: Boolean(subscription.stripeCustomerId),
        limits: subscription.limits,
      },
      eligible_for_checkout: !subscription.stripeSubscriptionId || subscription.subscriptionStatus === 'none',
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

// GET /billing/plans — plan catalog source-of-truth (09.6)
app.get(`${API_PREFIX}/billing/plans`, async (c) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT code, name, description,
              monthly_price_cents, annual_price_cents,
              max_users, max_connectors, max_events_per_month,
              retention_days,
              (stripe_monthly_price_id IS NOT NULL) AS has_stripe_monthly,
              (stripe_annual_price_id IS NOT NULL) AS has_stripe_annual
       FROM plans
       WHERE is_active = true
       ORDER BY monthly_price_cents ASC`
    );
    return c.json({ plans: result.rows });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/billing/usage`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const usage = await getUsageSummary(tenantId);
    return c.json({
      plan: usage.plan,
      status: usage.status,
      limits: usage.limits,
      usage: usage.usage,
    });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/portal`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const portal = await createBillingPortalSession(tenantId);
    return c.json({ url: portal.url });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/change-plan`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const body = await c.req.json();
    const planCode = assertValidPlanId(body.planCode ?? body.plan_id);

    const updated = await changeTenantPlan(tenantId, planCode);
    await writeAuditLog({
      eventType: 'billing.plan_change',
      message: `Plan changed to ${planCode}`,
      userId,
      tenantId,
      source: 'billing',
      payload: { planCode },
    });
    return c.json({ billing: updated });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.post(`${API_PREFIX}/billing/cancel`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) {
      return sendError(c, 401, 'unauthorized', 'Unauthorized');
    }

    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) {
      return sendError(c, 400, 'tenant_missing', 'User has no associated tenant');
    }

    const cancelled = await cancelTenantSubscription(tenantId);
    await writeAuditLog({
      eventType: 'billing.plan_cancel',
      message: 'Subscription cancellation requested',
      userId,
      tenantId,
      source: 'billing',
    });
    return c.json({ billing: cancelled });
  } catch (error) {
    const normalized = normalizeAppError(error);
    return sendError(c, normalized.status, normalized.code, normalized.message, normalized.details);
  }
});

app.get(`${API_PREFIX}/billing/access-check`, isActiveUser, async (c) => {
  return c.json({ allowed: true, userId: await requireAuthUserId(c) });
});

// Internal centralized enforcement endpoints (used by other services).
app.post(`${API_PREFIX}/billing/internal/assert-quota`, async (c) => {
  try {
    const { tenantId, metricCode, currentValue, increment } = await c.req.json() as {
      tenantId: number
      metricCode: 'CONNECTORS' | 'IDENTITIES' | 'EVENTS_PER_MIN'
      currentValue: number
      increment?: number
    };

    await assertQuota(Number(tenantId), metricCode, Number(currentValue), Number(increment ?? 1));
    return c.json({ allowed: true });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/billing/internal/assert-feature`, async (c) => {
  try {
    const { tenantId, featureCode } = await c.req.json() as {
      tenantId: number
      featureCode: 'AI_ANALYSIS' | 'ADVANCED_DETECTION' | 'EXPORT_REPORT' | 'THREAT_HUNTING'
    };
    await assertFeatureAllowed(Number(tenantId), featureCode);
    return c.json({ allowed: true });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/billing/internal/increment-usage`, async (c) => {
  try {
    const { tenantId, metricCode, increment } = await c.req.json() as {
      tenantId: number
      metricCode: 'CONNECTORS' | 'IDENTITIES' | 'EVENTS_PER_MIN'
      increment?: number
    };
    const value = await incrementUsage(Number(tenantId), metricCode, Number(increment ?? 1));
    return c.json({ ok: true, value });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/ai/analyze`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) return c.json({ error: 'User has no associated tenant' }, 400);
    await assertFeatureAllowed(tenantId, 'AI_ANALYSIS');
    return c.json({ ok: true, message: 'AI analysis accepted' });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

app.post(`${API_PREFIX}/reports/export`, async (c) => {
  try {
    const userId = await requireAuthUserId(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);
    const tenantId = await getTenantIdForUser(userId);
    if (!tenantId) return c.json({ error: 'User has no associated tenant' }, 400);
    await assertFeatureAllowed(tenantId, 'EXPORT_REPORT');
    return c.json({ ok: true, message: 'Export scheduled' });
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return c.json({ error: error.toResponse() }, 402);
    }
    return c.json({ error: (error as Error).message }, 400);
  }
});

// Initialize and start
async function start() {
  try {
    await initDatabase();
    await eventPipelineRuntime.start();
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
      throw new Error('JWT_SECRET must be set to a strong value (minimum 64 characters)');
    }

    validateStripeEnvOrThrow();
    validateProductionSecurityConfig();

    const port = parseInt(process.env.PORT || '3000', 10);
    serve({
      fetch: app.fetch,
      port,
    });

    const shutdown = async (signal: string) => {
      console.log(`\n[shutdown] received ${signal}, closing ingestion runtime...`);
      await eventPipelineRuntime.close();
      process.exit(0);
    };

    process.once('SIGINT', () => {
      shutdown('SIGINT').catch((error) => {
        console.error('[shutdown] failed:', error);
        process.exit(1);
      });
    });

    process.once('SIGTERM', () => {
      shutdown('SIGTERM').catch((error) => {
        console.error('[shutdown] failed:', error);
        process.exit(1);
      });
    });

    console.log(`\n✓ ZonForge SaaS Backend starting on port ${port}\n`);
  } catch (error) {
    console.error('✗ Failed to start:', error);
    process.exit(1);
  }
}

export default app;

// Export for deployment
export const handler = app.fetch;

// Start server
start().catch((error) => {
  console.error('✗ Server failed to start:', error);
  process.exit(1);
});
