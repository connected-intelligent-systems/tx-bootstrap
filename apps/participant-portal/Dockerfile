# syntax=docker/dockerfile:1.7
FROM node:26-alpine AS node-base
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --global npm@12.0.1 --no-audit --no-fund

FROM node-base AS deps
WORKDIR /app
ENV npm_config_update_notifier=false
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/ui-runtime/package.json ./packages/ui-runtime/package.json
COPY apps/operator-console/package.json ./apps/operator-console/package.json
COPY apps/operator-onboarding-service/package.json ./apps/operator-onboarding-service/package.json
COPY apps/participant-portal/package.json ./apps/participant-portal/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --workspace @tx-bootstrap/core --workspace @tx-bootstrap/participant-portal --include-workspace-root=false --ignore-scripts --no-audit --no-fund

FROM deps AS builder
COPY packages/core ./packages/core
COPY packages/ui-runtime ./packages/ui-runtime
COPY apps/participant-portal/index.html apps/participant-portal/tsconfig.json apps/participant-portal/tsconfig.server.json apps/participant-portal/vite.config.ts apps/participant-portal/vitest.config.ts ./apps/participant-portal/
COPY apps/participant-portal/public ./apps/participant-portal/public
COPY apps/participant-portal/src ./apps/participant-portal/src
COPY apps/participant-portal/server ./apps/participant-portal/server
RUN npm run build --workspace @tx-bootstrap/participant-portal

FROM node-base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    npm_config_update_notifier=false \
    PARTICIPANT_PORTAL_MIGRATIONS_DIR=/app/db/migrations \
    PORT=3000

RUN apk add --no-cache dumb-init

COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/ui-runtime/package.json ./packages/ui-runtime/package.json
COPY apps/operator-console/package.json ./apps/operator-console/package.json
COPY apps/operator-onboarding-service/package.json ./apps/operator-onboarding-service/package.json
COPY apps/participant-portal/package.json ./apps/participant-portal/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --workspace @tx-bootstrap/core --workspace @tx-bootstrap/participant-portal --include-workspace-root=false --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY --from=builder --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=node:node /app/packages/ui-runtime/dist ./packages/ui-runtime/dist
COPY --from=builder --chown=node:node /app/apps/participant-portal/dist ./apps/participant-portal/dist
COPY --from=builder --chown=node:node /app/apps/participant-portal/dist-server ./apps/participant-portal/dist-server
COPY --chown=node:node apps/participant-portal/db/migrations /app/db/migrations
WORKDIR /app/apps/participant-portal
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist-server/server/index.js"]
