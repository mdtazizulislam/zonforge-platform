function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveApiBaseUrl(): string {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
  return trimTrailingSlash(API_BASE) || '/api'
}

export function resolveAppOrigin(): string {
  const configured = import.meta.env.VITE_APP_URL
  if (configured) return trimTrailingSlash(configured)
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function buildAppUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const appOrigin = resolveAppOrigin()

  return appOrigin ? `${appOrigin}${normalizedPath}` : normalizedPath
}

export function resolveAuthCallbackUrl(): string {
  return import.meta.env.VITE_AUTH_CALLBACK_URL || buildAppUrl('/login')
}

export function resolveLogoutRedirectUrl(): string {
  return import.meta.env.VITE_LOGOUT_REDIRECT_URL || resolveAuthCallbackUrl()
}

export function resolveSessionValidationUrl(): string {
  return `${resolveApiBaseUrl()}/v1/auth/me`
}