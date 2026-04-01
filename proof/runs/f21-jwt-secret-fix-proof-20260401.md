# F21 - JWT Secret Production Fix Proof (2026-04-01)

## Objective

Ensure production JWT signing uses a strong environment secret only, with no fallback/default secret behavior, then verify deployment and auth flows.

## Changes Applied

- `apps/backend/src/auth.ts`
  - Removed fallback/default secret behavior.
  - Added strict `JWT_SECRET` requirement at startup of auth module.
  - Added type-safe JWT verification parsing for build reliability.
- `apps/backend/src/index.ts`
  - Replaced warning-only startup check with hard requirement:
    - `JWT_SECRET` must exist.
    - `JWT_SECRET` minimum length: 64 characters.

## Commits

- `da6322f300548db79c9d343f392ab4ec2950e842`
  - `fix(auth): require strong jwt secret without fallback`
- `ea2b9cd7f20672654a0c8894f2717d1a54ac1f80`
  - `fix(auth): satisfy ts typing for required jwt secret`

## Production Environment Verification

- `JWT_SECRET` configured in Railway production environment.
- Verified attributes:
  - `jwtSecretConfigured: true`
  - `jwtSecretLength: 128`
  - `jwtSecretLooksDefault: false`

## Deployment Verification

- Railway deployment ID: `d89420aa-6f4b-4f65-81ea-aba5a5b6b0fe`
- Service: `zonforge-backend`
- Environment: `production`
- Status: `SUCCESS`

## Live Auth Verification (api.zonforge.com)

- Test account: `jwtfix300394@example.com`
- `POST /v1/auth/register` -> `200`
- `POST /v1/auth/login` -> `200`
- `POST /v1/auth/refresh` (with fresh refresh token) -> `200`
- `POST /v1/auth/refresh` (reuse old refresh token) -> `401`
  - Error code: `invalid_refresh_token`

Token behavior validated:
- Access token issued on login.
- Refresh token issued on login.
- Refresh token rotates on first refresh.
- Old refresh token is rejected after rotation.

## Warning Log Verification

Deployment logs for `d89420aa-6f4b-4f65-81ea-aba5a5b6b0fe` were scanned for:
- `SECURITY WARNING`
- `JWT_SECRET is not set to a strong value`

Result:
- No matching warning lines found (`warningFound: false`).

## Artifact

- `proof/runs/f21-jwt-secret-fix-proof-20260401.json`
