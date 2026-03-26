# SERIAL: ZONFORGE Stripe Webhook Proof 05
Date: 2026-03-25

## Scope
Additive webhook billing completion on the existing `apps/backend` service.

Note: the request referenced `apps/api`, but this workspace has no `apps/api`; the live billing backend is in `apps/backend`.

## Files Added
- `apps/backend/src/middleware/isActiveUser.ts`

## Files Updated
- `apps/backend/src/db.ts`
- `apps/backend/src/stripe.ts`
- `apps/backend/src/index.ts`

## Schema Changes (Additive)
- `users.stripe_customer_id` added if missing
- `subscriptions.current_period_end` added if missing
- indexes added:
  - `ix_users_email`
  - `ux_users_stripe_customer`
  - `ix_subscriptions_stripe_subscription`

## Local Proof Results

### Build
- `npm run build` in `apps/backend`: PASS

### Invalid signature
Response:
```json
{"status":400,"body":"{\"error\":\"Invalid webhook signature\"}"}
```

### Valid Stripe events processed
Responses:
```json
{"type":"checkout.session.completed","status":200,"body":"{\"received\":true}"}
{"type":"customer.subscription.created","status":200,"body":"{\"received\":true}"}
{"type":"invoice.paid","status":200,"body":"{\"received\":true}"}
{"type":"invoice.payment_failed","status":200,"body":"{\"received\":true}"}
{"type":"customer.subscription.deleted","status":200,"body":"{\"received\":true}"}
{"type":"product.updated","status":200,"body":"{\"received\":true}"}
```

### Logs
```text
{ event: 'checkout.session.completed', customer: 'cus_local_proof_01', timestamp: 1774466606531 }
{ event: 'customer.subscription.created', customer: 'cus_local_proof_01', timestamp: 1774466606585 }
{ event: 'invoice.paid', customer: 'cus_local_proof_01', timestamp: 1774466606619 }
{ event: 'invoice.payment_failed', customer: 'cus_local_proof_01', timestamp: 1774466606651 }
{ event: 'customer.subscription.deleted', customer: 'cus_local_proof_01', timestamp: 1774466606686 }
{ event: 'product.updated', customer: 'cus_local_active_01', timestamp: 1774466633811 }
{ event: 'product.updated', ignored: true, timestamp: 1774466633817 }
```

### DB proof: user row
```text
id | email                                    | stripe_customer_id   | created_at
9  | webhookproof_1774466606175@zonforge.test | cus_local_proof_01   | 2026-03-25 19:23:26.410606
```

### DB proof: subscriptions rows
```text
user_id | stripe_customer_id | stripe_subscription_id | plan   | status   | current_period_end      | updated_at
9       | cus_local_proof_01 | sub_local_proof_01     | growth | canceled | 2026-04-24 19:56:40+00  | 2026-03-25 19:23:26.709174
9       | cus_local_proof_01 |                        | growth | active   |                        | 2026-03-25 19:23:26.572837
```

### Access control proof
Active allowed:
```json
{"status":200,"body":{"allowed":true,"userId":10}}
```

Inactive blocked after delete:
```json
{"status":403,"body":{"error":"Active subscription required"}}
```

### Billing status proof
```json
{
  "status":200,
  "body":{
    "billing":{
      "tenantId":4,
      "planCode":"growth",
      "subscriptionStatus":"CANCELED",
      "stripeCustomerId":"cus_local_proof_01",
      "stripeSubscriptionId":"sub_local_proof_01"
    },
    "plan":"growth",
    "statusCode":"INACTIVE"
  }
}
```

## Git / Deploy State

### Commit
- Commit created: `2878714` (`feat: add stripe webhook billing sync`)

### Push
- Pushed successfully to:
  - `origin https://github.com/mdtazizulislam/zonforge-platform.git`
  - branch: `main`

### Production endpoint probe
- Health endpoint:
```json
{"status":"ok"}
```

- Webhook route with invalid signature:
```json
{"status":400,"body":"{\"error\":\"Invalid webhook signature\"}"}
```

Interpretation:
- The public production route exists and rejects invalid signatures correctly.
- This session could not prove a production DB update because the authenticated Railway CLI session is linked to a different service than the ZonForge backend endpoint named in the request.

## Deployment Blockers
- No `apps/api` service exists in this repo; implementation was applied to `apps/backend`.
- Railway CLI in this session is linked to:
  - project: `Safego-staging`
  - service: `SafeGo-platform`
  - domain: `https://safego-platform-production-c179.up.railway.app`
- Because that target does not match `https://zonforge-backend-production.up.railway.app`, I did not run `railway up` against the wrong production service.
- Stripe dashboard screenshot cannot be produced from this environment because there is no authenticated Stripe session in the workspace.
