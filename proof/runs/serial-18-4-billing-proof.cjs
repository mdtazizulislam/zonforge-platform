const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const outputDir = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'test-results',
  'serial-18-4-billing',
);

const baseUrl = 'http://localhost:5173/app/';
const appRoute = '/billing';

const seededUser = {
  id: 'user_owner_1',
  email: 'owner@zonforge.com',
  fullName: 'Workspace Owner',
  name: 'Workspace Owner',
  role: 'owner',
  status: 'active',
  emailVerified: true,
  tenantId: 'tenant_1',
  tenant: {
    id: 'tenant_1',
    name: 'ZonForge Sentinel',
    slug: 'zonforge-sentinel',
    plan: 'growth',
    onboardingStatus: 'completed',
    onboardingStartedAt: null,
    onboardingCompletedAt: null,
  },
  membership: {
    role: 'owner',
  },
  onboardingStatus: 'completed',
  mfaEnabled: false,
};

const subscriptionPayload = {
  subscription: {
    tenantId: 'tenant_1',
    planCode: 'growth',
    planName: 'Growth',
    planTier: 'growth',
    status: 'active',
    billingInterval: 'monthly',
    currentPeriodStart: '2026-04-01T00:00:00.000Z',
    currentPeriodEnd: '2026-05-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    eligible_for_checkout: true,
    limits: {
      max_connectors: 25,
      max_identities: 1500,
      events_per_minute: 75000,
      retention_days: 180,
    },
  },
  eligible_for_checkout: true,
};

const usagePayload = {
  usage: {
    connectors: 12,
    identities: 842,
    events_per_minute_current: 42150,
    retention_days_current: 120,
  },
};

const plansPayload = {
  plans: [
    {
      code: 'starter',
      name: 'Starter',
      priceMonthly: 99,
      priceAnnual: 999,
      limits: {
        max_connectors: 5,
        max_identities: 250,
        events_per_minute: 10000,
        retention_days: 30,
      },
      features: ['Core detections', 'Basic alert triage', '30 day retention'],
    },
    {
      code: 'growth',
      name: 'Growth',
      priceMonthly: 499,
      priceAnnual: 4990,
      limits: {
        max_connectors: 25,
        max_identities: 1500,
        events_per_minute: 75000,
        retention_days: 180,
      },
      features: ['Advanced detections', 'AI assistant', 'Team management', 'Priority support'],
    },
    {
      code: 'business',
      name: 'Business',
      priceMonthly: 1299,
      priceAnnual: 12990,
      limits: {
        max_connectors: 100,
        max_identities: 10000,
        events_per_minute: 250000,
        retention_days: 365,
      },
      features: ['Custom onboarding', 'SSO and SCIM', 'Dedicated success manager', 'Extended retention'],
    },
  ],
};

function joinBounds(boxes) {
  const visible = boxes.filter(Boolean);
  if (visible.length === 0) return null;

  const left = Math.min(...visible.map((box) => box.x));
  const top = Math.min(...visible.map((box) => box.y));
  const right = Math.max(...visible.map((box) => box.x + box.width));
  const bottom = Math.max(...visible.map((box) => box.y + box.height));

  return {
    x: Math.max(0, Math.floor(left - 16)),
    y: Math.max(0, Math.floor(top - 16)),
    width: Math.ceil(right - left + 32),
    height: Math.ceil(bottom - top + 32),
  };
}

async function mockBillingRoutes(page) {
  await page.route('**/api/v1/billing/subscription', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(subscriptionPayload),
    });
  });

  await page.route('**/api/v1/billing/usage', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(usagePayload),
    });
  });

  await page.route('**/api/v1/billing/plans', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plansPayload),
    });
  });

  await page.route('**/api/v1/billing/checkout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session_url: 'https://example.com/checkout/session' }),
    });
  });

  await page.route('**/api/v1/billing/portal', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://example.com/billing/portal' }),
    });
  });

  await page.route('**/api/v1/billing/cancel', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ canceled: true }),
    });
  });
}

async function seedAndOpen(page) {
  await page.addInitScript(({ user, route }) => {
    window.history.replaceState(null, '', route);

    window.localStorage.setItem(
      'zf-auth',
      JSON.stringify({
        state: {
          user,
          isLoggedIn: true,
        },
        version: 0,
      }),
    );

    window.localStorage.setItem(
      'zf_auth',
      JSON.stringify({
        user: {
          fullName: user.fullName,
          name: user.name,
          email: user.email,
          role: user.role,
          workspaceName: user.tenant.name,
        },
        workspace: {
          name: user.tenant.name,
          slug: user.tenant.slug,
        },
        accessToken: 'proof-token',
      }),
    );

    window.localStorage.setItem('zf-access-token', 'proof-token');
  }, { user: seededUser, route: appRoute });

  await mockBillingRoutes(page);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/billing');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('text=Billing & Subscription');
  await page.waitForSelector('text=Current Plan');
  await page.waitForSelector('text=Usage & Limits');
  await page.waitForSelector('text=Plan comparison');
}

async function captureDesktop(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1800 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  await seedAndOpen(page);

  await page.screenshot({
    path: path.join(outputDir, 'desktop-billing-page.png'),
    fullPage: true,
  });

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({
    path: path.join(outputDir, 'billing-hero-summary.png'),
  });

  await page.getByText('Actions', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(outputDir, 'billing-actions-usage.png'),
  });

  await page.getByText('Plan comparison', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(outputDir, 'billing-plan-comparison.png'),
  });

  await context.close();
}

async function captureMobile(browser) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  await seedAndOpen(page);

  await page.screenshot({
    path: path.join(outputDir, 'mobile-billing-page.png'),
    fullPage: true,
  });

  await context.close();
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    await captureDesktop(browser);
    await captureMobile(browser);
    console.log(outputDir);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});