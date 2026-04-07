import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type OnboardingStatusResponse } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

export default function OnboardingPage() {
  const user = useAuthStore((state) => state.user)
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true

    api.onboarding.status()
      .then((result) => {
        if (!active) return
        setStatus(result)
      })
      .catch(() => {
        if (!active) return
        setErrorMessage('Unable to load onboarding progress right now. You can still continue to the dashboard.')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const workspaceName = user?.tenant?.name ?? 'Your workspace'
  const workspaceSlug = user?.tenant?.slug ?? status?.tenantId ?? 'pending'
  const steps = status?.steps ?? []

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-12 text-gray-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-500/20 bg-gray-900/90 p-8 shadow-2xl shadow-cyan-950/30">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-cyan-300">Workspace onboarding</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">{workspaceName} is ready.</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Your customer account, workspace, and owner membership are active. Connector setup and deeper environment onboarding will land in a later serial.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            <div>Workspace slug</div>
            <div className="mt-1 font-mono text-cyan-300">{workspaceSlug}</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-lg font-medium text-white">Next steps</h2>
            <p className="mt-2 text-sm text-gray-400">
              This onboarding entry point is intentionally lightweight for SERIAL 07. Use it as the first secure landing page after workspace creation.
            </p>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
                  Loading onboarding status...
                </div>
              ) : steps.length > 0 ? (
                steps.map((step) => (
                  <div key={step.stepKey} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-white">{step.stepKey.replace(/_/g, ' ')}</span>
                      <span className={`text-xs uppercase tracking-[0.18em] ${step.isComplete ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {step.isComplete ? 'Complete' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
                  Connect environment later. Continue into the customer dashboard whenever you are ready.
                </div>
              )}
            </div>

            {errorMessage ? <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{errorMessage}</div> : null}
          </section>

          <aside className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-lg font-medium text-white">What happens next</h2>
            <ul className="mt-4 space-y-3 text-sm text-gray-300">
              <li>Review your new workspace context in the customer dashboard.</li>
              <li>Return later to connect cloud, identity, and telemetry sources.</li>
              <li>Invite more members once team onboarding ships in a later serial.</li>
            </ul>

            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/customer-dashboard"
                className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Continue to dashboard
              </Link>
              <Link
                to="/customer-settings"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:border-cyan-300/50 hover:text-cyan-200"
              >
                Open customer settings
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}