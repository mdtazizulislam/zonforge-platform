# SERIAL S3 DB And Log Proof

## connector_configs secret metadata

```text
 id | tenant_id |           name           |     type      | secret_storage_provider |                         secret_reference                          |                        secret_fingerprint                        | secret_key_version |   secret_last_rotated_at   | secret_rotation_count
----+-----------+--------------------------+---------------+-------------------------+-------------------------------------------------------------------+------------------------------------------------------------------+--------------------+----------------------------+----------------------
  2 |         3 | Serial S3 M365 Connector | microsoft_365 | database_encrypted      | database_encrypted:connector:654427bd-3c37-4fc2-abd0-1c46e02c4817 | 67bd9ada3823552444a055625717e1b67afcbb9990dc6a0b61fb3448b07edef5 |                  1 | 2026-04-08 03:25:33.184+00 |                     2
```

## connector_ingestion_tokens rotation history

```text
 id | connector_id |    token_prefix    |  token_hash_prefix   | status  |          rotated_at           |         last_used_at          |          revoked_at
----+--------------+--------------------+----------------------+---------+-------------------------------+-------------------------------+-------------------------------
  3 |            2 | zfi_6fc065f74d8131 | da34de4ea31f75beed35 | revoked | 2026-04-08 03:25:32.366919+00 |                               | 2026-04-08 03:25:33.211396+00
  4 |            2 | zfi_a1728d6dc6abfb | de1f2dd6c7480fe281da | active  | 2026-04-08 03:25:33.21486+00  | 2026-04-08 03:25:33.234904+00 |
```

Evidence:

- Tokens remain hash-only at rest; only hash prefixes were queried for proof.
- The previously active ingestion token was revoked when the alias rotation route issued the new token.
- The new token recorded both `rotated_at` and `last_used_at` after successful ingestion.

## auth_events security rows

```text
        event_type        | user_id |    error_code    |                                                                                      metadata_json                                                                                       |          created_at
--------------------------+---------+------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------
 step_up_verified         |       4 |                  | {"method": "password", "expiresAt": "2026-04-08T03:35:33.150Z"}                                                                                                                          | 2026-04-08 03:25:33.061838+00
 forbidden_access_attempt |       4 | STEP_UP_REQUIRED | {"action": "connector.secret.rotate", "method": "POST", "message": "Step-up authentication is required to rotate connector secrets."}                                                    | 2026-04-08 03:25:33.047844+00
 forbidden_access_attempt |       6 | not_found        | {"action": "connector.security.read", "method": "GET", "message": "Connector not found", "connectorId": 2}                                                                               | 2026-04-08 03:25:32.825904+00
 forbidden_access_attempt |       5 | forbidden        | {"action": "connector.secret.rotate", "method": "POST", "message": "Only owners and admins can rotate connector secrets.", "currentRole": "viewer", "requiredRoles": ["owner", "admin"]} | 2026-04-08 03:25:32.59084+00
 step_up_verified         |       4 |                  | {"method": "password", "expiresAt": "2026-04-08T03:35:32.285Z"}                                                                                                                          | 2026-04-08 03:25:32.188904+00
 forbidden_access_attempt |       4 | STEP_UP_REQUIRED | {"action": "connector.create", "method": "POST", "message": "Step-up authentication is required to create connectors."}                                                                  | 2026-04-08 03:25:32.17641+00
```

## tenant audit rows

```text
            event_type             | user_id | tenant_id |                                                                                                   payload_json                                                                                                   |          created_at
-----------------------------------+---------+-----------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------
 connector.security_viewed         |       4 |         3 | {"name": "Serial S3 M365 Connector", "type": "microsoft_365", "connectorId": 2}                                                                                                                                  | 2026-04-08 03:25:33.263254+00
 connector.ingestion_token_rotated |       4 |         3 | {"connectorId": 2, "tokenPrefix": "zfi_a1728d6dc6abfb", "connectorName": "Serial S3 M365 Connector", "connectorType": "microsoft_365"}                                                                           | 2026-04-08 03:25:33.2191+00
 connector.secret_rotated          |       4 |         3 | {"name": "Serial S3 M365 Connector", "type": "microsoft_365", "connectorId": 2, "secretReference": "database_encrypted:connector:654427bd-3c37-4fc2-abd0-1c46e02c4817", "storageProvider": "database_encrypted"} | 2026-04-08 03:25:33.187523+00
 connector.ingestion_token_rotated |       4 |         3 | {"connectorId": 2, "tokenPrefix": "zfi_6fc065f74d8131", "connectorName": "Serial S3 M365 Connector", "connectorType": "microsoft_365"}                                                                           | 2026-04-08 03:25:32.372309+00
 connector.security_viewed         |       4 |         3 | {"name": "Serial S3 M365 Connector", "type": "microsoft_365", "connectorId": 2}                                                                                                                                  | 2026-04-08 03:25:32.335784+00
 connector.created                 |       4 |         3 | {"name": "Serial S3 M365 Connector", "type": "microsoft_365", "status": "pending", "connectorId": "2", "hasStoredSecrets": true}                                                                                 | 2026-04-08 03:25:32.320422+00
```

## ingestion_request_logs evidence

```text
        request_id        |               batch_id               | connector_id | accepted_count | rejected_count |  status   |          created_at
--------------------------+--------------------------------------+--------------+----------------+----------------+-----------+-------------------------------
 1775618733232-fd8f671064 | a7897504-2488-4157-b381-03f8c10abaac |            2 |              1 |              0 | processed | 2026-04-08 03:25:33.242322+00
```

## Isolation evidence

- Viewer secret rotation attempt returned `403 forbidden` and persisted `forbidden_access_attempt` with action `connector.secret.rotate`.
- Foreign-tenant connector security read returned `404 not_found` and persisted `forbidden_access_attempt` with action `connector.security.read`.
- Owner secret rotation without a live step-up window returned `403 STEP_UP_REQUIRED` and persisted the corresponding security event.