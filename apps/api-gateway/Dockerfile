# ZonForge Sentinel — api-gateway Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json   ./packages/shared-types/
COPY packages/db-client/package.json      ./packages/db-client/
COPY packages/auth-utils/package.json     ./packages/auth-utils/
COPY packages/logger/package.json         ./packages/logger/
COPY packages/config/package.json         ./packages/config/
COPY apps/api-gateway/package.json        ./apps/api-gateway/
RUN npm install --workspace=apps/api-gateway \
    --workspace=packages/shared-types \
    --workspace=packages/db-client \
    --workspace=packages/auth-utils \
    --workspace=packages/logger \
    --workspace=packages/config \
    --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY turbo.json tsconfig.base.json package.json ./
COPY packages/ ./packages/
COPY apps/api-gateway/ ./apps/api-gateway/
RUN npm run build --workspace=packages/shared-types && \
    npm run build --workspace=packages/db-client && \
    npm run build --workspace=packages/auth-utils && \
    npm run build --workspace=packages/logger && \
    npm run build --workspace=packages/config && \
    npm run build --workspace=apps/api-gateway

FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 zonforge && \
    adduser -D -u 1001 -G zonforge zonforge
WORKDIR /app
COPY --from=builder --chown=zonforge:zonforge /app/packages ./packages
COPY --from=builder --chown=zonforge:zonforge /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=deps    --chown=zonforge:zonforge /app/node_modules ./node_modules
COPY --from=deps    --chown=zonforge:zonforge /app/apps/api-gateway/package.json ./apps/api-gateway/
COPY --from=deps    --chown=zonforge:zonforge /app/package.json ./
USER zonforge
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api-gateway/dist/index.js"]
