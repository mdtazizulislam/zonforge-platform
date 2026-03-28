import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell, PageContent } from '@/components/layout/AppShell'
import { Card } from '@/components/shared/ui'
import { api, type BillingSubscriptionResponse } from '@/lib/api'

export default function BillingSuccessPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<BillingSubscriptionResponse | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const maxAttempts = 10

    async function poll() {
      for (let i = 1; i <= maxAttempts; i += 1) {
        if (cancelled) return
        setAttempt(i)
        try {
          const data = await api.billingApi.subscription()
          if (cancelled) return
          setStatus(data)
          const sub = data.subscription
          const isPaid = Boolean(sub && ['active', 'trialing'].includes(String(sub.status).toLowerCase()))
          if (isPaid) {
            setLoading(false)
            return
          }
        } catch (err) {
          if (cancelled) return
          setError((err as Error).message)
          setLoading(false)
          return
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      if (!cancelled) {
        setLoading(false)
      }
    }

    poll()

    return () => {
      cancelled = true
    }
  }, [])

  const planLabel = status?.subscription?.planName ?? status?.subscription?.planCode ?? 'unknown'
  const subStatus = status?.subscription?.status ?? 'verifying'

  return (
    <AppShell title="Payment Success">
      <PageContent>
        <Card>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-gray-100">Payment received</h2>
            {loading && (
              <p className="text-gray-400">
                Verifying subscription status... ({attempt}/10)
              </p>
            )}
            {error && <p className="text-red-400">{error}</p>}
            {!loading && !error && (
              <>
                <p className="text-gray-300">Active plan: <span className="font-semibold capitalize">{planLabel}</span></p>
                <p className="text-gray-300">Subscription status: <span className="font-semibold">{subStatus}</span></p>
                {status?.subscription?.currentPeriodEnd && (
                  <p className="text-gray-300">
                    Renewal date: <span className="font-semibold">{new Date(status.subscription.currentPeriodEnd).toLocaleDateString()}</span>
                  </p>
                )}
                {status?.subscription?.cancelAtPeriodEnd && (
                  <p className="text-yellow-400">Cancellation is scheduled at period end.</p>
                )}
              </>
            )}
            {!loading && !error && !status?.subscription && (
              <p className="text-yellow-400">Subscription is still verifying. Please refresh in a few seconds.</p>
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
