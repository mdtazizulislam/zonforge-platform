# SERIAL S4 DB And Log Proof

## ingestion_security_events

```text
    event_type    |        reason_code         |    token_prefix    | client_ip |        request_id        |          created_at
------------------+----------------------------+--------------------+-----------+--------------------------+-------------------------------
 replay_detected  | api_duplicate_source_event | zfi_4a51270543b267 | unknown   | 1775619729968-7d1ac252dd | 2026-04-08 03:42:09.980497+00
 anomaly_detected | payload_too_large          | zfi_4a51270543b267 | unknown   | 1775619730012-7409fdd1f1 | 2026-04-08 03:42:10.023953+00
 rate_limited     | token_limit                | zfi_4a51270543b267 | unknown   | 1775619730080-f78e9a1bb0 | 2026-04-08 03:42:10.091414+00
```

Evidence:

- Required security log types were persisted.
- Only token prefix, IP, request id, and reason code were stored; no raw ingestion token or raw payload body was logged.

## ingestion_request_logs

```text
        request_id        |               batch_id               |  status   | accepted_count | rejected_count | payload_bytes |          created_at
--------------------------+--------------------------------------+-----------+----------------+----------------+---------------+-------------------------------
 1775619729928-d0a1e6e2e1 | fcc9b2a7-c4cb-4ec7-a23d-314a45e68fd1 | processed |              1 |              0 |           304 | 2026-04-08 03:42:09.954985+00
 1775619730030-ec255ef38e | fa8e595c-d5c4-49ac-beed-e932c4de865f | processed |              1 |              0 |           326 | 2026-04-08 03:42:10.046091+00
 1775619730054-16739f1cbe | c2fa0219-dccf-45cc-a84f-6dabbf6c3314 | processed |              1 |              0 |           326 | 2026-04-08 03:42:10.072628+00
```

Evidence:

- Accepted batches still flowed through the queue and were marked `processed`.
- Replayed, malformed, oversized, and rate-limited requests did not create queued request rows.

## raw_ingestion_events

```text
         source_event_id         |  status   | error_message |          received_at          |          updated_at
---------------------------------+-----------+---------------+-------------------------------+-------------------------------
 serial-s4-valid-1775619729419   | processed |               | 2026-04-08 03:42:09.963206+00 | 2026-04-08 03:42:09.985348+00
 serial-s4-valid-2-1775619729419 | processed |               | 2026-04-08 03:42:10.062137+00 | 2026-04-08 03:42:10.079001+00
 serial-s4-valid-3-1775619729419 | processed |               | 2026-04-08 03:42:10.074804+00 | 2026-04-08 03:42:10.106197+00
```

## normalized_events total

```text
 total
-------
     3
```

## security event totals

```text
    event_type    | total
------------------+-------
 anomaly_detected |     1
 rate_limited     |     1
 replay_detected  |     1
```

## Security interpretation

- Abuse was blocked before queue enqueue for replay, oversized payload, and rate-limited requests.
- Valid ingestion still normalized successfully three times with no failed ingestion rows required for this proof.
- The service continued operating normally after each rejected request; there was no crash or queue interruption.