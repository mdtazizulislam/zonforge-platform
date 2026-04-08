import { Bell } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'

type CustomerHeaderProps = {
  title?: string
  subtitle?: string
}

export function CustomerHeader({ title, subtitle }: CustomerHeaderProps) {
  const userName = useAuthStore((state) => state.user?.name) ?? 'Customer Team'
  const userRole = useAuthStore((state) => state.user?.membership?.role ?? state.user?.role) ?? 'viewer'
  const resolvedTitle = title ?? 'Customer Dashboard'
  const roleLabel = userRole.charAt(0).toUpperCase() + userRole.slice(1)

  return (
    <header className="zf-customer-header">
      <div>
        <p className="zf-customer-header__eyebrow">Executive overview</p>
        <h1 className="zf-customer-header__title">{resolvedTitle}</h1>
        {subtitle ? <p className="zf-customer-header__subtitle">{subtitle}</p> : null}
      </div>

      <div className="zf-customer-header__actions">
        <button type="button" className="zf-customer-notify" aria-label="Notifications">
          <Bell className="zf-customer-notify__icon" />
          <span className="zf-customer-notify__dot" />
        </button>

        <div className="zf-customer-user">
          <span className="zf-customer-user__avatar">{(userName ?? 'Customer').slice(0, 2).toUpperCase()}</span>
          <div>
            <p className="zf-customer-user__name">{userName ?? 'Customer Team'}</p>
            <p className="zf-customer-user__role">{roleLabel}</p>
          </div>
        </div>
      </div>
    </header>
  )
}

export default CustomerHeader