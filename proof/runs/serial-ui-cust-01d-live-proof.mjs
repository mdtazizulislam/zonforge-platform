import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = 'https://zonforge.com'
const outputDir = path.resolve('proof/runs/serial-ui-cust-01d-live')

const seededUser = {
  id: 'cust-001',
  email: 'owner@example.com',
  name: 'Customer Owner',
  role: 'Owner',
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
    },
    {
      id: 'alert-2',
      tenantId: 'tenant-001',
      title: 'Public cloud key exposed in CI artifact',
      severity: 'high',
      priority: 'P2',
      status: 'open',
      affectedIp: '34.71.99.14',
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

await fs.mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } })
const page = await context.newPage()
const consoleErrors = []
const pageErrors = []

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text())
  }
})

page.on('pageerror', (error) => {
  pageErrors.push(error.message)
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
    state: { user, isLoggedIn: true },
    version: 0,
  }))
}, seededUser)

async function capture(routePath, selector, screenshotName) {
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.waitForSelector(selector, { timeout: 30000 })
  await page.screenshot({ path: path.join(outputDir, screenshotName), fullPage: true })
  return {
    routePath,
    url: page.url(),
    title: await page.locator('.zf-customer-header__title').textContent().catch(() => null),
  }
}

const captures = {
  dashboard: await capture('/customer-dashboard', 'text=Security Dashboard', 'customer-dashboard-live.png'),
  alerts: await capture('/customer-alerts', 'text=Customer Alerts', 'customer-alerts-live.png'),
  investigations: await capture('/customer-investigations', 'text=Customer Investigations', 'customer-investigations-live.png'),
  aiAssistant: await capture('/customer-ai-assistant', 'text=Customer AI Assistant', 'customer-ai-assistant-live.png'),
  billing: await capture('/customer-billing', 'text=Customer Billing', 'customer-billing-live.png'),
  settings: await capture('/customer-settings', 'text=Customer Settings', 'customer-settings-live.png'),
}

const report = {
  timestamp: new Date().toISOString(),
  baseUrl,
  captures,
  consoleErrors,
  pageErrors,
}

await fs.writeFile(path.join(outputDir, 'proof-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
await browser.close()

if (consoleErrors.length || pageErrors.length) {
  console.log(JSON.stringify(report, null, 2))
}