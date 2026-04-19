import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

const appOrigin = process.env.SERIAL181_APP_ORIGIN || 'http://127.0.0.1:4175'
const browserPath = process.env.SERIAL181_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browserPort = Number(process.env.SERIAL181_BROWSER_PORT || 9227)
const email = process.env.SERIAL181_EMAIL || 'serial17.1775680474@example.com'
const password = process.env.SERIAL181_PASSWORD || 'Serial17-Local-Proof!234'
const outputDir = path.resolve('proof', 'runs', 'serial-18-1-flow')

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await fn()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${label}`)
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl)
    this.nextId = 1
    this.pending = new Map()

    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })

    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString())
      if (typeof message.id !== 'number') return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message))
      } else {
        pending.resolve(message.result)
      }
    })
  }

  async connect() {
    await this.ready
  }

  send(method, params = {}) {
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.socket.send(payload)
    return promise
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close()
    }
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  })
  return result.result?.value
}

async function capture(client, fileName) {
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  })
  const fullPath = path.join(outputDir, fileName)
  await writeFile(fullPath, Buffer.from(screenshot.data, 'base64'))
  return fullPath
}

async function captureFailureState(client, fileName, label) {
  const screenshotPath = await capture(client, fileName)
  const state = await snapshot(client, label)
  return { screenshotPath, state }
}

async function snapshot(client, label) {
  const value = await evaluate(client, `JSON.stringify({ label: ${JSON.stringify(label)}, url: location.href, title: document.title, body: document.body.innerText.slice(0, 5000) })`)
  return JSON.parse(value ?? '{}')
}

async function clickLink(client, href) {
  return evaluate(client, `(() => {
    const link = document.querySelector(${JSON.stringify(`a[href="${href}"]`)})
    if (!link) return false
    link.click()
    return true
  })()`)
}

async function clickButtonByText(client, text) {
  return evaluate(client, `(() => {
    const candidates = Array.from(document.querySelectorAll('button, a'))
    const target = candidates.find((element) => element.textContent && element.textContent.trim() === ${JSON.stringify(text)})
    if (!target) return false
    target.click()
    return true
  })()`)
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'serial18-1-flow-'))
  const browser = spawn(browserPath, [
    `--remote-debugging-port=${browserPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1600,1400',
    'about:blank',
  ], { stdio: 'ignore' })

  const waitForBrowserExit = () => new Promise((resolve) => {
    if (browser.exitCode !== null) {
      resolve(undefined)
      return
    }

    browser.once('exit', () => resolve(undefined))
  })

  try {
    await waitFor(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${browserPort}/json/version`)
        if (!response.ok) return null
        return response.json()
      } catch {
        return null
      }
    }, 10000, 'browser remote debugging')

    const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(`${appOrigin}/login`)}`, {
      method: 'PUT',
    })
    const target = await targetResponse.json()
    const client = new CdpClient(target.webSocketDebuggerUrl)

    await client.connect()
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Network.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 1400,
      deviceScaleFactor: 1,
      mobile: false,
    })

    await client.send('Page.navigate', { url: `${appOrigin}/login` })

    await waitFor(async () => {
      const body = await evaluate(client, 'document.body.innerText')
      return typeof body === 'string' && body.includes('Sign in to ZonForge')
    }, 15000, 'login page content')

    await evaluate(client, `(() => {
      const setValue = (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        if (!setter) return false
        setter.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      }

      const emailInput = document.querySelector('#login-email')
      const passwordInput = document.querySelector('#login-password')
      const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === 'Sign in')
      if (!emailInput || !passwordInput || !button) return false
      setValue(emailInput, ${JSON.stringify(email)})
      setValue(passwordInput, ${JSON.stringify(password)})
      button.click()
      return true
    })()`)

    try {
      await waitFor(async () => {
        const pathname = await evaluate(client, 'location.pathname')
        return pathname === '/onboarding' || pathname === '/customer-dashboard'
      }, 20000, 'post-login landing route')
    } catch (error) {
      const failure = await captureFailureState(client, 'serial-18-1-login-failure.png', 'login_failure')
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(failure.state, null, 2)}`)
    }

    const landingPath = await evaluate(client, 'location.pathname')
    const metadata = {
      capturedAt: new Date().toISOString(),
      appOrigin,
      loginLandingPath: landingPath,
      artifacts: {},
      steps: [],
    }

    if (landingPath === '/onboarding') {
      await waitFor(async () => {
        const body = await evaluate(client, 'document.body.innerText')
        return typeof body === 'string' && body.includes('Workspace onboarding') && body.includes('Open dashboard')
      }, 15000, 'onboarding page content')

      metadata.artifacts.onboarding = await capture(client, 'serial-18-1-onboarding.png')
      metadata.steps.push(await snapshot(client, 'onboarding_landing'))

      const clickedDashboard = await clickLink(client, '/customer-dashboard')
      if (!clickedDashboard) {
        throw new Error('Unable to click onboarding dashboard link')
      }
    }

    await waitFor(async () => {
      const pathname = await evaluate(client, 'location.pathname')
      const body = await evaluate(client, 'document.body.innerText')
      return pathname === '/customer-dashboard' && typeof body === 'string' && body.includes('Security Dashboard') && body.includes('Billing')
    }, 20000, 'customer dashboard content')

    metadata.artifacts.dashboard = await capture(client, 'serial-18-1-customer-dashboard.png')
    metadata.steps.push(await snapshot(client, 'customer_dashboard'))

    const clickedBilling = await clickLink(client, '/billing')
    if (!clickedBilling) {
      throw new Error('Unable to click billing nav link from customer dashboard')
    }

    await waitFor(async () => {
      const pathname = await evaluate(client, 'location.pathname')
      const body = await evaluate(client, 'document.body.innerText')
      return pathname === '/billing' && typeof body === 'string' && body.includes('Billing & Subscription') && body.includes('Stripe-synchronized billing') && body.includes('Growth')
    }, 20000, 'billing page content')

    metadata.artifacts.billing = await capture(client, 'serial-18-1-billing.png')
    metadata.steps.push(await snapshot(client, 'billing_page'))

    const metadataPath = path.join(outputDir, 'serial-18-1-flow-proof.json')
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
    console.log(JSON.stringify({ metadataPath, ...metadata.artifacts }, null, 2))
    await client.close()
  } finally {
    browser.kill()
    await waitForBrowserExit()
    try {
      await rm(userDataDir, { recursive: true, force: true })
    } catch {
      // Ignore transient Windows browser profile cleanup locks.
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})