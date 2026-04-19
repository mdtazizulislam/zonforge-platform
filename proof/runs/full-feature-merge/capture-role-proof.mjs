import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4174/app';
const outDir = path.resolve('c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/full-feature-merge');

await fs.mkdir(outDir, { recursive: true });

function seedState(role) {
  const roleName = role === 'super_admin' ? 'Platform Owner' : role === 'owner' ? 'Tenant Admin' : 'Security Analyst';

  return {
    authState: {
      state: {
        user: {
          id: `${role}-user`,
          fullName: roleName,
          name: roleName,
          email: `${role}@zonforge.local`,
          role,
          membership: { role },
          tenant: {
            id: 'tenant-001',
            name: 'ZonForge Sentinel',
            slug: 'zonforge-sentinel',
            onboardingStatus: 'completed',
            onboardingCompletedAt: new Date().toISOString(),
          },
          onboardingStatus: 'completed',
        },
        isLoggedIn: true,
        hasHydrated: true,
      },
      version: 0,
    },
    authRaw: {
      user: {
        fullName: roleName,
        name: roleName,
        email: `${role}@zonforge.local`,
        role,
        workspaceName: 'ZonForge Sentinel',
        tenant: {
          id: 'tenant-001',
          name: 'ZonForge Sentinel',
          slug: 'zonforge-sentinel',
          onboardingStatus: 'completed',
          onboardingCompletedAt: new Date().toISOString(),
        },
      },
      workspace: {
        name: 'ZonForge Sentinel',
        slug: 'zonforge-sentinel',
      },
    },
  };
}

async function seedAuth(page, role) {
  const { authState, authRaw } = seedState(role);
  await page.addInitScript(({ authStateArg, authRawArg }) => {
    localStorage.setItem('zf-auth', JSON.stringify(authStateArg));
    localStorage.setItem('zf_auth', JSON.stringify(authRawArg));
    localStorage.setItem('zf_access_token', 'proof-token');
    localStorage.setItem('zf_refresh_token', 'proof-refresh');
    localStorage.setItem('zf-access-token', 'proof-token');
  }, { authStateArg: authState, authRawArg: authRaw });
}

async function captureAuthenticated(browser, role, route, expectedText, fileName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await seedAuth(page, role);
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByText(expectedText, { exact: false }).first().waitFor({ timeout: 10000 });
  const finalUrl = page.url();
  await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
  console.log(`${route} => ${finalUrl} => ${expectedText}`);
  await context.close();
}

async function capturePublic(browser, route, expectedText, fileName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByText(expectedText, { exact: false }).first().waitFor({ timeout: 10000 });
  const finalUrl = page.url();
  await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
  console.log(`${route} => ${finalUrl} => ${expectedText}`);
  await context.close();
}

const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch(() => chromium.launch({ headless: true }));

try {
  await capturePublic(browser, '/login', 'Sign in to ZonForge', 'login-page.png');
  await captureAuthenticated(browser, 'viewer', '/customer-dashboard', 'Security Dashboard', 'customer-dashboard.png');
  await captureAuthenticated(browser, 'viewer', '/reports', 'Executive Reports', 'customer-reports.png');
  await captureAuthenticated(browser, 'owner', '/admin', 'Admin Overview', 'admin-overview.png');
  await captureAuthenticated(browser, 'owner', '/admin/users', 'User Management', 'admin-users.png');
  await captureAuthenticated(browser, 'super_admin', '/superadmin', 'Platform Overview', 'superadmin-overview.png');
  await captureAuthenticated(browser, 'super_admin', '/superadmin/tenants', 'Tenant Management', 'superadmin-tenants.png');
  await captureAuthenticated(browser, 'viewer', '/billing', 'Billing & Subscription', 'billing-page.png');
  await captureAuthenticated(browser, 'viewer', '/admin', 'You do not have permission to access this route.', 'forbidden-403.png');
  await captureAuthenticated(browser, 'viewer', '/missing-route', 'Page not found', 'not-found-404.png');
} finally {
  await browser.close();
}
