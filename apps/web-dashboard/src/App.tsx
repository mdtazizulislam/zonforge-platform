import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'
import { useAuthStore } from '@/stores/auth.store'

// ─────────────────────────────────────────────
// LAZY PAGES — code-split per route
// ─────────────────────────────────────────────

const LoginPage         = lazy(() => import('@/pages/LoginPage'))
const SignupPage        = lazy(() => import('@/pages/SignupPage'))
const InviteAcceptPage  = lazy(() => import('@/pages/InviteAcceptPage'))
const OnboardingPage    = lazy(() => import('@/pages/OnboardingPage'))
const DashboardPage     = lazy(() => import('@/pages/DashboardPage'))
const CustomerDashboardPage = lazy(() => import('@/pages/CustomerDashboardPage'))
const CustomerAlertsPage = lazy(() => import('@/pages/customer/CustomerAlertsPage'))
const CustomerInvestigationsPage = lazy(() => import('@/pages/customer/CustomerInvestigationsPage'))
const CustomerAiAssistantPage = lazy(() => import('@/pages/customer/CustomerAiAssistantPage'))
const CustomerBillingPage = lazy(() => import('@/pages/customer/CustomerBillingPage'))
const CustomerSettingsPage = lazy(() => import('@/pages/customer/CustomerSettingsPage'))
const AlertsPage        = lazy(() => import('@/pages/AlertsPage'))
const AlertDetailPage   = lazy(() => import('@/pages/AlertDetailPage'))
const RiskPage          = lazy(() => import('@/pages/RiskPage'))
const ConnectorsPage    = lazy(() => import('@/pages/ConnectorsPage'))
const EventsPage        = lazy(() => import('@/pages/EventsPage'))
const CompliancePage    = lazy(() => import('@/pages/CompliancePage'))
const PlaybooksPage     = lazy(() => import('@/pages/PlaybooksPage'))
const AuditLogPage      = lazy(() => import('@/pages/AuditLogPage'))
const SettingsPage      = lazy(() => import('@/pages/SettingsPage'))
const BillingPage       = lazy(() => import('@/pages/BillingPage'))
const MsspPage          = lazy(() => import('@/pages/MsspPage'))
const ThreatHuntingPage    = lazy(() => import('@/pages/ThreatHuntingPage'))
const ComplianceReportsPage = lazy(() => import('@/pages/ComplianceReportsPage'))
const SecurityValidationPage = lazy(() => import('@/pages/SecurityValidationPage'))
const AiSocAnalystPage       = lazy(() => import('@/pages/AiSocAnalystPage'))
const SupplyChainPage        = lazy(() => import('@/pages/SupplyChainPage'))
const EnterpriseCapabilitiesPage = lazy(() => import('@/pages/EnterpriseCapabilitiesPage'))
const AiCapabilitiesPage          = lazy(() => import('@/pages/AiCapabilitiesPage'))
const AiIntelligencePage         = lazy(() => import('@/pages/AiIntelligencePage'))
const EnterpriseSetupPage        = lazy(() => import('@/pages/EnterpriseSetupPage'))
const EnterpriseSalesPage        = lazy(() => import('@/pages/EnterpriseSalesPage'))
const AiAssistantPage            = lazy(() => import('@/pages/AiAssistantPage'))
const InvestigationsPage         = lazy(() => import('@/pages/InvestigationsPage'))

// ─────────────────────────────────────────────
// AUTH GUARD
// ─────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  const hasHydrated = useAuthStore(s => s.hasHydrated)

  if (!hasHydrated) {
    return <PageLoader />
  }

  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
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
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/signup',
    element: (
      <Suspense fallback={<PageLoader />}>
        <SignupPage />
      </Suspense>
    ),
  },
  {
    path: '/invite/accept',
    element: (
      <Suspense fallback={<PageLoader />}>
        <InviteAcceptPage />
      </Suspense>
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
    element: <RequireAuth><Navigate to="/dashboard" replace /></RequireAuth>,
  },
  {
    path: '/dashboard',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <DashboardPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/customer-dashboard',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerDashboardPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/customer',
    element: <RequireAuth><Navigate to="/customer-dashboard" replace /></RequireAuth>,
  },
  {
    path: '/customer-alerts',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerAlertsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/customer-investigations',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerInvestigationsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/customer-ai-assistant',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerAiAssistantPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/customer-billing',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerBillingPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/customer-settings',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerSettingsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/customer-settings/team',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CustomerSettingsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    // Both /alerts and /alerts/:id render the 3-pane center
    // The center panel shows "select an alert" when no id is in URL
    path: '/alerts',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <AlertsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/alerts/:id',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <AlertsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/risk',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <RiskPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/connectors',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <ConnectorsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/events',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <EventsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/compliance',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <CompliancePage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/playbooks',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <PlaybooksPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/audit',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <AuditLogPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/settings',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <SettingsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  { path: '/enterprise-sales', element: (<RequireAuth><Suspense fallback={<PageLoader />}><EnterpriseSalesPage /></Suspense></RequireAuth>) },
  { path: '/enterprise-setup', element: (<RequireAuth><Suspense fallback={<PageLoader />}><EnterpriseSetupPage /></Suspense></RequireAuth>) },
  { path: '/ai-intelligence', element: (<RequireAuth><Suspense fallback={<PageLoader />}><AiIntelligencePage /></Suspense></RequireAuth>) },
  { path: '/ai-capabilities', element: (<RequireAuth><Suspense fallback={<PageLoader />}><AiCapabilitiesPage /></Suspense></RequireAuth>) },
  { path: '/enterprise', element: (<RequireAuth><Suspense fallback={<PageLoader />}><EnterpriseCapabilitiesPage /></Suspense></RequireAuth>) },
  { path: '/supply-chain', element: (<RequireAuth><Suspense fallback={<PageLoader />}><SupplyChainPage /></Suspense></RequireAuth>) },
  { path: '/ai-soc-analyst',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <AiSocAnalystPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  { path: '/ai-assistant',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <AiAssistantPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  { path: '/investigations',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <InvestigationsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/security-validation',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <SecurityValidationPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/compliance-reports',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <ComplianceReportsPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/threat-hunting',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <ThreatHuntingPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/mssp',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <MsspPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/billing',
    element: (
      <RequireAuth>
        <Suspense fallback={<PageLoader />}>
          <BillingPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '*',
    element: (
      <RequireAuth>
        <div className="flex h-screen items-center justify-center bg-gray-950">
          <div className="text-center">
            <p className="text-7xl font-bold text-gray-700">404</p>
            <p className="mt-4 text-gray-400">Page not found</p>
            <a href="/dashboard" className="mt-6 inline-block text-blue-400 hover:underline">
              ← Back to dashboard
            </a>
          </div>
        </div>
      </RequireAuth>
    ),
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
