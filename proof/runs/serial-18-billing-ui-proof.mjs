import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

const dashboardOrigin = process.env.SERIAL18_DASHBOARD_ORIGIN || 'http://127.0.0.1:5173/app'
const apiBase = process.env.SERIAL18_API_BASE || 'http://127.0.0.1:3000'
const accessToken = process.env.SERIAL18_ACCESS_TOKEN
const refreshToken = process.env.SERIAL18_REFRESH_TOKEN || ''
const browserPath = process.env.SERIAL18_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browserPort = Number(process.env.SERIAL18_BROWSER_PORT || 9226)
const outputDir = path.resolve('proof', 'runs', 'serial-18-billing-ui')

if (!accessToken) {
  throw new Error('SERIAL18_ACCESS_TOKEN is required')
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

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${JSON.stringify(payload)}`)
  }

  return payload
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl)
    this.nextId = 1
    this.pending = new Map()
    this.events = new Map()

    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })

    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString())
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
        return
      }

      if (message.method) {
        const listeners = this.events.get(message.method) ?? []
        for (const listener of listeners) {
          listener(message.params ?? {})
        }
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

  once(method, predicate = () => true) {
    return new Promise((resolve) => {
      const listener = (params) => {
        if (!predicate(params)) return
        const listeners = this.events.get(method) ?? []
        this.events.set(method, listeners.filter((entry) => entry !== listener))
        resolve(params)
      }

      const listeners = this.events.get(method) ?? []
      listeners.push(listener)
      this.events.set(method, listeners)
    })
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close()
    }
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const currentUser = await getJson(`${apiBase}/v1/auth/me`, accessToken)
  const entryUrl = `${dashboardOrigin}/`
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'serial18-billing-ui-'))
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

    const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(entryUrl)}`, {
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

    const authPayload = {
      state: {
        user: currentUser,
        isLoggedIn: true,
      },
      version: 0,
    }

    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        localStorage.setItem('zf_access_token', ${JSON.stringify(accessToken)});
        localStorage.setItem('zf_refresh_token', ${JSON.stringify(refreshToken)});
        localStorage.setItem('zf-auth', ${JSON.stringify(JSON.stringify(authPayload))});
        history.replaceState({}, '', '/billing');
      `,
    })

    const initialLoad = client.once('Page.loadEventFired')
    await client.send('Page.navigate', { url: entryUrl })
    await initialLoad

    try {
      await waitFor(async () => {
        const result = await client.send('Runtime.evaluate', {
          expression: `document.body.innerText.includes('Billing & Subscription') && document.body.innerText.includes('Stripe-synchronized billing') && document.body.innerText.includes('Usage & limits')`,
          returnByValue: true,
        })
        return result.result?.value === true
      }, 20000, 'billing dashboard content')
    } catch (error) {
      const failureShot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        fromSurface: true,
      })
      await writeFile(path.join(outputDir, 'serial-18-billing-dashboard-failure.png'), Buffer.from(failureShot.data, 'base64'))
      const failureState = await client.send('Runtime.evaluate', {
        expression: `JSON.stringify({ url: location.href, title: document.title, body: document.body.innerText.slice(0, 4000), html: document.body.innerHTML.slice(0, 4000) })`,
        returnByValue: true,
      })
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${failureState.result?.value ?? ''}`)
    }

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      fromSurface: true,
    })
    const screenshotPath = path.join(outputDir, 'serial-18-billing-dashboard.png')
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))

    const pageSnapshot = await client.send('Runtime.evaluate', {
      expression: `JSON.stringify({ url: location.href, title: document.title, body: document.body.innerText.slice(0, 4000) })`,
      returnByValue: true,
    })
    const snapshotValue = JSON.parse(pageSnapshot.result?.value ?? '{}')
    const metadataPath = path.join(outputDir, 'serial-18-billing-dashboard.json')
    await writeFile(metadataPath, JSON.stringify({
      capturedAt: new Date().toISOString(),
      screenshotPath,
      page: snapshotValue,
      user: {
        email: currentUser.email,
        role: currentUser.membership?.role ?? currentUser.role ?? null,
        tenantId: currentUser.membership?.tenantId ?? currentUser.tenantId ?? null,
      },
    }, null, 2))

    console.log(JSON.stringify({ screenshotPath, metadataPath }, null, 2))
    await client.close()
  } finally {
    browser.kill()
    await waitForBrowserExit()
    try {
      await rm(userDataDir, { recursive: true, force: true })
    } catch {
      // Ignore transient Windows Crashpad file locks in the temporary browser profile.
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})