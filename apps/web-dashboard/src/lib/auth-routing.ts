import type { CurrentUser, MembershipContext, TenantContext } from '@/lib/api'

export const APP_ROOT_ROUTE = '/app'
export const CUSTOMER_DASHBOARD_ROUTE = `${APP_ROOT_ROUTE}/customer-dashboard`
export const DASHBOARD_ROUTE = `${APP_ROOT_ROUTE}/dashboard`
export const ADMIN_ROUTE = `${APP_ROOT_ROUTE}/admin`
export const SUPER_ADMIN_ROUTE = `${APP_ROOT_ROUTE}/superadmin`
export const BILLING_ROUTE = `${APP_ROOT_ROUTE}/billing`
export const FORBIDDEN_ROUTE = `${APP_ROOT_ROUTE}/403`
export const NOT_FOUND_ROUTE = `${APP_ROOT_ROUTE}/404`
export const DEFAULT_AUTHENTICATED_ROUTE = CUSTOMER_DASHBOARD_ROUTE
export const ONBOARDING_ROUTE = '/onboarding'

const PUBLIC_AUTH_ROUTES = new Set([
  '/login',
  '/signup',
  '/invite/accept',
])

const LEGACY_INTERNAL_PREFIXES = [
  '/dashboard',
  '/customer-dashboard',
  '/customer-alerts',
  '/customer-investigations',
  '/customer-ai-assistant',
  '/customer-billing',
  '/customer-settings',
  '/risk',
  '/reports',
  '/incidents',
  '/compliance-posture',
  '/connectors',
  '/admin',
  '/superadmin',
  '/alerts',
  '/events',
  '/compliance',
  '/playbooks',
  '/audit',
  '/settings',
  '/billing',
  '/mssp',
  '/security-validation',
  '/compliance-reports',
  '/threat-hunting',
  '/ai-soc-analyst',
  '/ai-assistant',
  '/investigations',
  '/ai-intelligence',
  '/ai-capabilities',
  '/enterprise',
  '/enterprise-sales',
  '/enterprise-setup',
  '/supply-chain',
  '/403',
  '/404',
]

type RoleContext = Pick<MembershipContext, 'role'> | {
  role?: string | null
} | null | undefined

type OnboardingSubject = Pick<CurrentUser, 'onboardingStatus' | 'tenant' | 'role' | 'membership'> | {
  onboardingStatus?: string | null
  tenant?: Pick<TenantContext, 'onboardingStatus' | 'onboardingCompletedAt'> | null
  role?: string | null
  membership?: RoleContext
} | null | undefined

type CanonicalRole = 'super_admin' | 'tenant_admin' | 'security_analyst' | 'read_only' | 'unknown'

function canonicalizeInternalPath(pathname: string): string {
  if (pathname === APP_ROOT_ROUTE || pathname === `${APP_ROOT_ROUTE}/`) {
    return DEFAULT_AUTHENTICATED_ROUTE
  }

  if (pathname.startsWith(`${APP_ROOT_ROUTE}/`)) {
    return pathname
  }

  const isLegacyInternalRoute = LEGACY_INTERNAL_PREFIXES.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))

  return isLegacyInternalRoute ? `${APP_ROOT_ROUTE}${pathname}` : pathname
}

function normalizeInternalPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return null
  }

  const pathname = path.split(/[?#]/, 1)[0] ?? path
  if (PUBLIC_AUTH_ROUTES.has(pathname)) {
    return null
  }

  return canonicalizeInternalPath(pathname)
}

function normalizeRole(role: string | null | undefined): CanonicalRole {
  const normalized = String(role ?? '').trim().toLowerCase().replace(/\s+/g, '_')

  if (['super_admin', 'super-admin', 'superadmin', 'platform_admin', 'platform-admin', 'mssp_admin', 'mssp-admin'].includes(normalized)) {
    return 'super_admin'
  }

  if (['tenant_admin', 'tenant-admin', 'tenantadmin', 'owner', 'admin'].includes(normalized)) {
    return 'tenant_admin'
  }

  if (['security_analyst', 'security-analyst', 'securityanalyst', 'analyst'].includes(normalized)) {
    return 'security_analyst'
  }

  if (['read_only', 'read-only', 'readonly', 'viewer'].includes(normalized)) {
    return 'read_only'
  }

  return 'unknown'
}

function resolveSubjectRole(subject: OnboardingSubject): CanonicalRole {
  return normalizeRole(subject?.membership?.role ?? subject?.role)
}

function hasAssignedRole(subject: OnboardingSubject): boolean {
  const role = subject?.membership?.role ?? subject?.role
  return typeof role === 'string' && role.trim().length > 0
}

function isExplicitlyPending(subject: OnboardingSubject): boolean {
  const onboardingStatus = subject?.onboardingStatus ?? subject?.tenant?.onboardingStatus ?? null
  return typeof onboardingStatus === 'string' && onboardingStatus.trim().toLowerCase() === 'pending'
}

function resolveRestrictedRouteRedirect(pathname: string, subject: OnboardingSubject): string | null {
  const role = resolveSubjectRole(subject)

  if (pathname === FORBIDDEN_ROUTE || pathname === NOT_FOUND_ROUTE) {
    return null
  }

  if (pathname === SUPER_ADMIN_ROUTE || pathname.startsWith(`${SUPER_ADMIN_ROUTE}/`) || pathname === '/mssp') {
    return role === 'super_admin' ? null : FORBIDDEN_ROUTE
  }

  if (pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`)) {
    if (role === 'super_admin') {
      return SUPER_ADMIN_ROUTE
    }

    return role === 'tenant_admin' ? null : FORBIDDEN_ROUTE
  }

  return null
}

export function resolveRoleHomeRoute(subject: OnboardingSubject): string {
  switch (resolveSubjectRole(subject)) {
    case 'super_admin':
      return SUPER_ADMIN_ROUTE
    case 'tenant_admin':
      return ADMIN_ROUTE
    case 'security_analyst':
    case 'read_only':
    case 'unknown':
    default:
      return CUSTOMER_DASHBOARD_ROUTE
  }
}

export function isOnboardingComplete(subject: OnboardingSubject): boolean {
  const onboardingStatus = subject?.onboardingStatus ?? subject?.tenant?.onboardingStatus ?? null
  if (typeof onboardingStatus === 'string' && onboardingStatus.trim().toLowerCase() === 'completed') {
    return true
  }

  if (subject?.tenant?.onboardingCompletedAt) {
    return true
  }

  return hasAssignedRole(subject)
}

export function resolvePostLoginRedirect(options: {
  requestedPath?: string | null
  subject: OnboardingSubject
  defaultPath?: string
}): string {
  const defaultPath = options.defaultPath ?? resolveRoleHomeRoute(options.subject)

  if (isExplicitlyPending(options.subject) && !isOnboardingComplete(options.subject)) {
    return ONBOARDING_ROUTE
  }

  const requestedPath = normalizeInternalPath(options.requestedPath)
  const restrictedRouteRedirect = requestedPath
    ? resolveRestrictedRouteRedirect(requestedPath, options.subject)
    : null

  if (restrictedRouteRedirect) {
    return restrictedRouteRedirect
  }

  if (!requestedPath || requestedPath === ONBOARDING_ROUTE) {
    return defaultPath
  }

  return requestedPath
}

export function resolveProtectedRouteRedirect(options: {
  pathname: string
  subject: OnboardingSubject
  defaultPath?: string
}): string | null {
  const defaultPath = options.defaultPath ?? resolveRoleHomeRoute(options.subject)
  const pathname = normalizeInternalPath(options.pathname) ?? options.pathname
  const restrictedRouteRedirect = resolveRestrictedRouteRedirect(pathname, options.subject)

  if (restrictedRouteRedirect) {
    return restrictedRouteRedirect
  }

  if (isOnboardingComplete(options.subject)) {
    return pathname === ONBOARDING_ROUTE ? defaultPath : null
  }

  return pathname === ONBOARDING_ROUTE ? null : ONBOARDING_ROUTE
}