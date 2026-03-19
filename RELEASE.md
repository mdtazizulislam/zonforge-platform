# ZonForge Sentinel — Release v1.0.0

**Release Date:** 2024-Q1
**Codename:** Argus
**Platform Version:** 4.6.0

---

## 🎯 What is ZonForge Sentinel?

ZonForge Sentinel is an AI-powered Cyber Early Warning Platform that provides:

- **Real-time threat detection** across Microsoft 365, AWS CloudTrail, Google Workspace, and custom sources
- **AI-generated investigation narratives** using Claude claude-sonnet-4
- **Statistical anomaly detection** with 30-day per-user behavioral baselines
- **Attack chain correlation** mapping 9 multi-step attack patterns to MITRE ATT&CK
- **Automated risk scoring** for users and assets with decay and privilege weighting
- **SaaS billing** with Stripe integration and per-plan quota enforcement

---

## 📦 What's Included in v1.0.0

### Backend Services (11 TypeScript + 1 Python)

| Service | Port | Description |
|---------|------|-------------|
| api-gateway | 3000 | REST proxy + auth + rate limiting |
| auth-service | 3100 | JWT + MFA + API keys + RBAC |
| tenant-service | 3101 | Multi-tenant management |
| ingestion-service | 3001 | Event intake + HMAC + BullMQ |
| normalization-worker | 3002 | OCSF mapping + ClickHouse write |
| threat-intel-service | 3005 | OTX + Abuse.ch + Feodo feeds |
| detection-engine | 3003 | 20 MITRE-mapped YAML rules |
| anomaly-service | 3004 | Python FastAPI + 5 statistical models |
| correlation-engine | 3006 | 9 attack chain pattern matching |
| risk-scoring-engine | 3007 | User/asset/org risk scoring |
| alert-service | 3008 | Pipeline + LLM narrative + notifications |
| billing-service | 3010 | Stripe + plan enforcement |

### Data Collectors (3 TypeScript)
- `m365-collector` — Microsoft 365 + Entra ID (Graph API delta queries)
- `aws-cloudtrail-collector` — S3 + SQS + IAM AssumeRole
- `google-workspace-collector` — Reports API (7 event categories)

### Frontend (React 18 + Vite + Tailwind)
- 8 full screens: Dashboard, Alerts (3-pane IDE), Risk, Connectors, Compliance, Billing, Audit, Settings
- Real-time updates, keyboard shortcuts, dark/light theme

### Infrastructure
- Terraform modules: VPC, RDS, ElastiCache, S3, ECR
- Helm chart with HPA, PDB, resource limits
- Istio mTLS + NetworkPolicy + OPA Gatekeeper
- Prometheus + Grafana + Jaeger + Alertmanager

---

## 🔐 Security Architecture

| Layer | Controls |
|-------|---------|
| Network | Istio mTLS STRICT + default-deny NetworkPolicy |
| Application | JWT (15m) + JTI blocklist + TOTP MFA + RBAC |
| Data | AES-256-GCM field encryption + KMS |
| Audit | SHA-256 hash chain + S3 WORM Object Lock (7yr) |
| Secrets | AWS Secrets Manager auto-rotation |
| Runtime | Pod Security Standards + OPA Gatekeeper |
| Rate Limiting | Sliding window + IP auto-block |

---

## 📊 Platform Capabilities

### Detection Coverage
- **20 platform detection rules** mapping 12 MITRE ATT&CK tactics
- **9 attack chain patterns** for multi-step attack correlation
- **5 anomaly detectors** (login time, location, API volume, download volume, device fingerprint)
- **4 threat intel feeds** (OTX, Abuse.ch, Feodo, custom)

### Scale (per-plan)

| Metric | Starter | Growth | Business | Enterprise |
|--------|---------|--------|----------|------------|
| Events/min | 500 | 2,000 | 10,000 | Unlimited |
| Identities | 50 | 200 | 1,000 | Unlimited |
| Connectors | 1 | 3 | 10 | Unlimited |
| Retention | 30d | 90d | 180d | 365d |

---

## 🚀 Quick Start

```bash
# Prerequisites: Docker + Node.js 20 + AWS CLI

# 1. Clone and install
git clone https://github.com/zonforge/sentinel.git
cd sentinel
npm install

# 2. Start infrastructure
docker-compose up -d postgres redis clickhouse

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your credentials

# 4. Run migrations + seed demo data
npx tsx scripts/db-setup.ts migrate seed

# 5. Start all services (dev mode)
npm run dev

# Dashboard: http://localhost:5173
# API:       http://localhost:3000
# Docs:      http://localhost:3000/v1/openapi.json

# Demo login:
# admin@acme-demo.com / Password123!
```

---

## 🗄️ Codebase Stats

| Category | Count |
|----------|-------|
| TypeScript/TSX files | 135 |
| Python files | 11 |
| YAML detection rules | 20 |
| Attack chain patterns | 9 |
| Terraform modules | 5 |
| K8s manifests | 12+ |
| Operational runbooks | 7 |
| Test files | 8 |
| Total lines of code | ~18,000 |

---

## 🛣️ Roadmap (v1.1+)

- [ ] SIEM connector (Splunk HEC, Microsoft Sentinel)
- [ ] Playbook auto-execution (IP block, user disable)
- [ ] Threat hunting query interface
- [ ] Mobile alert notifications (Push)
- [ ] MSSP multi-tenant console
- [ ] Custom ML model training per tenant
- [ ] SOC2 Type II compliance report generation

---

## 🔄 Upgrade Guide (from pre-release)

```bash
# 1. Update dependencies
npm install

# 2. Run new migrations
npx tsx scripts/db-setup.ts migrate

# 3. Rebuild services
npm run build

# 4. Restart services
docker-compose restart
```

---

## 📄 License

Copyright © 2024 ZonForge, Inc. All rights reserved.

Enterprise License — See LICENSE file for terms.

---

*ZonForge Sentinel v1.0.0 "Argus" — Built with ❤️ and Claude*
