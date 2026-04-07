# SERIAL 08 Proof Summary

## Live API proof

Fresh proof tenant created through live backend API:

- user_id: `2`
- tenant_id: `2`
- email: `serial08-fixed@zonforge.com`
- workspace: `Serial 08 Fixed Workspace`
- signup redirect: `/onboarding`

Observed onboarding state transitions:

1. `GET /v1/onboarding` returned `pending` with all three steps incomplete.
2. `PATCH /v1/onboarding/status` for `welcome` returned `in_progress` and set `onboardingStartedAt`.
3. `PATCH /v1/onboarding/status` for `connect_environment` kept `in_progress` and stored `{ "provider": "aws", "placeholder": true }`.
4. `PATCH /v1/onboarding/status` for `first_scan` returned `completed` and set `onboardingCompletedAt`.
5. `GET /v1/auth/me` returned tenant onboarding status `completed` with both timestamps populated.

## Database proof

Live PostgreSQL verification for tenant `2`:

- `tenants`: slug `serial-08-fixed-workspace`, onboarding status `completed`
- `users`: user `2` mapped to `serial08-fixed@zonforge.com`
- `tenant_memberships`: tenant `2` linked only to user `2` as `owner`
- `onboarding_progress`: `welcome`, `connect_environment`, and `first_scan` all recorded as complete with payloads
- `billing_audit_logs`: recorded `onboarding.started`, `onboarding.updated`, and `onboarding.completed`

## Live browser proof

Playwright proof script: `proof/runs/serial-08-ui-proof.mjs`

Captured screenshots:

- `proof/runs/serial-08-signup-page.png`
- `proof/runs/serial-08-onboarding-page.png`
- `proof/runs/serial-08-onboarding-progress.png`
- `proof/runs/serial-08-dashboard-page.png`

Live UI run identity:

- email: `serial08-ui-1775577298680@zonforge.com`
- workspace: `Serial 08 UI 1775577298680`

## Log proof

Backend runtime log sequence from the browser-driven proof:

- `POST /v1/auth/signup -> 200`
- `GET /v1/onboarding -> 200`
- `PATCH /v1/onboarding/status -> 200`
- `PATCH /v1/onboarding/status -> 200`
- `PATCH /v1/onboarding/status -> 200`
- Dashboard follow-up fetches succeeded for `risk/summary`, `health/pipeline`, `metrics/mttd`, `connectors`, and `alerts`
