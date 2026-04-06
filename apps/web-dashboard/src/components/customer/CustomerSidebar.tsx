import { NavLink } from 'react-router-dom'
import {
  Bot,
  Briefcase,
  LayoutDashboard,
  Search,
  Settings,
  ShieldAlert,
} from 'lucide-react'

const items = [
  { label: 'Dashboard', to: '/customer-dashboard', icon: LayoutDashboard },
  { label: 'Alerts', to: '/customer-alerts', icon: ShieldAlert },
  { label: 'Investigations', to: '/customer-investigations', icon: Search },
  { label: 'AI Assistant', to: '/customer-ai-assistant', icon: Bot },
  { label: 'Billing', to: '/customer-billing', icon: Briefcase },
  { label: 'Settings', to: '/customer-settings', icon: Settings },
]

export function CustomerSidebar() {
  return (
    <aside className="zf-customer-sidebar">
      <div className="zf-customer-sidebar__brand">
        <div className="zf-customer-sidebar__logo">ZF</div>
        <div>
          <p className="zf-customer-sidebar__eyebrow">Customer Workspace</p>
          <p className="zf-customer-sidebar__title">ZonForge Sentinel</p>
        </div>
      </div>

      <nav className="zf-customer-sidebar__nav" aria-label="Customer navigation">
        {items.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => isActive ? 'zf-customer-navlink is-active' : 'zf-customer-navlink'}
          >
            <Icon className="zf-customer-navlink__icon" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="zf-customer-sidebar__footer">
        <p className="zf-customer-sidebar__footnote">Executive View</p>
        <p className="zf-customer-sidebar__subnote">Focused posture, alerts, actions, and health without analyst-only noise.</p>
      </div>
    </aside>
  )
}

export default CustomerSidebar