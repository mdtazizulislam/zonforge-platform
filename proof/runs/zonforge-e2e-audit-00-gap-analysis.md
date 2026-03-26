# ZONFORGE-E2E-AUDIT-00 Gap Analysis
Date: 2026-03-25
Method: Severity-ranked findings with evidence, impact, and remediation effort.

## Critical Findings

F-001: Registration does not create tenant context
- Severity: Critical
- Evidence: backend register path creates user row but no tenant linkage; billing routes return "User has no associated tenant".
- Impact: New customers cannot activate subscriptions or use billing workflows.
- Fix effort: Medium
- Recommended fix: Make tenant creation + user association transactional in registration flow; add integration tests for billing endpoints after signup.

## High Findings

F-002: Detection SQL rule failures (5 of 20 rules)
- Severity: High
- Evidence: Runtime ClickHouse errors for ZF-AUTH-002, ZF-AUTH-003, ZF-AUTH-004, ZF-OAUTH-001, ZF-EMAIL-001.
- Impact: 25 percent of enabled detections silently fail, reducing detection coverage and trust.
- Fix effort: Medium
- Recommended fix: Rewrite rule SQL for ClickHouse compatibility, add CI rule compilation/tests against live ClickHouse container.

F-003: Redis eviction policy unsafe for queue durability
- Severity: High
- Evidence: CONFIG GET maxmemory-policy returned allkeys-lru.
- Impact: BullMQ jobs can be evicted under memory pressure, causing dropped detections/alerts.
- Fix effort: Low
- Recommended fix: Set maxmemory-policy noeviction for queue Redis instance; add startup assertion.

F-004: Dual incompatible PostgreSQL schemas in monorepo
- Severity: High
- Evidence: backend schema uses SERIAL integer IDs while platform schema uses UUID IDs.
- Impact: Shared DB usage can corrupt assumptions, break joins, and invalidate migrations.
- Fix effort: High
- Recommended fix: Officially separate DBs or perform unified schema migration plan with compatibility layer.

## Medium Findings

F-005: AI SOC analyst hard fails without Anthropic key
- Severity: Medium
- Evidence: ai-soc-analyst throws on startup if API key missing; no fallback path.
- Impact: AI analyst service unavailable in local/staging without paid key; poor resilience.
- Fix effort: Low
- Recommended fix: Add deterministic template fallback and health status degraded mode.

F-006: Alert narrative quality degraded by placeholder key
- Severity: Medium
- Evidence: .env values contain sk-ant placeholders; alert-service uses template fallback.
- Impact: Alerts exist but AI-generated investigation narrative is not real.
- Fix effort: Low
- Recommended fix: Inject valid secret via environment manager; add startup warning + metrics.

F-007: zf-postgres instance unusable due to port/network conflict
- Severity: Medium
- Evidence: zf-postgres dead/no interfaces while zf-pg-platform on 5436 is active.
- Impact: Confusing operator path; scripts may target wrong DB.
- Fix effort: Low
- Recommended fix: Normalize compose profiles, reserve ports, remove stale service or document dual-DB intent.

## Low Findings

F-008: Frontend runtime not validated in this audit
- Severity: Low
- Evidence: web-dashboard dist exists but no live server/API gateway started during proof run.
- Impact: UI regressions could exist despite backend pipeline health.
- Fix effort: Low
- Recommended fix: Add smoke test that boots api-gateway + web-dashboard and checks key pages.

## Fixed During This Audit (Closed Items)

C-001: Ingestion HMAC verification mismatch
- Status: Closed
- Evidence: Changed to parse raw JSON before verify; ingest now returns accepted=2 rejected=0.

C-002: ESM require in extractEventId fallback
- Status: Closed
- Evidence: Replaced require with import createHash; fallback IDs now generated safely.

C-003: Sequence evaluator timezone parsing bug
- Status: Closed
- Evidence: Normalized ClickHouse DateTime string to UTC with Z suffix; ZF-AUTH-001 now matches correctly.

C-004: rule_id UUID mismatch in signal insert
- Status: Closed
- Evidence: Added UUID guard and null fallback; detection signals persist successfully.

C-005: detection_signals / alerts schema mismatches
- Status: Closed
- Evidence: Recreated tables per Drizzle shape; downstream inserts succeed.

## Readiness Conclusion

Current customer readiness: Not production-ready.

Reason:
- Core pipeline is proven operational.
- Multiple high/critical platform gaps remain in billing, detection coverage, queue durability, and schema governance.

Minimum release gate to proceed:
1. Fix F-001 and F-002.
2. Enforce F-003 configuration.
3. Resolve schema strategy in F-004.
4. Add runtime smoke checks for UI/API path.
