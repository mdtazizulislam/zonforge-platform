# SERIAL 12 Detection Engine Proof

## Artifacts

- Architecture: `docs/architecture/SERIAL-12-detection-engine-mvp.md`
- API proof: `proof/runs/serial-12-api-proof-20260407.json`
- DB proof: `proof/runs/serial-12-db-proof-20260407.md`
- Build and runtime proof: `proof/runs/serial-12-build-proof-20260407.txt`

## Scope Covered

- Deterministic tenant-scoped detections were added on top of `normalized_events`.
- The engine created findings for suspicious login, brute force, and privilege escalation scenarios.
- Each finding carried severity, MITRE ATT&CK mapping, explanation text, event timing, event count, and sanitized evidence.
- `GET /v1/detections` and `GET /v1/detections/:id` returned the created findings.
- A second tenant could not read another tenant's findings.
- Evidence was checked for secret leakage and returned zero matches for raw token or Stripe-style secret patterns.

## Execution Notes

- Proof ran against isolated Postgres database `zonforge_serial_12_detection`.
- Backend runtime proof used the built standalone backend on port `3109` with Redis-backed ingestion enabled.
- Frontend was not touched for SERIAL 12, so frontend build proof was not required.