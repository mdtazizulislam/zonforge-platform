import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
const email = process.env.VERIFY_EMAIL
const password = process.env.VERIFY_PASSWORD

if (!email || !password) {
  throw new Error('VERIFY_EMAIL and VERIFY_PASSWORD are required')
}

const outDir = path.resolve('proof', 'runs', 'serial-restore-original-01')
await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
const consoleErrors = []

page.on('console', message => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text())
  }
})

await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(email)
await page.locator('input[type="password"]').fill(password)
await page.getByRole('button', { name: 'Sign In' }).click()

await page.waitForURL('**/dashboard', { timeout: 30000 })
await page.waitForLoadState('networkidle')
await page.screenshot({ path: path.join(outDir, 'dashboard-restored.png'), fullPage: true })
const originalHeading = await page.locator('h1, h2').first().textContent()

await page.goto(`${baseUrl}/customer-dashboard`, { waitUntil: 'networkidle' })
await page.waitForLoadState('networkidle')
await page.screenshot({ path: path.join(outDir, 'customer-dashboard.png'), fullPage: true })
const customerHeading = await page.locator('h1, h2').first().textContent()

const report = {
  baseUrl,
  originalRoute: '/dashboard',
  customerRoute: '/customer-dashboard',
  originalHeading,
  customerHeading,
  screenshots: {
    dashboard: path.join(outDir, 'dashboard-restored.png'),
    customerDashboard: path.join(outDir, 'customer-dashboard.png'),
  },
  consoleErrors,
  capturedAt: new Date().toISOString(),
}

await fs.writeFile(
  path.join(outDir, 'proof-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
)

await browser.close()
console.log(JSON.stringify(report, null, 2))