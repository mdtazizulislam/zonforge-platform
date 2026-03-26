# SERIAL: ZONFORGE-BILLING-LIVE-04
Date: 2026-03-25

## STATUS
PARTIAL PASS (integration complete, payment provider key blocked)

What is working end-to-end in code/runtime:
- Backend checkout endpoint exists and is wired: `POST /billing/checkout-session`
- Webhook signature verification and processing work: `POST /billing/webhook`
- Webhook updates tenant subscription to ACTIVE and selected plan code
- Frontend billing page now calls backend checkout endpoint directly
- Frontend success page implemented and calls `GET /billing/status`

Current blocker for full live card payment:
- `STRIPE_SECRET_KEY` in environment is a stub/invalid key, so Stripe checkout session creation returns invalid API key.

---

## STEP 1 — STRIPE CONFIG VERIFY (masked)
From backend env:
- STRIPE_SECRET_KEY = `sk_t***only`
- STRIPE_WEBHOOK_SECRET = `whse***only`
- STRIPE_SUCCESS_URL = `http://localhost:5173/billing/success`
- STRIPE_CANCEL_URL = `http://localhost:5173/pricing`

Result:
- Variables are present and loaded.
- Secret key value is invalid for live Stripe API calls in this environment.

---

## STEP 2 — CHECKOUT SESSION
Request:

`POST /billing/checkout-session`

Response proof:

```json
{
  "status": 400,
  "body": {
    "error": "Invalid API Key provided: sk_test_***********************only"
  }
}
```

Interpretation:
- Endpoint wiring is correct.
- Stripe rejects current key, so no real hosted checkout URL can be produced until a valid key is configured.

---

## STEP 3 — WEBHOOK (signature + subscription update)
A signed `checkout.session.completed` event was posted to `/billing/webhook` using Stripe signature generation with configured webhook secret.

Webhook API response:

```json
{
  "status": 200,
  "body": "{\"received\":true}"
}
```

Subscription status before webhook:

```json
{
  "plan": "starter",
  "statusCode": "INACTIVE"
}
```

Subscription status after webhook:

```json
{
  "plan": "growth",
  "statusCode": "ACTIVE"
}
```

DB proof (`tenant_subscriptions`):

```text
tenant_id | plan_code | subscription_status | stripe_customer_id         | stripe_checkout_session_id | last_webhook_event_id
3         | growth    | ACTIVE              | cus_live04_test_customer   | cs_test_live04             | evt_live04_1774463554833
```

DB proof (`billing_webhook_events`):

```text
event_id                 | event_type                 | created_at
evt_live04_1774463554833 | checkout.session.completed | 2026-03-25 18:32:34.84606+00
```

---

## STEP 4 — FRONTEND CONNECT
Implemented:
- Billing upgrade action now calls backend endpoint:
  - from: `/api/v1/billing/checkout` (legacy payload)
  - to: `${VITE_BILLING_API_URL ?? '/api'}/billing/checkout-session` with `{ planCode }`
- Billing portal action now calls `${VITE_BILLING_API_URL ?? '/api'}/billing/portal` and reads `{ url }`.

Files:
- `apps/web-dashboard/src/pages/BillingPage.tsx`

---

## STEP 5 — SUCCESS PAGE
Implemented new page that calls `/billing/status` and displays active plan/status:
- New page: `apps/web-dashboard/src/pages/BillingSuccessPage.tsx`
- New route: `/billing/success` in router
- Stripe success URL aligned to `/billing/success`

Files:
- `apps/web-dashboard/src/pages/BillingSuccessPage.tsx`
- `apps/web-dashboard/src/App.tsx`
- `apps/backend/.env` (success URL)

---

## STEP 6 — PROOF CHECKLIST
1. user clicks upgrade: CODED and wired in billing page.
2. redirect to Stripe: BLOCKED in this env due invalid STRIPE_SECRET_KEY.
3. test card payment: BLOCKED for same reason.
4. webhook fires: PROVED with signed webhook request.
5. DB updated: PROVED (`tenant_subscriptions` row updated to growth/ACTIVE).
6. `/billing/status = ACTIVE`: PROVED.
7. feature unlock works: PROVED via internal feature check endpoint after upgrade (`AI_ANALYSIS` allowed).

Feature unlock API proof:

```json
{
  "status": 200,
  "body": { "allowed": true }
}
```

---

## CODE FIXES APPLIED
1. Webhook subscription upsert now correctly applies selected plan:
- File: `apps/backend/src/stripe.ts`
- Changes:
  - Resolve `finalPlanId = webhookResolvedPlanId ?? existingPlanId`
  - Persist `plan_id` on conflict update (`plan_id = EXCLUDED.plan_id`)

2. Billing frontend integration aligned to backend endpoints:
- File: `apps/web-dashboard/src/pages/BillingPage.tsx`
- Changes:
  - checkout endpoint/path and payload corrected
  - portal response shape corrected

3. Success UX added for Stripe return path:
- File: `apps/web-dashboard/src/pages/BillingSuccessPage.tsx`
- File: `apps/web-dashboard/src/App.tsx` route added
- File: `apps/backend/.env` success URL adjusted

---

## FINAL NOTE TO GO FULLY LIVE
To complete true card-payment proof (Stripe-hosted checkout + test card charge), set valid Stripe test credentials in backend env and re-run Step 2 + Stripe-hosted payment flow:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_STARTER|GROWTH|BUSINESS|ENTERPRISE`
