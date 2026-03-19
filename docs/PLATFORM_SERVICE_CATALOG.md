# ZonForge Sentinel — Platform Service Catalog

**Version:** 4.6.0  
**Classification:** Internal Technical Reference  
**Generated from:** Live repository scan — `apps/`, `packages/`, `collectors/`, `infra/`

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Core Security Pipeline](#2-core-security-pipeline)
3. [AI Intelligence Services](#3-ai-intelligence-services)
4. [Advanced Defense Services](#4-advanced-defense-services)
5. [Security Operations Services](#5-security-operations-services)
6. [Platform Services](#6-platform-services)
7. [Data Collectors](#7-data-collectors)
8. [Shared Packages](#8-shared-packages)
9. [Dashboard & User Interfaces](#9-dashboard--user-interfaces)
10. [Service Dependency Map](#10-service-dependency-map)
11. [Full Feature List](#11-full-feature-list)
12. [Product Category](#12-product-category)
13. [Final Summary](#13-final-summary)

---

## 1. Platform Overview

### What ZonForge Sentinel Is

ZonForge Sentinel is an **AI-native, cloud-delivered cybersecurity platform** that provides continuous threat detection, autonomous incident investigation, and automated response across cloud and SaaS environments. It is designed to replace the combination of traditional SIEM, EDR, and SOC analyst workflows with a single, AI-first platform.

The platform ingests security events from cloud identity providers (Microsoft 365 / Entra ID, Google Workspace) and cloud infrastructure (AWS CloudTrail), normalizes them to the **OCSF (Open Cybersecurity Schema Framework)** standard, evaluates them against a library of MITRE ATT&CK-mapped detection rules, and routes confirmed threats to an autonomous AI SOC analyst powered by Anthropic's Claude model.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                                  │
│  React 18 Dashboard · Admin Dashboard · Public Website + Chat       │
├─────────────────────────────────────────────────────────────────────┤
│  API GATEWAY  (Port 3000)                                           │
│  JWT auth · rate limiting · routing · OpenAPI spec                  │
├──────────────┬──────────────────────────────────────────────────────┤
│  DETECTION   │  AI INTELLIGENCE LAYER                               │
│  PIPELINE    │  Behavioral AI · Triage AI · Security Assistant      │
│  Ingest →    │  Predictive Threat · Benchmarking                    │
│  Normalize → ├──────────────────────────────────────────────────────┤
│  Enrich →    │  ADVANCED DEFENSE                                    │
│  Detect →    │  Red Team · Digital Twin · Deception Grid            │
│  Correlate → │  Supply Chain · Regulatory AI                        │
│  Risk →      ├──────────────────────────────────────────────────────┤
│  Alert       │  SOC OPERATIONS                                      │
│              │  Playbooks · Threat Hunting · Compliance · MSSP      │
├──────────────┴──────────────────────────────────────────────────────┤
│  DATA LAYER                                                          │
│  PostgreSQL 16 · ClickHouse 24.3 · Redis 7.2 · AWS S3              │
├─────────────────────────────────────────────────────────────────────┤
│  EVENT QUEUE LAYER (BullMQ / Redis)                                 │
│  zf:raw-events · zf:normalized-events · zf:detection-signals        │
│  zf:alert-notifications · zf:llm-narratives · zf:playbook-executions│
└─────────────────────────────────────────────────────────────────────┘
```

### Key Technical Properties

| Property | Value |
|---|---|
| Event Schema Standard | OCSF (Open Cybersecurity Schema Framework) |
| Queue Technology | BullMQ over Redis — persistent, prioritized |
| AI Model | Anthropic claude-sonnet-4-6 (tool-use agentic loop) |
| Detection Mode | Dual: event-triggered + 5-minute scheduled sweep |
| Deployment | Docker Compose (dev/staging) · Helm/Kubernetes (production) |
| Multi-tenancy | Full tenant isolation at every layer |

---

## 2. Core Security Pipeline

The detection pipeline is a chain of seven services communicating via BullMQ queues. Events flow from raw ingestion through normalization, enrichment, detection, correlation, risk scoring, and alert creation. Each stage is a separate microservice consuming from an upstream queue and producing to a downstream queue.

---

### 2.1 Ingestion Service

**Port:** 3001  
**Queue consumed:** `zf:connector-poll`  
**Queue produced:** `zf:raw-events`

**Purpose:** Accept raw security events from connectors via API or connector-triggered push. The entry point for all external data.

**Key Functions:**
- Validates incoming event batches (Zod schema, max 1,000 events per batch)
- Enforces API key authentication using the `X-Api-Key` header (role: `API_CONNECTOR`)
- Provides idempotency via `Idempotency-Key` header to prevent duplicate processing
- Publishes validated events to the `zf:raw-events` BullMQ queue
- Accepts vulnerability scanner results via `POST /v1/ingest/vulnerability-scan`
- Stores raw ingestion metrics per tenant

**API Endpoints:**
- `POST /v1/ingest/events` — batch event ingestion (up to 1,000 events)
- `POST /v1/ingest/vulnerability-scan` — import vuln scanner findings
- `GET /health` — service health check

---

### 2.2 Normalization Worker

**Port:** 3002  
**Queue consumed:** `zf:raw-events` (dead-letter: `zf:dlq:raw-events`)  
**Queue produced:** `zf:normalized-events`, `zf:threat-intel-enrich`

**Purpose:** Transform raw vendor-specific event formats into the OCSF standard schema. Ensures every downstream service works with a consistent, typed event structure regardless of source.

**Key Functions:**
- Applies source-specific OCSF mappers: M365, AWS CloudTrail, Google Workspace
- Maps to 11 OCSF class UIDs: Authentication (3002), Account Change (3001), API Activity (6003), Network Activity (4001), File System Activity (1001), DNS Activity (4003), Security Finding (2001), Vulnerability Finding (2002), and others
- Writes normalized events to ClickHouse (`zonforge_events` database) for long-term queryability
- Publishes to `zf:normalized-events` for detection and `zf:threat-intel-enrich` for enrichment
- Monitors dead-letter queue for failed normalization; surfaces parsing errors
- Exposes `/metrics` endpoint (Prometheus format) for queue depth and throughput

**API Endpoints:**
- `GET /health` — service health with queue depth
- `GET /metrics` — Prometheus normalization metrics

---

### 2.3 Detection Engine

**Port:** 3003  
**Queue consumed:** `zf:normalized-events`  
**Queue produced:** `zf:detection-signals`

**Purpose:** Evaluate normalized events against a library of MITRE ATT&CK-mapped detection rules. The core threat detection brain of the platform.

**Key Functions:**
- Loads YAML-defined detection rules from `src/rules/` directory at startup using `RuleLoader`
- Supports 8 detection types: `threshold`, `sequence`, `correlation`, `anomaly_threshold`, `anomaly_correlation`, `baseline_deviation`, `pattern`
- Supports 13 condition operators: `eq`, `neq`, `in`, `not_in`, `contains`, `contains_any`, `gte`, `lte`, `gt`, `lt`, `regex`, `is_new`, `not_in_baseline`, `is_same_domain`, `is_distinct`
- Operates in dual mode: event-triggered (immediate) and 5-minute scheduled sweep (catches multi-batch patterns)
- Emits detection signals to `zf:detection-signals` queue for correlation
- Logs MITRE ATT&CK coverage summary at startup

**Detection Rules (Source of Truth):**

| Rule ID | Category | MITRE | Trigger |
|---|---|---|---|
| ZF-AUTH-001 | Authentication | T1110 + T1078 | ≥15 failed logins → success, same IP |
| ZF-AUTH-002–007 | Authentication | Various | Password spray, MFA bypass, impossible travel, new country, service account interactive |
| ZF-PRIVESC-001 | Privilege Escalation | T1098 + T1136 | Admin role self-assignment |
| ZF-DATA-001 | Data Exfiltration | T1530 + T1114.003 | Mass download + email forwarding rule |
| ZF-LATERAL-001 | Lateral Movement | T1021 + T1078.003 | Service account auth to 12+ distinct systems in 30s |
| ZF-OAUTH-001 | OAuth Abuse | T1550.001 + T1528 | Malicious app consent + bulk API calls |
| ZF-AWS-001–003 | Cloud (AWS) | T1078.004 | IAM role creation, access key abuse, S3 mass access |
| ZF-IAM-001–002 | Identity | T1136 + T1098 | Account creation outside normal pattern, permission escalation |
| ZF-RANSOMWARE-001 | Ransomware | T1486 | Mass file rename with known ransomware extensions |
| ZF-NET-001 | Network | T1071 | DNS beaconing pattern detection |
| ZF-EMAIL-001 | Email | T1566 | Phishing link click at scale |

**API Endpoints:**
- `GET /health` — health check with loaded rule count
- `GET /rules` — list all loaded rules with MITRE mappings
- `GET /coverage` — ATT&CK tactic/technique coverage matrix

---

### 2.4 Anomaly Detection Service (Python)

**Port:** 3004  
**Language:** Python 3.11 + FastAPI  
**Queue integration:** Redis pub/sub

**Purpose:** Statistical anomaly detection using machine learning. Complements rule-based detection for zero-day behaviors that have no defined rule.

**Key Functions:**
- Builds per-user, per-asset rolling statistical baselines (30-day window)
- Applies z-score and IQR (interquartile range) outlier detection on behavioral metrics
- Scheduled baseline rebuilds via APScheduler cron jobs
- Exposes REST API for on-demand anomaly scoring
- Integrates with Behavioral AI service for profile sharing
- Dependencies: `numpy`, `scipy`, `fastapi`, `asyncpg`, `clickhouse-connect`

---

### 2.5 Threat Intelligence Service

**Port:** 3005  
**Queue consumed:** `zf:threat-intel-enrich`  
**Queue produced:** `zf:normalized-events` (enriched events re-queued)

**Purpose:** Enrich normalized events with threat intelligence context. Identifies known malicious IPs, domains, file hashes, and indicators of compromise.

**Key Functions:**
- Queries internal IOC cache (PostgreSQL `ioc_cache` table) for IP reputation
- Integrates with external threat feeds (configurable via env vars)
- Caches IOC lookups in Redis to minimize database load
- Adds `threatIntelMatched: boolean` and `iocMatchCount: number` to events
- Feeds enriched IOC data to detection engine for improved accuracy

---

### 2.6 Correlation Engine

**Port:** 3006  
**Queue consumed:** `zf:detection-signals`  
**Queue produced:** `zf:alert-notifications`

**Purpose:** Group related detection signals into attack chains. Identifies multi-step attack patterns that span multiple individual signals.

**Key Functions:**
- Applies `ATTACK_CHAIN_PATTERNS` to group signals by entity, time window, and technique sequence
- Tracks attack chains across sliding time windows (configurable `windowHours` per pattern)
- Groups signals by `entityId` and `entityType` (user, IP, asset)
- Elevates severity of correlated alerts vs individual signals
- Exposes loaded pattern library via `/patterns` endpoint

**API Endpoints:**
- `GET /health` — health with active pattern count
- `GET /patterns` — list all attack chain correlation patterns

---

### 2.7 Risk Scoring Engine

**Port:** 3007  
**Queue consumed:** BullMQ trigger from alerts  
**Internal API:** `POST /internal/score-user`, `POST /internal/score-asset`, `POST /internal/score-org`

**Purpose:** Compute and maintain dynamic risk scores for users, assets, and the organization. Scores decay over time as behavior normalizes.

**Key Functions:**
- Scores users on: alert history, behavioral anomaly count, privilege level, recent IOC matches
- Scores assets on: vulnerability count (CVSS-weighted), internet exposure, criticality classification
- Computes organization posture score (0–100) as weighted aggregate
- Implements score decay: runs daily via `setInterval` to reduce scores as threats resolve
- Recalculates scores after every new alert via BullMQ trigger
- Scheduled organization-wide posture recalculation

**Risk Formula (User):**
```
userRiskScore = Σ(
  behavioralAnomalies  × weight_behavior +
  alertSeverityPoints  × weight_alerts +
  threatIntelHits      × weight_ioc +
  privilegeMultiplier  × base_score +
  recentIncidentPenalty
) → decayed over 30 days
```

**API Endpoints:**
- `GET /health`
- `POST /internal/score-user` — trigger user rescoring
- `POST /internal/score-asset` — trigger asset rescoring
- `POST /internal/score-org` — trigger org posture recalculation

---

### 2.8 Alert Service

**Port:** 3008  
**Queue consumed:** `zf:alert-notifications`, `zf:llm-narratives`

**Purpose:** Create, manage, and enrich alerts. The authoritative store of all security alerts and the dispatch point for notifications.

**Key Functions:**
- Creates alert records in PostgreSQL from detection signals
- Auto-assigns priority (P1–P4) based on severity and correlation chain length
- Generates AI narrative for P1/P2 alerts using LLM (Claude) via `zf:llm-narratives` queue
- Dispatches notifications: email, Slack, webhook, PagerDuty
- Publishes `zf:alerts:created` Redis pub/sub event for AI SOC Analyst auto-trigger
- Provides CRUD API for alert management (resolve, false-positive, assign)
- Tracks MTTD (mean time to detect) and MTTR (mean time to resolve) metrics

---

## 3. AI Intelligence Services

### 3.1 Behavioral AI Baseline Engine

**Port:** 3020  
**Package:** `@zonforge/behavioral-ai`

**Purpose:** Build and maintain per-user behavioral baselines, then score every incoming event against those baselines in real time. Provides the behavioral context layer that reduces false positives by 80% compared to static threshold rules.

**Architecture:**
- `ProfileBuilder` — queries ClickHouse with 11 parallel queries per user to compute baseline stats
- `DeviationScorer` — runs 8 independent checks in < 5ms (pure in-memory math)
- `ProfileStore` — Redis-backed cache (6-hour TTL) for fast retrieval
- BullMQ Worker — processes profile build jobs with concurrency 5
- Redis pub/sub — subscribes to `zf:events:normalized`, scores every event, publishes anomalies to `zf:behavioral:anomaly`

**Behavioral Dimensions Tracked:**

| Dimension | Measurement | Storage |
|---|---|---|
| `login_time` | Hour-of-day distribution (24-bucket histogram) | Rolling 30 days |
| `login_location` | Known countries, cities, ASNs | Rolling 30 days |
| `login_device` | Device/OS fingerprint | Rolling 30 days |
| `file_access_volume` | Files accessed per session (mean, stddev, p50/p75/p90/p99) | Rolling 30 days |
| `download_volume` | Files/bytes downloaded per day | Rolling 30 days |
| `api_call_volume` | API calls per hour | Rolling 30 days |
| `email_recipients` | Unique external recipients per day | Rolling 30 days |
| `admin_actions` | Privileged operations per day | Rolling 30 days |
| `off_hours_activity` | Fraction of activity outside typical work hours | Rolling 30 days |
| `geo_velocity` | Speed between login locations (impossible travel) | Per-event |

**Real-Time Deviation Checks (8 checks per event):**

1. **Login Time** — flags logins at hours with < 2% of normal activity
2. **New Location** — flags new country/city not seen in 30-day history
3. **File Access Volume** — z-score analysis; alerts at z ≥ 2.0 (configurable)
4. **Download Volume** — z-score analysis with IQR fence fallback
5. **API Call Volume** — IQR fence outlier detection for API abuse
6. **Off-Hours Activity** — flags users with historical < 10% off-hours ratio
7. **Admin Actions** — flags admin actions by users who rarely perform them
8. **Peer Comparison** — flags users at 90th+ percentile vs cohort median

**Anomaly Methods:** `z_score`, `iqr_fence`, `peer_comparison`, `temporal_pattern`, `velocity_check`  
**Anomaly Severity:** `normal` → `low` (z≥2.0) → `medium` (z≥2.5) → `high` (z≥3.5) → `critical` (z≥5.0)

**API Endpoints:**
- `POST /v1/behavioral/build-profiles` — trigger profile build for one or all users
- `GET /v1/behavioral/profile/:userId` — user baseline summary (login hours, known locations, volume stats)
- `POST /v1/behavioral/check` — real-time deviation check for a live event
- `GET /v1/behavioral/anomalies` — recent anomalies for the tenant
- `GET /v1/behavioral/stats` — profile coverage and confidence metrics

---

### 3.2 Dynamic Alert Triage AI

**Port:** 3021  
**Package:** `@zonforge/alert-triage-ai`

**Purpose:** Replace static P1/P2/P3/P4 priority assignment with a dynamic AI-computed urgency score (0–100) that reflects the true operational priority of an alert at the moment the analyst sees it.

**Urgency Formula:**
```
urgencyScore = (
  assetCriticality    × 0.25  +   // How important is the target?
  threatIntelScore    × 0.20  +   // Is the source IP known malicious?
  behavioralDeviation × 0.20  +   // Is this unusual for this user?
  blastRadius         × 0.15  +   // How many entities are at risk?
  dwellTimeMinutes/2  × 0.10  +   // How long has the attacker been present?
  slaUrgency          × 0.10      // How close to SLA breach?
)
```

**Asset Criticality Rules (pattern-matched against user ID / asset name):**

| Pattern | Score |
|---|---|
| `ceo`, `cto`, `ciso`, `cfo`, `vp`, `director`, `board` | 100 |
| `admin`, `administrator`, `tenant.admin` | 95 |
| `security`, `infosec`, `soc` | 85 |
| `finance`, `payroll`, `treasury` | 80 |
| `engineer`, `developer`, `devops` | 65 |
| `svc-`, `service`, `bot@` | 70 |
| `test`, `staging`, `demo` | 20 |

**Blast Radius Estimation:** Derived from MITRE technique (T1078, T1110, T1021, T1098, T1136 = high blast radius) combined with alert severity.

**Output:** `urgencyScore` (0–100) → `dynamicPriority` (P0/P1/P2/P3/P4), `topReasons` (3 human-readable reasons), `analystGuidance` (what to do first), `estimatedMinutes` (investigation time estimate).

**Integration:** Subscribes to `zf:alerts:created` Redis pub/sub. Scores every new alert automatically. Re-publishes escalation events to `zf:alerts:escalated` when priority changes significantly.

**API Endpoints:**
- `GET /v1/triage/:alertId` — on-demand triage score for one alert
- `GET /v1/triage/queue` — AI-sorted open alert queue (sorted by urgencyScore desc)

---

### 3.3 Security Assistant (Conversational AI)

**Port:** 3022  
**Package:** `@zonforge/security-assistant`  
**Model:** Anthropic claude-sonnet-4-6 with tool-use

**Purpose:** An embedded conversational AI analyst that answers natural-language security questions with real-time platform data. Enables junior analysts to operate at senior analyst level.

**Investigation Tools Available (6 tools):**

| Tool | Data Source | Purpose |
|---|---|---|
| `query_recent_alerts` | PostgreSQL `alerts` table | Get recent alerts filtered by severity/status |
| `lookup_entity_activity` | PostgreSQL + ClickHouse | Full activity history for user/IP/asset |
| `get_risk_score` | PostgreSQL `risk_scores` | Current risk score and signals for an entity |
| `check_ip_reputation` | PostgreSQL `ioc_cache` | Threat intelligence reputation for an IP |
| `get_security_posture` | PostgreSQL aggregate | Org-wide posture metrics |
| `run_hunt_query` | PostgreSQL | Natural language → alert data search |

**Conversation Features:**
- Multi-turn sessions stored in Redis (24-hour TTL per session)
- Agentic loop: up to 5 tool-use rounds per query
- Context-aware quick suggestions populated from live open alerts
- Responds in professional SOC analyst style

**Example Interaction:**
```
Analyst: "What has IP 203.0.113.42 done in the last 48 hours?"
AI:      [calls check_ip_reputation] → "This IP is flagged in 3 threat feeds 
         with 94% malicious confidence (APT29 association)"
         [calls lookup_entity_activity] → "It attempted 15 logins, 
         succeeded once as alice@acme.com, then downloaded 847 files."
         "RECOMMENDATION: Block IP immediately, investigate alice's account."
```

**API Endpoints:**
- `POST /v1/assistant/chat` — multi-turn conversation with tool-use
- `GET /v1/assistant/suggestions` — context-aware quick question suggestions

---

### 3.4 Predictive Threat Intelligence

**Port:** 3023  
**Package:** `@zonforge/predictive-threat`

**Purpose:** Generate a 72-hour attack likelihood forecast by analyzing historical alert patterns, comparing against global threat trends, and computing per-category risk scores.

**Forecast Categories:**
- Credential Attack
- Data Exfiltration
- Lateral Movement
- Supply Chain Attack

**Data Sources:**
- 7-day vs 30-day alert volume comparison (trend analysis)
- Critical alert count over 30-day window
- Active global APT campaign database (curated, embedded)
- Seasonal calendar patterns (Q4 phishing elevation, etc.)

**Output:**
- `overallThreatLevel`: `critical` / `elevated` / `moderate` / `low`
- Per-category `likelihood` (0–100) and `trend` (increasing / stable / decreasing)
- `topRisks`: top 3 human-readable risk statements
- `activeGlobalCampaigns`: current APT/ransomware campaigns relevant to the tenant's profile
- Per-category `recommendation`: specific defensive action

**API Endpoints:**
- `GET /v1/ai/threat-forecast` — 72-hour forecast (cached 1 hour in Redis)

---

### 3.5 Security Benchmarking Engine

**Port:** 3023 (co-hosted with Predictive Threat)

**Purpose:** Compare the tenant's security metrics against anonymized industry peer data. Provides percentile ranking and specific improvement steps to drive upsell and continuous improvement.

**Benchmark Dimensions (4):**
1. Alert Resolution Rate (target: > 88% = top 25%)
2. Security Posture Score (target: > 82 = top 25%)
3. Active Detection Rules (target: > 20 = top 25%)
4. Data Connectors Active (target: > 4 = top 25%)

**Output:**
- `overallScore` (0–100), `percentile` (0–100), `industryMedian`, `platformMedian`
- Per-dimension: `yourValue`, `industryMedian`, `platformP75`, `gapToTop25%`, `improvementSteps`
- `achievementBadges`: Top Resolver, Detection Master, Full Coverage, Security Leader
- `upgradeRecommendation`: AI-generated plan recommendation when usage suggests higher tier needed

**API Endpoints:**
- `GET /v1/ai/benchmark` — benchmarking report (cached 30 minutes in Redis)

---

### 3.6 AI SOC Analyst

**Port:** 3015  
**Package:** `@zonforge/ai-soc-analyst`  
**Model:** Anthropic claude-sonnet-4-6 (agentic tool-use loop)

**Purpose:** Autonomously investigate P1/P2 alerts to a verdict (true positive / false positive) with confidence score and full evidence chain — replacing 2–4 hours of manual analyst investigation.

**Investigation Tools (8 tools):**
1. `get_alert_details` — full alert with entities, MITRE techniques, evidence
2. `get_user_activity_history` — ClickHouse event query + risk score for the affected user
3. `get_ip_reputation` — IOC cache lookup for source IP
4. `get_related_alerts` — correlated alerts for same entity in lookback window
5. `get_user_risk_score` — risk scoring engine data
6. `query_event_timeline` — raw ClickHouse event stream for entity
7. `check_peer_comparison` — statistical outlier vs cohort for user
8. `get_mitre_technique_context` — local MITRE ATT&CK knowledge base

**Verdict Options:** `true_positive` · `false_positive` · `true_positive_benign` · `insufficient_evidence` · `escalate`

**Agent Loop:**
1. Load alert → form 2–3 hypotheses
2. Execute investigation tools iteratively (up to 10 steps, configurable)
3. Weigh evidence for/against each hypothesis
4. Output structured JSON verdict with `confidence` (0–100), `executive_summary`, `attack_narrative`, `ioc_list`, `recommendations`

**Auto-trigger:** Subscribes to `zf:alerts:created` Redis pub/sub. Automatically queues P1/P2 alerts for investigation within seconds of alert creation.

**Human-in-the-loop:** Investigations with confidence < 85% are placed in `awaiting_approval` state for analyst review before marking complete.

**API Endpoints:**
- `POST /v1/investigations` — trigger investigation for an alert
- `GET /v1/investigations` — list investigations with verdicts
- `GET /v1/investigations/:id` — full investigation with reasoning trace + evidence
- `POST /v1/investigations/:id/review` — submit human analyst verdict
- `GET /v1/investigations/stats` — TP/FP rates, pending review count

---

## 4. Advanced Defense Services

### 4.1 Red Team Simulation Service

**Port:** 3014  
**Package:** `@zonforge/redteam-simulation`

**Purpose:** Continuously validate that the detection pipeline is working correctly by automatically injecting simulated attack scenarios and measuring whether expected detection rules fire. Identifies detection gaps before real attackers do.

**Safety Design:**
- All simulated events are tagged with `_simulation: true` and a unique `_simMarker` UUID
- Uses only RFC 5737 TEST-NET IP addresses (192.0.2.x, 198.51.100.x, 203.0.113.x) — non-routable
- Uses only `@sim.zonforge.internal` actor identities — never real user accounts
- Safety validator (`validateEventSafety()`) rejects any event that fails safety checks before injection
- Playbook engine skips `_simulation: true` events — no real actions are taken

**Attack Scenarios (5 YAML-defined):**

| Scenario | MITRE Techniques | Steps | Expected Detection |
|---|---|---|---|
| `credential_attack` | T1110 + T1078 | 15 failed logins → success → file access | ZF-AUTH-001 |
| `privilege_escalation` | T1098 + T1136 | Login → role enum → admin self-assign → exercise | ZF-PRIVESC-001 |
| `data_exfiltration` | T1530 + T1114.003 | Recon → 120 file downloads → email forward rule | ZF-DATA-001 |
| `lateral_movement` | T1021 + T1078.003 | Svc acct login → 12 system auth spread → cred dump | ZF-LATERAL-001 |
| `oauth_abuse` | T1550.001 + T1528 | Malicious app consent → token → 50 mail reads | ZF-OAUTH-001 |

**Evaluation Engine:** After injection, polls PostgreSQL `alerts` table and ClickHouse `detection_signals` table every 3 seconds for up to 45 seconds. Calculates `detectionRatePct` and `gapRules`. Updates `security_scores` table with rolling 30-day category performance.

**Scheduler:** In production mode, queues 3 random scenarios every 6 hours (staggered by 30 seconds, lower BullMQ priority than manual runs).

**API Endpoints:**
- `GET /v1/redteam/scenarios` — list all 5 loaded scenarios with metadata
- `POST /v1/redteam/run-simulation` — trigger one, category, or all scenarios
- `GET /v1/redteam/results` — simulation history with detection rates
- `GET /v1/redteam/results/:id` — full result detail with per-step injection proof
- `GET /v1/redteam/security-score` — rolling detection coverage score by category
- `GET /v1/redteam/gap-report` — top gap rules and lowest-performing scenarios (30-day)

---

### 4.2 Digital Twin Security Simulation

**Port:** 3019  
**Package:** `@zonforge/digital-twin`

**Purpose:** Construct a virtual graph model of the tenant's infrastructure from live platform data, then simulate attacker movement through that graph to identify attack paths before deployment.

**Topology Node Types:**
`user_identity` · `workstation` · `server` · `cloud_service` · `database` · `network_segment` · `external_endpoint` · `saas_application` · `data_store`

**Topology Edge Types:**
`authenticate` · `network_access` · `trust_delegation` · `data_flow` · `admin_access` · `api_call`

**Auto-Build Sources:** Active connectors (→ SaaS/cloud service nodes), high-risk user risk scores (→ identity nodes), data store node (honeypot-tagged), Internet entry-point node.

**Attack Simulation Scenarios (3):**

| Scenario | Entry | Techniques | Target | Detection Coverage |
|---|---|---|---|---|
| `credential_attack` | Internet → SaaS Service | T1110 → T1078 → T1530 | Data Store | ZF-AUTH-001, ZF-DATA-001 |
| `lateral_movement` | Internet → Phishing | T1566 → T1021 → T1098 | Data Store | T1566 undetected (gap); ZF-LATERAL-001, ZF-PRIVESC-001 |
| `oauth_abuse` | Internet → Consent Phishing | T1566 → T1550.001 | Data Store | T1566 undetected (gap); ZF-OAUTH-001 |

**Per-Step Analysis:** Each attack step is annotated with `likelihood` (0–100), `detectable` (boolean), and `detectionRule` (the ZonForge rule that would catch it).

**Deployment Gate:** Produces a deployment safety recommendation:
- `SAFE` — all attack steps covered by detection rules
- `RISKY` — undetected steps present; review before deploy
- `CRITICAL` — high-likelihood paths with zero detection coverage; block deploy

**API Endpoints:**
- `POST /v1/twin/build` — auto-build topology from platform data
- `GET /v1/twin/list` — list all twins for tenant
- `GET /v1/twin/:id` — full topology with nodes and edges
- `POST /v1/twin/simulate` — run attack simulation (1–3 scenarios)
- `GET /v1/twin/:id/simulations` — simulation history
- `POST /v1/twin/:id/add-node` — manually add infrastructure node

---

### 4.3 Deception Technology

**Port:** 3017  
**Package:** `@zonforge/deception-tech`

**Purpose:** Deploy a grid of realistic digital decoys (honeypots) throughout the tenant's environment. Any interaction with a decoy is a guaranteed high-confidence attacker indicator with zero false positives.

**Honeypot Types (10):**

| Type | Placement | Detection Signal |
|---|---|---|
| `fake_credential` | M365 SharePoint IT runbooks | Any login attempt |
| `fake_api_key` | AWS Parameter Store legacy configs | Any API call |
| `fake_s3_bucket` | GitHub repository deployment scripts | Any access attempt |
| `fake_admin_account` | Confluence emergency access pages | Any login |
| `canary_document` | SharePoint — titled "Confidential M&A Strategy" | Any open or download |
| `fake_database_server` | AWS Parameter Store | Any connection attempt |
| `canary_email` | Email auto-signature | Any inbound email |
| `fake_webhook_url` | Historical Slack messages | Any HTTP call |
| `fake_ssh_key` | Archived GitHub repositories | Any use attempt |
| `fake_internal_service` | AWS Parameter Store environment variables | Any connection |

**Value Generation:** All decoy values are cryptographically generated with tenant-specific prefixes (e.g., API keys: `zfhp_<32-char-random>`, S3 buckets: `<tenant>-internal-backup-<id>`).

**Zero False Positive Design:** No legitimate user or system has reason to interact with any honeypot. Any trigger represents either an active attacker, insider threat, or compromised credential use.

**Alert Behavior:** Every trigger publishes a `P1` or `P2` alert to the ingestion pipeline with the narrative: "Any interaction with a honeypot indicates active attacker or insider threat activity."

**API Endpoints:**
- `POST /v1/deception/deploy-grid` — deploy all 10 recommended honeypots in one call
- `POST /v1/deception/honeypots` — deploy single custom honeypot
- `GET /v1/deception/honeypots` — list all honeypots (values masked)
- `POST /v1/deception/trigger` — external webhook receiver when honeypot is touched
- `GET /v1/deception/grid-summary` — coverage, trigger counts, risk signals
- `DELETE /v1/deception/honeypots/:id` — retire honeypot

---

### 4.4 Supply Chain Intelligence

**Port:** 3016  
**Package:** `@zonforge/supply-chain-intel`

**Purpose:** Analyze software dependency manifests for malicious packages, known vulnerabilities, and supply chain attack vectors. Protects against typosquatting, dependency confusion, and compromised open-source packages.

**Supported Ecosystems:** `npm` · `pypi` (Python) · `maven` (Java) · `gradle` (Java) · `nuget` (.NET) · `rubygems` (Ruby) · `cargo` (Rust) · `go`

**Manifest Formats Parsed:**
`package.json`, `package-lock.json`, `requirements.txt`, `Pipfile.lock`, `pom.xml`, `build.gradle`, `Cargo.toml`, `go.sum`, `packages.config`, `.csproj`

**Detection Mechanisms (4):**

1. **Known Malicious Database** — curated database of confirmed malicious packages (event-stream@3.3.6, ua-parser-js@0.7.29, colors@1.4.44-liberty-2, node-ipc@10.1.1, xz@5.6.0, coloama, pytorch-nightly-cu11, and more)
2. **Typosquatting Detection** — Levenshtein distance comparison against 40+ popular npm/pypi packages; flags similarity ≥ 78% (adjusted by package name length)
3. **CVE Lookup (Live)** — queries `api.osv.dev/v1/query` (OSV.dev open vulnerability database) for CVEs affecting the exact package version; returns CVSS scores
4. **Dependency Confusion** — detects internal package naming patterns (`@company/`, `internal-*`, `*-private`) vulnerable to namespace squatting

**Threat Categories Detected:**
`typosquatting` · `dependency_confusion` · `malicious_code` · `compromised_account` · `known_vulnerability` · `abandoned_package` · `suspicious_maintainer` · `protestware` · `build_tampering`

**Risk Grading:** A (score ≤ 10) → B (≤ 25) → C (≤ 50) → D (≤ 75) → F (> 75)

**SBOM Output:** Generates CycloneDX 1.4 format Software Bill of Materials for every scan, available at `GET /v1/supply-chain/scans/:id/sbom?format=cyclonedx`.

**API Endpoints:**
- `POST /v1/supply-chain/scan` — submit manifest file or package list for scanning
- `GET /v1/supply-chain/scans` — list all scans for tenant
- `GET /v1/supply-chain/scans/:id` — full scan result with findings
- `GET /v1/supply-chain/scans/:id/sbom` — CycloneDX SBOM export
- `POST /v1/supply-chain/check-package` — single package instant check

---

### 4.5 Regulatory AI

**Port:** 3018  
**Package:** `@zonforge/regulatory-ai`  
**Model:** Anthropic claude-sonnet-4-6 (compliance advisor)

**Purpose:** Continuously monitor compliance posture across 6 regulatory frameworks by automatically checking platform data against 17 control requirements. Provides an AI-powered compliance advisor that answers auditor questions.

**Supported Frameworks:**

| Framework | Controls Monitored | Description |
|---|---|---|
| SOC2 Type II | CC6.1, CC7.1, CC7.2, CC8.1, A1.1 | AICPA trust service criteria |
| ISO/IEC 27001:2022 | A.8.1, A.9.1, A.12.4, A.16.1 | International ISMS standard |
| GDPR | Art.32, Art.33 | EU data protection regulation |
| HIPAA | §164.312(a), §164.312(b) | US health information protection |
| PCI-DSS v4.0 | Req.10, Req.11 | Payment card security standard |
| NIST CSF 2.0 | DE.AE, RS.RP | US cybersecurity framework |

**Automated Evidence Collection:** For each control, the compliance monitor queries PostgreSQL (`audit_logs`, `alerts`, `connectors`, `detection_rules`) to collect evidence and determine `compliant` / `partial` / `non_compliant` status with a weighted score.

**AI Compliance Advisor:** Uses Claude claude-sonnet-4-6 with full compliance posture injected into the system prompt. Answers auditor questions in professional audit language, cites specific control IDs, and acknowledges gaps honestly.

**Caching:** Assessment results cached in Redis for 5 minutes to avoid repeated DB queries during audit sessions.

**API Endpoints:**
- `GET /v1/regulatory/frameworks` — list all 6 frameworks with metadata
- `POST /v1/regulatory/assess` — run fresh assessment for one framework
- `GET /v1/regulatory/posture` — all 6 framework assessments simultaneously
- `POST /v1/regulatory/ask-auditor` — AI answers a compliance question
- `GET /v1/regulatory/evidence-timeline` — 365-day evidence collection summary

---

## 5. Security Operations Services

### 5.1 Alert Service

**Port:** 3008  
*(See also Section 2.8 for pipeline role)*

**Operational Workflows:**
- Alert lifecycle: `open` → `investigating` → `resolved` / `false_positive` / `escalated`
- Auto-assignment to analyst queues based on severity and specialization
- SLA tracking per priority level (P1: 15 min, P2: 60 min, P3: 240 min, P4: 1440 min)
- AI narrative generation for P1/P2 via Claude (`zf:llm-narratives` BullMQ queue)
- Multi-channel notification dispatch: email, Slack, PagerDuty, webhook

---

### 5.2 Playbook Execution Engine

**Port:** 3009  
**Package:** `@zonforge/playbook-engine`  
**Queue consumed:** `zf:playbook-executions`

**Purpose:** Execute automated response actions when alerts match defined playbook trigger conditions. Converts security detections into automated remediation.

**11 Action Executors:**

| Action Type | Target | Description |
|---|---|---|
| `document_only` | None | Safe mode — records execution without taking action |
| `disable_user_m365` | Microsoft 365 / Entra ID | Disables compromised user via Microsoft Graph API |
| `disable_user_google` | Google Workspace | Suspends user via Google Admin SDK |
| `block_ip_cloudflare` | Cloudflare | Adds IP to Cloudflare firewall block list |
| `block_ip_aws_waf` | AWS WAF | Creates IP block rule in AWS WAF IP set |
| `create_jira_ticket` | Jira Cloud | Creates incident ticket with alert context |
| `create_servicenow_incident` | ServiceNow | Creates ITIL incident record |
| `notify_pagerduty` | PagerDuty | Triggers PagerDuty incident with severity |
| `notify_email` | SMTP/Resend | Sends formatted alert notification email |
| `notify_slack` | Slack | Posts rich alert card to configured channel |
| `notify_webhook` | Any HTTP endpoint | Posts alert payload to custom webhook URL |
| `require_mfa_reauthentication` | M365 / Entra ID | Forces user MFA re-verification via Conditional Access |

**Playbook Configuration:** Each playbook defines `triggerRules` (rule IDs or severity levels), `conditions` (filters on alert fields), and `actions` (ordered list of executors with configs). Playbooks support both manual execution and auto-trigger on alert creation.

**Safety:** Simulation events (`_simulation: true`) are excluded from playbook auto-trigger.

---

### 5.3 Threat Hunting

**Port:** 3012  
**Package:** `@zonforge/threat-hunting`  
**Backend:** ClickHouse for millisecond query execution

**Purpose:** Provide security analysts with a structured query environment and pre-built hunt templates to proactively search for threats not caught by automated rules.

**Hunt Templates (21 templates across 6 categories):**

| Category | Template IDs | Examples |
|---|---|---|
| Credential | HT-CRED-001 to 004 | Brute force with success, password spray, leaked credential usage, MFA bypass |
| Lateral Movement | HT-LAT-001 to 002 | Auth spread across systems, service account interactive login |
| Exfiltration | HT-EXFIL-001 to 003 | Mass download detection, external email volume spike, DNS tunneling |
| Persistence | HT-PERS-001 to 003 | New admin account creation, scheduled task creation, OAuth app persistence |
| Discovery | HT-DISC-001 to 002 | Reconnaissance enumeration, role/permission listing at scale |
| Execution | HT-EXEC-001 to 002 | Unusual process execution patterns, scripting activity |
| IOC Hunting | HT-IOC-001 to 004 | Known malicious IP, domain, hash, or user agent matching |
| Timeline | HT-TIMELINE-001 | Full chronological entity timeline reconstruction |

**Template Features:** Each template includes parameterized ClickHouse SQL with configurable thresholds (e.g., `min_failures`, `window_minutes`, `lookback_hours`), MITRE ATT&CK mappings, and severity classification.

**Hunt Promotion:** Completed hunts can be promoted to persistent detection rules.

**API Endpoints:**
- `GET /v1/hunt/templates` — list all templates (filterable by category, searchable)
- `POST /v1/hunt/run` — execute a hunt template with custom parameters
- `POST /v1/hunt/query` — run arbitrary ClickHouse SQL (analyst-written queries)
- `GET /v1/hunt/results` — hunt history and saved results
- `GET /v1/hunt/results/:id` — full result set for a completed hunt

---

### 5.4 Correlation Engine

**Port:** 3006  
*(See also Section 2.6)*

**Operational Role:** Surfaces multi-stage attack patterns that individual detection rules cannot catch because they span different event types or time windows. Elevates alert severity for correlated attack chains. Provides the attack chain context needed for AI SOC Analyst investigations.

---

### 5.5 Risk Scoring Engine

**Port:** 3007  
*(See also Section 2.7)*

**Operational Role:** Maintains the security risk registry for all entities. Drives risk-based prioritization across the platform — the Triage AI uses user risk scores as a triage factor; the Dashboard surfaces high-risk users and assets for proactive review.

---

### 5.6 Compliance Reports Service

**Port:** 3013  
**Package:** `@zonforge/compliance-reports`

**Purpose:** Generate structured compliance reports for audit purposes. Combines platform metrics, audit log extracts, and control coverage data into exportable evidence packages.

**Reports Available:**
- SOC2 Type II evidence package
- ISO 27001 control gap assessment
- SIEM event log export (for third-party SIEM ingestion)
- Vulnerability scan report (combined view of all scanner findings)
- Custom compliance framework mapping

**API Endpoints:**
- `POST /v1/compliance/soc2-report` — generate SOC2 evidence package
- `POST /v1/compliance/iso27001-report` — ISO 27001 gap assessment
- `GET /v1/compliance/audit-export` — SIEM-format event log export
- `POST /v1/compliance/vuln-upload` — ingest external vulnerability scan

---

## 6. Platform Services

### 6.1 API Gateway

**Port:** 3000  
**Package:** `@zonforge/api-gateway`

**Role:** Single entry point for all external API traffic. Handles authentication, rate limiting, request routing, and exposes the OpenAPI specification.

**Functions:**
- JWT validation on all `/v1/*` routes via `authMiddleware`
- Rate limiting: 100 requests/minute per tenant IP (configurable)
- Routes: risk, compliance, playbook handlers imported directly in monorepo MVP
- Comment-documented proxy routes for downstream services in microservice deployment
- `GET /v1/openapi.json` — full OpenAPI 3.0 specification for all platform APIs
- CORS configured for dashboard domain
- Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options

---

### 6.2 Auth Service

**Port:** 3001 (internal)  
**Package:** `@zonforge/auth-service`

**Role:** Identity and access management. Issues JWTs, manages sessions, enforces RBAC.

**Functions:**
- Password-based login with bcrypt (10 rounds)
- JWT access tokens (15-minute TTL) + refresh tokens (7-day TTL, Redis-backed)
- TOTP (time-based one-time password) MFA via `@zonforge/auth-utils`
- Token revocation via Redis JTI blocklist (`zf:jwt:blocklist:*`)
- RBAC roles: `PLATFORM_ADMIN`, `TENANT_ADMIN`, `SECURITY_ANALYST`, `VIEWER`, `API_CONNECTOR`, `MSSP_OPERATOR`
- API key generation for collector authentication

---

### 6.3 Billing Service

**Port:** 3010  
**Package:** `@zonforge/billing-service`

**Role:** Manage subscription plans, enforce usage limits, handle Stripe integration.

**Subscription Tiers:**

| Plan | Price | Connectors | Identities | Events/min | Retention |
|---|---|---|---|---|---|
| Starter | Free | 1 | 50 | 500 | 30 days |
| Growth | $299/mo | 3 | 200 | 2,000 | 90 days |
| Business | $999/mo | 10 | 1,000 | 10,000 | 180 days |
| Enterprise | $3,500+/mo | Unlimited | Unlimited | Unlimited | 365 days |
| MSSP | Custom | Unlimited | Unlimited | Unlimited | 365 days |

**Functions:**
- Stripe subscription management (create, upgrade, downgrade, cancel)
- Webhook handler for Stripe events (`invoice.payment_succeeded`, `customer.subscription.updated`)
- Usage enforcement middleware — blocks ingestion when plan limits exceeded
- In-app upgrade flow with Stripe Checkout session creation

---

### 6.4 MSSP Console

**Port:** 3011  
**Package:** `@zonforge/mssp-console`

**Role:** Multi-tenant management console for Managed Security Service Providers.

**Functions:**
- Cross-tenant alert aggregation view for MSSP operators
- Per-client posture dashboard with drill-down
- Bulk playbook deployment across managed tenants
- Client onboarding workflow (new tenant provisioning)
- MSSP billing summary (wholesale pricing per managed tenant)
- SLA breach tracking across all managed clients
- Role: `MSSP_OPERATOR` — can view all tenants under their MSSP account

---

### 6.5 SSO Service

**Port:** 3024  
**Package:** `@zonforge/sso-service`

**Role:** Enterprise identity provider integration. Allows enterprise customers to use their existing IdP for ZonForge authentication.

**Protocols Supported:** SAML 2.0 · OIDC (OpenID Connect)

**Identity Providers:** Okta · Microsoft Entra ID (Azure AD) · Google Workspace · OneLogin · PingIdentity · Custom SAML · Custom OIDC

**Functions:**
- SP metadata XML generation (`GET /saml/:tenantId/sp-metadata`)
- SAML Assertion Consumer Service with JIT (Just-in-Time) user provisioning
- SCIM 2.0 Users and Groups endpoints for automatic provisioning/deprovisioning
- SCIM bearer token generation for IdP configuration
- Group-to-role mapping (IdP group → ZonForge RBAC role)
- SSO connection testing workflow before activation

---

### 6.6 Board Reports Service

**Port:** 3026  
**Package:** `@zonforge/board-reports`  
**Model:** Anthropic claude-sonnet-4-6

**Role:** Generate executive-level security reports suitable for board and C-suite presentations.

**Report Content:**
- Quarterly security posture narrative (AI-generated by Claude)
- MTTD/MTTR metrics with trend comparison vs prior period
- Attack summary: "3 major attacks detected and contained"
- Industry benchmark comparison
- Compliance status across configured frameworks
- Top risks and recommended board-level actions
- Exportable as PDF via S3

**API Endpoints:**
- `POST /v1/board-report/generate` — generate quarterly board report
- `GET /v1/board-report/preview` — preview latest report data

---

### 6.7 POC Manager

**Port:** 3025  
**Package:** `@zonforge/poc-manager`  
**Model:** Anthropic claude-sonnet-4-6 (ROI report generation)

**Role:** Manage enterprise proof-of-concept trials from creation through conversion.

**Features:**
- Creates dedicated isolated tenant per POC prospect
- 4-week milestone framework with ZonForge vs. customer task ownership
- 5 default success criteria (MTTD, false positive rate, analyst time savings, connector coverage, compliance reports)
- Auto-computed engagement score (0–100) from live platform usage data (connectors configured, alerts investigated, playbooks created)
- AI-generated ROI report at week 4 using Claude + actual platform metrics
- Win/loss pipeline tracking with deal value and competitor notes

---

### 6.8 Tenant Service

**Port:** Internal  
**Package:** `@zonforge/tenant-service`

**Role:** Tenant lifecycle management — create, configure, suspend, and delete tenant environments.

**Functions:**
- Tenant provisioning: creates isolated PostgreSQL schema, ClickHouse namespace, Redis key prefix
- Plan tier enforcement (used by Billing Service)
- Regional data residency routing (us-east-1, eu-west-1, ap-southeast-1)
- Tenant settings management (feature flags, data retention policies)

---

## 7. Data Collectors

Collectors are lightweight, independently-deployed processes that poll external APIs and push events to the Ingestion Service. Each connector instance runs as a separate process parameterized by a `ZF_CONNECTOR_ID`.

### 7.1 M365 Collector

**Package:** `@zonforge/m365-collector`  
**Data Source:** Microsoft Graph API + Microsoft Entra ID  
**Events Collected:** Sign-in logs, audit logs (user/admin/SharePoint/Exchange), conditional access events, MFA events, OAuth consent grants

### 7.2 AWS CloudTrail Collector

**Package:** `@zonforge/aws-cloudtrail-collector`  
**Data Source:** AWS CloudTrail via EventBridge (real-time) or S3 polling (5-minute interval)  
**Events Collected:** All AWS API calls — IAM changes, S3 access, EC2 operations, Lambda invocations, GuardDuty findings

### 7.3 Google Workspace Collector

**Package:** `@zonforge/google-workspace-collector`  
**Data Source:** Google Workspace Admin SDK Reports API  
**Events Collected:** Login events, Drive activity, Admin console changes, Gmail events (send/receive patterns), Meet activity

### 7.4 Collector Base Library

**Package:** `@zonforge/collector-base`  
**Role:** Abstract base class implementing the standard collector lifecycle: authenticate, schedule, collect, validate, push to ingestion API, handle errors and retries.

---

## 8. Shared Packages

Internal monorepo packages consumed by multiple services. Never deployed independently.

| Package | Purpose | Key Exports |
|---|---|---|
| `@zonforge/shared-types` | TypeScript type definitions shared platform-wide | Tenant, User, Connector, Detection, Risk, Billing types |
| `@zonforge/db-client` | PostgreSQL (Drizzle ORM) + ClickHouse client wrappers | `getDb()`, `schema`, `initClickhouse()` |
| `@zonforge/auth-utils` | JWT, API key, TOTP, RBAC, HTTP middleware | `verifyAccessToken()`, `authMiddleware`, `requestIdMiddleware`, `validateApiKeyFromDb()` |
| `@zonforge/event-schema` | OCSF type definitions + source-specific mappers | OCSF class UIDs, M365/CloudTrail/GWS mapping functions |
| `@zonforge/logger` | Structured JSON logger with security-specific log helpers | `createLogger()`, `logSecurityEvent()`, `logDetection()` |
| `@zonforge/config` | Environment variable validation and typed config objects | `env`, `postgresConfig`, `redisConfig`, `jwtConfig`, `featureFlags`, `awsConfig` |

---

## 9. Dashboard & User Interfaces

### 9.1 Web Dashboard (Analyst Interface)

**Port:** 5173  
**Technology:** React 18, Vite, TailwindCSS, TanStack Query v5, Zustand

**Pages (23 total):**

| Page | Route | Purpose |
|---|---|---|
| Login | `/login` | Authentication entry point |
| Overview / Dashboard | `/dashboard` | Executive security posture overview |
| Alerts List | `/alerts` | 3-pane alert center with AI triage queue |
| Alert Detail | `/alerts/:id` | Full alert with AI investigation, evidence, playbook trigger |
| Risk Page | `/risk` | Risk heatmap for users and assets |
| Connectors | `/connectors` | Data source management and health |
| Threat Hunting | `/threat-hunting` | Query builder + 21 template library |
| Compliance | `/compliance` | ATT&CK coverage map + rule management |
| Compliance Reports | `/compliance-reports` | SOC2/ISO evidence + SIEM export |
| Security Validation | `/security-validation` | Red team simulation lab |
| Supply Chain | `/supply-chain` | Dependency scan results + SBOM download |
| AI SOC Analyst | `/ai-soc-analyst` | Investigation dashboard with reasoning trace |
| AI Intelligence | `/ai-intelligence` | Forecast + Triage + Behavioral + Benchmarks + Chat |
| Enterprise | `/enterprise` | Deception grid + Regulatory AI + Digital Twin (3 tabs) |
| Enterprise Setup | `/enterprise-setup` | SSO/SCIM config + POC management |
| Playbooks | `/playbooks` | Playbook management and execution history |
| MSSP | `/mssp` | Multi-tenant management console |
| Billing | `/billing` | Plan and subscription management |
| Audit Log | `/audit` | Immutable platform audit trail |
| Settings | `/settings` | Tenant and user preferences |
| AI Capabilities | `/ai-capabilities` | AI features overview |
| Enterprise Sales | `/enterprise-sales` | POC pipeline and deal tracking |

### 9.2 AI Intelligence Page

The unified AI intelligence hub within the dashboard. Four tabs:

- **Threat Forecast** — 72-hour category-level threat level with global APT campaigns
- **Smart Triage** — AI-sorted open alert queue with urgency scores and analyst guidance
- **Behavioral AI** — profile coverage stats and explanation of anomaly detection methodology
- **Benchmarks** — industry percentile ranking with gap analysis and achievement badges

Persistent right-panel: **Security Assistant Chat** — live conversational AI with real-time data tools, always visible regardless of active tab.

### 9.3 Admin Dashboard

**Technology:** React (standalone artifact, dark tactical command center aesthetic)  
**Access:** Platform admins only

**Four Views:**
- **Overview** — MRR sparklines, tenant count, total alerts, service health grid for all 26 services
- **Tenants** — searchable tenant table with plan/status/MRR/posture bars; click-through to detail with impersonate/upgrade/suspend actions
- **Revenue** — plan-wise MRR breakdown, top revenue tenants ranked, SaaS metrics (churn, expansion, net new MRR, AI cost ratio)
- **Services** — all microservices with latency bars, uptime percentages, and restart controls

### 9.4 Public Website (Marketing + Support)

**Technology:** React (single-page multi-section site)

**Sections:**
- **Product Landing** — hero, live threat ticker, how-it-works, feature grid, testimonials
- **Pricing** — 4-tier pricing table with annual/monthly toggle and FAQ
- **Documentation** — sidebar navigation with quickstart guide and API code examples
- **Status Page** — real-time service health with 90-day uptime bar and incident log
- **Support** — 3-tier support matrix, contact form with ticket routing, quick help links
- **Live Chat Widget** — AI-powered support bot with canned responses for common questions

---

## 10. Service Dependency Map

### Event Flow (Happy Path)

```
External Systems (M365 / AWS / GWS)
    │
    ▼ API call / OAuth poll
┌───────────────────────────┐
│  DATA COLLECTORS          │  m365-collector | aws-cloudtrail | google-workspace
│  Port: Ephemeral (workers)│  Push to: POST /v1/ingest/events
└───────────┬───────────────┘
            │ HTTP POST (API key auth)
            ▼
┌───────────────────────────┐
│  INGESTION SERVICE  :3001 │  Validates → BullMQ publish
│  Queue: zf:raw-events     │
└───────────┬───────────────┘
            │ BullMQ consume
            ▼
┌───────────────────────────┐
│  NORMALIZATION WORKER     │  OCSF mapping → ClickHouse write
│  :3002                    │
│  Queue: zf:normalized-events│  also → zf:threat-intel-enrich
└──────┬────────────────────┘
       │                    │
       │ BullMQ             │ BullMQ
       ▼                    ▼
┌──────────────┐   ┌──────────────────────────┐
│  DETECTION   │   │  THREAT INTEL SERVICE    │
│  ENGINE :3003│   │  :3005                   │
│  20 MITRE    │   │  IOC enrichment          │
│  rules       │   │  Re-queues to normalized │
└──────┬───────┘   └──────────────────────────┘
       │ zf:detection-signals
       ▼
┌───────────────────────────┐
│  CORRELATION ENGINE :3006 │  Attack chain pattern matching
│  Queue: zf:alert-notifications│
└───────────┬───────────────┘
            │ BullMQ
            ▼
┌───────────────────────────┐
│  RISK SCORING ENGINE :3007│  Entity risk recalculation
│  (triggered by alerts)    │
└───────────────────────────┘
            │ (concurrent)
            ▼
┌───────────────────────────┐
│  ALERT SERVICE :3008      │  Alert record created
│  → zf:llm-narratives      │  AI narrative generation
│  → zf:alert-notifications │  Email/Slack/PagerDuty
│  → Redis pub/sub          │  zf:alerts:created
└──────┬──────────┬──────────┘
       │          │
       │          │ Redis pub/sub zf:alerts:created
       │          ▼
       │   ┌──────────────────────────┐
       │   │  AI SOC ANALYST :3015    │  P1/P2 auto-investigation
       │   │  claude-sonnet-4-6       │  8 tool calls → verdict
       │   └──────────────────────────┘
       │
       │   ┌──────────────────────────┐
       │   │  ALERT TRIAGE AI :3021   │  Dynamic urgency scoring
       │   └──────────────────────────┘
       │
       ▼
┌───────────────────────────┐
│  PLAYBOOK ENGINE :3009    │  Condition match → action execution
│  Queue: zf:playbook-execs │  disable_user | block_ip | create_jira | etc.
└───────────────────────────┘
            │
            ▼
┌───────────────────────────┐
│  WEB DASHBOARD :5173      │  React — alert list | investigation | risk | hunt
└───────────────────────────┘
```

### Cross-Cutting Data Flows

```
Behavioral AI :3020 ──────────────────► Alert Triage AI :3021
  (anomaly scores in Redis)              (behavioralDeviation factor)

Behavioral AI :3020 ──────────────────► AI SOC Analyst :3015
  (user behavioral profiles)             (check_peer_comparison tool)

Risk Scoring :3007 ───────────────────► Alert Triage AI :3021
  (user/asset risk scores)               (assetCriticality factor)

Red Team Sim :3014 ───────────────────► Ingestion :3001
  (sandboxed attack events)              (zf:raw-events queue)

Digital Twin :3019 ───────────────────► Detection Engine :3003
  (models which rules cover attack paths) (deployment gate decision)

Regulatory AI :3018 ──────────────────► Compliance Reports :3013
  (control status and evidence)          (automated evidence collection)
```

---

## 11. Full Feature List

### Detection & Investigation
- 20 MITRE ATT&CK-mapped detection rules (threshold, sequence, correlation, anomaly, pattern types)
- Dual detection mode: event-triggered real-time + 5-minute scheduled sweep
- Attack chain correlation across multiple signals and time windows
- AI SOC Analyst: autonomous P1/P2 alert investigation with 8 tools and Claude claude-sonnet-4-6
- AI verdict: true positive / false positive / authorized activity / insufficient evidence
- Reasoning trace: full step-by-step agent thought process visible to analyst
- Human-in-the-loop review for low-confidence AI investigations
- OCSF (Open Cybersecurity Schema Framework) standardized event normalization
- ClickHouse-backed millisecond event queries across billions of stored events

### Behavioral Analysis
- Per-user behavioral baselines (30-day rolling window)
- 10 behavioral dimensions: login time, location, device, file volume, download, API calls, email, admin actions, off-hours ratio, geo-velocity
- 8 real-time deviation checks per event (< 5ms execution)
- Statistical methods: z-score, IQR fence, peer comparison, temporal pattern analysis
- Anomaly severity: normal → low → medium → high → critical
- Peer cohort comparison for statistical outlier detection

### Threat Intelligence
- IOC enrichment on every event (IP, domain, hash)
- Integration with external threat feeds
- Threat intelligence matching in detection rules (`not_in_baseline`, `is_new` operators)
- 72-hour AI-generated attack likelihood forecast by category
- Global APT campaign database with tenant-profile matching

### Threat Hunting
- 21 pre-built hunt templates across 6 MITRE tactic categories
- Parameterized ClickHouse SQL with configurable thresholds
- Custom SQL query interface for analyst-written hunts
- Hunt-to-rule promotion workflow
- Full entity timeline reconstruction (HT-TIMELINE-001)

### Automated Response
- 11 playbook action executors: M365 user disable, Google user disable, Cloudflare IP block, AWS WAF IP block, Jira ticket, ServiceNow incident, PagerDuty alert, email, Slack, webhook, MFA forced re-auth
- Condition-based playbook trigger (rule ID, severity, entity type)
- Playbook execution history and audit trail
- Safe `document_only` mode for dry-run testing

### Advanced Defense
- 5 automated red team attack scenarios (YAML-defined)
- Automated 6-hour simulation schedule with detection gap reporting
- 10-type deception honeypot grid with zero false positives
- Digital twin attack path simulation with deployment gate
- Supply chain dependency scanning (8 ecosystems, live CVE lookup via OSV.dev)
- CycloneDX SBOM generation
- Typosquatting detection via Levenshtein distance analysis
- Virtual infrastructure topology modeling

### Compliance & Governance
- Continuous compliance monitoring across 6 frameworks (SOC2, ISO27001, GDPR, HIPAA, PCI-DSS, NIST CSF)
- 17 automated compliance control checks
- AI compliance advisor powered by Claude (answers auditor questions)
- Executive board report generation
- SIEM event log export
- Vulnerability scanner result ingestion and reporting
- Immutable audit log with hash chain integrity

### Platform & Operations
- Full multi-tenant isolation (PostgreSQL schema, ClickHouse namespace, Redis prefix)
- 5 subscription tiers (Free → $299 → $999 → $3,500+ → Custom MSSP)
- Stripe subscription management with webhook event handling
- MSSP multi-tenant management console
- SAML 2.0 + OIDC SSO with JIT provisioning
- SCIM 2.0 automatic user provisioning and deprovisioning from Okta/Azure AD/Google
- POC/trial management with 4-week milestone framework and AI ROI reporting
- Prometheus metrics on all services
- Grafana dashboards pre-configured
- Distributed tracing via OpenTelemetry/Jaeger
- Docker Compose (development) + Helm/Kubernetes (production) deployment
- GitHub Actions CI/CD (PR check, build, deploy, security scan)
- Rate limiting per tenant IP (100 req/min default)
- OpenAPI 3.0 specification endpoint

---

## 12. Product Category

ZonForge Sentinel is a **multi-category security platform** that combines capabilities from five traditionally separate product categories into a single, AI-native platform:

### Primary Category: AI SOC Platform

ZonForge's defining characteristic is the AI SOC Analyst — an autonomous investigator that handles P1/P2 alert investigation end-to-end. This places it in the emerging **AI SOC Platform** category, which goes beyond traditional detection to provide automated reasoning, evidence collection, and verdict generation.

### Secondary Categories:

**SIEM (Security Information and Event Management)**  
Core detection pipeline, event normalization to OCSF, ClickHouse-backed log retention, 20+ detection rules, audit log management, compliance reporting.

**XDR (Extended Detection and Response)**  
Multi-source telemetry collection (cloud identity + cloud infrastructure), cross-source correlation engine, automated playbook response, behavioral analysis layer.

**Threat Intelligence Platform**  
IOC enrichment, 72-hour predictive threat forecasting, supply chain vulnerability intelligence, global APT campaign tracking.

**Security Validation Platform**  
Continuous red team simulation, detection gap reporting, digital twin attack path modeling, security benchmarking with industry peer comparison.

### Competitive Positioning

| Traditional Product | ZonForge Equivalent |
|---|---|
| Splunk / QRadar (SIEM) | Ingestion + Detection + ClickHouse + Compliance |
| CrowdStrike (EDR/XDR) | Behavioral AI + Correlation + Playbook Response |
| Recorded Future (Threat Intel) | Threat Intel Service + Predictive Threat + Supply Chain |
| AttackIQ / Verodin (Security Validation) | Red Team Simulation + Digital Twin |
| Exabeam / Securonix (UEBA) | Behavioral AI Baseline + Anomaly Detection |

ZonForge replaces this stack at a fraction of the cost by combining all five functions into one platform with a shared data model, unified dashboard, and AI automation layer.

---

## 13. Final Summary

**ZonForge Sentinel is an AI-native, cloud-delivered cybersecurity platform that provides the following services:**

**Core Security Pipeline** — A seven-stage event processing chain (Ingestion → Normalization → Threat Enrichment → Detection → Correlation → Risk Scoring → Alert Creation) that accepts raw security events from Microsoft 365, AWS CloudTrail, and Google Workspace; normalizes them to the OCSF standard; evaluates them against 20 MITRE ATT&CK-mapped rules; and produces prioritized, AI-enriched alerts.

**AI Investigation** — An autonomous AI SOC Analyst (claude-sonnet-4-6) that automatically investigates P1/P2 alerts using 8 data tools, produces verdicts with confidence scores, and generates complete investigation reports — replacing 2–4 hours of manual analyst work per alert.

**Behavioral Intelligence** — A per-user behavioral baseline engine that tracks 10 dimensions of normal behavior across a 30-day rolling window, running 8 real-time statistical checks on every event to detect anomalies that rules cannot catch.

**Predictive and Proactive Defense** — 72-hour threat forecasting, continuous red team simulation (5 MITRE attack scenarios, automated every 6 hours), digital twin attack path modeling, a 10-type deception honeypot grid, and supply chain dependency scanning across 8 package ecosystems.

**Security Operations Tooling** — 21-template threat hunting library against ClickHouse, 11-executor automated playbook engine (M365/Google user disable, Cloudflare/WAF IP block, Jira/ServiceNow/PagerDuty integration), dynamic AI-powered alert triage with urgency scoring, and a conversational Security Assistant chatbot.

**Compliance Automation** — Continuous monitoring across 6 regulatory frameworks (SOC2 Type II, ISO 27001, GDPR, HIPAA, PCI-DSS, NIST CSF) with 17 automated control checks, an AI compliance advisor, and automated evidence package generation.

**Platform Infrastructure** — Full multi-tenancy with data isolation, 5 subscription tiers, Stripe billing, MSSP multi-tenant console, SAML/OIDC SSO, SCIM 2.0 provisioning, POC trial management, Prometheus/Grafana observability, and Helm/Kubernetes production deployment.

The platform serves the **mid-market enterprise segment** ($500–5,000/month) that is currently underserved by both expensive legacy SIEMs and endpoint-focused XDR vendors, providing the detection depth of a full SOC team at a fraction of the operational cost through AI automation.

---

*Generated by repository scan — ZonForge Sentinel v4.6.0*  
*Source: `apps/` (34 services), `packages/` (6 shared), `collectors/` (4), `infra/`*  
*Total analyzed: 580+ files, ~50,000 lines of TypeScript/Python*
