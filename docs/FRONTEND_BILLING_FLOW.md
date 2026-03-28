# Frontend Billing Flow

Serial: ZONFORGE-FRONTEND-SERIAL-10
Last updated: 2026-03-28

## Scope

This document describes the production frontend billing flow implemented in web-dashboard against zonforge-backend.

## Routes Added/Updated

- Updated login route behavior in /login to support signup mode and redirect resume (`?next=`).
- Existing billing route kept: `/billing`.
- Existing success route enhanced: `/billing/success`.
- New cancel route added: `/billing/cancel`.

## Components/Files Changed

- `apps/web-dashboard/src/lib/api.ts`
- `apps/web-dashboard/src/pages/LoginPage.tsx`
- `apps/web-dashboard/src/pages/BillingPage.tsx`
- `apps/web-dashboard/src/pages/BillingSuccessPage.tsx`
- `apps/web-dashboard/src/pages/BillingCancelPage.tsx`
- `apps/web-dashboard/src/App.tsx`

## API Calls Used

All billing/auth calls for this flow use `api.billingAuth` and `api.billingApi` in `src/lib/api.ts`.

### Auth

- `POST /auth/signup`
- `POST /auth/login`

### Billing

- `GET /billing/plans`
- `GET /billing/subscription`
- `GET /billing/status`
- `POST /billing/checkout-session`
- `POST /billing/portal`

## Auth Requirements

- `/billing`, `/billing/success`, and `/billing/cancel` are protected by `RequireAuth`.
- If user is unauthenticated, app redirects to `/login?next=<requested-path>`.
- After successful login/signup, app resumes navigation to `next` when provided.
- Auth token is persisted via existing `tokenStorage` (`zf_access_token`).

## Redirect Flow

1. User opens `/billing`.
2. If not logged in, redirected to `/login?next=/billing`.
3. User logs in or signs up.
4. User selects paid plan.
5. Frontend calls `POST /billing/checkout-session` with `{ planCode }`.
6. On success, browser redirects to Stripe checkout URL from backend response.
7. Stripe returns user to either:
   - `/billing/success`
   - `/billing/cancel`

## Success Polling Logic

`/billing/success` performs bounded polling of `GET /billing/subscription`:

- Poll interval: 2 seconds
- Max attempts: 10
- Exit early when status is `active` or `trialing`
- If still pending after 10 attempts, show verifying message and keep link to Billing page

## UI States Implemented

- Plan cards loaded from backend plan catalog (`GET /billing/plans`)
- Current plan detected from backend subscription/status data
- Button states:
  - Current plan badge
  - Active plan state
  - Upgrade action
  - Loading state (`Loading...`) while checkout call is in-flight
- Inline error banner on checkout/portal failures
- Success state card on `/billing/success`
- Cancel state card on `/billing/cancel`
- Renewal/cancellation text derived from backend subscription fields

## Known Limitations

- Legacy v1 API client methods remain in codebase for non-billing pages; billing flow uses dedicated backend contract methods.
- MFA/TOTP UI remains in LoginPage for compatibility, but zonforge-backend auth endpoints used here are email/password oriented.
- Full browser screenshot proof requires interactive test run against deployed backend + Stripe and is documented in the proof run report.
