import { Bell, Search } from 'lucide-react'

export default function CustomerHeader({
  searchValue,
  onSearchChange,
  userName,
}: {
  searchValue: string
  onSearchChange: (value: string) => void
  userName?: string
}) {
  return (
    <header className="zf-customer-header">
      <div>
        <p className="zf-customer-header__eyebrow">Executive overview</p>
        <h1 className="zf-customer-header__title">Security Dashboard</h1>
      </div>

      <label className="zf-customer-search" aria-label="Search entities, alerts, sources">
        <Search className="zf-customer-search__icon" />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search entities, alerts, sources..."
        />
      </label>

      <div className="zf-customer-header__actions">
        <button type="button" className="zf-customer-notify" aria-label="Notifications">
          <Bell className="zf-customer-notify__icon" />
          <span className="zf-customer-notify__dot" />
        </button>

        <div className="zf-customer-user">
          <span className="zf-customer-user__avatar">{(userName ?? 'Customer').slice(0, 2).toUpperCase()}</span>
          <div>
            <p className="zf-customer-user__name">{userName ?? 'Customer Team'}</p>
            <p className="zf-customer-user__role">Workspace Owner</p>
          </div>
        </div>
      </div>
    </header>
  )
}