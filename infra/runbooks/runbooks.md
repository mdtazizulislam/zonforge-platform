# ─────────────────────────────────────────────────────────────────
# ZonForge Sentinel — Operational Runbooks
#
# One runbook per Prometheus alert. Each runbook covers:
#   - Symptoms / When this fires
#   - Impact
#   - Immediate actions (triage steps)
#   - Root cause investigation
#   - Remediation steps
#   - Escalation path
# ─────────────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════════
# RB-001: IngestionServiceDown
# ═══════════════════════════════════════════════════════════════════

## RB-001: Ingestion Service Down

**Alert:** `IngestionServiceDown`
**Severity:** CRITICAL | **SLO Impact:** YES — events not collected
**Runbook URL:** https://docs.zonforge.com/runbooks/ingestion-down

### Symptoms
- Collectors receive 503 from `POST /v1/ingest/events`
- `up{job="ingestion-service"}` == 0
- BullMQ raw-events queue depth flat/declining

### Impact
- **ALL** incoming security events are dropped
- Detection, correlation, and alerting are completely blind
- MTTD SLA actively breaching

### Immediate Actions (< 5 min)

```bash
# 1. Check pod status
kubectl get pods -n zonforge -l app.kubernetes.io/name=ingestion-service

# 2. Check recent logs
kubectl logs -n zonforge -l app.kubernetes.io/name=ingestion-service --tail=100

# 3. Check events (CrashLoopBackOff, OOMKilled?)
kubectl describe pods -n zonforge -l app.kubernetes.io/name=ingestion-service

# 4. Check DB connectivity
kubectl exec -n zonforge deploy/ingestion-service -- \
  pg_isready -h $POSTGRES_HOST -U $POSTGRES_USER

# 5. If CrashLoopBackOff — force restart
kubectl rollout restart deploy/ingestion-service -n zonforge
```

### Root Cause Investigation

```bash
# Check OOMKilled
kubectl get events -n zonforge --field-selector reason=OOMKilling

# Check recent deploys
kubectl rollout history deploy/ingestion-service -n zonforge

# Check config secret exists
kubectl get secret zonforge-secrets -n zonforge

# Check DB connection pool exhausted
psql $DATABASE_URL -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check Redis connectivity
kubectl exec -n zonforge deploy/ingestion-service -- \
  redis-cli -h $REDIS_HOST ping
```

### Remediation

| Root Cause | Fix |
|------------|-----|
| OOMKilled | Increase memory limit in `values.yaml` → deploy |
| Bad deploy | `kubectl rollout undo deploy/ingestion-service -n zonforge` |
| Secret missing | `kubectl create secret generic zonforge-secrets ...` |
| DB down | See RB-006: PostgreSQL Down |
| Redis down | See RB-007: Redis Down |

### Escalation
- 5 min no fix → Page on-call SRE
- 15 min no fix → Escalate to Engineering Lead

---

# ═══════════════════════════════════════════════════════════════════
# RB-002: NormalizationPipelineLag
# ═══════════════════════════════════════════════════════════════════

## RB-002: Normalization Pipeline Lag

**Alert:** `NormalizationPipelineLag`
**Severity:** CRITICAL | **SLO:** 2-minute lag maximum
**Runbook URL:** https://docs.zonforge.com/runbooks/normalization-lag

### Symptoms
- `zonforge_queue_lag_ms{queue="zf:raw-events"}` > 300,000 (5 min)
- Events collecting but not reaching detection engine
- Detection blind spot growing

### Immediate Actions

```bash
# 1. Check queue depth
kubectl exec -n zonforge deploy/api-gateway -- \
  curl -s http://ingestion-service:3001/v1/ingest/health | jq .queues

# 2. Check normalization worker health
kubectl get pods -n zonforge -l app.kubernetes.io/name=normalization-worker

# 3. Check worker logs for errors
kubectl logs -n zonforge -l app.kubernetes.io/name=normalization-worker \
  --tail=200 | grep -E "ERROR|FATAL|failed"

# 4. Check ClickHouse write performance
kubectl exec -n zonforge deploy/normalization-worker -- \
  curl -s "http://$CLICKHOUSE_HOST:8123/?query=SELECT%20count()%20FROM%20events"

# 5. Scale up normalization workers if queue > 5K
kubectl scale deploy/normalization-worker --replicas=5 -n zonforge
```

### Root Cause Investigation

```bash
# Check if ClickHouse is slow
kubectl exec -n zonforge deploy/normalization-worker -- \
  curl -s "http://$CLICKHOUSE_HOST:8123/?query=SELECT%20elapsed%20FROM%20system.processes"

# Check worker concurrency setting
kubectl get deploy normalization-worker -n zonforge -o jsonpath=\
  '{.spec.template.spec.containers[0].env}'

# Check DLQ — events failing normalization
kubectl exec -n zonforge deploy/api-gateway -- \
  curl -s http://ingestion-service:3001/v1/ingest/health | jq .dlq
```

### Remediation

| Root Cause | Fix |
|------------|-----|
| Workers overwhelmed | Scale: `kubectl scale deploy/normalization-worker --replicas=5` |
| ClickHouse slow | Check ClickHouse disk, memory; reduce insert batch size |
| ClickHouse down | See RB-008: ClickHouse Down |
| Schema mismatch | Check recent deploy, rollback if needed |
| High event volume | Temporary: increase worker concurrency via env var |

---

# ═══════════════════════════════════════════════════════════════════
# RB-003: DeadLetterQueueNonEmpty
# ═══════════════════════════════════════════════════════════════════

## RB-003: Dead Letter Queue Messages

**Alert:** `DeadLetterQueueNonEmpty`
**Severity:** WARNING
**Runbook URL:** https://docs.zonforge.com/runbooks/dlq-messages

### Symptoms
- `zonforge_queue_waiting{queue=~"zf:dlq:.*"}` > 0
- Events permanently failing normalization or processing

### Investigation

```bash
# Check DLQ contents (via BullMQ dashboard or CLI)
kubectl exec -n zonforge deploy/ingestion-service -- \
  node -e "
    const { Queue } = require('bullmq');
    const q = new Queue('zf:raw-events', { connection: { host: process.env.REDIS_HOST }});
    q.getFailed(0, 10).then(jobs => jobs.forEach(j => console.log(j.failedReason)));
  "

# Check for pattern in failures
kubectl logs -n zonforge -l app.kubernetes.io/name=normalization-worker \
  --since=1h | grep "DLQ\|failed\|maxAttempts"
```

### Remediation

```bash
# Retry all DLQ jobs (after fixing root cause)
kubectl exec -n zonforge deploy/ingestion-service -- \
  node -e "
    const { Queue } = require('bullmq');
    const q = new Queue('zf:dlq:raw-events', { connection: { host: process.env.REDIS_HOST }});
    q.retryJobs({ count: 100 }).then(() => console.log('Retried'));
  "

# Or drain DLQ if events are old/irrelevant
# WARNING: Events will be permanently lost
```

---

# ═══════════════════════════════════════════════════════════════════
# RB-004: DetectionEngineNoSignals
# ═══════════════════════════════════════════════════════════════════

## RB-004: Detection Engine Silent

**Alert:** `DetectionEngineNoSignals`
**Severity:** CRITICAL | **SLO Impact:** Detection completely blind
**Runbook URL:** https://docs.zonforge.com/runbooks/detection-silent

### Symptoms
- `rate(zonforge_detection_signals_total[30m]) == 0`
- No alerts being created
- No signals in detection queue

### Immediate Actions

```bash
# 1. Check detection engine health
kubectl get pods -n zonforge -l app.kubernetes.io/name=detection-engine
kubectl logs -n zonforge -l app.kubernetes.io/name=detection-engine --tail=100

# 2. Check if events ARE flowing (normalization working?)
kubectl exec -n zonforge deploy/api-gateway -- \
  curl -s http://normalization-worker:3002/health | jq .

# 3. Check detection queue
kubectl exec -n zonforge deploy/api-gateway -- \
  curl -s http://detection-engine:3003/health | jq .queues

# 4. Run a test detection
kubectl exec -n zonforge deploy/detection-engine -- \
  node -e "console.log('detection engine alive')"
```

### Root Cause Investigation

```bash
# Is it that no events are flowing? (not a detection bug)
kubectl exec -n zonforge deploy/api-gateway -- \
  curl -s "http://$CLICKHOUSE_HOST:8123/?query=\
  SELECT%20count()%20FROM%20events%20WHERE%20event_time%3Enow()-INTERVAL%2010%20MINUTE"

# Are rules loaded?
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.zonforge.com/v1/detection/rules | jq '.data | length'

# Check for rule evaluation errors
kubectl logs -n zonforge deploy/detection-engine --tail=500 | grep -i "rule\|error\|fail"
```

### Remediation

| Root Cause | Fix |
|------------|-----|
| No events flowing | See RB-002: Normalization Lag |
| Engine crashed | `kubectl rollout restart deploy/detection-engine` |
| Rules failed to load | Check YAML syntax, restart service |
| ClickHouse down | See RB-008 |
| Worker stopped | Check BullMQ worker registration |

---

# ═══════════════════════════════════════════════════════════════════
# RB-005: AuditChainIntegrityViolation  (CRITICAL SECURITY)
# ═══════════════════════════════════════════════════════════════════

## RB-005: 🚨 Audit Chain Integrity Violation

**Alert:** `AuditChainIntegrityViolation`
**Severity:** CRITICAL SECURITY EVENT
**Runbook URL:** https://docs.zonforge.com/runbooks/audit-chain-violation

### ⚠️ THIS IS A POTENTIAL SECURITY INCIDENT

This alert fires when the SHA-256 hash chain of the audit log is broken.
This can indicate:
1. Direct database manipulation (tampering)
2. Software bug in hash computation
3. Data migration without chain reset

### Immediate Actions

```bash
# 1. Identify which tenant and entry
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST https://api.zonforge.com/internal/security/verify-audit-chain \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "ALL", "fromDate": "2024-01-01", "toDate": "2024-12-31"}'

# 2. DO NOT modify the database
# 3. Preserve all DB transaction logs

# 4. Compare with WORM S3 export (source of truth)
aws s3 cp s3://zonforge-audit-prod/$TENANT_ID/$DATE/audit.jsonl.gz /tmp/
gunzip /tmp/audit.jsonl.gz
# Compare hashes manually
```

### Investigation Steps
1. Check when the violation was introduced (bisect entries)
2. Compare with S3 WORM export for the same date
3. Check DB access logs for direct writes
4. Check application deployment logs around violation time
5. Check if any migrations ran

### Escalation
- **IMMEDIATELY** notify: Security Lead + Engineering Lead + CISO
- Treat as security incident until proven otherwise
- Do not dismiss alert without forensic sign-off

---

# ═══════════════════════════════════════════════════════════════════
# RB-006: PostgreSQL Down / High Connections
# ═══════════════════════════════════════════════════════════════════

## RB-006: PostgreSQL Issues

**Alert:** `PostgresConnectionsHigh`
**Severity:** WARNING

### Immediate Actions

```bash
# Check connections
psql $DATABASE_URL -c "\
  SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"

# Kill idle connections (> 5 min)
psql $DATABASE_URL -c "\
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND query_start < now() - interval '5 minutes';"

# Scale up connection pooler (PgBouncer) if needed
kubectl scale deploy/pgbouncer --replicas=3 -n zonforge

# Check for long-running queries
psql $DATABASE_URL -c "\
  SELECT pid, now() - query_start AS duration, query
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY duration DESC LIMIT 10;"
```

---

# ═══════════════════════════════════════════════════════════════════
# RB-007: API Gateway High Error Rate
# ═══════════════════════════════════════════════════════════════════

## RB-007: API Gateway Errors

**Alert:** `ApiGatewayHighErrorRate`
**Severity:** WARNING

### Investigation

```bash
# Check error breakdown by endpoint
kubectl logs -n zonforge deploy/api-gateway --tail=500 | \
  grep '"status":5' | \
  jq -r '.path' | sort | uniq -c | sort -rn | head 20

# Check downstream service health
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.zonforge.com/v1/platform/health | jq .

# Check recent deploys
kubectl rollout history deploy/api-gateway -n zonforge
```

### Remediation
```bash
# If bad deploy → rollback
kubectl rollout undo deploy/api-gateway -n zonforge

# If downstream service down → check specific service runbook
# If database errors → see RB-006
```
