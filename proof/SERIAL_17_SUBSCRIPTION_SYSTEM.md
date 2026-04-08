# SERIAL 17 — Subscription System Proof

## Scope

- Stripe checkout session creation
- Webhook signature verification
- Webhook-authoritative subscription sync
- Removal of direct paid-plan mutation path
- Dashboard checkout redirect flow

## Proof Method

- Executed a deterministic local proof script against the real Hono routes in `apps/backend`.
- Used signed Stripe test webhook headers for positive verification and an invalid signature for the negative control.
- Used `pg-mem` only for local proof execution because Docker-backed Postgres was unavailable in this session.
- Verified build output separately with package builds for backend and dashboard.

## Required Proof Outcomes

1. Checkout session created: PASS
2. Stripe URL returned: PASS
3. Webhook received: PASS
4. Signature verified: PASS
5. Plan updated after payment: PASS
6. Failed payment does not update plan: PASS
7. DB subscription row exists: PASS
8. Billing logs recorded: PASS
9. Build passes: PASS

## Key Evidence

- Checkout response
  - `session_id`: `cs_serial17_proof`
  - `url`: `https://checkout.stripe.test/session/cs_serial17_proof`
- Invalid signature attempt returned `400 invalid_webhook_signature`.
- Valid webhook sequence processed:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `customer.subscription.updated`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`
- Plan snapshots
  - After payment success: `growth`
  - After failed payment: `growth`
  - After subscription deletion: `free`
- Subscription row persisted with Stripe identifiers and cancel scheduling flags.
- Invoice rows persisted for both paid and failed invoice events.
- Billing audit logs recorded checkout, invoice, activation, failure, and downgrade events.

## Build Verification

- `npm --prefix apps/backend run build` passed.
- `npm --prefix apps/web-dashboard run build` passed.

## Artifact

- Machine-readable proof: `proof/runs/serial17-subscription-proof.json`