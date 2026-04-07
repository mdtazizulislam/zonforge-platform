const { test, expect } = require('playwright/test')
const fs = require('node:fs')
const path = require('node:path')

const proofPath = path.resolve(__dirname, 'serial-10-api-proof.json')
const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'))
const baseUrl = 'http://127.0.0.1:5175'

function buildStoredUser(payload) {
  return {
    ...payload.user,
    tenantId: payload.tenant.id,
    tenant: payload.tenant,
    membership: payload.membership,
    onboardingStatus: payload.tenant.onboardingStatus,
    mfaEnabled: false,
  }
}

async function seedSession(page, payload) {
  const storedUser = buildStoredUser(payload)
  await page.addInitScript((session) => {
    window.localStorage.setItem('zf_access_token', session.accessToken)
    window.localStorage.setItem('zf_refresh_token', session.refreshToken)
    window.localStorage.setItem('zf-auth', JSON.stringify({
      state: {
        user: session.user,
        isLoggedIn: true,
      },
      version: 0,
    }))
  }, {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: storedUser,
  })
}

test('capture owner connector management UI', async ({ page }) => {
  await seedSession(page, proof.ownerSignup.Body)
  await page.goto(`${baseUrl}/connectors`, { waitUntil: 'networkidle' })
  await expect(page.getByText('Secure connector records for AWS, Microsoft 365, and Google Workspace.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Connector' })).toBeVisible()
  await page.screenshot({ path: path.resolve(__dirname, 'serial-10-connectors-owner.png'), fullPage: true })
})

test('capture analyst read-only connector UI', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } })
  const page = await context.newPage()
  await seedSession(page, proof.acceptAnalyst.Body)
  await page.goto(`${baseUrl}/connectors`, { waitUntil: 'networkidle' })
  await expect(page.getByText('Read-only access')).toBeVisible()
  await expect(page.getByText('Connector management is restricted to workspace owners and admins.')).toBeVisible()
  await page.screenshot({ path: path.resolve(__dirname, 'serial-10-connectors-analyst.png'), fullPage: true })
  await context.close()
})
