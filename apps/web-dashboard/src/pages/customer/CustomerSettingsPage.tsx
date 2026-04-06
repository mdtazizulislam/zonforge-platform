import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useAuthStore } from '@/stores/auth.store'

export default function CustomerSettingsPage() {
  const user = useAuthStore((state) => state.user)
  const ownerName = user?.name ?? 'Customer Owner'
  const ownerEmail = user?.email ?? 'owner@example.com'
  const ownerRole = user?.role ?? 'Owner'
  const workspaceId = user?.tenantId || 'Primary customer workspace'

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
              <p className="zf-sub">Primary customer account identity and workspace ownership details.</p>
              <div className="zf-settings-stack">
                <div className="zf-row">
                  <div>
                    <div className="zf-label">Customer Owner</div>
                    <div className="zf-value">{ownerName}</div>
                  </div>
                </div>
                <div className="zf-row">
                  <div>
                    <div className="zf-label">Email</div>
                    <div className="zf-value">{ownerEmail}</div>
                  </div>
                </div>
                <div className="zf-row">
                  <div>
                    <div className="zf-label">Role</div>
                    <div className="zf-value">{ownerRole}</div>
                  </div>
                </div>
                <div className="zf-row">
                  <div>
                    <div className="zf-label">Workspace</div>
                    <div className="zf-value">{workspaceId}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="zf-card">
              <h2 className="zf-title">Security</h2>
              <p className="zf-sub">Customer-safe authentication controls without exposing analyst administration tools.</p>
              <div className="zf-settings-stack">
                <div className="zf-row zf-row--stack">
                  <div>
                    <div className="zf-label">Authentication</div>
                    <div className="zf-value">{user?.mfaEnabled ? 'Multi-factor authentication is enabled for this account.' : 'Strengthen access with MFA and password rotation.'}</div>
                  </div>
                  <div className="zf-row__actions">
                    <button type="button" className="zf-btn">Change Password</button>
                    <button type="button" className="zf-btn zf-btn--secondary">Enable MFA</button>
                  </div>
                </div>
                <div className="zf-row">
                  <div>
                    <div className="zf-label">Review Priority</div>
                    <div className="zf-value">Confirm the owner email is current for billing and incident notices.</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </CustomerLayout>
  )
}