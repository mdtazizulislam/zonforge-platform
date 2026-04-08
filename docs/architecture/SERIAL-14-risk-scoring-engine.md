# SERIAL 14 Risk Scoring Engine

## Goals

- Build a deterministic, explainable risk scoring engine on top of SERIAL 12 findings and SERIAL 13 grouped alerts.
- Persist org, user, and asset scores in additive storage without breaking ingestion, detection, alert, auth, or connector flows.
- Expose tenant-scoped risk score APIs that remain compatible with the existing dashboard summary surface while adding the required SERIAL 14 entity endpoints.
- Keep every score bounded to 0-100 and every explanation factor sanitized so no secrets, raw tokens, or cross-tenant evidence are exposed.

## Architecture

### Storage Model

- Add `risk_scores` as the tenant-scoped materialized score table.
- Add `risk_factors` as the tenant-scoped explanation table keyed by `(tenant_id, entity_type, entity_key, factor_key)`.
- Keep one row per `(tenant_id, entity_type, entity_key)`.
- Persist:
  - `tenant_id`
  - `entity_type`
  - `entity_key`
  - `entity_label`
  - `score`
  - `score_band`
  - `top_factors_json`
  - `signal_count`
  - `last_event_at`
  - `last_calculated_at`
- Keep additive metadata (`created_at`, `updated_at`) for operations and proof.
- Persist factor rows with contribution, weight, signal count, and last seen timestamp so DB proof can show why a score exists without reading raw event payloads.

### Calculation Model

- Use deterministic weighted scoring only. No ML and no probabilistic inference.
- Recalculate from the standalone backend using tenant-scoped data from:
  - `detection_findings`
  - `alerts`
- Use a bounded 30-day lookback for inputs.
- Use recency weighting so newer detections and alerts matter more than older ones.
- Use severity weighting so `critical > high > medium > low > info`.
- Use rule weighting so privilege escalation contributes more than brute force, and brute force contributes more than suspicious login.
- Use grouped alert amplification carefully and cap it so repeated grouped findings raise risk without making a single alert unbounded.
- Use active alert weighting so `open` and `in_progress` matter more than `resolved`.
- Clamp every final score into the inclusive range `0-100`.

### Entity Model

- `org`
  - one row per tenant
  - aggregates recent detections and alert pressure across the tenant
- `user`
  - entity key is the normalized affected user or actor email
  - derived from alert principal or finding evidence
- `asset`
  - entity key is the normalized target resource / principal resource
  - derived from grouped alert principal or finding evidence

### Explanation Model

- `top_factors_json` contains sanitized factor summaries only.
- Factor entries include:
  - factor key
  - display label
  - contribution value
  - signal count
  - weight reference
  - last seen timestamp
- No raw event payloads, connector secrets, token references, or secret-bearing evidence are copied into the score table.

### API Surface

- Add required entity APIs:
  - `GET /v1/risk`
  - `GET /v1/risk/org`
  - `GET /v1/risk/users`
  - `GET /v1/risk/assets`
  - `GET /v1/risk/:entityType/:entityKey`
- Keep `GET /v1/risk/summary` as a compatibility summary view backed by the new org score.
- Keep existing user and asset detail routes working for the dashboard risk page.

### Recalculation Strategy

- Recalculate scores when risk endpoints are read so the persisted rows always exist for proof.
- Trigger recalculation after grouped alert creation, grouping, and lifecycle updates so runtime logs show risk updates alongside alert operations.
- Emit:
  - `risk_calculated`
  - `risk_updated`
  - `risk_failed`
- Keep the existing `risk_score_*` log names as compatibility aliases for any existing log consumers.

### Security Controls

- Every score query is filtered by tenant id.
- Cross-tenant reads return not found.
- Read access follows the current customer read policy: viewer, analyst, admin, and owner may read risk data.
- No secret leakage in factors, details, or summary payloads.

## Rollout Strategy

- Additive schema only.
- No existing risk summary, alert, detection, auth, or connector APIs are removed.
- Existing dashboard summary widgets keep using `/v1/risk/summary`, now powered by persisted SERIAL 14 scores.
- Existing risk detail pages keep working while asset risk becomes fully backed by real tenant-scoped data.

## Rollback

1. Revert the SERIAL 14 risk scoring module and route integration.
2. Redeploy the prior standalone backend build.
3. Leave `risk_scores` in place until the rollback build is verified healthy.
4. If a full schema rollback is later required, drop the additive risk indexes and `risk_scores` table after the old build is restored.
5. Re-verify alert reads, detection creation, connector flows, and risk summary reads on the restored build.