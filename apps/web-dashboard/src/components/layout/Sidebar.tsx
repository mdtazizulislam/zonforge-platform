import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuthStore, useUiStore } from '@/stores/auth.store'
import { api, redirectToLogout } from '@/lib/api'
import {
  LayoutDashboard, ShieldAlert, BarChart3, Wifi,
  ShieldCheck, BookOpen, Settings, ChevronLeft,
  ChevronRight, LogOut, Shield, CreditCard, Building2,
  Search, FlaskConical, Brain, Network, Sparkles, Cpu,
  MessageSquare, FileSearch,
  Activity,
} from 'lucide-react'

interface NavItem { label: string; href: string; icon: React.ElementType; exact?: boolean }

const NAV_MAIN: NavItem[] = [
  { label: 'Dashboard',           href: '/app/dashboard',             icon: LayoutDashboard, exact: true },
  { label: 'Customer Dashboard',  href: '/app/customer-dashboard',    icon: LayoutDashboard },
  { label: 'Alerts',              href: '/app/alerts',                icon: ShieldAlert },
  { label: 'Investigations',      href: '/app/investigations',        icon: FileSearch },
  { label: 'AI Assistant',        href: '/app/ai-assistant',          icon: MessageSquare },
  { label: 'User Risk',           href: '/app/risk/users',            icon: BarChart3 },
  { label: 'Asset Risk',          href: '/app/risk/assets',           icon: Activity },
  { label: 'Vulnerabilities',     href: '/app/risk/vulnerabilities',  icon: ShieldCheck },
  { label: 'Reports',             href: '/app/reports',               icon: BookOpen },
  { label: 'Incident Timeline',   href: '/app/incidents/timeline',    icon: FileSearch },
  { label: 'Compliance Posture',  href: '/app/compliance-posture',    icon: Shield },
  { label: 'Connectors',          href: '/app/connectors',            icon: Wifi },
  { label: 'Events',              href: '/app/events',                icon: Activity },
  { label: 'Threat Hunting',      href: '/app/threat-hunting',        icon: Search },
  { label: 'Security Validation', href: '/app/security-validation',   icon: FlaskConical },
  { label: 'AI SOC Analyst',      href: '/app/ai-soc-analyst',        icon: Brain },
  { label: 'AI Intelligence',     href: '/app/ai-intelligence',       icon: Sparkles },
  { label: 'Supply Chain',        href: '/app/supply-chain',          icon: Network },
  { label: 'Enterprise',          href: '/app/enterprise',            icon: Shield },
]
const NAV_BOTTOM: NavItem[] = [
  { label: 'Compliance',       href: '/app/compliance',        icon: ShieldCheck },
  { label: 'Audit Log',        href: '/app/audit',             icon: BookOpen },
  { label: 'MSSP',             href: '/app/mssp',              icon: Building2 },
  { label: 'Enterprise Sales', href: '/app/enterprise-sales',  icon: CreditCard },
  { label: 'Billing',          href: '/app/billing',           icon: CreditCard },
  { label: 'Settings',         href: '/app/settings',          icon: Settings },
]

export function Sidebar() {
  const location                           = useLocation()
  const { user, clearAuth }                = useAuthStore()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const [loggingOut, setLoggingOut]        = useState(false)

  function isActive(href: string, exact = false) {
    return exact ? location.pathname === href : location.pathname.startsWith(href)
  }

  function NavRow({ item }: { item: NavItem }) {
    const active = isActive(item.href, item.exact)
    return (
      <Link to={item.href}
        className={clsx(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          active ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60',
          sidebarCollapsed && 'justify-center px-2',
        )}
        title={sidebarCollapsed ? item.label : undefined}>
        <item.icon className={clsx(
          'flex-shrink-0',
          sidebarCollapsed ? 'h-5 w-5' : 'h-4 w-4',
          active ? 'text-blue-400' : 'text-gray-600',
        )} />
        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
      </Link>
    )
  }

  async function handleLogout() {
    if (loggingOut) return

    setLoggingOut(true)

    try {
      await api.auth.logout()
    } catch {
    } finally {
      clearAuth()
      redirectToLogout()
    }
  }

  return (
    <aside className={clsx(
      'flex flex-col h-full bg-gray-950 border-r border-gray-800 transition-all duration-200',
      sidebarCollapsed ? 'w-16' : 'w-56',
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-3 h-14 border-b border-gray-800">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-blue-500/20 p-1.5">
              <Shield className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-100 leading-none">ZonForge</p>
              <p className="text-xs text-gray-600 leading-none mt-0.5">Sentinel</p>
            </div>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="mx-auto rounded-lg bg-blue-500/20 p-1.5">
            <Shield className="h-4 w-4 text-blue-400" />
          </div>
        )}
        <button onClick={toggleSidebar}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className={clsx('text-gray-600 hover:text-gray-400 p-1 rounded transition-colors',
            sidebarCollapsed && 'hidden')}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_MAIN.map(item => <NavRow key={item.href} item={item} />)}
      </nav>

      {/* Bottom nav */}
      <div className="px-2 py-3 border-t border-gray-800 space-y-0.5">
        {NAV_BOTTOM.map(item => <NavRow key={item.href} item={item} />)}

        {/* User row */}
        <div className={clsx(
          'flex items-center gap-3 px-3 py-2 mt-2 border-t border-gray-800/60 pt-3',
          sidebarCollapsed && 'justify-center',
        )}>
          <div className="flex-shrink-0 h-7 w-7 rounded-full bg-blue-500/20 flex items-center
                          justify-center text-blue-400 font-bold text-xs">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate">{user?.name ?? '—'}</p>
              <p className="text-xs text-gray-600 truncate">{user?.role ?? '—'}</p>
            </div>
          )}
          <button onClick={handleLogout} title="Log out" disabled={loggingOut}
            className="flex-shrink-0 text-gray-700 hover:text-red-400 transition-colors">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
