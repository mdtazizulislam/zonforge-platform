import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTHENTICATED_ROUTE,
  ONBOARDING_ROUTE,
  isOnboardingComplete,
  resolvePostLoginRedirect,
  resolveProtectedRouteRedirect,
  resolveRoleHomeRoute,
} from './auth-routing'

describe('auth routing', () => {
  it('routes incomplete tenants to onboarding after login', () => {
    expect(resolvePostLoginRedirect({
      requestedPath: '/billing',
      subject: { onboardingStatus: 'pending' },
    })).toBe(ONBOARDING_ROUTE)
  })

  it('routes completed tenants to the requested app path after login', () => {
    expect(resolvePostLoginRedirect({
      requestedPath: '/app/billing',
      subject: { onboardingStatus: 'completed' },
    })).toBe('/app/billing')
  })

  it('keeps completed tenants away from onboarding after login', () => {
    expect(resolvePostLoginRedirect({
      requestedPath: '/onboarding',
      subject: { onboardingStatus: 'completed' },
    })).toBe(DEFAULT_AUTHENTICATED_ROUTE)
  })

  it('uses onboardingCompletedAt as a fallback completion signal', () => {
    expect(isOnboardingComplete({
      onboardingStatus: undefined,
      tenant: {
        onboardingStatus: 'pending',
        onboardingCompletedAt: '2026-04-10T12:00:00.000Z',
      },
    })).toBe(true)
  })

  it('routes each role to the required unified home', () => {
    expect(resolveRoleHomeRoute({ role: 'SUPER_ADMIN' })).toBe('/app/superadmin')
    expect(resolveRoleHomeRoute({ role: 'TENANT_ADMIN' })).toBe('/app/admin')
    expect(resolveRoleHomeRoute({ role: 'SECURITY_ANALYST' })).toBe('/app/customer-dashboard')
    expect(resolveRoleHomeRoute({ role: 'viewer' })).toBe('/app/customer-dashboard')
    expect(resolveRoleHomeRoute({ role: 'analyst' })).toBe('/app/customer-dashboard')
  })

  it('treats users with an assigned role as ready for dashboard access unless onboarding is explicitly pending', () => {
    expect(resolvePostLoginRedirect({
      subject: { role: 'SECURITY_ANALYST', onboardingStatus: undefined },
    })).toBe('/app/customer-dashboard')

    expect(resolvePostLoginRedirect({
      subject: { role: 'TENANT_ADMIN', onboardingStatus: undefined },
    })).toBe('/app/admin')

    expect(resolveProtectedRouteRedirect({
      pathname: '/onboarding',
      subject: { role: 'SUPER_ADMIN', onboardingStatus: undefined },
    })).toBe('/app/superadmin')
  })

  it('redirects incomplete tenants away from protected app routes', () => {
    expect(resolveProtectedRouteRedirect({
      pathname: '/app/billing',
      subject: { onboardingStatus: 'pending' },
    })).toBe(ONBOARDING_ROUTE)
  })

  it('allows incomplete tenants to remain on onboarding without looping', () => {
    expect(resolveProtectedRouteRedirect({
      pathname: '/onboarding',
      subject: { onboardingStatus: 'pending' },
    })).toBeNull()
  })

  it('redirects completed tenants away from onboarding without touching app routes', () => {
    expect(resolveProtectedRouteRedirect({
      pathname: '/onboarding',
      subject: { onboardingStatus: 'completed' },
    })).toBe(DEFAULT_AUTHENTICATED_ROUTE)

    expect(resolveProtectedRouteRedirect({
      pathname: '/app/billing',
      subject: { onboardingStatus: 'completed' },
    })).toBeNull()
  })
})