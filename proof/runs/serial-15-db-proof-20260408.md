# SERIAL 15 DB Proof - 2026-04-08

Proof database: `zonforge_serial_15_investigations`

## investigations

```text
1|closed|2|user|alice@example.com
2|in_progress|||
```

Columns captured:

- `id`
- `status`
- `linked_alert_id`
- `primary_entity_type`
- `primary_entity_key`

## investigation_alerts

```text
1|1
1|2
```

Columns captured:

- `investigation_id`
- `alert_id`

## investigation_evidence

```text
alert|2
finding|2
risk|4
```

Grouped counts by `source_type`.

## investigation_notes

```text
1|4
2|1
```

Grouped counts by `investigation_id`.

## investigation_events

```text
investigation_alert_linked|1
investigation_created|2
investigation_evidence_added|1
investigation_note_added|3
investigation_status_changed|3
```

Grouped counts by `event_type`.

Validated properties:

- One investigation linked multiple alerts through `investigation_alerts`.
- Notes, evidence, and status changes all produced timeline rows.
- The workflow record and the AI compatibility record stayed in sync.