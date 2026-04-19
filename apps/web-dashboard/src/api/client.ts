import { resolveApiBaseUrl } from '@/lib/runtime-config'
import { tokenStorage } from '@/lib/api'

type RequestConfig = {
  headers?: Record<string, string>
}

const BASE_URL = resolveApiBaseUrl()

function isLocalProofMode() {
  return typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && tokenStorage.get() === 'proof-token'
}

function getLocalProofClientResponse(path: string): unknown | undefined {
  if (!isLocalProofMode()) return undefined

  if (path === '/admin/overview') {
    return {
      user_count: 12,
      connector_count: 4,
      active_connectors: 3,
      alert_summary: { open: 17, critical: 3 },
      plan_usage: { identities_used: 87, limit: 200 },
      recent_audit: [
        { id: '1', actor_email: 'admin@acme.com', action: 'CONNECTOR_CREATED', target_type: 'connector', created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: '2', actor_email: 'admin@acme.com', action: 'USER_INVITED', target_type: 'user', created_at: new Date(Date.now() - 7200000).toISOString() },
        { id: '3', actor_email: 'john.smith@acme.com', action: 'ALERT_RESOLVED', target_type: 'alert', created_at: new Date(Date.now() - 14400000).toISOString() },
      ],
    }
  }

  if (path === '/superadmin/overview') {
    return {
      total_tenants: 47,
      active_tenants: 42,
      trial_tenants: 8,
      total_users: 1284,
      events_today: 2847293,
      alerts_today: 183,
      mrr: 38450,
      arr: 461400,
      new_this_month: 6,
      churn_rate: 2.1,
      pipeline_health: { ingestion_lag_ms: 340, detection_lag_ms: 1820, queue_depth: 142, error_rate: 0.003 },
      tenants_by_plan: [
        { plan: 'Starter', count: 18, color: '#3b82f6' },
        { plan: 'Growth', count: 14, color: '#0d9488' },
        { plan: 'Business', count: 11, color: '#8b5cf6' },
        { plan: 'Enterprise', count: 4, color: '#f59e0b' },
      ],
      recent_tenants: [
        { id: '1', name: 'Acme Corp', plan: 'Business', status: 'active', created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: '2', name: 'FinTech Labs', plan: 'Growth', status: 'trial', created_at: new Date(Date.now() - 172800000).toISOString() },
        { id: '3', name: 'HealthCo', plan: 'Starter', status: 'active', created_at: new Date(Date.now() - 259200000).toISOString() },
      ],
    }
  }

  if (path === '/auth/logout') {
    return { success: true }
  }

  return undefined
}

function normalizePath(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/v1/')) return `${BASE_URL}${path}`
  return `${BASE_URL}/v1${path.startsWith('/') ? path : `/${path}`}`
}

async function request(method: string, path: string, data?: unknown, config: RequestConfig = {}) {
  const proofResponse = getLocalProofClientResponse(path)
  if (proofResponse !== undefined) {
    return { data: proofResponse }
  }

  const headers: Record<string, string> = {
    ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(config.headers ?? {}),
  }

  const token = tokenStorage.get()
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(normalizePath(path), {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(
      String((payload as any)?.error?.message ?? (payload as any)?.message ?? `HTTP ${response.status}`),
    ) as Error & { response?: { status: number; data: unknown } }

    error.response = {
      status: response.status,
      data: payload,
    }

    throw error
  }

  return { data: payload }
}

export const apiClient = {
  get: (path: string, config?: RequestConfig) => request('GET', path, undefined, config),
  post: (path: string, data?: unknown, config?: RequestConfig) => request('POST', path, data, config),
  patch: (path: string, data?: unknown, config?: RequestConfig) => request('PATCH', path, data, config),
  put: (path: string, data?: unknown, config?: RequestConfig) => request('PUT', path, data, config),
  delete: (path: string, config?: RequestConfig) => request('DELETE', path, undefined, config),
}

export default apiClient
