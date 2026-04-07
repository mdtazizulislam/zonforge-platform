# Serial 05 Customer App Cutover

Date: 2026-04-07
Repo: zonforge-platform-main-release

## Outcome

- Separate Netlify production site created: zonforge-app
- Live verified URL: https://zonforge-app.netlify.app
- Requested cutover target https://app.zonforge.com is not complete because the custom domain could not be attached from the available Netlify account/API permissions
- Existing https://zonforge.com landing remained untouched during this work

## Deployment Facts

- Netlify site id: 809e4a9f-26c1-4587-8072-999eb21bba6b
- Production deploy id: 69d49f38bc9a7f9338dd486e
- Standalone customer dashboard build output: apps/web-dashboard/dist
- Standalone bundle deployed to a separate Netlify site so the root landing deployment was not modified

## Verification Completed

- Public login page rendered on https://zonforge-app.netlify.app
- Real disposable account registration succeeded against the live backend
- Real login succeeded and landed on /customer-dashboard
- Customer routes verified:
  - /customer-dashboard
  - /customer-alerts
  - /customer-billing
  - /customer-settings
- Refresh on a protected customer route preserved app state
- Logout API succeeded
- Post-logout protected-route redirect to /login was verified after clearing persisted auth state

## Important Findings

- The customer shell currently has no visible logout control in the UI
- Route protection depends on persisted auth state stored under zf-auth, not only token keys
- Frontend runtime worked on the deployed hostname without breaking zonforge.com

## Blockers

- Netlify custom-domain attach attempts for app.zonforge.com did not complete
- Netlify DNS record creation attempts returned API validation failures
- Netlify environment variable writes for this site were rejected by the available account permissions

## Proof Artifacts

- proof/runs/serial-05-zonforge-app-netlify-home.png
- proof/runs/serial-05-customer-dashboard.png
- proof/runs/serial-05-customer-alerts.png
- proof/runs/serial-05-customer-billing.png
- proof/runs/serial-05-customer-settings.png
- proof/runs/serial-05-post-logout-login.png