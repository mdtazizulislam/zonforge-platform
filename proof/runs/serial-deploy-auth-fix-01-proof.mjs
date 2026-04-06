import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = 'https://zonforge.com'
const outDir = path.resolve('c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/serial-deploy-auth-fix-01')

await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  colorScheme: 'dark',
  ignoreHTTPSErrors: true,
})

const networkEntries = []
const seenEntries = new Set()

context.on('response', async (response) => {
  const url = response.url()
  if (!url.includes('/app/assets/') || !url.endsWith('.js')) return

  const key = `${response.request().method()} ${url}`
  if (seenEntries.has(key)) return
  seenEntries.add(key)

  networkEntries.push({
    url,
    status: response.status(),
    resourceType: response.request().resourceType(),
  })
})

function normalizeRoute(route) {
  return route.replace(/^\//, '')
}

async function captureAuthRoute(route) {
  const page = await context.newPage()
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 120000 })

  const submitButton = page.locator('button[type="submit"]').first()
  const hasSubmitButton = await submitButton.count()

  const pageChecks = await page.evaluate(() => {
    const bodyStyles = window.getComputedStyle(document.body)
    const button = document.querySelector('button[type="submit"]')
    const buttonStyles = button ? window.getComputedStyle(button) : null
    const bodyText = document.body.innerText || ''

    return {
      title: document.title,
      backgroundColor: bodyStyles.backgroundColor,
      bodySample: bodyText.slice(0, 1200),
      darkUi: !/rgb\(255, 255, 255\)|rgba\(255, 255, 255, 1\)/.test(bodyStyles.backgroundColor),
      hasLegacySignupForm: Boolean(document.querySelector('#signup-form')),
      hasAuthShell: Boolean(document.querySelector('.zf-auth-page')),
      hasGradientButton: buttonStyles ? buttonStyles.backgroundImage !== 'none' : false,
      submitText: button ? button.textContent?.trim() ?? '' : '',
    }
  })

  const screenshotPath = path.join(outDir, `${normalizeRoute(route)}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })

  const result = {
    route,
    finalUrl: page.url(),
    screenshotPath,
    hasSubmitButton: Boolean(hasSubmitButton),
    ...pageChecks,
  }

  await page.close()
  return result
}

const login = await captureAuthRoute('/login')
const signup = await captureAuthRoute('/signup')

const relevantEntries = networkEntries
  .filter((entry) => /index-|LoginPage-|SignupPage-|AuthCard-/.test(entry.url))
  .sort((left, right) => left.url.localeCompare(right.url))

const reportPage = await context.newPage()
await reportPage.setViewportSize({ width: 1480, height: 980 })
await reportPage.setContent(`
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Auth Network Proof</title>
      <style>
        body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #111827; color: #e5e7eb; }
        .shell { padding: 24px; }
        .title { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
        .sub { color: #9ca3af; margin-bottom: 18px; }
        .panel { border: 1px solid #374151; background: #0f172a; border-radius: 12px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid #1f2937; }
        th { background: #111827; color: #93c5fd; }
        .ok { color: #34d399; font-weight: 700; }
        .warn { color: #f59e0b; font-weight: 700; }
        .mono { font-family: Consolas, monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="shell">
        <div class="title">Auth Deploy Network Proof</div>
        <div class="sub">Live JS requests captured from fresh incognito-like pages for /login and /signup.</div>
        <div class="panel">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Resource</th>
                <th>Type</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              ${relevantEntries.map((entry) => {
                const label = entry.status === 200 ? 'OK' : String(entry.status)
                const klass = entry.status === 200 ? 'ok' : 'warn'
                const resource = entry.url.split('/').pop() ?? entry.url
                return `<tr><td class="${klass}">${label}</td><td class="mono">${resource}</td><td>${entry.resourceType}</td><td class="mono">${entry.url}</td></tr>`
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </body>
  </html>
`, { waitUntil: 'load' })

const networkScreenshotPath = path.join(outDir, 'network-proof.png')
await reportPage.screenshot({ path: networkScreenshotPath, fullPage: true })
await reportPage.close()

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  login,
  signup,
  relevantEntries,
  checks: {
    loginDarkUi: login.darkUi,
    signupDarkUi: signup.darkUi,
    loginGradientButton: login.hasGradientButton,
    signupGradientButton: signup.hasGradientButton,
    signupLegacyFormRemoved: !signup.hasLegacySignupForm,
    hasIndexBundle: relevantEntries.some((entry) => /index-/.test(entry.url)),
    hasLoginChunk: relevantEntries.some((entry) => /LoginPage-/.test(entry.url)),
    hasSignupChunk: relevantEntries.some((entry) => /SignupPage-/.test(entry.url)),
    hasAuthCardChunk: relevantEntries.some((entry) => /AuthCard-/.test(entry.url)),
    oldChunkAbsent: !relevantEntries.some((entry) => /LoginPage-C7VT0LV_/.test(entry.url)),
  },
  artifacts: {
    loginScreenshot: login.screenshotPath,
    signupScreenshot: signup.screenshotPath,
    networkScreenshot: networkScreenshotPath,
  },
}

const reportPath = path.join(outDir, 'proof-report.json')
await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

await context.close()
await browser.close()

console.log(reportPath)