import type { Context, Next } from 'hono'
import type Redis from 'ioredis'
import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'rate-limiter' })

// ─────────────────────────────────────────────
// ADVANCED RATE LIMITING
//
// Multiple layers:
//   1. IP-based rate limiting (DDoS protection)
//   2. User-based rate limiting (API abuse)
//   3. Endpoint-specific limits
//   4. Burst detection
//   5. Automatic IP blocking on sustained abuse
//
// Algorithm: Sliding window counter (Redis)
// ─────────────────────────────────────────────

export interface RateLimitConfig {
  window:     number    // seconds
  max:        number    // max requests in window
  burstMax?:  number    // max burst (very short window = 1s)
  keyPrefix:  string
}

// Per-endpoint rate limit configurations
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Auth endpoints — stricter to prevent credential stuffing
  'POST:/v1/auth/login':    { window: 60, max: 10,    keyPrefix: 'rl:auth:login' },
  'POST:/v1/auth/refresh':  { window: 60, max: 20,    keyPrefix: 'rl:auth:refresh' },
  'POST:/v1/auth/register': { window: 3600, max: 5,   keyPrefix: 'rl:auth:register' },

  // Ingestion endpoints — plan-based limits applied separately
  'POST:/v1/ingest/events': { window: 60, max: 1000,  keyPrefix: 'rl:ingest' },

  // API default
  'DEFAULT_USER':   { window: 60, max: 300,  keyPrefix: 'rl:user' },
  'DEFAULT_IP':     { window: 60, max: 100,  keyPrefix: 'rl:ip' },

  // Billing — prevent brute-force upgrade attempts
  'POST:/v1/billing/checkout': { window: 3600, max: 10, keyPrefix: 'rl:billing' },
}

// IPs in this set are temporarily blocked
const BLOCKED_IPS = new Set<string>()
const BLOCK_DURATION_MS = 60 * 60 * 1000   // 1 hour

// ─────────────────────────────────────────────
// SLIDING WINDOW RATE LIMITER
// ─────────────────────────────────────────────

async function slidingWindowCheck(
  redis:   Redis,
  key:     string,
  max:     number,
  window:  number,   // seconds
): Promise<{
  allowed:   boolean
  current:   number
  remaining: number
  resetAt:   number
}> {
  const now      = Date.now()
  const windowMs = window * 1000
  const cutoff   = now - windowMs

  // Use Redis sorted set for sliding window
  const pipe = redis.pipeline()
  pipe.zremrangebyscore(key, 0, cutoff)          // remove old entries
  pipe.zadd(key, now, `${now}-${Math.random()}`) // add current request
  pipe.zcard(key)                                 // count in window
  pipe.expire(key, window + 1)                    // auto-cleanup

  const results  = await pipe.exec()
  const current  = (results?.[2]?.[1] as number) ?? 0
  const resetAt  = Math.ceil((now + windowMs) / 1000)

  return {
    allowed:   current <= max,
    current,
    remaining: Math.max(0, max - current),
    resetAt,
  }
}

// ─────────────────────────────────────────────
// RATE LIMIT MIDDLEWARE FACTORY
// ─────────────────────────────────────────────

export function createRateLimitMiddleware(redis: Redis) {

  return async function rateLimitMiddleware(ctx: Context, next: Next) {
    const ip       = ctx.req.header('CF-Connecting-IP')
                  ?? ctx.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
                  ?? 'unknown'

    const method   = ctx.req.method
    const path     = ctx.req.path
    const userId   = ctx.var.user?.id

    // ── 1. Check IP blocklist ─────────────────

    if (BLOCKED_IPS.has(ip)) {
      log.warn({ ip, path }, 'Blocked IP attempted access')
      return ctx.json({
        success: false,
        error:   { code: 'IP_BLOCKED', message: 'Your IP has been temporarily blocked' },
      }, 429)
    }

    // ── 2. Endpoint-specific rate limit ───────

    const endpointKey   = `${method}:${path}`
    const endpointConfig = RATE_LIMIT_CONFIGS[endpointKey]

    if (endpointConfig) {
      const key    = `${endpointConfig.keyPrefix}:${ip}`
      const result = await slidingWindowCheck(
        redis, key, endpointConfig.max, endpointConfig.window,
      )

      ctx.header('X-RateLimit-Limit',     String(endpointConfig.max))
      ctx.header('X-RateLimit-Remaining', String(result.remaining))
      ctx.header('X-RateLimit-Reset',     String(result.resetAt))

      if (!result.allowed) {
        log.warn({ ip, path, current: result.current, max: endpointConfig.max },
          'Rate limit exceeded (endpoint-specific)')
        return ctx.json({
          success: false,
          error: {
            code:    'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please slow down.',
            retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
          },
        }, 429)
      }
    }

    // ── 3. Per-user rate limit ─────────────────

    if (userId) {
      const userConfig = RATE_LIMIT_CONFIGS['DEFAULT_USER']!
      const userKey    = `${userConfig.keyPrefix}:${userId}`
      const result     = await slidingWindowCheck(
        redis, userKey, userConfig.max, userConfig.window,
      )

      if (!result.allowed) {
        log.warn({ userId, path, current: result.current },
          'User rate limit exceeded')
        return ctx.json({
          success: false,
          error:   { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
        }, 429)
      }
    }

    // ── 4. IP rate limit ──────────────────────

    const ipConfig = RATE_LIMIT_CONFIGS['DEFAULT_IP']!
    const ipKey    = `${ipConfig.keyPrefix}:${ip}`
    const ipResult = await slidingWindowCheck(
      redis, ipKey, ipConfig.max, ipConfig.window,
    )

    if (!ipResult.allowed) {
      // Auto-block IP after 5x the limit
      if (ipResult.current > ipConfig.max * 5) {
        BLOCKED_IPS.add(ip)
        setTimeout(() => BLOCKED_IPS.delete(ip), BLOCK_DURATION_MS)
        log.error({ ip, current: ipResult.current }, '🚫 IP auto-blocked due to sustained abuse')
      }

      log.warn({ ip, path, current: ipResult.current }, 'IP rate limit exceeded')
      return ctx.json({
        success: false,
        error:   { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests from your IP' },
      }, 429)
    }

    await next()
  }
}

// ─────────────────────────────────────────────
// CONTENT SECURITY POLICY NONCE MIDDLEWARE
// ─────────────────────────────────────────────

export async function cspNonceMiddleware(ctx: Context, next: Next) {
  const { randomBytes } = await import('crypto')
  const nonce = randomBytes(16).toString('base64')

  ctx.set('cspNonce' as any, nonce)
  ctx.header('Content-Security-Policy',
    `default-src 'self'; ` +
    `script-src 'self' 'nonce-${nonce}'; ` +
    `style-src 'self' 'unsafe-inline'; ` +
    `img-src 'self' data: https:; ` +
    `connect-src 'self' https://api.zonforge.com; ` +
    `font-src 'self'; ` +
    `frame-ancestors 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'; ` +
    `upgrade-insecure-requests`,
  )

  await next()
}

// ─────────────────────────────────────────────
// REQUEST SANITIZATION MIDDLEWARE
//
// Prevents log injection, oversized payloads,
// and suspicious header patterns.
// ─────────────────────────────────────────────

export async function requestSanitizationMiddleware(ctx: Context, next: Next) {
  // 1. Block oversized bodies (>10MB)
  const contentLength = parseInt(ctx.req.header('content-length') ?? '0', 10)
  if (contentLength > 10 * 1024 * 1024) {
    return ctx.json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 10MB limit' },
    }, 413)
  }

  // 2. Block obvious injection patterns in headers
  const userAgent = ctx.req.header('user-agent') ?? ''
  const SUSPICIOUS_PATTERNS = [
    /\n|\r/,              // newline injection
    /<script/i,           // XSS
    /union.*select/i,     // SQL injection
    /\.\.\//,             // path traversal
  ]

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(userAgent)) {
      log.warn({
        ip:        ctx.req.header('CF-Connecting-IP') ?? 'unknown',
        userAgent: userAgent.slice(0, 200),
        path:      ctx.req.path,
      }, 'Suspicious request pattern blocked')
      return ctx.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Request blocked' },
      }, 403)
    }
  }

  await next()
}
