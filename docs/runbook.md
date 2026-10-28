# Scripter: Runbook

How to deploy, check, operate and repair the closed beta, and how to run the load tests on AWS. Every command runs in your own terminal (the VS Code terminal is fine), from the repo root unless it says otherwise, with your AWS profile:

```sh
export AWS_PROFILE=writers-room   # your AWS CLI profile (the name it has on your machine)
```

Credentials and secrets stay on your machine: Claude never handles them (D-061). The architecture is in the README; the decisions behind it are D-082 to D-094.

**Status of this runbook (2026-10-27):** every stack is built, synthesized and tested (`pnpm --filter @wr/infra synth`, `infra/test/stacks.test.ts`), and the server and load-test images were built and run locally. Nothing in Parts 2-8 has run against AWS yet: the deploy waits for your go-ahead (D-089). The first real deploy is the end-to-end run of this document; fix anything it gets wrong in the same commit.

---

## Part 1. Before the first deploy (once)

1. **Docker running** (OrbStack). CDK builds the server image during `cdk deploy`.
2. **The domain** (D-082). Buy it in the Route 53 console (Registered domains → Register), which also creates its hosted zone. Then, in `infra/.env.local`:
   ```sh
   WR_DOMAIN=yourdomain.com
   WR_HOSTED_ZONE_ID=Z0…          # Route 53 → Hosted zones → yourdomain.com
   WR_SENDER_EMAIL=codes@yourdomain.com
   WR_APP_URLS=http://localhost:5173,https://yourdomain.com
   ```
   Without a domain the beta still deploys, on CloudFront's own address (`https://d….cloudfront.net`), with SES in its sandbox.
3. **The AWS plan.** The account is on the free plan (D-038). Upgrade it to the paid plan before the beta (Billing console → Account plan), so nothing is closed when the credits run out. The budget alarms stay at $20 and $40 unless you change them (`infra/src/budgets.ts`). The beta runs at about $45-55 a month on demand (D-089), so expect the $40 email.
4. **Postgres version.** `infra/src/data.ts` asks for Postgres 18.3. Check what RDS offers in us-east-2 that day, and use the newest 18.x:
   ```sh
   aws rds describe-db-engine-versions --engine postgres --region us-east-2 \
     --query "DBEngineVersions[?starts_with(EngineVersion,'18')].EngineVersion" --output text
   ```

## Part 2. Deploying

In order; each takes a few minutes. `pnpm --filter @wr/infra diff` shows what any of them would change first.

```sh
pnpm --filter @wr/infra deploy:email   # with a domain: the domain identity, DKIM and DMARC records
pnpm --filter @wr/infra deploy:auth    # Cognito: deletion protection on; the app URLs for Google
pnpm --filter @wr/infra deploy:data    # the network, Postgres, DynamoDB, the snapshot bucket (kept forever)
pnpm --filter @wr/infra deploy:cert    # only with a domain: the certificate, in us-east-1
pnpm --filter @wr/infra deploy:app     # builds the web app, then CloudFront, the load balancer, the task
```

`deploy:app` prints `WrApp.Url`. **Without a domain**, add that URL to `WR_APP_URLS` and run `deploy:auth` again, so "Continue with Google" can return to it.

**Confirm the alarm email.** AWS emails `WR_ALERT_EMAIL` a "Subscription confirmation" link for the alerts topic. Click it, or no alarm will ever reach you.

## Part 3. Checking a deploy (do this every time)

1. **The API:** `curl https://<url>/api/health` should print `{"ok":true}`.
2. **The servers:** in the ECS console (cluster from `WrApp.ClusterName`), the service has 1 running task. Under EC2 → Target groups, both target groups (API, sync) show 1 healthy target.
3. **Sign in** with an email code, then with Google.
4. **Write:** open a script, type, and reload. The toolbar must not stay on "Reconnecting…", and your typing must still be there. This proves the WebSocket works through CloudFront's VPC origin (D-091), the one thing synth can't check. If it fails, look at the sync logs (step 6). If CloudFront isn't upgrading the connection, tell Claude: the fallback is an internet-facing load balancer for `/doc/*` only, locked to CloudFront by a secret header.
5. **Two writers:** in a second browser (or Incognito), open the same script and watch each other's typing and cursors.
6. **The logs:**
   ```sh
   aws logs tail <WrApp.LogGroup> --follow --since 10m      # api/…, sync/… and purge/… streams
   ```
   On the first start, the API logs `migrations applied`, and the sync server logs `sync server listening`.

## Part 4. Opening the beta to testers

1. **SES production access** (only with a domain). In the SES console (us-east-2), choose Account dashboard → Request production access. Use case, for example: "Transactional email only: one-time sign-in codes and invitations to a closed beta of a screenwriting app, about 50 recipients who signed up themselves. No marketing." AWS usually answers within a day. Until then, mail reaches only verified addresses.
2. **Google's consent screen.** In the Google Cloud console, under APIs & Services → OAuth consent screen, publish the app ("In production"), or add each tester under Test users (up to 100).
3. **Invite:** create the series on Home, then Members → invite by email. The invitation link signs them up and joins them.

## Part 5. Everyday operations

### Deploying an update

`pnpm check` (and `pnpm test:services`) green, committed and pushed, then:

```sh
pnpm --filter @wr/infra deploy:app
```

ECS starts the new task before it stops the old one. For a few seconds two sync servers run, and the leases hand scripts over (D-022). If the new task never becomes healthy, the deployment circuit breaker rolls it back by itself. To go back by hand: `git checkout <previous commit>`, then `deploy:app` again, then `git checkout main`.

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
| `ApiDown` / `SyncDown` | No healthy API or sync target for 3 minutes. | ECS console → the service → Events. A Spot interruption or a crash is replaced by itself in a minute or two; writers keep typing on their device meanwhile and nothing is lost (D-082). If tasks keep failing, read the stopped task's reason and the logs, and roll back. |
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

They give the resume's numbers. You need `WrData` deployed (it provides the network); `WrApp` doesn't have to be. Budget roughly $5-10 for the four scenarios, mostly DynamoDB writes (D-093).

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

## Part 8. Pausing, costs and teardown

- **Pause the servers** (between test sessions; writers can't connect meanwhile):
  ```sh
  aws ecs update-service --cluster <WrApp.ClusterName> --service <WrApp.ServiceName> --desired-count 0
  ```
  Set it back to 1 to resume. The load balancer (about $18 a month) and Postgres keep running.
- **Tear the app down:** `cd infra && npx cdk destroy WrApp`. The data stack keeps everything: Postgres (with deletion protection), the tables and the bucket.
- **Cost check:** Billing → Cost Explorer, by service. The budget alarms email you at $20 and $40.
- **Changing secrets** (no automatic rotation is set up):
  - **The cluster secret:** set a new value with `aws secretsmanager put-secret-value --secret-id wr/cluster-secret --secret-string <new>`, then run `deploy:app` so the task picks it up.
  - **The Postgres password:** set it with `aws rds modify-db-instance --db-instance-identifier <id> --master-user-password <new> --apply-immediately`, update the `password` field of `wr/postgres` to match, then run `deploy:app`.
