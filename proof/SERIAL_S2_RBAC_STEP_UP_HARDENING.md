# SERIAL S2 RBAC And Step-Up Hardening Proof

## Artifacts

- Architecture: `docs/architecture/SERIAL-S2-rbac-step-up-hardening.md`
- API proof: `proof/runs/serial-s2-api-proof-20260407.json`
- DB and log proof: `proof/runs/serial-s2-db-proof-20260407.md`
- Build and runtime proof: `proof/runs/serial-s2-build-proof-20260407.txt`

## Scope Covered

- Centralized tenant-safe auth helpers were introduced for auth, role, ownership, and step-up enforcement.
- Sensitive team and connector mutations now require a live step-up window.
- Viewer and analyst RBAC denials were verified against protected mutations.
- Cross-tenant membership mutation was blocked by tenant-scoped ownership enforcement.
- Step-up session state was persisted in `user_sessions` and security events were persisted in `auth_events`.
- Privileged mutations continued writing operational audit rows to `billing_audit_logs`.

## Execution Notes

- Proof ran against an isolated Postgres database named `zonforge_s2_rbac`.
- Backend runtime proof was captured on port `3106` using the built backend artifact.
- Redis was intentionally unset; ingestion queue features degraded safely while RBAC and token-management routes remained functional.