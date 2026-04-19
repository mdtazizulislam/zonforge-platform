import fs from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const baseUrl = process.env.ZF_PROOF_BASE_URL ?? 'http://localhost:5174/app'
const outputDir = path.resolve(process.cwd(), 'proof/runs/serial-18-3-routing-stability')
const proofJson = path.join(outputDir, 'routing-stability-proof.json')

type ProofResult = {
  caseId: string
  startUrl: string
  finalUrl: string
  screenshot: string
  consoleMessages: string[]
  pageErrors: string[]
}

type AuthSeedOptions = {
  onboardingStatus?: string
  onboardingCompletedAt?: string | null
}

function createOnboardingStatusPayload(options: AuthSeedOptions) {
  return {
    tenantId: 'proof-tenant',
    onboardingStatus: options.onboardingStatus,
    onboardingCompletedAt: options.onboardingCompletedAt ?? null,
    onboardingStartedAt: '2026-04-10T10:00:00.000Z',
    steps: [],
  }
}

function createLoginPayload(options: AuthSeedOptions) {
  return {
    accessToken: 'proof-access-token',
    refreshToken: 'proof-refresh-token',
    accessExpiresAt: '2099-01-01T00:00:00.000Z',
    refreshExpiresAt: '2099-02-01T00:00:00.000Z',
    user: {
      id: 'proof-user',
      email: 'owner@zonforge.local',
      fullName: 'Workspace Owner',
      role: 'owner',
      status: 'active',
      emailVerified: true,
      tenantId: 'proof-tenant',
    },
    tenant: {
      id: 'proof-tenant',
      name: 'ZonForge Proof',
      slug: 'zonforge-proof',
      plan: 'growth',
      onboardingStatus: options.onboardingStatus,
      onboardingCompletedAt: options.onboardingCompletedAt ?? null,
    },
    membership: {
      role: 'owner',
    },
  }
}

function createPersistedAuthState(options: AuthSeedOptions) {
  return {
    state: {
      user: {
        id: 'proof-user',
        email: 'owner@zonforge.local',
        fullName: 'Workspace Owner',
        name: 'Workspace Owner',
        role: 'owner',
        status: 'active',
        emailVerified: true,
        tenantId: 'proof-tenant',
        membership: {
          role: 'owner',
        },
        tenant: {
          id: 'proof-tenant',
          name: 'ZonForge Proof',
          slug: 'zonforge-proof',
          plan: 'growth',
          onboardingStatus: options.onboardingStatus ?? 'pending',
          onboardingStartedAt: '2026-04-10T10:00:00.000Z',
          onboardingCompletedAt: options.onboardingCompletedAt ?? null,
        },
        onboardingStatus: options.onboardingStatus,
        mfaEnabled: false,
      },
      isLoggedIn: true,
    },
    version: 0,
  }
}

async function decorateProofPage(page: Parameters<typeof test>[0]['page'], label: string, consoleMessages: string[], pageErrors: string[]) {
  await page.addStyleTag({
    content: `
      body { padding-top: 56px; }
      #proof-url-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 10px 16px;
        background: rgba(2, 6, 23, 0.96);
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        color: #e2e8f0;
        font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      #proof-url-bar .proof-label {
        color: #38bdf8;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
      }
      #proof-url-bar .proof-status {
        margin-left: auto;
        color: #4ade80;
      }
      #proof-url-bar .proof-status.has-errors {
        color: #f87171;
      }
    `,
  })

  const hasErrors = consoleMessages.some((entry) => entry.startsWith('error:')) || pageErrors.length > 0
  await page.evaluate(({ nextLabel, nextStatus, statusClass }) => {
    const existing = document.getElementById('proof-url-bar')
    if (existing) {
      existing.remove()
    }

    const bar = document.createElement('div')
    bar.id = 'proof-url-bar'
    bar.innerHTML = `
      <span class="proof-label">Case</span>
      <span>${nextLabel}</span>
      <span class="proof-label">URL</span>
      <span>${window.location.href}</span>
      <span class="proof-status ${statusClass}">${nextStatus}</span>
    `
    document.body.appendChild(bar)
  }, {
    nextLabel: label,
    nextStatus: hasErrors ? 'Console: errors detected' : 'Console: clean',
    statusClass: hasErrors ? 'has-errors' : '',
  })
}

async function collectProofPage(page: Parameters<typeof test>[0]['page']) {
  const consoleMessages: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  })

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  return { consoleMessages, pageErrors }
}

test('routing stability proof', async ({ browser }) => {
  await fs.mkdir(outputDir, { recursive: true })

  const results: ProofResult[] = []

  const incompleteContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const incompletePage = await incompleteContext.newPage()
  const incompleteLogs = await collectProofPage(incompletePage)

  await incompletePage.route('**/v1/auth/login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(createLoginPayload({ onboardingStatus: 'pending' })),
    })
  })
  await incompletePage.route('**/v1/onboarding', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(createOnboardingStatusPayload({ onboardingStatus: 'pending' })),
    })
  })
  await incompletePage.route('**/v1/onboarding/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(createOnboardingStatusPayload({ onboardingStatus: 'pending' })),
    })
  })

  await incompletePage.goto(`${baseUrl}/billing`, { waitUntil: 'networkidle' })
  await expect(incompletePage).toHaveURL(/\/app\/login$/)
  await incompletePage.getByLabel('Email').fill('owner@zonforge.local')
  await incompletePage.getByLabel('Password').fill('correct-horse-battery-42')
  await incompletePage.getByRole('button', { name: 'Sign in' }).click()
  await expect(incompletePage).toHaveURL(/\/app\/onboarding$/)
  await expect(incompletePage.getByText('Workspace onboarding')).toBeVisible()
  await expect(incompletePage.getByRole('heading', { name: 'ZonForge Proof is ready.' })).toBeVisible()
  await decorateProofPage(incompletePage, 'CASE A · incomplete onboarding', incompleteLogs.consoleMessages, incompleteLogs.pageErrors)
  const incompleteShot = path.join(outputDir, 'case-a-incomplete-onboarding.png')
  await incompletePage.screenshot({ path: incompleteShot, fullPage: true })
  results.push({
    caseId: 'CASE_A',
    startUrl: `${baseUrl}/billing`,
    finalUrl: incompletePage.url(),
    screenshot: incompleteShot,
    consoleMessages: incompleteLogs.consoleMessages,
    pageErrors: incompleteLogs.pageErrors,
  })
  await incompleteContext.close()

  const completeContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const completePage = await completeContext.newPage()
  const completeLogs = await collectProofPage(completePage)

  await completePage.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const requestPath = requestUrl.pathname.replace(/^\/api/, '')

    if (requestPath === '/v1/auth/login') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(createLoginPayload({
          onboardingCompletedAt: '2026-04-10T12:00:00.000Z',
        })),
      })
      return
    }

    if (requestPath === '/v1/risk/summary') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ riskScore: 0, trend: [] }),
      })
      return
    }

    if (requestPath.startsWith('/v1/alerts')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      })
      return
    }

    if (requestPath.startsWith('/v1/investigations')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
      return
    }

    if (requestPath === '/v1/health/pipeline') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ services: [] }),
      })
      return
    }

    if (requestPath === '/v1/billing/subscription') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          subscription: {
            planName: 'Growth',
            status: 'active',
          },
        }),
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })

  await completePage.goto(`${baseUrl}/onboarding`, { waitUntil: 'networkidle' })
  await expect(completePage).toHaveURL(/\/app\/login$/)
  await completePage.getByLabel('Email').fill('owner@zonforge.local')
  await completePage.getByLabel('Password').fill('correct-horse-battery-42')
  await completePage.getByRole('button', { name: 'Sign in' }).click()
  await expect(completePage).toHaveURL(/\/app\/customer-dashboard$/)
  await expect(completePage.getByText('Customer Workspace')).toBeVisible()
  await expect(completePage.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await decorateProofPage(completePage, 'CASE B · completed onboarding', completeLogs.consoleMessages, completeLogs.pageErrors)
  const completeShot = path.join(outputDir, 'case-b-completed-onboarding.png')
  await completePage.screenshot({ path: completeShot, fullPage: true })
  results.push({
    caseId: 'CASE_B',
    startUrl: `${baseUrl}/onboarding`,
    finalUrl: completePage.url(),
    screenshot: completeShot,
    consoleMessages: completeLogs.consoleMessages,
    pageErrors: completeLogs.pageErrors,
  })
  await completeContext.close()

  const billingContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await billingContext.addInitScript((persistedAuth) => {
    window.localStorage.setItem('zf-auth', JSON.stringify(persistedAuth))
    window.localStorage.setItem('zf_access_token', 'proof-access-token')
    window.localStorage.setItem('zf_refresh_token', 'proof-refresh-token')
  }, createPersistedAuthState({
    onboardingCompletedAt: '2026-04-10T12:00:00.000Z',
  }))

  const billingPage = await billingContext.newPage()
  const billingLogs = await collectProofPage(billingPage)

  await billingPage.goto(`${baseUrl}/billing`, { waitUntil: 'networkidle' })
  await expect(billingPage).toHaveURL(/\/app\/billing$/)
  await expect(billingPage.getByRole('heading', { name: 'Billing & Subscription' })).toBeVisible()
  await decorateProofPage(billingPage, 'CASE C · direct billing access', billingLogs.consoleMessages, billingLogs.pageErrors)
  const billingShot = path.join(outputDir, 'case-c-direct-billing.png')
  await billingPage.screenshot({ path: billingShot, fullPage: true })
  results.push({
    caseId: 'CASE_C',
    startUrl: `${baseUrl}/billing`,
    finalUrl: billingPage.url(),
    screenshot: billingShot,
    consoleMessages: billingLogs.consoleMessages,
    pageErrors: billingLogs.pageErrors,
  })
  await billingContext.close()

  await fs.writeFile(
    proofJson,
    JSON.stringify({
      baseUrl,
      results,
    }, null, 2),
    'utf8',
  )

  expect(results.map((result) => result.finalUrl)).toEqual([
    `${baseUrl}/onboarding`,
    `${baseUrl}/customer-dashboard`,
    `${baseUrl}/billing`,
  ])

  for (const result of results) {
    expect(result.pageErrors).toEqual([])
    expect(result.consoleMessages.filter((entry) => entry.startsWith('error:'))).toEqual([])
  }
})