import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Card } from '@/components/shared/ui'

type BillingStatusResponse = {
  billing?: {
    planName?: string | null
    planCode?: string | null
    subscriptionStatus?: string | null
  }
  plan?: string
  statusCode?: string
}

export default function BillingSuccessPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<BillingStatusResponse | null>(null)

  useEffect(() => {
    const billingBase = import.meta.env.VITE_BILLING_API_URL ?? '/api'

    async function load() {
      try {
        const resp = await fetch(`${billingBase}/billing/status`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('zf_access_token')}`,
          },
        })

        const data = await resp.json() as BillingStatusResponse | { error?: string }
        if (!resp.ok) {
          setError((data as { error?: string })?.error ?? 'Failed to load billing status')
          return
        }

        setStatus(data as BillingStatusResponse)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const planLabel = status?.billing?.planName ?? status?.plan ?? 'unknown'
  const subStatus = status?.billing?.subscriptionStatus ?? status?.statusCode ?? 'unknown'

  return (
    <AppShell title="Payment Success">
      <PageContent>
        <Card>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-100">Payment processed</h2>
            {loading && <p className="text-gray-400">Checking subscription status...</p>}
            {error && <p className="text-red-400">{error}</p>}
            {!loading && !error && (
              <>
                <p className="text-gray-300">Active plan: <span className="font-semibold capitalize">{planLabel}</span></p>
                <p className="text-gray-300">Subscription status: <span className="font-semibold">{subStatus}</span></p>
              </>
            )}
            <div className="pt-3">
              <Link className="text-blue-400 hover:underline" to="/billing">Back to Billing</Link>
            </div>
          </div>
        </Card>
      </PageContent>
    </AppShell>
  )
}
