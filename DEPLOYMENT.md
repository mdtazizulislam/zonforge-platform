# ZonForge Sentinel — Deployment Guide

## Quick Start (Local / Dev)

```bash
# 1. Clone and enter
git clone https://github.com/yourorg/zonforge-platform.git
cd zonforge-platform

# 2. Run one-command setup
chmod +x scripts/quickstart.sh
./scripts/quickstart.sh
```

Dashboard opens at http://localhost:5173

---

## System Requirements

| Component       | Minimum           | Recommended (Production) |
|----------------|-------------------|--------------------------|
| CPU            | 4 cores           | 16 cores                 |
| RAM            | 8 GB              | 32 GB                    |
| Disk           | 50 GB SSD         | 500 GB NVMe              |
| Node.js        | 20.x LTS          | 22.x LTS                 |
| Docker         | 24.x              | 25.x                     |
| PostgreSQL     | 15 (via Docker)   | AWS RDS PostgreSQL 16    |
| ClickHouse     | 24.3 (via Docker) | ClickHouse Cloud         |
| Redis          | 7.2 (via Docker)  | AWS ElastiCache          |

---

## Environment Variables

Copy `.env.example` to `.env.local` (dev) or set as CI/CD secrets (production):

```bash
cp .env.example .env.local
# Edit .env.local with your values
```

### Critical Variables

```bash
# Must set before first run:
ZONFORGE_JWT_SECRET=$(openssl rand -base64 64)
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY_PLACEHOLDER
ZONFORGE_DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=STRIPE_SECRET_KEY_PLACEHOLDER
```

---

## Docker Compose (Recommended for dev/staging)

```bash
# Start infrastructure only
docker-compose up -d postgres redis clickhouse prometheus grafana

# Start all services (infrastructure + apps)
docker-compose --profile apps up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api-gateway

# Stop everything
docker-compose down

# Full reset (⚠️ deletes all data)
docker-compose down -v
```

---

## Kubernetes / Helm (Production)

### Prerequisites
```bash
# Install helm
brew install helm   # macOS
# or: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Connect to your cluster
kubectl config use-context your-production-cluster
```

### Deploy
```bash
# Add secrets
kubectl create namespace zonforge
kubectl create secret generic zonforge-secrets \
  --namespace zonforge \
  --from-literal=database-url="postgresql://..." \
  --from-literal=jwt-secret="..." \
  --from-literal=anthropic-api-key="ANTHROPIC_API_KEY_PLACEHOLDER" \
  --from-literal=stripe-secret="STRIPE_SECRET_KEY_PLACEHOLDER"

# Install chart
helm install zonforge-sentinel ./infra/helm/charts/zonforge \
  --namespace zonforge \
  --values ./infra/helm/values/production.yaml \
  --set image.tag=4.6.0

# Check rollout
kubectl rollout status deployment/zonforge-api-gateway -n zonforge

# Upgrade
helm upgrade zonforge-sentinel ./infra/helm/charts/zonforge \
  --namespace zonforge \
  --values ./infra/helm/values/production.yaml \
  --set image.tag=NEW_VERSION
```

---

## Database Setup

```bash
# Generate Drizzle migrations
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed initial data (admin user, default plans, detection rules)
pnpm db:seed

# Open Drizzle Studio (GUI)
pnpm db:studio
```

---

## Building for Production

```bash
# Build all services
pnpm build

# Build specific service
pnpm --filter=@zonforge/api-gateway build

# Type check all
pnpm typecheck

# Run tests
pnpm test
```

---

## CI/CD Pipeline

GitHub Actions workflows in `.github/workflows/`:

| Workflow          | Trigger              | Actions                           |
|-------------------|----------------------|-----------------------------------|
| `pr-check.yml`    | Pull Request         | Lint, typecheck, test             |
| `ci-cd.yml`       | Push to `main`       | Build, test, push Docker images   |
| `deploy.yml`      | Tag `v*.*.*`         | Deploy to production via Helm     |
| `security.yml`    | Weekly / on-push     | SAST, dependency audit            |

### Creating a Release
```bash
git tag v4.6.0
git push origin v4.6.0
# GitHub Actions auto-deploys to production
```

---

## Service Ports Reference

| Service                  | Port  | Health Check              |
|--------------------------|-------|---------------------------|
| API Gateway              | 3000  | GET /health               |
| Auth Service             | 3001  | GET /health               |
| Ingestion Service        | 3002  | GET /health               |
| Detection Engine         | 3003  | GET /health               |
| Anomaly Service (Python) | 3004  | GET /health               |
| Threat Intel             | 3005  | GET /health               |
| Correlation Engine       | 3006  | GET /health               |
| Risk Scoring             | 3007  | GET /health               |
| Alert Service            | 3008  | GET /health               |
| Playbook Engine          | 3009  | GET /health               |
| Billing Service          | 3010  | GET /health               |
| MSSP Console             | 3011  | GET /health               |
| Threat Hunting           | 3012  | GET /health               |
| Compliance Reports       | 3013  | GET /health               |
| Red Team Simulation      | 3014  | GET /health               |
| AI SOC Analyst           | 3015  | GET /health               |
| Supply Chain Intel       | 3016  | GET /health               |
| Deception Technology     | 3017  | GET /health               |
| Regulatory AI            | 3018  | GET /health               |
| Digital Twin             | 3019  | GET /health               |
| Behavioral AI            | 3020  | GET /health               |
| Alert Triage AI          | 3021  | GET /health               |
| Security Assistant       | 3022  | GET /health               |
| Predictive Threat + Bench| 3023  | GET /health               |
| SSO Service              | 3024  | GET /health               |
| POC Manager              | 3025  | GET /health               |
| Web Dashboard            | 5173  | /                         |
| Prometheus               | 9090  | /-/healthy                |
| Grafana                  | 3001* | /api/health               |
| ClickHouse HTTP          | 8123  | GET /ping                 |
| PostgreSQL               | 5432  | pg_isready                |
| Redis                    | 6379  | redis-cli ping            |

---

## Monitoring & Observability

```bash
# Grafana dashboards
open http://localhost:3001   # admin/admin

# Prometheus metrics
open http://localhost:9090

# Jaeger distributed tracing
open http://localhost:16686

# ClickHouse query UI
open http://localhost:8123/play
```

---

## Backup & Recovery

```bash
# PostgreSQL backup
docker exec zf-postgres pg_dump -U zonforge zonforge | gzip > backup-$(date +%Y%m%d).sql.gz

# Restore
gunzip < backup-20250101.sql.gz | docker exec -i zf-postgres psql -U zonforge zonforge

# Redis backup
docker exec zf-redis redis-cli BGSAVE

# ClickHouse backup (production: use ClickHouse Cloud built-in backup)
docker exec zf-clickhouse clickhouse-client --query="BACKUP DATABASE zonforge_events TO Disk('backups', '$(date +%Y%m%d)')"
```

---

## Security Hardening (Production)

1. **Rotate JWT secret** — use `openssl rand -base64 64`
2. **Enable TLS** — set up nginx/traefik reverse proxy with Let's Encrypt
3. **Database SSL** — set `?sslmode=require` in DATABASE_URL
4. **Redis AUTH** — set ZONFORGE_REDIS_PASSWORD
5. **Network isolation** — keep services on private network, only API Gateway public
6. **Secrets management** — use AWS Secrets Manager / HashiCorp Vault in production
7. **Rate limiting** — configured in API Gateway (100 req/min per IP by default)

---

## Troubleshooting

```bash
# Service won't start
cat logs/<service-name>.log | tail -50

# Database connection error
docker exec zf-postgres psql -U zonforge -c "\l"

# Redis connection error
docker exec zf-redis redis-cli ping

# Port already in use
lsof -i :<port>
kill -9 <PID>

# Reset and restart
docker-compose down -v && ./scripts/quickstart.sh
```

---

## Support

- Documentation: https://docs.zonforge.com
- Email: support@zonforge.com
- Enterprise: enterprise@zonforge.com
