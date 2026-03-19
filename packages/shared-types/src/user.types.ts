import { z } from 'zod'

// ─────────────────────────────────────────────
// USER & RBAC TYPES
// ─────────────────────────────────────────────

export const UserRoleSchema = z.enum([
  'PLATFORM_ADMIN',    // ZonForge operations team
  'TENANT_ADMIN',      // Customer admin
  'SECURITY_ANALYST',  // SOC analyst
  'READ_ONLY',         // Executive viewer
  'API_CONNECTOR',     // Connector service accounts only
])
export type UserRole = z.infer<typeof UserRoleSchema>

export const UserStatusSchema = z.enum([
  'active',
  'suspended',
  'pending_mfa',
  'invited',
])
export type UserStatus = z.infer<typeof UserStatusSchema>

export const UserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: UserRoleSchema,
  status: UserStatusSchema,
  mfaEnabled: z.boolean().default(false),
  mfaSecret: z.string().nullable(),
  lastLoginAt: z.date().nullable(),
  lastLoginIp: z.string().nullable(),
  passwordHash: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type User = z.infer<typeof UserSchema>

export const PublicUserSchema = UserSchema.omit({
  passwordHash: true,
  mfaSecret: true,
})
export type PublicUser = z.infer<typeof PublicUserSchema>

// Permission map — what each role can do
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  PLATFORM_ADMIN: ['*'], // all permissions
  TENANT_ADMIN: [
    'tenant:read', 'tenant:update',
    'connectors:*',
    'alerts:*',
    'users:*',
    'billing:*',
    'rules:*',
    'playbooks:read',
    'risk:read',
    'audit:read',
    'compliance:read',
  ],
  SECURITY_ANALYST: [
    'tenant:read',
    'connectors:read',
    'alerts:read', 'alerts:update', 'alerts:feedback',
    'rules:read',
    'playbooks:read', 'playbooks:execute',
    'risk:read',
    'audit:read',
    'compliance:read',
    'hunt:execute',
  ],
  READ_ONLY: [
    'tenant:read',
    'alerts:read',
    'risk:read',
    'compliance:read',
  ],
  API_CONNECTOR: [
    'ingest:write',
  ],
}

// JWT payload shape
export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),           // user id
  tid: z.string().uuid(),           // tenant id
  role: UserRoleSchema,
  email: z.string().email(),
  region: z.string(),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().uuid(),           // token id for revocation
})
export type JwtPayload = z.infer<typeof JwtPayloadSchema>

// API Key payload stored in DB
export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(100),
  keyHash: z.string(),              // bcrypt hash of the key
  keyPrefix: z.string().length(8),  // first 8 chars for display
  role: UserRoleSchema,
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
  revokedAt: z.date().nullable(),
})
export type ApiKey = z.infer<typeof ApiKeySchema>
