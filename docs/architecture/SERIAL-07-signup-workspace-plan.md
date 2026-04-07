# SERIAL 07 — Customer Signup + Workspace System

## Scope

SERIAL 07 introduces a production-safe, additive customer signup flow for the customer app without removing or breaking the current login, refresh, logout, admin, or customer route behavior.

## Schema

### Users

- Existing `users` table extended with:
  - `full_name`
  - `status`
  - `email_verified`
  - `updated_at`

### Tenants

- Existing `tenants` table extended with:
  - `slug`
  - `onboarding_status`
  - `updated_at`
- Existing `user_id` owner linkage is retained for backward compatibility.

### Tenant Memberships

- New `tenant_memberships` table:
  - `id`
  - `tenant_id`
  - `user_id`
  - `role`
  - `invited_by_user_id`
  - `created_at`
  - `updated_at`
- Unique on `(tenant_id, user_id)`.
- Existing tenants are backfilled with an owner membership using legacy `tenants.user_id`.

### Onboarding Progress

- New `onboarding_progress` table:
  - `id`
  - `tenant_id`
  - `step_key`
  - `is_complete`
  - `payload_json`
  - `created_at`
  - `updated_at`

## Endpoint Contracts

### POST /v1/auth/signup

- Validates full name, workspace name, email, and password.
- Normalizes email to lowercase.
- Creates user, tenant, owner membership, onboarding records, and refresh token inside one transaction.
- Returns:
  - `user`
  - `tenant`
  - `membership`
  - `accessToken`
  - `refreshToken`
- Legacy token aliases remain present:
  - `token`
  - `access_token`
  - `refresh_token`

### POST /v1/auth/register

- Remains available for compatibility.
- Internally delegates to the same signup flow.
- Derives default full name and workspace name when older clients only provide email and password.

### POST /v1/auth/login

- Still accepts the current payload.
- Now includes additive `user`, `tenant`, and `membership` context when available.

### GET /v1/auth/me

- Returns nested auth context:
  - `user`
  - `tenant`
  - `membership`
- Retains flat fields (`id`, `email`, `name`, `role`, `tenantId`) so existing consumers do not break.

### GET /v1/onboarding/status

- Returns:
  - `tenantId`
  - `onboardingStatus`
  - `steps`

## Redirect Flow

1. Customer submits `/signup` in the dashboard.
2. Frontend calls `POST /v1/auth/signup`.
3. Tokens are stored using the same storage pattern as login.
4. Auth store is populated from returned auth context.
5. Redirect decision:
   - `pending` onboarding → `/onboarding`
   - otherwise → `/customer-dashboard`
6. Existing login uses the same onboarding-aware redirect logic after authentication.

## Tenant Isolation Notes

- Customer API auth context now resolves tenant access from `tenant_memberships` first.
- Legacy `tenants.user_id` fallback is preserved for historical tenants.
- Server assigns membership roles. The client cannot choose role or `tenant_id`.
- Customer security routes continue using the resolved tenant context for all tenant-owned queries.

## Rollback Plan

- The signup flow is transactional. If user creation, tenant creation, membership creation, onboarding seeding, or token creation fails, the transaction is rolled back.
- Existing tables and endpoints are not removed, which keeps rollback operationally simple:
  - revert the app deployment
  - keep the additive tables/columns in place
  - legacy auth and customer access still function through preserved compatibility paths

## SERIAL 08 Next

SERIAL 08 should build on this foundation by adding:

- guided connector onboarding
- team invitation flow on top of `tenant_memberships`
- richer onboarding step completion logic
- tenant-aware settings and member management APIs
- broader tenant scoping across more customer-owned records