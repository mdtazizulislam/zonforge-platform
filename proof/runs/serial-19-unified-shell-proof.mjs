import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173/app'
const outputDir = path.resolve('c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/serial-19-unified-shell')
await fs.mkdir(outputDir, { recursive: true })

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  consoleErrors: [],
  pages: {},
}

const users = {
  customer: {
    id: 'cust-001',
    email: 'analyst@zonforge.local',
    name: 'Security Analyst',
    fullName: 'Security Analyst',
    role: 'SECURITY_ANALYST',
    membership: { role: 'SECURITY_ANALYST' },
    onboardingStatus: 'completed',
    tenant: { id: 'tenant-1', name: 'ZonForge Sentinel', onboardingStatus: 'completed', onboardingCompletedAt: new Date().toISOString() },
  },
  admin: {
    id: 'admin-001',
    email: 'admin@zonforge.local',
    name: 'Tenant Admin',
    fullName: 'Tenant Admin',
    role: 'TENANT_ADMIN',
    membership: { role: 'TENANT_ADMIN' },
    onboardingStatus: 'completed',
    tenant: { id: 'tenant-1', name: 'ZonForge Sentinel', onboardingStatus: 'completed', onboardingCompletedAt: new Date().toISOString() },
  },
  superadmin: {
    id: 'super-001',
    email: 'super@zonforge.local',
    name: 'Super Admin',
    fullName: 'Super Admin',
    role: 'SUPER_ADMIN',
    membership: { role: 'SUPER_ADMIN' },
    onboardingStatus: 'completed',
    tenant: { id: 'tenant-platform', name: 'ZonForge Platform', onboardingStatus: 'completed', onboardingCompletedAt: new Date().toISOString() },
  },
}

const billingPayload = {
  subscription: {
    planTier: 'Growth',
    status: 'active',
    currentPeriodStart: new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString(),
    currentPeriodEnd: new Date(Date.now() + 23 * 24 * 60 * 60_000).toISOString(),
    trialEndsAt: null,
  },
  usage: {
    planTier: 'Growth',
    usage: {
      alerts: { current: 214, limit: 500 },
      investigations: { current: 14, limit: 50 },
      connectors: { current: 3, limit: 5 },
    },
    features: { aiAssistant: true, investigations: true },
    retentionDays: 90,
  },
}

function persistAuth(user) {
  return JSON.stringify({
    state: {
      user,
      isLoggedIn: true,
      hasHydrated: true,
    },
    version: 0,
  })
}

async function seedAuth(page, user) {
  await page.addInitScript((payload) => {
    window.localStorage.setItem('zf-auth', payload.auth)
    window.localStorage.setItem('zf_auth', JSON.stringify({ user: payload.user, workspace: { name: payload.user?.tenant?.name ?? 'ZonForge Sentinel' } }))
    window.localStorage.setItem('zf_access_token', 'proof-token')
    window.localStorage.setItem('zf_refresh_token', 'proof-refresh')
  }, { auth: persistAuth(user), user })
}

async function installApiMocks() {
  return
}

async function captureRolePage(context, key, routePath, user, expectations, screenshotName) {
  const page = await context.newPage()
  await installApiMocks(page, user)
  await seedAuth(page, user)

  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.consoleErrors.push({ type: message.type(), text: message.text(), route: routePath })
    }
  })

  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    (expected) => document.body.innerText.toLowerCase().includes(String(expected).toLowerCase()),
    expectations[0],
    { timeout: 20000 },
  ).catch(() => undefined)
  await page.waitForTimeout(800)

  const text = await page.locator('body').innerText()
  const pathname = new URL(page.url()).pathname

  for (const expected of expectations) {
    if (!text.includes(expected)) {
      throw new Error(`${key} page is missing expected navigation/content: ${expected}. Final path: ${pathname}`)
    }
  }

  const screenshotPath = path.join(outputDir, screenshotName)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  report.pages[key] = {
    routePath,
    finalPath: pathname,
    screenshot: screenshotPath,
    matchedExpectations: expectations,
  }

  await page.close()
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' })

try {
  await captureRolePage(
    context,
    'dashboard',
    '/customer-dashboard',
    users.customer,
    ['Security Dashboard', 'Alerts', 'Billing', 'Settings'],
    'dashboard.png',
  )

  await captureRolePage(
    context,
    'billing',
    '/billing',
    users.customer,
    ['Billing'],
    'billing.png',
  )

  await captureRolePage(
    context,
    'admin',
    '/admin',
    users.admin,
    ['Admin Panel', 'Overview', 'Users', 'Billing'],
    'admin.png',
  )

  await captureRolePage(
    context,
    'superadmin',
    '/superadmin',
    users.superadmin,
    ['Super Admin', 'Platform Overview', 'Tenants', 'Billing'],
    'superadmin.png',
  )

  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await context.close()
  await browser.close()
}
