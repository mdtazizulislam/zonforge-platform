# ZonForge Sentinel — threat-intel-service Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json turbo.json tsconfig.base.json ./
COPY packages/shared-types/package.json  ./packages/shared-types/
COPY packages/db-client/package.json     ./packages/db-client/
COPY packages/logger/package.json        ./packages/logger/
COPY packages/config/package.json        ./packages/config/
COPY apps/threat-intel-service/package.json ./apps/threat-intel-service/
RUN npm install --workspace=apps/threat-intel-service \
    --workspace=packages/shared-types \
    --workspace=packages/db-client \
    --workspace=packages/logger \
    --workspace=packages/config \
    --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY turbo.json tsconfig.base.json package.json ./
COPY packages/ ./packages/
COPY apps/threat-intel-service/ ./apps/threat-intel-service/
COPY collectors/collector-base/src ./collectors/collector-base/src
RUN npm run build --workspace=packages/shared-types && \
    npm run build --workspace=packages/db-client && \
    npm run build --workspace=packages/logger && \
    npm run build --workspace=packages/config && \
    npm run build --workspace=apps/threat-intel-service

FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 zonforge && \
    adduser -D -u 1001 -G zonforge zonforge
WORKDIR /app
COPY --from=builder --chown=zonforge:zonforge /app/packages ./packages
COPY --from=builder --chown=zonforge:zonforge /app/apps/threat-intel-service/dist ./apps/threat-intel-service/dist
COPY --from=deps    --chown=zonforge:zonforge /app/node_modules ./node_modules
COPY --from=deps    --chown=zonforge:zonforge /app/apps/threat-intel-service/package.json ./apps/threat-intel-service/
COPY --from=deps    --chown=zonforge:zonforge /app/package.json ./
USER zonforge
ENV NODE_ENV=production PORT=3004
EXPOSE 3004
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3004/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/threat-intel-service/dist/index.js"]
