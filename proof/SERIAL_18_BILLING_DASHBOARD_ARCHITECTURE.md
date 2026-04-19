# SERIAL 18 Architecture Note

## Scope

- Canonical route: `/billing` in `apps/web-dashboard`
- Backend source of truth: existing tenant-scoped billing endpoints in `apps/backend`
- Non-goals: no Stripe logic redesign, no SERIAL 19 work, no billing state ownership on the frontend

## Page Structure

1. Header strip
   - title, trust copy, Stripe-backed status badge
2. Current plan card
   - current plan, billing interval, current period dates, cancel-at-period-end state
   - actions: change plan, open billing portal, cancel subscription
3. Usage and limits grid
   - live usage from `GET /v1/billing/usage`
   - plan limits from backend responses
   - progress bars for connectors, identities, events per minute, retention policy
4. Plan comparison section
   - Starter, Growth, Business cards only
   - selected monthly/annual comparison mode
   - current plan highlighting
   - checkout action via backend only
5. Invoice history shell
   - explicit integration-pending state because no invoice endpoint exists yet
6. Safety notice
   - webhook-authoritative billing explanation and cancellation policy text

## Data Flow

- `GET /v1/billing/subscription`
  - current Stripe-backed subscription state for the current tenant
  - drives page header, current plan card, status badges, renewal state
- `GET /v1/billing/usage`
  - live tenant usage and limits for metering UI
- `GET /v1/billing/plans`
  - comparison catalog for Starter, Growth, Business
- `POST /v1/billing/checkout`
  - creates Stripe Checkout session and redirects
- `POST /v1/billing/cancel`
  - schedules cancellation through backend-confirmed flow
- `POST /v1/billing/portal`
  - optional safe handoff to Stripe customer portal

## Frontend Rules

- Billing state shown to the user comes from billing endpoints, not local calculation
- Admin capability is inferred from the authenticated user role only for action visibility
- Sensitive actions always call backend routes
- Raw Stripe identifiers are not rendered in the UI
- Missing invoice history is shown as an explicit shell, not fake data

## Backend Changes

- None planned unless verification proves a hard UI blocker
- Current audit shows the required endpoints already exist for SERIAL 18
