# SERIAL 10 — Connector Foundation Proof

Timestamp: 2026-04-07T13:15:22-04:00

## API proof
- Script: proof/runs/serial-10-api-proof.ps1
- Output: proof/runs/serial-10-api-proof.json
- Verified:
  - owner signup and tenant creation succeeded
  - admin, analyst, and viewer invitations were accepted
  - owner created AWS connector
  - admin created Microsoft 365 connector
  - owner created and then deleted Google Workspace connector
  - owner validation returned connected for AWS
  - admin test returned connected for Microsoft 365
  - analyst create attempt returned 403
  - viewer update attempt returned 403
  - final connector list showed AWS connected and Microsoft 365 disabled
  - pipeline health returned total=2, healthy=1, disabled=1

## DB proof
- Output: proof/runs/serial-10-db-proof.json
- Verified:
  - connector rows are tenant-scoped
  - config_json contains non-secret settings only
  - secret_ciphertext is populated for stored credentials
  - secret_key_version is set to 1
  - audit rows exist for connector.created, connector.tested, connector.updated, and connector.deleted

## UI proof
- Output: proof/runs/serial-10-connectors-owner.png
- Output: proof/runs/serial-10-connectors-analyst.png
- Verified:
  - owner view shows Add Connector and management actions
  - analyst view shows read-only access banner and no management controls

## Build and runtime logs
- Backend compile: npm --workspace @zonforge/backend run build
- Dashboard typecheck: npm --workspace @zonforge/web-dashboard run typecheck
- Dashboard build: npm --prefix c:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform-main-release --workspace @zonforge/web-dashboard run build
- Backend runtime log excerpt captured from local proof instance on port 3110:
  - POST /v1/connectors -> 201
  - POST /v1/connectors -> 403
  - PATCH /v1/connectors/1 -> 403
  - GET /v1/connectors/1/validate -> 200
  - POST /v1/connectors/2/test -> 200
  - PATCH /v1/connectors/2 -> 200
  - DELETE /v1/connectors/3 -> 200
  - GET /v1/health/pipeline -> 200
