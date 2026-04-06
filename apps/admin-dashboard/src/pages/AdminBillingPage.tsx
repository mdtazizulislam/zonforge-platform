import { AdminCard } from '../components/AdminCard'
import { AdminPageFrame } from '../components/AdminPageFrame'

export default function AdminBillingPage() {
  return (
    <AdminPageFrame
      title="Admin Billing"
      description="Platform billing oversight for plans, invoices, revenue reporting, and operator escalations."
    >
      <div className="zf-admin-grid zf-admin-grid-2">
        <AdminCard title="Platform Revenue Controls" subtitle="Cross-tenant finance operations">
          <p>Prepare this route for global billing KPIs, invoice exceptions, and enterprise contract oversight.</p>
        </AdminCard>
        <AdminCard title="Dependencies" subtitle="Backend services already involved">
          <ul className="zf-admin-list">
            <li>`apps/billing-service` plan and subscription flows</li>
            <li>Admin-only review paths for enterprise and MSSP tiers</li>
            <li>Future callback/origin hardening for `admin.zonforge.com`</li>
          </ul>
        </AdminCard>
      </div>
    </AdminPageFrame>
  )
}