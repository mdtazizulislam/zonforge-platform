import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, devices } from 'playwright'

const email = process.env.VERIFY_EMAIL
const password = process.env.VERIFY_PASSWORD

if (!email || !password) {
  throw new Error('VERIFY_EMAIL and VERIFY_PASSWORD are required')
}

const outDir = path.resolve('c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/serial-live-dash-fix-01')
await fs.mkdir(outDir, { recursive: true })

const baseUrl = 'https://zonforge.com'
const routesToCheck = [
  '/dashboard',
  '/alerts',
  '/ai-assistant',
  '/investigations',
  '/compliance',
]

async function captureViewport(name, deviceConfig) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext(deviceConfig)
  const page = await context.newPage()

  const summary = {
    viewport: name,
    login: {},
    routes: [],
  }

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 120000 })
  await page.waitForLoadState('networkidle')

  const dashboardBody = await page.locator('body').innerText()
  const sidebarLabels = await page.locator('aside a, aside button, nav a').allInnerTexts().catch(() => [])
  const dashboardShot = path.join(outDir, `${name}-dashboard.png`)
  await page.screenshot({ path: dashboardShot, fullPage: true })

  summary.login = {
    url: page.url(),
    title: await page.title(),
    hasSidebar: await page.locator('aside').count() > 0,
    bodySample: dashboardBody.slice(0, 1200),
    sidebarLabels,
    screenshot: dashboardShot,
  }

  for (const route of routesToCheck) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
    const bodyText = await page.locator('body').innerText()
    const shotPath = path.join(outDir, `${name}-${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')}.png`)
    await page.screenshot({ path: shotPath, fullPage: true })
    summary.routes.push({
      route,
      finalUrl: page.url(),
      title: await page.title(),
      hasSidebar: await page.locator('aside').count() > 0,
      pageNotFound: /page not found/i.test(bodyText),
      showsLogin: /sign in to your account/i.test(bodyText),
      hasWorkspaceDashboardText: /workspace dashboard/i.test(bodyText),
      bodySample: bodyText.slice(0, 1200),
      screenshot: shotPath,
    })
  }

  await context.close()
  await browser.close()
  return summary
}

const desktop = await captureViewport('desktop', {
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
})

const mobile = await captureViewport('mobile', devices['iPhone 13'])

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  email,
  desktop,
  mobile,
}

const reportPath = path.join(outDir, 'live-e2e-report.json')
await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
console.log(reportPath)