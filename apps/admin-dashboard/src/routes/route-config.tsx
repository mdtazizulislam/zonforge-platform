import { Building2, CreditCard, LayoutDashboard, Plug, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import AdminBillingPage from '../pages/AdminBillingPage'
import AdminConnectorsPage from '../pages/AdminConnectorsPage'
import AdminDashboardPage from '../pages/AdminDashboardPage'
import AdminTenantsPage from '../pages/AdminTenantsPage'
import AdminUsersPage from '../pages/AdminUsersPage'

export type AdminRouteItem = {
  path: string
  label: string
  description: string
  icon: LucideIcon
  element: JSX.Element
}

export const adminRoutes: AdminRouteItem[] = [
  {
    path: '/admin-dashboard',
    label: 'Overview',
    description: 'Platform posture, global incidents, and operator status.',
    icon: LayoutDashboard,
    element: <AdminDashboardPage />,
  },
  {
    path: '/admin-tenants',
    label: 'Tenants',
    description: 'Cross-tenant management, lifecycle control, and impersonation prep.',
    icon: Building2,
    element: <AdminTenantsPage />,
  },
  {
    path: '/admin-billing',
    label: 'Billing',
    description: 'Plan oversight, invoices, and platform revenue control.',
    icon: CreditCard,
    element: <AdminBillingPage />,
  },
  {
    path: '/admin-connectors',
    label: 'Connectors',
    description: 'Global connector health and provisioning visibility.',
    icon: Plug,
    element: <AdminConnectorsPage />,
  },
  {
    path: '/admin-users',
    label: 'Users',
    description: 'Platform administrators, operators, and tenant access audits.',
    icon: Users,
    element: <AdminUsersPage />,
  },
]