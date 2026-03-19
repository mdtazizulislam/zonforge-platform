import { z } from 'zod'

// ─────────────────────────────────────────────
// BILLING & SUBSCRIPTION TYPES
// ─────────────────────────────────────────────

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  stripeSubscriptionId: z.string().nullable(),
  stripeCustomerId: z.string().nullable(),
  planTier: z.string(),
  status: z.enum(['active', 'past_due', 'cancelled', 'trialing']),
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  trialEndsAt: z.date().nullable(),
  cancelAtPeriodEnd: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Subscription = z.infer<typeof SubscriptionSchema>

export const UsageRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  periodStart: z.date(),
  periodEnd: z.date(),
  identityCount: z.number().int(),
  eventCount: z.bigint(),
  apiCallCount: z.number().int(),
  connectorCount: z.number().int(),
  storageGb: z.number(),
  recordedAt: z.date(),
})
export type UsageRecord = z.infer<typeof UsageRecordSchema>

// ─────────────────────────────────────────────
// PLAYBOOK TYPES
// ─────────────────────────────────────────────

export const PlaybookActionTypeSchema = z.enum([
  'notify_email',
  'notify_slack',
  'notify_pagerduty',
  'notify_webhook',
  'disable_user_m365',
  'disable_user_google',
  'block_ip_cloudflare',
  'block_ip_aws_waf',
  'create_jira_ticket',
  'create_servicenow_incident',
  'require_mfa_reauthentication',
  'document_only',             // MVP safe mode
])
export type PlaybookActionType = z.infer<typeof PlaybookActionTypeSchema>

export const PlaybookSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(), // null = platform default
  name: z.string(),
  description: z.string(),
  triggerSeverities: z.array(z.string()),
  triggerRuleIds: z.array(z.string().uuid()),
  actions: z.array(z.object({
    type: PlaybookActionTypeSchema,
    config: z.record(z.unknown()),
    requiresApproval: z.boolean().default(false),
    delaySeconds: z.number().int().default(0),
  })),
  enabled: z.boolean().default(true),
  executionCount: z.number().int().default(0),
  lastExecutedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Playbook = z.infer<typeof PlaybookSchema>

export const PlaybookExecutionSchema = z.object({
  id: z.string().uuid(),
  playbookId: z.string().uuid(),
  alertId: z.string().uuid(),
  tenantId: z.string().uuid(),
  triggeredBy: z.string().uuid(),   // user id
  status: z.enum(['pending_approval', 'running', 'completed', 'failed', 'cancelled']),
  actionsCompleted: z.array(z.object({
    actionType: PlaybookActionTypeSchema,
    status: z.enum(['success', 'failed', 'skipped']),
    executedAt: z.date(),
    result: z.string().nullable(),
  })),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
})
export type PlaybookExecution = z.infer<typeof PlaybookExecutionSchema>

// ─────────────────────────────────────────────
// AUDIT LOG TYPES
// ─────────────────────────────────────────────

export const AuditActionSchema = z.enum([
  'user.login', 'user.logout', 'user.login_failed',
  'user.created', 'user.updated', 'user.deleted',
  'tenant.created', 'tenant.updated', 'tenant.suspended',
  'connector.created', 'connector.updated', 'connector.deleted',
  'alert.status_changed', 'alert.assigned', 'alert.feedback',
  'rule.created', 'rule.updated', 'rule.enabled', 'rule.disabled',
  'playbook.executed', 'playbook.approved', 'playbook.cancelled',
  'api_key.created', 'api_key.revoked',
  'settings.updated',
  'billing.plan_changed',
  'admin.tenant_suspended', 'admin.data_purge',
])
export type AuditAction = z.infer<typeof AuditActionSchema>

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  actorEmail: z.string().nullable(),
  actorRole: z.string().nullable(),
  actorIp: z.string().nullable(),
  action: AuditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  changes: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()).default({}),
  previousHash: z.string().nullable(),  // hash chain for tamper detection
  hash: z.string(),
  createdAt: z.date(),
})
export type AuditLog = z.infer<typeof AuditLogSchema>

// ─────────────────────────────────────────────
// GENERIC API RESPONSE TYPES
// ─────────────────────────────────────────────

export const ApiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      requestId: z.string().uuid(),
      timestamp: z.date(),
    }),
  })

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  meta: z.object({
    requestId: z.string().uuid(),
    timestamp: z.date(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int(),
  })

// Error codes
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PLAN_LIMIT_EXCEEDED: 'PLAN_LIMIT_EXCEEDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CONNECTOR_AUTH_FAILED: 'CONNECTOR_AUTH_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DUPLICATE_EVENT: 'DUPLICATE_EVENT',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
} as const
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]
