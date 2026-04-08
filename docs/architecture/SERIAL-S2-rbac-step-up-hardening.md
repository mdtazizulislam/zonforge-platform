# SERIAL S2 RBAC And Step-Up Hardening

## Goals

- Centralize backend authorization so tenant, role, ownership, and step-up checks are enforced consistently.
- Keep existing route contracts stable while hardening sensitive mutations.
- Extend the S1 session model instead of introducing a new auth mechanism.
- Produce proof for RBAC denials, step-up verification, and tenant-safe ownership boundaries.

## Architecture

### Centralized Authorization Layer

- Introduce a shared backend authorization helper module for the standalone SaaS backend.
- Standardize the following helpers:
  - `requireAuth`
  - `requireTenantContext`
  - `requireRole`
  - `requireOwnership`
  - `requireStepUpAuth`
- Use the active session-aware access-token verification from SERIAL S1 as the entry point.
- Keep resource lookups tenant-scoped before mutation so cross-tenant access remains blocked even when an ID is guessed.

### Role Model

- Preserve the current tenant roles: `owner`, `admin`, `analyst`, `viewer`.
- Preserve current role hierarchy behavior:
  - viewers remain read-only
  - analysts can investigate but cannot mutate protected administrative resources
  - admins can manage lower-privilege resources but cannot promote to owner or manage owner memberships
  - owners keep the highest tenant authority
- Replace duplicated route-local role checks with shared helper calls where practical.

### Ownership And Tenant Safety

- Treat tenant membership rows, invitations, connectors, and ingestion tokens as tenant-owned resources.
- Resolve target resources through tenant-scoped queries before any mutation.
- For team-member mutations, require both tenant ownership of the membership row and explicit actor-versus-target role checks.
- For connector token rotation and revocation, require the connector to belong to the authenticated tenant before action.

### Step-Up Authentication

- Add `POST /v1/auth/step-up/verify`.
- Verify the authenticated user password against the stored password hash.
- Mark the current `user_sessions` row as step-up verified for a short TTL using additive fields:
  - `step_up_verified_at`
  - `step_up_method`
  - `step_up_expires_at`
- Use password-based step-up method value `password` for this serial.
- Sensitive actions must require a live, unexpired step-up window.

### Sensitive Actions Protected By Step-Up

- `POST /v1/team/invites`
- `PATCH /v1/team/members/:membershipId`
- `DELETE /v1/team/members/:membershipId`
- `DELETE /v1/team/invites/:inviteId`
- `POST /v1/connectors`
- `PATCH /v1/connectors/:id`
- `DELETE /v1/connectors/:id`
- `POST /v1/connectors/:id/ingestion-token`
- `DELETE /v1/connectors/:id/ingestion-token`

### Audit And Security Logging

- Reuse `auth_events` for step-up verification and authorization security events.
- Record at minimum:
  - `step_up_verified`
  - `step_up_failed`
  - `forbidden_access_attempt`
- Continue writing existing tenant audit logs for business actions so operational history stays intact.
- Never store raw passwords or raw connector secrets in logs.

## API Surface

- New: `POST /v1/auth/step-up/verify`
- Existing protected routes keep their response contracts and gain centralized authorization enforcement.

## Rollout Strategy

- Additive schema only.
- Backward-compatible enforcement.
- Step-up is required only for selected sensitive actions, not for normal reads or standard login/session flows.

## Rollback

1. Revert backend application changes in the new authorization helper module plus any touched auth, team, connector, or ingestion route files.
2. Redeploy the prior backend build.
3. Leave the additive `user_sessions` step-up columns in place if fast rollback is needed; previous code safely ignores them.
4. If schema rollback is mandatory after application rollback, drop the step-up columns from `user_sessions` after the old build is live.
5. Re-verify login, session listing, team reads, connector reads, and the previously protected mutation routes on the restored build.