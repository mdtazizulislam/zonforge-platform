# ZonForge Sentinel v4.6.0 — Local Dev Boot Fix
**Date:** 2026-03-19  
**Engineer:** DevOps Fix Agent  
**OS:** Windows / PowerShell  
**Node:** v20.19.4  
**npm:** 11.7.0

---

## STEP 0 — BASELINE DISCOVERY

```
pwd  →  C:\Users\vitor\Downloads\zonforge-sentinel-v4.6.0_1\zonforge-platform
git  →  fatal: not a git repository (no .git — standalone archive)
```

### npm run (available scripts at baseline)
```
build          turbo run build
dev            turbo run dev --parallel
dev:backend    turbo run dev --filter=./apps/api-gateway... --parallel
dev:dashboard  turbo run dev --filter=@zonforge/web-dashboard
dev:landing    turbo run dev --filter=@zonforge/landing-web
dev:mobile     turbo run dev --filter=@zonforge/mobile-app
build:backend  turbo run build --filter=./apps/api-gateway...
build:dashboard turbo run build --filter=@zonforge/web-dashboard
build:packages turbo run build --filter=./packages/*
build:required  [all 19 required packages+services]
dev:required    npm run build:required && turbo run dev --parallel [required filters]
db:migrate / db:generate / db:studio
infra:up / infra:down / infra:logs
```
> **NOTE:** Root scripts `dev:backend`, `dev:dashboard`, `dev:landing`, `dev:mobile`,
> `build:required`, `dev:required` all ALREADY EXIST in package.json. No new root scripts needed.

### Infrastructure (Docker)
```
zf-postgres    postgres:16-alpine    port 5432   STATUS: healthy
zf-redis       redis:7-alpine        port 6379   STATUS: healthy
zf-clickhouse  clickhouse:24.3       port 8123   STATUS: healthy
```

---

## STEP 1 — ROOT CAUSE CLASSIFICATION TABLE

| Package / Service            | Required? | build? | dev? | dist/index.js present? | Failure Class                          | Action Needed          |
|------------------------------|-----------|--------|------|------------------------|----------------------------------------|------------------------|
| @zonforge/shared-types       | YES       | YES    | N/A  | YES                    | none                                   | none                   |
| @zonforge/logger             | YES       | YES    | N/A  | YES                    | none                                   | none                   |
| @zonforge/config             | YES       | YES    | N/A  | YES                    | none                                   | none                   |
| @zonforge/auth-utils         | YES       | YES    | N/A  | YES                    | none                                   | none                   |
| @zonforge/event-schema       | YES       | YES    | N/A  | YES                    | none                                   | none                   |
| @zonforge/db-client          | YES       | YES    | N/A  | YES                    | none                                   | none                   |
| @zonforge/ingestion-service  | YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/normalization-worker| YES      | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/detection-engine   | YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/threat-intel-service| YES      | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/correlation-engine | YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/risk-scoring-engine| YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/alert-service      | YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/api-gateway        | YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/behavioral-ai      | YES       | YES    | YES  | YES                    | **BullMQ queue name contains ':'**     | Fix queue name         |
| @zonforge/alert-triage-ai    | YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/ai-soc-analyst     | YES       | YES    | YES  | YES                    | **BullMQ queue name contains ':'**     | Fix queue name         |
| @zonforge/security-assistant | YES       | YES    | YES  | YES                    | none                                   | none                   |
| @zonforge/web-dashboard      | YES       | YES    | YES  | N/A (Vite)             | none                                   | none                   |
| collectors/m365-collector    | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/auth-service            | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/sso-service             | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/board-reports           | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/redteam-simulation      | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/threat-hunting          | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/compliance-reports      | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/deception-tech          | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/supply-chain-intel      | NO        | YES    | YES  | NO                     | missing build artifact (BullMQ ':'?)   | fix + build            |
| apps/playbook-engine         | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/predictive-intel        | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/regulatory-ai           | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/billing-service         | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/tenant-service          | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/mssp-console            | NO        | YES    | YES  | NO                     | missing build artifact (not required)  | build before use       |
| apps/anomaly-service         | NO        | N/A    | N/A  | N/A (Python)           | Python service - different toolchain   | separate setup         |
| apps/mobile-app              | NO        | NO     | NO   | N/A (Expo)             | Expo app - different toolchain         | separate setup         |

**NOTE on env path:** All `apps/*/dev` and `collectors/*/dev` scripts use
`--env-file=../../.env.local`. All checked services sit exactly 2 directories
deep from the monorepo root, so this path resolves correctly to
`zonforge-platform/.env.local`. The `m365-collector` env path is also correct.

---

## STEP 2 — FIXES APPLIED

### Fix 1: `apps/behavioral-ai/src/index.ts` — BullMQ queue name
**Line 25:** BullMQ v3+ rejects queue names containing `:`.

```diff
- const PROFILE_QUEUE = 'zf:behavioral-profile-builds'
+ const PROFILE_QUEUE = 'zf-behavioral-profile-builds'
```

**Root cause:** BullMQ `QueueBase` constructor throws `Error: Queue name cannot
contain :` when a queue name includes a colon character. The `zf:` namespace
prefix convention was borrowed from Redis key naming, but BullMQ uses `:` as an
internal separator for its own key namespacing in Redis.

### Fix 2: `apps/ai-soc-analyst/src/index.ts` — BullMQ queue name
**Line 25:** Same class of bug.

```diff
- const INVESTIGATION_QUEUE = 'zf:ai-investigations'
+ const INVESTIGATION_QUEUE = 'zf-ai-investigations'
```

**NOTE:** Redis pub/sub channels like `'zf:alerts:created'`, `'zf:events:normalized'`
etc. are NOT affected — Redis channel names allow colons. Only BullMQ `Queue()`
constructors reject them.

**No other required services were affected.**

---

## STEP 3 — ENV PATH ANALYSIS

All required services use `dev: node --watch --env-file=../../.env.local dist/index.js`
Running directory: `apps/<service>/` (2 levels deep from repo root)
Resolved path: `zonforge-platform/.env.local` ✅ (file confirmed present)

Collectors use the same `../../.env.local` pattern from `collectors/<name>/` which
also resolves correctly to the repo root. **No env path fixes required.**

---

## STEP 4 — BUILD PROOF

### Shared packages build (all cached — previously built)
```
turbo run build --filter=./packages/*
 Tasks:    6 successful, 6 total
 Cached:   6 cached, 6 total
 Time:     482ms >>> FULL TURBO
```

### Core runtime services build (all cached)
```
turbo run build --filter=@zonforge/ingestion-service ... (8 services)
 Tasks:    15 successful, 15 total
 Cached:   15 cached, 15 total
 Time:     460ms >>> FULL TURBO
```

### AI services rebuild (forced — after source fix)
```
turbo run build --filter=@zonforge/behavioral-ai --filter=@zonforge/ai-soc-analyst --force
 @zonforge/behavioral-ai:build: > tsc  ✅
 @zonforge/ai-soc-analyst:build: > tsc  ✅
 Tasks:    7 successful, 7 total
 Cached:   0 cached, 7 total
 Time:     34.252s
```

---

## STEP 5 — SERVICE STARTUP

All 12 required services started via `Start-Job` using:
```powershell
Set-Location apps/<service>
node --env-file=../../.env.local dist/index.js
```

All 12 jobs reached `State=Running`. No jobs in `Completed` (failed) state
after the queue name fixes.

BullMQ Redis warning (non-fatal, expected in local dev):
```
IMPORTANT! Eviction policy is allkeys-lru. It should be "noeviction"
```
This is a BullMQ advisory for Redis memory management. **Does not prevent startup.**

---

## STEP 6 — HEALTH CHECK PROOF

**Timestamp: 2026-03-19 14:21:22**

```
PASS :3000  svc=zonforge-api-gateway    status=ok
PASS :3001  svc=ingestion-service       status=ok
PASS :3002  svc=normalization-worker    status=ok
PASS :3003  svc=detection-engine        status=ok
PASS :3005  svc=threat-intel-service    status=ok
PASS :3006  svc=correlation-engine      status=ok
PASS :3007  svc=risk-scoring-engine     status=ok
PASS :3008  svc=alert-service           status=ok
PASS :3015  svc=ai-soc-analyst          status=ok
PASS :3020  svc=behavioral-ai           status=ok
PASS :3021  svc=alert-triage-ai         status=ok
PASS :3022  svc=security-assistant      status=ok

PASS :5173  web-dashboard  HTTP 200
```

**Result: 13/13 PASS**

---

## STEP 7 — SUMMARY

### What was broken
Two required AI services (`behavioral-ai`, `ai-soc-analyst`) crashed at startup
with `Error: Queue name cannot contain :` from BullMQ.

### Exact root cause
BullMQ v3+ prohibits colons in queue names because BullMQ uses `:` as an
internal Redis key separator. Both services defined their queue names with the
`zf:` prefix (matching the Redis key namespace convention) which is incompatible
with BullMQ.

### Exact files changed

| File | Change |
|------|--------|
| `apps/behavioral-ai/src/index.ts` | L25: `'zf:behavioral-profile-builds'` → `'zf-behavioral-profile-builds'` |
| `apps/ai-soc-analyst/src/index.ts` | L25: `'zf:ai-investigations'` → `'zf-ai-investigations'` |

**Total: 2 files, 1 line change each. No other files modified.**

### Why each change was necessary
BullMQ `QueueBase` constructor performs a regex validation on the queue name and
throws synchronously if `:` is present. This caused `process.exit(1)` before
the HTTP server could bind to its port, making both services unreachable.

### Remaining optional-service issues
- **`apps/auth-service`, `sso-service`, `board-reports`, etc. (14+ optional apps):**
  `dist/index.js` not present — needs `npm run build` per service before `dev` can run.
- **`apps/supply-chain-intel`:** Has `const SCAN_QUEUE = 'zf:supply-chain-scans'` —
  same BullMQ colon issue. Not required for minimum platform success but will fail
  if started without fixing.
- **`apps/anomaly-service`:** Python service (pyproject.toml) — requires separate
  Python toolchain setup.
- **`apps/mobile-app`:** Expo app — requires `npx expo start` workflow.
- **BullMQ Redis eviction warning:** All queue-using services warn about
  `allkeys-lru` policy. Non-blocking. Fix with:
  `redis-cli CONFIG SET maxmemory-policy noeviction`

---

## FINAL VERDICT

```
REQUIRED LOCAL PLATFORM PATH: ✅ PASS
  - All 6 shared packages: BUILT ✅
  - All 8 core runtime services: RUNNING ✅ (ports 3000-3008)
  - All 4 required AI services: RUNNING ✅ (ports 3015, 3020-3022)
  - Web dashboard: RUNNING ✅ (port 5173, HTTP 200)
  - All 12 health-check ports: PASS ✅
  - .env.local path resolution: CORRECT ✅

OPTIONAL SERVICES: PARTIAL
  - ~14 non-required apps: NOT BUILT (dist/index.js absent)
  - supply-chain-intel: BullMQ colon issue (same fix pattern applies)
  - anomaly-service: Python toolchain needed
  - mobile-app: Expo toolchain needed
```

### To run the required platform path from scratch:
```powershell
cd zonforge-platform
npm run build:required   # build all required packages and services
npm run dev:required     # starts all required services in watch mode
# web-dashboard starts automatically via dev:required (Vite)
```
