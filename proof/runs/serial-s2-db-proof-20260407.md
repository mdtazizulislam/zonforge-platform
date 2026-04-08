# SERIAL S2 DB And Log Proof

## user_sessions step-up fields

```text
session_id                              | user_id | email                                     | step_up_verified_at       | step_up_method | step_up_expires_at        | revoked_at | revoked_reason
----------------------------------------+---------+-------------------------------------------+---------------------------+----------------+---------------------------+------------+---------------
762f0141-0ecd-4d0f-8fda-d33b6cd2a658    | 1       | serial.s2.owner+1775617317645@example.com | 2026-04-08 03:01:59.228+00| password       | 2026-04-08 03:11:59.228+00|            |
7fc7b40c-8605-4cd8-88e8-5c5f2ab08a93    | 2       | serial.s2.viewer+1775617317645@example.com|                           |                |                           |            |
3b66f1fc-7413-4981-9612-e13c0edfb02b    | 3       | serial.s2.analyst+1775617317645@example.com|                          |                |                           |            |
```

## auth_events security rows

```text
event_type               | user_id | error_code          | session_id                             | metadata_json                                                                                                       | created_at
-------------------------+---------+---------------------+----------------------------------------+---------------------------------------------------------------------------------------------------------------------+-------------------------------
forbidden_access_attempt | 1       | STEP_UP_REQUIRED    | 762f0141-0ecd-4d0f-8fda-d33b6cd2a658   | {"action": "team.invite.create", "method": "POST", "message": "Step-up authentication is required to invite team members."} | 2026-04-08 03:01:58.036627+00
step_up_failed           | 1       | invalid_credentials | 762f0141-0ecd-4d0f-8fda-d33b6cd2a658   |                                                                                                                     | 2026-04-08 03:01:58.051879+00
step_up_verified         | 1       |                     | 762f0141-0ecd-4d0f-8fda-d33b6cd2a658   | {"method": "password", "expiresAt": "2026-04-08T03:11:58.282Z"}                                             | 2026-04-08 03:01:58.191945+00
forbidden_access_attempt | 2       | forbidden           | 7fc7b40c-8605-4cd8-88e8-5c5f2ab08a93   | {"action": "team.invite.create", "method": "POST", "message": "Only owners and admins can invite team members.", "currentRole": "viewer", "requiredRoles": ["owner", "admin"]} | 2026-04-08 03:01:58.672039+00
forbidden_access_attempt | 3       | forbidden           | 3b66f1fc-7413-4981-9612-e13c0edfb02b   | {"action": "connector.create", "method": "POST", "message": "Only owners and admins can create connectors.", "currentRole": "analyst", "requiredRoles": ["owner", "admin"]} | 2026-04-08 03:01:58.684954+00
forbidden_access_attempt | 1       | STEP_UP_REQUIRED    | 762f0141-0ecd-4d0f-8fda-d33b6cd2a658   | {"action": "connector.ingestion_token.revoke", "method": "DELETE", "message": "Step-up authentication is required to revoke ingestion credentials."} | 2026-04-08 03:01:59.104553+00
step_up_verified         | 1       |                     | 762f0141-0ecd-4d0f-8fda-d33b6cd2a658   | {"method": "password", "expiresAt": "2026-04-08T03:11:59.228Z"}                                             | 2026-04-08 03:01:59.117502+00
forbidden_access_attempt | 1       | not_found           | 762f0141-0ecd-4d0f-8fda-d33b6cd2a658   | {"action": "team.member.remove", "method": "DELETE", "message": "Team member not found", "membershipId": 4} | 2026-04-08 03:01:59.556891+00
```

## privileged audit rows

```text
event_type                    | user_id | tenant_id | payload_json                                                                                                                               | created_at
-----------------------------+---------+-----------+---------------------------------------------------------------------------------------------------------------------------------------------+-------------------------------
team.invite.created          | 1       | 1         | {"role": "viewer", "email": "serial.s2.viewer+1775617317645@example.com", "inviteId": "1", "expiresAt": "2026-04-15T03:01:58.319Z", "emailStatus": "queued"} | 2026-04-08 03:01:58.329539+00
team.invite.created          | 1       | 1         | {"role": "analyst", "email": "serial.s2.analyst+1775617317645@example.com", "inviteId": "2", "expiresAt": "2026-04-15T03:01:58.350Z", "emailStatus": "queued"} | 2026-04-08 03:01:58.361271+00
team.member.role_updated     | 1       | 1         | {"email": "serial.s2.viewer+1775617317645@example.com", "nextRole": "analyst", "membershipId": 2, "previousRole": "viewer", "targetUserId": 2} | 2026-04-08 03:01:58.78594+00
connector.created            | 1       | 1         | {"name": "Serial S2 AWS Connector", "type": "aws", "status": "pending", "connectorId": "1", "hasStoredSecrets": false} | 2026-04-08 03:01:58.828795+00
connector.ingestion_token_rotated | 1   | 1         | {"connectorId": 1, "tokenPrefix": "zfi_a502b9e32799cb", "connectorName": "Serial S2 AWS Connector", "connectorType": "aws"} | 2026-04-08 03:01:58.870541+00
connector.ingestion_token_revoked | 1   | 1         | {"connectorId": 1, "revokedCount": 1, "connectorName": "Serial S2 AWS Connector", "connectorType": "aws"}                    | 2026-04-08 03:01:59.262978+00
team.member.removed          | 1       | 1         | {"role": "analyst", "email": "serial.s2.analyst+1775617317645@example.com", "membershipId": 3, "targetUserId": 3}         | 2026-04-08 03:01:59.283521+00
connector.deleted            | 1       | 1         | {"name": "Serial S2 AWS Connector", "type": "aws", "connectorId": 1}                                                           | 2026-04-08 03:01:59.612634+00
```

## tenant isolation evidence

- Owner tenant membership mutation on a foreign tenant membership id returned `404 not_found`.
- The denial also persisted `forbidden_access_attempt` with action `team.member.remove` and `membershipId` `4`.