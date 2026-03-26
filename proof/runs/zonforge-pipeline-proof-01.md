# SERIAL: ZONFORGE-PIPELINE-PROOF-01
Date: 2026-03-25

## 1) STATUS
PARTIAL PASS
- End-to-end event flow to alert and alert API visibility: PROVEN
- Risk scoring update for entity record in risk_scores: BLOCKED by runtime schema/dependency gaps

## 2) PIPELINE STEP RESULTS

### STEP 1 — CREATE TEST EVENT
Synthetic event injected as one CloudTrail ConsoleLogin record.
- sourceType: aws_cloudtrail
- vendor eventID: ct-proof-01-a
- actor IP: 198.51.100.77
- userIdentity.type: AssumedRole (normalizes to service_account)

HTTP ingest request body used:
```json
{
  "connectorId": "00000000-0000-0000-0000-000000000099",
  "sourceType": "aws_cloudtrail",
  "batchId": "11111111-2222-3333-4444-555555555501",
  "events": [
    {
      "eventVersion": "1.08",
      "eventID": "ct-proof-01-a",
      "eventTime": "2026-03-25T17:20:27.363Z",
      "eventSource": "signin.amazonaws.com",
      "eventName": "ConsoleLogin",
      "eventType": "AwsConsoleSignIn",
      "awsRegion": "us-east-1",
      "sourceIPAddress": "198.51.100.77",
      "userAgent": "Mozilla/5.0 proof",
      "userIdentity": {
        "type": "AssumedRole",
        "principalId": "PROOF:svc-proofbot",
        "arn": "arn:aws:sts::123456789012:assumed-role/svc-proofbot/session",
        "accountId": "123456789012",
        "sessionContext": {
          "sessionIssuer": {
            "userName": "svc-proofbot",
            "arn": "arn:aws:iam::123456789012:role/svc-proofbot"
          }
        }
      },
      "requestParameters": {},
      "responseElements": {},
      "recipientAccountId": "123456789012"
    }
  ]
}
```

### STEP 2 — INGESTION PROOF
Evidence that ingestion received event and queued it:
- HTTP response:
```text
STATUS 202
{"success":true,"data":{"batchId":"11111111-2222-3333-4444-555555555501","accepted":1,"duplicates":0,"rejected":0},"meta":{"requestId":"f61f1541-e170-4a33-a923-cd7b7e9c2968","timestamp":"2026-03-25T17:20:27.743Z"}}
```
- BullMQ raw queue completed job:
```text
QUEUE zf-raw-events
{"jobId":"4","name":"raw-event:5522b886-099e-4885-bf0b-699cb2c61bc3","eventId":"5522b886-099e-4885-bf0b-699cb2c61bc3","tenantId":"00000000-0000-0000-0000-000000000001"}
```

### STEP 3 — NORMALIZATION PROOF
Evidence event was normalized to OCSF fields and written to ClickHouse:
- BullMQ normalized queue completed job:
```text
QUEUE zf-normalized-events
{"jobId":"8","name":"normalized:5522b886-099e-4885-bf0b-699cb2c61bc3","eventId":"5522b886-099e-4885-bf0b-699cb2c61bc3","tenantId":"00000000-0000-0000-0000-000000000001","entityId":"198.51.100.77"}
```
- ClickHouse row proof:
```text
event_id:        5522b886-099e-4885-bf0b-699cb2c61bc3
tenant_id:       00000000-0000-0000-0000-000000000001
source_type:     aws_cloudtrail
event_action:    login_success
outcome:         success
actor_user_type: service_account
actor_ip:        198.51.100.77
event_time:      2026-03-25 17:20:27.363
awsEventName:    ConsoleLogin
```

### STEP 4 — DETECTION PROOF
Evidence rules fired and detections were created:
- detection-engine log:
```text
[13:20:30.052] INFO Detection matches emitted
tenantId: 00000000-0000-0000-0000-000000000001
sourceType: aws_cloudtrail
eventId: 5522b886-099e-4885-bf0b-699cb2c61bc3
matches: 2
```
- BullMQ detection queue:
```text
{"jobId":"4","name":"detection:4477581f-54a4-4f26-850c-2b75acbde9fb","entityId":"198.51.100.77","ruleId":"ZF-LATERAL-001","evidenceEventIds":["5522b886-099e-4885-bf0b-699cb2c61bc3"]}
{"jobId":"3","name":"detection:3cda53fc-f1ff-4b93-91ec-3f5d0db3891f","entityId":"00000000-0000-0000-0000-000000000001","ruleId":"ZF-IAM-001","evidenceEventIds":["5522b886-099e-4885-bf0b-699cb2c61bc3"]}
```
- PostgreSQL detection_signals rows:
```text
id: 4477581f-54a4-4f26-850c-2b75acbde9fb
entity_id: 198.51.100.77
severity: high
detected_at: 2026-03-25 17:20:30.019+00
evidence_event_ids: {5522b886-099e-4885-bf0b-699cb2c61bc3}

id: 3cda53fc-f1ff-4b93-91ec-3f5d0db3891f
entity_id: 00000000-0000-0000-0000-000000000001
severity: high
detected_at: 2026-03-25 17:20:29.9+00
evidence_event_ids: {5522b886-099e-4885-bf0b-699cb2c61bc3}
```

### STEP 5 — RISK SCORING
Result: PARTIAL / BLOCKED
- Engine health proved running:
```text
{"status":"ok","service":"risk-scoring-engine","timestamp":"2026-03-25T17:24:29.094Z"}
```
- Org posture scoring endpoint works:
```text
POST /internal/score-org -> STATUS 200
{"success":true,"data":{"postureScore":80,"openCriticalAlerts":0,"openHighAlerts":4,"avgUserRiskScore":0,...}}
```
- Entity risk score update blocked:
```text
POST /internal/score-user -> STATUS 500
PostgresError: relation "threat_intel_matches" does not exist
```
- DB proof:
```text
SELECT * FROM risk_scores -> 0 rows
```

### STEP 6 — ALERT PROOF
Evidence alert records were created with title, severity, evidence:
- alert-service log:
```text
[13:20:30.127] INFO Alert created: Credential Brute-Force to Account Takeover
alertId: b4abcda4-db17-4bcc-86a0-36fab4d6938f
severity: high
priority: P2
```
- PostgreSQL alerts rows:
```text
id: b4abcda4-db17-4bcc-86a0-36fab4d6938f
finding_id: f3099f7c-4334-407d-9029-c6d08c1934ad
title: Credential Brute-Force to Account Takeover
severity: high
priority: P2
status: open
evidence contains eventId: 5522b886-099e-4885-bf0b-699cb2c61bc3

id: d1fefb95-67d7-4b59-bce6-508fe5b30c86
finding_id: cc3419b5-bb2f-4f68-a0f1-a809d2560358
title: Credential Brute-Force to Account Takeover
severity: high
priority: P2
status: open
evidence contains eventId: 5522b886-099e-4885-bf0b-699cb2c61bc3
```

### STEP 7 — DASHBOARD/API PROOF
Alert visibility via API proved:
```text
GET http://localhost:3008/v1/alerts?limit=2
Authorization: Bearer <valid HS256 JWT with iss=zonforge-sentinel aud=zonforge-api>
STATUS 200
```
Response included both new alert IDs:
- b4abcda4-db17-4bcc-86a0-36fab4d6938f
- d1fefb95-67d7-4b59-bce6-508fe5b30c86

### STEP 8 — TRACE FULL FLOW
Primary trace chain (single event path):
- event_id: 5522b886-099e-4885-bf0b-699cb2c61bc3
- ingestion_id: raw queue jobId 4 (raw-event:5522b886-099e-4885-bf0b-699cb2c61bc3)
- normalized_id: normalized queue jobId 8 / eventId 5522b886-099e-4885-bf0b-699cb2c61bc3
- detection_id: 4477581f-54a4-4f26-850c-2b75acbde9fb
- alert_id: b4abcda4-db17-4bcc-86a0-36fab4d6938f

Secondary correlated trace from same event:
- detection_id: 3cda53fc-f1ff-4b93-91ec-3f5d0db3891f
- alert_id: d1fefb95-67d7-4b59-bce6-508fe5b30c86

## 3) ALERT OUTPUT
Latest alert payload (API):
```json
{
  "id": "b4abcda4-db17-4bcc-86a0-36fab4d6938f",
  "title": "Credential Brute-Force to Account Takeover",
  "severity": "high",
  "priority": "P2",
  "status": "open",
  "affectedIp": "198.51.100.77",
  "mitreTactics": ["TA0006", "TA0001"],
  "mitreTechniques": ["T1110", "T1078"]
}
```

## 4) TRACE IDS
- Batch ID: 11111111-2222-3333-4444-555555555501
- Request ID: f61f1541-e170-4a33-a923-cd7b7e9c2968
- Event ID: 5522b886-099e-4885-bf0b-699cb2c61bc3
- Detection IDs: 4477581f-54a4-4f26-850c-2b75acbde9fb, 3cda53fc-f1ff-4b93-91ec-3f5d0db3891f
- Finding IDs: f3099f7c-4334-407d-9029-c6d08c1934ad, cc3419b5-bb2f-4f68-a0f1-a809d2560358
- Alert IDs: b4abcda4-db17-4bcc-86a0-36fab4d6938f, d1fefb95-67d7-4b59-bce6-508fe5b30c86

## 5) FAILURES (if any)
1. Risk scoring entity update failed:
- POST /internal/score-user returned 500
- Root cause evidence: missing PostgreSQL relation threat_intel_matches
- Result: risk_scores table remained empty

2. Additional known runtime warnings/errors observed in detection logs:
- 5 rules still produce ClickHouse SQL/function errors (ZF-AUTH-002/003/004, ZF-OAUTH-001, ZF-EMAIL-001)

3. Redis durability warning persists:
- maxmemory-policy is allkeys-lru; queue-safe setting should be noeviction

## 6) REPORT PATH
proof/runs/zonforge-pipeline-proof-01.md
