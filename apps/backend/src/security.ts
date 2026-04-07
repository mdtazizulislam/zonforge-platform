declare const process: any;
declare const console: any;
declare const fetch: any;
declare const URL: any;

type Context = any;
type MiddlewareHandler = any;

const ONE_MINUTE_MS = 60_000;

type RateBucket = {
  count: number;
  resetAt: number;
};

type AbuseBucket = {
  count: number;
  windowStart: number;
  lastAt: number;
};

const routeRateBuckets = new Map<string, RateBucket>();
const checkoutAbuseBuckets = new Map<string, AbuseBucket>();
const monitoringCounters = new Map<string, number>();
const emittedAlerts = new Set<string>();

const MONITORING_THRESHOLDS = {
  fiveXxPerMinute: Number(process.env.MONITOR_5XX_THRESHOLD ?? 25),
  failedLoginsPerMinute: Number(process.env.MONITOR_FAILED_LOGIN_THRESHOLD ?? 10),
  webhookFailuresPerMinute: Number(process.env.MONITOR_WEBHOOK_FAILURE_THRESHOLD ?? 3),
};

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
}

export function getRequestId(c: Context): string {
  return c.get('requestId') ?? randomId();
}

export function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  return c.req.header('x-real-ip') ?? 'unknown';
}

export function errorBody(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return {
    error: {
      code,
      message,
      status,
      request_id: getRequestId(c),
      details: details ?? null,
    },
  };
}

export function sendError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return c.json(errorBody(c, status, code, message, details), status);
}

export const requestContextMiddleware: MiddlewareHandler = async (c: any, next: any) => {
  c.set('requestId', randomId());
  await next();
};

function hitRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = routeRateBuckets.get(key);

  if (!current || now >= current.resetAt) {
    const next: RateBucket = {
      count: 1,
      resetAt: now + windowMs,
    };
    routeRateBuckets.set(key, next);
    return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
  }

  current.count += 1;
  routeRateBuckets.set(key, current);

  if (current.count > limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function resolveRateLimitPolicy(path: string) {
  if (path.endsWith('/auth/register') || path.endsWith('/auth/signup')) {
    return { limit: 5, windowMs: 10 * ONE_MINUTE_MS };
  }

  if (path.endsWith('/auth/login')) {
    return { limit: 10, windowMs: 10 * ONE_MINUTE_MS };
  }

  if (path.includes('/billing/webhook')) {
    return { limit: 180, windowMs: ONE_MINUTE_MS };
  }

  if (path.includes('/billing/checkout')) {
    return { limit: 8, windowMs: 5 * ONE_MINUTE_MS };
  }

  if (path.includes('/auth/')) {
    return { limit: 30, windowMs: ONE_MINUTE_MS };
  }

  if (path.includes('/billing/')) {
    return { limit: 60, windowMs: ONE_MINUTE_MS };
  }

  return { limit: 100, windowMs: ONE_MINUTE_MS };
}

export const authBillingRateLimitMiddleware: MiddlewareHandler = async (c: any, next: any) => {
  const path = c.req.path;
  const policy = resolveRateLimitPolicy(path);
  const ip = getClientIp(c);

  const key = `${path}:${ip}`;
  const result = hitRateLimit(key, policy.limit, policy.windowMs);

  c.header('X-RateLimit-Limit', String(policy.limit));
  c.header('X-RateLimit-Remaining', String(result.remaining));
  c.header('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));

  if (!result.allowed) {
    c.header('Retry-After', String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
    return sendError(c, 429, 'rate_limit_exceeded', 'Too many requests. Please try again later.');
  }

  await next();
};

export function assertCheckoutNotSpam(userId: number, planId: string) {
  const key = `${userId}:${planId}`;
  const now = Date.now();
  const cooldownMs = 20_000;
  const windowMs = 10 * ONE_MINUTE_MS;
  const maxAttempts = 5;

  const existing = checkoutAbuseBuckets.get(key);
  if (!existing) {
    checkoutAbuseBuckets.set(key, { count: 1, windowStart: now, lastAt: now });
    return;
  }

  if (now - existing.lastAt < cooldownMs) {
    throw new AppError(429, 'checkout_cooldown', 'Please wait before creating another checkout session.', {
      cooldown_seconds: Math.ceil((cooldownMs - (now - existing.lastAt)) / 1000),
    });
  }

  if (now - existing.windowStart > windowMs) {
    checkoutAbuseBuckets.set(key, { count: 1, windowStart: now, lastAt: now });
    return;
  }

  if (existing.count >= maxAttempts) {
    throw new AppError(429, 'checkout_abuse_detected', 'Too many checkout attempts. Please try later.', {
      retry_after_seconds: Math.ceil((windowMs - (now - existing.windowStart)) / 1000),
    });
  }

  checkoutAbuseBuckets.set(key, {
    count: existing.count + 1,
    windowStart: existing.windowStart,
    lastAt: now,
  });
}

export function assertValidEmail(email: unknown): string {
  if (typeof email !== 'string') {
    throw new AppError(400, 'invalid_email', 'Email must be a string.');
  }

  const normalized = email.trim().toLowerCase();
  const re = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!re.test(normalized) || normalized.length > 254) {
    throw new AppError(400, 'invalid_email', 'Email format is invalid.');
  }

  return normalized;
}

export function assertValidPassword(password: unknown): string {
  if (typeof password !== 'string') {
    throw new AppError(400, 'invalid_password', 'Password must be a string.');
  }

  if (password.length < 10 || password.length > 128) {
    throw new AppError(400, 'invalid_password', 'Password must be between 10 and 128 characters.');
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);

  if (!hasLetter || !hasDigit) {
    throw new AppError(400, 'invalid_password', 'Password must include at least one letter and one number.');
  }

  return password;
}

export function assertValidPlanId(planId: unknown): string {
  if (typeof planId !== 'string') {
    throw new AppError(400, 'invalid_plan_id', 'plan_id must be a string.');
  }

  const normalized = planId.trim().toLowerCase();
  const allowed = new Set(['starter', 'growth', 'business', 'enterprise', 'mssp']);
  if (!allowed.has(normalized)) {
    throw new AppError(400, 'invalid_plan_id', 'plan_id is invalid.');
  }

  return normalized;
}

async function emitAlert(kind: string, payload: Record<string, unknown>) {
  const alertPayload = {
    source: 'zonforge-backend',
    kind,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  console.error(JSON.stringify({ event: 'security_alert', ...alertPayload }));

  const webhook = process.env.MONITOR_ALERT_WEBHOOK_URL;
  if (!webhook) {
    return;
  }

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertPayload),
    });
  } catch (error) {
    console.error('Failed to publish monitoring alert:', error);
  }
}

function minuteBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 16);
}

export async function recordMonitoringSignal(kind: '5xx_spike' | 'failed_login' | 'webhook_failure', details: Record<string, unknown>) {
  const bucket = minuteBucket();
  const key = `${kind}:${bucket}`;
  const count = (monitoringCounters.get(key) ?? 0) + 1;
  monitoringCounters.set(key, count);

  const threshold = kind === '5xx_spike'
    ? MONITORING_THRESHOLDS.fiveXxPerMinute
    : kind === 'failed_login'
      ? MONITORING_THRESHOLDS.failedLoginsPerMinute
      : MONITORING_THRESHOLDS.webhookFailuresPerMinute;

  if (count < threshold) {
    return;
  }

  if (emittedAlerts.has(key)) {
    return;
  }

  emittedAlerts.add(key);
  await emitAlert(kind, {
    count,
    threshold,
    minute_bucket: bucket,
    ...details,
  });
}

export function validateProductionSecurityConfig() {
  const nodeEnv = process.env.NODE_ENV ?? 'production';
  const frontend = process.env.ZONFORGE_PUBLIC_APP_URL ?? 'https://zonforge.com';
  const allowedHostnames = new Set([
    'zonforge.com',
    'www.zonforge.com',
    'app.zonforge.com',
    'admin.zonforge.com',
  ]);

  if (nodeEnv === 'production') {
    if (!frontend.startsWith('https://')) {
      throw new Error('ZONFORGE_PUBLIC_APP_URL must be https in production');
    }

    const frontendHost = new URL(frontend).hostname;
    if (!allowedHostnames.has(frontendHost)) {
      throw new Error('ZONFORGE_PUBLIC_APP_URL must point to an approved ZonForge production host');
    }

    const stripeSuccess = process.env.STRIPE_SUCCESS_URL;
    const stripeCancel = process.env.STRIPE_CANCEL_URL;
    for (const candidate of [stripeSuccess, stripeCancel]) {
      if (!candidate) {
        continue;
      }

      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:') {
        throw new Error('Stripe redirect URLs must be https in production');
      }

      if (!allowedHostnames.has(parsed.hostname)) {
        throw new Error('Stripe redirect URLs must use zonforge.com in production');
      }
    }
  }
}
