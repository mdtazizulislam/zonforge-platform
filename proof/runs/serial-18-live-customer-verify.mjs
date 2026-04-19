import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

const appOrigin = process.env.SERIAL18_LIVE_APP_ORIGIN || 'https://zonforge.com'
const browserPath = process.env.SERIAL18_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browserPort = Number(process.env.SERIAL18_BROWSER_PORT || 9229)
const outputDir = path.resolve('proof', 'runs', 'serial-18-live-customer-verify')

function makeIdentity() {
  const stamp = Date.now()
  return {
    fullName: 'Serial 18 Live Verify',
    workspaceName: `Serial 18 Live ${stamp}`,
    email: `serial18.live.${stamp}@example.com`,
    password: 'Serial18-Live-Verify-123',
  }
}

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
    awaitPromise: true,
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

async function snapshot(client, label) {
  const value = await evaluate(client, `JSON.stringify({ label: ${JSON.stringify(label)}, url: location.href, title: document.title, body: document.body.innerText.slice(0, 6000) })`)
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

async function clickButtonByPattern(client, patternSource) {
  return evaluate(client, `(() => {
    const pattern = new RegExp(${JSON.stringify(patternSource)}, 'i')
    const candidates = Array.from(document.querySelectorAll('button, a'))
    const target = candidates.find((element) => element.textContent && pattern.test(element.textContent.trim()))
    if (!target) return false
    target.click()
    return true
  })()`)
}

async function fillSignupForm(client, identity) {
  return evaluate(client, `(() => {
    const setValue = (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (!setter) return false
      setter.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }

    const fullNameInput = document.querySelector('#signup-full-name')
    const workspaceInput = document.querySelector('#signup-workspace-name')
    const emailInput = document.querySelector('#signup-email')
    const passwordInput = document.querySelector('#signup-password')
    const submitButton = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === 'Create workspace')
    if (!fullNameInput || !workspaceInput || !emailInput || !passwordInput || !submitButton) return false
    setValue(fullNameInput, ${JSON.stringify(identity.fullName)})
    setValue(workspaceInput, ${JSON.stringify(identity.workspaceName)})
    setValue(emailInput, ${JSON.stringify(identity.email)})
    setValue(passwordInput, ${JSON.stringify(identity.password)})
    submitButton.click()
    return true
  })()`)
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const identity = makeIdentity()
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'serial18-live-verify-'))
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

    const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(`${appOrigin}/signup`)}`, {
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

    await client.send('Page.navigate', { url: `${appOrigin}/signup` })

    await waitFor(async () => {
      const body = await evaluate(client, 'document.body.innerText')
      return typeof body === 'string' && body.includes('Create your ZonForge workspace')
    }, 20000, 'live signup page')

    const metadata = {
      capturedAt: new Date().toISOString(),
      appOrigin,
      identity: {
        email: identity.email,
        workspaceName: identity.workspaceName,
      },
      artifacts: {},
      steps: [],
    }

    metadata.artifacts.signup = await capture(client, 'live-signup.png')
    metadata.steps.push(await snapshot(client, 'signup'))

    const submitted = await fillSignupForm(client, identity)
    if (!submitted) {
      throw new Error('Unable to submit live signup form')
    }

    await waitFor(async () => {
      const pathname = await evaluate(client, 'location.pathname')
      return pathname === '/onboarding'
    }, 30000, 'live onboarding route')

    metadata.artifacts.onboarding = await capture(client, 'live-onboarding.png')
    metadata.steps.push(await snapshot(client, 'onboarding'))

    for (const [buttonText, pattern] of [
      ['Start onboarding', 'Start onboarding|Welcome completed|Open dashboard|Continue'],
      ['Save preferred source', 'Save preferred source|Preferred source saved|Save source|Continue'],
      ['Finish onboarding and open dashboard', 'Finish onboarding and open dashboard|Onboarding complete|Open dashboard'],
    ]) {
      const clicked = await clickButtonByText(client, buttonText) || await clickButtonByPattern(client, pattern)
      if (!clicked) {
        throw new Error(`Unable to click ${buttonText}`)
      }
      await waitFor(async () => {
        const body = await evaluate(client, 'document.body.innerText')
        if (typeof body !== 'string') return false
        if (buttonText === 'Start onboarding') return body.includes('Welcome completed')
        if (buttonText === 'Save preferred source') return body.includes('Preferred source saved')
        return await evaluate(client, 'location.pathname') === '/customer-dashboard'
      }, 30000, `state after ${buttonText}`)
    }

    await waitFor(async () => {
      const body = await evaluate(client, 'document.body.innerText')
      return typeof body === 'string' && body.includes('What ZonForge is doing for this workspace')
    }, 30000, 'live customer dashboard')

    metadata.artifacts.dashboard = await capture(client, 'live-customer-dashboard.png')
    metadata.steps.push(await snapshot(client, 'customer_dashboard'))

    const billingClicked = await clickLink(client, '/billing')
    if (!billingClicked) {
      throw new Error('Unable to open live billing page')
    }

    await waitFor(async () => {
      const body = await evaluate(client, 'document.body.innerText')
      return typeof body === 'string' && body.includes('Billing & Subscription') && body.includes('Stripe-synchronized billing')
    }, 30000, 'live billing page')

    metadata.artifacts.billing = await capture(client, 'live-billing.png')
    metadata.steps.push(await snapshot(client, 'billing'))

    const settingsClicked = await clickLink(client, '/customer-settings')
    if (!settingsClicked) {
      throw new Error('Unable to open live customer settings page')
    }

    await waitFor(async () => {
      const body = await evaluate(client, 'document.body.innerText')
      return typeof body === 'string' && body.includes('Sign-in method') && body.includes('Billing authority')
    }, 30000, 'live customer settings page')

    metadata.artifacts.settings = await capture(client, 'live-customer-settings.png')
    metadata.steps.push(await snapshot(client, 'customer_settings'))

    const metadataPath = path.join(outputDir, 'serial-18-live-customer-verify.json')
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
    console.log(JSON.stringify({ metadataPath, ...metadata.artifacts }, null, 2))
    await client.close()
  } finally {
    browser.kill()
    await waitForBrowserExit()
    try {
      await rm(userDataDir, { recursive: true, force: true })
    } catch {
      // Ignore transient Windows cleanup locks.
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})