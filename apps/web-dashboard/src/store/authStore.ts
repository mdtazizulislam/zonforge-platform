import { useAuthStore as useCoreAuthStore } from '@/stores/auth.store'
import { tokenStorage, type CurrentUser } from '@/lib/api'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'SECURITY_ANALYST' | 'READ_ONLY' | 'API_CONNECTOR'
  tenant_id: string | null
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setAuth: (user: AuthUser, token: string) => void
  clearAuth: () => void
  setLoading: (v: boolean) => void
}

function normalizeRole(role?: string | null): AuthUser['role'] {
  const value = String(role ?? '').trim().toLowerCase().replace(/\s+/g, '_')

  if (['super_admin', 'superadmin', 'platform_admin', 'mssp_admin'].includes(value)) return 'SUPER_ADMIN'
  if (['tenant_admin', 'tenantadmin', 'admin', 'owner'].includes(value)) return 'TENANT_ADMIN'
  if (['security_analyst', 'securityanalyst', 'analyst'].includes(value)) return 'SECURITY_ANALYST'
  if (['api_connector', 'api'].includes(value)) return 'API_CONNECTOR'
  return 'READ_ONLY'
}

function toCompatUser(user: CurrentUser | null): AuthUser | null {
  if (!user) return null

  return {
    id: String(user.id ?? user.email ?? ''),
    name: String(user.fullName ?? user.name ?? user.email ?? 'User'),
    email: String(user.email ?? ''),
    role: normalizeRole(user.membership?.role ?? user.role),
    tenant_id: user.tenant?.id ? String(user.tenant.id) : null,
  }
}

function toCurrentUser(user: AuthUser): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    fullName: user.name,
    role: user.role,
    membership: { role: user.role },
    tenant: user.tenant_id ? { id: user.tenant_id } : undefined,
  }
}

export function useAuthStore<T = AuthState>(selector?: (state: AuthState) => T): T {
  return useCoreAuthStore((coreState) => {
    const compatState: AuthState = {
      user: toCompatUser(coreState.user),
      accessToken: tokenStorage.get(),
      isAuthenticated: coreState.isLoggedIn,
      isLoading: !coreState.hasHydrated,
      setAuth: (user, token) => {
        if (token) tokenStorage.set(token)
        coreState.setUser(toCurrentUser(user))
      },
      clearAuth: coreState.clearAuth,
      setLoading: () => undefined,
    }

    return selector ? selector(compatState) : (compatState as T)
  })
}

export async function initAuth() {
  return undefined
}
