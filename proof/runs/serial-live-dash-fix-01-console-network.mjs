import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const email = process.env.VERIFY_EMAIL
const password = process.env.VERIFY_PASSWORD

if (!email || !password) {
  throw new Error('VERIFY_EMAIL and VERIFY_PASSWORD are required')
}

const outDir = path.resolve('c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/serial-live-dash-fix-01')
await fs.mkdir(outDir, { recursive: true })

const baseUrl = 'https://zonforge.com'
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  email,
  consoleErrors: [],
  consoleWarnings: [],
  apiCalls: [],
  routes: [],
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await context.newPage()

page.on('console', msg => {
  const entry = {
    type: msg.type(),
    text: msg.text(),
    location: msg.location(),
  }

  if (msg.type() === 'error') {
    report.consoleErrors.push(entry)
  }

  if (msg.type() === 'warning') {
    report.consoleWarnings.push(entry)
  }
})

page.on('response', async response => {
  const url = response.url()
  if (!url.includes('/api/')) return

  report.apiCalls.push({
    url,
    status: response.status(),
    ok: response.ok(),
  })
})

async function visit(route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
  const bodyText = await page.locator('body').innerText()

  report.routes.push({
    route,
    finalUrl: page.url(),
    title: await page.title(),
    hasSidebar: await page.locator('aside').count() > 0,
    bodySample: bodyText.slice(0, 1200),
  })
}

await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.click('button[type="submit"]')
await page.waitForURL(/\/dashboard/, { timeout: 120000 })
await page.waitForLoadState('networkidle')

await visit('/dashboard')
await visit('/investigations')

const reportPath = path.join(outDir, 'live-console-network-report.json')
await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

await context.close()
await browser.close()

console.log(reportPath)