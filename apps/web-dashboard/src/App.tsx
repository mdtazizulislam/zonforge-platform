import { createBrowserRouter, RouterProvider, Navigate, useLocation, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'
import CustomerLayout from '@/layouts/CustomerLayout'
import AdminLayout from '@/layouts/AdminLayout'
import SuperAdminLayout from '@/layouts/SuperAdminLayout'
import { APP_ROOT_ROUTE, DEFAULT_AUTHENTICATED_ROUTE, FORBIDDEN_ROUTE, NOT_FOUND_ROUTE, ONBOARDING_ROUTE, resolvePostLoginRedirect, resolveProtectedRouteRedirect } from '@/lib/auth-routing'
import { useAuthStore } from '@/stores/auth.store'

// ─────────────────────────────────────────────
// LAZY PAGES — code-split per route
// ─────────────────────────────────────────────

const LoginPage         = lazy(() => import('@/pages/LoginPage'))
const SignupPage        = lazy(() => import('@/pages/SignupPage'))
const InviteAcceptPage  = lazy(() => import('@/pages/InviteAcceptPage'))
const OnboardingPage    = lazy(() => import('@/pages/OnboardingPage'))
const CustomerDashboardPage = lazy(() => import('@/pages/CustomerDashboardPage'))
const CustomerAlertsPage = lazy(() => import('@/pages/customer/CustomerAlertsPage'))
const CustomerInvestigationsPage = lazy(() => import('@/pages/customer/CustomerInvestigationsPage'))
const CustomerAiAssistantPage = lazy(() => import('@/pages/customer/CustomerAiAssistantPage'))
const CustomerSettingsPage = lazy(() => import('@/pages/customer/CustomerSettingsPage'))
const UserRiskListPage = lazy(() => import('@/pages/customer/UserRiskList'))
const UserRiskProfilePage = lazy(() => import('@/pages/customer/UserRiskProfile'))
const AssetInventoryPage = lazy(() => import('@/pages/customer/AssetInventory'))
const VulnerabilityCorrelationPage = lazy(() => import('@/pages/customer/VulnerabilityCorrelation'))
const ExecutiveReportsPage = lazy(() => import('@/pages/customer/ExecutiveReports'))
const IncidentTimelinePage = lazy(() => import('@/pages/customer/IncidentTimeline'))
const CompliancePosturePage = lazy(() => import('@/pages/customer/CompliancePosture'))
const AdminOverviewPage = lazy(() => import('@/pages/admin/AdminOverview'))
const UserManagementPage = lazy(() => import('@/pages/admin/UserManagement'))
const ConnectorManagementPage = lazy(() => import('@/pages/admin/ConnectorManagement'))
const ConnectorHealthPage = lazy(() => import('@/pages/admin/ConnectorHealth'))
const AlertTuningPage = lazy(() => import('@/pages/admin/AlertTuning'))
const DetectionRulesPage = lazy(() => import('@/pages/admin/DetectionRules'))
const TenantSettingsPage = lazy(() => import('@/pages/admin/TenantSettings'))
const AdminBillingPage = lazy(() => import('@/pages/admin/BillingPage'))
const AdminAuditLogPage = lazy(() => import('@/pages/admin/AuditLog'))
const MaintenanceWindowsPage = lazy(() => import('@/pages/admin/MaintenanceWindows'))
const SSOConfigurationPage = lazy(() => import('@/pages/admin/SSOConfiguration'))
const ThreatIntelFeedPage = lazy(() => import('@/pages/admin/ThreatIntelFeed'))
const APIKeyManagementPage = lazy(() => import('@/pages/admin/APIKeyManagement'))
const UserAccessReviewPage = lazy(() => import('@/pages/admin/UserAccessReview'))
const WebhookManagementPage = lazy(() => import('@/pages/admin/WebhookManagement'))
const PlatformOverviewPage = lazy(() => import('@/pages/superadmin/PlatformOverview'))
const TenantListPage = lazy(() => import('@/pages/superadmin/TenantList'))
const SystemHealthPage = lazy(() => import('@/pages/superadmin/SystemHealth'))
const BillingDashboardPage = lazy(() => import('@/pages/superadmin/BillingDashboard'))
const GlobalRuleLibraryPage = lazy(() => import('@/pages/superadmin/GlobalRuleLibrary'))
const ThreatIntelManagementPage = lazy(() => import('@/pages/superadmin/ThreatIntelManagement'))
const MSSPConsolePage = lazy(() => import('@/pages/superadmin/MSSPConsole'))
const SLAMonitoringPage = lazy(() => import('@/pages/superadmin/SLAMonitoring'))
const CapacityPlanningPage = lazy(() => import('@/pages/superadmin/CapacityPlanning'))
const DetectionPerformancePage = lazy(() => import('@/pages/superadmin/DetectionPerformance'))
const TenantHealthScoringPage = lazy(() => import('@/pages/superadmin/TenantHealthScoring'))
const TenantImpersonationPage = lazy(() => import('@/pages/superadmin/TenantImpersonation'))
const WarRoomPage = lazy(() => import('@/pages/superadmin/WarRoom'))
const WhiteLabelPage = lazy(() => import('@/pages/superadmin/WhiteLabel'))
const ConnectorsPage    = lazy(() => import('@/pages/ConnectorsPage'))
const BillingPage       = lazy(() => import('@/pages/BillingPage'))

// ─────────────────────────────────────────────
// AUTH GUARD
// ─────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const user = useAuthStore(s => s.user)

  if (!hasHydrated) {
    return <PageLoader />
  }

  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location }} />

  const redirectPath = resolveProtectedRouteRedirect({
    pathname: location.pathname,
    subject: user,
  })

  if (redirectPath && redirectPath !== location.pathname) {
    return (
      <Navigate
        to={redirectPath}
        replace
        state={redirectPath === ONBOARDING_ROUTE ? { from: location } : undefined}
      />
    )
  }

  return <>{children}</>
}

function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const hasHydrated = useAuthStore(s => s.hasHydrated)
  const user = useAuthStore(s => s.user)

  if (!hasHydrated) {
    return <PageLoader />
  }

  if (isLoggedIn) {
    return <Navigate to={resolvePostLoginRedirect({ subject: user })} replace />
  }

  return <>{children}</>
}

function RoleHomeRedirect() {
  const user = useAuthStore(s => s.user)
  return <Navigate to={resolvePostLoginRedirect({ subject: user })} replace />
}

// ─────────────────────────────────────────────
// LOADING FALLBACK
// ─────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <span className="text-sm text-gray-500">Loading…</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// QUERY CLIENT
// ─────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            30_000,        // 30 seconds
      gcTime:               5 * 60_000,    // 5 minutes
      retry:                2,
      refetchOnWindowFocus: true,
      refetchInterval:      false,
    },
    mutations: {
      retry: 0,
    },
  },
})

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────

const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RedirectIfAuthenticated>
        <Suspense fallback={<PageLoader />}>
          <LoginPage />
        </Suspense>
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/signup',
    element: (
      <RedirectIfAuthenticated>
        <Suspense fallback={<PageLoader />}>
          <SignupPage />
        </Suspense>
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/invite/accept',
    element: (
      <RedirectIfAuthenticated>
        <Suspense fallback={<PageLoader />}>
          <InviteAcceptPage />
        </Suspense>
      </RedirectIfAuthenticated>
    ),
  },
  {
    path: '/onboarding',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <OnboardingPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: APP_ROOT_ROUTE,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/dashboard`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/customer-dashboard`} replace /></RequireAuth>,
  },

  {
    path: '/',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerLayout />
        </Suspense>
      </RequireAuth>
    ),
    children: [
      {
        path: `${APP_ROOT_ROUTE}/customer-dashboard`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <CustomerDashboardPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/customer-alerts`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <CustomerAlertsPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/customer-investigations`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <CustomerInvestigationsPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/customer-ai-assistant`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <CustomerAiAssistantPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/billing`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <BillingPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/customer-settings`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <CustomerSettingsPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/customer-settings/team`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <CustomerSettingsPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/risk/users`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <UserRiskListPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/risk/users/:id`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <UserRiskProfilePage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/risk/assets`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <AssetInventoryPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/risk/vulnerabilities`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <VulnerabilityCorrelationPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/reports`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <ExecutiveReportsPage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/incidents/timeline`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <IncidentTimelinePage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/compliance-posture`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <CompliancePosturePage />
          </Suspense>
        ),
      },
      {
        path: `${APP_ROOT_ROUTE}/connectors`,
        element: (
          <Suspense fallback={<PageLoader />}>
            <ConnectorsPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: `${APP_ROOT_ROUTE}/admin`,
    element: <RequireAuth><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <Suspense fallback={<PageLoader />}><AdminOverviewPage /></Suspense> },
      { path: 'users', element: <Suspense fallback={<PageLoader />}><UserManagementPage /></Suspense> },
      { path: 'connectors', element: <Suspense fallback={<PageLoader />}><ConnectorManagementPage /></Suspense> },
      { path: 'connectors/health', element: <Suspense fallback={<PageLoader />}><ConnectorHealthPage /></Suspense> },
      { path: 'rules', element: <Suspense fallback={<PageLoader />}><AlertTuningPage /></Suspense> },
      { path: 'rules/detection', element: <Suspense fallback={<PageLoader />}><DetectionRulesPage /></Suspense> },
      { path: 'settings', element: <Suspense fallback={<PageLoader />}><TenantSettingsPage /></Suspense> },
      { path: 'billing', element: <Suspense fallback={<PageLoader />}><AdminBillingPage /></Suspense> },
      { path: 'audit', element: <Suspense fallback={<PageLoader />}><AdminAuditLogPage /></Suspense> },
      { path: 'maintenance', element: <Suspense fallback={<PageLoader />}><MaintenanceWindowsPage /></Suspense> },
      { path: 'sso', element: <Suspense fallback={<PageLoader />}><SSOConfigurationPage /></Suspense> },
      { path: 'threat-intel', element: <Suspense fallback={<PageLoader />}><ThreatIntelFeedPage /></Suspense> },
      { path: 'api-keys', element: <Suspense fallback={<PageLoader />}><APIKeyManagementPage /></Suspense> },
      { path: 'access-review', element: <Suspense fallback={<PageLoader />}><UserAccessReviewPage /></Suspense> },
      { path: 'webhooks', element: <Suspense fallback={<PageLoader />}><WebhookManagementPage /></Suspense> },
    ],
  },
  {
    path: `${APP_ROOT_ROUTE}/superadmin`,
    element: <RequireAuth><SuperAdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <Suspense fallback={<PageLoader />}><PlatformOverviewPage /></Suspense> },
      { path: 'tenants', element: <Suspense fallback={<PageLoader />}><TenantListPage /></Suspense> },
      { path: 'tenants/:id', element: <Suspense fallback={<PageLoader />}><TenantHealthScoringPage /></Suspense> },
      { path: 'tenants/:id/impersonate', element: <Suspense fallback={<PageLoader />}><TenantImpersonationPage /></Suspense> },
      { path: 'billing', element: <Suspense fallback={<PageLoader />}><BillingDashboardPage /></Suspense> },
      { path: 'mssp', element: <Suspense fallback={<PageLoader />}><MSSPConsolePage /></Suspense> },
      { path: 'rules', element: <Suspense fallback={<PageLoader />}><GlobalRuleLibraryPage /></Suspense> },
      { path: 'threat-intel', element: <Suspense fallback={<PageLoader />}><ThreatIntelManagementPage /></Suspense> },
      { path: 'system', element: <Suspense fallback={<PageLoader />}><SystemHealthPage /></Suspense> },
      { path: 'sla', element: <Suspense fallback={<PageLoader />}><SLAMonitoringPage /></Suspense> },
      { path: 'capacity', element: <Suspense fallback={<PageLoader />}><CapacityPlanningPage /></Suspense> },
      { path: 'detection-performance', element: <Suspense fallback={<PageLoader />}><DetectionPerformancePage /></Suspense> },
      { path: 'war-room', element: <Suspense fallback={<PageLoader />}><WarRoomPage /></Suspense> },
      { path: 'white-label', element: <Suspense fallback={<PageLoader />}><WhiteLabelPage /></Suspense> },
    ],
  },
  {
    path: `${APP_ROOT_ROUTE}/alerts`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/customer-alerts`} replace /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/alerts/:id`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/customer-alerts`} replace /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/risk`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/risk/users`} replace /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/settings`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/customer-settings`} replace /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/compliance`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/compliance-posture`} replace /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/ai-assistant`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/customer-ai-assistant`} replace /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/investigations`,
    element: <RequireAuth><Navigate to={`${APP_ROOT_ROUTE}/customer-investigations`} replace /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/events`,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/playbooks`,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/audit`,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  { path: `${APP_ROOT_ROUTE}/enterprise-sales`, element: <RequireAuth><RoleHomeRedirect /></RequireAuth> },
  { path: `${APP_ROOT_ROUTE}/enterprise-setup`, element: <RequireAuth><RoleHomeRedirect /></RequireAuth> },
  { path: `${APP_ROOT_ROUTE}/ai-intelligence`, element: <RequireAuth><RoleHomeRedirect /></RequireAuth> },
  { path: `${APP_ROOT_ROUTE}/ai-capabilities`, element: <RequireAuth><RoleHomeRedirect /></RequireAuth> },
  { path: `${APP_ROOT_ROUTE}/enterprise`, element: <RequireAuth><RoleHomeRedirect /></RequireAuth> },
  { path: `${APP_ROOT_ROUTE}/supply-chain`, element: <RequireAuth><RoleHomeRedirect /></RequireAuth> },
  { path: `${APP_ROOT_ROUTE}/ai-soc-analyst`, element: <RequireAuth><RoleHomeRedirect /></RequireAuth> },
  {
    path: `${APP_ROOT_ROUTE}/security-validation`,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/compliance-reports`,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/threat-hunting`,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: `${APP_ROOT_ROUTE}/mssp`,
    element: <RequireAuth><RoleHomeRedirect /></RequireAuth>,
  },
  {
    path: FORBIDDEN_ROUTE,
    element: (
      <RequireAuth>
        <div className="flex h-screen items-center justify-center bg-gray-950">
          <div className="text-center">
            <p className="text-7xl font-bold text-gray-700">403</p>
            <p className="mt-4 text-gray-400">You do not have permission to access this route.</p>
            <Link to={DEFAULT_AUTHENTICATED_ROUTE} className="mt-6 inline-block text-blue-400 hover:underline">
              ← Back to workspace
            </Link>
          </div>
        </div>
      </RequireAuth>
    ),
  },
  {
    path: NOT_FOUND_ROUTE,
    element: (
      <RequireAuth>
        <div className="flex h-screen items-center justify-center bg-gray-950">
          <div className="text-center">
            <p className="text-7xl font-bold text-gray-700">404</p>
            <p className="mt-4 text-gray-400">Page not found</p>
            <Link to={DEFAULT_AUTHENTICATED_ROUTE} className="mt-6 inline-block text-blue-400 hover:underline">
              ← Back to workspace
            </Link>
          </div>
        </div>
      </RequireAuth>
    ),
  },
  {
    path: '*',
    element: <RequireAuth><Navigate to={NOT_FOUND_ROUTE} replace /></RequireAuth>,
  },
])

// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export { queryClient }
