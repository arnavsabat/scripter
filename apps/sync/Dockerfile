# The sync server image (local 3-node cluster now; ECS Fargate later). Built from the repo root:
#   docker compose --profile cluster up --build
FROM node:24.12.0-alpine
WORKDIR /repo
RUN corepack enable
# Install only what the sync server needs (and its workspace dependency @wr/shared).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/sync/package.json apps/sync/
COPY packages/shared/package.json packages/shared/
RUN COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile --filter "@wr/sync..."
COPY packages/shared packages/shared
COPY apps/sync apps/sync
WORKDIR /repo/apps/sync
EXPOSE 4000
CMD ["node", "--import", "tsx", "src/main.ts"]
