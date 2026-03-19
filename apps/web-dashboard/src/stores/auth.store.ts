import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { tokenStorage, type CurrentUser } from '@/lib/api'

// ─────────────────────────────────────────────
// AUTH STORE
// ─────────────────────────────────────────────

interface AuthState {
  user:        CurrentUser | null
  isLoggedIn:  boolean
  setUser:     (user: CurrentUser) => void
  clearAuth:   () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:       null,
      isLoggedIn: false,
      setUser:    (user) => set({ user, isLoggedIn: true }),
      clearAuth:  () => {
        tokenStorage.clear()
        set({ user: null, isLoggedIn: false })
      },
    }),
    {
      name:    'zf-auth',
      partialize: (state) => ({ user: state.user, isLoggedIn: state.isLoggedIn }),
    },
  ),
)

// ─────────────────────────────────────────────
// THEME STORE
// ─────────────────────────────────────────────

type Theme = 'dark' | 'light' | 'system'

interface ThemeState {
  theme:     Theme
  resolved:  'dark' | 'light'
  setTheme:  (theme: Theme) => void
}

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function applyTheme(resolved: 'dark' | 'light') {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme:    'dark',
      resolved: 'dark',
      setTheme: (theme) => {
        const resolved = resolveTheme(theme)
        applyTheme(resolved)
        set({ theme, resolved })
      },
    }),
    {
      name:    'zf-theme',
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = resolveTheme(state.theme)
          applyTheme(resolved)
          state.resolved = resolved
        }
      },
    },
  ),
)

// ─────────────────────────────────────────────
// UI STATE STORE
// ─────────────────────────────────────────────

interface UiState {
  sidebarCollapsed: boolean
  toggleSidebar:    () => void
  selectedTenantId: string | null
  setSelectedTenant:(id: string) => void
  // Alert filters
  alertFilters: {
    severity:   string[]
    status:     string[]
    priority:   string[]
  }
  setAlertFilter: (key: 'severity' | 'status' | 'priority', values: string[]) => void
  clearAlertFilters: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed:  false,
      toggleSidebar:     () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      selectedTenantId:  null,
      setSelectedTenant: (id) => set({ selectedTenantId: id }),
      alertFilters: { severity: [], status: ['open', 'investigating'], priority: [] },
      setAlertFilter: (key, values) =>
        set(s => ({ alertFilters: { ...s.alertFilters, [key]: values } })),
      clearAlertFilters: () =>
        set({ alertFilters: { severity: [], status: ['open', 'investigating'], priority: [] } }),
    }),
    {
      name:       'zf-ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, alertFilters: s.alertFilters }),
    },
  ),
)
