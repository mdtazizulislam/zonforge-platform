# ZonForge Sentinel v4.6.0

**AI-Native Cybersecurity Platform**

One monorepo — Backend + Web Dashboard + Landing Page + Mobile App.

---

## Project Structure

```
zonforge-platform/
├── apps/
│   ├── landing-web/        ← Public website + Interactive Demo (Netlify)
│   ├── web-dashboard/      ← React 18 SaaS Dashboard (Netlify)
│   ├── mobile-app/         ← React Native iOS + Android (Expo)
│   ├── api-gateway/        ← :3000  API Gateway (Railway)
│   ├── ingestion-service/  ← :3001  Event Ingestion
│   ├── normalization-worker← :3002  OCSF Normalization
│   ├── detection-engine/   ← :3003  20 MITRE ATT&CK Rules
│   ├── anomaly-service/    ← :3004  Python ML Anomaly Detection
│   ├── threat-intel-service← :3005  IOC Enrichment
│   ├── correlation-engine/ ← :3006  Attack Chain Correlation
│   ├── risk-scoring-engine ← :3007  User/Asset Risk Scoring
│   ├── alert-service/      ← :3008  Alert Management
│   ├── playbook-engine/    ← :3009  11 Automated Response Actions
│   ├── billing-service/    ← :3010  Stripe Billing
│   ├── mssp-console/       ← :3011  Multi-Tenant MSSP Console
│   ├── threat-hunting/     ← :3012  21 ClickHouse Hunt Templates
│   ├── compliance-reports/ ← :3013  SOC2/ISO Evidence Packages
│   ├── redteam-simulation/ ← :3014  5 MITRE Attack Scenarios
│   ├── ai-soc-analyst/     ← :3015  Claude AI Investigation
│   ├── supply-chain-intel/ ← :3016  Dependency Scanning + SBOM
│   ├── deception-tech/     ← :3017  10 Honeypot Types
│   ├── regulatory-ai/      ← :3018  6 Compliance Frameworks
│   ├── digital-twin/       ← :3019  Attack Path Simulation
│   ├── behavioral-ai/      ← :3020  User Behavior Baselines
│   ├── alert-triage-ai/    ← :3021  6-Factor Urgency Scoring
│   ├── security-assistant/ ← :3022  AI Security Chat
│   ├── predictive-threat/  ← :3023  72h Threat Forecast
│   ├── sso-service/        ← :3024  SAML 2.0 + OIDC + SCIM
│   ├── poc-manager/        ← :3025  Trial Management + AI ROI
│   └── board-reports/      ← :3026  AI Executive Reports
│
├── packages/               ← Shared libraries
│   ├── shared-types/
│   ├── db-client/          ← PostgreSQL + ClickHouse ORM
│   ├── auth-utils/         ← JWT + API Key + RBAC + Middleware
│   ├── event-schema/       ← OCSF event mappings
│   ├── logger/             ← Structured logging
│   └── config/             ← Typed env config
│
├── collectors/             ← Data connectors
│   ├── m365-collector/
│   ├── aws-cloudtrail-collector/
│   ├── google-workspace-collector/
│   └── collector-base/
│
├── infra/                  ← Kubernetes, Terraform, Nginx, Prometheus
├── security/               ← MITRE rules YAML, hardening, TLS
├── docs/                   ← Platform catalog + readiness report
├── docker-compose.yml      ← Local dev infrastructure
└── .env.example            ← 82+ environment variables
```

---

## Quick Start

```bash
cp .env.example .env.local
# Set ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, JWT_SECRET

npm run infra:up      # Start PostgreSQL, Redis, ClickHouse
npm run db:migrate    # Create 26 database tables
npm run dev           # Start all services
```

---

## Run Specific Apps

```bash
npm run dev:backend    # All 24 backend services
npm run dev:dashboard  # Web dashboard :5173
npm run dev:landing    # Landing page :4000
npm run dev:mobile     # Mobile app (Expo)
```

---

## Deploy

| App | Platform | Command |
|-----|----------|---------|
| Landing + Demo | Netlify | Base: apps/landing-web |
| Web Dashboard | Netlify | Base: apps/web-dashboard |
| Backend API | Railway | Root: apps/api-gateway |
| Mobile iOS | App Store | eas build --platform ios |
| Mobile Android | Play Store | eas build --platform android |

---

## API Keys Required

| Key | Source | Used by |
|-----|--------|---------|
| ANTHROPIC_API_KEY | console.anthropic.com | AI SOC, Chat, Reports |
| STRIPE_SECRET_KEY | dashboard.stripe.com | Billing |
| TWILIO_ACCOUNT_SID | console.twilio.com | SMS + WhatsApp alerts |

---

Built in New York. © 2026 ZonForge Inc.
