# SERIAL-01 Platform Architecture Lock

## A. Current State

- Production is currently a mixed deployment on `https://zonforge.com`.
- The repository root Netlify site publishes `landing` via root `netlify.toml`.
- The React dashboard bundle is currently built from `apps/web-dashboard` into `landing/app` with Vite base `/app/`.
- `landing/_redirects` currently rewrites authenticated SPA routes to `/app/index.html` and proxies `/api/*` to `https://api.zonforge.com/:splat`.
- Auth currently uses bearer access and refresh tokens stored in browser `localStorage` keys `zf_access_token` and `zf_refresh_token`.
- Frontend auth state is persisted in Zustand storage key `zf-auth`.
- The current SPA mixes customer routes and at least one platform-admin route family in the same frontend application.
- There is no dedicated standalone admin frontend app in the repository today.
- A future standalone customer app deployment path already exists as additive prep through `apps/web-dashboard/vite.app.config.ts` and `apps/web-dashboard/netlify.app.toml`, but it is not cut over.

## B. Target Final State

- `zonforge.com` serves landing, pricing, marketing, and signup entry only.
- `app.zonforge.com` serves the customer application only.
- `admin.zonforge.com` serves the super admin application only.
- `api.zonforge.com` serves backend APIs only.
- Public web, customer app, admin app, and API become separate runtime surfaces with explicit boundaries.
- No route family should be shared across public, customer, and admin surfaces after cutover.

## C. Domain Map

| Domain | Final Role | Allowed Content |
| --- | --- | --- |
| `zonforge.com` | Public site | Landing, pricing, marketing pages, signup entry, public documentation entry points |
| `app.zonforge.com` | Customer app | Customer dashboard, alerts, investigations, AI assistant, billing, settings |
| `admin.zonforge.com` | Super admin app | Tenant management, platform controls, billing oversight, global system administration |
| `api.zonforge.com` | Backend API | Auth, session, customer data, admin actions, billing, platform APIs |

## D. App Boundaries

### Public Site Boundary

- Owns public acquisition and product-marketing flows.
- Must not embed authenticated customer console routes long-term.
- May link to customer or admin sign-in entry points, but must not host their internal route trees.

### Customer App Boundary

- Owns tenant-scoped product usage for customers.
- Includes dashboard, alerts, investigations, assistant, billing, settings, compliance, connectors, playbooks, and similar tenant-scoped workflows.
- Must not host super-admin-only tenant management or global platform control surfaces after cutover.

### Super Admin App Boundary

- Owns platform-operator workflows only.
- Includes tenant oversight, suspension, impersonation controls, platform-level billing oversight, and global operational views.
- Must not mix with customer-facing navigation or customer route families.

### Current Mixed-Boundary Findings

- The current frontend route tree in `apps/web-dashboard/src/App.tsx` mixes customer routes with broader operational routes.
- The `/mssp` route is already effectively a platform-admin surface because it exposes tenant controls and impersonation behavior and the backend MSSP service requires `PLATFORM_ADMIN`.
- There is no separate admin frontend package yet, so admin UI separation is not implemented today.

## E. Auth Boundary

### Current State

- Tokens are stored in `localStorage`, not cookies.
- Session refresh is performed with a refresh token posted to `/v1/auth/refresh`.
- Auth redirect fallback currently resolves to `/login` on the active app origin.
- Current production relies on same-site browser access through `zonforge.com` plus Netlify `/api` proxying.

### Locked Final Direction

- Auth must be centralized on `api.zonforge.com`.
- Customer app and admin app must authenticate against the same API authority but with role-aware authorization boundaries.
- App origin, admin origin, API origin, login redirect URI, logout redirect URI, callback URI, billing return URI, and allowed origins must all be environment-configurable.
- Role separation must be enforced by API authorization, not only by frontend route hiding.

### Expected Cross-Domain Issues

- `localStorage` tokens do not provide shared browser session semantics across `app.zonforge.com` and `admin.zonforge.com`.
- If cookies are adopted in later serials, cookie domain, SameSite, secure flags, CSRF posture, and subdomain scoping must be designed explicitly.
- Any SSO, OAuth, or billing redirect workflow will require explicit callback and allowed-origin updates before cutover.

## F. API Boundary

- `api.zonforge.com` is the only locked backend domain.
- Public site, customer app, and admin app must all treat the API as an external boundary, even if proxying is temporarily used.
- Customer endpoints and admin endpoints may share backend services, but they must be role-segmented and auditable.
- Admin actions such as tenant suspension, impersonation, and global billing oversight must never be hosted directly on public or customer domains.
- The temporary `/api` proxy pattern is acceptable during transition, but the architectural owner remains `api.zonforge.com`.

## G. Deployment Boundary

### Current Deployment That Must Remain Untouched For Now

- Root Netlify deploy publishes `landing`.
- Root build command remains `npm run build:dashboard`.
- Current Vite customer build remains `base: '/app/'` to `landing/app`.
- Current landing redirects remain responsible for serving the SPA and proxying `/api`.

### Locked Future Deployment Targets

- `zonforge.com`: landing deployment only.
- `app.zonforge.com`: standalone customer SPA deployment from the dashboard app.
- `admin.zonforge.com`: future standalone admin SPA deployment from a dedicated admin frontend.
- `api.zonforge.com`: backend/API deployment only.

### Locked Later Cutover Order

1. Keep current mixed production unchanged while docs and additive configs are prepared.
2. Stand up standalone customer app deployment for `app.zonforge.com` without switching live traffic.
3. Create or extract dedicated admin frontend and deploy it to `admin.zonforge.com` without switching operator workflows yet.
4. Audit and update auth, CORS, callback, and billing return/origin settings for the split domains.
5. Verify route parity, session behavior, and admin/customer role boundaries in isolated environments.
6. Move customer traffic to `app.zonforge.com`.
7. Move super-admin traffic to `admin.zonforge.com`.
8. Reduce `zonforge.com` to public-site ownership only.

## H. Risks

- Current SPA route ownership is mixed, so accidental leakage of admin navigation into customer space is possible until separation is implemented.
- The `/mssp` surface is already admin-like and should not remain in the customer app after cutover.
- `localStorage` token handling may complicate secure cross-subdomain session behavior.
- Direct `/api/...` fetch usage across many frontend pages increases migration risk if proxying assumptions are changed inconsistently.
- Signup currently routes through the SPA under the mixed deployment, so final public-site ownership for signup entry needs explicit handling in later serials.

## I. Rollback Notes

- This serial is documentation-only and does not change runtime behavior.
- No production rollback is required because deployment paths, redirects, and domains remain unchanged.
- If later serials fail, the current root Netlify flow remains the fallback until cutover is complete and verified.

## J. What Will Change In SERIAL 02

- SERIAL 02 should formalize the standalone customer app deployment plan for `app.zonforge.com`.
- It should keep current production untouched while validating the standalone customer deploy target, environment variables, proxy strategy, and routing readiness.
- It should not cut traffic yet.

## K. What Must Remain Untouched Until Cutover

- Root `netlify.toml` publish flow.
- `landing/_redirects` behavior for the current live site.
- `apps/web-dashboard/vite.config.ts` output to `landing/app`.
- Current production customer route availability on `zonforge.com`.
- Current `/api` proxy behavior used by the live mixed deployment.

## Locked Route Ownership

### Public Site Routes

- `/`
- public marketing pages such as pricing and documentation entry points
- signup entry owned by public-site UX in the final architecture, even though current mixed deployment still routes `/signup` into the SPA

### Customer App Routes

- `/login`
- `/dashboard`
- `/customer-dashboard`
- `/customer-alerts`
- `/customer-investigations`
- `/customer-ai-assistant`
- `/customer-billing`
- `/customer-settings`
- `/alerts`
- `/risk`
- `/connectors`
- `/compliance`
- `/playbooks`
- `/audit`
- `/settings`
- `/billing`
- `/threat-hunting`
- `/security-validation`
- `/ai-assistant`
- `/investigations`
- `/compliance-reports`

### Admin App Routes

- `/mssp` must become admin-owned
- future admin routes should also absorb any platform-control, tenant-oversight, and impersonation workflows
- current repo has no dedicated admin route namespace yet; this is an implementation gap, not a reason to keep admin mixed into the customer app

### Routes That Must Not Be Mixed In Final State

- Customer dashboard and tenant operations must not share the same deployed app shell as platform-admin controls.
- Public marketing and signup acquisition pages must not live inside the customer or admin app shells.
- API endpoints must not be treated as frontend route ownership.

## Current Admin And Super-Admin Findings

- No dedicated admin frontend app exists in the current repo.
- The current web dashboard includes `/mssp`, which behaves like an admin console.
- Backend support for admin-like actions already exists in `apps/mssp-console`, where routes are guarded for `PLATFORM_ADMIN` and CORS already anticipates `https://app.zonforge.com` and `https://admin.zonforge.com`.

## SERIAL Roadmap 02–08

### SERIAL 02

- Standalone customer app deployment prep for `app.zonforge.com`.
- Validate standalone build, env contract, proxy contract, and zero-downtime readiness.

### SERIAL 03

- Extract or scaffold dedicated admin frontend ownership for `admin.zonforge.com`.
- Move `/mssp` and related operator workflows behind an admin-only app shell.

### SERIAL 04

- Lock API origin contract for public, customer, and admin clients.
- Audit CORS, callback URLs, logout URLs, billing redirects, and impersonation flows.

### SERIAL 05

- Implement role and auth boundary hardening.
- Ensure admin-only capabilities are enforced by API authorization and audited end to end.

### SERIAL 06

- Validate customer app parity on `app.zonforge.com` with proof runs.
- Confirm no regression in customer routes, auth refresh, billing, and API access.

### SERIAL 07

- Validate admin app parity on `admin.zonforge.com` with proof runs.
- Confirm tenant control, impersonation, oversight, and audit logging behavior.

### SERIAL 08

- Execute staged production cutover.
- Reduce `zonforge.com` to public-site ownership only after app and admin domains are verified.

## Architecture Summary

- Locked final structure: `zonforge.com` public, `app.zonforge.com` customer, `admin.zonforge.com` super admin, `api.zonforge.com` backend.
- Locked current-state constraint: do not alter the current mixed deployment until later serial cutover.
- Locked implementation rule: future work must separate route ownership, deployment ownership, and auth ownership rather than extending the mixed SPA indefinitely.