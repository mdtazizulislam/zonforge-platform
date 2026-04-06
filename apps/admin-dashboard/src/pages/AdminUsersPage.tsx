import { AdminCard } from '../components/AdminCard'
import { AdminPageFrame } from '../components/AdminPageFrame'

export default function AdminUsersPage() {
  return (
    <AdminPageFrame
      title="Admin Users"
      description="Platform administrator identities, operator roles, and tenant access audit readiness."
    >
      <div className="zf-admin-grid zf-admin-grid-2">
        <AdminCard title="Role Boundary" subtitle="Locked ownership">
          <p>Only platform operators belong in this surface. Tenant admins stay in the customer app after cutover.</p>
        </AdminCard>
        <AdminCard title="Future Moves" subtitle="Auth and audit requirements">
          <ul className="zf-admin-list">
            <li>Role-gated admin sign-in and session handling</li>
            <li>Audit trail for impersonation and tenant lifecycle actions</li>
            <li>Dedicated admin callback and logout origins</li>
          </ul>
        </AdminCard>
      </div>
    </AdminPageFrame>
  )
}