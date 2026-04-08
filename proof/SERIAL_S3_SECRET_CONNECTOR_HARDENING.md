# SERIAL S3 Secret And Connector Hardening Proof

## Artifacts

- Architecture: `docs/architecture/SERIAL-S3-secret-connector-hardening.md`
- API proof: `proof/runs/serial-s3-api-proof-20260408.json`
- DB and log proof: `proof/runs/serial-s3-db-proof-20260408.md`
- Build and runtime proof: `proof/runs/serial-s3-build-proof-20260408.txt`

## Scope Covered

- Connector secret persistence now flows through a provider-style lifecycle helper that emits encrypted payload, provider, reference, fingerprint, rotation timestamp, and rotation count.
- Connector rows now expose metadata-only security state through `GET /v1/connectors/:id/security`.
- `POST /v1/connectors/:id/rotate-secret` requires owner or admin role plus a live step-up window.
- `POST /v1/connectors/:id/rotate-ingestion-token` rotates the active ingestion credential while preserving the legacy ingestion-token route.
- Raw connector secrets were not returned from connector create, rotate-secret, or security metadata responses.
- Old ingestion tokens were rejected after rotation and the new token was accepted for event ingestion.
- Viewer and cross-tenant access were denied for connector security-sensitive operations.

## Execution Notes

- Proof ran against an isolated Postgres database named `zonforge_s3_secret`.
- Backend runtime proof was captured on port `3107` using the built standalone backend artifact.
- Redis-backed ingestion was enabled for proof so old and new ingestion token behavior could be exercised end-to-end.
- Redis emitted an `allkeys-lru` eviction-policy warning during startup; the queue still initialized and processed the proof batch successfully.