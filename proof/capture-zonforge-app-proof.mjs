import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'http://localhost:4175';
const outDir = path.resolve('proof', 'route-proof');
const consoleEvents = [];
const routeResults = [];
const ignoredConsolePatterns = [
  /Failed to load resource: the server responded with a status of 401/i,
];

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  };
}

function buildUser(role, name, email) {
  return {
    id: 'proof-user-1',
    email,
    name,
    fullName: name,
    role,
    onboardingStatus: 'completed',
    membership: { role },
    tenant: {
      id: 'tenant-proof-1',
      name: 'Acme Security',
      slug: 'acme-security',
      onboardingStatus: 'completed',
      onboardingCompletedAt: '2026-04-19T00:00:00.000Z',
    },
  };
}

async function installProofApiMocks(context, user) {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api/, '');

    if (pathname.startsWith('/v1/auth/me')) {
      await route.fulfill(jsonResponse({ success: true, user, tenant: user.tenant, membership: user.membership }));
      return;
    }

    if (pathname.startsWith('/admin/overview') || pathname.startsWith('/v1/admin/overview')) {
      await route.fulfill(jsonResponse({
        user_count: 12,
        connector_count: 4,
        active_connectors: 3,
        alert_summary: { open: 17, critical: 3 },
        plan_usage: { identities_used: 87, limit: 200 },
        recent_audit: [
          { id: '1', actor_email: 'admin@acme.com', action: 'CONNECTOR_CREATED', target_type: 'connector', created_at: '2026-04-19T18:00:00.000Z' },
          { id: '2', actor_email: 'admin@acme.com', action: 'USER_INVITED', target_type: 'user', created_at: '2026-04-19T17:00:00.000Z' },
        ],
      }));
      return;
    }

    if (pathname.startsWith('/admin/users') || pathname.startsWith('/v1/admin/users')) {
      await route.fulfill(jsonResponse({
        data: [
          { id: '1', name: 'John Smith', email: 'john.smith@acme.com', role: 'SECURITY_ANALYST', status: 'active', last_login_at: '2026-04-19T19:00:00.000Z' },
          { id: '2', name: 'Jane Doe', email: 'jane.doe@acme.com', role: 'READ_ONLY', status: 'active', last_login_at: '2026-04-18T19:00:00.000Z' },
          { id: '3', name: 'Admin User', email: 'admin@acme.com', role: 'TENANT_ADMIN', status: 'active', last_login_at: '2026-04-19T17:00:00.000Z' },
        ],
      }));
      return;
    }

    if (pathname.startsWith('/admin/connectors') || pathname.startsWith('/v1/admin/connectors')) {
      await route.fulfill(jsonResponse({
        data: [
          { id: '1', name: 'Microsoft 365', type: 'm365', status: 'healthy', last_event_at: '2026-04-19T19:58:00.000Z', event_rate: 847, error_count: 0, config: {} },
          { id: '2', name: 'AWS CloudTrail', type: 'aws_cloudtrail', status: 'healthy', last_event_at: '2026-04-19T19:55:00.000Z', event_rate: 234, error_count: 0, config: {} },
          { id: '3', name: 'Google Workspace', type: 'google_workspace', status: 'degraded', last_event_at: '2026-04-19T19:40:00.000Z', event_rate: 12, error_count: 3, config: {} },
        ],
      }));
      return;
    }

    if (pathname.startsWith('/admin/maintenance') || pathname.startsWith('/v1/admin/maintenance')) {
      await route.fulfill(jsonResponse({
        data: [
          {
            id: 'mw1',
            name: 'Weekly Infrastructure Patching',
            description: 'Automated patching across production servers every Sunday night.',
            status: 'upcoming',
            start_time: '2026-04-21T02:00:00.000Z',
            end_time: '2026-04-21T06:00:00.000Z',
            recurrence: 'weekly',
            suppress_severities: ['low', 'medium'],
            suppress_connectors: ['AWS CloudTrail', 'WAF Logs'],
            notify_before_minutes: 30,
            created_by: 'admin@acme.com',
            created_at: '2026-04-10T10:00:00.000Z',
            next_occurrence: '2026-04-21T02:00:00.000Z',
            suppressed_count: 847,
          }
        ],
      }));
      return;
    }

    if (pathname.startsWith('/superadmin/overview') || pathname.startsWith('/v1/superadmin/overview')) {
      await route.fulfill(jsonResponse({
        total_tenants: 47,
        active_tenants: 42,
        trial_tenants: 8,
        total_users: 1284,
        events_today: 2847293,
        alerts_today: 183,
        mrr: 38450,
        arr: 461400,
        new_this_month: 6,
        churn_rate: 2.1,
        pipeline_health: { ingestion_lag_ms: 340, detection_lag_ms: 1820, queue_depth: 142, error_rate: 0.003 },
        tenants_by_plan: [
          { plan: 'Starter', count: 18, color: '#3b82f6' },
          { plan: 'Growth', count: 14, color: '#0d9488' },
          { plan: 'Business', count: 11, color: '#8b5cf6' },
          { plan: 'Enterprise', count: 4, color: '#f59e0b' },
        ],
        recent_tenants: [
          { id: '1', name: 'Acme Corp', plan: 'Business', status: 'active', created_at: '2026-04-18T00:00:00.000Z' },
          { id: '2', name: 'FinTech Labs', plan: 'Growth', status: 'trial', created_at: '2026-04-17T00:00:00.000Z' },
        ],
      }));
      return;
    }

    if (pathname.startsWith('/v1/billing/subscription')) {
      await route.fulfill(jsonResponse({
        subscription: {
          planTier: 'Growth',
          status: 'active',
          currentPeriodStart: '2026-04-01T00:00:00.000Z',
          currentPeriodEnd: '2026-05-01T00:00:00.000Z',
          trialEndsAt: null,
        },
      }));
      return;
    }

    if (pathname.startsWith('/v1/billing/usage')) {
      await route.fulfill(jsonResponse({
        planTier: 'Growth',
        usage: {
          alerts: { current: 214, limit: 500 },
          investigations: { current: 14, limit: 50 },
          connectors: { current: 3, limit: 5 },
        },
        features: { aiAssistant: true, investigations: true },
        retentionDays: 90,
      }));
      return;
    }

    if (pathname.startsWith('/v1/billing/plans')) {
      await route.fulfill(jsonResponse({ plans: [] }));
      return;
    }

    await route.fulfill(jsonResponse({ success: true, data: [], items: [] }));
  });
}

async function capturePublicLanding() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

  page.on('console', (msg) => {
    const text = msg.text();
    if (ignoredConsolePatterns.some((pattern) => pattern.test(text))) {
      return;
    }
    consoleEvents.push({ page: 'public-landing', type: msg.type(), text });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  routeResults.push({
    page: 'public-landing',
    requestedPath: '/',
    finalUrl: page.url(),
    title: await page.title(),
  });

  await page.screenshot({
    path: path.join(outDir, 'public-landing.png'),
    fullPage: true,
  });

  await browser.close();
}

async function captureAuthenticatedPage({ key, routePath, expectedPath, user, expectedText }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });

  await installProofApiMocks(context, user);

  await context.addInitScript((payload) => {
    localStorage.setItem('zf_access_token', 'proof-token');
    localStorage.setItem('zf_refresh_token', 'proof-token');
    localStorage.setItem('zf-auth', JSON.stringify({
      state: {
        user: payload.user,
        isLoggedIn: true,
      },
      version: 0,
    }));
  }, { user });

  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (ignoredConsolePatterns.some((pattern) => pattern.test(text))) {
      return;
    }
    consoleEvents.push({ page: key, type: msg.type(), text });
  });

  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const finalUrl = page.url();
  const finalPath = new URL(finalUrl).pathname;
  if (!finalPath.startsWith(expectedPath)) {
    throw new Error(`${key} expected ${expectedPath} but resolved to ${finalPath}`);
  }

  if (expectedText) {
    await page.getByText(expectedText, { exact: false }).first().waitFor({ timeout: 15000 });
  }

  routeResults.push({
    page: key,
    requestedPath: routePath,
    finalUrl,
    title: await page.title(),
  });

  await page.screenshot({
    path: path.join(outDir, `${key}.png`),
    fullPage: true,
  });

  await browser.close();
}

await fs.mkdir(outDir, { recursive: true });

await capturePublicLanding();
await captureAuthenticatedPage({
  key: 'customer-dashboard',
  routePath: '/app/customer-dashboard',
  expectedPath: '/app/customer-dashboard',
  user: buildUser('SECURITY_ANALYST', 'Security Analyst', 'analyst@acme.test'),
});
await captureAuthenticatedPage({
  key: 'admin-workspace',
  routePath: '/app/admin',
  expectedPath: '/app/admin',
  user: buildUser('TENANT_ADMIN', 'Tenant Admin', 'admin@acme.test'),
});
await captureAuthenticatedPage({
  key: 'admin-users',
  routePath: '/app/admin/users',
  expectedPath: '/app/admin/users',
  user: buildUser('TENANT_ADMIN', 'Tenant Admin', 'admin@acme.test'),
  expectedText: 'User Management',
});
await captureAuthenticatedPage({
  key: 'admin-connectors',
  routePath: '/app/admin/connectors',
  expectedPath: '/app/admin/connectors',
  user: buildUser('TENANT_ADMIN', 'Tenant Admin', 'admin@acme.test'),
  expectedText: 'Connectors',
});
await captureAuthenticatedPage({
  key: 'admin-maintenance',
  routePath: '/app/admin/maintenance',
  expectedPath: '/app/admin/maintenance',
  user: buildUser('TENANT_ADMIN', 'Tenant Admin', 'admin@acme.test'),
  expectedText: 'Maintenance Windows',
});
await captureAuthenticatedPage({
  key: 'superadmin-workspace',
  routePath: '/app/superadmin',
  expectedPath: '/app/superadmin',
  user: buildUser('SUPER_ADMIN', 'Platform Admin', 'superadmin@zonforge.test'),
});
await captureAuthenticatedPage({
  key: 'billing-workspace',
  routePath: '/app/billing',
  expectedPath: '/app/billing',
  user: buildUser('SECURITY_ANALYST', 'Security Analyst', 'analyst@acme.test'),
});
await captureAuthenticatedPage({
  key: 'forbidden-page',
  routePath: '/app/admin',
  expectedPath: '/app/403',
  user: buildUser('SECURITY_ANALYST', 'Security Analyst', 'analyst@acme.test'),
  expectedText: '403',
});
await captureAuthenticatedPage({
  key: 'not-found-page',
  routePath: '/app/route-that-does-not-exist',
  expectedPath: '/app/404',
  user: buildUser('SECURITY_ANALYST', 'Security Analyst', 'analyst@acme.test'),
  expectedText: '404',
});

await fs.writeFile(
  path.join(outDir, 'console-proof.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      baseUrl,
      routeResults,
      consoleEvents,
    },
    null,
    2,
  ),
  'utf8',
);

console.log(JSON.stringify({ outDir, routeResultsCount: routeResults.length }, null, 2));
