function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api'
  return trimTrailingSlash(configured) || '/api'
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