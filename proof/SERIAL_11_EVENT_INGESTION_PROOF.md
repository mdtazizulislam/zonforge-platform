# SERIAL 11 Event Ingestion Proof

Date: 2026-04-07
Repository: zonforge-platform-main-release
Scope: additive SERIAL 11 event ingestion pipeline in apps/backend and apps/web-dashboard

## Build Proof

- Backend build passed: `npm --workspace @zonforge/backend run build`
- Dashboard build passed: `npm --workspace @zonforge/web-dashboard run build`

## Queue Runtime Proof

- Isolated local database: `postgresql://zonforge:changeme_local@localhost:5432/zonforge_serial11`
- Redis-backed queue runtime started successfully on `zf-ingestion-events`
- Queue health after proof run:
  - `available=true`
  - `counts.completed=1`
  - `counts.failed=1`
  - `counters.totalReceived=3`
  - `counters.totalProcessed=2`
  - `counters.totalDeadLettered=1`

## API Proof

- `POST /v1/auth/signup`
  - tenant 1 owner created: `serial11-owner1@example.com`
  - tenant 2 owner created: `serial11-owner2@example.com`
- `POST /v1/connectors`
  - tenant 1 connector created: `connectorId=1`, type `aws`
  - tenant 2 connector created: `connectorId=2`, type `aws`
- `POST /v1/connectors/1/ingestion-token`
  - ingestion token minted for tenant 1 connector 1
- `POST /v1/team/invites`
  - viewer invite accepted: `serial11-viewer@example.com`
  - analyst invite accepted: `serial11-analyst@example.com`
- `POST /v1/events/ingest`
  - success batch accepted: `batchId=9d75c3cf-9c9e-4a74-8ee5-04b234b1a31a`, `acceptedCount=2`
  - retry batch accepted: `batchId=3335ead5-3ecf-4e73-9816-eb69e13593cd`, `acceptedCount=1`
- negative cases
  - invalid credential rejected with `401 ingestion_unauthorized`
  - malformed payload rejected with `400 invalid_ingestion_payload`

## Database Proof

### ingestion_request_logs

- processed request: `batchId=9d75c3cf-9c9e-4a74-8ee5-04b234b1a31a`, `status=processed`
- dead-letter request: `batchId=3335ead5-3ecf-4e73-9816-eb69e13593cd`, `status=dead_letter`

### raw_ingestion_events

- `evt-serial11-001` stored as `processed`
- `evt-serial11-002` stored as `processed`
- `evt-serial11-retry` stored as `dead_letter`, `retry_count=3`, `error_message=Simulated retryable worker failure`

### normalized_events

- `evt-serial11-001` normalized to `signin_success`
- `evt-serial11-002` normalized to `config_change`

### failed_ingestion_events

- dead-letter row persisted for `evt-serial11-retry`, `retry_count=3`

## Security Proof

- tenant isolation
  - tenant 1 owner, analyst, and viewer all received `200` from `GET /v1/events`
  - tenant 2 owner received an empty list from `GET /v1/events`
  - tenant 2 owner received `404 not_found` for tenant 1 event detail
- connector-scoped ingestion auth
  - valid ingestion token accepted for tenant 1 connector 1 only
  - invalid ingestion token rejected with `401`

## UI Proof

- dashboard screenshot with connector ingestion hint: `proof/runs/serial11-ui/serial11-dashboard-page.png`
- events page screenshot with normalized event list: `proof/runs/serial11-ui/serial11-events-page.png`

## Notes

- Redis reported an eviction-policy warning (`allkeys-lru` instead of `noeviction`) during local proof, but queue startup and worker processing still completed.
- The shared local `zonforge` database contained incompatible legacy schema, so proof was executed against the clean `zonforge_serial11` database.