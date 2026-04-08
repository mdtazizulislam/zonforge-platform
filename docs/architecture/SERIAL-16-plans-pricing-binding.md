# SERIAL 16 — Plans, Pricing, and Frontend Plan Binding

## Scope

- Introduces additive tenant monetization state with `plans`, `tenant_plans`, and `tenants.current_plan_id`.
- Seeds the locked plan catalog: `free`, `starter`, `growth`, `business`, `enterprise`.
- Makes tenant plan state the source of truth for connector limits, investigation access, risk access, and AI access.
- Binds the existing dashboard billing page to real backend plan APIs without redesigning the pricing cards.

## Backend Plan Model

- `plans` now stores the locked pricing fields: `price_monthly`, `max_connectors`, `max_identities`, `events_per_minute`, `retention_days`, and `features_json`.
- `tenant_plans` stores additive history rows with `status`, `started_at`, and `expires_at`.
- `tenants.current_plan_id` points at the active plan while `tenants.plan` remains mirrored for compatibility with older code paths.
- Existing tenants are backfilled to a resolved current plan from `current_plan_id`, legacy `tenant_subscriptions.plan_id`, legacy `tenants.plan`, or `free` as the safe default.
- New workspaces receive `free` immediately after signup and write `plan_assigned` audit data.

## APIs

- `GET /v1/plans` returns the active plan catalog for pricing-card rendering.
- `GET /v1/me/plan` returns the tenant's current plan, limits, features, usage, and billing-management capability.
- `GET /v1/plan/limits` returns current plan usage and limits.
- `POST /v1/plan/upgrade` updates the tenant plan for owner/admin users.
- `POST /v1/plan/cancel` downgrades paid plans back to `free` for owner/admin users.
- Legacy billing routes continue to resolve through the same plan state for compatibility.

## Enforcement

- Connector creation enforces `max_connectors` and emits `plan_limit_exceeded` when blocked.
- Investigation creation requires `growth` or higher and emits `feature_gate_blocked` on lower plans.
- Risk summary requires `starter` or higher; detailed risk routes require `growth` or higher.
- AI assistant routes require `business` or `enterprise`.
- Plan mutations emit `plan_upgraded`, `plan_downgraded`, `plan_canceled`, and `plan_assigned` into `billing_audit_logs`.

## Frontend Binding

- The dashboard billing page keeps the existing card layout and now reads `GET /v1/plans` and `GET /v1/me/plan`.
- Upgrade and downgrade actions bind to `POST /v1/plan/upgrade` and `POST /v1/plan/cancel`.
- Connector and investigation flows surface upgrade CTAs instead of raw blocked-action failures.

## Rollback

1. Disable the new plan enforcement checks in connector, investigation, risk, and AI routes.
2. Repoint billing UI calls from `/v1/plans` and `/v1/me/plan` back to the prior billing compatibility routes if required.
3. Keep `plans`, `tenant_plans`, and `tenants.current_plan_id` in place; they are additive and safe to leave deployed.
4. Redeploy the prior stable backend and dashboard build.
5. Verify signup, `/v1/auth/me`, connector creation, and investigation creation still behave as expected.
6. Verify the pricing page still renders and no navigation path regressed.