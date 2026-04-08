# SERIAL 12 DB Proof

## detections

```text
tenant_id |       rule_key       | severity | event_count |     mitre_tactic     |      mitre_technique       |          created_at
8         | suspicious_login     | medium   | 2           | Initial Access       | T1078 Valid Accounts       | 2026-04-08 05:54:31.803722+00
8         | privilege_escalation | critical | 1           | Privilege Escalation | T1098 Account Manipulation | 2026-04-08 05:54:31.848031+00
8         | ingestion_anomaly    | medium   | 1           | Impact               | T1499 Endpoint Denial of Service | 2026-04-08 05:54:31.853182+00
8         | brute_force          | high     | 5           | Credential Access    | T1110 Brute Force          | 2026-04-08 05:54:32.017506+00
```

## detection_events

```text
detection_id | event_kind              | normalized_event_id | ingestion_security_event_id | source_event_id                        | actor_email       | actor_ip      | target_resource | created_at
8            | normalized_event        | 25                  |                             | serial12-suspicious-1775627671236      | alice@example.com | 198.51.100.20 | aws-console     | 2026-04-08 05:54:31.810305+00
8            | normalized_event        | 24                  |                             | serial12-baseline-1775627671236        | alice@example.com | 203.0.113.10  | aws-console     | 2026-04-08 05:54:31.814725+00
9            | normalized_event        | 26                  |                             | serial12-privilege-1775627671236       | carol@example.com | 203.0.113.77  | GlobalAdmin     | 2026-04-08 05:54:31.854963+00
10           | anomaly_detected        |                     | 3                           |                                        |                   | unknown       | zfi_5191f3c7848e4e | 2026-04-08 05:54:31.862183+00
11           | normalized_event_window | 31                  |                             | serial12-bruteforce-1775627671236-4    | bob@example.com   | 203.0.113.44  | aws-console     | 2026-04-08 05:54:32.038114+00
```

## detection_findings compatibility rows

```text
tenant_id |       rule_key       | severity | event_count |          created_at
8         | suspicious_login     | medium   | 2           | 2026-04-08 05:54:31.819771+00
8         | privilege_escalation | critical | 1           | 2026-04-08 05:54:31.861596+00
8         | ingestion_anomaly    | medium   | 1           | 2026-04-08 05:54:31.871651+00
8         | brute_force          | high     | 5           | 2026-04-08 05:54:32.046997+00
```

## security checks

```text
secret_leak_matches
0
```

Evidence:

- The new additive `detections` table contained all four SERIAL 12 rule outputs for tenant 8.
- `detection_events` rows linked normalized-event evidence and ingestion-security-event evidence without leaking Stripe-style secrets.
- Compatibility writes into `detection_findings` remained in sync so later alert/risk flows continue to work.