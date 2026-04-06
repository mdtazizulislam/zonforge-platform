import { NavLink } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { adminRoutes } from '../routes/route-config'

export function AdminSidebar() {
  return (
    <aside className="zf-admin-sidebar">
      <div className="zf-admin-brand">
        <div className="zf-admin-brand-mark">
          <Shield size={18} />
        </div>
        <div>
          <p className="zf-admin-brand-title">ZonForge Admin</p>
          <p className="zf-admin-brand-subtitle">Platform Control Plane</p>
        </div>
      </div>

      <nav className="zf-admin-nav" aria-label="Admin navigation">
        {adminRoutes.map((route) => (
          <NavLink
            key={route.path}
            to={route.path}
            className={({ isActive }) => `zf-admin-nav-link${isActive ? ' is-active' : ''}`}
          >
            <route.icon size={18} />
            <span>{route.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}