import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = 'https://zonforge.com'
const outputDir = path.resolve('proof/runs/serial-hotfix-cust-route-01-live')

const seededUser = {
  id: 'cust-001',
  email: 'customer@zonforge.com',
  name: 'Customer Team',
  role: 'customer-admin',
  tenantId: 'tenant-001',
  mfaEnabled: true,
}

const riskPayload = {
  postureScore: 68,
  openCriticalAlerts: 2,
  openHighAlerts: 4,
  avgUserRiskScore: 54,
  topRiskUserIds: ['user-1', 'user-2'],
  topRiskAssetIds: ['asset-1', 'asset-2', 'asset-3'],
  connectorHealthScore: 91,
  mttdP50Minutes: 18,
  calculatedAt: new Date().toISOString(),
  trend: [42, 47, 51, 56, 61, 64, 68],
}

const alertsPayload = {
  items: [
    {
      id: 'alert-1',
      title: 'Suspicious privileged login from new geography',
      severity: 'critical',
      priority: 'P1',
      status: 'open',
      affectedIp: '185.22.1.40',
      mitreTactics: ['Initial Access'],
      mitreTechniques: ['T1078'],
      createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
  ],
}

const investigationsPayload = [
  {
    id: 'inv-1',
    alertId: 'alert-1',
    alertTitle: 'Suspicious privileged login from new geography',
    status: 'investigating',
    confidence: 87,
    executiveSummary: 'Privileged access pattern deviates from baseline and overlaps with impossible-travel indicators.',
    createdAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
  },
]

const healthPayload = {
  connectors: {
    total: 3,
    healthy: 2,
    degraded: 1,
    error: 0,
    details: [
      { id: 'api-connector', name: 'API', status: 'healthy', lastEventAt: new Date().toISOString() },
      { id: 'ingestion-connector', name: 'Ingestion', status: 'degraded', lastEventAt: new Date(Date.now() - 8 * 60_000).toISOString() },
      { id: 'detection-connector', name: 'Detection', status: 'healthy', lastEventAt: new Date().toISOString() },
    ],
  },
  queues: {
    ingestion: { waiting: 2, active: 1, failed: 0, lagEstimateMs: 1500 },
    detection: { waiting: 0, active: 2, failed: 0, lagEstimateMs: 500 },
  },
  summary: { overallStatus: 'healthy' },
}

await fs.mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
const consoleErrors = []

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text())
  }
})

await page.route('**/api/v1/auth/login', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ accessToken: 'proof-token', refreshToken: 'proof-refresh' }),
  })
})

await page.route('**/api/v1/auth/me', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(seededUser),
  })
})

await page.route('**/api/v1/risk/summary', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: riskPayload }) })
})

await page.route('**/api/v1/alerts*', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: alertsPayload }) })
})

await page.route('**/api/v1/investigations*', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: investigationsPayload }) })
})

await page.route('**/api/v1/health/pipeline', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: healthPayload }) })
})

await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', seededUser.email)
await page.fill('input[type="password"]', 'Password123!')
await page.click('button[type="submit"]')
await page.waitForURL((url) => url.pathname === '/customer-dashboard', { timeout: 120000, waitUntil: 'commit' })
await page.waitForSelector('text=Security Dashboard')
await page.screenshot({ path: path.join(outputDir, 'post-login-customer-dashboard.png'), fullPage: true })

const postLoginUrl = new URL(page.url()).pathname

await page.goto(`${baseUrl}/customer`, { waitUntil: 'networkidle' })
await page.waitForURL((url) => url.pathname === '/customer-dashboard', { timeout: 120000, waitUntil: 'commit' })
await page.screenshot({ path: path.join(outputDir, 'customer-redirect.png'), fullPage: true })
const customerRedirectUrl = new URL(page.url()).pathname

await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' })
await page.screenshot({ path: path.join(outputDir, 'dashboard-still-works.png'), fullPage: true })
const dashboardBody = await page.locator('body').innerText()

const report = {
  baseUrl,
  loginRoute: '/login',
  postLoginTarget: postLoginUrl,
  customerRedirectTarget: customerRedirectUrl,
  dashboardStillWorks: !/page not found/i.test(dashboardBody),
  consoleErrors,
  screenshots: {
    postLoginCustomerDashboard: path.join(outputDir, 'post-login-customer-dashboard.png'),
    customerRedirect: path.join(outputDir, 'customer-redirect.png'),
    dashboardStillWorks: path.join(outputDir, 'dashboard-still-works.png'),
  },
  capturedAt: new Date().toISOString(),
}

await fs.writeFile(path.join(outputDir, 'proof-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

await browser.close()