# SERIAL-03 Admin Standalone Plan

## Admin Scope

The standalone admin app is reserved for super-admin and platform-operator workflows on `admin.zonforge.com`.

### Identified Admin Features In Current State

- Current frontend route: `/mssp`
- Current backend platform-admin route family: `/v1/mssp/*`
- Tenant lifecycle admin endpoints already exist in `apps/tenant-service` under `/v1/admin/tenants` and `/v1/admin/tenants/:tenantId/suspend`
- Current admin-like UI behaviors in `apps/web-dashboard/src/pages/MsspPage.tsx`:
  - cross-tenant overview
  - tenant search and listing
  - posture and MRR summary
  - cross-tenant alert view
  - tenant impersonation
  - tenant suspension
- Current admin-only authorization dependency:
  - `PLATFORM_ADMIN` guard in `apps/mssp-console/src/routes/mssp.routes.ts`

## Standalone Admin Routes

- `/admin-dashboard`
- `/admin-tenants`
- `/admin-billing`
- `/admin-connectors`
- `/admin-users`

These routes are intentionally isolated from the customer route family and use a separate admin shell.

## Build Config

- App path: `apps/admin-dashboard`
- Build tool: Vite
- Output directory: `apps/admin-dashboard/dist`
- SPA fallback file: `apps/admin-dashboard/public/_redirects`
- Environment variables:
  - `VITE_ADMIN_APP_URL=https://admin.zonforge.com`
  - `VITE_API_BASE_URL=https://api.zonforge.com`

## Migration Plan

### What Must Move From Customer App Later

- `/mssp` route and its navigation entry
- platform-admin tenant controls
- impersonation launch flow
- cross-tenant alert and revenue oversight UI

### What Must Stay In Customer App

- tenant-scoped dashboard and customer modules
- customer billing and settings
- customer-only alerts, investigations, and assistant workflows

### Dependencies To Resolve In Later Serials

- shared auth/session model for `admin.zonforge.com`
- platform-admin callback and logout URLs
- API authorization and audit coverage for admin-only flows
- extraction or reuse of shared UI primitives without coupling to the customer shell

## Validation Intent

- The admin app should build standalone without using the customer app shell.
- Current customer app and landing deployment remain untouched.
- No current routes are moved or cut over in this serial.