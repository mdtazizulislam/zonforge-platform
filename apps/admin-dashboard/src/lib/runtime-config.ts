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
  return trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || '/api') || '/api'
}