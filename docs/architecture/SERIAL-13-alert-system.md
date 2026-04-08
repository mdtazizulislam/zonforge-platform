# SERIAL 13 Alert System

## Goals

- Turn additive `detection_findings` into tenant-scoped, triage-ready alerts without changing ingestion, auth, or connector contracts.
- Group repeated findings into the same alert using a deterministic tenant, rule, and principal key inside a bounded recent window.
- Expose grouped alerts through the existing standalone backend routes so the current dashboard, alert list, and alert detail surfaces continue to work with minimal churn.
- Keep alert detail sanitized so no raw secrets, connector secrets, tokens, or cross-tenant evidence leak through the customer APIs.

## Architecture

### Materialization Model

- Reuse SERIAL 12 `detection_findings` as the only upstream source for alert creation.
- Trigger alert materialization immediately after a new detection finding is inserted successfully.
- Keep materialization in a dedicated backend module instead of embedding grouping logic in route handlers.
- Emit runtime observability logs for create, group, status change, and failure paths.

### Storage Model

- Add `alerts` as the grouped alert entity.
- Add `alert_findings` as the join table from grouped alerts to the underlying `detection_findings` rows.
- Add `alert_events` to preserve lifecycle and grouping history for proof and future timeline use.
- Leave legacy `security_alerts` in place for rollback safety, but stop using it for the `/v1/alerts` customer APIs.

### Grouping Model

- Grouping key is `tenant_id + rule_key + principal_key`.
- Principal selection order is:
  1. actor email / affected user
  2. actor IP / affected IP
  3. target resource
  4. fallback finding identifier when no principal exists
- A finding groups into an existing alert only when:
  - tenant matches
  - rule key matches
  - principal key matches
  - the existing alert was seen inside the recent grouping window
  - the existing alert is still active (`open` or `in_progress`)
- Default grouping window is 6 hours and remains additive/configurable through environment.
- When grouped:
  - `finding_count` increments
  - `first_seen_at` keeps the earliest signal
  - `last_seen_at` moves to the newest finding
  - the evidence list stays bounded and sanitized

### Lifecycle Model

- Supported customer-facing statuses are only:
  - `open`
  - `in_progress`
  - `resolved`
- Viewers can read alerts only.
- Analysts, admins, and owners can update alert status.
- A status change to `resolved` sets `resolved_at`.
- Re-opening from `resolved` clears `resolved_at`.

### Alert Shape

Each alert stores:

- tenant scope
- rule key and grouping key
- principal type and principal key
- title and description
- severity and derived priority
- lifecycle status
- affected user and affected IP when present
- MITRE tactic and technique arrays
- sanitized evidence list
- recommended actions
- `first_signal_time`, `first_seen_at`, `last_seen_at`
- `finding_count`
- `detection_gap_minutes` and `mttd_sla_breached`
- assignment metadata for existing UI compatibility

### API Surface

- Keep the existing customer routes and repoint them to the new grouped model:
  - `GET /v1/alerts`
  - `GET /v1/alerts/:id`
  - `PATCH /v1/alerts/:id/status`
- Preserve the current response shape where possible so the dashboard, alert center, and detail pages require only lifecycle-alignment changes.
- Add grouped-alert metadata such as `findingCount`, `firstSeenAt`, and `lastSeenAt` as non-breaking fields.

### Security Controls

- Every alert query is filtered by tenant id before lookup.
- Cross-tenant reads resolve as not found from the customer API surface.
- Viewer remains read-only because update routes still require incident responder roles.
- Evidence returned from alert detail is built only from sanitized detection evidence; no connector secrets, raw ingestion tokens, or raw secret payloads are included.

### Observability

- Emit `alert_created` when a new grouped alert row is inserted.
- Emit `alert_grouped` when a new finding attaches to an existing alert.
- Emit `alert_status_changed` on lifecycle updates.
- Emit `alert_materialization_failed` when the materializer catches an error.

## Rollout Strategy

- Additive schema only.
- No existing ingestion, detection, auth, or connector routes are removed.
- Existing `/v1/alerts` paths stay stable while their storage backend changes from legacy alerts to grouped alerts.
- Frontend lifecycle terms move from `investigating` to `in_progress` so the UI matches the enforced backend model.

## Rollback

1. Revert the grouped alert materializer, grouped alert queries, and lifecycle updates.
2. Redeploy the prior standalone backend build.
3. Leave `alerts`, `alert_findings`, and `alert_events` in place until the old build is confirmed healthy.
4. If full schema rollback is later required, drop the additive alert tables and indexes after the old build is restored.
5. Re-verify detection creation, tenant auth, connector flows, and legacy alert reads on the restored build.