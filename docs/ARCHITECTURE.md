# ZonForge Sentinel Architecture

## Scope

This document describes the verified local architecture for ZonForge Sentinel v4.6.0 and how required services interact in the minimum working platform path.

## High-Level Components

1. Shared packages (`packages/*`): types, config, logger, auth middleware, DB client, event schema.
2. Core runtime services (`apps/*`): ingestion, normalization, detection, threat intel, correlation, risk scoring, alerts, API gateway.
3. AI services (`apps/*`): behavioral AI, alert triage AI, AI SOC analyst, security assistant.
4. UI (`apps/web-dashboard`): operator dashboard for local development and demonstration.
5. Infrastructure (`docker-compose.yml`): PostgreSQL, Redis, ClickHouse.

## Required Runtime Data Flow

```text
Collectors / Clients
        |
        v
+-------------------+      +------------------------+
| ingestion-service | ---> | normalization-worker   |
+-------------------+      +------------------------+
                                   |
                                   v
                        +------------------------+
                        | detection-engine       |
                        +------------------------+
                              |             |
                              |             v
                              |      +------------------------+
                              |      | threat-intel-service   |
                              |      +------------------------+
                              v
                        +------------------------+
                        | correlation-engine     |
                        +------------------------+
                                   |
                                   v
                        +------------------------+
                        | risk-scoring-engine    |
                        +------------------------+
                                   |
                                   v
                        +------------------------+
                        | alert-service          |
                        +------------------------+
                                   |
          +------------------------+-------------------------+
          v                        v                         v
+------------------+    +------------------+    +-------------------+
| alert-triage-ai  |    | ai-soc-analyst   |    | security-assistant|
+------------------+    +------------------+    +-------------------+
          |
          v
+------------------+
| api-gateway      | <---- web-dashboard
+------------------+
```

## Service Boundaries

- API gateway is the public entry point for local API usage and route aggregation.
- Core services focus on pipeline execution and scoring lifecycle.
- AI services consume platform context and generate triage/investigation outcomes.
- Shared packages define contracts and cross-service primitives.

## Infrastructure Dependencies

- PostgreSQL: transactional and relational service data.
- Redis: queue/state/cache substrate for runtime coordination.
- ClickHouse: high-volume event analytics and hunt-oriented workloads.

## Local Validation Baseline

Reference validated boot and health checks:

- `proof/runs/2026-03-19_local-dev-boot-fix.md`
- `docs/VERIFICATION_INDEX.md`
