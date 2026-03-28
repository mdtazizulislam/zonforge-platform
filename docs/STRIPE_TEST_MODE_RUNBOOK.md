# Stripe Test Mode Runbook

**Serial:** ZONFORGE-PROD-SERIAL-09.8  
**Version:** 1.0  
**Last Updated:** 2026-03-28

---

## Prerequisites

- Stripe account (test mode)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) installed (for local webhook forwarding)
- Backend running locally or on Railway
- Valid `.env` with test keys

---

## 1. Stripe Dashboard — Use Test Mode

1. Log in to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Toggle **"Test mode"** in the top-right corner
3. Confirm the indicator shows **"TEST DATA"** in orange
4. All test transactions, products, and keys are isolated from live data

---

## 2. Get Test API Keys

From the Stripe Dashboard (Test mode):
- **Dashboard → Developers → API keys**
- Copy **"Secret key"** → `sk_test_...`
- Copy **"Publishable key"** → `pk_test_...` (for frontend only)

---

## 3. Create a Test Product & Price

1. **Dashboard → Products → + Add product**
2. Name: e.g. `ZonForge Growth (Test)`
3. Add a price:
   - Pricing model: **Recurring**
   - Billing period: **Monthly**
   - Price: `$299.00`
4. Click **Save product**
5. Copy the **Price ID** (format: `price_1...`)

---

## 4. Configure Environment Variables

### Local (`.env` in `apps/backend/`)

```env
STRIPE_SECRET_KEY=sk_test_<your_secret_key>
STRIPE_WEBHOOK_SECRET=whsec_<from_stripe_cli_output>
STRIPE_PRICE_ID=price_<your_test_price_id>
STRIPE_PRICE_ID_STARTER=price_<starter_price_id>
STRIPE_PRICE_ID_GROWTH=price_<growth_price_id>
STRIPE_PRICE_ID_BUSINESS=price_<business_price_id>
STRIPE_PRICE_ID_ENTERPRISE=price_<enterprise_price_id>
STRIPE_SUCCESS_URL=http://localhost:5173/billing/success
STRIPE_CANCEL_URL=http://localhost:5173/pricing
```

### Railway (Production-like test deployment)

1. Go to your Railway project → **Settings → Variables**
2. Add each variable above with the `sk_test_` key
3. For `STRIPE_WEBHOOK_SECRET`: use the webhook endpoint secret from **Developers → Webhooks**

---

## 5. Set Up Stripe CLI for Local Webhook Forwarding

```bash
# Install (macOS/Linux)
brew install stripe/stripe-cli/stripe
# Windows: https://stripe.com/docs/stripe-cli#install

# Login
stripe login

# Forward webhooks to your local backend
stripe listen --forward-to http://localhost:3000/billing/webhook

# The CLI will output:
# > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxx
# Copy this and set it as STRIPE_WEBHOOK_SECRET in your .env
```

---

## 6. Trigger a Test Checkout

**Option A — via API (curl / Invoke-RestMethod)**

```powershell
# 1. Sign up
$signupResp = Invoke-RestMethod -Method POST -Uri http://localhost:3000/auth/signup `
  -ContentType 'application/json' `
  -Body '{"email":"test@example.com","password":"TestPass123!"}'
$token = $signupResp.token

# 2. Create checkout session
$checkoutResp = Invoke-RestMethod -Method POST -Uri http://localhost:3000/billing/checkout-session `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body '{"planCode":"growth"}'
$checkoutResp.url
```

**Option B — via curl**

```bash
# 1. Sign up
TOKEN=$(curl -s -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}' \
  | jq -r .token)

# 2. Create checkout session
curl -X POST http://localhost:3000/billing/checkout-session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"planCode":"growth"}'
```

3. Open the returned `url` in a browser
4. Complete checkout using a test card

---

## 7. Test Cards

| Scenario | Card Number | Expiry | CVC |
|---|---|---|---|
| Successful payment | `4242 4242 4242 4242` | Any future | Any |
| Payment requires 3D Secure | `4000 0025 0000 3155` | Any future | Any |
| Payment declined | `4000 0000 0000 9995` | Any future | Any |
| Insufficient funds | `4000 0000 0000 9995` | Any future | Any |
| Card requires auth (3DS2) | `4000 0027 6000 3184` | Any future | Any |

Use any valid future expiry date (e.g. `12/28`) and any 3-digit CVC.

---

## 8. Trigger Webhook Events via Stripe CLI

After completing a test checkout, Stripe fires real events. You can also trigger them manually:

```bash
# Simulate a completed checkout (fires checkout.session.completed)
stripe trigger checkout.session.completed

# Simulate subscription created
stripe trigger customer.subscription.created

# Simulate payment failure
stripe trigger invoice.payment_failed

# Simulate subscription cancellation
stripe trigger customer.subscription.deleted
```

> **Note:** Manually triggered events use synthetic data. For realistic end-to-end testing, complete a real test checkout and observe logs.

---

## 9. Expected Webhook Status Transitions

| Stripe Event | Subscription Status | tenants.plan |
|---|---|---|
| `checkout.session.completed` | `ACTIVE` | Set to planCode from metadata |
| `customer.subscription.created` (active) | `ACTIVE` | Set to mapped plan |
| `customer.subscription.updated` (active) | `ACTIVE` | Set to mapped plan |
| `customer.subscription.updated` (past_due) | `PAST_DUE` | **Unchanged** (grace period) |
| `invoice.payment_failed` | `PAST_DUE` | **Unchanged** (grace period) |
| `invoice.paid` / `invoice.payment_succeeded` | `ACTIVE` | Set to mapped plan |
| `customer.subscription.deleted` | `CANCELED` | Downgraded to `starter` |

---

## 10. Verify Webhook Processing

### Option A — Check backend logs

Look for structured log lines like:
```json
{"event":"webhook_received","eventId":"evt_1...","type":"checkout.session.completed","timestamp":1743123456789}
{"event":"plan_activated","tenantId":7,"planCode":"growth","status":"ACTIVE","timestamp":1743123456900}
```

### Option B — Check DB directly

```sql
-- Confirm webhook event stored
SELECT event_id, event_type, status, processed_at
FROM billing_webhook_events
ORDER BY created_at DESC LIMIT 5;

-- Confirm subscription updated
SELECT tenant_id, subscription_status, stripe_price_id, current_period_end
FROM tenant_subscriptions
ORDER BY updated_at DESC LIMIT 5;

-- Confirm tenant plan updated
SELECT id, name, plan FROM tenants ORDER BY id DESC LIMIT 5;
```

### Option C — Call billing status API

```bash
curl http://localhost:3000/billing/status \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `"statusCode": "ACTIVE"` after a successful checkout webhook.

---

## 11. Verify Idempotency (Duplicate Event Protection)

Deliver the same webhook event twice:

```bash
# Get an event ID from the Stripe dashboard or logs
# Replay it via CLI:
stripe events resend evt_1XXXXXXXXXXXXXXXXX
```

Expected behavior:
- Second delivery: `{"received":true,"duplicate":true}`
- No duplicate row in `billing_webhook_events`
- No double-processing of subscription state

---

## 12. Stripe Dashboard Webhook Configuration (Production/Railway)

1. **Dashboard → Developers → Webhooks → + Add endpoint**
2. **Endpoint URL:** `https://<your-railway-domain>/billing/webhook`
3. **Events to listen to:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Click **Add endpoint**
5. Copy the **Signing secret** (`whsec_...`) and set as `STRIPE_WEBHOOK_SECRET` in Railway

---

## 13. Common Issues & Fixes

| Issue | Cause | Fix |
|---|---|---|
| `Invalid webhook signature` | Wrong `STRIPE_WEBHOOK_SECRET` | Re-copy from Stripe CLI or dashboard |
| `Plan not found: growth` | `STRIPE_PRICE_ID` missing | Set all `STRIPE_PRICE_ID_*` vars |
| Webhook received but not processed | Backend not running | Ensure server is up on port 3000 |
| `Cannot resolve tenant` | No tenant for Stripe customer | Ensure checkout was initiated via API (not raw Stripe) |
| Duplicate events in DB | Not a bug | Idempotency is working correctly |

---

## 14. Rollback / Cleanup

```bash
# Delete all test subscriptions via Stripe CLI
stripe subscriptions list --limit 10 | jq '.[] | .id' | xargs -I{} stripe subscription cancel {}

# Truncate local test webhook events (dev only)
psql $DATABASE_URL -c "DELETE FROM billing_webhook_events WHERE created_at > NOW() - INTERVAL '1 hour';"
```

> **Never use `sk_live_` or `whsec_live_` keys in development.**
