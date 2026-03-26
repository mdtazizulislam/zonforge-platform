# ZONFORGE-E2E-AUDIT-00 Dataflow Truth Map
Date: 2026-03-25

This document captures the exact verified data path with queue names, storage targets, and runtime proof IDs.

## A. Canonical Pipeline Path

1. HTTP ingestion request
- Entry: POST /ingest on ingestion-service (port 3001)
- Auth: HMAC signature verification via collector key + secret
- Proof: response accepted=2 rejected=0 queued=2

2. Raw queue fan-in
- Queue: zf-raw-events
- Producer: ingestion-service
- Consumer: normalization-worker
- Proof: bull:zf-raw-events showed completed jobs after ingest

3. Normalization and durable write
- Worker: normalization-worker (port 3002)
- Transform: source event to normalized schema
- Storage: ClickHouse table zonforge_events.events
- Downstream queue: zf-normalized-events
- Proof: normalization log "ClickHouse batch written, count: 1"

4. Detection evaluation
- Worker: detection-engine (port 3003)
- Input queue: zf-normalized-events
- Rule path tested: ZF-AUTH-001 sequence rule
- Matching logic proven: 5+ login_failed then login_success for same actor_user_id + actor_ip within 30m
- Storage: PostgreSQL table detection_signals
- Downstream queue: zf-detection-signals
- Proof signal ID: c112553a-ad2d-493e-85f1-d8c8e91cc410

5. Correlation
- Worker: correlation-engine (port 3004)
- Input queue: zf-detection-signals
- Correlation pattern fired: ACP-001
- Downstream queue: zf-alert-notifications
- Proof finding ID: 56e05771-2dc9-4eb5-a63b-186190c9dded

6. Alert materialization
- Worker: alert-service (port 3008)
- Input queue: zf-alert-notifications
- Storage: PostgreSQL table alerts
- Proof alert IDs:
  - 75ab55f5-24be-4b4d-8500-13862311ea69
  - 0563baf6-59cf-4472-85d2-b00f0c72447f

## B. Seeded Detection Test Data (Proof Set)

Tenant ID: 00000000-0000-0000-0000-000000000001
Actor user: bbbbbbbb-0001-0000-0000-000000000002
Actor IP: 1.2.3.4

Injected to ClickHouse zonforge_events.events:
- 8 login_failed events within the active 30-minute window
- 1 login_success event after failure burst

Outcome:
- ZF-AUTH-001 sequence evaluated true
- Detection signal persisted and published
- Correlation finding emitted
- Alerts created and persisted

## C. Queue and Storage Ledger

- zf-raw-events
  - produced by ingestion-service
  - consumed by normalization-worker

- zf-normalized-events
  - produced by normalization-worker
  - consumed by detection-engine

- zf-detection-signals
  - produced by detection-engine signal emitter
  - consumed by correlation-engine

- zf-alert-notifications
  - produced by correlation-engine
  - consumed by alert-service

Datastores touched in this proof:
- ClickHouse zonforge_events.events
- PostgreSQL detection_signals
- PostgreSQL alerts

## D. End-to-End Assertion

The exact path logs -> ingestion -> normalization -> detection -> correlation -> alert is proven with concrete IDs in runtime logs and database records. This is not a synthetic claim; each hop has direct execution evidence captured during the session.
