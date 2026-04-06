import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { useAuthStore } from '@/stores/auth.store'

export default function CustomerSettingsPage() {
  const user = useAuthStore((state) => state.user)

  return (
    <CustomerLayout
      title="Customer Settings"
      subtitle="Customer-safe account and workspace details in one premium shell."
    >
      <div className="zf-dashboard-grid">
        <section className="zf-panel-card zf-full-span zf-customer-shell-hero">
          <div>
            <p className="zf-panel-heading__eyebrow">Workspace identity</p>
            <h2 className="zf-panel-heading__title">Account settings overview</h2>
            <p className="zf-panel-heading__meta">This page summarizes the customer account footprint without exposing internal analyst controls.</p>
          </div>
          <div className="zf-customer-shell-stat-grid">
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">User</span>
              <strong className="zf-customer-shell-stat__value">{user?.name ?? 'Customer Team'}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">Role</span>
              <strong className="zf-customer-shell-stat__value">{user?.role ?? 'member'}</strong>
            </article>
            <article className="zf-customer-shell-stat">
              <span className="zf-customer-shell-stat__label">MFA</span>
              <strong className="zf-customer-shell-stat__value">{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</strong>
            </article>
          </div>
        </section>

        <section className="zf-panel-card zf-span-6">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Account</p>
              <h2 className="zf-panel-heading__title">Profile details</h2>
            </div>
          </div>
          <div className="zf-customer-shell-detail-grid">
            <div className="zf-customer-shell-detail"><span>Name</span><strong>{user?.name ?? 'Customer Team'}</strong></div>
            <div className="zf-customer-shell-detail"><span>Email</span><strong>{user?.email ?? 'Unknown'}</strong></div>
            <div className="zf-customer-shell-detail"><span>Tenant</span><strong>{user?.tenantId || 'Not provided'}</strong></div>
          </div>
        </section>

        <section className="zf-panel-card zf-span-6">
          <div className="zf-panel-heading">
            <div>
              <p className="zf-panel-heading__eyebrow">Workspace policies</p>
              <h2 className="zf-panel-heading__title">Recommended actions</h2>
            </div>
          </div>
          <div className="zf-action-list">
            <div className="zf-action-item"><span className="zf-action-item__index">01</span><p>Review MFA enrollment for customer-facing operators.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">02</span><p>Confirm the workspace owner email is current for billing notices.</p></div>
            <div className="zf-action-item"><span className="zf-action-item__index">03</span><p>Use the internal settings route only for analyst-specific administration.</p></div>
          </div>
        </section>
      </div>
    </CustomerLayout>
  )
}