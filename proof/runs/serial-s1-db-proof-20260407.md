# SERIAL S1 DB Proof

## user_sessions rows

```text
session_id                              | tenant_id | user_id | email                                      | browser | operating_system | created_ip | last_ip   | revoked_at                    | revoked_reason | created_at
----------------------------------------+-----------+---------+--------------------------------------------+---------+------------------+------------+-----------+-------------------------------+----------------+-------------------------------
b20d447d-2c16-4d93-96d3-a4ea70ecc34c    | 5         | 5       | serial.s1.owner2+1775615442782@example.com | Unknown | Windows          | 10.0.0.33  | 10.0.0.33 |                               |                | 2026-04-08 02:30:44.537884+00
e795c57d-c125-4e9c-ad2b-d970e5ca6a29    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | Unknown | Windows          | 10.0.0.31  | 10.0.0.31 |                               |                | 2026-04-08 02:30:44.374141+00
c8f1856a-e20a-480b-9d9c-3a999e0f2e51    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | Unknown | Windows          | 10.0.0.29  | 10.0.0.29 | 2026-04-08 02:30:44.36182+00  | logout_all     | 2026-04-08 02:30:44.197519+00
34b0bb52-8729-49eb-b5fd-c3d5291a7b25    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | Unknown | Windows          | 10.0.0.28  | 10.0.0.28 | 2026-04-08 02:30:44.36182+00  | logout_all     | 2026-04-08 02:30:44.067687+00
1dffda1c-93cd-4fc0-baa9-f93a7170eacc    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | Unknown | Windows          | 10.0.0.26  | 10.0.0.26 | 2026-04-08 02:30:44.055365+00 | logout         | 2026-04-08 02:30:43.930167+00
e8ff85a8-e740-409d-9807-f5823d252360    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | Unknown | Windows          | 10.0.0.22  | 10.0.0.24 | 2026-04-08 02:30:44.36182+00  | logout_all     | 2026-04-08 02:30:43.638605+00
58d3f61b-f0cd-45e0-a3fe-2aa633a3f5cb    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | Unknown | Windows          | 10.0.0.21  | 10.0.0.21 | 2026-04-08 02:30:44.36182+00  | logout_all     | 2026-04-08 02:30:43.350710+00
0824d8f0-11ba-449e-bacb-2c9b33afd6f1    | 5         | 5       | serial.s1.owner2+1775615442782@example.com | Unknown | Windows          | 10.0.0.12  | 10.0.0.12 |                               |                | 2026-04-08 02:30:43.046842+00
7a37f797-cc83-4989-aed0-00b97f3da549    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | Unknown | Windows          | 10.0.0.11  | 10.0.0.11 | 2026-04-08 02:30:44.36182+00  | logout_all     | 2026-04-08 02:30:42.813582+00
```

## revoked session rows

```text
session_id                              | tenant_id | user_id | email                                      | revoked_at                    | revoked_reason
----------------------------------------+-----------+---------+--------------------------------------------+-------------------------------+---------------
c8f1856a-e20a-480b-9d9c-3a999e0f2e51    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | 2026-04-08 02:30:44.36182+00  | logout_all
7a37f797-cc83-4989-aed0-00b97f3da549    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | 2026-04-08 02:30:44.36182+00  | logout_all
58d3f61b-f0cd-45e0-a3fe-2aa633a3f5cb    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | 2026-04-08 02:30:44.36182+00  | logout_all
e8ff85a8-e740-409d-9807-f5823d252360    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | 2026-04-08 02:30:44.36182+00  | logout_all
34b0bb52-8729-49eb-b5fd-c3d5291a7b25    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | 2026-04-08 02:30:44.36182+00  | logout_all
1dffda1c-93cd-4fc0-baa9-f93a7170eacc    | 4         | 4       | serial.s1.owner1+1775615442782@example.com | 2026-04-08 02:30:44.055365+00 | logout
```

## auth_events rows

```text
event_type                    | tenant_id | user_id | email                                      | session_id                             | error_code                   | created_at
-----------------------------+-----------+---------+--------------------------------------------+----------------------------------------+------------------------------+-------------------------------
refresh_failed               |           |         |                                            |                                        | invalid_refresh_token        | 2026-04-08 02:31:44.002933+00
login_success                | 5         | 5       | serial.s1.owner2+1775615442782@example.com | b20d447d-2c16-4d93-96d3-a4ea70ecc34c   |                              | 2026-04-08 02:30:44.668690+00
login_success                | 4         | 4       | serial.s1.owner1+1775615442782@example.com | e795c57d-c125-4e9c-ad2b-d970e5ca6a29   |                              | 2026-04-08 02:30:44.516279+00
logout_all                   | 4         | 4       | serial.s1.owner1+1775615442782@example.com |                                        |                              | 2026-04-08 02:30:44.361820+00
logout                       | 4         | 4       | serial.s1.owner1+1775615442782@example.com | 1dffda1c-93cd-4fc0-baa9-f93a7170eacc   |                              | 2026-04-08 02:30:44.055365+00
refresh_success              | 4         | 4       | serial.s1.owner1+1775615442782@example.com | e8ff85a8-e740-409d-9807-f5823d252360   |                              | 2026-04-08 02:30:43.908644+00
refresh_token_reuse_detected | 6         | 6       | serial.s1.reuse+1775615591689@example.com  | 5533ec17-cf46-4be2-8bbd-f06149578cd6   | refresh_token_reuse_detected | 2026-04-08 02:33:12.275763+00
```

## tenant isolation evidence

- Active user 1 session: `e795c57d-c125-4e9c-ad2b-d970e5ca6a29` on tenant `4`
- Active user 2 sessions: `b20d447d-2c16-4d93-96d3-a4ea70ecc34c`, `0824d8f0-11ba-449e-bacb-2c9b33afd6f1` on tenant `5`
- Cross-user session revoke returned `404 session_not_found` because the delete path is tenant-scoped before revocation is evaluated.

## focused reuse event proof

```text
event_type                    | tenant_id | user_id | email                                     | session_id                             | error_code                   | created_at
-----------------------------+-----------+---------+-------------------------------------------+----------------------------------------+------------------------------+-------------------------------
refresh_token_reuse_detected | 6         | 6       | serial.s1.reuse+1775615591689@example.com | 5533ec17-cf46-4be2-8bbd-f06149578cd6   | refresh_token_reuse_detected | 2026-04-08 02:33:12.275763+00
refresh_success              | 6         | 6       | serial.s1.reuse+1775615591689@example.com | 5533ec17-cf46-4be2-8bbd-f06149578cd6   |                              | 2026-04-08 02:33:12.262193+00
login_success                | 6         | 6       | serial.s1.reuse+1775615591689@example.com | 5533ec17-cf46-4be2-8bbd-f06149578cd6   |                              | 2026-04-08 02:33:12.208795+00
```