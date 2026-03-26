# SERIAL: ZONFORGE-PLAN-ENFORCEMENT-03
Date: 2026-03-25
Timestamp: 2026-03-25 13:58:23-04:00

## 1) Objective
Implement centralized tenant plan enforcement with additive-only changes, strict quota/feature checks, and explicit upgrade signaling.

## 2) Implementation Scope Completed

### 2.1 Central plan model
- Added apps/backend/src/billing/planDefinitions.ts
- Canonical limits implemented:
  - starter: connectors=1, identities=50, retention_days=7, ai_enabled=false, max_events_per_min=500
  - growth: connectors=5, identities=500, retention_days=90, ai_enabled=limited, max_events_per_min=2000
  - business: connectors=20, identities=2000, retention_days=180, ai_enabled=full, max_events_per_min=10000
  - enterprise: contracted limits and 365-day retention

### 2.2 Subscription resolution
- Added apps/backend/src/billing/subscriptionService.ts
- Implemented normalized subscription status handling and tenant plan resolution.

### 2.3 Centralized enforcement layer
- Added apps/backend/src/billing/enforcement.ts
- Implemented:
  - assertFeatureAllowed
  - assertQuota
  - incrementUsage
  - getUsageSummary
  - UpgradeRequiredError with structured response payload

### 2.4 Usage tracking (additive)
- Updated apps/backend/src/db.ts
- Added additive columns in usage_counters:
  - metric
  - period
  - value
- Added ALTER TABLE guards (IF NOT EXISTS) for backward compatibility.

### 2.5 Wiring to target paths
- Connector quota enforcement + usage increment:
  - apps/ingestion-service/src/services/connector.service.ts
  - apps/ingestion-service/src/routes/connector.routes.ts
- Ingestion rate enforcement + usage increment:
  - apps/ingestion-service/src/services/ingestion.service.ts
  - apps/ingestion-service/src/services/plan-enforcement.client.ts
- Identity quota usage increment on register:
  - apps/backend/src/index.ts
- AI/export feature gating:
  - apps/backend/src/index.ts (api/ai/analyze and api/reports/export)

### 2.6 Stripe sync improvements
- Updated apps/backend/src/stripe.ts
- Added plan code resolution from metadata and price mapping.
- Normalized status persistence to ACTIVE / PAST_DUE style values.

### 2.7 Billing APIs
- Updated apps/backend/src/index.ts
- Added/extended:
  - GET /billing/status
  - GET /billing/usage
  - POST /billing/internal/assert-quota
  - POST /billing/internal/assert-feature
  - POST /billing/internal/increment-usage

### 2.8 Dashboard UX
- Updated apps/web-dashboard/src/pages/ConnectorsPage.tsx
- Added upgrade-required warning state in connector create modal flow.

## 3) Build Proof

### 3.1 Backend build
Command:
- npm run build (apps/backend)

Result:
- > @zonforge/backend@1.0.0 build
- > tsc
- Success (no TypeScript errors shown)

### 3.2 Ingestion build
Command:
- npm run build (apps/ingestion-service)

Result:
- > @zonforge/ingestion-service@0.1.0 build
- > tsc
- Success (no TypeScript errors shown)

### 3.3 Dashboard build
Command:
- npm run build (apps/web-dashboard)

Result:
- vite production build completed successfully
- Dist artifacts generated, including ConnectorsPage and BillingPage bundles

## 4) Runtime Proof Attempts and Blockers

### 4.1 Backend dev startup attempt
Command:
- npm run dev (apps/backend)

Observed error:
- Error: tsx must be loaded with --import instead of --loader
- npm lifecycle dev failed

### 4.2 Backend compiled startup attempt
Command:
- npm start (apps/backend)

Observed error:
- Database initialization failed
- Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
- npm lifecycle start failed

Conclusion:
- Runtime API/DB enforcement scenario matrix could not be fully executed in this session because backend startup is blocked by environment/runtime configuration issues.

## 5) Checklist Status Against SERIAL

1. Central plan model: DONE
2. Subscription resolution: DONE
3. Central enforcement layer: DONE
4. Usage tracking additive changes: DONE
5. Wiring into connector/identity/ingestion/AI/export: DONE (implemented)
6. Stripe webhook sync: DONE (implemented improvement)
7. Billing status/usage APIs: DONE
8. Dashboard usage/upgrade UX: DONE (connector upgrade signal)
9. Local + E2E runtime proof: PARTIAL (build proof complete; runtime blocked by startup/env issues)
10. Proof artifact file: DONE (this file)

## 6) Required Next Execution Steps (to close runtime proof fully)
1. Fix backend dev script for current Node runtime (replace loader usage for tsx).
2. Provide valid DB credentials/env so backend can initialize DB connection.
3. Re-run scenario matrix:
   - starter tenant connector cap reached returns UPGRADE_REQUIRED
   - upgraded plan allows additional connector
   - starter AI endpoint blocked, growth/business allowed
   - billing/status and billing/usage reflect current usage and plan
   - usage_counters increments verified via SQL
   - tenant_subscriptions status/plan updated from webhook simulation
4. Append API payloads + SQL outputs to this proof file after successful runtime execution.
