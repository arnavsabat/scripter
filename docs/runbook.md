# Scripter: Runbook

How to deploy, check, operate and repair the closed beta, and how to run the load tests on AWS. Every command runs in your own terminal (the VS Code terminal is fine), from the repo root unless it says otherwise, with your AWS profile:

```sh
export AWS_PROFILE=writers-room   # your AWS CLI profile (the name it has on your machine)
```

Credentials and secrets stay on your machine: Claude never handles them (D-061). The architecture is in the README; the decisions behind it are D-082 to D-094.

**Status of this runbook (2026-10-28):** every stack is built, synthesized and tested (`pnpm --filter @wr/infra synth`, `infra/test/stacks.test.ts`), and the server and load-test images were built and run locally. Nothing in Parts 2-8 has run against AWS yet: the deploy waits for your go-ahead (D-089). The first real deploy is the end-to-end run of this document; fix anything it gets wrong in the same commit.

---

## Part 1. Before the first deploy (once)

1. **Docker running** (OrbStack). CDK builds the server image during `cdk deploy`.
2. **The domain's DNS in Route 53** (D-096, D-097). `scripter.ca` is registered at Porkbun; its records live in a Route 53 zone that the `WrDns` stack makes.
   1. In `infra/.env.local`, add `WR_DOMAIN=scripter.ca` (nothing else yet), then:
      ```sh
      pnpm --filter @wr/infra deploy:dns
      ```
      It prints `WrDns.HostedZoneId` and `WrDns.NameServers` (four `ns-….awsdns-…` names).
      If it says `No stacks match the name(s) WrDns`, the `WR_DOMAIN` line isn't in `infra/.env.local` (saved, uncommented). `cd infra && npx cdk list` must show `WrDns`.
   2. At Porkbun: Domain Management → `scripter.ca` → **Authoritative Nameservers** → Edit. Replace Porkbun's with the four from `NameServers`, and save. If the domain shows **DNSSEC** records, delete them first, or the domain stops resolving.
   3. Wait until the world sees the switch (minutes, sometimes a few hours for `.ca`):
      ```sh
      dig +short NS scripter.ca      # must print the four awsdns names
      ```
   4. Add `WR_HOSTED_ZONE_ID=<WrDns.HostedZoneId>` to `infra/.env.local`. From now on every stack uses the domain:
      - the site at `https://scripter.ca`, added to the app URLs by itself;
      - sign-in at `auth.scripter.ca`;
      - mail from `no-reply@scripter.ca`.
3. **The AWS plan.** The account is on the free plan (D-038): it can't be charged, and spends its credits ($119.98 on 2026-10-28, until 2027-04-26; check with `aws freetier get-account-plan-state --region us-east-1`). With the servers down between sessions it uses about $4-5 a month, and about $1.20 a day while they're up (D-096), so the credits last until April.
   - AWS pays $20 more each for trying EC2, RDS, Lambda and Bedrock from the console home's **Explore AWS** panel. Launch something tiny and delete it.
   - Don't turn on AWS Organizations, IAM Identity Center or Control Tower: any of them converts the account to paid.
   - Before 2027-04-26, decide whether to upgrade to paid (then it bills, at the same small amounts) or let the account close.
4. **Postgres version.** `infra/src/data.ts` asks for Postgres 18.6 (the newest on 2026-10-28). Check what RDS offers in us-east-2 that day, and use the newest 18.x:
   ```sh
   aws rds describe-db-engine-versions --engine postgres --region us-east-2 \
     --query "DBEngineVersions[?starts_with(EngineVersion,'18')].EngineVersion" --output text
   ```

## Part 2. Deploying

In order; each takes a few minutes. `pnpm --filter @wr/infra diff` shows what any of them would change first.

```sh
pnpm --filter @wr/infra deploy:email   # the domain identity, its DKIM and DMARC records
```

**Wait until SES has verified the domain** (usually minutes once DKIM's records are in Route 53):

```sh
aws sesv2 get-email-identity --email-identity scripter.ca --query VerifiedForSendingStatus   # true
```

Cognito refuses to send from `no-reply@scripter.ca` until then. Then:

```sh
pnpm --filter @wr/infra deploy:auth    # Cognito: mail from no-reply@scripter.ca; scripter.ca for Google
pnpm --filter @wr/infra deploy:data    # the network, Postgres, DynamoDB, the snapshot bucket (kept forever)
pnpm --filter @wr/infra deploy:cert    # the certificate for scripter.ca and auth.scripter.ca, in us-east-1
pnpm --filter @wr/infra deploy:app     # = beta:up: builds the web app; CloudFront, sign-in domain, load balancer, two tasks
```

The first `deploy:app` takes longer (often 15-30 minutes): CloudFront, and Cognito's `auth.scripter.ca`, which runs its own CloudFront distribution. It prints:

- `WrApp.Url`: `https://scripter.ca`;
- `WrApp.GoogleRedirectUri`: `https://auth.scripter.ca/oauth2/idpresponse`.

**Google:** in the Google Cloud console, open the OAuth client → **Authorized redirect URIs** → add `WrApp.GoogleRedirectUri`. Keep the old `amazoncognito.com` one until you've seen Google sign-in work on `scripter.ca`.

**Confirm the alarm email.** AWS emails `WR_ALERT_EMAIL` a "Subscription confirmation" link for the alerts topic. Click it, or no alarm will ever reach you.

## Part 3. Checking a deploy (do this every time the servers come up)

1. **The API:** `curl https://scripter.ca/api/health` should print `{"ok":true}`.
2. **The servers:** in the ECS console (cluster from `WrApp.ClusterName`), the service has 2 running tasks. Under EC2 → Target groups, both target groups (API, sync) show 2 healthy targets.
3. **Sign in** with an email code (it comes from `no-reply@scripter.ca`), then with Google (the address bar passes through `auth.scripter.ca`).
4. **Write:** open a script, type, and reload. The toolbar must not stay on "Reconnecting…", and your typing must still be there. This proves the WebSocket works through CloudFront's VPC origin (D-091), the one thing synth can't check. If it fails, look at the sync logs (step 7). If CloudFront isn't upgrading the connection, tell Claude: the fallback is an internet-facing load balancer for `/doc/*` only, locked to CloudFront by a secret header.
5. **Two writers:** in a second browser (or Incognito), open the same script and watch each other's typing and cursors.
6. **A failover drill** (D-096: the two tasks are a cluster). While both windows type, stop one task: ECS console → the service → Tasks → pick one → Stop. Writing pauses for about 6-8 s ("Reconnecting…") and carries on, with nothing lost, while ECS starts a replacement. The sync logs show the other task taking the script's lease.
7. **The logs:**
   ```sh
   aws logs tail <WrApp.LogGroup> --follow --since 10m      # api/…, sync/… and purge/… streams
   ```
   On the first start, the API logs `migrations applied`, and the sync server logs `sync server listening`.

## Part 4. Opening the beta to testers

Not needed while you're the only tester (you're on both allow-lists). Do both before `scripter.ca` goes on a resume or to anyone else, so whoever clicks it can sign in.

1. **SES production access.** SES starts in a sandbox: it delivers only to addresses verified by hand, at most 200 a day. In the SES console (us-east-2), choose Account dashboard → Request production access:
   - **Mail type:** transactional.
   - **Website:** `https://scripter.ca`.
   - **Use case,** for example: "Transactional email only: one-time sign-in codes and invitations for Scripter, a screenwriting app in closed beta. Recipients sign up themselves. No marketing. Bounces and complaints are handled by Cognito and SES defaults."
   - AWS usually answers within a day.
2. **Google's consent screen.** The OAuth app is in Testing, so only its listed test users can use Google sign-in. In the Google Cloud console → Google Auth Platform:
   - **Branding:**
     - **App name:** Scripter.
     - **Support email:** yours.
     - **Home page:** `https://scripter.ca`.
     - **Privacy policy:** `https://scripter.ca/privacy`.
     - **Terms:** `https://scripter.ca/terms`.
     - **Authorized domain:** `scripter.ca`.
   - **Audience:** Publish app. We ask only for name and email, so Google needs no security review, though it may take a few days to verify the branding.
3. **Invite:** create the series on Home, then Members → invite by email. The invitation link signs them up and joins them.

## Part 5. Everyday operations

### Deploying an update

`pnpm check` (and `pnpm test:services`) green, committed and pushed, then:

```sh
pnpm --filter @wr/infra deploy:app
```

Run it with the servers up (`deploy:app` is `beta:up`). ECS starts the new tasks before it stops the old ones. For a few seconds four sync servers run, and the leases hand scripts over (D-022). If the new task never becomes healthy, the deployment circuit breaker rolls it back by itself. To go back by hand: `git checkout <previous commit>`, then `deploy:app` again, then `git checkout main`.

**Migrations** run when the API starts (`WR_MIGRATE_ON_START`). They are new numbered files only; never edit an applied one. Before a migration that drops or rewrites data, take a manual snapshot first:

```sh
aws rds create-db-snapshot --db-instance-identifier <id> --db-snapshot-identifier before-005
```

(The instance ID is under RDS → Databases, in the `WrData` stack.)

### Reading the beta metrics

Postgres is in an isolated subnet, so reach it from **CloudShell in the VPC**:

1. Open CloudShell (us-east-2) and choose Actions → Create VPC environment.
   - **VPC:** WrData's.
   - **Subnet:** one of `WrApp.PrivateSubnets`.
   - **Security group:** `WrApp.ServersGroup`, which is allowed into Postgres.
2. In it:
   ```sh
   sudo dnf install -y postgresql16
   curl -so rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   aws secretsmanager get-secret-value --secret-id wr/postgres --query SecretString --output text
   psql "host=<the secret's host> dbname=scripter user=wr sslmode=verify-full sslrootcert=rds-ca.pem"
   ```
3. Paste the queries from `docs/metrics.md`, after `\set excluded` with your own addresses.

### The daily purge

At 09:00 UTC a short task erases what was deleted more than 30 days ago (D-090). It logs `purge finished` with counts, and a failure raises the `PurgeFailed` alarm. For a dry run by hand:

```sh
aws ecs run-task --cluster <WrApp.ClusterName> --task-definition <WrApp.PurgeTaskDefinition> \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<a WrApp.PublicSubnets id>],securityGroups=[<WrApp.ServersGroup>],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"purge","command":["node","purge.js","--dry-run"]}]}'
```

## Part 6. When an alarm emails you

| Alarm | What it means | What to do |
|---|---|---|
| `ApiDown` / `SyncDown` | No healthy API or sync target for 3 minutes: both tasks are gone. | ECS console → the service → Events. One lost task is a 6-8 s failover to the other (D-096); losing both (Spot reclaiming both) means a minute or two until replacements start, while writers keep typing on their device and lose nothing (D-082). If tasks keep failing, read the stopped task's reason and the logs, and roll back. |
| `ServerErrors` | 5 or more 5xx errors from the servers in 5 minutes. | Logs: look for `"level":50` (Fastify errors) in `api/…`. |
| `EditLogTrouble` | An append, snapshot, truncate or room load failed. | Logs: the `sync/…` stream's `error` lines. DynamoDB throttling or an outage shows here; writers' edits wait on their devices and resend (zero lost edits), but nothing new becomes durable until it clears (Known risks). |
| `CrashBurst` | 20 or more browser crash reports in an hour (D-083). | Logs: `browser error` lines show the message, stack and app version. A fresh release is the usual cause: roll back. |
| `PurgeFailed` | The daily purge failed. | Logs: the `purge/…` stream. It's safe to rerun (Part 5): it picks up where it stopped. |
| `DbStorageLow` / `DbBusy` | Postgres has under 2 GB free, or is over 80% CPU for 15 minutes. | Storage grows by itself up to 50 GB. Persistent CPU means a bad query; check RDS Performance Insights. |

### Restoring from a backup

Restore into a **new** resource, check it, then point the app at it. Never overwrite the live one.

- **Postgres:**
  1. In the RDS console, open the database and choose Actions → Restore to point in time, any moment in the last 7 days, as a new instance.
  2. Check it from CloudShell (Part 5).
  3. To switch, change `PGHOST` in `infra/src/beta.ts` to the new endpoint and run `deploy:app`.
- **DynamoDB:**
  1. In the DynamoDB console, open the table and choose Backups → Restore to point in time, as a new table, within the last 7 days.
  2. To switch, set `WR_EDIT_LOG_TABLE` (or `WR_COORDINATION_TABLE`) to the new table, and run `deploy:app`.

## Part 7. Load tests on AWS (D-082, D-093)

They give the resume's numbers. You need `WrData` deployed (it provides the network); `WrApp` can be down (`beta:down`), which saves its cost meanwhile. Budget roughly $5-10 for the four scenarios, mostly DynamoDB writes (D-093).

```sh
pnpm --filter @wr/infra deploy:load            # 3 servers
# for the ramp, one server instead:  (cd infra && npx cdk deploy WrLoad -c loadServers=1)
```

It prints `WrLoad.ClusterName`, `GeneratorTaskDefinition`, `ServersUrl`, `Subnets`, `SecurityGroup` and `LogGroup`. Start the generator once per scenario:

```sh
aws ecs run-task --cluster <ClusterName> --task-definition <GeneratorTaskDefinition> --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<one of Subnets>],securityGroups=[<SecurityGroup>],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"generator","command":["node","run.js","rooms","--servers","<ServersUrl>","--json"]}]}'
```

The commands, one at a time (each runs and stops by itself):

- **`rooms`:** `["node","run.js","rooms","--servers","<ServersUrl>","--json"]`. That's 1,000 writers in 200 scripts, for 3 minutes.
- **`room15`:** the same with `room15`.
- **`failover`:** `["node","run.js","failover","--servers","<ServersUrl>","--crash-member","--json"]`. A live server is crashed 50 s in.
- **`ramp`:** with the 1-server cluster, `["node","run.js","ramp","--servers","<ServersUrl>","--json"]`.

Read each result back (it's one JSON line):

```sh
aws logs filter-log-events --log-group-name <LogGroup> --filter-pattern LOADTEST_RESULT \
  --query 'events[-1].message' --output text | sed 's/^LOADTEST_RESULT //' > tools/loadtest/results/aws-rooms.json
```

Then put the numbers in `docs/metrics.md`, and **tear it down**:

```sh
pnpm --filter @wr/infra destroy:load
```

The servers' own logs (`sync/…` streams) show the failover from their side: who took which lease, and when.

## Part 8. Servers up and down, costs and teardown

The beta's servers run on demand (D-096, D-097):

```sh
pnpm --filter @wr/infra beta:down   # after a session: no load balancer or tasks; Postgres stopped
pnpm --filter @wr/infra beta:up     # before one (about 10 minutes): Postgres started, then the servers
```

- **While down:**
  - `scripter.ca` stays up and shows "Can't reach Scripter" (the API and sync answer 503 at CloudFront).
  - Your scripts are safe in DynamoDB, S3 and the stopped Postgres.
  - The daily purge and the servers' alarms are off, so deletions older than 30 days wait for the next time the servers are up.
  - AWS starts a database that has been stopped for 7 days; a nightly schedule (10:00 UTC) stops it again.
- **Costs:** about $4-5 a month while down (Postgres storage, secrets, the hosted zone), about $1.20 a day while up (mostly the load balancer and Postgres). Billing → Cost Explorer shows them by service, and the budget alarms email you at $20 and $40.
- **Tear the app down entirely:** `cd infra && npx cdk destroy WrApp`. The data stack keeps everything: Postgres (with deletion protection), the tables and the bucket. The hosted zone (`WrDns`) is kept too.
- **Changing secrets** (no automatic rotation is set up):
  - **The cluster secret:** set a new value with `aws secretsmanager put-secret-value --secret-id wr/cluster-secret --secret-string <new>`, then run `deploy:app` so the task picks it up.
  - **The Postgres password:** set it with `aws rds modify-db-instance --db-instance-identifier <id> --master-user-password <new> --apply-immediately`, update the `password` field of `wr/postgres` to match, then run `deploy:app`.
