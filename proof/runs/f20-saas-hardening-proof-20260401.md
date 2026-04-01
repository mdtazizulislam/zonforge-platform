# SERIAL 03 - SaaS Hardening Proof (2026-04-01)

## Deployment

- Commit: `2ce71f8` (`fix(security): avoid startup crash on weak jwt secret`)
- Includes hardening commits:
  - `956b45a` (`feat(security): harden auth billing and monitoring`)
  - `3e7c47f` (`fix(auth): use numeric access token ttl`)
  - `2ce71f8` (`fix(security): avoid startup crash on weak jwt secret`)
- Railway deployment: `3b8820c7-3ded-481a-a4ab-a027c8b14cb7`
- Health proof: `proof/runs/f20-health-check-20260401.json`

## Required Proof Checklist

1. rate limit test
- `proof/runs/f20-rate-limit-billing-test-20260401.json`
- Observed statuses: `401` for attempts 1-8, then `429` at attempt 9 onward.
- `proof/runs/f20-rate-limit-test-20260401.json` also shows auth limiter active.

2. validation failure test
- `proof/runs/f20-validation-failure-test-20260401.json`
- Invalid email -> `400 invalid_email`
- Weak password -> `400 invalid_password`
- `proof/runs/f20-plan-validation-test-20260401.json`
- Invalid `plan_id` -> `400 invalid_plan_id`

3. audit log sample
- `proof/runs/f20-audit-log-sample-20260401.txt`
- Contains:
  - `auth.login` (success)
  - `auth.login_failed`
  - `billing.checkout_created`
  - `billing.checkout_completed`
  - `billing.subscription_updated`
  - `billing.plan_activated`

4. secret audit proof
- `proof/runs/f20-secret-audit-proof-20260401.txt`
- `proof/runs/f20-secret-audit-summary-20260401.json`
- Result: `nonPlaceholderMatches = 0` (only docs/examples/placeholders matched).

5. token expiry test
- `proof/runs/f20-token-security-test-20260401.json`
- Access token TTL measured from JWT claims: `900` seconds.
- Refresh rotation enforced:
  - First refresh succeeds (`200`).
  - Reuse of old refresh token fails (`401 invalid_refresh_token`).

6. error response sample
- `proof/runs/f20-error-response-sample-20260401.json`
- Standard error shape confirmed:
  - `error.code`
  - `error.message`
  - `error.status`
  - `error.request_id`
  - `error.details`

7. monitoring setup proof
- Runtime alert proof: `proof/runs/f20-monitoring-alert-proof-20260401.txt`
  - `security_alert kind="failed_login"`
  - `security_alert kind="webhook_failure"`
- Code wiring proof: `proof/runs/f20-monitoring-setup-code-proof-20260401.txt`
  - Threshold envs:
    - `MONITOR_5XX_THRESHOLD`
    - `MONITOR_FAILED_LOGIN_THRESHOLD`
    - `MONITOR_WEBHOOK_FAILURE_THRESHOLD`
  - Signal paths:
    - `5xx_spike`
    - `failed_login`
    - `webhook_failure`

## Additional Hardening Evidence

- CORS lockdown proof: `proof/runs/f20-cors-lockdown-proof-20260401.json`
  - For both `Origin: https://evil.com` and `Origin: https://zonforge.com`, server allow-origin is pinned to `https://zonforge.com`.
- Production config review proof: `proof/runs/f20-production-config-proof-20260401.json`
  - `RAILWAY_ENVIRONMENT_NAME = production`
  - `RAILWAY_PUBLIC_DOMAIN = api.zonforge.com`
  - Stripe redirects on `https://zonforge.com/...`
  - Stripe secrets exist in environment.
