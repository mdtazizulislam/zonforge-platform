# SERIAL 14 DB Proof - 2026-04-08

Proof database: `zonforge_serial_14_risk`

## risk_scores

```text
asset|aws-console|13|info|2|1
asset|iam-admin-role|17|low|1|1
org|org|96|critical|6|5
user|alice@example.com|89|critical|5|4
```

Columns captured:

- `entity_type`
- `entity_key`
- `score`
- `score_band`
- `signal_count`
- `jsonb_array_length(top_factors_json)`

## risk_factors

```text
asset|aws-console|finding:suspicious_login:medium|Suspicious login activity detections|13.37|2|6.40
asset|iam-admin-role|finding:privilege_escalation:critical|Privilege escalation activity detections|16.64|1|16.64
org|org|alert:privilege_escalation:critical|Privilege escalation activity|41.60|1|41.60
org|org|alert:suspicious_login:medium|Suspicious login activity|16.96|1|16.00
org|org|finding:privilege_escalation:critical|Privilege escalation activity detections|16.64|1|16.64
org|org|finding:suspicious_login:medium|Suspicious login activity detections|13.37|2|6.40
org|org|org:open_alert_pressure|Open alert pressure|7.00|1|1.00
user|alice@example.com|alert:privilege_escalation:critical|Privilege escalation activity|41.60|1|41.60
user|alice@example.com|alert:suspicious_login:medium|Suspicious login activity|16.96|1|16.00
user|alice@example.com|finding:privilege_escalation:critical|Privilege escalation activity detections|16.64|1|16.64
user|alice@example.com|finding:suspicious_login:medium|Suspicious login activity detections|13.37|2|6.40
```

Columns captured:

- `entity_type`
- `entity_key`
- `factor_key`
- `factor_label`
- `contribution`
- `signal_count`
- `weight`

## Bounds check

```text
0|0|0
```

Interpretation:

- No `risk_scores.score` values were outside `0..100`.
- No `risk_scores.top_factors_json` arrays were empty.
- No persisted `risk_factors.contribution` values were non-positive.