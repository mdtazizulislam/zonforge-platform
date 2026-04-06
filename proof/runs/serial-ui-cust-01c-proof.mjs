import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173/app'
const outputDir = path.resolve('proof/runs/serial-ui-cust-01c')

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
      tenantId: 'tenant-001',
      title: 'Suspicious privileged login from new geography',
      severity: 'critical',
      priority: 'P1',
      status: 'open',
      affectedIp: '185.22.1.40',
      mitreTactics: ['Initial Access'],
      mitreTechniques: ['T1078'],
      mttdSlaBreached: true,
      createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
    {
      id: 'alert-2',
      tenantId: 'tenant-001',
      title: 'Public cloud key exposed in CI artifact',
      severity: 'high',
      priority: 'P2',
      status: 'open',
      affectedIp: '34.71.99.14',
      mitreTactics: ['Credential Access'],
      mitreTechniques: ['T1552'],
      mttdSlaBreached: false,
      createdAt: new Date(Date.now() - 130 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 80 * 60_000).toISOString(),
    },
  ],
  totalCount: 2,
  nextCursor: null,
  hasMore: false,
}

const investigationsPayload = [
  {
    id: 'inv-1',
    tenantId: 'tenant-001',
    alertId: 'alert-1',
    alertTitle: 'Suspicious privileged login from new geography',
    status: 'investigating',
    confidence: 87,
    executiveSummary: 'Privileged access pattern deviates from baseline and overlaps with impossible-travel indicators.',
    createdAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
  },
  {
    id: 'inv-2',
    tenantId: 'tenant-001',
    alertId: 'alert-2',
    alertTitle: 'Public cloud key exposed in CI artifact',
    status: 'awaiting_approval',
    confidence: 76,
    summary: 'Credential exposure likely originated from a build artifact and requires rotation confirmation.',
    createdAt: new Date(Date.now() - 240 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 75 * 60_000).toISOString(),
  },
]

const investigationStatsPayload = {
  totalInvestigations: 14,
  truePositives: 9,
  falsePositives: 2,
  pendingReview: 3,
  tpRate: 0.64,
  fpRate: 0.14,
  period: '30d',
}

const assistantSuggestionsPayload = {
  suggestions: [
    'Summarize the highest-priority customer risks from the last 24 hours.',
    'Explain which alert sources are driving the most executive attention.',
    'Describe what changed in connector health this morning.',
  ],
}

const usagePayload = {
  planTier: 'Growth',
  usage: {
    alerts: { current: 214, limit: 500 },
    investigations: { current: 14, limit: 50 },
    connectors: { current: 3, limit: 5 },
  },
  features: { aiAssistant: true, investigations: true },
  retentionDays: 90,
}

const subscriptionPayload = {
  planTier: 'Growth',
  status: 'active',
  currentPeriodStart: new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString(),
  currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60_000).toISOString(),
  trialEndsAt: null,
}

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

const routeChecks = [
  { path: '/customer-alerts', heading: 'Customer Alerts', screenshot: 'customer-alerts.png' },
  { path: '/customer-investigations', heading: 'Customer Investigations', screenshot: 'customer-investigations.png' },
  { path: '/customer-ai-assistant', heading: 'Customer AI Assistant', screenshot: 'customer-ai-assistant.png' },
  { path: '/customer-billing', heading: 'Customer Billing', screenshot: 'customer-billing.png' },
  { path: '/customer-settings', heading: 'Customer Settings', screenshot: 'customer-settings.png' },
]

const sidebarExpectations = [
  { label: 'Dashboard', expectedPath: '/customer-dashboard', forbiddenPath: '/dashboard' },
  { label: 'Alerts', expectedPath: '/customer-alerts', forbiddenPath: '/alerts' },
  { label: 'Investigations', expectedPath: '/customer-investigations', forbiddenPath: '/investigations' },
  { label: 'AI Assistant', expectedPath: '/customer-ai-assistant', forbiddenPath: '/ai-assistant' },
  { label: 'Billing', expectedPath: '/customer-billing', forbiddenPath: '/billing' },
  { label: 'Settings', expectedPath: '/customer-settings', forbiddenPath: '/settings' },
]

function pathnameMatches(currentPathname, expectedPathname) {
  return currentPathname === expectedPathname || currentPathname.endsWith(expectedPathname)
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
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seededUser) })
})

await page.route('**/api/v1/risk/summary', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: riskPayload }) })
})

await page.route('**/api/v1/alerts*', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: alertsPayload }) })
})

await page.route('**/api/v1/investigations/stats', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: investigationStatsPayload }) })
})

await page.route('**/api/v1/investigations*', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: investigationsPayload }) })
})

await page.route('**/api/v1/assistant/suggestions', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: assistantSuggestionsPayload }) })
})

await page.route('**/api/v1/billing/usage', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: usagePayload }) })
})

await page.route('**/api/v1/billing/subscription', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: subscriptionPayload }) })
})

await page.route('**/api/v1/health/pipeline', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: healthPayload }) })
})

await page.addInitScript((user) => {
  window.localStorage.setItem('zf_access_token', 'proof-token')
  window.localStorage.setItem('zf_refresh_token', 'proof-refresh')
  window.localStorage.setItem('zf-auth', JSON.stringify({
    state: {
      user,
      isLoggedIn: true,
    },
    version: 0,
  }))
}, seededUser)

await page.goto(`${baseUrl}/customer-dashboard`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Security Dashboard')
await page.waitForSelector('.zf-customer-sidebar')
await page.screenshot({ path: path.join(outputDir, 'post-login-customer-dashboard.png'), fullPage: true })
await page.locator('.zf-customer-sidebar').screenshot({ path: path.join(outputDir, 'customer-sidebar.png') })

const postLoginTarget = new URL(page.url()).pathname
const visitedRoutes = [
  {
    path: postLoginTarget,
    heading: await page.locator('.zf-customer-header__title').textContent(),
    shellVisible: await page.locator('.zf-customer-sidebar').isVisible(),
    screenshot: path.join(outputDir, 'post-login-customer-dashboard.png'),
  },
]

const sidebarClickResults = []

for (const item of sidebarExpectations) {
  await page.goto(`${baseUrl}/customer-dashboard`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: item.label, exact: true }).click()
  await page.waitForFunction((pathname) => window.location.pathname.endsWith(pathname), item.expectedPath, { timeout: 120000 })

  const currentPath = new URL(page.url()).pathname
  const routedToExpected = pathnameMatches(currentPath, item.expectedPath)
  const routedToForbidden = pathnameMatches(currentPath, item.forbiddenPath)

  if (!routedToExpected || routedToForbidden) {
    throw new Error(`Sidebar link ${item.label} routed to ${currentPath} instead of ${item.expectedPath}`)
  }

  sidebarClickResults.push({
    label: item.label,
    expectedPath: item.expectedPath,
    actualPath: currentPath,
    forbiddenPath: item.forbiddenPath,
    routedToExpected,
    routedToForbidden,
  })
}

await page.goto(`${baseUrl}/customer`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.location.pathname.endsWith('/customer-dashboard'), { timeout: 120000 })
await page.screenshot({ path: path.join(outputDir, 'customer-redirect.png'), fullPage: true })
const customerRedirectTarget = new URL(page.url()).pathname

for (const route of routeChecks) {
  await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' })
  await page.waitForFunction((pathname) => window.location.pathname.endsWith(pathname), route.path, { timeout: 120000 })
  await page.waitForSelector(`text=${route.heading}`)
  const screenshotPath = path.join(outputDir, route.screenshot)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  visitedRoutes.push({
    path: route.path,
    heading: await page.locator('.zf-customer-header__title').textContent(),
    shellVisible: await page.locator('.zf-customer-sidebar').isVisible(),
    screenshot: screenshotPath,
  })
}

await page.goto(`${baseUrl}/customer-alerts`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Customer Alerts')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.location.pathname.endsWith('/customer-alerts'), { timeout: 120000 })
await page.waitForSelector('text=Customer Alerts')
await page.screenshot({ path: path.join(outputDir, 'customer-alerts-refresh.png'), fullPage: true })

const report = {
  baseUrl,
  loginRoute: '/login',
  postLoginTarget,
  customerRedirectTarget,
  customerRoutesVisited: visitedRoutes,
  sidebarClickResults,
  consoleErrors,
  screenshots: {
    customerSidebar: path.join(outputDir, 'customer-sidebar.png'),
    postLoginCustomerDashboard: path.join(outputDir, 'post-login-customer-dashboard.png'),
    customerAlerts: path.join(outputDir, 'customer-alerts.png'),
    customerAlertsRefresh: path.join(outputDir, 'customer-alerts-refresh.png'),
    customerRedirect: path.join(outputDir, 'customer-redirect.png'),
  },
  capturedAt: new Date().toISOString(),
}

await fs.writeFile(path.join(outputDir, 'proof-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

await browser.close()