# ─────────────────────────────────────────────────────────────────
# ZonForge Service — Multi-stage Dockerfile
# Usage: docker build --build-arg SERVICE=api-gateway -t zonforge/api-gateway:4.6.0 .
# ─────────────────────────────────────────────────────────────────

ARG SERVICE=api-gateway
ARG NODE_VERSION=20

# ── Stage 1: Base ─────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# ── Stage 2: Dependencies ─────────────────────────────────────────
FROM base AS deps
ARG SERVICE
COPY . .
RUN npm install --include=dev

# ── Stage 3: Builder ──────────────────────────────────────────────
FROM base AS builder
ARG SERVICE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -- --filter=./packages/*
RUN npm run build --workspace=apps/${SERVICE}

# ── Stage 4: Runner ───────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 zonforge

ARG SERVICE
ENV NODE_ENV=production
ENV SERVICE_NAME=${SERVICE}
WORKDIR /app

# Copy built artifacts
COPY --from=builder --chown=zonforge:nodejs /app/packages/*/dist ./packages/
COPY --from=builder --chown=zonforge:nodejs /app/apps/${SERVICE}/dist ./dist/
COPY --from=deps --chown=zonforge:nodejs /app/node_modules ./node_modules/

USER zonforge

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1

EXPOSE ${PORT:-3000}
CMD ["node", "dist/index.js"]
