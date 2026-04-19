import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

const appOrigin = process.env.SERIAL18_APP_ORIGIN || 'http://127.0.0.1:4175'
const proofApiOrigin = process.env.SERIAL18_PROOF_API_ORIGIN || 'http://127.0.0.1:3105'
const browserPath = process.env.SERIAL18_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browserPort = Number(process.env.SERIAL18_BROWSER_PORT || 9228)
const outputDir = path.resolve('proof', 'runs', 'serial-18-customer-readiness')

function makeProofIdentity() {
  const stamp = Date.now()
  return {
    fullName: 'Serial 18 Customer Proof',
    workspaceName: `Serial 18 Workspace ${stamp}`,
    email: `serial18.customer.${stamp}@example.com`,
    password: 'Serial18-Customer-Proof-123',
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

async function captureFailureState(client, fileName, label) {
  const screenshotPath = await capture(client, fileName)
  const state = await snapshot(client, label)
  return { screenshotPath, state }
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

async function fetchBillingSubscription(client) {
  const value = await evaluate(client, `JSON.stringify(await fetch('/api/v1/billing/subscription', {
    headers: {
      Authorization: 'Bearer ' + localStorage.getItem('zf_access_token'),
    },
  }).then(async (response) => ({
    status: response.status,
    body: await response.json(),
  })))`)
  return JSON.parse(value ?? '{}')
}

async function installCheckoutObserver(client) {
  return evaluate(client, `(() => {
    if (window.__serial18CheckoutObserverInstalled) {
      return true
    }

    const originalFetch = window.fetch.bind(window)
    window.__serial18CheckoutResponse = null
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)

      try {
        const input = args[0]
        const url = typeof input === 'string' ? input : input?.url ?? ''
        if (url.includes('/v1/billing/checkout')) {
          window.__serial18CheckoutResponse = await response.clone().json()
        }
      } catch {
        // Ignore observer errors and preserve the original request.
      }

      return response
    }

    window.__serial18CheckoutObserverInstalled = true
    return true
  })()`)
}

async function readCheckoutObserver(client) {
  const value = await evaluate(client, 'JSON.stringify(window.__serial18CheckoutResponse ?? null)')
  return JSON.parse(value ?? 'null')
}

async function fetchProofCheckout() {
  try {
    const response = await fetch(`${proofApiOrigin}/proof/last-checkout`)
    if (!response.ok) return null
    const payload = await response.json()
    return payload?.lastCheckout ?? null
  } catch {
    return null
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const identity = makeProofIdentity()
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'serial18-customer-proof-'))
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
    }, 15000, 'signup page content')

    const metadata = {
      capturedAt: new Date().toISOString(),
      appOrigin,
      identity: {
        email: identity.email,
        workspaceName: identity.workspaceName,
      },
      proofApiOrigin,
      artifacts: {},
      steps: [],
      billingSubscription: null,
    }

    metadata.artifacts.signup = await capture(client, 'serial-18-signup.png')
    metadata.steps.push(await snapshot(client, 'signup_page'))

    const submitted = await fillSignupForm(client, identity)
    if (!submitted) {
      throw new Error('Unable to submit signup form')
    }

    try {
      await waitFor(async () => {
        const pathname = await evaluate(client, 'location.pathname')
        const body = await evaluate(client, 'document.body.innerText')
        return pathname === '/onboarding' && typeof body === 'string' && body.includes('Workspace onboarding')
      }, 20000, 'onboarding after signup')
    } catch (error) {
      const failure = await captureFailureState(client, 'serial-18-signup-failure.png', 'signup_failure')
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(failure.state, null, 2)}`)
    }

    metadata.artifacts.onboarding = await capture(client, 'serial-18-onboarding.png')
    metadata.steps.push(await snapshot(client, 'onboarding_page'))

    for (const buttonText of ['Start onboarding', 'Save preferred source', 'Finish onboarding and open dashboard']) {
      const clicked = await clickButtonByText(client, buttonText)
      if (!clicked) {
        throw new Error(`Unable to click onboarding control: ${buttonText}`)
      }

      await waitFor(async () => {
        const body = await evaluate(client, 'document.body.innerText')
        if (typeof body !== 'string') return false
        if (buttonText === 'Start onboarding') return body.includes('Welcome completed')
        if (buttonText === 'Save preferred source') return body.includes('Preferred source saved')
        return await evaluate(client, 'location.pathname') === '/customer-dashboard'
      }, 20000, `post-click state for ${buttonText}`)
    }

    await waitFor(async () => {
      const pathname = await evaluate(client, 'location.pathname')
      const body = await evaluate(client, 'document.body.innerText')
      return pathname === '/customer-dashboard' && typeof body === 'string' && body.includes('What ZonForge is doing for this workspace')
    }, 20000, 'customer dashboard content')

    metadata.artifacts.dashboard = await capture(client, 'serial-18-customer-dashboard.png')
    metadata.steps.push(await snapshot(client, 'customer_dashboard'))

    const clickedBilling = await clickLink(client, '/billing')
    if (!clickedBilling) {
      throw new Error('Unable to open billing from the customer dashboard')
    }

    await waitFor(async () => {
      const pathname = await evaluate(client, 'location.pathname')
      const body = await evaluate(client, 'document.body.innerText')
      return pathname === '/billing' && typeof body === 'string' && body.includes('Billing & Subscription') && body.includes('Plan comparison')
    }, 20000, 'billing page content')

    metadata.artifacts.billing = await capture(client, 'serial-18-billing.png')
    metadata.steps.push(await snapshot(client, 'billing_page'))

    await installCheckoutObserver(client)

    const clickedGrowth = await clickButtonByText(client, 'Choose Growth')
    if (!clickedGrowth) {
      throw new Error('Unable to initiate Growth plan checkout')
    }

    await waitFor(async () => {
      const checkoutResponse = await readCheckoutObserver(client)
      if (checkoutResponse?.url && checkoutResponse?.sessionId) {
        return true
      }

      const proofCheckout = await fetchProofCheckout()
      if (proofCheckout?.sessionId && proofCheckout?.planCode === 'growth') {
        return true
      }

      const subscriptionState = await fetchBillingSubscription(client)
      const status = subscriptionState?.body?.subscription?.status
      if (typeof status === 'string' && status.toLowerCase() === 'checkout_created') {
        return true
      }

      const body = await evaluate(client, 'document.body.innerText')
      return typeof body === 'string' && body.includes('Checkout Created')
    }, 20000, 'checkout initiation state')

    metadata.checkoutResponse = await readCheckoutObserver(client)
  metadata.proofCheckout = await fetchProofCheckout()
    metadata.artifacts.checkout = await capture(client, 'serial-18-checkout-initiation.png')
    metadata.steps.push(await snapshot(client, 'checkout_initiated'))

    metadata.billingSubscription = await fetchBillingSubscription(client)

    await client.send('Page.navigate', { url: `${appOrigin}/billing` })
    await waitFor(async () => {
      const body = await evaluate(client, 'document.body.innerText')
      return typeof body === 'string' && body.includes('Checkout Created')
    }, 20000, 'billing checkout-created state')

    metadata.artifacts.billingAfterCheckout = await capture(client, 'serial-18-billing-checkout-created.png')
    metadata.steps.push(await snapshot(client, 'billing_checkout_created'))

    const metadataPath = path.join(outputDir, 'serial-18-customer-readiness-proof.json')
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
    console.log(JSON.stringify({ metadataPath, ...metadata.artifacts, billingSubscription: metadata.billingSubscription }, null, 2))
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