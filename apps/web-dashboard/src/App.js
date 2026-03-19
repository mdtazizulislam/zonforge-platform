import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { useAuthStore } from '@/stores/auth.store';
// ─────────────────────────────────────────────
// LAZY PAGES — code-split per route
// ─────────────────────────────────────────────
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const AlertsPage = lazy(() => import('@/pages/AlertsPage'));
const AlertDetailPage = lazy(() => import('@/pages/AlertDetailPage'));
const RiskPage = lazy(() => import('@/pages/RiskPage'));
const ConnectorsPage = lazy(() => import('@/pages/ConnectorsPage'));
const CompliancePage = lazy(() => import('@/pages/CompliancePage'));
const PlaybooksPage = lazy(() => import('@/pages/PlaybooksPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const BillingPage = lazy(() => import('@/pages/BillingPage'));
const MsspPage = lazy(() => import('@/pages/MsspPage'));
const ThreatHuntingPage = lazy(() => import('@/pages/ThreatHuntingPage'));
const ComplianceReportsPage = lazy(() => import('@/pages/ComplianceReportsPage'));
const SecurityValidationPage = lazy(() => import('@/pages/SecurityValidationPage'));
const AiSocAnalystPage = lazy(() => import('@/pages/AiSocAnalystPage'));
const SupplyChainPage = lazy(() => import('@/pages/SupplyChainPage'));
const EnterpriseCapabilitiesPage = lazy(() => import('@/pages/EnterpriseCapabilitiesPage'));
const AiCapabilitiesPage = lazy(() => import('@/pages/AiCapabilitiesPage'));
const AiIntelligencePage = lazy(() => import('@/pages/AiIntelligencePage'));
const EnterpriseSetupPage = lazy(() => import('@/pages/EnterpriseSetupPage'));
const EnterpriseSalesPage = lazy(() => import('@/pages/EnterpriseSalesPage'));
// ─────────────────────────────────────────────
// AUTH GUARD
// ─────────────────────────────────────────────
function RequireAuth({ children }) {
    const isLoggedIn = useAuthStore(s => s.isLoggedIn);
    if (!isLoggedIn)
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(_Fragment, { children: children });
}
// ─────────────────────────────────────────────
// LOADING FALLBACK
// ─────────────────────────────────────────────
function PageLoader() {
    return (_jsx("div", { className: "flex h-screen items-center justify-center bg-gray-950", children: _jsxs("div", { className: "flex flex-col items-center gap-4", children: [_jsx("div", { className: "h-10 w-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" }), _jsx("span", { className: "text-sm text-gray-500", children: "Loading\u2026" })] }) }));
}
// ─────────────────────────────────────────────
// QUERY CLIENT
// ─────────────────────────────────────────────
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000, // 30 seconds
            gcTime: 5 * 60_000, // 5 minutes
            retry: 2,
            refetchOnWindowFocus: true,
            refetchInterval: false,
        },
        mutations: {
            retry: 0,
        },
    },
});
// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
const router = createBrowserRouter([
    {
        path: '/login',
        element: (_jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(LoginPage, {}) })),
    },
    {
        path: '/',
        element: _jsx(RequireAuth, { children: _jsx(Navigate, { to: "/dashboard", replace: true }) }),
    },
    {
        path: '/dashboard',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(DashboardPage, {}) }) })),
    },
    {
        // Both /alerts and /alerts/:id render the 3-pane center
        // The center panel shows "select an alert" when no id is in URL
        path: '/alerts',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AlertsPage, {}) }) })),
    },
    {
        path: '/alerts/:id',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AlertsPage, {}) }) })),
    },
    {
        path: '/risk',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(RiskPage, {}) }) })),
    },
    {
        path: '/connectors',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(ConnectorsPage, {}) }) })),
    },
    {
        path: '/compliance',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(CompliancePage, {}) }) })),
    },
    {
        path: '/playbooks',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(PlaybooksPage, {}) }) })),
    },
    {
        path: '/audit',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AuditLogPage, {}) }) })),
    },
    {
        path: '/settings',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(SettingsPage, {}) }) })),
    },
    { path: '/enterprise-sales', element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(EnterpriseSalesPage, {}) }) })) },
    { path: '/enterprise-setup', element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(EnterpriseSetupPage, {}) }) })) },
    { path: '/ai-intelligence', element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AiIntelligencePage, {}) }) })) },
    { path: '/ai-capabilities', element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AiCapabilitiesPage, {}) }) })) },
    { path: '/enterprise', element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(EnterpriseCapabilitiesPage, {}) }) })) },
    { path: '/supply-chain', element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(SupplyChainPage, {}) }) })) },
    { path: '/ai-soc-analyst',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(AiSocAnalystPage, {}) }) })),
    },
    {
        path: '/security-validation',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(SecurityValidationPage, {}) }) })),
    },
    {
        path: '/compliance-reports',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(ComplianceReportsPage, {}) }) })),
    },
    {
        path: '/threat-hunting',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(ThreatHuntingPage, {}) }) })),
    },
    {
        path: '/mssp',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(MsspPage, {}) }) })),
    },
    {
        path: '/billing',
        element: (_jsx(RequireAuth, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(BillingPage, {}) }) })),
    },
    {
        path: '*',
        element: (_jsx(RequireAuth, { children: _jsx("div", { className: "flex h-screen items-center justify-center bg-gray-950", children: _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-7xl font-bold text-gray-700", children: "404" }), _jsx("p", { className: "mt-4 text-gray-400", children: "Page not found" }), _jsx("a", { href: "/dashboard", className: "mt-6 inline-block text-blue-400 hover:underline", children: "\u2190 Back to dashboard" })] }) }) })),
    },
]);
// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────
export function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(RouterProvider, { router: router }) }));
}
export { queryClient };
