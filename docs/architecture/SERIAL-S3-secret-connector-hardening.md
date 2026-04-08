# SERIAL S3 Secret And Connector Hardening

## Goals

- Harden connector secret lifecycle management without breaking existing connector create, update, validate, or delete flows.
- Preserve the existing hash-only ingestion token model while adding explicit rotation routes and stronger lifecycle metadata.
- Prevent raw connector secrets from being read back after persistence.
- Introduce a production secret-manager-ready abstraction while keeping the current standalone backend deployable with additive changes only.
- Require step-up authentication for secret and ingestion credential rotation.

## Architecture

### Secret Storage Abstraction

- Introduce a connector secret storage abstraction in the standalone backend.
- Standardize writes through a single provider interface that returns:
  - encrypted secret payload for the active storage backend
  - storage provider identifier
  - secret reference identifier
  - secret fingerprint for non-reversible change tracking
  - rotation timestamp and rotation counter updates
- Use `database_encrypted` as the default provider for this serial.
- Keep the abstraction compatible with a future external secret manager by treating the stored database row as metadata plus provider-specific reference material.

### Secret Reference Model

- Extend `connector_configs` with additive metadata fields:
  - `secret_storage_provider`
  - `secret_reference`
  - `secret_fingerprint`
  - `secret_last_rotated_at`
  - `secret_rotation_count`
- The reference value is opaque and safe to expose in internal metadata responses.
- The plaintext secret values remain decryptable only inside backend execution paths that need them for validation or connector operation.

### No Secret Read-Back

- Preserve the current behavior where connector list and detail responses expose `hasStoredSecrets` rather than plaintext.
- Ensure the new connector security route returns metadata only, never decrypted secret material.
- Connector create, update, and rotate-secret responses return lifecycle metadata and status only.
- Audit and security logs must never contain raw connector secrets or raw ingestion tokens.

### Connector Security Metadata

- Add `GET /v1/connectors/:id/security`.
- Return connector security metadata only:
  - secret provider
  - secret reference
  - secret key version
  - secret fingerprint
  - secret last rotated timestamp
  - secret rotation count
  - whether secrets are currently stored
  - ingestion token status, prefix, creation time, last use, revocation time, and last rotation timestamp
- Resolve the connector row through a tenant-scoped lookup before returning metadata.

### Rotation Flows

- Add `POST /v1/connectors/:id/rotate-secret`.
- Require owner or admin role plus a live step-up window.
- Load the existing connector, merge supplied replacement secrets with current persisted secrets when needed, validate through the existing connector payload parser, and persist via the secret storage abstraction.
- Reset connector status back to `pending` after secret rotation so the next validation path re-checks the credentials.

- Add `POST /v1/connectors/:id/rotate-ingestion-token` as an explicit alias for the existing ingestion token rotation contract.
- Keep the existing `POST /v1/connectors/:id/ingestion-token` route for backward compatibility.
- Extend token rotation metadata in `connector_ingestion_tokens` with `rotated_at` so the latest credential lifecycle can be exposed without revealing the raw token.

### Existing Flow Preservation

- Keep connector create, update, validate, test, delete, and ingestion event flows backward compatible.
- Reuse the existing parser and encryption/decryption logic rather than replacing connector payload semantics.
- Reuse the S2 centralized authz helpers for tenant scoping, role checks, ownership enforcement, and step-up requirements.

### Audit And Security Logging

- Continue tenant audit logging for connector business actions.
- Record explicit connector security lifecycle events for secret rotation and security metadata-sensitive actions.
- Continue logging ingestion token rotation and revocation without persisting raw tokens.
- Preserve cross-tenant denials through tenant-scoped ownership lookups.

## API Surface

- New: `POST /v1/connectors/:id/rotate-secret`
- New: `POST /v1/connectors/:id/rotate-ingestion-token`
- New: `GET /v1/connectors/:id/security`
- Existing: `POST /v1/connectors/:id/ingestion-token` remains supported

## Rollout Strategy

- Additive schema only.
- Backward-compatible route preservation.
- Default provider remains database-backed encrypted secret storage.
- Future external secret manager rollout can swap provider implementation without changing connector route contracts.

## Rollback

1. Revert the standalone backend application changes for connector secret lifecycle handling and the new connector security routes.
2. Redeploy the prior backend build.
3. Leave the additive secret metadata columns and token rotation timestamp in place if fast rollback is required; previous code safely ignores them.
4. If schema rollback is required after the old build is live, drop the additive connector secret metadata columns and `rotated_at` from `connector_ingestion_tokens`.
5. Re-verify connector create, update, delete, validate, ingestion token rotation, and event ingestion on the restored build.