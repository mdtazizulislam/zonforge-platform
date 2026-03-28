import { Link } from 'react-router-dom'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Card } from '@/components/shared/ui'

export default function BillingCancelPage() {
  return (
    <AppShell title="Checkout Canceled">
      <PageContent>
        <Card>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-100">Checkout canceled</h2>
            <p className="text-gray-300">
              Your payment flow was canceled before completion. Your current plan remains unchanged.
            </p>
            <div className="pt-3 flex items-center gap-4">
              <Link className="text-blue-400 hover:underline" to="/billing">
                Return to Billing
              </Link>
              <Link className="text-gray-400 hover:underline" to="/dashboard">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      </PageContent>
    </AppShell>
  )
}
