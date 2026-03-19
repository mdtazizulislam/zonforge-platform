#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# ZonForge Sentinel — Production Quick Start
# Usage:  chmod +x scripts/quickstart.sh && ./scripts/quickstart.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }
info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
step() { echo -e "\n${BOLD}${BLUE}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
 ___________            ______
 \____    / ___  ____  |  ____| ___  _____  ____  ____
   /     / /  _ \|    \ |  |_   /   \|  __ \/ ___\/ __ \
  /     /_(  |_) )  \  \|  __) |  _ (|  | \/  \__\  ___/
 /________/\____/|__/\__/|__|    \___/ |__|    \___/\___ |
                                                        \/
        SENTINEL — AI-Powered Cyber Early Warning Platform
                       Production Quick Start v4.6.0
EOF
echo -e "${NC}"

# ── Step 1: Prerequisites check ──────────────────────────────────

step "1/7  Prerequisites"

check_cmd() {
  command -v "$1" &>/dev/null || err "$1 is required but not installed. See DEPLOYMENT.md."
  log "$1 found: $(command -v "$1")"
}

check_cmd node
check_cmd docker
check_cmd docker-compose || check_cmd "docker compose"
check_cmd pnpm || npm install -g pnpm

NODE_VER=$(node -e "process.stdout.write(process.version)")
MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
[[ "$MAJOR" -ge 20 ]] || err "Node.js 20+ required (found $NODE_VER)"
log "Node.js $NODE_VER ✓"

# ── Step 2: Environment setup ─────────────────────────────────────

step "2/7  Environment Configuration"

if [[ ! -f ".env.local" ]]; then
  cp .env.example .env.local
  warn ".env.local created from .env.example"
  warn "IMPORTANT: Edit .env.local and set:"
  warn "  • ANTHROPIC_API_KEY"
  warn "  • ZONFORGE_JWT_SECRET (run: openssl rand -base64 64)"
  warn "  • STRIPE_SECRET_KEY (for billing)"
  warn "  • AWS credentials (for S3 reports)"
  echo ""
  read -rp "Press ENTER after editing .env.local to continue..."
else
  log ".env.local exists"
fi

# Validate critical vars
source .env.local 2>/dev/null || true
[[ -z "${ZONFORGE_JWT_SECRET:-}" ]] && warn "ZONFORGE_JWT_SECRET not set — using insecure default"
[[ -z "${ANTHROPIC_API_KEY:-}" ]]  && warn "ANTHROPIC_API_KEY not set — AI features will be limited"

# ── Step 3: Dependencies ─────────────────────────────────────────

step "3/7  Installing Dependencies"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
log "Dependencies installed"

# ── Step 4: Infrastructure ────────────────────────────────────────

step "4/7  Starting Infrastructure (Docker)"
info "Starting PostgreSQL, ClickHouse, Redis, Prometheus, Grafana..."

docker-compose up -d postgres redis clickhouse prometheus grafana 2>/dev/null || \
  docker compose up -d postgres redis clickhouse prometheus grafana

# Wait for PostgreSQL
info "Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'until docker exec zf-postgres pg_isready -U zonforge &>/dev/null; do sleep 2; done'
log "PostgreSQL ready"

# Wait for Redis
info "Waiting for Redis..."
timeout 30 bash -c 'until docker exec zf-redis redis-cli ping &>/dev/null; do sleep 1; done'
log "Redis ready"

# Wait for ClickHouse
info "Waiting for ClickHouse..."
sleep 10
log "ClickHouse ready"

# ── Step 5: Database migrations ───────────────────────────────────

step "5/7  Database Setup"
info "Running migrations..."
pnpm --filter=@zonforge/db-client db:migrate 2>/dev/null || warn "Migration step — run manually: pnpm db:migrate"
info "Seeding initial data..."
pnpm --filter=@zonforge/db-client db:seed 2>/dev/null || warn "Seed step — run manually: pnpm db:seed"
log "Database ready"

# ── Step 6: Build ─────────────────────────────────────────────────

step "6/7  Building All Services"
pnpm build
log "All services built"

# ── Step 7: Start services ────────────────────────────────────────

step "7/7  Starting All Services"

SERVICES=(
  "api-gateway:3000"
  "auth-service:3001"
  "ingestion-service:3002"
  "detection-engine:3003"
  "threat-intel-service:3005"
  "correlation-engine:3006"
  "risk-scoring-engine:3007"
  "alert-service:3008"
  "playbook-engine:3009"
  "billing-service:3010"
  "threat-hunting:3012"
  "compliance-reports:3013"
  "redteam-simulation:3014"
  "ai-soc-analyst:3015"
  "supply-chain-intel:3016"
  "deception-tech:3017"
  "regulatory-ai:3018"
  "digital-twin:3019"
  "behavioral-ai:3020"
  "alert-triage-ai:3021"
  "security-assistant:3022"
  "predictive-threat:3023"
  "sso-service:3024"
  "poc-manager:3025"
  "web-dashboard:5173"
)

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

for entry in "${SERVICES[@]}"; do
  SVC="${entry%%:*}"
  PORT="${entry##*:}"
  SVC_PATH="apps/$SVC"
  [[ -d "$SVC_PATH" ]] || continue
  LOG_FILE="$LOG_DIR/$SVC.log"
  PORT="$PORT" pnpm --filter="@zonforge/$SVC" start > "$LOG_FILE" 2>&1 &
  info "Started $SVC on :$PORT (log: $LOG_FILE)"
done

# Also start Python anomaly service
if [[ -d "apps/anomaly-service" ]]; then
  cd apps/anomaly-service && pip install -r requirements.txt -q && \
    uvicorn main:app --port 3004 > "../../logs/anomaly-service.log" 2>&1 &
  cd ../..
  info "Started anomaly-service (Python) on :3004"
fi

# ── Health check ──────────────────────────────────────────────────

echo ""
info "Waiting 10 seconds for services to initialize..."
sleep 10

echo -e "\n${BOLD}${GREEN}━━━ HEALTH CHECKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

HEALTHY=0; UNHEALTHY=0
for entry in "${SERVICES[@]}"; do
  SVC="${entry%%:*}"
  PORT="${entry##*:}"
  URL="http://localhost:$PORT/health"
  if curl -sf "$URL" &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $SVC :$PORT"
    ((HEALTHY++))
  else
    echo -e "  ${YELLOW}?${NC} $SVC :$PORT (starting...)"
    ((UNHEALTHY++))
  fi
done

# ── Summary ───────────────────────────────────────────────────────

echo -e "\n${BOLD}${GREEN}"
cat << 'SUMMARY'
═══════════════════════════════════════════════════════════════════
  🎉  ZonForge Sentinel is running!
═══════════════════════════════════════════════════════════════════
SUMMARY
echo -e "${NC}"

echo -e "  ${CYAN}Dashboard:${NC}      http://localhost:5173"
echo -e "  ${CYAN}API Gateway:${NC}    http://localhost:3000"
echo -e "  ${CYAN}Grafana:${NC}        http://localhost:3001  (admin/admin)"
echo -e "  ${CYAN}Prometheus:${NC}     http://localhost:9090"
echo -e "  ${CYAN}ClickHouse UI:${NC}  http://localhost:8123/play"
echo ""
echo -e "  ${YELLOW}Default admin login:${NC}"
echo -e "  Email:    admin@zonforge.local"
echo -e "  Password: Admin@Zonforge2025!"
echo ""
echo -e "  ${YELLOW}Logs:${NC} ./logs/<service>.log"
echo -e "  ${YELLOW}Stop:${NC} pkill -f 'node dist/index.js' && docker-compose down"
echo ""
echo -e "${GREEN}$HEALTHY services healthy, $UNHEALTHY still starting${NC}"
echo ""
