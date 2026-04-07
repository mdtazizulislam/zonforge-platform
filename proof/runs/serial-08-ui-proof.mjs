import { chromium } from 'playwright'

const baseUrl = 'http://127.0.0.1:4174'
const runId = `serial08-ui-${Date.now()}`
const email = `${runId}@zonforge.com`
const password = 'SecurePass123!'
const workspaceName = `Serial 08 UI ${Date.now()}`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })

await page.goto(`${baseUrl}/signup`, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'proof/runs/serial-08-signup-page.png', fullPage: true })

await page.getByLabel('Full name').fill('Serial Eight UI')
await page.getByLabel('Workspace name').fill(workspaceName)
await page.getByLabel('Work email').fill(email)
await page.getByLabel('Password').fill(password)
await page.getByRole('button', { name: 'Create workspace' }).click()

await page.waitForURL('**/onboarding')
await page.waitForSelector('text=Workspace onboarding')
await page.screenshot({ path: 'proof/runs/serial-08-onboarding-page.png', fullPage: true })

await page.getByRole('button', { name: 'Start onboarding' }).click()
await page.waitForSelector('text=Welcome completed')
await page.getByRole('button', { name: 'Save environment selection' }).click()
await page.waitForSelector('text=Environment placeholder saved')
await page.screenshot({ path: 'proof/runs/serial-08-onboarding-progress.png', fullPage: true })

await page.getByRole('button', { name: 'Complete onboarding and open dashboard' }).click()
await page.waitForURL('**/dashboard')
await page.waitForSelector('text=No live tenant data is flowing yet.')
await page.screenshot({ path: 'proof/runs/serial-08-dashboard-page.png', fullPage: true })

console.log(JSON.stringify({ runId, email, workspaceName }, null, 2))

await browser.close()
