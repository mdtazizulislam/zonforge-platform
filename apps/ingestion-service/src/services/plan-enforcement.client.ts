import { createLogger } from '@zonforge/logger'

const log = createLogger({ service: 'ingestion-service:plan-enforcement' })

export type EnforcementMetric = 'CONNECTORS' | 'IDENTITIES' | 'EVENTS_PER_MIN'

function baseUrl() {
  return process.env['ZONFORGE_BILLING_ENFORCEMENT_URL'] ?? 'http://localhost:3000'
}

export async function assertQuotaViaBackend(input: {
  tenantId: string
  metricCode: EnforcementMetric
  currentValue: number
  increment?: number
}): Promise<void> {
  try {
    const resp = await fetch(`${baseUrl()}/billing/internal/assert-quota`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    if (resp.ok) return

    const data = await resp.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
    const code = data?.error?.code
    const message = data?.error?.message ?? 'quota check failed'

    if (code === 'UPGRADE_REQUIRED') {
      const err = new Error(message)
      ;(err as Error & { code: string }).code = 'UPGRADE_REQUIRED'
      throw err
    }

    log.warn({ status: resp.status, metricCode: input.metricCode },
      'Backend quota check unavailable; caller should apply fallback')
  } catch (err) {
    if ((err as { code?: string } | undefined)?.code === 'UPGRADE_REQUIRED') {
      throw err
    }

    log.warn({ err, metricCode: input.metricCode },
      'Backend quota check failed; caller should apply fallback')
  }
}

export async function incrementUsageViaBackend(input: {
  tenantId: string
  metricCode: EnforcementMetric
  increment?: number
}): Promise<void> {
  try {
    await fetch(`${baseUrl()}/billing/internal/increment-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch (err) {
    log.warn({ err, metricCode: input.metricCode },
      'Backend usage increment failed; proceeding without hard failure')
  }
}
