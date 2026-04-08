import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type OnboardingStatusResponse } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

const PROVIDERS = [
  { id: 'aws', label: 'AWS', helper: 'Prioritize AWS telemetry first if your cloud estate is anchored in CloudTrail, IAM, and GuardDuty.' },
  { id: 'm365', label: 'M365', helper: 'Prioritize Microsoft identity and audit coverage if Entra, email, and Defender matter first.' },
  { id: 'gcp', label: 'GCP', helper: 'Prioritize GCP if your first production signal should come from projects, IAM, and audit logs.' },
] as const

export default function OnboardingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('aws')

  useEffect(() => {
    let active = true

    api.onboarding.get()
      .then((result) => {
        if (!active) return
        setStatus(result)
        const providerPayload = result.steps.find((step) => step.stepKey === 'connect_environment')?.payload as { provider?: string } | null
        if (providerPayload?.provider) {
          setSelectedProvider(providerPayload.provider)
        }
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
  const stepMap = useMemo(() => new Map(steps.map((step) => [step.stepKey, step])), [steps])
  const welcomeStep = stepMap.get('welcome')
  const connectStep = stepMap.get('connect_environment')
  const firstScanStep = stepMap.get('first_scan')
  const onboardingStatus = status?.onboardingStatus ?? user?.onboardingStatus ?? 'pending'
  const isCompleted = onboardingStatus === 'completed'

  function syncAuthStatus(nextStatus: OnboardingStatusResponse) {
    if (!user) return

    setUser({
      ...user,
      onboardingStatus: nextStatus.onboardingStatus,
      tenant: user.tenant
        ? {
            ...user.tenant,
            onboardingStatus: nextStatus.onboardingStatus,
            onboardingStartedAt: nextStatus.onboardingStartedAt,
            onboardingCompletedAt: nextStatus.onboardingCompletedAt,
          }
        : user.tenant,
    })
  }

  async function updateOnboarding(input: {
    status?: 'pending' | 'in_progress' | 'completed'
    stepKey?: string
    isComplete?: boolean
    payload?: unknown
  }, options?: { navigateToDashboard?: boolean }) {
    setSaving(true)
    setErrorMessage('')

    try {
      const nextStatus = await api.onboarding.updateStatus(input)
      setStatus(nextStatus)
      syncAuthStatus(nextStatus)

      if (options?.navigateToDashboard && nextStatus.onboardingStatus === 'completed') {
        navigate('/customer-dashboard', { replace: true })
      }
    } catch {
      setErrorMessage('Unable to update onboarding right now. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const stepCards = [
    {
      number: '01',
      title: welcomeStep?.title ?? 'Welcome',
      description: welcomeStep?.description ?? 'Confirm the workspace is active and move into the live customer setup flow.',
      complete: Boolean(welcomeStep?.isComplete),
      body: (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Confirm the workspace details, move the tenant from pending to in progress, and unlock the live customer workspace.
          </p>
          <button
            type="button"
            disabled={saving || Boolean(welcomeStep?.isComplete)}
            onClick={() => updateOnboarding({
              status: 'in_progress',
              stepKey: 'welcome',
              isComplete: true,
              payload: { source: 'onboarding_ui' },
            })}
            className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-300"
          >
            {welcomeStep?.isComplete ? 'Welcome completed' : saving ? 'Saving...' : 'Start onboarding'}
          </button>
        </div>
      ),
    },
    {
      number: '02',
      title: connectStep?.title ?? 'Connect your environment',
      description: connectStep?.description ?? 'Choose the first production source you plan to connect so the dashboard and connector path stay focused.',
      complete: Boolean(connectStep?.isComplete),
      body: (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                disabled={saving || !welcomeStep?.isComplete}
                onClick={() => setSelectedProvider(provider.id)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${selectedProvider === provider.id ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-white/5 text-gray-200'} disabled:cursor-not-allowed disabled:border-white/5 disabled:text-gray-500`}
              >
                <div className="text-sm font-medium">{provider.label}</div>
                <div className="mt-2 text-xs text-gray-400">{provider.helper}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={saving || !welcomeStep?.isComplete}
            onClick={() => updateOnboarding({
              status: 'in_progress',
              stepKey: 'connect_environment',
              isComplete: true,
              payload: { provider: selectedProvider, source: 'onboarding_ui' },
            })}
            className="inline-flex items-center justify-center rounded-xl border border-cyan-300/40 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-200 hover:text-cyan-50 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-gray-500"
          >
            {connectStep?.isComplete ? 'Preferred source saved' : saving ? 'Saving...' : 'Save preferred source'}
          </button>
          <Link
            to="/connectors"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:border-cyan-300/50 hover:text-cyan-200"
          >
            Open connectors
          </Link>
        </div>
      ),
    },
    {
      number: '03',
      title: firstScanStep?.title ?? 'First scan CTA',
      description: firstScanStep?.description ?? 'Complete onboarding and continue into the customer dashboard with billing, alerts, and connector follow-up in view.',
      complete: Boolean(firstScanStep?.isComplete),
      body: (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Finish onboarding and continue in the live dashboard. You can connect data sources from the connector workspace as the next step.
          </p>
          <button
            type="button"
            disabled={saving || !welcomeStep?.isComplete || !connectStep?.isComplete}
            onClick={() => updateOnboarding({
              status: 'completed',
              stepKey: 'first_scan',
              isComplete: true,
              payload: { cta: 'dashboard_handoff', source: 'onboarding_ui' },
            }, { navigateToDashboard: true })}
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-300"
          >
            {isCompleted ? 'Onboarding complete' : saving ? 'Saving...' : 'Finish onboarding and open dashboard'}
          </button>
        </div>
      ),
    },
  ]

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-12 text-gray-100">
      <div className="mx-auto max-w-5xl rounded-3xl border border-cyan-500/20 bg-gray-900/90 p-8 shadow-2xl shadow-cyan-950/30">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-cyan-300">Workspace onboarding</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">{workspaceName} is ready.</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-300">
              Your customer account, workspace, and owner membership are active. Use this short checklist to confirm the workspace, choose the first source you plan to connect, and continue into the live customer dashboard.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            <div>Workspace slug</div>
            <div className="mt-1 font-mono text-cyan-300">{workspaceSlug}</div>
            <div className="mt-3 text-xs text-gray-500">Started: {status?.onboardingStartedAt ? new Date(status.onboardingStartedAt).toLocaleString() : 'not started'}</div>
            <div className="mt-1 text-xs text-gray-500">Completed: {status?.onboardingCompletedAt ? new Date(status.onboardingCompletedAt).toLocaleString() : 'not completed'}</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-lg font-medium text-white">Onboarding steps</h2>
            <p className="mt-2 text-sm text-gray-400">
              Move from workspace activation into the live customer app with state stored on the tenant record and progress tracked per tenant.
            </p>

            <div className="mt-5 space-y-4">
              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
                  Loading onboarding status...
                </div>
              ) : (
                stepCards.map((step) => (
                  <div key={step.title} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Step {step.number}</div>
                        <h3 className="mt-2 text-lg font-medium text-white">{step.title}</h3>
                        <p className="mt-2 text-sm text-gray-400">{step.description}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${step.complete ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
                        {step.complete ? 'Complete' : 'Pending'}
                      </span>
                    </div>
                    <div className="mt-5">{step.body}</div>
                  </div>
                ))
              )}
            </div>

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {errorMessage}
              </div>
            ) : null}
          </section>

          <aside className="rounded-2xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-lg font-medium text-white">Status summary</h2>
            <ul className="mt-4 space-y-3 text-sm text-gray-300">
              <li>Current onboarding state: <span className="font-medium text-cyan-200">{onboardingStatus.replace(/_/g, ' ')}</span>.</li>
              <li>Preferred first source: <span className="font-medium text-cyan-200">{selectedProvider.toUpperCase()}</span>.</li>
              <li>After onboarding, continue with connectors, billing, and live dashboard review from the customer workspace.</li>
            </ul>

            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/customer-dashboard"
                className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Open dashboard
              </Link>
              <Link
                to="/customer-settings"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white transition hover:border-cyan-300/50 hover:text-cyan-200"
              >
                Open customer settings
              </Link>
            </div>

            {isCompleted ? (
              <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                Onboarding is complete. The next secure landing page is the customer dashboard, where connector setup and billing remain one click away.
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  )
}
