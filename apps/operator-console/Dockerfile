# syntax=docker/dockerfile:1.7
FROM node:26-alpine AS node-base
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    apk upgrade --no-cache \
    && npm install --global npm@12.0.2 --no-audit --no-fund

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
    npm ci --workspace @tx-bootstrap/core --workspace @tx-bootstrap/operator-console --include-workspace-root=false --ignore-scripts --no-audit --no-fund

FROM deps AS build
COPY packages/core ./packages/core
COPY packages/ui-runtime ./packages/ui-runtime
COPY apps/operator-console ./apps/operator-console
RUN npm run build --workspace @tx-bootstrap/operator-console

FROM node-base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    npm_config_update_notifier=false \
    OPERATOR_MIGRATIONS_DIR=/app/db/migrations \
    PORT=3000

RUN apk add --no-cache dumb-init wget

COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/ui-runtime/package.json ./packages/ui-runtime/package.json
COPY apps/operator-console/package.json ./apps/operator-console/package.json
COPY apps/operator-onboarding-service/package.json ./apps/operator-onboarding-service/package.json
COPY apps/participant-portal/package.json ./apps/participant-portal/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --workspace @tx-bootstrap/core --workspace @tx-bootstrap/operator-console --include-workspace-root=false --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=build --chown=node:node /app/apps/operator-console/dist ./apps/operator-console/dist
COPY --from=build --chown=node:node /app/apps/operator-console/dist-server ./apps/operator-console/dist-server
COPY --chown=node:node packages/core/db/migrations /app/db/migrations
WORKDIR /app/apps/operator-console
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist-server/apps/operator-console/server/index.js"]
