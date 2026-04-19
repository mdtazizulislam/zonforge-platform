import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve('c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/merge-route-proof');

await fs.mkdir(outputDir, { recursive: true });

function buildUser(role, onboardingStatus = 'completed') {
  const completedAt = onboardingStatus === 'completed' ? new Date().toISOString() : null;
  return {
    id: 'user-proof-1',
    email: 'proof@zonforge.local',
    fullName: 'Route Proof User',
    name: 'Route Proof User',
    role,
    status: 'active',
    emailVerified: true,
    tenantId: 'tenant-proof-1',
    onboardingStatus,
    mfaEnabled: false,
    tenant: {
      id: 'tenant-proof-1',
      name: 'Proof Workspace',
      slug: 'proof-workspace',
      plan: 'growth',
      onboardingStatus,
      onboardingStartedAt: new Date().toISOString(),
      onboardingCompletedAt: completedAt,
    },
    membership: {
      role,
    },
  };
}

function buildPersistedAuth(role, onboardingStatus = 'completed') {
  const user = buildUser(role, onboardingStatus);
  return {
    state: {
      user,
      isLoggedIn: true,
      hasHydrated: true,
    },
    version: 0,
  };
}

async function installApiMocks(page, role, onboardingStatus = 'completed') {
  const user = buildUser(role, onboardingStatus);

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api/, '');

    const json = (payload, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });

    if (pathname === '/v1/auth/me') {
      return json({ success: true, user, tenant: user.tenant, membership: user.membership });
    }

    if (pathname.startsWith('/v1/risk/summary')) {
      return json({
        data: {
          postureScore: 78,
          openCriticalAlerts: 1,
          openHighAlerts: 2,
          avgUserRiskScore: 33,
          topRiskUserIds: [],
          topRiskAssetIds: [],
          connectorHealthScore: 91,
          mttdP50Minutes: 5,
        },
      });
    }

    if (pathname.startsWith('/v1/alerts')) {
      return json({
        data: [
          {
            id: 'alert-proof-1',
            title: 'Suspicious sign-in attempt',
            severity: 'high',
            priority: 'P1',
            status: 'open',
            createdAt: new Date().toISOString(),
            mitreTechniques: ['T1078'],
          },
        ],
      });
    }

    if (pathname.startsWith('/v1/connectors')) {
      return json({
        data: [
          {
            id: 'connector-proof-1',
            name: 'Microsoft 365',
            type: 'microsoft_365',
            status: 'connected',
            isHealthy: true,
            lastEventAt: new Date().toISOString(),
            eventRatePerHour: 42,
          },
        ],
      });
    }

    if (pathname.startsWith('/v1/onboarding')) {
      return json({
        tenantId: 'tenant-proof-1',
        onboardingStatus,
        onboardingStartedAt: new Date().toISOString(),
        onboardingCompletedAt: onboardingStatus === 'completed' ? new Date().toISOString() : null,
        steps: [],
      });
    }

    if (pathname.startsWith('/v1/billing/subscription')) {
      return json({
        subscription: {
          planTier: 'growth',
          status: 'active',
          billingCycle: 'monthly',
          seats: 12,
          currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
        },
      });
    }

    if (pathname.startsWith('/v1/billing/usage')) {
      return json({
        usage: {
          eventsIngested: 12800,
          retainedDays: 30,
          aiInvestigations: 16,
        },
      });
    }

    if (pathname.startsWith('/v1/billing/plans')) {
      return json({
        plans: [
          { code: 'growth', name: 'Growth', monthlyPrice: 499 },
          { code: 'business', name: 'Business', monthlyPrice: 1299 },
        ],
      });
    }

    if (pathname.startsWith('/v1/billing/checkout') || pathname.startsWith('/v1/billing/portal') || pathname.startsWith('/v1/billing/cancel')) {
      return json({ success: true, url: `${baseUrl}/billing` });
    }

    if (pathname.startsWith('/v1/investigations')) {
      return json({ data: [] });
    }

    if (pathname.startsWith('/v1/assistant')) {
      return json({ reply: 'All systems nominal.', suggestions: [] });
    }

    if (pathname.startsWith('/v1/mssp/overview')) {
      return json({
        data: {
          totalTenants: 2,
          activeTenants: 2,
          trialTenants: 0,
          totalOpenCritical: 1,
          totalMrr: 199900,
        },
      });
    }

    if (pathname.startsWith('/v1/mssp/tenants/bulk-suspend')) {
      return json({ success: true });
    }

    if (pathname.includes('/impersonate')) {
      return json({ data: { token: 'proof-impersonation-token' } });
    }

    if (pathname.startsWith('/v1/mssp/tenants')) {
      return json({
        data: [
          {
            id: 'tenant-proof-1',
            name: 'Proof Workspace',
            slug: 'proof-workspace',
            planTier: 'growth',
            status: 'active',
            postureScore: 84,
            openCritical: 1,
            openHigh: 2,
            mrr: 99900,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'tenant-proof-2',
            name: 'Acme Industries',
            slug: 'acme-industries',
            planTier: 'business',
            status: 'trial',
            postureScore: 76,
            openCritical: 0,
            openHigh: 1,
            mrr: 100000,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }

    if (pathname.startsWith('/v1/mssp/alerts')) {
      return json({
        data: [
          {
            id: 'mssp-alert-1',
            tenantName: 'Proof Workspace',
            title: 'Critical cross-tenant signal',
            severity: 'critical',
            status: 'open',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }

    if (pathname.startsWith('/v1/mssp/revenue')) {
      return json({
        data: {
          totalMrr: 199900,
          byPlan: {
            growth: { count: 1, mrr: 99900 },
            business: { count: 1, mrr: 100000 },
          },
        },
      });
    }

    return json({ success: true, data: [] });
  });
}

async function seedAuth(page, role, onboardingStatus = 'completed') {
  const authState = buildPersistedAuth(role, onboardingStatus);

  await page.addInitScript(({ persistedAuth }) => {
    window.localStorage.setItem('zf-auth', JSON.stringify(persistedAuth));
    window.localStorage.setItem('zf_access_token', 'proof-access-token');
    window.localStorage.setItem('zf_refresh_token', 'proof-refresh-token');
  }, { persistedAuth: authState });
}

async function capture(browser, config) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1024 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  await installApiMocks(page, config.role ?? 'viewer', config.onboardingStatus ?? 'completed');

  if (config.authenticated) {
    await seedAuth(page, config.role ?? 'viewer', config.onboardingStatus ?? 'completed');
  }

  let status = 'passed';
  let failure = null;

  await page.goto(`${baseUrl}${config.path}`, { waitUntil: 'domcontentloaded' });

  try {
    if (config.waitForUrl) {
      await page.waitForFunction(
        (expectedPath) => window.location.pathname === expectedPath || window.location.pathname.endsWith(expectedPath),
        config.waitForUrl,
        { timeout: 10000 },
      );
    }

    if (config.waitForText) {
      await page.getByText(config.waitForText, { exact: false }).waitFor({ timeout: 10000 });
    }
  } catch (error) {
    status = 'failed';
    failure = error instanceof Error ? error.message : String(error);
  }

  const screenshotPath = path.join(outputDir, config.fileName);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = {
    name: config.name,
    startPath: config.path,
    finalUrl: page.url(),
    screenshot: screenshotPath,
    status,
    failure,
    consoleErrors,
    pageErrors,
  };

  await context.close();
  return result;
}

const browser = await chromium.launch({ headless: true });

try {
  const results = [];

  results.push(await capture(browser, {
    name: 'login-redirect',
    path: '/app/dashboard',
    authenticated: false,
    waitForUrl: '/login',
    waitForText: 'Sign in to ZonForge',
    fileName: '01-login.png',
  }));

  results.push(await capture(browser, {
    name: 'customer-dashboard',
    path: '/app/customer-dashboard',
    authenticated: true,
    role: 'owner',
    waitForText: 'Security Dashboard',
    fileName: '02-customer-dashboard.png',
  }));

  results.push(await capture(browser, {
    name: 'admin-route',
    path: '/app/admin',
    authenticated: true,
    role: 'admin',
    waitForText: 'Executive Overview',
    fileName: '03-admin.png',
  }));

  results.push(await capture(browser, {
    name: 'superadmin-route',
    path: '/app/superadmin',
    authenticated: true,
    role: 'SUPER_ADMIN',
    waitForText: 'MSSP Console',
    fileName: '04-superadmin.png',
  }));

  results.push(await capture(browser, {
    name: 'billing-route',
    path: '/app/billing',
    authenticated: true,
    role: 'owner',
    waitForText: 'Billing & Subscription',
    fileName: '05-billing.png',
  }));

  results.push(await capture(browser, {
    name: 'forbidden-route',
    path: '/app/superadmin',
    authenticated: true,
    role: 'READ_ONLY',
    waitForUrl: '/403',
    waitForText: '403',
    fileName: '06-403.png',
  }));

  results.push(await capture(browser, {
    name: 'not-found-route',
    path: '/app/does-not-exist',
    authenticated: true,
    role: 'owner',
    waitForUrl: '/404',
    waitForText: '404',
    fileName: '07-404.png',
  }));

  results.push(await capture(browser, {
    name: 'onboarding-redirect',
    path: '/app/dashboard',
    authenticated: true,
    role: 'admin',
    onboardingStatus: 'pending',
    waitForUrl: '/onboarding',
    fileName: '08-onboarding.png',
  }));

  const consoleProof = {
    baseUrl,
    checkedAt: new Date().toISOString(),
    runtimeErrorCount: results.reduce((count, item) => count + item.consoleErrors.length + item.pageErrors.length, 0),
    results,
  };

  await fs.writeFile(path.join(outputDir, 'route-proof.json'), JSON.stringify(consoleProof, null, 2));
  console.log(JSON.stringify(consoleProof, null, 2));
} finally {
  await browser.close();
}
