# Billing Frontend Integration Contract

**Serial:** ZONFORGE-PROD-SERIAL-09.7  
**Version:** 1.0  
**Last Updated:** 2026-03-28

---

## Overview

This document defines the complete frontend integration contract for the ZonForge SaaS billing flow.  
All endpoints require a valid JWT `Authorization: Bearer <token>` header unless stated otherwise.

---

## Base URL

```
Production: https://<your-railway-domain>
Local:      http://localhost:3000
```

---

## 1. Auth Endpoints

### POST /auth/signup
Register a new user. A tenant is automatically created.

**Request:**
```json
{ "email": "user@example.com", "password": "SecurePass123!" }
```

**Response (200):**
```json
{
  "success": true,
  "userId": 42,
  "token": "<jwt>",
  "redirectUrl": "/success"
}
```

**Error (400):**
```json
{ "error": "Email and password required" }
```

---

### POST /auth/login
Authenticate an existing user.

**Request:**
```json
{ "email": "user@example.com", "password": "SecurePass123!" }
```

**Response (200):**
```json
{ "success": true, "userId": 42, "token": "<jwt>" }
```

---

## 2. Billing Endpoints

All billing endpoints require `Authorization: Bearer <token>`.

---

### GET /billing/plans
Fetch the plan catalog. **No auth required.** Safe to call from a public pricing page.

**Response (200):**
```json
{
  "plans": [
    {
      "code": "starter",
      "name": "Starter",
      "description": "For small teams getting started",
      "monthly_price_cents": 0,
      "annual_price_cents": 0,
      "max_users": 50,
      "max_connectors": 1,
      "max_events_per_month": 21600000,
      "retention_days": 7,
      "has_stripe_monthly": false,
      "has_stripe_annual": false
    },
    {
      "code": "growth",
      "name": "Growth",
      "description": "For growing security teams",
      "monthly_price_cents": 29900,
      "annual_price_cents": 24900,
      "max_users": 500,
      "max_connectors": 5,
      "max_events_per_month": 86400000,
      "retention_days": 90,
      "has_stripe_monthly": true,
      "has_stripe_annual": false
    }
  ]
}
```

**Frontend use:** Render pricing cards. Use `monthly_price_cents / 100` for display.

---

### POST /billing/checkout-session
Create a Stripe Checkout session. Requires auth.

**Request:**
```json
{ "planCode": "growth" }
```

**Response (200):**
```json
{
  "sessionId": "cs_test_a1B2c3...",
  "url": "https://checkout.stripe.com/pay/cs_test_a1B2c3..."
}
```

**Frontend action after receiving response:**
```js
window.location.href = response.url;
// OR use Stripe.js:
const stripe = Stripe(publishableKey);
await stripe.redirectToCheckout({ sessionId: response.sessionId });
```

**Error (400):**
```json
{ "error": "Plan not found: invalid_plan" }
```

**Error (401):**
```json
{ "error": "Unauthorized" }
```

---

### GET /billing/status
Get current billing status + usage summary. Requires auth.

**Response (200):**
```json
{
  "billing": {
    "tenantId": 7,
    "tenantName": "acme-tenant",
    "planCode": "growth",
    "planName": "Growth",
    "subscriptionStatus": "ACTIVE",
    "currentPeriodStart": "2026-03-01T00:00:00.000Z",
    "currentPeriodEnd": "2026-04-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "stripeCustomerId": null,
    "stripeSubscriptionId": null,
    "limits": {
      "maxUsers": 500,
      "maxConnectors": 5,
      "maxEventsPerMonth": 86400000,
      "retentionDays": 90
    }
  },
  "plan": "growth",
  "statusCode": "ACTIVE",
  "limits": { "connectors": 5, "identities": 500, "retention_days": 90, "ai_enabled": "limited", "max_events_per_min": 2000 },
  "usage": { "CONNECTORS": 2, "IDENTITIES": 14, "EVENTS_PER_MIN": 340 }
}
```

**Frontend use:** Billing management screen, plan badge in nav, quota bars.

---

### GET /billing/subscription
Get detailed subscription state. Requires auth.

**Response (200):**
```json
{
  "subscription": {
    "tenantId": 7,
    "planCode": "growth",
    "planName": "Growth",
    "status": "ACTIVE",
    "currentPeriodStart": "2026-03-01T00:00:00.000Z",
    "currentPeriodEnd": "2026-04-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "hasStripeCustomer": true,
    "limits": { "maxUsers": 500, "maxConnectors": 5, "maxEventsPerMonth": 86400000, "retentionDays": 90 }
  },
  "eligible_for_checkout": false
}
```

**`eligible_for_checkout: true`** means the user can start a new checkout session.

---

### GET /billing/usage
Usage counters for the current period. Requires auth.

**Response (200):**
```json
{
  "plan": "growth",
  "status": "ACTIVE",
  "limits": { "connectors": 5, "identities": 500 },
  "usage": { "CONNECTORS": 2, "IDENTITIES": 14, "EVENTS_PER_MIN": 340 }
}
```

---

### POST /billing/portal
Generate a Stripe Billing Portal URL. Requires auth + active Stripe customer.

**Request:** (empty body)

**Response (200):**
```json
{ "url": "https://billing.stripe.com/session/..." }
```

**Frontend action:** `window.location.href = response.url`

---

### POST /billing/cancel
Mark subscription for cancellation at period end. Requires auth.

**Request:** (empty body)

**Response (200):**
```json
{
  "billing": { "subscriptionStatus": "ACTIVE", "cancelAtPeriodEnd": true, ... }
}
```

---

### POST /billing/change-plan
Change to a different Stripe plan (requires active subscription). Requires auth.

**Request:**
```json
{ "planCode": "business" }
```

**Response (200):**
```json
{
  "billing": { "planCode": "business", "subscriptionStatus": "ACTIVE", ... }
}
```

---

## 3. Checkout Flow (End to End)

```
[1] User clicks "Upgrade to Growth"
    → POST /billing/checkout-session { planCode: "growth" }
    → Receive { sessionId, url }

[2] Redirect user to Stripe
    → window.location.href = url
      (or stripe.redirectToCheckout({ sessionId }))

[3] User completes payment on Stripe
    → Stripe redirects to STRIPE_SUCCESS_URL (e.g. /billing/success)

[4] On /billing/success page load
    → Poll GET /billing/status every 2s for up to 20s
    → Wait until statusCode === "ACTIVE"
    → Show success message and unlock features

[5] On /billing/cancel (redirect from Stripe cancel)
    → Show pricing page or "payment was not completed" message
    → No action needed — no subscription was created
```

---

## 4. After Returning from Stripe

On the success page, the frontend **must poll** because the webhook is asynchronous:

```js
async function waitForActivation(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await fetch('/billing/status', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await resp.json();
    if (data.statusCode === 'ACTIVE') return data;
    await new Promise(r => setTimeout(r, 2000));
  }
  return null; // Timeout — show manual refresh prompt
}
```

---

## 5. Billing Management Screen Data Contract

| Field | Source |
|---|---|
| Current plan name | `GET /billing/status` → `plan` |
| Subscription status badge | `GET /billing/status` → `statusCode` |
| Next renewal date | `GET /billing/status` → `billing.currentPeriodEnd` |
| Cancel at period end | `GET /billing/status` → `billing.cancelAtPeriodEnd` |
| Quota bars (connectors / users) | `GET /billing/usage` → `usage` + `limits` |
| Manage in Stripe | `POST /billing/portal` → `url` |
| Upgrade/change plan | `POST /billing/checkout-session` → `url` |

---

## 6. Error Handling

| HTTP Code | Meaning | Frontend Action |
|---|---|---|
| 400 | Bad request / validation | Show specific error message |
| 401 | Missing or invalid JWT | Redirect to `/login` |
| 402 | **Quota exceeded / upgrade required** | Show upgrade prompt |
| 500 | Server error | Show generic error, retry button |

**402 Upgrade Required response shape:**
```json
{
  "error": {
    "code": "UPGRADE_REQUIRED",
    "plan": "starter",
    "metric": "AI_ANALYSIS",
    "limit": "growth_or_higher",
    "message": "AI analysis is not available on the current plan"
  }
}
```

---

## 7. Recommended Button States

| State | Button Label | Button State |
|---|---|---|
| Not subscribed | "Start Free Trial" / "Upgrade" | Enabled |
| Loading checkout | "Redirecting to payment..." | Disabled + spinner |
| ACTIVE | "Manage Subscription" | Enabled (portal) |
| PAST_DUE | "Update Payment Method" | Enabled (portal) |
| cancel_at_period_end = true | "Reactivate" | Enabled (portal) |
| CANCELED | "Resubscribe" | Enabled (new checkout) |

---

## 8. Security Notes

- Never expose `STRIPE_SECRET_KEY` to the frontend
- Use `sessionId` with Stripe.js **or** the `url` redirect — not both
- Store JWT in memory or `httpOnly` cookie — not `localStorage`
- All billing endpoints are tenant-scoped — one tenant per user

---

## 9. Webhook Events the Backend Handles

The backend handles these events automatically — no frontend action needed:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Activates subscription, sets plan to ACTIVE |
| `customer.subscription.created` | Records subscription |
| `customer.subscription.updated` | Updates status, period, cancel_at_period_end |
| `customer.subscription.deleted` | Downgrades tenant to starter plan |
| `invoice.paid` / `invoice.payment_succeeded` | Confirms active, updates period |
| `invoice.payment_failed` | Sets status to PAST_DUE, grace period (plan kept) |
