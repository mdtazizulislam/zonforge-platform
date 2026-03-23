# ZonForge Sentinel — tenant-service Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json   ./packages/shared-types/
COPY packages/event-schema/package.json   ./packages/event-schema/
COPY packages/db-client/package.json      ./packages/db-client/
COPY packages/auth-utils/package.json     ./packages/auth-utils/
COPY packages/logger/package.json         ./packages/logger/
COPY packages/config/package.json         ./packages/config/
COPY apps/tenant-service/package.json     ./apps/tenant-service/
RUN npm install --workspace=apps/tenant-service \
    --workspace=packages/shared-types \
    --workspace=packages/event-schema \
    --workspace=packages/db-client \
    --workspace=packages/auth-utils \
    --workspace=packages/logger \
    --workspace=packages/config \
    --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages     ./packages
COPY turbo.json tsconfig.base.json package.json ./
COPY packages/ ./packages/
COPY apps/tenant-service/ ./apps/tenant-service/
RUN npm run build --workspace=packages/shared-types && \
    npm run build --workspace=packages/event-schema && \
    npm run build --workspace=packages/db-client && \
    npm run build --workspace=packages/config && \
    npm run build --workspace=packages/logger && \
    npm run build --workspace=packages/auth-utils && \
    npm run build --workspace=apps/tenant-service

FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 zonforge && \
    adduser -D -u 1001 -G zonforge zonforge
WORKDIR /app
COPY --from=builder --chown=zonforge:zonforge /app/packages ./packages
COPY --from=builder --chown=zonforge:zonforge /app/apps/tenant-service/dist ./apps/tenant-service/dist
COPY --from=deps    --chown=zonforge:zonforge /app/node_modules ./node_modules
COPY --from=deps    --chown=zonforge:zonforge /app/apps/tenant-service/package.json ./apps/tenant-service/
COPY --from=deps    --chown=zonforge:zonforge /app/package.json ./
USER zonforge
ENV NODE_ENV=production PORT=3101
EXPOSE 3101
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3101/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/tenant-service/dist/index.js"]
