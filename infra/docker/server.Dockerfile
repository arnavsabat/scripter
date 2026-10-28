# The production server image (D-082, D-091): one image, four bundles. The ECS task runs the API
# (node api.js) and the sync server (node sync.js) as two containers from it; the daily purge
# runs node purge.js. ARM64, like the Graviton Fargate task. Built from the repo root:
#   docker build -f infra/docker/server.Dockerfile -t wr-server .
FROM node:24.12.0-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/sync/package.json apps/sync/
COPY packages/shared/package.json packages/shared/
COPY packages/auth/package.json packages/auth/
RUN COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter "@wr/api..." --filter "@wr/sync..."
COPY packages/shared packages/shared
COPY packages/auth/src packages/auth/src
COPY apps/api/src apps/api/src
COPY apps/sync/src apps/sync/src
COPY apps/sync/scripts apps/sync/scripts
RUN node apps/sync/scripts/bundle.mjs /out

FROM node:24.12.0-alpine
WORKDIR /app
# Amazon RDS's certificate authorities, so Postgres connections are verified (PGSSLMODE=verify-full).
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem
COPY --from=build /out ./
COPY apps/api/migrations ./migrations
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    NODE_EXTRA_CA_CERTS=/app/rds-ca.pem \
    WR_MIGRATIONS_DIR=/app/migrations
USER node
CMD ["node", "api.js"]
