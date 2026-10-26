# Writers' Room

A real-time collaborative screenwriting tool built like a TV writers' room (working title). Several writers edit the same episode at once with no conflicts, fork "what-if" versions of an episode, and send chosen scenes back into the main script. It looks and feels like Highland: fast, clean and minimal.

The systems centerpiece is a horizontally scaled sync service: one home server per script, chosen by consistent hashing; ownership leases with fencing tokens; a durable edit log; and failover with zero lost edits, measured by a load-test harness.

**Status:** real-time co-writing on a horizontally scaled sync cluster: consistent hashing, leases with fencing tokens, failover, and graceful rebalancing, with zero lost edits under chaos tests. See `docs/SPEC.md` for the full specification and `docs/decision-log.md` for every decision and why it was made.

## Repo layout

```
apps/
  web/           React + Vite client, plain CSS on the design tokens
  sync/          Node WebSocket sync server on Yjs's y-protocols (home servers, leases, edit log)
  api/           Fastify REST API (accounts, series, episodes, roles, invitations)
packages/
  schema/        ProseMirror schema, element types, Enter/Tab state machine, ID plugin
  pagination/    Pure pagination function (document blocks in, page breaks out)
  shared/        Shared types, the wire protocol, and tokens.css (design tokens)
infra/           AWS CDK app (TypeScript); infra/local holds local-service config
tools/
  loadtest/      Load-test harness for the sync service
docs/
  SPEC.md        Specification (product, design system, editor, architecture, plan)
  decision-log.md
  prototype/     Interactive HTML prototype: the visual and interaction source of truth
```

## Getting started

Requirements: Node 24.12 (see `.node-version`), corepack (ships with Node), and a container runtime for local services (Docker Desktop, OrbStack or Colima).

```sh
corepack enable          # once per machine; provides the pinned pnpm version
pnpm install
cp .env.example .env     # local-only settings for the services below
pnpm services:up         # Postgres :5432, DynamoDB Local :8000, SeaweedFS S3 :8333 (needs OrbStack or Docker)
pnpm --filter @wr/sync dev   # the sync server on :4000
pnpm dev:web             # the script editor on :5173
```

If `corepack enable` fails with `EACCES: permission denied` (it tries to write to `/usr/local/bin`), install the shims into your home folder instead:

```sh
mkdir -p ~/.local/bin
corepack enable --install-directory ~/.local/bin
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

**Signing in:** there's no development sign-in stub any more (D-030, D-046). The API and the sync servers trust only the Cognito user pool named in `.env`, so running the app locally needs that pool, which is created in accounts step 8. Until then, the automated tests sign in with a per-run test key and cover every role rule.

**A 3-server cluster:** `pnpm cluster:up` builds the sync server image and starts `sync-1`, `sync-2` and `sync-3` on `localhost:4001`-`4003` (plus the services). Point the web app at all three with `VITE_SYNC_URLS=ws://localhost:4001,ws://localhost:4002,ws://localhost:4003 pnpm dev:web`. Kill one (`docker kill writers-room-sync-2-1`), freeze one (`docker pause` / `docker unpause`), or stop one gracefully (`docker stop`) while writing. `pnpm cluster:down` stops them. How it all works is in `docs/sync-cluster.md`.

**Without containers:** `WR_STORAGE=memory pnpm --filter @wr/sync dev` keeps the edit log and snapshots in the server's memory (development only; nothing survives a restart). It still needs Postgres and the Cognito settings for sign-in and permissions.

**Tests:** `pnpm test` runs everything that needs no containers. The web integration tests run in real Chromium; install it once with `pnpm --filter @wr/web exec playwright install chromium`. With the services up, `pnpm test:services` runs the API's Postgres tests (permissions, invitations, sign-in against a fake Cognito, and the sync server enforcing roles end to end) and the sync server's DynamoDB and S3 storage and fencing tests, and `pnpm --filter @wr/sync test:chaos` runs the chaos suite. That suite starts three real server processes and kills one mid-typing (SIGKILL), freezes one until it's fenced off (SIGSTOP/SIGCONT), and adds and removes servers, printing the pause writers saw.

## Scripts

| Command                              | What it does                                                 |
| ------------------------------------ | ------------------------------------------------------------ |
| `pnpm check`                         | Format check, lint, typecheck and tests: the pre-commit gate |
| `pnpm test`                          | Vitest, one project per workspace folder                     |
| `pnpm typecheck`                     | `tsc --noEmit` in every package                              |
| `pnpm lint`                          | ESLint with type-aware rules                                 |
| `pnpm format`                        | Prettier (skips `docs/`)                                     |
| `pnpm services:up` / `services:down` | Start or stop the local services                             |

## Local services

| Service                     | Stands in for                                            | Port |
| --------------------------- | -------------------------------------------------------- | ---- |
| Postgres 18.6               | Users, series, episodes, roles, drafts, snapshot records | 5432 |
| DynamoDB Local 3.3.1        | Edit log, ownership leases, server membership            | 8000 |
| SeaweedFS 4.48 (S3 gateway) | S3 snapshot storage                                      | 8333 |

The credentials in `docker-compose.yml`, `.env.example` and `infra/local/` are for local development only.
