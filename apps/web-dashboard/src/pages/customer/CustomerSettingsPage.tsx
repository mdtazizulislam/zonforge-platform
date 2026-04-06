import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useAuthStore } from '@/stores/auth.store'

export default function CustomerSettingsPage() {
  const user = useAuthStore((state) => state.user)
  const ownerName = user?.name ?? 'Customer Owner'
  const ownerEmail = user?.email ?? 'owner@example.com'
  const ownerRole = user?.role ?? 'Owner'

  return (
    <CustomerLayout
      title="Customer Settings"
      subtitle="Customer-safe account and workspace details in one premium shell."
    >
      <div className="zf-page">
        <div className="zf-container">
          <section className="zf-section">
            <div className="zf-section-head">
              <h1 className="zf-page-title">Settings</h1>
              <p className="zf-page-subtitle">
                Manage your account, security preferences, and workspace controls.
              </p>
            </div>

            <div className="zf-grid zf-grid-2">
              <article className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Profile</h2>
                  <p className="zf-card-subtitle">Basic customer account information.</p>
                </div>

                <div className="zf-detail-list">
                  <div className="zf-detail-row">
                    <span className="zf-label">Name</span>
                    <span className="zf-value">{ownerName}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Email</span>
                    <span className="zf-value">{ownerEmail}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Role</span>
                    <span className="zf-value">{ownerRole}</span>
                  </div>
                </div>
              </article>

              <article className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Security Settings</h2>
                  <p className="zf-card-subtitle">Authentication and account protection controls.</p>
                </div>

                <div className="zf-action-stack">
                  <button className="zf-btn-primary" type="button">Change Password</button>
                  <button className="zf-btn-secondary" type="button">Enable MFA</button>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </CustomerLayout>
  )
}