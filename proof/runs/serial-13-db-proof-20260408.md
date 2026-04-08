# SERIAL 13 DB Proof - 2026-04-08

Proof database: `zonforge_serial_13_alerts`

## Alert row

```text
3|5|suspicious_login|in_progress|analyst@zonforge.local|2|2026-04-08 06:27:47.975+00|2026-04-08 06:29:47.991+00
```

## Alert findings

```text
3|5
3|6
```

## Alert events

```text
3|alert_created||open|{"ruleKey": "suspicious_login", "findingId": "5", "lastSeenAt": "2026-04-08T06:28:47.990Z", "firstSeenAt": "2026-04-08T06:27:47.975Z", "principalKey": "alice@example.com"}
3|alert_grouped|||{"ruleKey": "suspicious_login", "findingId": "6", "lastSeenAt": "2026-04-08T06:29:47.991Z", "principalKey": "alice@example.com"}
3|alert_status_changed|open|in_progress|{"notes": "SERIAL 13 status proof"}
3|alert_assigned|||{"assignedTo": "analyst@zonforge.local", "previousAssignee": null}
3|comment_added|||{"comment": "SERIAL 13 analyst comment proof."}
```

## Detection findings

```text
5|5|suspicious_login|2
6|5|suspicious_login|3
```

Validated properties:

- Detection findings materialized into one grouped alert.
- Alert lifecycle changes persisted in `alert_events`.
- Assignment and analyst comment are stored as independent timeline events.
- Tenant-scoped rows were captured only for tenant `5`.