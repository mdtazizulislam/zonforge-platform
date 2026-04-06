import { Bell, ShieldCheck } from 'lucide-react'
import { resolveAdminApiBaseUrl } from '../lib/runtime-config'

export function AdminHeader() {
  return (
    <header className="zf-admin-header">
      <div>
        <p className="zf-admin-eyebrow">Standalone Super Admin</p>
        <h1>Operator Control Surface</h1>
      </div>

      <div className="zf-admin-header-meta">
        <div className="zf-admin-chip">
          <ShieldCheck size={16} />
          PLATFORM_ADMIN
        </div>
        <div className="zf-admin-chip is-muted">
          <Bell size={16} />
          API {resolveAdminApiBaseUrl()}
        </div>
      </div>
    </header>
  )
}