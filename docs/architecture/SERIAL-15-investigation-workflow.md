# SERIAL 15 - Investigation Workflow

## Goal

Build a tenant-scoped analyst investigation workflow on top of alerts, findings, and risk context without breaking the existing AI investigation surfaces already mounted at `/v1/investigations`.

## Constraints

- Additive only. No destructive schema or route removals.
- Preserve the current `ai_investigations` response shape used by the dashboard.
- Enforce strict tenant scoping on every read and write path.
- Keep the workflow deterministic and explainable. No dependency on external LLM execution.

## Existing State

- `ai_investigations` already stores the legacy investigation report shape rendered by the dashboard.
- `/v1/investigations`, `/v1/investigations/:id`, `/v1/investigations/stats`, and `/v1/investigations/:id/review` already exist.
- Alerts, alert events, alert findings, detection findings, and risk scores already exist and are tenant-scoped.

## Additive Data Model

### `investigations`

Authoritative workflow record for analyst investigations.

- `tenant_id`
- `ai_investigation_id` unique reference to `ai_investigations`
- `linked_alert_id` nullable reference to `alerts`
- `source`
- `title`
- `summary`
- `status` with `open | in_progress | closed`
- `priority`
- `primary_entity_type`
- `primary_entity_key`
- `risk_context_json`
- `created_by_user_id`
- `closed_at`
- `created_at`
- `updated_at`

### `investigation_evidence`

Normalized evidence links for alerts, findings, risk entities, and manual evidence.

- `investigation_id`
- `tenant_id`
- `source_type`
- `source_ref`
- `title`
- `description`
- `evidence_json`
- `created_by_user_id`
- `created_at`

### `investigation_alerts`

Normalized join records so one investigation can link multiple alerts safely.

- `investigation_id`
- `tenant_id`
- `alert_id`
- `linked_by_user_id`
- `created_at`

### `investigation_events`

Timeline records for workflow actions.

- `investigation_id`
- `tenant_id`
- `event_type`
- `message`
- `actor_user_id`
- `payload_json`
- `created_at`

### `investigation_notes`

Analyst notes stored separately from timeline payloads.

- `investigation_id`
- `tenant_id`
- `note`
- `created_by_user_id`
- `created_at`
- `updated_at`

## Compatibility Strategy

- Keep `ai_investigations` as the dashboard-facing projection.
- New investigations will create both an `ai_investigations` row and a linked `investigations` row.
- Legacy `ai_investigations` rows can be lazily wrapped into `investigations` when a SERIAL 15 write endpoint is used.
- `GET /v1/investigations` and `GET /v1/investigations/:id` continue returning the existing AI report fields, plus new workflow fields such as timeline, notes, related alerts/findings, linked evidence, and risk context.

## API Surface

- `POST /v1/investigations`
  - Supports create from alert and manual create.
- `GET /v1/investigations`
  - Returns workflow-backed list with legacy compatibility fields.
- `GET /v1/investigations/:id`
  - Returns summary, evidence, notes, timeline, related alerts/findings, and risk context.
- `PATCH /v1/investigations/:id/status`
  - Updates workflow status using `open | in_progress | closed`.
- `POST /v1/investigations/:id/evidence`
  - Links alert, finding, risk, or manual evidence.
- `POST /v1/investigations/:id/link-alert`
  - Links additional alerts to the same investigation.
- `POST /v1/investigations/:id/note`
  - Adds analyst notes.
- `POST /v1/investigations/:id/notes`
  - Adds analyst notes and timeline events.
- Keep `GET /v1/investigations/stats` and `POST /v1/investigations/:id/review` for backward compatibility.

## Workflow Rules

- Only `owner`, `admin`, and `analyst` can create, update status, add evidence, add notes, or review.
- Tenant `viewer` can read investigations if they already have read access to tenant security data.
- Investigation detail hydrates:
  - linked alert if present
  - related findings from `alert_findings`
  - related alerts for the same principal when safe
  - org, user, and asset risk context when resolvable
- Sensitive connector secrets or raw credentials must never be included in responses.

## Observability

Emit structured backend logs for:

- `investigation_created`
- `investigation_alert_linked`
- `investigation_status_changed`
- `investigation_evidence_added`
- `investigation_note_added`
- `investigation_failed`

Also write tenant audit log records for create, status update, evidence add, note add, and review.

## Rollout

1. Add schema and indexes.
2. Add workflow helpers and compatibility projection.
3. Swap existing `/v1/investigations` handlers to workflow-backed implementations.
4. Run build and isolated runtime proof.

## Rollback

- Route rollback is isolated to `customerSecurity.ts`.
- New tables are additive and can be ignored safely by reverting route usage.
- `ai_investigations` remains intact, so existing dashboard rendering can fall back immediately if needed.