# SERIAL-04 Domain, Auth, and API Alignment Plan

## A. Scope Lock

- This serial prepares domain, auth, and API alignment for `zonforge.com`, `app.zonforge.com`, `admin.zonforge.com`, and `api.zonforge.com`.
- This serial does not cut over traffic.
- This serial does not remove the current `/api` proxy.
- This serial does not replace the current login flow.

## B. Current Runtime Contract

### Customer App

- `apps/web-dashboard` continues to default API traffic to `/api`.
- `VITE_API_BASE_URL` now acts as the explicit override for future standalone customer deployment.
- `VITE_APP_URL` represents the future customer-app origin.
- `VITE_AUTH_CALLBACK_URL` and `VITE_LOGOUT_REDIRECT_URL` provide additive redirect targets for split-domain auth preparation.

### Admin App

- `apps/admin-dashboard` continues to default API traffic to `/api`.
- `VITE_API_BASE_URL` now acts as the explicit override for future standalone admin deployment.
- `VITE_ADMIN_APP_URL` represents the future admin-app origin.
- `VITE_AUTH_CALLBACK_URL` and `VITE_LOGOUT_REDIRECT_URL` provide additive redirect targets for platform-admin auth preparation.

## C. Current Auth Model

### Token Storage

- Customer auth is token-based, not cookie-based.
- Access token storage key: `zf_access_token` in browser `localStorage`.
- Refresh token storage key: `zf_refresh_token` in browser `localStorage`.
- Frontend auth state persists in Zustand under `zf-auth`.
- Admin app does not yet own a separate login implementation; it is still a standalone shell scaffold.

### Login Flow

- Customer login posts credentials to `/v1/auth/login` through the current API base.
- On success, the SPA stores access and refresh tokens in `localStorage` and hydrates the authenticated user into Zustand.
- The current redirect after login remains an in-app navigation to `/customer-dashboard`.
- This preserves the current production behavior on `zonforge.com` plus the existing `/api` proxy.

### Refresh Logic

- Authenticated requests send the bearer access token.
- On `401`, the customer SPA posts the stored refresh token to `/v1/auth/refresh`.
- If refresh succeeds, the access token and refresh token are rotated in `localStorage` and the original request retries.
- If refresh fails, local tokens are cleared and the browser returns to the login route on the current app origin.

### Logout Flow

- Frontend logout now posts the stored refresh token to `/v1/auth/logout` before clearing client-side auth state.
- The logout redirect remains app-origin aware and is now environment-configurable for later domain split.
- This is additive and safe for the current production model because backend logout already accepts an optional `refresh_token` body.

## D. Cross-Domain Gaps That Still Exist

- `localStorage` tokens are origin-scoped, so customer and admin apps will not share browser session state automatically across subdomains.
- Current login completes entirely in the customer SPA and is not yet brokered by a dedicated centralized auth UX.
- Session continuity between `app.zonforge.com` and `admin.zonforge.com` will require either repeated sign-in, a centralized token exchange flow, or a later move to secure cookies.
- Logout is now redirect-aware, but there is not yet a full cross-app logout cascade.
- The admin app still lacks production auth screens and session guards.

## E. Required Changes Before Domain Cutover

### Login Redirect

- Customer login callback should resolve to `https://app.zonforge.com/login` in standalone customer deployments.
- Admin login callback should resolve to `https://admin.zonforge.com/` or a future dedicated admin sign-in route.
- If centralized auth is introduced later, both apps must receive role-appropriate post-auth redirects.

### Logout Redirect

- Customer logout should return to the customer login entry on `app.zonforge.com`.
- Admin logout should return to the admin login entry on `admin.zonforge.com`.
- Logout must revoke refresh capability server-side before redirecting the browser.

### Session Validation

- Customer and admin apps should validate active sessions against `GET /v1/auth/me` on `api.zonforge.com`.
- Current helper defaults keep validation on `/api/v1/auth/me` until standalone deployment uses `VITE_API_BASE_URL=https://api.zonforge.com`.
- Role checks must remain API-enforced even after frontend route separation is complete.

## F. API Base Contract

- Locked default runtime API base: `/api`
- Locked override runtime API base: `VITE_API_BASE_URL`
- This keeps the current proxy-backed production flow intact while making standalone customer and admin deployments point directly at `https://api.zonforge.com`.

## G. CORS Preparation

### Required Allowed Origins

- `https://zonforge.com`
- `https://app.zonforge.com`
- `https://admin.zonforge.com`

### Required Backend Behavior

- Backend CORS policy must explicitly allow the three production browser origins above.
- Credentialed requests must continue to allow `Authorization` and `Content-Type` headers.
- Any service that still hard-codes only `https://zonforge.com` or only `https://app.zonforge.com` needs follow-up alignment before cutover.
- Backend validation that currently restricts production frontend URLs to `zonforge.com` only must be widened in a later serial to accept the locked split-domain map.

### Current Findings

- `apps/backend/src/index.ts` currently returns only `https://zonforge.com` from its CORS origin handler.
- `apps/backend/src/security.ts` still rejects production frontend URLs outside `zonforge.com` and `www.zonforge.com`.
- Some services already anticipate `app.zonforge.com` and `admin.zonforge.com`, but the posture is inconsistent across the repo.

## H. Domain Interaction Model

### Current

- Browser -> `https://zonforge.com`
- SPA route handling -> `landing/app`
- API access -> `/api/*` proxy -> `https://api.zonforge.com/*`

### Prepared Future

- Browser -> `https://app.zonforge.com` for customer workflows
- Browser -> `https://admin.zonforge.com` for platform-admin workflows
- Both SPAs -> `https://api.zonforge.com` via `VITE_API_BASE_URL`
- Public site remains `https://zonforge.com`

## I. Risks

- Cross-subdomain auth remains incomplete while tokens live only in origin-bound `localStorage`.
- Backend CORS and production frontend URL validation are not yet uniformly aligned to the split-domain target.
- Admin auth behavior remains a scaffold concern because the admin app does not yet own a full login/session implementation.
- Billing, impersonation, and third-party callback flows still need explicit return-url review before cutover.

## J. Validation Notes For This Serial

- Customer runtime keeps `/api` as the default base and still supports env override.
- Admin runtime keeps `/api` as the default base and still supports env override.
- Current production routing remains unchanged.
- This serial only prepares envs, redirect helpers, logout revocation behavior, and architecture documentation.