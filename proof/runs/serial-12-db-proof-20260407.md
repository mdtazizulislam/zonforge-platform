# SERIAL 12 DB Proof

## detection_rules

```text
       rule_key       | severity |     mitre_tactic     |      mitre_technique       | enabled
----------------------+----------+----------------------+----------------------------+---------
 brute_force          | high     | Credential Access    | T1110 Brute Force          | t
 privilege_escalation | high     | Privilege Escalation | T1098 Account Manipulation | t
 suspicious_login     | medium   | Initial Access       | T1078 Valid Accounts       | t
```

## detection_findings

```text
 id | tenant_id |       rule_key       | severity |                 title                  |     mitre_tactic     |      mitre_technique       | source_type  |       first_event_at       |       last_event_at        | event_count
----+-----------+----------------------+----------+----------------------------------------+----------------------+----------------------------+--------------+----------------------------+----------------------------+-------------
  1 |         1 | suspicious_login     | medium   | Suspicious login detected              | Initial Access       | T1078 Valid Accounts       | microsoft365 | 2026-04-08 04:03:02.309+00 | 2026-04-08 04:03:02.343+00 |           2
  2 |         1 | privilege_escalation | critical | Privilege escalation activity detected | Privilege Escalation | T1098 Account Manipulation | microsoft365 | 2026-04-08 04:03:02.387+00 | 2026-04-08 04:03:02.387+00 |           1
  3 |         1 | brute_force          | high     | Brute force activity detected          | Credential Access    | T1110 Brute Force          | microsoft365 | 2026-04-08 04:03:02.362+00 | 2026-04-08 04:03:02.362+00 |           5
```

## explanation fields

```text
 id |       rule_key       |                                                                        explanation
----+----------------------+-----------------------------------------------------------------------------------------------------------------------------------------------------------
  1 | suspicious_login     | alice@example.com signed in successfully from 198.51.100.20, which differs from recent successful sign-in IP activity for the same tenant-scoped account.
  2 | privilege_escalation | carol@example.com performed a privilege-related change affecting GlobalAdmin.
  3 | brute_force          | 5 failed sign-in events were observed within 10 minutes for bob@example.com.
```

## security checks

```text
 secret_leak_matches
---------------------
                   0
```

```text
 tenant_id | finding_count
-----------+---------------
         1 |             3
```

Evidence:

- All required rule rows were present.
- Findings included explanation and MITRE fields.
- No raw ingestion token or Stripe-style secret pattern appeared in `evidence_json`.
- Findings were written only for the originating tenant in the isolated proof run.