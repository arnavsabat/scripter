# Writers' Room

A real-time collaborative screenwriting tool built like a TV writers' room (working title). Several writers edit the same episode at once with no conflicts, fork "what-if" versions of an episode, and send chosen scenes back into the main script. It looks and feels like Highland: fast, clean and minimal.

The systems centerpiece is a horizontally scaled sync service: one home server per script, chosen by consistent hashing; ownership leases with fencing tokens; a durable edit log; and failover with zero lost edits, measured by a load-test harness.

**Status:** editor core and the static Highland UI shell: one writer, local only, no server yet. See `docs/SPEC.md` for the full specification and `docs/decision-log.md` for every decision and why it was made.

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
pnpm services:up         # Postgres :5432, DynamoDB Local :8000, SeaweedFS S3 :8333
pnpm dev:web             # the script editor at http://localhost:5173
```

Open the app with `?reset` (`http://localhost:5173/?reset`) to start from a blank script. Until the sync server exists, the script is saved only in this browser's IndexedDB. That temporary store lives in `apps/web/src/editor/devStore.ts`.

The web integration tests run in real Chromium. Install it once with `pnpm --filter @wr/web exec playwright install chromium`.

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
