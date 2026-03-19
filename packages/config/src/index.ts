import { z } from 'zod'
import { config as dotenvConfig } from 'dotenv'
import path from 'path'

// ─────────────────────────────────────────────
// ZonForge Sentinel — Environment Configuration
//
// All environment variables are validated at
// startup with Zod. Missing or invalid vars
// cause an immediate crash with a clear error.
// ─────────────────────────────────────────────

// Load .env.local in non-production environments
if (process.env['ZONFORGE_ENV'] !== 'production') {
  dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })
  dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
}

// ─────────────────────────────────────────────
// CONFIG SCHEMA
// ─────────────────────────────────────────────

const envSchema = z.object({

  // ── App ─────────────────────────────────────
  ZONFORGE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  ZONFORGE_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  ZONFORGE_API_URL: z.string().url().default('http://localhost:3000'),

  // ── PostgreSQL ───────────────────────────────
  ZONFORGE_POSTGRES_URL: z.string().optional(),
  ZONFORGE_POSTGRES_HOST: z.string().default('localhost'),
  ZONFORGE_POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  ZONFORGE_POSTGRES_DB: z.string().default('zonforge'),
  ZONFORGE_POSTGRES_USER: z.string().default('zonforge'),
  ZONFORGE_POSTGRES_PASSWORD: z.string().min(1),
  ZONFORGE_POSTGRES_SSL: z.string().transform(v => v === 'true').default('false'),
  ZONFORGE_POSTGRES_POOL_MIN: z.coerce.number().int().positive().default(2),
  ZONFORGE_POSTGRES_POOL_MAX: z.coerce.number().int().positive().default(20),

  // ── ClickHouse ───────────────────────────────
  ZONFORGE_CLICKHOUSE_HOST: z.string().url().default('http://localhost:8123'),
  ZONFORGE_CLICKHOUSE_DB: z.string().default('zonforge_events'),
  ZONFORGE_CLICKHOUSE_USER: z.string().default('default'),
  ZONFORGE_CLICKHOUSE_PASSWORD: z.string().default(''),

  // ── Redis ────────────────────────────────────
  ZONFORGE_REDIS_HOST: z.string().default('localhost'),
  ZONFORGE_REDIS_PORT: z.coerce.number().int().positive().default(6379),
  ZONFORGE_REDIS_PASSWORD: z.string().optional(),
  ZONFORGE_REDIS_TLS: z.string().transform(v => v === 'true').default('false'),

  // ── Auth ─────────────────────────────────────
  ZONFORGE_JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  ZONFORGE_JWT_ACCESS_EXPIRY: z.string().default('15m'),
  ZONFORGE_JWT_REFRESH_EXPIRY: z.string().default('7d'),
  ZONFORGE_API_KEY_SALT: z.string().min(32, 'API key salt must be at least 32 characters'),

  // ── Encryption ───────────────────────────────
  ZONFORGE_ENCRYPTION_KEY: z.string().transform(s => s.trim()).pipe(
    z.string().length(64, 'Encryption key must be 64 hex chars (32 bytes)'),
  ),
  ZONFORGE_HMAC_SECRET: z.string().min(32, 'HMAC secret must be at least 32 characters'),

  // ── AWS ──────────────────────────────────────
  ZONFORGE_AWS_REGION: z.string().default('us-east-1'),
  ZONFORGE_AWS_ACCESS_KEY_ID: z.string().optional(),
  ZONFORGE_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  ZONFORGE_S3_BUCKET_EVENTS: z.string().default('zonforge-events-dev'),
  ZONFORGE_S3_BUCKET_EXPORTS: z.string().default('zonforge-exports-dev'),
  ZONFORGE_S3_BUCKET_AUDIT: z.string().default('zonforge-audit-dev'),

  // ── Stripe ───────────────────────────────────
  ZONFORGE_STRIPE_SECRET_KEY: z.string().optional(),
  ZONFORGE_STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // ── Anthropic (LLM Narratives) ────────────────
  ZONFORGE_ANTHROPIC_API_KEY: z.string().optional(),

  // ── Threat Intel ─────────────────────────────
  ZONFORGE_OTX_API_KEY: z.string().optional(),
  ZONFORGE_ABUSEIPDB_API_KEY: z.string().optional(),

  // ── Notifications ────────────────────────────
  ZONFORGE_SENDGRID_API_KEY: z.string().optional(),
  ZONFORGE_SENDGRID_FROM_EMAIL: z.string().email().default('alerts@zonforge.com'),

  // ── BullMQ ───────────────────────────────────
  ZONFORGE_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(10),
  ZONFORGE_QUEUE_MAX_RETRIES: z.coerce.number().int().positive().default(3),

  // ── Feature Flags ────────────────────────────
  ZONFORGE_FEATURE_LLM_NARRATIVES: z.string().transform(v => v === 'true').default('false'),
  ZONFORGE_FEATURE_THREAT_INTEL: z.string().transform(v => v === 'true').default('true'),
  ZONFORGE_FEATURE_ANOMALY_DETECTION: z.string().transform(v => v === 'true').default('false'),

})

export type Env = z.infer<typeof envSchema>

// ─────────────────────────────────────────────
// Parse and validate — fail fast on startup
// ─────────────────────────────────────────────

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.errors
      .map(e => `  • ${e.path.join('.')}: ${e.message}`)
      .join('\n')

    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ ZonForge: Invalid environment configuration')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(errors)
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('Copy .env.example to .env.local and fill in all required values.')
    process.exit(1)
  }

  return result.data
}

export const env = loadEnv()

// ─────────────────────────────────────────────
// Typed config objects (derived from env)
// ─────────────────────────────────────────────

export const postgresConfig = {
  host:     env.ZONFORGE_POSTGRES_HOST,
  port:     env.ZONFORGE_POSTGRES_PORT,
  database: env.ZONFORGE_POSTGRES_DB,
  username: env.ZONFORGE_POSTGRES_USER,
  password: env.ZONFORGE_POSTGRES_PASSWORD,
  ssl:      env.ZONFORGE_POSTGRES_SSL,
  poolMin:  env.ZONFORGE_POSTGRES_POOL_MIN,
  poolMax:  env.ZONFORGE_POSTGRES_POOL_MAX,
}

export const clickhouseConfig = {
  host:     env.ZONFORGE_CLICKHOUSE_HOST,
  database: env.ZONFORGE_CLICKHOUSE_DB,
  username: env.ZONFORGE_CLICKHOUSE_USER,
  password: env.ZONFORGE_CLICKHOUSE_PASSWORD,
}

export const redisConfig = {
  host:     env.ZONFORGE_REDIS_HOST,
  port:     env.ZONFORGE_REDIS_PORT,
  password: env.ZONFORGE_REDIS_PASSWORD,
  tls:      env.ZONFORGE_REDIS_TLS,
}

export const jwtConfig = {
  secret:               env.ZONFORGE_JWT_SECRET,
  accessExpirySeconds:  parseDuration(env.ZONFORGE_JWT_ACCESS_EXPIRY),
  refreshExpirySeconds: parseDuration(env.ZONFORGE_JWT_REFRESH_EXPIRY),
  issuer:   'zonforge-sentinel',
  audience: 'zonforge-api',
}

export const encryptionConfig = {
  key:        env.ZONFORGE_ENCRYPTION_KEY,
  hmacSecret: env.ZONFORGE_HMAC_SECRET,
}

export const featureFlags = {
  llmNarratives:    env.ZONFORGE_FEATURE_LLM_NARRATIVES,
  threatIntel:      env.ZONFORGE_FEATURE_THREAT_INTEL,
  anomalyDetection: env.ZONFORGE_FEATURE_ANOMALY_DETECTION,
}

export const queueConfig = {
  concurrency: env.ZONFORGE_QUEUE_CONCURRENCY,
  maxRetries:  env.ZONFORGE_QUEUE_MAX_RETRIES,
}

export const awsConfig = {
  region:          env.ZONFORGE_AWS_REGION,
  accessKeyId:     env.ZONFORGE_AWS_ACCESS_KEY_ID,
  secretAccessKey: env.ZONFORGE_AWS_SECRET_ACCESS_KEY,
  buckets: {
    events:  env.ZONFORGE_S3_BUCKET_EVENTS,
    exports: env.ZONFORGE_S3_BUCKET_EXPORTS,
    audit:   env.ZONFORGE_S3_BUCKET_AUDIT,
  },
}

// ── Duration parser: "15m" → 900, "7d" → 604800 ──

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/)
  if (!match) throw new Error(`Invalid duration format: ${duration}. Use e.g. 15m, 7d, 2h`)
  const value = parseInt(match[1]!, 10)
  const unit  = match[2]!
  const multipliers: Record<string, number> = {
    s: 1, m: 60, h: 3600, d: 86400,
  }
  return value * (multipliers[unit] ?? 1)
}
