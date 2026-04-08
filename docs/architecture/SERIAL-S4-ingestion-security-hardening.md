# SERIAL S4 Ingestion Security Hardening

## Goals

- Harden the standalone backend ingestion pipeline against abuse, replay, overload, and malformed payloads without breaking valid ingestion flows.
- Keep the existing ingestion contract and queue-backed processing model intact.
- Reject abusive or malformed requests before they consume unnecessary queue or worker capacity.
- Persist security telemetry for rate limiting, replay attempts, queue pressure, and anomaly detection.

## Architecture

### Request Guardrail Layer

- Keep authentication by hashed ingestion token as the first gate.
- Extend request throttling to enforce both token-scoped and IP-scoped rate limits.
- Preserve payload-size enforcement and move all request validation ahead of queue enqueue.
- Continue using safe API error contracts that do not echo raw secrets, tokens, or payload bodies.

### Strict Validation Layer

- Tighten ingestion schema validation for the existing request shape:
  - `sourceType` remains required and connector-scoped
  - `events` must remain a non-empty array within batch-size limits
  - each event must provide a valid timestamp and event type
  - identifier and string fields are length-bounded
  - `actor`, `target`, `metadata`, and `original` stay object-shaped
- Keep partial rejection behavior for invalid events inside a mixed batch.
- Return concise validation reasons only; never return internal stack traces or raw stored data.

### Replay Protection

- Move replay detection from worker-only handling to a pre-queue request check.
- Reuse the existing tenant-, connector-, source-type-, and event-id-scoped uniqueness model already represented by `raw_ingestion_events`.
- Events with a previously seen `eventId` are rejected before enqueue.
- If all candidate events in a request are replayed, return `409 replay_detected`.
- If a mixed batch contains both new and replayed events, enqueue only the new events and return the replayed entries in the rejected list.

### Queue Overload Protection

- Add a queue-capacity guard before enqueue.
- Reject requests with a safe backpressure response when waiting plus active work crosses a configured threshold.
- Keep the queue-health route backward compatible while extending it with recent security and anomaly counters.

### Ingestion Anomaly Detection

- Add lightweight anomaly classification at the API edge for patterns that indicate abuse or degradation:
  - near-limit payload size
  - near-limit batch size
  - high invalid-event rejection ratio
  - queue overload
  - repeated replay attempts
- Persist anomaly events in a dedicated additive table so proof and operational review do not depend on transient process memory.
- Continue existing aggregate event-rate tracking on connector rows.

### Security Telemetry

- Add `ingestion_security_events` for durable security telemetry.
- Record at minimum:
  - `rate_limited`
  - `replay_detected`
  - `anomaly_detected`
- Store only safe metadata such as connector id, token prefix, IP, request id, source type, counts, and reason codes.
- Do not store raw payload bodies or raw ingestion tokens in security telemetry.

### Existing Flow Preservation

- Keep valid ingestion requests queue-backed and non-blocking.
- Preserve the existing event normalization and worker flow for accepted events.
- Keep connector token rotation, event listing, event detail, and queue-health routes compatible.
- Maintain additive schema only.

## API Surface

- Existing: `POST /v1/events/ingest`
  - gains stricter validation, pre-queue replay rejection, dual-scope rate limiting, and queue-backpressure enforcement
- Existing: `GET /internal/ingestion/queue-health`
  - gains ingestion security summary metrics

## Security Controls

- Token plus IP rate limiting
- Payload-size guard
- Strict schema validation
- Pre-queue replay protection by `eventId`
- Queue overload backpressure guard
- Durable anomaly and abuse telemetry
- Safe non-secret-bearing error responses and logs

## Rollout Strategy

- Additive schema only.
- Backward-compatible request and response structure for successful ingestion.
- Invalid, replayed, or abusive requests are rejected earlier than before, but valid ingestion behavior remains unchanged.

## Rollback

1. Revert the standalone backend application changes in the ingestion request path, queue guard logic, and queue-health summary logic.
2. Redeploy the prior backend build.
3. Leave the additive `ingestion_security_events` table in place if rapid rollback is needed; prior code ignores it safely.
4. If schema rollback is required after the old build is live, drop `ingestion_security_events` and any additive indexes introduced for S4.
5. Re-verify valid ingestion, queue processing, event listing, and queue-health behavior on the restored build.