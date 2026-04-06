import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useAuthStore } from '@/stores/auth.store'

export default function CustomerSettingsPage() {
  const user = useAuthStore((state) => state.user)

  return (
    <CustomerLayout
      title="Customer Settings"
      subtitle="Customer-safe account and workspace details in one premium shell."
    >
      <div className="zf-page">
        <div className="zf-container">
          <div className="zf-grid">
            <section className="zf-card">
              <h2 className="zf-title">Profile</h2>
              <div className="zf-settings-stack">
                <div className="zf-settings-item">
                  <span className="zf-label">Name</span>
                  <strong className="zf-value">{user?.name ?? 'Customer Team'}</strong>
                </div>
                <div className="zf-settings-item">
                  <span className="zf-label">Email</span>
                  <strong className="zf-value">{user?.email ?? 'Unknown'}</strong>
                </div>
                <div className="zf-settings-item">
                  <span className="zf-label">Tenant</span>
                  <strong className="zf-value">{user?.tenantId || 'Not provided'}</strong>
                </div>
                <div className="zf-settings-item">
                  <span className="zf-label">Role</span>
                  <strong className="zf-value">{user?.role ?? 'member'}</strong>
                </div>
                <div className="zf-settings-item">
                  <span className="zf-label">MFA</span>
                  <strong className="zf-value">{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</strong>
                </div>
              </div>
            </section>

            <section className="zf-card">
              <h2 className="zf-title">Workspace Policies</h2>
              <div className="zf-settings-stack">
                <div className="zf-settings-item">
                  <span className="zf-label">Priority 01</span>
                  <p className="zf-value">Review MFA enrollment for customer-facing operators.</p>
                </div>
                <div className="zf-settings-item">
                  <span className="zf-label">Priority 02</span>
                  <p className="zf-value">Confirm the workspace owner email is current for billing notices.</p>
                </div>
                <div className="zf-settings-item">
                  <span className="zf-label">Priority 03</span>
                  <p className="zf-value">Use the internal settings route only for analyst-specific administration.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </CustomerLayout>
  )
}