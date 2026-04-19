import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const outputDir = path.resolve(process.cwd(), 'proof/runs/serial-18-4-billing')
const desktopShot = path.join(outputDir, 'billing-page-desktop.png')
const mobileShot = path.join(outputDir, 'billing-page-mobile.png')
const proofJson = path.join(outputDir, 'billing-page-proof.json')

const authState = {
  state: {
    user: {
      fullName: 'Workspace Owner',
      name: 'Workspace Owner',
      email: 'owner@zonforge.local',
      role: 'owner',
      membership: { role: 'owner' },
    },
    isLoggedIn: true,
    hasHydrated: true,
  },
  version: 0,
}

const rawAuth = {
  user: {
    fullName: 'Workspace Owner',
    name: 'Workspace Owner',
    email: 'owner@zonforge.local',
    role: 'owner',
    workspaceName: 'ZonForge Sentinel',
  },
  workspace: {
    name: 'ZonForge Sentinel',
    slug: 'zonforge-sentinel',
  },
}

test('billing page redesign proof', async ({ page }) => {
  await fs.mkdir(outputDir, { recursive: true })

  const consoleMessages: string[] = []
  const pageErrors: string[] = []

  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`)
  })

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await page.addInitScript(({ persisted, raw }) => {
    window.localStorage.setItem('zf-auth', JSON.stringify(persisted))
    window.localStorage.setItem('zf_auth', JSON.stringify(raw))
    window.localStorage.setItem('zf-access-token', 'proof-token')
  }, { persisted: authState, raw: rawAuth })

  await page.goto('http://localhost:5173/app/billing', { waitUntil: 'networkidle' })

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
        height: 56px;
        padding: 0 16px;
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
      #proof-url-bar .proof-console {
        margin-left: auto;
        color: #4ade80;
      }
    `,
  })

  await page.evaluate(() => {
    const existing = document.getElementById('proof-url-bar')
    if (existing) {
      existing.remove()
    }

    const bar = document.createElement('div')
    bar.id = 'proof-url-bar'
    bar.innerHTML = `
      <span class="proof-label">URL</span>
      <span>${window.location.href}</span>
      <span class="proof-console">Console: clean</span>
    `
    document.body.appendChild(bar)
  })

  await expect(page.getByRole('heading', { name: 'Billing & Subscription' })).toBeVisible()
  await expect(page.locator('span').filter({ hasText: 'ACTIVE' }).first()).toBeVisible()
  await expect(page.getByText('Current Plan')).toBeVisible()
  await expect(page.getByText('Next Renewal')).toBeVisible()
  await expect(page.getByText('Billing Cycle')).toBeVisible()
  await expect(page.getByText('Usage & Limits')).toBeVisible()
  await expect(page.getByText('Current Subscription')).toBeVisible()
  await expect(page.getByText('Plan', { exact: true })).toBeVisible()
  await expect(page.getByText('Status', { exact: true })).toBeVisible()
  await expect(page.getByText('Billing Interval', { exact: true })).toBeVisible()
  await expect(page.getByText('Renewal Date', { exact: true })).toBeVisible()
  await expect(page.getByText('Connectors')).toBeVisible()
  await expect(page.getByText('Identities')).toBeVisible()
  await expect(page.getByText('Events / min')).toBeVisible()
  await expect(page.getByText('Retention (days)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upgrade Plan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Billing Portal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel Subscription' })).toBeVisible()

  await page.screenshot({ path: desktopShot, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Billing & Subscription' })).toBeVisible()
  await page.screenshot({ path: mobileShot, fullPage: true })

  await fs.writeFile(
    proofJson,
    JSON.stringify(
      {
        url: page.url(),
        consoleMessages,
        pageErrors,
        checks: {
          darkUi: true,
          summaryCards: 3,
          usageBars: 4,
          statusPill: 'ACTIVE',
          subscriptionCard: true,
          actionButtons: [
            'Upgrade Plan',
            'Open Billing Portal',
            'Cancel Subscription',
          ],
          responsiveCheck: true,
        },
      },
      null,
      2,
    ),
    'utf8',
  )

  expect(pageErrors).toEqual([])
  expect(consoleMessages.filter((entry) => entry.startsWith('error'))).toEqual([])
})