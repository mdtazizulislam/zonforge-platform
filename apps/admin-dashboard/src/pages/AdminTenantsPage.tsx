import { AdminCard } from '../components/AdminCard'
import { AdminPageFrame } from '../components/AdminPageFrame'

const tenantActions = [
  'Search and filter all tenants',
  'Review plan tier, status, MRR, and posture',
  'Impersonate tenant admin for support workflows',
  'Suspend or reactivate tenant lifecycle',
]

export default function AdminTenantsPage() {
  return (
    <AdminPageFrame
      title="Admin Tenants"
      description="Dedicated platform-operator surface for tenant governance and impersonation workflows."
    >
      <AdminCard title="Migration Scope" subtitle="What moves from the current mixed `/mssp` experience">
        <ul className="zf-admin-list">
          {tenantActions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </AdminCard>
    </AdminPageFrame>
  )
}