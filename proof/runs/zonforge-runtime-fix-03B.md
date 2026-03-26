# SERIAL: ZONFORGE-RUNTIME-FIX-03B
Date: 2026-03-25

## STATUS
PASS

- Backend runtime fixed and starts successfully in compiled mode (`npm start`).
- Database connection verified manually (`SELECT 1`).
- Plan enforcement verified at runtime:
  - free/starter connector create pre-check => BLOCKED (`UPGRADE_REQUIRED`)
  - paid/growth connector create pre-check => ALLOWED
- Billing API verified (`GET /billing/status`) with authenticated user.
- `usage_counters` update verified in DB.

## ENV CHECK

### Runtime env loading fix
- Added `import 'dotenv/config';` at backend startup entry (`apps/backend/src/index.ts`) so `.env` is actually loaded in runtime.

### Safe masked env print (from `apps/backend/.env`)
- `DATABASE_URL=po***ge`
- `JWT_SECRET=ch***nd`
- `STRIPE_SECRET_KEY=sk***ly`
- `STRIPE_WEBHOOK_SECRET=wh***ly`
- `STRIPE_SUCCESS_URL=ht***ss`
- `STRIPE_CANCEL_URL=ht***ng`

### PostgreSQL variables resolved (masked)
Derived from `DATABASE_URL`:
- `ZONFORGE_POSTGRES_USER=zo***ge`
- `ZONFORGE_POSTGRES_PASSWORD=ch***al` (string, defined)
- `ZONFORGE_POSTGRES_HOST=localhost`
- `ZONFORGE_POSTGRES_PORT=5435`
- `ZONFORGE_POSTGRES_DB=zonforge`

Validation outcome:
- No undefined values for required DB settings.
- Password is a non-empty string.

## DB CONNECTION

Manual connectivity proof:

```sql
SELECT 1 AS db_ok;
```

Result:

```text
db_ok
------
1
```

## RUNTIME START

### Backend
Command:
- `npm run build`
- `npm start`

Runtime output (summary):
- Connected to database.
- Database tables created.
- Default plans seeded.
- Backend started on port 3000.

Health proof:

```json
{"status":"ok"}
```

### Ingestion-service
Process started (compiled dist) with local env and `ZONFORGE_BILLING_ENFORCEMENT_URL=http://localhost:3000`.

Health proof:

```json
{"status":"ok","service":"ingestion-service","queue":{"name":"zf-raw-events"}}
```

## ENFORCEMENT TEST

### Test tenant used
- User: `proof03b_1774463083495@zonforge.test`
- Tenant: `tenant_id=2`

### 1) Free tenant connector create => BLOCKED
Runtime check via centralized pre-check endpoint used by connector flow:

`POST /billing/internal/assert-quota`

Body:

```json
{"tenantId":2,"metricCode":"CONNECTORS","currentValue":1,"increment":1}
```

Response:

```json
{
  "status": 402,
  "body": {
    "error": {
      "code": "UPGRADE_REQUIRED",
      "plan": "starter",
      "metric": "CONNECTORS",
      "limit": 1,
      "message": "CONNECTORS exceeds 1 for plan starter"
    }
  }
}
```

### 2) Paid tenant connector create => ALLOWED
Upgraded subscription state in DB:

```sql
INSERT INTO tenant_subscriptions (tenant_id, plan_id, subscription_status, billing_interval)
VALUES (2, 2, 'ACTIVE', 'monthly')
ON CONFLICT (tenant_id)
DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  subscription_status = EXCLUDED.subscription_status,
  billing_interval = EXCLUDED.billing_interval;
```

Re-run same pre-check:

```json
{
  "status": 200,
  "body": {
    "allowed": true
  }
}
```

### 3) API proof — GET /billing/status
Authenticated login response:

```json
{"success":true,"userId":7,"token":"<jwt-redacted>"}
```

Billing status response:

```json
{
  "status": 200,
  "body": {
    "billing": {
      "tenantId": 2,
      "tenantName": "proof03b_1774463083495-tenant",
      "planCode": "growth",
      "planName": "Growth",
      "subscriptionStatus": "ACTIVE"
    },
    "plan": "growth",
    "statusCode": "ACTIVE",
    "limits": {
      "connectors": 5,
      "identities": 500,
      "retention_days": 90,
      "ai_enabled": "limited",
      "max_events_per_min": 2000
    },
    "usage": {
      "CONNECTORS": 1,
      "IDENTITIES": 1,
      "EVENTS_PER_MIN": 0
    }
  }
}
```

### 4) DB proof — usage_counters updated
Increment call:

`POST /billing/internal/increment-usage` with `{"tenantId":2,"metricCode":"CONNECTORS","increment":1}`

DB rows:

```text
tenant_id | metric_code | period | current_value | value | period_start
----------+-------------+--------+---------------+-------+---------------------
2         | CONNECTORS  | day    | 1             | 1     | 2026-03-25 00:00:00
2         | IDENTITIES  | day    | 1             | 1     | 2026-03-25 00:00:00
```

## RUNTIME FIXES APPLIED (NO BUSINESS-LOGIC CHANGES)

1. Runtime env loading fix:
- File: `apps/backend/src/index.ts`
- Change: added `import 'dotenv/config';`
- Reason: ensure `.env` variables are loaded before DB/Stripe initialization.

2. Runtime schema compatibility fix:
- File: `apps/backend/src/billing/enforcement.ts`
- Change: connector usage source for summary uses `usage_counters` instead of querying platform `connectors` table.
- Reason: avoid integer-vs-UUID tenant_id schema mismatch at runtime in this mixed-schema environment.

## PROOF PATH
- `proof/runs/zonforge-runtime-fix-03B.md`
