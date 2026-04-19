import { chromium, devices } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4173';
const desktopOut = 'c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/serial-18-shell/desktop-billing-shell.png';
const mobileBillingOut = 'c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/serial-18-shell/mobile-billing-shell.png';
const mobileDrawerOut = 'c:/Users/vitor/Downloads/zonforge-sentinel-v4.6.0_1/zonforge-platform-main-release/proof/runs/serial-18-shell/mobile-drawer-open.png';

const persistedAuth = {
  state: {
    user: {
      fullName: 'Workspace Owner',
      name: 'Workspace Owner',
      email: 'owner@zonforge.local',
      role: 'owner',
      membership: { role: 'owner' },
    },
    isLoggedIn: true,
    hasHydrated: true,
  },
  version: 0,
};

const rawAuth = {
  user: {
    fullName: 'Workspace Owner',
    name: 'Workspace Owner',
    email: 'owner@zonforge.local',
    role: 'owner',
    workspaceName: 'ZonForge Sentinel',
  },
  workspace: {
    name: 'ZonForge Sentinel',
    slug: 'zonforge-sentinel',
  },
};

async function seedStorage(page) {
  await page.addInitScript(({ authState, authRaw }) => {
    window.localStorage.setItem('zf-auth', JSON.stringify(authState));
    window.localStorage.setItem('zf_auth', JSON.stringify(authRaw));
    window.localStorage.setItem('zf-access-token', 'proof-token');
  }, { authState: persistedAuth, authRaw: rawAuth });
}

async function gotoFirstWorking(page, candidates, expectedText) {
  for (const candidate of candidates) {
    await page.goto(`${baseUrl}${candidate}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.getByText(expectedText, { exact: false }).waitFor({ timeout: 8000 });
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(`Could not find expected text "${expectedText}" on any candidate route.`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

const browser = await launchBrowser();

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    colorScheme: 'dark',
  });
  const desktopPage = await desktopContext.newPage();
  await seedStorage(desktopPage);
  await gotoFirstWorking(desktopPage, ['/billing', '/app/billing'], 'Billing & Subscription');
  await desktopPage.screenshot({ path: desktopOut, fullPage: true });
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
  });
  const mobilePage = await mobileContext.newPage();
  await seedStorage(mobilePage);
  await gotoFirstWorking(mobilePage, ['/billing', '/app/billing'], 'Billing & Subscription');
  await mobilePage.screenshot({ path: mobileBillingOut, fullPage: true });
  await mobileContext.close();

  const drawerContext = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
  });
  const drawerPage = await drawerContext.newPage();
  await seedStorage(drawerPage);
  await gotoFirstWorking(drawerPage, ['/customer-dashboard', '/app/customer-dashboard'], 'Security Dashboard');
  await drawerPage.getByRole('button', { name: 'Open navigation' }).click();
  await drawerPage.screenshot({ path: mobileDrawerOut, fullPage: true });
  await drawerContext.close();
} finally {
  await browser.close();
}
