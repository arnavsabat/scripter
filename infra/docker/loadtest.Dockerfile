# The load-test image (D-093): the load-test sync server (trusts the run's key; never the
# production image) and the load generator. Built by WrLoad; from the repo root:
#   docker build -f infra/docker/loadtest.Dockerfile -t wr-loadtest .
FROM node:24.12.0-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY tools/loadtest/package.json tools/loadtest/
COPY apps/sync/package.json apps/sync/
COPY packages/shared/package.json packages/shared/
COPY packages/auth/package.json packages/auth/
RUN COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter "@wr/loadtest..."
COPY packages/shared packages/shared
COPY packages/auth/src packages/auth/src
COPY apps/sync/src apps/sync/src
COPY tools/loadtest/src tools/loadtest/src
COPY tools/loadtest/scripts tools/loadtest/scripts
RUN node tools/loadtest/scripts/bundle.mjs /out

FROM node:24.12.0-alpine
WORKDIR /app/bin
COPY --from=build /out ./
ENV NODE_ENV=production NODE_OPTIONS=--enable-source-maps
USER node
CMD ["node", "lt-server.js"]
