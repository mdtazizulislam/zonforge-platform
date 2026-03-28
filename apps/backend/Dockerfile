# ─────────────────────────────────────────────────────────────────
# ZonForge Backend — Dedicated Railway Dockerfile
#
# Build context: REPO ROOT (used by Railway GitHub auto-deploy via
# root railway.json dockerfilePath: "apps/backend/Dockerfile")
#
# This Dockerfile is intentionally isolated from the monorepo
# multi-service Dockerfile so that Railway GitHub-triggered deploys
# build ONLY the backend without dependency on shared packages.
# ─────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20

# ── Stage 1: Dependencies ─────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# Copy only the backend package.json — lean, deterministic install
COPY apps/backend/package.json ./package.json
RUN npm install

# ── Stage 2: Builder ──────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Copy only backend source — no other services or packages needed
COPY apps/backend/src      ./src
COPY apps/backend/tsconfig.json ./tsconfig.json
COPY apps/backend/package.json  ./package.json

# Compile TypeScript → dist/
RUN npm run build

# ── Stage 3: Runner ───────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 zonforge

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=zonforge:nodejs /app/dist         ./dist/
COPY --from=deps    --chown=zonforge:nodejs /app/node_modules ./node_modules/

USER zonforge

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-8080}/health || exit 1

EXPOSE ${PORT:-8080}
CMD ["node", "dist/index.js"]
