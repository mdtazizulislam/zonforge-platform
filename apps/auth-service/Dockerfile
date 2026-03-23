# ─────────────────────────────────────────────────────────────────
# ZonForge Sentinel — auth-service Dockerfile
# Multi-stage build: builder → production
# Final image: ~150MB, non-root user, read-only filesystem
# ─────────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ─────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install only production dependencies for the service
# Copy workspace config first (for layer caching)
COPY package.json ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy package.json files for all workspace members
COPY packages/shared-types/package.json   ./packages/shared-types/
COPY packages/event-schema/package.json   ./packages/event-schema/
COPY packages/db-client/package.json      ./packages/db-client/
COPY packages/auth-utils/package.json     ./packages/auth-utils/
COPY packages/logger/package.json         ./packages/logger/
COPY packages/config/package.json         ./packages/config/
COPY apps/auth-service/package.json       ./apps/auth-service/

RUN npm install --workspace=apps/auth-service \
    --workspace=packages/shared-types \
    --workspace=packages/event-schema \
    --workspace=packages/db-client \
    --workspace=packages/auth-utils \
    --workspace=packages/logger \
    --workspace=packages/config \
    --ignore-scripts

# ── Stage 2: Builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules       ./node_modules
COPY --from=deps /app/packages           ./packages
COPY turbo.json                          ./turbo.json
COPY tsconfig.base.json                  ./tsconfig.base.json
COPY package.json                        ./package.json

# Copy source files
COPY packages/shared-types/src    ./packages/shared-types/src
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/event-schema/src    ./packages/event-schema/src
COPY packages/event-schema/tsconfig.json ./packages/event-schema/
COPY packages/db-client/src       ./packages/db-client/src
COPY packages/db-client/tsconfig.json    ./packages/db-client/
COPY packages/auth-utils/src      ./packages/auth-utils/src
COPY packages/auth-utils/tsconfig.json   ./packages/auth-utils/
COPY packages/logger/src          ./packages/logger/src
COPY packages/logger/tsconfig.json       ./packages/logger/
COPY packages/config/src          ./packages/config/src
COPY packages/config/tsconfig.json       ./packages/config/
COPY apps/auth-service/package.json      ./apps/auth-service/
COPY apps/auth-service/src        ./apps/auth-service/src
COPY apps/auth-service/tsconfig.json     ./apps/auth-service/

# Build all packages in dependency order
RUN npm run build --workspace=packages/shared-types && \
    npm run build --workspace=packages/event-schema && \
    npm run build --workspace=packages/db-client && \
    npm run build --workspace=packages/config && \
    npm run build --workspace=packages/logger && \
    npm run build --workspace=packages/auth-utils && \
    npm run build --workspace=apps/auth-service

# ── Stage 3: Production ───────────────────────────────────────────
FROM node:20-alpine AS production

# Security hardening
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 zonforge && \
    adduser -D -u 1001 -G zonforge zonforge

WORKDIR /app

# Copy built artifacts
COPY --from=builder --chown=zonforge:zonforge /app/packages/shared-types/dist  ./packages/shared-types/dist
COPY --from=builder --chown=zonforge:zonforge /app/packages/event-schema/dist  ./packages/event-schema/dist
COPY --from=builder --chown=zonforge:zonforge /app/packages/db-client/dist     ./packages/db-client/dist
COPY --from=builder --chown=zonforge:zonforge /app/packages/auth-utils/dist    ./packages/auth-utils/dist
COPY --from=builder --chown=zonforge:zonforge /app/packages/logger/dist        ./packages/logger/dist
COPY --from=builder --chown=zonforge:zonforge /app/packages/config/dist        ./packages/config/dist
COPY --from=builder --chown=zonforge:zonforge /app/apps/auth-service/dist      ./apps/auth-service/dist

# Copy package.json files (needed for module resolution)
COPY --from=deps --chown=zonforge:zonforge /app/packages/shared-types/package.json  ./packages/shared-types/
COPY --from=deps --chown=zonforge:zonforge /app/packages/db-client/package.json     ./packages/db-client/
COPY --from=deps --chown=zonforge:zonforge /app/packages/auth-utils/package.json    ./packages/auth-utils/
COPY --from=deps --chown=zonforge:zonforge /app/packages/logger/package.json        ./packages/logger/
COPY --from=deps --chown=zonforge:zonforge /app/packages/config/package.json        ./packages/config/
COPY --from=deps --chown=zonforge:zonforge /app/apps/auth-service/package.json      ./apps/auth-service/
COPY --from=deps --chown=zonforge:zonforge /app/package.json                        ./

# Install production dependencies only
COPY --from=deps --chown=zonforge:zonforge /app/node_modules ./node_modules

USER zonforge

ENV NODE_ENV=production \
    PORT=3100

EXPOSE 3100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/v1/auth/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/auth-service/dist/index.js"]
