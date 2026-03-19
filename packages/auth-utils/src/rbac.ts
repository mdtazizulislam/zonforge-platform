import { ROLE_PERMISSIONS, type UserRole } from '@zonforge/shared-types'

// ─────────────────────────────────────────────
// RBAC — Role-Based Access Control
// ─────────────────────────────────────────────

/**
 * Check if a role has a specific permission.
 * Wildcards supported: 'alerts:*' matches 'alerts:read', 'alerts:update' etc.
 * PLATFORM_ADMIN has '*' which matches everything.
 */
export function hasPermission(role: UserRole, required: string): boolean {
  const permissions = ROLE_PERMISSIONS[role]

  for (const perm of permissions) {
    // Full wildcard
    if (perm === '*') return true

    // Exact match
    if (perm === required) return true

    // Namespace wildcard: "alerts:*" matches "alerts:read"
    if (perm.endsWith(':*')) {
      const ns = perm.slice(0, -2)
      if (required.startsWith(ns + ':')) return true
    }
  }
  return false
}

/**
 * Check if a role has ALL required permissions.
 */
export function hasAllPermissions(role: UserRole, required: string[]): boolean {
  return required.every(p => hasPermission(role, p))
}

/**
 * Check if a role has ANY of the required permissions.
 */
export function hasAnyPermission(role: UserRole, required: string[]): boolean {
  return required.some(p => hasPermission(role, p))
}

/**
 * Assert permission — throws if role lacks it.
 * Used inside route handlers.
 */
export function assertPermission(role: UserRole, required: string): void {
  if (!hasPermission(role, required)) {
    throw new ForbiddenError(`Role ${role} lacks permission: ${required}`)
  }
}

// ── Role hierarchy checks ─────────────────────

export function isAtLeast(role: UserRole, minimum: UserRole): boolean {
  const hierarchy: UserRole[] = [
    'API_CONNECTOR',
    'READ_ONLY',
    'SECURITY_ANALYST',
    'TENANT_ADMIN',
    'PLATFORM_ADMIN',
  ]
  return hierarchy.indexOf(role) >= hierarchy.indexOf(minimum)
}

export function canAccessTenant(
  actorRole: UserRole,
  actorTenantId: string,
  targetTenantId: string,
): boolean {
  if (actorRole === 'PLATFORM_ADMIN') return true
  return actorTenantId === targetTenantId
}

// ── Custom errors ─────────────────────────────

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}
