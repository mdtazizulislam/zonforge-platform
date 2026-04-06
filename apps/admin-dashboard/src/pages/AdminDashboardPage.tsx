import { AdminCard } from '../components/AdminCard'
import { AdminPageFrame } from '../components/AdminPageFrame'

export default function AdminDashboardPage() {
  return (
    <AdminPageFrame
      title="Admin Dashboard"
      description="Platform-wide oversight for tenant posture, operator workload, and service health."
    >
      <div className="zf-admin-grid zf-admin-grid-3">
        <AdminCard title="Global Tenants" subtitle="Cross-tenant estate view">
          <strong>214</strong>
          <span>Tracked tenants staged for admin split.</span>
        </AdminCard>
        <AdminCard title="Critical Incidents" subtitle="Escalations requiring operator review">
          <strong>12</strong>
          <span>Source moves from mixed customer shell into admin-only routing.</span>
        </AdminCard>
        <AdminCard title="Service Integrity" subtitle="Core control-plane availability">
          <strong>99.98%</strong>
          <span>Future admin app will consume API-only platform telemetry.</span>
        </AdminCard>
      </div>
    </AdminPageFrame>
  )
}