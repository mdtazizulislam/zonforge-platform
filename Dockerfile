# ─────────────────────────────────────────────────────────────────
# ZonForge Service — Multi-stage Dockerfile
# Usage: docker build --build-arg SERVICE=api-gateway -t zonforge/api-gateway:4.6.0 .
# ─────────────────────────────────────────────────────────────────

ARG SERVICE=api-gateway
ARG NODE_VERSION=20

# ── Stage 1: Base ─────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
ENV NODE_ENV=production

# ── Stage 2: Dependencies ─────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/db-client/package.json packages/db-client/
COPY packages/auth-utils/package.json packages/auth-utils/
COPY packages/logger/package.json packages/logger/
COPY packages/config/package.json packages/config/
COPY packages/event-schema/package.json packages/event-schema/
COPY apps/${SERVICE}/package.json apps/${SERVICE}/
RUN pnpm install --frozen-lockfile --prod

# ── Stage 3: Builder ──────────────────────────────────────────────
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/${SERVICE}/ apps/${SERVICE}/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter=@zonforge/${SERVICE} build

# ── Stage 4: Runner ───────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
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
