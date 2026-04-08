# SERIAL S1 Auth And Session Hardening

## Goals

- Keep existing signup, login, invite acceptance, onboarding, team, connector, and ingestion behavior intact.
- Add first-class session tracking and refresh-token lifecycle controls without moving to cookie auth.
- Preserve the current response contract for `signup`, `login`, and `refresh` while hardening the server-side model.

## Architecture

### Access Tokens

- Continue using signed JWT bearer tokens.
- Keep access tokens short-lived via `ACCESS_TOKEN_TTL` with a 15 minute default.
- Embed `sessionId` in the JWT so API calls can be tied back to a server-side session record.

### Refresh Tokens

- Store only `sha256` refresh token hashes in Postgres.
- Bind refresh tokens to a `token_family` and, when available, to a `user_sessions.session_id`.
- Rotate refresh tokens on every successful refresh.
- If a previously rotated token is reused, revoke the full token family and mark the session revoked.

### Sessions

- Introduce `user_sessions` as the authoritative server-side session record.
- Track user, tenant, token family, device attributes, IPs, MFA flags, and revocation timestamps.
- Keep legacy access tokens additive-safe: if a token predates a stored session row, it is still accepted until expiry.
- New logins and refreshed sessions are fully session-bound and can be revoked immediately.

### Audit Trail

- Introduce `auth_events` for auth-specific security events.
- Log `login_success`, `login_failed`, `refresh_success`, `refresh_failed`, `logout`, `logout_all`, `session_revoked`, and `refresh_token_reuse_detected`.
- Never store raw access or refresh tokens in audit data.

### MFA Preparation

- Introduce `mfa_enrollments` as a schema-only preparation layer.
- Keep existing `mfaEnabled` response fields stable while enabling a later serial to add TOTP or WebAuthn flows.

## API Surface

- Existing: `POST /v1/auth/login`
- Existing: `POST /v1/auth/refresh`
- Existing: `POST /v1/auth/logout`
- New: `POST /v1/auth/logout-all`
- New: `GET /v1/auth/sessions`
- New: `DELETE /v1/auth/sessions/:id`

## Security Controls

- All session reads and writes are tenant-scoped.
- Session revocation only succeeds for the authenticated user\'s own sessions.
- Refresh token reuse revokes the full family and emits a dedicated auth event.
- Access-token auth now checks whether a bound session has been revoked.
- Legacy tokens remain valid until expiry to avoid breaking existing in-flight production sessions.

## Rollback

1. Revert the application code for `apps/backend/src/auth.ts`, `apps/backend/src/index.ts`, `apps/backend/src/customerSecurity.ts`, and `apps/backend/src/eventIngestion.ts` to the pre-S1 commit.
2. Redeploy the backend application.
3. Leave the additive tables in place. They are safe to keep because older code paths ignore them.
4. If a hard schema rollback is mandatory, drop in this order after the old app is live: `auth_events`, `mfa_enrollments`, then `user_sessions`, and finally remove `auth_refresh_tokens.session_id`.
5. Verify `POST /v1/auth/login`, `POST /v1/auth/refresh`, and `GET /v1/auth/me` against the restored build.