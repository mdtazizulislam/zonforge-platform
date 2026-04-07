import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const dashboardOrigin = process.env.SERIAL11_DASHBOARD_ORIGIN || 'http://127.0.0.1:4173';
const dashboardLoginUrl = `${dashboardOrigin}/login`;
const apiBase = 'http://127.0.0.1:3000';
const browserPath = process.env.SERIAL11_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browserPort = 9222;
const outputDir = path.resolve('proof', 'runs', 'serial11-ui');

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function getJsonMaybe(url, token) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json();
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();

    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });

    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString());
      if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      if (message.method) {
        const listeners = this.events.get(message.method) ?? [];
        for (const listener of listeners) {
          listener(message.params ?? {});
        }
      }
    });
  }

  async connect() {
    await this.ready;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(payload);
    return promise;
  }

  once(method, predicate = () => true) {
    return new Promise((resolve) => {
      const listener = (params) => {
        if (!predicate(params)) {
          return;
        }

        const listeners = this.events.get(method) ?? [];
        this.events.set(method, listeners.filter((entry) => entry !== listener));
        resolve(params);
      };

      const listeners = this.events.get(method) ?? [];
      listeners.push(listener);
      this.events.set(method, listeners);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const owner = process.env.SERIAL11_ACCESS_TOKEN && process.env.SERIAL11_REFRESH_TOKEN
    ? {
        accessToken: process.env.SERIAL11_ACCESS_TOKEN,
        refreshToken: process.env.SERIAL11_REFRESH_TOKEN,
      }
    : await postJson(`${apiBase}/v1/auth/login`, {
        email: 'serial11-owner1@example.com',
        password: 'Serial11!Owner1Pass',
      });
  const me = await getJsonMaybe(`${apiBase}/v1/auth/me`, owner.accessToken);
  if (!me.ok && me.status === 401 && owner.refreshToken) {
    const refreshed = await postJson(`${apiBase}/v1/auth/refresh`, {
      refresh_token: owner.refreshToken,
    });
    owner.accessToken = refreshed.accessToken ?? refreshed.access_token ?? refreshed.token;
    owner.refreshToken = refreshed.refreshToken ?? refreshed.refresh_token ?? owner.refreshToken;
  } else if (!me.ok) {
    throw new Error(`HTTP ${me.status} from ${apiBase}/v1/auth/me: ${JSON.stringify(me.payload)}`);
  }

  const currentUser = me.ok ? me.payload : await getJson(`${apiBase}/v1/auth/me`, owner.accessToken);

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'serial11-ui-'));
  const browser = spawn(browserPath, [
    `--remote-debugging-port=${browserPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1440,1200',
    'about:blank',
  ], { stdio: 'ignore' });

  const waitForBrowserExit = () => new Promise((resolve) => {
    if (browser.exitCode !== null) {
      resolve(undefined);
      return;
    }

    browser.once('exit', () => resolve(undefined));
  });

  try {
    const version = await waitFor(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${browserPort}/json/version`);
        if (!response.ok) return null;
        return response.json();
      } catch {
        return null;
      }
    }, 10000, 'browser remote debugging');

    const targetResponse = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(dashboardLoginUrl)}`, {
      method: 'PUT',
    });
    const target = await targetResponse.json();
    const client = new CdpClient(target.webSocketDebuggerUrl || version.webSocketDebuggerUrl);

    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const seedSession = async () => {
      const load = client.once('Page.loadEventFired');
      await client.send('Page.navigate', { url: dashboardLoginUrl });
      await load;
      await client.send('Runtime.evaluate', {
        expression: `localStorage.setItem('zf_access_token', ${JSON.stringify(owner.accessToken)}); localStorage.setItem('zf_refresh_token', ${JSON.stringify(owner.refreshToken)}); localStorage.setItem('zf-auth', JSON.stringify({ state: { user: ${JSON.stringify(currentUser)}, isLoggedIn: true }, version: 0 })); window.location.href = ${JSON.stringify(`${dashboardOrigin}/dashboard`)};`,
      });
      await client.once('Page.loadEventFired');
    };

    const waitForBodyText = async (readyText, label) => {
      try {
        await waitFor(async () => {
          const result = await client.send('Runtime.evaluate', {
            expression: `document.body.innerText.includes(${JSON.stringify(readyText)})`,
            returnByValue: true,
          });
          return result.result?.value === true;
        }, 15000, label);
      } catch (error) {
        const snapshot = await client.send('Runtime.evaluate', {
          expression: 'document.body.innerText.slice(0, 2000)',
          returnByValue: true,
        });
        throw new Error(`${error instanceof Error ? error.message : String(error)}\nVisible text:\n${snapshot.result?.value ?? '<empty>'}`);
      }
    };

    const capture = async (fileName) => {
      const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        fromSurface: true,
      });
      await writeFile(path.join(outputDir, fileName), Buffer.from(screenshot.data, 'base64'));
    };

    await seedSession();
    await waitForBodyText('AWS Activity Primary', 'dashboard content');
    await capture('serial11-dashboard-page.png');

    const eventsNav = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: `${dashboardOrigin}/events` });
    await eventsNav;
    await waitForBodyText('bob@example.com', 'events content');
    await capture('serial11-events-page.png');

    await client.close();
  } finally {
    browser.kill();
    await waitForBrowserExit();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});