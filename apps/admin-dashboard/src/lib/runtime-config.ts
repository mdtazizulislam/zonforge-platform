function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveAdminAppUrl(): string {
  const configured = import.meta.env.VITE_ADMIN_APP_URL
  if (configured) return trimTrailingSlash(configured)
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function resolveAdminApiBaseUrl(): string {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
  return trimTrailingSlash(API_BASE) || '/api'
}

export function resolveAdminAuthCallbackUrl(): string {
  return import.meta.env.VITE_AUTH_CALLBACK_URL || resolveAdminAppUrl() || '/'
}

export function resolveAdminLogoutRedirectUrl(): string {
  return import.meta.env.VITE_LOGOUT_REDIRECT_URL || resolveAdminAuthCallbackUrl()
}

export function resolveAdminSessionValidationUrl(): string {
  return `${resolveAdminApiBaseUrl()}/v1/auth/me`
}