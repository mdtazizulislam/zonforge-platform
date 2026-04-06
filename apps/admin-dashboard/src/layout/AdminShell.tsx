import type { ReactNode } from 'react'
import { AdminHeader } from '../components/AdminHeader'
import { AdminSidebar } from '../components/AdminSidebar'

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="zf-admin-app-shell">
      <AdminSidebar />
      <div className="zf-admin-main">
        <AdminHeader />
        <main className="zf-admin-content">{children}</main>
      </div>
    </div>
  )
}