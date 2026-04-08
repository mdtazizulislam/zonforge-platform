# SERIAL 12 Detection Engine MVP

## Goals

- Add a deterministic detection engine on top of existing `normalized_events` without changing ingestion, connector, or auth contracts.
- Produce tenant-scoped, explainable findings for suspicious login, brute force, and privilege escalation scenarios.
- Persist rule metadata and detection outputs in additive tables that are safe to query through the standalone backend.
- Keep evidence sanitized so findings never leak secrets, raw ingestion tokens, or cross-tenant data.

## Architecture

### Evaluation Model

- Reuse the existing standalone backend normalization flow as the event source of truth.
- Trigger detection evaluation immediately after a normalized event is inserted successfully.
- Keep evaluation deterministic and synchronous within the worker path so proof can show findings created from real normalized events.
- Evaluate only the tenant that owns the normalized event being processed.

### Storage Model

- Add `detection_rules` to store seeded rule metadata and ATT&CK mappings.
- Add `detection_findings` to store generated findings.
- Do not add `detection_state_windows` in the MVP because the three rules can be evaluated directly from `normalized_events` using bounded lookback windows.
- Add a deduplication key per finding so repeated worker retries or adjacent events do not create duplicate findings for the same window.

### Rules

#### Suspicious Login

- Trigger when a `signin_success` event occurs for a tenant-scoped actor and IP pair that differs from the actor's previous successful sign-in IP within the recent lookback window.
- Require at least one historical success from a different IP so first-time sign-ins do not create false positives.
- Severity defaults to `medium`.
- MITRE mapping: `Initial Access` / `T1078 Valid Accounts`.

#### Brute Force

- Trigger when at least 5 `signin_failure` events occur for the same tenant-scoped actor or actor IP within a 10-minute window.
- Evaluate on each failure event and create one deduplicated finding per actor-or-ip window.
- Severity defaults to `high`.
- MITRE mapping: `Credential Access` / `T1110 Brute Force`.

#### Privilege Escalation

- Trigger when a normalized event is classified as `privilege_change`.
- Severity is `critical` when the target or metadata indicates `owner`, `admin`, or equivalent privileged scope; otherwise `high`.
- MITRE mapping: `Privilege Escalation` / `T1098 Account Manipulation`.

### Finding Shape

Each finding stores:

- `tenant_id`
- `rule_key`
- `severity`
- `title`
- `explanation`
- `mitre_tactic`
- `mitre_technique`
- `source_type`
- `first_event_at`
- `last_event_at`
- `event_count`
- `evidence_json`

`evidence_json` remains sanitized and bounded to safe fields such as normalized event ids, actor email, actor IP, target resource, source event ids, and window counts.

### API Surface

- Add `GET /v1/detections` for tenant-scoped listing with optional severity, rule key, and source type filters.
- Add `GET /v1/detections/:id` for tenant-scoped detail lookup.
- Use the current tenant access model and existing safe read policy used for security data in the standalone backend.

### Observability

- Emit `detection_rule_matched` when a rule condition is satisfied.
- Emit `detection_finding_created` when a finding row is inserted.
- Emit `detection_evaluation_failed` when evaluation errors are caught.

### Rollout Strategy

- Additive schema only.
- No existing ingestion routes, auth routes, connector routes, or alert routes are removed or repurposed.
- Findings are generated from existing normalized events and do not alter event storage semantics.

## Rollback

1. Revert the standalone backend detection-engine code paths and detection APIs.
2. Redeploy the prior backend build.
3. Leave `detection_rules` and `detection_findings` in place for rapid rollback if needed; previous code will ignore them safely.
4. If schema rollback is later required, drop the additive detection tables and indexes after the old build is live.
5. Re-verify ingestion, normalized event listing, alerts, and tenant auth behavior on the restored build.