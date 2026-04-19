const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outputPath = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'test-results',
  'customer-layout-proof.png',
);

const appUrl = 'http://localhost:5173/app/';
const appRoute = '/customer-settings';

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

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  await page.route('**/*', async (route) => {
    const url = route.request().url();

    if (url.includes('/v1/team/members')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              membershipId: 'member_1',
              userId: 'user_owner_1',
              email: 'owner@zonforge.com',
              fullName: 'Workspace Owner',
              status: 'active',
              role: 'owner',
              createdAt: '2026-04-09T12:00:00.000Z',
              updatedAt: '2026-04-09T12:00:00.000Z',
              isCurrentUser: true,
              invitedBy: null,
            },
            {
              membershipId: 'member_2',
              userId: 'user_admin_1',
              email: 'admin@zonforge.com',
              fullName: 'Avery Admin',
              status: 'active',
              role: 'admin',
              createdAt: '2026-04-09T12:00:00.000Z',
              updatedAt: '2026-04-09T12:00:00.000Z',
              isCurrentUser: false,
              invitedBy: {
                userId: 'user_owner_1',
                email: 'owner@zonforge.com',
                fullName: 'Workspace Owner',
              },
            },
          ],
          permissions: {
            canManageTeam: true,
            currentRole: 'owner',
          },
        }),
      });
    }

    if (url.includes('/v1/team/invites')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'invite_1',
              email: 'analyst@zonforge.com',
              role: 'analyst',
              status: 'pending',
              expiresAt: '2026-04-16T12:00:00.000Z',
              createdAt: '2026-04-09T12:00:00.000Z',
              updatedAt: '2026-04-09T12:00:00.000Z',
              acceptedAt: null,
              revokedAt: null,
              acceptedByUserId: null,
              invitedBy: {
                userId: 'user_owner_1',
                email: 'owner@zonforge.com',
                fullName: 'Workspace Owner',
              },
            },
          ],
        }),
      });
    }

    return route.continue();
  });

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
      }),
    );
  }, { user: seededUser, route: appRoute });

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/customer-settings');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('text=Executive Overview');
  await page.waitForSelector('text=Customer Workspace');
  await page.waitForSelector('text=Settings');

  await page.screenshot({ path: outputPath, fullPage: true });
  console.log(outputPath);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});