import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:4174'
const mockSignupPayload = {
  success: true,
  user: {
    id: '701',
    email: 'owner@acme.com',
    fullName: 'John Doe',
    name: 'John Doe',
    status: 'active',
    emailVerified: false,
  },
  tenant: {
    id: '9001',
    name: 'Acme Security',
    slug: 'acme-security',
    plan: 'starter',
    onboardingStatus: 'pending',
  },
  membership: {
    role: 'owner',
  },
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
}

const mockOnboardingPayload = {
  tenantId: '9001',
  onboardingStatus: 'pending',
  steps: [
    { stepKey: 'workspace_created', isComplete: true, payload: { source: 'signup' } },
    { stepKey: 'connect_environment', isComplete: false, payload: null },
    { stepKey: 'invite_team', isComplete: false, payload: null },
  ],
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })

await page.route('**/api/v1/auth/signup', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockSignupPayload),
  })
})

await page.route('**/api/v1/onboarding/status', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockOnboardingPayload),
  })
})

await page.goto(`${baseUrl}/signup`, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'proof/runs/serial-07-signup-page.png', fullPage: true })

await page.getByLabel('Full name').fill('John Doe')
await page.getByLabel('Workspace name').fill('Acme Security')
await page.getByLabel('Work email').fill('owner@acme.com')
await page.getByLabel('Password').fill('StrongPass123')
await page.getByRole('button', { name: 'Create workspace' }).click()

await page.waitForURL('**/onboarding')
await page.waitForSelector('text=Acme Security is ready.')
await page.screenshot({ path: 'proof/runs/serial-07-signup-success-redirect.png', fullPage: true })

await page.goto(`${baseUrl}/onboarding`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Workspace onboarding')
await page.screenshot({ path: 'proof/runs/serial-07-onboarding-page.png', fullPage: true })

await browser.close()