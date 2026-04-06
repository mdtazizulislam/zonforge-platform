import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:4173'
const outputDir = path.resolve('proof/runs/serial-ui-cust-01b')

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
      mitreTactics: ['Credential Access'],
      mitreTechniques: ['T1552'],
      mttdSlaBreached: false,
      createdAt: new Date(Date.now() - 130 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 80 * 60_000).toISOString(),
    },
    {
      id: 'alert-3',
      tenantId: 'tenant-001',
      title: 'Endpoint beaconing to newly observed domain',
      severity: 'high',
      priority: 'P2',
      status: 'investigating',
      mitreTactics: ['Command and Control'],
      mitreTechniques: ['T1071'],
      mttdSlaBreached: false,
      createdAt: new Date(Date.now() - 240 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 120 * 60_000).toISOString(),
    },
    {
      id: 'alert-4',
      tenantId: 'tenant-001',
      title: 'Unexpected admin role assignment detected',
      severity: 'medium',
      priority: 'P3',
      status: 'open',
      mitreTactics: ['Privilege Escalation'],
      mitreTechniques: ['T1098'],
      mttdSlaBreached: false,
      createdAt: new Date(Date.now() - 360 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 180 * 60_000).toISOString(),
    },
    {
      id: 'alert-5',
      tenantId: 'tenant-001',
      title: 'Inactive connector missed scheduled poll window',
      severity: 'low',
      priority: 'P4',
      status: 'open',
      mitreTactics: ['Collection'],
      mitreTechniques: ['T1005'],
      mttdSlaBreached: false,
      createdAt: new Date(Date.now() - 520 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 400 * 60_000).toISOString(),
    },
  ],
  totalCount: 5,
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
  {
    id: 'inv-3',
    tenantId: 'tenant-001',
    alertId: 'alert-3',
    alertTitle: 'Endpoint beaconing to newly observed domain',
    status: 'completed',
    confidence: 72,
    summary: 'Beaconing pattern contained after connector-level enrichment linked the domain to known malware hosting.',
    createdAt: new Date(Date.now() - 420 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 210 * 60_000).toISOString(),
  },
]

const healthPayload = {
  connectors: {
    total: 3,
    healthy: 2,
    degraded: 1,
    error: 0,
    details: [
      {
        id: 'api-connector',
        name: 'API',
        type: 'service',
        status: 'healthy',
        lastPollAt: new Date().toISOString(),
        lastEventAt: new Date().toISOString(),
        lastErrorMessage: null,
        consecutiveErrors: 0,
        eventRatePerHour: 120,
        isHealthy: true,
        lagMinutes: 0,
      },
      {
        id: 'ingestion-connector',
        name: 'Ingestion',
        type: 'pipeline',
        status: 'degraded',
        lastPollAt: new Date().toISOString(),
        lastEventAt: new Date(Date.now() - 8 * 60_000).toISOString(),
        lastErrorMessage: 'Lag increased after connector retry burst',
        consecutiveErrors: 1,
        eventRatePerHour: 88,
        isHealthy: false,
        lagMinutes: 8,
      },
      {
        id: 'detection-connector',
        name: 'Detection',
        type: 'service',
        status: 'healthy',
        lastPollAt: new Date().toISOString(),
        lastEventAt: new Date().toISOString(),
        lastErrorMessage: null,
        consecutiveErrors: 0,
        eventRatePerHour: 63,
        isHealthy: true,
        lagMinutes: 1,
      },
    ],
  },
  queues: {
    ingestion: { waiting: 2, active: 1, failed: 0, lagEstimateMs: 1500 },
    detection: { waiting: 0, active: 2, failed: 0, lagEstimateMs: 500 },
  },
  summary: { overallStatus: 'healthy' },
}

async function run() {
  await fs.mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
  const consoleErrors = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.addInitScript((user) => {
    window.localStorage.setItem('zf_access_token', 'proof-token')
    window.localStorage.setItem('zf-auth', JSON.stringify({
      state: {
        user,
        isLoggedIn: true,
      },
      version: 0,
    }))
  }, seededUser)

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

  await page.goto(`${baseUrl}/customer-dashboard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Security Dashboard')
  await page.screenshot({ path: path.join(outputDir, 'customer-dashboard.png'), fullPage: true })

  await page.goto(`${baseUrl}/customer`, { waitUntil: 'networkidle' })
  await page.waitForURL('**/customer-dashboard')
  await page.screenshot({ path: path.join(outputDir, 'customer-redirect.png'), fullPage: true })

  const report = {
    baseUrl,
    dashboardRoute: '/customer-dashboard',
    redirectRoute: '/customer',
    redirectTarget: new URL(page.url()).pathname,
    redirectWorked: new URL(page.url()).pathname === '/customer-dashboard',
    screenshots: {
      dashboard: path.join(outputDir, 'customer-dashboard.png'),
      redirect: path.join(outputDir, 'customer-redirect.png'),
    },
    consoleErrors,
    capturedAt: new Date().toISOString(),
  }

  await fs.writeFile(path.join(outputDir, 'proof-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))

  await browser.close()
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})