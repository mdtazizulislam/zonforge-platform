import { AdminCard } from '../components/AdminCard'
import { AdminPageFrame } from '../components/AdminPageFrame'

export default function AdminConnectorsPage() {
  return (
    <AdminPageFrame
      title="Admin Connectors"
      description="Platform-level connector visibility, rollout readiness, and support operations."
    >
      <AdminCard title="Connector Governance" subtitle="Preparation scope">
        <p>
          This route is reserved for cross-tenant connector health, provisioning failures, and rollout oversight that must not live in the customer shell.
        </p>
      </AdminCard>
    </AdminPageFrame>
  )
}