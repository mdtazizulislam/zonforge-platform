import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173'
const outDir = path.resolve('proof', 'runs', 'serial-ui-cust-01a')

await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
const consoleErrors = []

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text())
  }
})

await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
await page.waitForLoadState('networkidle')
const loginHeading = await page.locator('.zf-auth-card h1').textContent()
await page.screenshot({ path: path.join(outDir, 'login.png'), fullPage: true })

await page.getByRole('link', { name: 'Create one' }).click()
await page.waitForURL('**/signup', { timeout: 30000 })
await page.waitForLoadState('networkidle')
const signupHeading = await page.locator('.zf-auth-card h1').textContent()
await page.screenshot({ path: path.join(outDir, 'signup.png'), fullPage: true })

await page.getByRole('link', { name: 'Sign in' }).click()
await page.waitForURL('**/login', { timeout: 30000 })
const returnedToLogin = page.url().endsWith('/login')

const report = {
  baseUrl,
  loginRoute: '/login',
  signupRoute: '/signup',
  loginHeading,
  signupHeading,
  returnedToLogin,
  screenshots: {
    login: path.join(outDir, 'login.png'),
    signup: path.join(outDir, 'signup.png'),
  },
  consoleErrors,
  capturedAt: new Date().toISOString(),
}

await fs.writeFile(path.join(outDir, 'proof-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

await browser.close()
console.log(JSON.stringify(report, null, 2))