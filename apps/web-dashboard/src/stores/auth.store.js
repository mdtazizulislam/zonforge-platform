import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tokenStorage } from '@/lib/api';
export const useAuthStore = create()(persist((set) => ({
    user: null,
    isLoggedIn: false,
    setUser: (user) => set({ user, isLoggedIn: true }),
    clearAuth: () => {
        tokenStorage.clear();
        set({ user: null, isLoggedIn: false });
    },
}), {
    name: 'zf-auth',
    partialize: (state) => ({ user: state.user, isLoggedIn: state.isLoggedIn }),
}));
function resolveTheme(theme) {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
}
function applyTheme(resolved) {
    const root = document.documentElement;
    if (resolved === 'dark') {
        root.classList.add('dark');
    }
    else {
        root.classList.remove('dark');
    }
}
export const useThemeStore = create()(persist((set) => ({
    theme: 'dark',
    resolved: 'dark',
    setTheme: (theme) => {
        const resolved = resolveTheme(theme);
        applyTheme(resolved);
        set({ theme, resolved });
    },
}), {
    name: 'zf-theme',
    partialize: (s) => ({ theme: s.theme }),
    onRehydrateStorage: () => (state) => {
        if (state) {
            const resolved = resolveTheme(state.theme);
            applyTheme(resolved);
            state.resolved = resolved;
        }
    },
}));
export const useUiStore = create()(persist((set) => ({
    sidebarCollapsed: false,
    toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    selectedTenantId: null,
    setSelectedTenant: (id) => set({ selectedTenantId: id }),
    alertFilters: { severity: [], status: ['open', 'investigating'], priority: [] },
    setAlertFilter: (key, values) => set(s => ({ alertFilters: { ...s.alertFilters, [key]: values } })),
    clearAlertFilters: () => set({ alertFilters: { severity: [], status: ['open', 'investigating'], priority: [] } }),
}), {
    name: 'zf-ui',
    partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, alertFilters: s.alertFilters }),
}));
