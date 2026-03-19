import pino, { type Logger, type LoggerOptions } from 'pino'

// ─────────────────────────────────────────────
// ZonForge Sentinel — Structured Logger
// Based on Pino (fastest Node.js logger)
//
// Every log line includes:
//   service, environment, tenantId (if present),
//   requestId, level, msg, timestamp
//
// PII / sensitive fields are REDACTED automatically
// ─────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LoggerContext {
  service: string
  environment?: string
  version?: string
}

// Fields that must NEVER appear in logs
const REDACTED_FIELDS = [
  'password',
  'passwordHash',
  'password_hash',
  'mfaSecret',
  'mfa_secret',
  'mfaBackupCodes',
  'mfa_backup_codes',
  'clientSecret',
  'client_secret',
  'configEncrypted',
  'config_encrypted',
  'apiKey',
  'api_key',
  'rawKey',
  'raw_key',
  'keyHash',
  'key_hash',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'cookie',
  'x-api-key',
  'serviceAccountKeyJson',
  'service_account_key_json',
  'stripeSecretKey',
  'stripe_secret_key',
  'jwtSecret',
  'jwt_secret',
  'encryptionKey',
  'encryption_key',
  'hmacSecret',
  'hmac_secret',
]

// ─────────────────────────────────────────────
// Logger factory
// ─────────────────────────────────────────────

export function createLogger(context: LoggerContext): Logger {
  const isDev = (context.environment ?? process.env['ZONFORGE_ENV']) === 'development'
  const level = (process.env['ZONFORGE_LOG_LEVEL'] ?? 'info') as LogLevel

  const options: LoggerOptions = {
    level,
    redact: {
      paths: REDACTED_FIELDS,
      censor: '[REDACTED]',
    },
    base: {
      service: context.service,
      env:     context.environment ?? process.env['ZONFORGE_ENV'] ?? 'production',
      version: context.version ?? process.env['npm_package_version'] ?? '0.0.0',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label }
      },
    },
    // Serializers for common objects
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  }

  // Pretty print in development
  if (isDev) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize:    true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore:      'pid,hostname,env,version',
        messageFormat: '[{service}] {msg}',
      },
    }
  }

  try {
    return pino(options)
  } catch (err) {
    const safePaths = REDACTED_FIELDS.filter(p => !p.includes('-'))
    return pino({ ...options, redact: { paths: safePaths, censor: '[REDACTED]' } })
  }
}

// ─────────────────────────────────────────────
// Request-scoped child logger
// Creates a child with tenantId + requestId
// ─────────────────────────────────────────────

export function createRequestLogger(
  parent: Logger,
  requestId: string,
  tenantId?: string,
  userId?: string,
): Logger {
  return parent.child({
    requestId,
    ...(tenantId && { tenantId }),
    ...(userId && { userId }),
  })
}

// ─────────────────────────────────────────────
// Security-specific log helpers
// Standardizes security event logging format
// ─────────────────────────────────────────────

export interface SecurityLogFields {
  tenantId: string
  userId?: string
  action: string
  resource?: string
  outcome: 'success' | 'failure' | 'blocked'
  ip?: string
  reason?: string
  metadata?: Record<string, unknown>
}

export function logSecurityEvent(logger: Logger, fields: SecurityLogFields): void {
  const { outcome, action } = fields
  const level = outcome === 'failure' || outcome === 'blocked' ? 'warn' : 'info'

  logger[level]({
    type:     'security_event',
    tenantId: fields.tenantId,
    userId:   fields.userId,
    action,
    resource: fields.resource,
    outcome,
    ip:       fields.ip,
    reason:   fields.reason,
    ...fields.metadata,
  }, `[security] ${action} → ${outcome}`)
}

// Connector-specific log helper
export interface ConnectorLogFields {
  tenantId:    string
  connectorId: string
  sourceType:  string
  action:      string
  eventCount?: number
  errorMessage?: string
  lagSeconds?: number
}

export function logConnectorEvent(logger: Logger, fields: ConnectorLogFields): void {
  const level = fields.errorMessage ? 'error' : 'info'
  logger[level]({
    type:         'connector_event',
    tenantId:     fields.tenantId,
    connectorId:  fields.connectorId,
    sourceType:   fields.sourceType,
    action:       fields.action,
    eventCount:   fields.eventCount,
    lagSeconds:   fields.lagSeconds,
    error:        fields.errorMessage,
  }, `[connector:${fields.sourceType}] ${fields.action}`)
}

// Detection log helper
export interface DetectionLogFields {
  tenantId:    string
  ruleId?:     string
  ruleName?:   string
  entityId:    string
  entityType:  string
  severity:    string
  confidence:  number
  mitre?:      string[]
}

export function logDetection(logger: Logger, fields: DetectionLogFields): void {
  logger.warn({
    type:        'detection',
    tenantId:    fields.tenantId,
    ruleId:      fields.ruleId,
    ruleName:    fields.ruleName,
    entityId:    fields.entityId,
    entityType:  fields.entityType,
    severity:    fields.severity,
    confidence:  fields.confidence,
    mitre:       fields.mitre,
  }, `[detection] ${fields.ruleName ?? 'anomaly'} → ${fields.severity} (confidence: ${fields.confidence.toFixed(2)})`)
}

// ─────────────────────────────────────────────
// Module-level default logger (singleton)
// Each service should override with createLogger()
// ─────────────────────────────────────────────

export const rootLogger = createLogger({ service: 'zonforge' })

export default rootLogger

// ── Re-export tracing helpers ─────────────────
export { getTracer, withSpan, withJobTracing, injectTraceContext, extractTraceContext, traceDetection } from './tracing.js'
