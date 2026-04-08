# SERIAL S4 Ingestion Security Hardening Proof

## Artifacts

- Architecture: `docs/architecture/SERIAL-S4-ingestion-security-hardening.md`
- API proof: `proof/runs/serial-s4-api-proof-20260407.json`
- DB and log proof: `proof/runs/serial-s4-db-proof-20260407.md`
- Build and runtime proof: `proof/runs/serial-s4-build-proof-20260407.txt`

## Scope Covered

- Token-scoped and IP-scoped ingestion throttling were enforced ahead of queue enqueue.
- Payload-size limits and stricter event validation rejected malformed or oversized input without crashing the service.
- Replay detection moved to the API edge and rejected a previously ingested `eventId` with `409 replay_detected`.
- Valid ingestion requests still queued and processed normally after the S4 guards were added.
- Queue-health output now exposes recent ingestion security counters.
- Durable security telemetry persisted `rate_limited`, `replay_detected`, and `anomaly_detected` without storing raw tokens or raw payload bodies.

## Execution Notes

- Proof ran against an isolated Postgres database named `zonforge_s4_ingestion_security`.
- Backend runtime proof was captured on port `3108` using the built standalone backend artifact.
- Proof-specific limits were set only for the isolated run so rate limiting and payload rejection could be demonstrated quickly without changing the default production-oriented settings.
- Redis-backed ingestion remained enabled for the proof run and the worker processed all accepted batches successfully.