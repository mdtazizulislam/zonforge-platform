# ARCH-SPLIT-01 Standalone Dashboard Plan

## Current Architecture

- Production currently publishes the repository root Netlify site from `landing`.
- The dashboard is built from `apps/web-dashboard` with `base: '/app/'` and writes to `landing/app`.
- Customer and authenticated routes are rewritten by `landing/_redirects` to `/app/index.html`.
- Frontend API traffic is currently expected to work through `/api`, which Netlify proxies to `https://api.zonforge.com/:splat`.
- Auth tokens are stored in browser `localStorage` under `zf_access_token` and `zf_refresh_token`.
- Auth session state is persisted in Zustand local storage under `zf-auth`.

## Target Architecture

- `https://zonforge.com` remains the landing site.
- `https://app.zonforge.com` serves the dashboard SPA from its own deployment.
- `https://api.zonforge.com` remains the backend API origin.
- The split is additive: current mixed deployment remains live until a later cutover serial.

## Additive Delta In This Serial

- Added `apps/web-dashboard/vite.app.config.ts` to build the dashboard as a standalone SPA at the domain root.
- Preserved the existing `apps/web-dashboard/vite.config.ts` build that outputs into `landing/app`.
- Added `apps/web-dashboard/netlify.app.toml` as the future app-site deployment config.
- Added `apps/web-dashboard/public/_redirects` for standalone SPA routing and `/api` proxying on the future app domain.
- Added `apps/web-dashboard/.env.example` to document non-secret app/api domain configuration.
- Added `apps/web-dashboard/src/lib/runtime-config.ts` so app origin and API base can be configured explicitly.
- Updated dashboard code paths that assumed the current browser origin for auth/session redirects and MSSP impersonation links.

## Audit Findings

### Current Build Assumptions

- Current dashboard output path: `landing/app`
- Current dashboard base path: `/app/`
- Current root Netlify publish directory: `landing`
- Current root Netlify build command: `npm run build:dashboard`
- Current landing rewrites route authenticated traffic to `/app/index.html`

### API And Auth Assumptions

- Shared API client uses `VITE_API_URL` and falls back to `/api`.
- Many pages still call `/api/...` directly instead of going through the shared API client.
- Current standalone readiness depends on keeping `/api` proxied on the future app site.
- Tokens are bearer tokens in `localStorage`, not cookies.
- No cross-subdomain cookie/session configuration exists yet.
- Auth expiry currently redirects to `/login`; this serial makes that app-origin aware via `VITE_APP_URL`.
- No OAuth callback handler or external identity-provider callback config was found in the dashboard app.

## Standalone Deployment Readiness

### Future App Site Build

- Netlify base directory for the future app site should be `apps/web-dashboard`.
- Future app-site config file: `apps/web-dashboard/netlify.app.toml`
- Future standalone build command: `npm run build:standalone`
- Future standalone publish directory: `dist`
- Future app-site SPA rewrite file: `apps/web-dashboard/public/_redirects`

### Environment Variables

- `VITE_API_URL=/api`
- `VITE_API_BASE_URL=/api`
- `VITE_APP_URL=https://app.zonforge.com`
- `VITE_AUTH_CALLBACK_URL=https://app.zonforge.com/login`

These defaults keep the browser talking to `/api` on the app domain while allowing the deployment layer to proxy to `https://api.zonforge.com`.

## Risks

- Direct `/api/...` fetch calls are still spread across multiple pages. They are safe for the standalone site only if the app domain preserves the `/api` proxy.
- Token storage remains localStorage-based, which means a later cross-domain auth hardening serial should review XSS exposure and token lifecycle.
- A true auth-domain cutover may require explicit allowed-origin and callback configuration in backend auth and any third-party identity provider.
- Billing or external redirect flows may still need explicit `app.zonforge.com` callback/origin configuration during cutover.

## Rollback

- No rollback is needed for production because this serial does not replace the existing landing-based deployment path.
- If the standalone prep needs to be reverted, remove the additive standalone files and scripts only.
- The existing `npm run build:dashboard` plus `landing/_redirects` flow remains the authoritative production path today.

## Validation Checklist

- Root production build path preserved: `apps/web-dashboard/vite.config.ts` still outputs to `landing/app` with base `/app/`.
- Standalone dashboard build path added: `apps/web-dashboard/vite.app.config.ts` outputs to `apps/web-dashboard/dist` with base `/`.
- Standalone Netlify config added without changing the current root `netlify.toml`.
- Standalone SPA rewrite/proxy config added without changing `landing/_redirects`.
- Env documentation added without storing any secrets.

## Next Serial Requirements For ARCH-SPLIT-02

1. Provision a second Netlify site for `app.zonforge.com` with base directory `apps/web-dashboard`.
2. Point `app.zonforge.com` DNS at the new site and verify TLS.
3. Validate the `/api/*` proxy or switch frontend calls to an explicit `https://api.zonforge.com` strategy consistently.
4. Audit backend CORS, allowed origins, auth callbacks, billing return URLs, and any SSO metadata for `app.zonforge.com`.
5. Run browser proof against the new app site before any traffic cutover.
6. Cut traffic only after the standalone app passes parity verification against the current mixed deployment.