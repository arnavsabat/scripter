# Scripter: Decision Log

The running record of every decision, technical pivot, issue, blocker and deviation on Scripter (called Writers' Room, its working title, until D-096; earlier entries keep that name). It has lived in the repo since October 20, 2026; the history before that was exported from planning chats and is kept word for word at the bottom of this file.

How to read it:

- The sections at the top (Decided through Known risks) are the **current state**. They are rewritten as things change.
- **Log entries** are the permanent, dated history. Entries are never deleted or edited after the fact. A changed decision gets a new entry that names the one it supersedes.
- `docs/SPEC.md` is the specification. Wherever an older entry (especially in the imported log) conflicts with SPEC.md, **SPEC.md wins**. D-005 lists every conflict found so far.
- "Arnav's call" means Arnav decided it. "Claude's proposal, awaiting Arnav" means it is not settled until Arnav confirms.

---

## Decided

The full specification is `docs/SPEC.md`; this is the index. Entry numbers point to the reasoning.

- **Product and scope:** SPEC Part 2. A Highland-style, real-time collaborative screenwriting tool for small rooms, pairs and solo writers, with what-ifs and Send to main. No AI in v1. The systems work (scaled sync service plus load tests) is the centerpiece.
- **Design system and UI:** SPEC Part 3, except three tokens nudged for contrast (D-086). The prototype (`docs/prototype/writers-room-prototype.html`) is the visual and interaction source of truth, except for page geometry (D-003). Tokens live in `packages/shared/tokens.css` (D-006).
- **Editor behavior:** SPEC Part 4. Flat ProseMirror block schema, Enter/Tab state machine (defaults, to be confirmed in the editor phase), permissive schema with visible fixes, Yjs per-user undo.
- **Architecture:** SPEC Part 5 and D-002. pnpm TypeScript monorepo; React + Vite; custom y-protocols sync server; Fastify; Postgres; DynamoDB for edit log, leases and membership; S3 snapshots; Cognito; CDK; lean AWS.
- **Page geometry:** true screenplay geometry at 96 px per inch (D-003).
- **Beta-readiness phase, built (D-083 to D-094):**
  - **Usage:** server-side counting plus three browser events; crash reports go to the logs; the beta metrics are SQL in `docs/metrics.md` (D-083).
  - **States:** skeletons, the "can't reach" notice, crash boundaries per panel and page, and empty notes (D-084, D-085).
  - **Accessibility:** an audit in CI, three tokens nudged for contrast, and a way out of the page through the element menu (D-086).
  - **Performance:** budgets for three writers on 110 pages (D-087).
  - **Parity:** a guard against prototype v2 (D-088).
  - **The 30-day purge** (D-090).
  - **The deploy stacks:** `WrData`, `WrApp`, `WrCert` (D-091).
  - **Load tests:** the harness (D-092) and the load-test cluster `WrLoad` (D-093).
  - **The Privacy Policy** brought up to date, and 7-day recovery (D-094).
- **The certificate (D-099):** made in us-east-1 by `infra/scripts/cert.sh`, not a stack, because the free plan forbids CloudFormation there; `WrApp` uses it by ARN (`WR_CERTIFICATE_ARN`).
- **Postgres backups (D-098):** 1 day while the AWS account is on the free plan (its limit), 7 after the upgrade (`WR_ACCOUNT_PLAN=paid`). The writing keeps DynamoDB's 7-day recovery throughout.
- **Name, domain and hosting (D-096, built in D-097):** the product is Scripter, at `scripter.ca`, with DNS in Route 53. The beta's servers run on demand (`beta:up` / `beta:down`), as two Fargate Spot tasks while up; CloudFront and the web app stay up throughout.
- **Browsers (D-089):** Chrome, Edge and Safari supported; Firefox works, with a one-time note that a few lines may wrap differently on screen.
- **Beta-readiness phase (D-082):** RDS `db.t4g.micro` Postgres with 7-day backups; a domain bought now; CloudWatch logs, alarms and browser crash reports; load tests proven locally, then run once on a temporary AWS cluster against the rooms + capacity targets; usage events recorded where they happen, with a user and an episode ID; the beta metrics as SQL in `docs/metrics.md`; esbuild bundles for the production servers.
- **Unsynced edits:** closing or reloading a script that has edits the server hasn't acknowledged brings up the browser's leave prompt (D-069).
- **Local S3-compatible store:** SeaweedFS (D-004).
- **Plan:** SPEC Part 6. Spike first (2-3 days, gates the stack); Phase 1 with a hard checkpoint at the end of week 6 and a fixed cut order; Phase 2; closed beta; Phase 3; beta hardening. v1 is roughly 8.5-10.5 weeks after the spike.
- **Where the log lives:** in the repo, alongside SPEC.md and CLAUDE.md (D-001).
- **Hosting the code:** a public GitHub repo, `arnavsabat/scripter` (renamed from `writers-room` on 2026-10-28, D-096), as `origin`; `main` is pushed (D-008).
- **Tooling:** the D-006 defaults are confirmed, including TypeScript 6.0.3 instead of 7.0 (D-009).
- **Revision colors:** all out of v1. That means no page colors, no margin asterisks after sends, and no snapshot color tags. The prototype's "BLUE" snapshot tag is not built (D-009).
- **Spike binding:** the stable line, `yjs` 13.6.33 with `y-prosemirror` 1.3.7 (D-010).
- **Spike harness:** all 8 tests run in real headless Chromium (Vitest browser mode with Playwright), plus a two-editor demo page (D-011).
- **Spike outcome (D-013):** Yjs 13.6 + y-prosemirror 1.3.7. The element type is an attribute on one `block` node. Split degradation is accepted for v1. Fix-ups after remote changes are deferred and deterministic. The viewport is anchored to the cursor's block. Every block type is protected from undo deletion, and every decoration is recomputed from the document. `spike/` is deleted; `docs/spike-report.md` stays.
- **Editor details (D-014):**
  - Esc opens the element menu in the left margin.
  - Two blank lines before scene headings.
  - Formatting warnings are a muted-red triangle in the margin, for orphan dialogue and parentheticals.
  - FD-style key rules fill the gaps in 4.2.
  - Uppercase elements are shown in caps but stored as typed.
  - Dev-only persistence is a small hand-written IndexedDB store, with no new library.
- **Workflow (D-015):** push to GitHub after every commit. apps/web integration tests run in real Chromium (Vitest browser mode with Playwright).
- **Accounts phase step 8, part 1 built (D-055), choices confirmed (D-056): the CDK app. Deployed: the CDK bootstrap and `WrBudgets` (D-060), then `WrEmail` and `WrAuth` (D-061), then Google sign-in (D-063).**
  - **Stacks, deployed in order:** `WrBudgets` ($40 a month, emailing at $20 and $40 actual and $40 forecast), then `WrEmail` (SES identities for the sender and the demo's two addresses), then `WrAuth` (the Cognito pool on Essentials with passwordless email codes, case-insensitive email usernames, a public USER_AUTH-only client, the sign-in domain, and Google once configured).
  - **The API** sends invitations through SES when `WR_SENDER_EMAIL` is set.
- **Accounts phase step 7 built (D-053), choices confirmed (D-054): the Share menu.**
  - **Copy invite link** copies `/e/<episode>` and says "copied" only if it was.
  - **Invite co-writer…** is the checklist of the series' writers (toggle, with Undo). The showrunner also gets the invite row, whose invitations assign this episode on acceptance.
  - **Viewers and unassigned writers** see only Copy invite link.
- **Accounts phase step 6 built (D-051), choices confirmed (D-052): Home, the handoff, Members, deleting, renaming, the theme, "View only", losing access, and the safe sign-out, all in the real web app.**
  - **Removing a member** uses the inline confirm ("Remove Maya from The Long Night?" with Cancel / Remove), not an Undo toast. Prototype v2 is updated to match.
- **Signing out clears this browser's local script copies, safely (D-050).** It first checks that every edit reached the server. If any haven't (the writer is offline), a toast warns, with "Sign out anyway" and "Cancel".
- **Accounts phase step 5 built (D-048), choices confirmed (D-049): the web app's signed-out side.**
  - **Pages:** the sign-in page (Arnav's template), Terms, Privacy, and invitation links ("Join Fogline", accepted once signed in).
  - **Session:** the access token is kept in memory and renewed through the refresh cookie.
  - **Routing:** a tiny History-API router of our own.
  - **Tests:** the browser tests use a small fake API; the real API keeps its own tests.
  - **Removed:** the dev stub, from the browser too.
  - **The code screen** reads "We sent a code to …", with no digit count (D-049).
- **Accounts phase step 4 built (D-046), choices confirmed (D-047): the sync server enforces roles.**
  - **No dev stub.** The development stub is removed from the servers; they trust Cognito tokens only (the test key in tests).
  - **Access check at the home server.** It uses `canEdit` / `canView` through a pluggable access source (Postgres in production). View-only connections see everything, but their edits close with 4403.
  - **Access changes.** `NOTIFY wr_access` triggers a re-check: a changed connection gets 4403, a deleted one 4410.
  - **A fresh token on every connect.**
  - **Live status** is written by the home server.
  - **On 4403**, unsent edits are discarded with a notice. **On 4410** ("deleted"), the writer goes back to Home with a toast (the web side comes in step 6).
- **Accounts phase step 3 built (D-044), choices confirmed (D-045), signing in:**
  - **Email codes:** a new address signs up and gets the name step; a known one gets a sign-in code.
  - **Google** goes through Cognito with PKCE.
  - **Linking:** each sign-in is linked to one person per verified email.
  - **Sessions:** a 30-day httpOnly refresh cookie on `/api/auth`, refreshing, and signing out (which revokes the refresh token).
  - **Tested** against a local fake Cognito.
- **Accounts phase step 2 built (D-042), choices confirmed (D-043), the API:**
  - **Token checks:** `packages/auth` checks tokens for both the API and the sync server.
  - **The REST API:** series, scripts, episodes, members and roles, co-writers, invitations, deleting and restoring, RECENT, and live status.
  - **Access alerts:** `NOTIFY wr_access` on every access change.
  - **Rules:** RECENT is kept on the server; a series always keeps a showrunner.
- **Accounts phase step 1 built (D-040), choices confirmed (D-041):**
  - **Built:** the permission rules (`packages/shared/src/permissions.ts`), the first Postgres migration, and the migration runner.
  - **One person per verified email:** `users` plus `user_identities`, linked by the API at sign-in.
  - **Deleted items** are never loaded, so they have no access.
  - **Episode positions** are never reused; "Ep N" is the rank.
  - **Tests:** `pnpm check` runs without services, `pnpm test:services` runs with them, and each test file gets a throwaway database.
- **Prototype v2 approved (D-039)** as what the accounts phase builds to. The Privacy page's contact address is sabat.arnav@gmail.com, and account deletion is "within 30 days".
- **Region (D-058):** `us-east-2`, on the free plan. The account's organization policy forbids `ca-central-1` (D-030's choice).
- **AWS account plan (D-038):**
  - **Plan:** the AWS account is created only at step 8 of the accounts phase, on the **free plan**. That makes it $0 with no possible charges, and the 6-month clock starts as late as possible. It's upgraded to the paid plan when the closed beta starts.
  - **Admin access:** a plain IAM admin user, not IAM Identity Center, because setting up Organizations would force the upgrade.
  - **The domain is deferred until just before the beta** (supersedes D-030's timing). For the demo, SES's sandbox sends to Arnav's two verified addresses.
- **Deleting and + New series (D-037):**
  - **Deleting:** the showrunner can delete episodes, scripts and series. A × appears at the right end of the hovered row (home episode rows; sidebar script and series rows), and the row turns into an inline confirm ("Delete “…” for everyone?", Cancel, Delete). A series also needs its name typed first.
  - **Restoring:** deleted items wait 30 days under a RECENTLY DELETED sidebar section with Restore, then they're erased.
  - **+ New series** sits in the home toolbar before + New script. It creates an empty series with its title ready to type.
  - **A series stays a series** at one episode or none.
- **Prototype v2 (D-034):** `docs/prototype/writers-room-prototype-v2.html` is the visual and interaction source of truth from the accounts phase on. It's v1 plus D-026 to D-033. v1 stays unchanged as the record of what the earlier phases matched.
- **Home, naming and access cues (D-033):**
  - **Invitation email:** wording 1, Plain.
  - **Solo writers:** a one-episode series looks like a plain script (a SCRIPTS sidebar section, "Script · just you", no "Ep 1 ·"). It becomes a series at the 2nd episode, and renaming it renames the hidden series.
  - **New and renaming:** "+ New script" and "+ New episode" open the new script with its toolbar title selected for typing. Clicking the title renames it again, and the showrunner renames a series by clicking its title in the home header.
  - **Live status:** the home sync servers record who's connected (refreshed every 10 s, stale after 30 s) and the last-edit time (at most once a minute) in Postgres. Home polls the API every 15 s and whenever the tab regains focus.
  - **Read-only cue:** a 12 px muted "View only" after the draft switcher.
  - **Cookies:** `@fastify/cookie`.
- **Invitations and sharing (D-032):**
  - **Invitation links** are one-time, expire after 14 days and can be cancelled by the showrunner. Opening one and signing in, with any email, accepts it. Pending invitations also show under INVITATIONS for the invited address.
  - **Share › Copy invite link** copies a link to the episode: members land in it, and anyone else is told to ask the showrunner.
  - **Share › Invite co-writer…** is a checklist menu of the series' writers (✓ = assigned; click to toggle, with an Undo toast). The showrunner also gets an invite-by-email row at the bottom.
  - **The account avatar menu** shows the name and email as a header, then Sign out.
- **Accounts phase libraries and security model (D-031):**
  - **Postgres:** `pg` with hand-written SQL, and numbered `.sql` migrations applied by our own small runner.
  - **Auth libraries:** `jose` to verify JWTs (and to sign test tokens), and plain `fetch` for Cognito's JSON API.
  - **Tokens:** the refresh token lives in an httpOnly cookie set by our API, which makes the Cognito calls; the access token is kept in memory only.
  - **Permissions:** the home sync server reads roles and assignments from Postgres on connect and checks them through the shared `canEdit`. The API's `NOTIFY` makes home servers re-check open connections when a role or assignment changes.
- **Accounts phase choices (D-030):**
  - **Members** opens a collapsible 340 px right panel on the home screen, using Compare's component. "Members" is an opener (bold while open), and the × or Esc also closes it.
  - **Email:** SES with DKIM on a domain Arnav buys.
  - **Region:** `ca-central-1`.
  - **Sign-in for development and tests:** the real Cognito pool for running the app; a test-only signing key, trusted only during test runs, for automated tests. Nothing unsigned is accepted anywhere.
- **Sign-in screen layout (D-028, D-029):** Arnav's template, drawn in our tokens and type.
  - Top to bottom: the Courier Prime wordmark, heading, subtitle, "Continue with Google", "or", a filled email field, a high-contrast "Continue" and the legal line.
  - "Continue" uses the inverted-surface tokens (`--toast` / `--toast-fg`), not blue.
  - No toolbar on this page (a named exception to SPEC 3.5). The template's own sizes apply (a 400 px column, a 28 px heading, 15 px text and 44-46 px controls), as an exception to SPEC 3.3's tiers for this page only.
  - The legal line links to short Terms and Privacy pages, built in this phase.
- **Invite row controls (D-027):** in the Members invite row, the role picker and "Invite" look like the email field beside them: 30 px, a 1 px `--line` border, 6 px radius, `--bg` fill, 13 px text-color. The role picker is the app's own "Writer ▾" opening the shared menu, not a native select. "Invite" isn't blue.
- **Home text actions hover (D-026, D-035):** "+ New episode", "Members" and the toolbar's "+ New script" get the sidebar rows' hover background (`--hover`, 6 px radius), with the padding offset by an equal negative margin so nothing moves. In the toolbar, the "+ New script" hover box is 28 px tall, matching the 32×28 icon slots beside it (D-036). They still bold on click like every text action.
- **Cluster phase built (D-023) and its choices confirmed (D-024, D-025):** membership, the hash ring, forwarding, fenced leases and snapshots, failover, graceful rebalancing, three nodes in docker compose, and a chaos suite with zero lost edits. The design reference is `docs/sync-cluster.md`.
- **Cluster phase (D-022):**
  - Leases renew every 2 s and expire after 6 s; membership heartbeats run on the same schedule.
  - 256 SHA-1 virtual nodes per server.
  - A WebSocket pipe per forwarded writer, with the identity signed by a cluster secret.
  - Writers keep typing through a failover, under a quiet "Reconnecting…" cue.
  - Every log append is a DynamoDB transaction fenced on the lease epoch. Snapshots are immutable S3 objects plus a fenced pointer item, and the log is truncated only after the pointer moves.
  - The client picks a random server.
  - A heartbeat: ping every 5 s, reconnect after 10 s of silence.
- **Sync phase choices confirmed (D-022):** D-020 items (a)-(g).
- **Sync phase (D-018, D-019):**
  - Local services run in OrbStack with the existing docker compose.
  - The ack says "I've durably stored N of your update messages on this connection".
  - Snapshots happen at 1,000 updates, or 2 minutes after the last one if anything changed, plus when the last writer leaves.
  - Unsynced edits are kept on the device with y-indexeddb.
  - Remote carets are thin, with the name on hover; the offline cue is quiet text after the switcher.
  - The server uses `ws`, AWS SDK v3 and `tsx`.
  - The dev identity comes from `?as=Name` (and `?ep=` picks the episode).
- **Sync phase built (D-020), awaiting Arnav's review:**
  - `apps/sync`: rooms loaded on demand, append before ack, the chunked DynamoDB log, S3 snapshots.
  - `packages/shared`: the protocol and `SyncClient`.
  - Web: live co-writing, presence, the offline cue, and y-indexeddb.
- **Editor phase built (D-016), awaiting Arnav's review:**
  - `packages/schema` (schema, state machine, IDs, warnings, scenes; 64 Node tests).
  - The `apps/web` script screen (toolbar, sidebar, page view, element menu, warnings, combine toast, dev persistence; 12 Chromium tests).

## Proposed (awaiting Arnav)

- **Waiting on Arnav to finish the beta-readiness phase** (D-089 onwards):
  1. ~~The domain name~~: `scripter.ca`, and the product is Scripter (D-096).
  2. ~~The go-ahead to deploy~~: yes, with the servers on demand to save the credits (D-096). The deploy itself follows the runbook, step by step with Arnav.
  3. ~~Two tasks instead of one~~: two, while the servers are up (D-096).
  4. **Your own end-to-end test,** including the booked by-hand checks, the AWS load-test run, and reviewing the Privacy Policy wording (D-094). Arnav will look at the policy again on the deployed site.
  5. **SES production access and Google's consent screen:** not needed while Arnav is the only tester; do both before `scripter.ca` goes on a resume, so anyone who clicks it can sign in (`docs/runbook.md`, Part 4).
- **Claude's choices in D-083 to D-094, standing unless changed:** each entry lists its own. They cover:
  - the 30-minute session window;
  - the skeletons' 150 ms delay;
  - closing a crashed menu;
  - the empty-note wording;
  - the task size and alarm thresholds;
  - the purge's 09:00 UTC run;
  - deleted what-ifs waiting 30 days;
  - the lease item going with a purge;
  - the load-test cluster's key living in the generator's task definition.

- **D-080, what-ifs, still Claude's defaults** (the window, fully sent what-ifs, restore confirm and rename/delete were decided in D-081): the undo warning is a toast with Undo anyway · Keep; automatic snapshots only before sends and restores and when a what-if begins; viewers can see what-ifs; only editors snapshot; 14 px snapshot rows; deleted scenes listed struck through; `--on-accent` for the dark-mode primary button; "This scene isn't in main yet."

- ~~D-077: long toasts wrap~~: kept (D-079).

- ~~D-071: pagination splits mid-line at sentence ends~~: decided in D-073 (industry standard).

- **AWS cost levers for the deploy phase (proposed 2026-10-24, decided then):** these keep SPEC 5.5's infrastructure unchanged.
  - **Estimated cost:** about $40-50 a month on demand in `ca-central-1`. The load balancer (about $18), the small Postgres (about $15), public IPv4 addresses (about $3.65 each) and the container (about $10) make up most of it. This corrects Claude's earlier, too-low "$25-45".
  - **The levers:**
    1. Use the AWS sign-up credits. D-038 starts on the free plan and upgrades to paid when the beta starts.
    2. Before the beta, run the compute only for demos and tests, and tear it down afterwards. DynamoDB, S3, Cognito and a Postgres snapshot are kept.
    3. Run the always-on container on ARM (Graviton) Fargate Spot, about 70% cheaper. A Spot interruption is a failover the design already survives with zero lost edits.
    4. Use public subnets with no NAT gateway, which would otherwise add about $35 a month.
    5. Use the smallest Postgres and task sizes, single availability zone.
  - Dropping the load balancer would mean running on EC2 instead of Fargate, a spec change, so it isn't proposed.
  - Exact numbers come from the AWS pricing calculator in the deploy phase.
- ~~Performance budget (from D-012)~~: built in D-087, at a stricter 8 ms p95 per key or remote update, with three writers, in both views and in a what-if.
- **Small choices made while building the editor shell (D-014, items 9-11):**
  - Structural actions get their own undo step.
  - Scene names in the navigator are derived from headings, as in the prototype ("INT. KITCHEN - NIGHT" shows as "Kitchen – Night").
  - Placeholder toasts for controls whose features come later.
- **Choices made while building the editor phase (D-016), awaiting Arnav:**
  - The element menu opens with the current type's row aligned with your line, like a native pop-up menu.
  - A heading-only scene turned into action also counts as "combined".
  - The script title placeholder is "Untitled script", with one presence avatar ("AR") until accounts exist.

## Open issues

**Blockers and environment issues**

- ~~D-020: storage-backed tests not yet run~~: resolved in D-021. All 6 pass against DynamoDB Local and SeaweedFS, three runs in a row, including the SIGKILL crash of a real server process.
- ~~D-020: no client heartbeat~~: decided in D-022 (ping every 5 s, give up after 10 s).
- **D-080: Changes shows removed text inline,** so page view's breaks (computed from the script itself) don't account for it while Changes is on.
- ~~D-080: a viewer opening a never-opened what-if sees it empty~~: it now says so, and the script appears when a writer opens it (D-094).
- ~~D-080: usage counting isn't built~~: built in D-083.
- **D-069: the leave prompt covers the open script only.** A script left for Home while still offline gets no prompt when Home is closed. A normal window keeps the copy and syncs it later; an incognito window loses it. Options to bring when it matters: prompt on Home too, or keep the script's connection open until it's synced.
- ~~D-069: an unreachable API looks like being signed out~~: fixed in D-085 (the "can't reach" notice).
- ~~D-065: the API's production role needs `cognito-idp:AdminGetUser`~~: in `WrApp`'s task role (D-091).
- **D-062: a host sync server and the Docker cluster mix in one membership.** They share the local DynamoDB, but the containers can't reach the host's `localhost` address. For now: run one or the other, never both. A fix (separate membership tables, or a reachable host address) can wait until it matters.
- **D-020: web test runs end with a 10-second wait.** Vite's own browser connections outlive the test server's teardown, so Vitest waits out its timeout. The run still exits 0, and our servers leave nothing open.

- **Spike follow-ups (D-012):**
  - ~~The key editor tests have only run in Chromium.~~ The whole web suite ran in WebKit and Firefox in D-089: 170 of 176 pass, and the six are explained there.
  - Duplicate-ID repair after merges must become deterministic.
  - The word diff must group changes into phrases.
  - Watch the beta for test 2's split degradation.
  - ~~One long task of about 100-160 ms per run during solo typing needs a look.~~ Not seen in D-087's runs.

- ~~D-007: no container runtime~~: resolved. OrbStack is installed, and the compose services run (D-021).

**Decisions the spec leaves open** (each is brought to Arnav with options when its phase starts)

Spike and Phase 1:

1. The Enter/Tab rules: Arnav confirms or adjusts them after trying the editor (the gaps were filled in D-014).
2. ~~Element menu~~: decided in D-014.
3. ~~Remote cursor and selection style~~: decided in D-018.
4. ~~Lease and heartbeat timings~~: decided in D-022.
5. ~~Virtual nodes and hash~~: decided in D-022.
6. ~~Forwarding~~: decided in D-022.
7. ~~Snapshot compaction trigger~~: decided in D-018.
8. ~~Client-side durability for offline work~~: decided in D-018 (kept on the device with y-indexeddb).
9. ~~Formatting warning style~~: decided in D-014.
10. ~~How TypeScript runs on Node~~: dev uses `tsx` (D-018); production is an esbuild bundle (D-082).
11. ~~Load-test targets and method~~ (decided in D-082; the harness, D-092): concurrent editors per script and per server, the p95 latency goal, how failover is injected, and how "zero lost edits" is verified (SPEC 5.4).
12. Autocomplete behavior and look (SPEC 4.4; first on the cut list after the sync cuts).
13. ~~AWS region~~: `us-east-2` (D-058; the free plan's organization policy forbids D-030's `ca-central-1`).
14. How to gate the first AWS deploy before Cognito exists (SPEC 5.6). Also at deploy (D-025): where the cluster secret lives on AWS, and how the sync server is built for production.
15. ~~Which kind of "small Postgres"~~: RDS `db.t4g.micro` with 7-day backups (D-082).
16. ~~Monitoring and logging tool~~: CloudWatch only, with alarms and browser crash reports (D-082).

Phase 2:

17. ~~Spacing before scene headings~~: decided in D-014 (two blank lines).
18. Mobile and narrow-screen behavior (SPEC 3.8: raise when it comes up).
19. ~~The sign-in screen design~~: decided in D-028 and D-029.
20. ~~Email delivery~~ and ~~the invite link flow~~: SES on our own domain (D-030); one-time links (D-032).
21. Screens the prototype doesn't mock: ~~Members~~ (D-030), ~~Invite co-writer…~~ and ~~the account avatar menu~~ (D-032). ~~+ New episode~~ (D-033).
- New (found 2026-10-24, accounts phase): the prototype's blue primary button (`.pb`, white text on `--accent`) fails SPEC 3.11's 4.5:1 contrast in dark mode: white on `#6EA2E6` is about 2.6:1 (light mode, on `#2F6DB5`, is about 5.3:1). It's used for Compare's "Send mine to main". Options to bring Arnav: dark text on the dark-mode accent, a deeper dark-mode accent for filled buttons only, or the inverted-surface style used by sign-in's Continue (D-028).
- ~~New (D-042, moved by D-046): the 30-day purge job (D-037) isn't built yet.~~ Built in D-090; scheduled by the deploy stack.
- Resolved (2026-10-26, flaky under load): about one in ten full `pnpm test` runs on a busy laptop failed. Three load-sensitive waits were fixed:
  - **`collab.test.tsx`** now waits for the "Reconnecting…" cue, because the client fetches a fresh token first (D-046).
  - **The new forwarding-hop access test** gets 10 s waits.
  - **`cluster.test.ts > split brain`:** the captured error was its final 5 s wait for the two writers' copies to match. That wait came after fencing, the stale room's step-down and both writers' sync had all passed, so it was not a safety failure. It now gets 15 s; the assertion that every word survives is unchanged.
- ~~(D-048) local script copies left after signing out on a shared computer~~: decided in D-050.
- New (D-040, minor): after `pnpm test`, Vitest reports "something prevents 8 Vite servers from exiting" for about 10 s. It predates step 1 (it happens on the previous commit too). It comes from the web browser-mode project; the tests pass. Worth finding with the hanging-process reporter when convenient.
- New (D-026; + New script settled in D-035): should the hover background extend to the remaining text actions (Accept, + New what-if, + Snapshot)?
22. ~~Renaming scripts and episodes~~: click the toolbar title (D-033).
23. Fountain and .fdx import edge cases: title pages, notes, boneyard, dual dialogue, and unsupported element types.
24. PDF library: pdf-lib is the spec's example, so confirm it. Courier Prime will need to be bundled locally for PDF embedding, alongside the Google Fonts link.
25. ~~Product name~~: Scripter, at scripter.ca (D-096).

Phase 3:

26. What a "few minutes" means for sends sharing one restore point (SPEC 3.9).
27. How the warning before undoing an edited sent scene looks, given there are no dialogs (SPEC 3.9).
28. Restoring a snapshot: is it an ordinary edit into the current draft, a new what-if, or a choice between the two? (SPEC Part 2 lists "snapshots and restore", but the behavior isn't specified.)
29. When automatic snapshots are taken, other than before a send (SPEC 3.6 shows "time · automatic").
30. Renaming and deleting what-ifs; whether Viewers can see what-ifs; who can create snapshots.
31. Snapshot row text size: the prototype uses 14 px, which matches no tier in SPEC 3.3.

## Future versions

- **From the beta-readiness phase:**
  - **Group commit** for busy scripts: merge the updates queued behind a slow append into one log entry (D-092).
  - **Making Firefox exact:** per-browser break tables (D-089).
  - **Changes drawn outside the text,** so removed text doesn't shift page view's breaks (D-080).
  - **The leave prompt on Home too** (D-069).
- **Competitive gaps Arnav added (D-079):** inline bold, italic and underline; dual dialogue; an editable title page (see D-076); scene numbers and revisions.

- **Editable title page (D-076):** draft date, contact block, "based on", and credit wording, exported with the script. v1 generates one from the names we have.

From SPEC Part 2 (seams in v1, not built): the AI continuity checker and its eval harness; the Beats tab and beat board with card drag-and-drop; the Outline tab; dragging scenes to reorder them; comments and notes tabs; revision color tags on snapshots; export to Final Draft or Fountain; cross-episode proposals; scene-level locks; the series-level product (bible, cross-episode continuity); the timeline checker; setup/payoff and prop/costume tracking; pitch voting; the script jam and public launch.

Dropped entirely: Arc's "take main's version into this what-if".

## Rejected options and why

Permanently rejected (SPEC Part 2):

- Motion and tone continuity checks: good stories break these rules on purpose, so writers would mostly see false alarms.
- A setting to unlink page view from the sidebar: it would be a second control for one action.
- A history icon in the toolbar: snapshots and restore points already live in the Drafts tab.
- A Script/Page segmented switch: the sidebar icon is already the one control for page view.
- Any full-screen dialog for merging: it pulls writers out of the script.
- Celtx-style UI.

Rejected since the log moved into the repo:

- MinIO as the local S3 store (D-004): its Docker images were pulled and the repository archived in 2026, so `docker compose up` would fail for anyone setting up the repo.
- LocalStack as the local S3 store (D-004): since 2026.03.0 it needs an account auth token, which adds a sign-up step for every contributor.
- Adobe S3Mock (D-004): a mock, so snapshot code could pass locally and still fail against real S3.
- Garage (D-004): needs a one-time layout and key bootstrap before first use. That's extra setup friction for no benefit here.
- TypeScript 7.0 for now (D-006, confirmed in D-009): typescript-eslint doesn't support it yet, so we would lose the type-aware lint rules that catch bugs like un-awaited promises.
- Revision colors or margin asterisks in v1 (D-009, Arnav's call): both would add Phase 3 scope that SPEC puts in future versions. Writers still see what was sent through Changes and Compare.
- The `@y/prosemirror` 2.0 rewrite for the spike (D-010, Arnav's call): it's a pre-release on the Yjs 14 beta, so its API could change mid-build and the spike's results might not hold at its final release.
- A jsdom-only spike, or jsdom plus separate Playwright scripts (D-011, Arnav's call): jsdom can't lay out a page, so it can't prove cursor and viewport stability (test 5) or real typing performance (test 7), and two setups would be more to explain.

- One ProseMirror node type per element (D-013, Arnav's call): changing a line's type while a co-writer types in it silently deleted their words in the spike.
- A smarter split that keeps the original element for one half (D-013): 1-2 days of custom binding work that only moves the degradation to the other half of the line.
- Letting one elected client, or the server, repair duplicate IDs (D-013): more moving parts, and it fails when that client is offline. A deterministic local repair needs neither.
- The browser's built-in scroll anchoring alone (D-013): your line still jumped about 32 px whenever a page break reflowed.
- An element bar floating above the line (D-014, Arnav's call): it covers the line above while it's open.
- A type label that shows in the margin (D-014): one more moving thing beside the writing.
- One blank line before scene headings (D-014): it departs from the prototype, and scene starts stand out less.
- A dotted underline or a ghost "CHARACTER?" cue for warnings (D-014): the first marks the writing itself; the second takes up a line and shifts page breaks.
- Only the SPEC key rules, or Enter on an empty line opening the menu (D-014): writers would need the menu much more often.
- Converting uppercase elements' text as you type (D-014): it turns every type change into a text rewrite, which can tangle with a co-writer typing in that line.
- Also warning about a cue with no lines (D-014): it's noisier, flagging a cue you've just typed.
- jsdom, or no web tests (D-015): jsdom can't measure layout, so it can't check the no-rewrap promise; no tests would leave undo-per-action unguarded.
- Pushing only at phase ends, or asking each time (D-015): GitHub would lag behind the real work.

Rejected in the beta-readiness phase (details in each entry):

- **Hosting (D-082):** Aurora Serverless v2 (the first request after an idle pause takes about 15 s); Postgres inside the container (no managed backups).
- **Monitoring (D-082):** Sentry (a third party seeing writers' sessions).
- **Usage (D-082):** counting everything from the browser (ad blockers and closed tabs drop events).
- **States (D-084):** a spinner, a loading line or a progress bar (Arnav chose skeletons); a toast on the sign-in page for an outage (writers would still see a form they can't use).
- **Accessibility (D-086):** keeping the prototype's failing contrast; leaving the page with F6, Ctrl+M, or walking off the top (invisible or easy to trigger by accident).
- **Browsers (D-089):** blocking Firefox (turning testers away for a cosmetic difference); making it exact now (1-2 days, and another engine to re-measure).

Earlier rejections, with reasons from the writer's point of view, are in the imported log below (section "Rejected options and why").

## Known risks

- ~~D-091: one sync server on Fargate Spot~~: two tasks (D-096, D-097). Spot can still reclaim both at once; then writers wait a minute or two for replacements, typing on their devices and losing nothing.
- New (D-098, D-099): **free-plan limits show up only at deploy.** So far: Postgres backups at most 1 day, and no CloudFormation, SSM or Lambda in us-east-1 (the certificate is made by a script instead). If another appears, the choice is the same: a smaller setting, or upgrading to paid.
- New (D-096): **the free plan ends on 2027-04-26,** or sooner if the credits run out. The account then closes (AWS keeps its data for 90 days) unless Arnav upgrades it to paid. Running the servers on demand keeps the credits lasting until then.
- New (D-097): **while the servers are down, `scripter.ca` can't be used,** and anyone who visits sees "Can't reach Scripter". Bring them up (`beta:up`, about 10 minutes) before a session, a demo or interview weeks.
- New (D-097): **Cognito's custom domain and CloudFront** can take up to an hour on the first deploy. That's slow, but only once.
- New (D-091): **CloudFront's VPC origin carrying the sync WebSocket** is the one part synth can't check. It's step 4 of the runbook's checks, with a fallback ready (an internet-facing load balancer for `/doc/*`, locked to CloudFront by a secret header).
- New (D-092): **each script's updates are appended strictly one at a time,** so one script takes at most one update per DynamoDB round trip. That's fine at beta scale (about 15 keys a second for a busy room); group commit is the fix if a room ever needs more.
- New (D-093): **DynamoDB is billed per keystroke** (a transactional append plus its lease check). It's pennies at beta scale; a 1,000-writer load test is about $20-25 an hour of typing.
- New (D-089): **Firefox wraps a few lines differently** from pagination on screen (about 1% of action paragraphs); the PDF and page breaks are unaffected. Firefox users get a one-time note.
- Measured (D-092): D-023's DynamoDB Local risk now has a number. It saturates at about 100-150 transactional appends a second on a laptop, so local load runs prove behavior, not capacity.
- Resolved (D-061, D-065): the email-code flow's assumptions were checked on the real pool. Sign-up with no password and `UsernameExistsException` hold. An unconfirmed account's sign-in request gets a fake challenge, and `ResendConfirmationCode` succeeds even for a confirmed account. So the API asks `AdminGetUser` for the account's status.
- New (D-031): the sync servers depend on Postgres to authorize *new* connections. If it's unavailable, writers already connected keep editing, but reconnecting writers (after a failover, say) are refused until it returns. Mitigations to consider later: caching recent decisions for a short time, and a Postgres replica.
- Mid-line paragraph splits under concurrent editing (Yjs binding). Measured in the spike (D-012, test 2): nothing is lost and the structure never corrupts, but text typed concurrently in the second half of a line lands on the first half, and an in-progress word can tear. The risk is accepted pending P2.
- Cursor stability when nodes are deleted by other users. Tested in the spike: the cursor moves to the start of the next line. Low risk now.
- Page-break markers must survive remote updates (annotation handling in the Yjs binding). Resolved by design (D-012, F3): y-prosemirror replaces the whole document on every remote change, so decorations must be recomputed from the document. Mapped decorations vanish (20 → 0 in the control test).
- New (D-012, F2): any transaction appended during a remote change is never written to Yjs, so clients silently diverge. Every auto-fix after a remote change must run as a separate local transaction.
- New (D-023): the chaos numbers come from one laptop running DynamoDB Local, which processes writes one at a time on SQLite. Under heavy load it adds latency that real DynamoDB wouldn't (truncation deletes visibly slowed appends). Real AWS numbers come from the load-test phase.
- New (D-023): a *frozen* server costs writers about 10-13 s (the 10 s client heartbeat plus a reconnect), against about 6-8 s for a crashed one. Making it faster means a shorter heartbeat, which D-022 rejected because of needless reconnects on slow networks.
- New (D-023): if DynamoDB itself is unavailable, writers keep editing locally and nothing is lost, but no new edits become durable until it returns.
- New (D-012): y-prosemirror 1.3.7 is in maintenance mode. Its local keystroke cost grows with document length (p95 8 ms at 110 pages, so about 2x headroom).
- Binding churn: a rewrite of the ProseMirror-Yjs binding has been planned, and no stable release has been confirmed. Update (D-010): the rewrite now exists as the pre-release `@y/prosemirror` 2.0.0-15 on the Yjs 14 beta, and the stable `y-prosemirror` 1.3.7 hasn't had a release since July 2025. We build on the stable line, and an upgrade later would be its own decision.
- Scene IDs staying unique through copy-paste and splits.
- Timeline: v1 is roughly 8.5-10.5 weeks after the spike (supersedes the imported 7-9 week estimate), alongside midterms and NeetCode prep.
- ~~New (D-003): Courier Prime must render at exactly 10 characters per inch.~~ Verified in Chromium (D-016): 60 characters measure 575.6 px against an ideal of 576 px (0.07% off), and an automated test guards it. Safari and Firefox are still to be checked with the other cross-browser runs.
- New (D-016): Courier Prime loads from Google Fonts with `display=swap`, so the first paint can show Courier New for a moment. Both fonts are 0.6 em wide, so no line rewraps. PDF export will need a bundled copy of the font anyway (open decision 24).
- New (D-004): SeaweedFS's S3 behavior may differ from AWS S3 in edge cases, so snapshot code also has to be tested against real S3 before the first deploy.
- New (D-006): typescript-eslint lags behind TypeScript 7, so we stay on TS 6.0 until it catches up.

---

## Log entries (newest first)

### D-099 · 2026-10-28 · The free plan forbids stacks in us-east-1: the certificate comes from a script

- **What happened:** after `WrData` deployed, checking for `WrCert`'s CDK bootstrap in us-east-1 hit an explicit deny from the free plan's organization policy (a service control policy; the same kind that ruled out `ca-central-1` in D-058).
  - Tested read-only in us-east-1: ACM, CloudFront and IAM are allowed; CloudFormation, SSM and Lambda are denied.
  - CloudFront and Cognito's custom domain take certificates only from us-east-1. So `WrCert` can't deploy, and neither can CDK's cross-region references, which use SSM and Lambda there.
- **Options:**
  1. Make the certificate with the AWS CLI and keep everything else in CDK: still free, no charges possible.
  2. Upgrade to the paid plan: same spending while the credits last, both limits gone, but bills once the credits run out.
  3. Skip the custom domain.
- **Arnav asked first when the credits would run out with no users.** Claude's estimate (us-east-2 prices):
  - about $4.50 a month with the servers down, about $1.50 a day with them up, plus about $5-10 for the load tests once;
  - mostly down, that leaves about 55 full days of "up" time before the free plan ends on 2027-04-26;
  - always on, the credits would be gone by mid-January.
- **Decision (Arnav's call, option 1):** the certificate is made by `infra/scripts/cert.sh` (`pnpm --filter @wr/infra cert`).
  - **What it does:** requests (or finds) the certificate for `scripter.ca` and `auth.scripter.ca`, writes ACM's DNS check records into the Route 53 zone with the CLI, waits until it's issued, and prints `WR_CERTIFICATE_ARN` for `infra/.env.local`.
  - **`WrApp`** uses the certificate by ARN, and uses the domain only once that's set; until then the site keeps CloudFront's address.
  - **`WrCert` is retired** (`infra/src/cert.ts` deleted), and with it the cross-region references.
  - **Claude's choice within option 1:** the check records are written by the script, not by a us-east-2 stack as first described. Their values exist only once AWS has made the certificate, so a stack would need a Lambda-backed lookup of ACM to read them.
- **For writers:** nothing changes.
- **For the system:**
  - one resource lives outside CDK: the certificate and its two check records, written down in the runbook;
  - ACM renews it by itself while those records stay;
  - the script is safe to run again.
- **Rejected (reasons from Arnav's side):**
  - **Upgrading now:** it could bill after the credits run out.
  - **No custom domain:** the link wouldn't be resume-worthy.
- **Other deploy hurdles so far** (logged in D-097 and D-098):
  - the missing `WR_DOMAIN` line;
  - a `deploy:data` that never started in the terminal;
  - the 1-day backup limit and the retained leftovers it left behind.
- **Tests:**
  - the distribution and the sign-in domain use the certificate's ARN;
  - no cross-region plumbing;
  - a domain without its certificate yet stays on CloudFront's address.
  - The stack tests are now 22.
- **Status:** Arnav's call; built in this entry's commit. Claude ran `cert` (the certificate is free).

### D-098 · 2026-10-28 · The AWS free plan allows one day of Postgres backups: one day until the upgrade

- **What happened:** the first `deploy:data` failed at the database. RDS said: "The specified backup retention period exceeds the maximum available to free tier customers."
  - Free-plan accounts can keep at most 1 day of automated backups (several projects report the same error, and 1 day works). We asked for 7 (D-082).
  - The rest of the stack rolled back. The three DynamoDB tables and the snapshot bucket are marked "retain", so the rollback left them behind, all empty (checked: 0 items, 0 objects, created minutes earlier). They'd have blocked the retry with "already exists".
- **Decisions (Arnav's calls, each Claude's recommendation):**
  1. **One day of Postgres backups while on the free plan, seven after the upgrade.**
     - A setting, `WR_ACCOUNT_PLAN` (free or paid, default free), picks it.
     - Flipping it to `paid` and running `deploy:data` restores 7 days once the account is upgraded. Detecting the plan by itself would mean calling AWS during every synth, including in tests without credentials.
     - The Privacy Policy's "Backups of the database are kept for 7 days" becomes "Backups are kept for up to 7 days". That's still true: the writing's DynamoDB recovery keeps 7, and Postgres keeps 1 for now.
  2. **Claude deleted the four empty leftovers** with Arnav's profile and confirmed they were gone. The runbook now says what to do if this happens again.
- **What changes for writers:** nothing they see. Their writing lives in the DynamoDB edit log and S3 snapshots, still recoverable for 7 days. Only the account records in Postgres (accounts, series, roles, what-ifs) can be restored no further back than a day until the upgrade. Before a risky migration, take a manual snapshot (runbook Part 5).
- **Rejected (reasons from Arnav's side):**
  - **Upgrading to the paid plan now:** 7-day backups, but the account could then bill once the credits run out; the budget alarms only warn.
  - **No Postgres backups:** an RDS failure or a bad migration could lose every account.
- **Status:** Arnav's calls; built in this entry's commit. Then `deploy:data` again.

### D-097 · 2026-10-28 · Built: the domain's zone, sign-in at auth.scripter.ca, two tasks, and the servers on demand

- **What D-096 needed, built (Claude's implementation of Arnav's calls):**
  - **`WrDns`** (`infra/src/dns.ts`): a retained Route 53 public zone for `scripter.ca`, printing its four nameservers for Porkbun.
    - The settings take the domain in two steps. `WR_DOMAIN` alone makes only the zone. Adding `WR_HOSTED_ZONE_ID` turns the domain on everywhere else: `https://scripter.ca` joins the app URLs by itself, and mail comes from `no-reply@scripter.ca` (a verified SES domain identity). The old sender address stays an SES identity.
  - **Sign-in at `auth.scripter.ca`:**
    - Cognito's custom domain, in `WrApp`, beside the deployed prefix domain (a pool may have one of each), so nothing in `WrAuth` is replaced.
    - The certificate in `WrCert` also covers `auth.scripter.ca` (Cognito, like CloudFront, takes certificates only from us-east-1).
    - Cognito requires the parent domain to resolve, so the custom domain waits for the site's record.
    - Its record points straight at the domain's `cloudFrontEndpoint` attribute. CDK's `UserPoolDomainTarget` would add a Lambda-backed lookup for the same value.
    - The API's Google flow uses it; `WrApp` prints the new Google redirect URI for Arnav to add.
  - **Two tasks** (`desiredCount: 2`): each runs the API and a sync server. A deploy briefly runs four.
  - **The servers on demand:** `WrApp` takes `-c servers=off`.
    - **Off removes:** the service, the load balancer, its target groups and the VPC origin.
    - **`/api/*` and `/doc/*` still exist,** answered at the edge by a CloudFront Function with a 503, which the app already reads as "can't reach" (D-085), and from which the sync client keeps retrying.
    - **Off also changes:** the daily purge is disabled (it needs Postgres), and only the alarms that can still fire stay (edit-log trouble, crash bursts, a failed purge). The servers' and database's alarms go, since a stopped database's missing metrics would read as "storage low".
    - **A nightly EventBridge Scheduler call** (10:00 UTC, no Lambda, no retries) stops Postgres again, because RDS starts a stopped database after 7 days.
  - **`infra/scripts/beta.sh`** (`pnpm --filter @wr/infra beta:up` / `beta:down`; `deploy:app` is now `beta:up`):
    - **up:** starts Postgres, waits until it's available (the tasks migrate and connect on start), builds the web app, then deploys with the servers;
    - **down:** deploys without them, then stops Postgres.
    - `WrData` now outputs its database's ID for this.
- **Docs:** the runbook's Parts 1-4 and 8 are rewritten:
  - Porkbun's nameservers and DNSSEC;
  - waiting for SES to verify the domain before `deploy:auth`;
  - the Google redirect URI;
  - a failover drill on the two tasks;
  - when to request SES production access and publish Google's consent screen;
  - up and down, and the costs.
  - The README, the interview notes, CLAUDE.md and `.env.local.example` match.
- **Tests:** the stack tests grow from 15 to 20:
  - the two-step domain settings;
  - the retained zone;
  - mail from the domain;
  - the certificate's second name;
  - the sign-in domain waiting for the site's record, and the API using it;
  - two tasks;
  - servers down (no load balancer, tasks or VPC origin; the 503 function on both paths; the purge disabled; three alarms; the nightly stop).
  - Every stack synthesizes with the domain set, servers up and down.
- **For writers:** while the servers are down, `scripter.ca` loads and says it can't reach Scripter, with Try again. Deletions older than 30 days wait for the next time the servers are up to be erased (the Privacy Policy promises 30 days, then erasure, without a stated hour).
- **Found on the way:** `infra/.env.local.example` had never been committed: `.gitignore`'s `.env.*` hid it, though the README and runbook point to it. It holds only placeholders, and is now tracked.
- **First run (2026-10-28):** `deploy:dns` failed with "No stacks match the name(s) WrDns": the `WR_DOMAIN` line hadn't reached `infra/.env.local`. Claude added it (not a secret), `cdk list` then showed `WrDns`, and the runbook now names that error.
- **Deploying (2026-10-28):**
  - `WrDns`, then Porkbun's nameservers (the `.ca` registry switched within the hour);
  - `WrEmail` (SES verified `scripter.ca`, DKIM SUCCESS);
  - `WrAuth` (the pool is `scripter`, deletion protection active, codes from `no-reply@scripter.ca`, all in place).
  - Postgres moves to 18.6, the newest RDS offers and the local compose version; CDK 2.274's named list stops at 18.3, so it's `PostgresEngineVersion.of('18.6', '18')`.
- **Claude's choices, standing unless changed:**
  - the nightly stop at 10:00 UTC;
  - `no-reply@` as the sender;
  - the 503's body (`{"error":"servers down"}`);
  - keeping the old Google redirect URI until the new one is proven.
- **Status:** built and tested; nothing deployed yet. The deploy runs with Arnav, following the runbook.

### D-096 · 2026-10-28 · The product is Scripter, at scripter.ca; the beta's servers run on demand, two tasks, DNS in Route 53

- **Context:**
  - **The name:** Arnav bought `scripter.ca` (at Porkbun) and named the product Scripter, "everywhere, all mentions". This settles open decision 25 and D-089's "I'll pick another".
  - **The beta:** for now Arnav is the only beta tester, and he wants AWS charges minimal, ideally none.
  - **The account,** checked read-only:
    - free plan, active, $119.98 of credits, ending 2027-04-26;
    - Fargate quotas: 12 vCPU on demand and 12 on Spot (`WrLoad` needs 9.5).
  - **On the free plan nothing can be billed** (D-038). So "no charges" means making the credits last until April. Two more ways to stretch them:
    - AWS pays $20 each for trying EC2, RDS, Lambda and Bedrock from the console's "Explore AWS" panel (Budgets already earned its $20);
    - Organizations, Identity Center and Control Tower stay off, because any of them converts the account to paid.
- **Decisions (Arnav's calls, each Claude's recommendation):**
  1. **Name and domain:** Scripter, at `scripter.ca`.
  2. **How far the rename goes:** everything people see, plus the internal names that are free to change.
     - **Renamed:** the UI (the SCRIPTER wordmark, page title, "Can't reach Scripter", the Firefox note), the PDF's creator, the Terms and Privacy pages, the invitation email and its sender name, the sign-in code email ("Your Scripter code: {####}"), and every current document (README, SPEC, CLAUDE.md, the runbook, the metrics, the interview notes, the cluster design, prototype v2).
     - **Internal names renamed:**
       - the repo and root package (`scripter`) and the local compose project;
       - the Postgres database (`scripter`, locally and in `WrData`, which isn't deployed yet);
       - the Cognito pool and client names, in place (`cdk diff` shows no replacement);
       - the budget (`scripter-monthly`, recreated);
       - the CloudWatch namespace;
       - the test issuer.
     - **Kept:** the `@wr/` package scope, `WR_` settings, the `Wr*` stack names, the `wr/` secrets, `wr-` tables and the `wr_` cookies. The deployed Cognito prefix domain also stays; writers see `auth.scripter.ca` instead (D-097).
     - **Also kept as written, as records:** the prototype files' names, prototype v1, the accounts-phase mockup, and every earlier log entry (Part 1: never rewrite history). CLAUDE.md's Part 1 changes only in the product's name, on Arnav's instruction.
  3. **Hosting: the designed architecture, with the servers on demand** (option B).
     - **Commands:** `beta:up` and `beta:down`.
     - **Down:** removes the load balancer and tasks and stops Postgres. CloudFront and the web app stay up, so `scripter.ca` shows the existing "Can't reach Scripter" notice.
     - **Cost:** about $4-5 a month while down, about $1.20 a day while up.
  4. **DNS in Route 53** ($0.50 a month). Arnav points Porkbun's nameservers at it once; CDK then writes every record.
  5. **Two tasks while the servers are up,** so the beta is a two-node cluster: a lost Spot task fails over in about 6-8 s, and a failover can be drilled live on `scripter.ca`.
- **What changes for writers:**
  - They see Scripter everywhere.
  - Sign-in codes come from `no-reply@scripter.ca` once the domain is verified.
  - "Continue with Google" passes through `auth.scripter.ca`, not an `amazoncognito.com` address.
  - While the servers are down, the site says it can't reach Scripter.
- **What changes for the system:** a stack for the hosted zone, a servers on/off switch in `WrApp`, a nightly stop for Postgres while it's down, and a second task (D-097).
- **Rejected (reasons from Arnav's side):**
  - **A, always on** (about $43 a month): the credits run out around January, and the free plan then closes the account unless it's upgraded and billed.
  - **C, one small EC2 server with Postgres on it** (about $24 a month, always on): a rework of two stacks and an OS to patch, no managed backups, and the resume's architecture changes from Fargate and RDS.
  - **DNS at Porkbun** (free): about eight records typed by hand and kept in step by hand.
  - **One task:** a Spot reclaim pauses everyone for 1-2 minutes, while the second task costs about a cent an hour while up.
  - **Renaming every prefix too:** it recreates the deployed Cognito pool, SES and budget, means re-creating the Google secret, and touches 200+ references.
  - **Visible text only:** the repo and database would keep the old name.
- **Done on the way:**
  - **Local data:** the local compose volumes were copied to the new project's (`scripter_*`; the old `writers-room_*` volumes are kept as a backup and can be removed with `docker volume rm`), the local database was renamed `scripter`, and `.env` was updated.
  - **A false alarm:** the change-set diff showed the deployed code email's apostrophes as "?". Cognito actually holds them as UTF-8 (checked with `describe-user-pool`); it was only the diff's display.
- **Arnav's to-dos:**
  - rename the GitHub repo to `scripter` (Settings → Repository name; `gh` isn't installed here), then Claude points `origin` at it;
  - optionally, rename the AWS CLI profile `writers-room` on his machine.
- **Status:** Arnav's calls; the rename built in this entry's commit.

### D-095 · 2026-10-27 · Final docs for the phase, and where the beta-readiness checklist stands

- **Written:**
  - **`README.md`:** what it is, an architecture diagram (Mermaid, rendered by GitHub), how a keystroke travels, how to run, test and deploy it.
  - **`docs/runbook.md`:**
    - deploying, in order;
    - checking a deploy (including the WebSocket through CloudFront's VPC origin);
    - opening the beta (SES production access, Google's consent screen);
    - everyday operations (updates, migrations, the metrics from CloudShell in the VPC, the purge);
    - what to do for each alarm, and restoring from backups;
    - the load tests on AWS;
    - pausing and teardown.
  - **`docs/interview-notes.md`:** the pitch; the four hardest problems (leases and fencing, failover with zero lost edits, pagination as a pure function, the scene-level three-way comparison), each with mechanism, numbers and tradeoffs; numbers to quote with their sources; and likely questions.
  - **`docs/metrics.md`:** the beta metrics' SQL, the editor and pagination numbers, and the local load-test numbers. The AWS load-test numbers wait for the deploy.
- **Small additions on the way:** `WrApp` outputs its log group and subnets for the runbook's commands, and `WrLoad`'s server count is a context value (`-c loadServers=1` for the ramp).
- **The pages phase's beta-readiness checklist, item by item:**
  1. **Deploy the app:** built, synthesized and tested (D-091, D-093), with AdminGetUser and the 30-day purge. Not deployed: waiting for Arnav (D-089).
  2. **The domain and SES production access:** waiting for Arnav to name the domain; production access is his request once it exists (runbook Part 4).
  3. **Google's consent screen:** Arnav's action (runbook Part 4).
  4. **Load tests:** the harness is built and proven locally (D-092). The AWS run comes after the deploy (runbook Part 7).
  5. **Usage counting:** done (D-083).
  6. **Browser support:** decided and measured (D-089).
  7. **Arnav's own testing:** waiting, together with the booked by-hand checks.
  - **"Should fix":**
    - the outage that looked like a sign-out: fixed (D-085);
    - the import lost to a reload: fixed (D-085);
    - Cognito's deletion protection: on (D-091);
    - Privacy and Terms: brought up to date for his review (D-094);
    - backups: RDS 7 days plus DynamoDB point-in-time recovery (D-091, D-094);
    - error monitoring: decided (D-082) and built (D-083, D-091);
    - the leave prompt on Home: still open (D-069), proposed for a future version.
- **The runbook's end-to-end run:** every part that runs without AWS was run locally (the images built and run against the compose services, all stacks synthesized, the load tests on local server processes, the bundled AWS load-test path). The AWS parts run for the first time with the first deploy.
- **Status:** written; the phase is done when Arnav has tested end to end and approved (the phase prompt).

### D-094 · 2026-10-27 · Checklist leftovers: the Privacy Policy brought up to date, 7-day recovery, and the viewer's unopened what-if

- **The Privacy Policy** (`apps/web/src/pages/Legal.tsx`; D-029's text, for Arnav to review before the beta) now says what this phase built:
  - usage counts record who, which script and when, never content;
  - error reports carry what went wrong and where in the code, never writing;
  - the browser keeps a copy of opened scripts for offline work, and signing out removes it;
  - one cookie keeps you signed in, with no advertising or tracking cookies;
  - Google tells us only your name and email address;
  - deleted scripts wait 30 days under Recently deleted, then are erased;
  - database backups are kept for 7 days.
  - The Terms are unchanged.
- **Backups, made to match that sentence:** DynamoDB's point-in-time recovery keeps 35 days unless told otherwise, so the edit log and coordination table now keep 7, like RDS. Snapshot objects in S3 aren't versioned, so the purge's deletes are final.
- **D-080's open issue: a viewer on a what-if no writer has opened yet** saw an empty page, because only an editor may seed it from its base. Now the page says "No one has opened this what-if yet. It appears here once one of its writers does." The script appears by itself the moment a writer opens it. The wording is Claude's, in D-085's note style.
- **Tests:** a browser test for the viewer's note and the script arriving; the 7-day recovery in the stack test.
- **Status:** Claude's changes; the policy wording is for Arnav's review.

### D-093 · 2026-10-27 · The load-test cluster for AWS (`WrLoad`), built and synthesized

- **What it is** (`infra/src/load.ts`): SPEC 5.5's "multi-node cluster, spun up only for load tests and demos, then torn down".
  - **Three sync servers** running the load-test entry, on demand (not Spot, so a run isn't interrupted), at the beta's task size.
  - **An internal load balancer** like the beta's.
  - **A load generator task** (8 vCPU, 16 GB) in the same VPC, started by hand for each scenario.
  - **Its own DynamoDB tables (`wr-lt-*`) and bucket,** deleted with the stack. It never touches the beta: no Cognito, no Postgres, none of the beta's tables (a test checks).
- **The key pair** is made when the app is synthesized, so each deploy of the stack gets a fresh one. The private half sits in the generator's task definition; it grants nothing but writing into this throwaway cluster.
- **The crash switch:** `POST /__crash` on port 4001, with the cluster's secret, ends a load-test server at once: no handoff, no lease release. That's a crash, as the failover scenario needs; ECS stopping a task would be graceful. The generator's `--crash-member` picks a live server from the membership table. It exists only in the load-test server; the production image doesn't contain it (checked by listing the image).
- **Proven locally from the bundles** (`infra/docker/loadtest.Dockerfile`, `tools/loadtest/scripts/bundle.mjs`): three bundled servers, the bundled generator with keys from the environment, and one server crashed through its switch 12 s in. Keystrokes at the moment of the crash waited up to 6.6 s, nothing was lost, and every edit was acknowledged.
- **The generator** prints its results as one JSON line (`LOADTEST_RESULT …`) to read back from CloudWatch, and writes the file when it can.
- **Cost, roughly, for the four scenarios:**
  - **The cluster:** the three servers, the generator and the load balancer come to well under $1 an hour.
  - **DynamoDB writes:** each keystroke is a transactional append plus its lease check, so 1,000 writers is about 10,000 write units a second, around $20-25 an hour at on-demand prices. The full suite (about 12 minutes of typing) should land around $5-10.
  - **Estimates only:** these come from AWS's published prices, not a bill.
- **Status:** built, synthesized and tested; deployed only for a load test, after Arnav's go-ahead (D-089).

### D-092 · 2026-10-27 · The load-test harness built and proven locally (beta-readiness checklist)

- **What it is** (`tools/loadtest`; `pnpm loadtest <scenario>`): D-082's four targets as scenarios:
  - `rooms`: 1,000 writers in 200 scripts of 5, for 3 minutes, on 3 servers;
  - `room15`: one 15-writer room;
  - `failover`: a server killed mid-run;
  - `ramp`: one server, more writers each step, until p95 crosses 150 ms.
- **The simulated writers:**
  - Each is a real `SyncClient` with its own Y.Doc and presence, connecting exactly as a browser does.
  - It types its own line at about five keys a second in bursts, with pauses, and moves its cursor on every key, as the editor's presence does.
  - Rooms are spread over worker threads, so the generator isn't the bottleneck. Each room's writers share a thread, so a keystroke's send and arrival are timed on one clock.
- **What it measures:**
  - Latency: keystroke to another writer's screen, through the durable append. It's kept in a 1 ms histogram (exact percentiles, fixed memory), plus a per-second timeline to show a failover pause.
  - Zero lost edits: at the end, a fresh client reads every script back, and each line must equal exactly what its writer typed. Also counted: writers whose edits weren't all acknowledged, and writers that never connected.
- **How it signs writers in:** like the chaos suite, a load-test-only server entry (`tools/loadtest/src/server.ts`) trusts the run's key, passed in `WR_LOADTEST_PUBLIC_JWK`. It also lets everyone edit (in-memory access): the real Postgres check runs once per connection, never per keystroke. The production image never contains it. Storage is real: DynamoDB and S3, or locally their emulators. `@wr/auth/testing` gained a portable test issuer (its private key can move to worker threads).
- **Proven locally** (full table in `docs/metrics.md`): 0 lost edits and 0 unacknowledged writers in every run.
  - **The 15-writer room:** p95 31 ms.
  - **40 writers on 3 servers:** p95 136 ms.
  - **The failover:** a server SIGKILLed 25 s in. Keystrokes at the moment of the kill waited up to 6.6 s (the lease expiring, then a reconnect), and latency was back to normal about 7 s later.
- **The local ceiling, measured:** DynamoDB Local processes transactional writes one at a time and saturates at about 100-150 appends a second (40-60 writers), while the sync server sits near 20% CPU. That's D-023's risk, now with a number; the quotable numbers come from AWS (D-082).
- **Also fixed on the way (D-085's notice):** Try again could reuse a retry already in flight, sent while the server was still away; when that failed, the next automatic retry could be up to 30 s off. Try again now always makes a fresh attempt and restarts the backoff. A full test run under load exposed it.
- **Fixed on the way:** a script whose lease is held by another live server (the servers' view of the ring still settling) logged "room load failed" as an error, which would have set off the edit-log alarm (D-091) on every deploy. It's now its own error type, logged at info level; the writers are told to try again, as before.
- **Noted, not done (an architecture choice, for Arnav if the AWS numbers call for it):** the home server appends each script's updates strictly one at a time, so one script can take at most one update per DynamoDB round trip. "Group commit" would merge the updates queued behind a slow append into one log entry. That keeps the append-before-ack rule and multiplies how much one script can take.
- **Tests:** the histogram's percentiles and merging; a small room against an in-process server (typing, latency samples, and an exact read-back).
- **Status:** built and proven locally; the AWS run comes after the deploy (the load-test cluster, `WrLoad`, is next).

### D-091 · 2026-10-27 · The beta's deploy stacks built and synthesized (not deployed, per D-089)

- **What was built** (`infra/src/data.ts`, `beta.ts`, `cert.ts`; tests in `infra/test/stacks.test.ts`; nothing deployed):
  - **`WrData`, everything kept.**
    - The network: two availability zones, public and isolated subnets, no NAT gateway, and free gateway endpoints for DynamoDB and S3.
    - Postgres: RDS `db.t4g.micro` running Postgres 18, single-AZ, encrypted, 7-day backups, deletion protection, and a final snapshot if the stack is removed.
    - The sync service's three DynamoDB tables, on demand, with point-in-time recovery on the edit log and coordination table.
    - The snapshot bucket.
    - The cluster secret.
    - The security groups, all here so their rules never reach across stacks.
    - Everything is retained if the stack is torn down.
  - **`WrApp`, the app.**
    - **CloudFront in front:**
      - the web app from a private S3 bucket (Origin Access Control), with a CloudFront Function serving `index.html` for app routes, so the API's own 404s survive;
      - `/api/*` and `/doc/*` (the sync WebSocket) to an **internal** load balancer through a CloudFront VPC origin, so the load balancer has no public address.
    - **One ARM Fargate Spot task** (0.5 vCPU, 1 GB) with two containers from one image: the API (it applies migrations at startup) and the sync server.
      - Deploys start the new task before stopping the old one, so two sync servers run briefly; that's what the leases and graceful handoff are for.
      - ECS Exec is on.
    - **The daily purge** (D-090) at 09:00 UTC.
    - **Eight alarms emailed to Arnav** (D-082):
      - the API or the sync servers unhealthy for 3 minutes;
      - 5 or more 5xx errors in 5 minutes;
      - any edit-log or snapshot failure;
      - 20 or more browser crash reports in an hour;
      - a failed purge;
      - Postgres low on storage, or busy.
    - **Logs** are kept 30 days.
  - **`WrCert`,** in us-east-1, only once there's a domain. With `WR_DOMAIN` and `WR_HOSTED_ZONE_ID` set, CloudFront gets the domain and an alias record, and `WrEmail` adds a DKIM-verified domain identity and a DMARC record.
  - **The checklist items folded in:**
    - the server role's `cognito-idp:AdminGetUser` (D-065);
    - Cognito's deletion protection, on `WrAuth`;
    - backups (RDS for 7 days, plus DynamoDB point-in-time recovery).
- **Code changes for AWS:**
  - The servers take Postgres from the standard `PG*` variables, with `PGSSLMODE=verify-full` and Amazon RDS's certificate authorities in `NODE_EXTRA_CA_CERTS`.
  - `WR_MIGRATE_ON_START=1` runs migrations under the existing advisory lock.
  - `WR_MIGRATIONS_DIR` points the bundled runner at its migrations.
  - `WR_INTERNAL_URL=auto` makes a sync server read its own private address from the ECS task metadata. Without it, two tasks during a deploy (or the load-test cluster) couldn't forward to each other: each would have pointed the other at 127.0.0.1.
  - In a production build, the web app finds the sync service on its own address.
- **The image** (`infra/docker/server.Dockerfile`): four esbuild bundles (api, sync, purge, migrate; `apps/sync/scripts/bundle.mjs`), about 250 MB on Node 24 Alpine, arm64. It was run locally against the compose services: both health checks answered, migrations reported up to date, a dry-run purge ran, and 114 RDS certificates were present. `.dockerignore` now keeps the context to the servers (the first synth recursed into `cdk.out`).
- **Claude's choices (say if any should change):**
  - 0.5 vCPU and 1 GB for the task (two Node processes);
  - the 120 s idle timeout on the load balancer;
  - the alarm thresholds;
  - 09:00 UTC for the purge;
  - PriceClass 100 (North America and Europe edge locations, the cheapest);
  - DMARC `p=quarantine`.
- **To verify at the first deploy** (in the runbook): that CloudFront's VPC origin carries the sync WebSocket, as it does for ordinary origins; which Postgres 18 minor RDS offers in us-east-2 then.
- **Status:** built, synthesized and tested; the deploy waits for Arnav (D-089).

### D-090 · 2026-10-27 · The 30-day purge built (beta-readiness checklist)

- **What it does** (`apps/sync/src/purge.ts`, run daily by `purge-cli.ts`): series, episodes and what-ifs deleted more than 30 days ago (D-037) are removed for good. For each of their drafts it deletes the edit log (every DynamoDB item, incomplete chunk groups included), every snapshot object, the snapshot pointer and the lease. It also deletes the restore points in S3 under `restore-points/`. Only then does it delete the database rows, in one transaction; cascades take the drafts, snapshots, writers, invitations and RECENT entries, and usage counts keep their rows with the episode emptied. Postgres is the work list, so a purge that dies halfway is finished the next day. `--dry-run` only counts.
- **Where it lives:** in the sync service, which owns the edit-log and snapshot formats. That added `forget(docId)` to the edit log and snapshot stores, in DynamoDB/S3 and in memory.
- **Claude's choices (say if any should change):**
  - **Deleted what-ifs** (which have no restore, D-081) also wait the 30 days before they're purged, as a safety net; they're never shown in the meantime.
  - **The lease item goes too.** That restarts the document's epoch numbering, which is safe only because a purged draft's ID is never used again (it's a UUID, and its row is gone, so access is refused).
  - **The schedule:** daily, as a scheduled task in the deploy stack.
- **Tests:** against Postgres with the in-memory storage: a dry run changes nothing; what's past 30 days goes with its storage and restore points; a 29-day-old deletion, live drafts, and a live what-if's base snapshot are untouched; a second run finds nothing. Against DynamoDB Local and SeaweedFS: forgetting removes the log, the snapshots, the pointer and the lease, and forgetting twice is harmless.
- **Status:** built and tested; it's scheduled in the deploy stack.

### D-089 · 2026-10-27 · Browser support for the beta, measured; the deploy waits; the domain to be named

- **Measured** (the pages phase's checklist item 6): line wrapping on 1,500 paragraphs per engine, half realistic screenplay prose and half adversarial text, compared with what pagination counts.
  - **WebKit (Safari):** 0 differences, like Chromium (Chrome and Edge).
  - **Firefox:** breaks a few character pairs differently, mainly a hyphen before a digit ("555-|0199"), plus some slashes and quotes. That's about 1% of realistic action paragraphs, and more in the narrow dialogue and parenthetical columns. Pagination, page breaks and the PDF are the same everywhere; only Firefox's on-screen wrapping of those lines can differ.
  - **Chromium:** one adversarial case: a word longer than the whole line, with an en dash exactly where it overflows. Chromium fills the line rather than leave the dash alone on it. It's vanishingly rare in real scripts, so it's logged here rather than special-cased.
- **The whole web suite in WebKit and Firefox:** 170 of 176 pass (`WR_BROWSERS=webkit,firefox`; `vitest.config.ts` now takes the browser list). The six are:
  1. Firefox wrapping, as above.
  2. Two Safari Tab tests. Safari's default Tab moves between form fields only (buttons need Option+Tab or the "Press Tab to highlight each item" setting); that's the browser, not the app.
  3. One WebKit clipboard test: the test can't grant clipboard access, and the app correctly shows the link to copy by hand.
  4. Firefox co-writing in the two-editors-side-by-side test, whose 816 px pages overflow their 720 px slots. Single-editor clicks in Firefox place the caret correctly at every position tried.
  5. A view-only test racing the D-085 skeleton, whose `.script` class it matched. Fixed by waiting for the real editor; the same fix went into the share test.
- **Arnav's calls:**
  1. **Browsers: Chrome, Edge and Safari are supported, and Firefox works** with a quiet, one-time toast the first time it opens a script: "Writers' Room works best in Chrome, Edge or Safari. In Firefox a few lines may wrap differently on screen; your PDF is always exact." It's remembered per browser in localStorage. Rejected: making Firefox exact (per-browser break tables, about 1-2 days, and another engine to re-measure every release); blocking Firefox (turning testers away for a mostly cosmetic difference).
  2. **The domain:** Arnav will pick a name other than the two whois showed free (`usewritersroom.com`, `writersroomhq.com`). Until then everything is built against a placeholder.
  3. **Build now, deploy later:** the deploy stacks are built, synthesized and tested, and the load tests are run locally, but nothing is deployed to AWS until Arnav says so. No cost yet. Rejected for now: deploying with the budget raised to $60 (Claude's recommendation), or with the $40 alarms kept.
- **Status:** Arnav's calls. Built: the Firefox toast and its test, and the browser list in the test config.

### D-088 · 2026-10-27 · Visual audit against prototype v2 (beta-readiness step 5): every difference fixed or explained

- **How:** a browser test (`apps/web/test/parity.test.tsx`, `parity.ts`) loads prototype v2 in an iframe beside the real app, drives both into the same state, and compares the computed styles of every element they share, property by property (sizes, weights, colors, spacing, borders, radii, shadows, widths of fixed-size things), in both themes. It covers 20 states: sign-in; Home; the account menu; an inline delete confirm; Members; a script; the Drafts tab; the Share menu; a toast; Invite co-writer…; page view; a what-if; its dot popover; Compare; Changes; and Review all. With `VITE_PARITY_SHOTS=1` it also saves a screenshot pair of each state, which Claude reviewed by eye. It's now a guard: every expected difference is listed in the test with its reason, and anything new fails.
- **Fixed (the app was wrong):**
  1. **The Members invite footer** squeezed "Invite to The Long Night" into a narrow column beside the field, and Invite ran off the panel. Compare's footer rule (`.rf`, flex) applied to it once the what-if styles loaded, which in the real bundle is always. It's block again, as the prototype has it.
  2. **Menus and the dot popover were 10 px narrower.** The app drew menus border-box, the prototype content-box (a 200 px menu draws 210 px). Menus are content-box now; the element menu stays border-box so it still fits inside the 1.5 in margin (D-014).
  3. **Review all opened under its own icon,** 34 px left of where the prototype puts it (its right edge with Share's). It now opens against the toolbar's right group.
  4. **Review all's rows were 30 px,** not 32 (a rule-order clash with `.mi`).
  5. **Drafts rows' second line and Home's invitation line sat 2 px high:** a rule meant only for a scene row's "Sent ✓" reached them.
  6. **One-line toasts were 39 px, not 36:** D-077's wrapping change had also raised the line height. Back to the prototype's; long toasts still wrap.
- **Found on the way, now fixed:**
  - **Members and Invite co-writer… showed an empty panel or menu while loading** (a gap in D-085). They now show skeleton rows.
  - **D-085's empty note** broke "what-if" at its hyphen across two lines. It now uses a non-breaking hyphen.
- **Different on purpose (each already logged, or explained in the test):**
  - **Page geometry:** true screenplay geometry (D-003), and no page number on page 1 (SPEC 3.7).
  - **Additions the prototype doesn't have:** Home's Import action (D-071), and the Share menu's Export PDF (D-076).
  - **Dark-mode "Send mine to main"** uses dark text (`--on-accent`, D-080).
  - **The nudged tokens** (D-086).
  - **Avatar colors** come from each person's ID (D-018).
  - **Snapshot rows** round on hover, because they're clickable for restore (D-081).
  - **Compare's preview** keeps a cue on the line right above its dialogue, as the script does, where the prototype's preview puts a gap between them (industry standard, D-073).
  - **Opening Compare under 1300 px** collapses the sidebar (the prototype's own rule; its state was set directly in the audit).
- **Artifacts, not differences:** different sample content (row counts, text lengths), hover or focus left by the click that opened a state, and the closed sidebar measuring 0 px in both.
- **Not comparable:** the element menu and the formatting warning aren't in either prototype (they came from D-014), so they're checked by their own tests.
- **Also:** D-087's three-writer guards now allow at most one key over 50 ms (the full suite in parallel once stalled a single key at 56 ms; alone, the slowest is 24 ms) and still record the slowest.
- **Status:** Claude's fixes to match the source of truth (no product change); the reasons for each difference are in the test.

### D-087 · 2026-10-27 · Performance pass (beta-readiness step 4): three writers on 110 pages, both views

- **How it was measured:** the existing 110-page typing test, plus two new ones (`apps/web/test/perf.test.tsx`). Two co-writers type about five keys a second (with pauses) and show their cursors while Maya reads and types, in the open view and page view. Then the same in a what-if while the co-writers type in main, so the live three-way comparison reruns on their every keystroke. The co-writers run in the test sync server's Node process (`test/syncServer.ts`, `/writers`), not in the browser tab, so their own work isn't counted against the frames being measured. Each run records the editor's work per update, the browser's keydown-to-paint time (Event Timing), every frame's length, and long tasks.
- **Result:** nothing drops frames, so there was nothing to fix. Remote updates cost 2.4 ms p50 and 3.5 ms p95 in the open view (1.4 and 2.1 in page view); keys while others type cost under 2 ms p95; there were 0 frames over 33 ms and 0 long tasks in every scenario, including the what-if. The comparison on its own is 4.2 ms at 110 pages and runs at most once a frame. Full table in `docs/metrics.md`.
- **Guards added** (D-012's proposed performance budget, now real): p95 work under 8 ms per update or key, the slowest key under 50 ms, and at most 2 frames over 33 ms per measured window (a little slack for a busy machine).
- **D-012's spike follow-up** ("one long task of about 100-160 ms per run during solo typing"): not seen in any of these runs. The one remaining first-key cost is the browser's own first layout of a 110-page editable document (about 50 ms, D-078), before anyone types.
- **Status:** measured, no changes needed; the guards are Claude's (no product effect).

### D-086 · 2026-10-27 · Accessibility pass (beta-readiness step 3): three tokens nudged, a way out of the page, and the audit

- **How it was checked:** a new browser audit (`apps/web/test/a11y.ts`, `a11y.test.tsx`), our own small versions of what automated auditors check, with no new library. On every screen in both themes (sign-in; Home; Members; a script with its Drafts tab, the Share menu and page view; a what-if with its dot, popover, Compare, Review all and Changes; the "can't reach" notice) it measures:
  - **Text contrast** against the real composited background (4.5:1, 3:1 for large text);
  - **Status graphics** at 3:1 (WCAG 1.4.11): the ● markers and the margin dots;
  - **Names:** every control has one.
  - **Keyboard:** Tab walks Home and the script's toolbar and sidebar, and every stop must draw a focus indicator.
- **What it found against the prototype's colors,** and **Arnav's call: nudge three tokens** (Claude's recommendation; superseding SPEC 3.1 for these three values only, as D-003 did for page geometry; prototype v2 updated to match, v1 left as the record):
  - `--muted` light #5f5f64 → **#5b5b60**: small muted text on a selected row was 4.42:1, now 4.70:1.
  - `--muted` dark #a1a1a8 → **#a5a5ac**: 4.40:1 → 4.62:1 (`--icon` is unchanged).
  - `--amber` light #c98a1b → **#a06e10**, a slightly deeper ochre: the "main changed too" marker was 2.4:1 on the sidebar (below even 3:1), now 3.7:1 on the sidebar, 3.1:1 on a selected row and 4.4:1 on the page. Dark amber already passed.
  - Rejected: keeping the tokens and adding outlines and heavier text on selected rows (shapes the prototype doesn't have); keeping the prototype as a logged deviation (the amber marker would stay hard to see, and amber vs. blue would rely on color alone).
- **Leaving the page by keyboard, Arnav's call:** Tab and Shift+Tab change element types (SPEC 4.2), so a keyboard-only writer could never leave the script. Arnav asked for something more intuitive than Claude's first recommendation (F6 cycling areas), then chose **the element menu showing the way**: Esc's menu (SPEC 4.3) gains a muted footer, "Leave the page · Tab". Tab from the open menu moves focus to the sidebar's tab (or to the toolbar in page view, where the sidebar is hidden), and Shift+Tab moves it to the toolbar. Rejected: F6 / Shift+F6 (invisible, a convention few writers know); Ctrl+M toggling Tab, as VS Code does (writers who hit it by accident lose Tab without knowing why); plain Esc then Tab (overloading the menu with no hint); walking off the top with ↑ (rarely discovered); menu hint plus F6 (two ways, one invisible).
- **Fixed with no decision needed:**
  - **The hidden layer was reachable.** Home stayed in the tab order (and in screen readers) behind an open script, and vice versa. Hidden layers are now `inert`.
  - **Holding Shift closed the element menu,** so Shift+S typed an S instead of picking Scene Heading. Modifier keys alone now leave it open.
  - **Menus give focus back** to the button that opened them.
  - **Tabs:** ← and → move between Scenes and Drafts (the ARIA tab pattern, with one tab stop).
  - **Clickable rows** (Home's scripts and episodes, what-ifs) take Space as well as Enter.
  - **Labels:** the ● scene markers say "Differs from main" or "Main changed this scene too"; the legend's dots are hidden from screen readers, since the words beside them say it; Home's green ● is decorative next to "editing now".
- **Reduced motion:** the global rule in `base.css` covers every animation and transition. The one script-driven loop (`pageView.ts`) only holds the text still during the collapse, and smooth scrolling already checks the setting.
- **Tests:** 7 in Chromium (both themes' audit; Tab and focus on Home and the script; the element menu's way out; tabs' arrows; focus returning from a menu; Shift+S).
- **Status:** Arnav's calls (tokens, the way out); the fixes are Claude's, with no product change.

### D-085 · 2026-10-27 · Loading, empty, outage and crash states built (beta-readiness step 2)

- **Built to D-084's calls:**
  - **Skeletons** (`components/Skeleton.tsx`, `Loading.tsx`): Home's sidebar rows and episode list; a script's toolbar (back works, and the title shows at once when Home already knew it), scene rows and lines. The lines use the screenplay's own element classes, so each bar starts where its words will (a test checks heading at 1.5 in and dialogue at 2.5 in). Snapshots and Compare get skeleton rows while they load. The colors are existing tokens (`--line2`, `--sel` on the sidebar); no new token.
  - **The app's start** shows Home's or the script's skeleton only if this browser was signed in last time (a `wr-signed-in` flag in localStorage, a convenience only), so a signed-out visitor never sees Home flash before sign-in.
  - **Can't reach Writers' Room:** `auth.ts` tells a refused cookie (signed out) from no answer or a 5xx (unreachable). At the start that shows the notice (`pages/Notice.tsx`), which retries with backoff and full jitter (up to 1, 2, 4… s, capped at 30 s), retries at once when the browser comes back online, and has Try again. Once signed in, a failed renewal never signs anyone out: the current token is used while it lasts, and the sync client keeps retrying. Every API call that gets no answer or a 502-504 now says "Can't reach Writers' Room. Check your connection and try again." instead of "Something went wrong".
  - **Crash boundaries** (`components/Boundary.tsx`): one around the whole app (the "Something went wrong" notice), and one inside each panel (both sidebars, Compare, Members), which shows "This panel hit a problem. Reload" in place of only that panel. Every caught crash is reported (D-083).
- **Claude's choices on the way (say if any should change):**
  - Skeletons appear 150 ms in, so fast loads show nothing at all, which answers the flash concern in D-084's option. They pulse gently; reduced motion shows them still and at once.
  - A crashed **menu** (Review all, Invite co-writer) just closes rather than showing the panel note, since a note would hang in the toolbar. It's still reported.
  - **Empty notes** in the co-writer menu's "none" style (12 px muted): "No scenes yet. A scene heading starts one." (Scenes tab); "No what-ifs yet. Try an idea with + New what-if." (the second sentence only for editors) and "No snapshots yet." (Drafts tab).
  - Opening a script offline that this device has never seen: "This script opens when you're back online." on the page, instead of skeleton lines.
  - A link to a page that doesn't exist: "That page doesn't exist." and Home (it used to show Home silently).
- **Open issues fixed:**
  - **D-069's "an unreachable API looks like being signed out"** (above).
  - **"An import interrupted by a reload leaves an empty script"** (the pages-phase checklist): the imported lines are also kept in the tab's sessionStorage until they're written in, so a reload finishes the import. It's the writer's own file, in the same browser that keeps the script's offline copy; closing the tab drops it.
- **Tests** (real Chromium, 8): Home and script skeletons, including the bars' margins; the notice at the start, and back in on Try again; an outage after signing in keeping you in, with the new message; a panel crash and Reload; the page crash notice; the empty notes; a link to nowhere. The fake API gained `/__fake/down` (every /api call a 503, as CloudFront says) and `/__fake/slow`.
- **By hand, booked for Arnav's end-to-end test:** reload during an import; stop `dev:api` while Home is open and while writing.
- **Status:** built and tested to Arnav's D-084 calls; the choices above are Claude's.

### D-084 · 2026-10-27 · Loading, "can't reach" and crash states (beta-readiness step 2)

Prototype v2 mocks the empty states (Home's "No scripts yet.", "No episodes yet.", Compare's notes, the co-writer list's "none"), but no loading, outage or crash states. Today the app is blank while it starts, while Home first loads and while a script opens; an unreachable API looks like being signed out (D-069's open issue); and a render error blanks the window.

- **Arnav's calls:**
  1. **Loading: skeleton placeholders** (over Claude's recommendation of a quiet "Opening Pilot…" line after 400 ms). Gray bars shaped like what's coming: Home's sidebar rows and episode list, and a script's scene rows and its lines in true screenplay geometry. Rejected: a muted line after a pause (Claude's recommendation); a thin progress bar (it would need the reserved accent blue).
  2. **Can't reach the server: a notice in the sign-in page's layout** (Claude's recommendation): the wordmark, "Can't reach Writers' Room", "Your scripts on this device are safe. Trying again…", and Try again in sign-in's Continue style. It retries by itself with backoff and returns to where you were. Only the app's start shows it: once in, an outage keeps the script open. Rejected: a toast on the sign-in page (writers would still see a form they can't use); opening Home from a copy on the device (account data cached in the browser, a privacy question on shared computers).
  3. **Crashes: per panel, then per page** (Claude's recommendation). A crash in a side panel replaces only that panel with "This panel hit a problem. Reload", so writing never stops; a crash in the editor or the app shows the notice layout with "Something went wrong" / "Your work is saved on this device." / Reload. Either way it's reported (D-083). Rejected: one full-page notice for every crash (a small panel bug would stop the writing).
- **What changes for writers:** no more blank screens; an outage says so instead of asking them to sign in; a broken panel doesn't take the script down with it.
- **Status:** Arnav's calls; being built.

### D-083 · 2026-10-27 · Usage counting and browser crash reports built (beta-readiness step 1)

- **Built to D-082's calls:**
  - **Migration 004** adds `episode_id` to `usage_events`, plus indexes.
  - **The sync server** (the home server) counts `session_started` when someone joins a draft, and `multi_writer_session` for each writer once two or more people who can edit are in the same draft. Both go through the access source (`counted`), at most once per 30 minutes per person per episode, so reconnects and second tabs aren't new sessions. Viewers count as sessions, never as writers.
  - **The API** counts `whatif_created` inside the same transaction that creates the what-if.
  - **The browser** reports `scene_sent` (one per scene), `script_imported` and `pdf_exported` through `POST /api/usage`, which takes only those three events and only for an episode the caller can see. Unknown fields are stripped by the schema, so nothing else can be stored.
  - **Crash reports:** uncaught errors and rejections in the browser go to `POST /api/client-errors` (public, so the sign-in page reports too; 20 a minute per address; at most 5 per page load). They're written to the API's log, CloudWatch on AWS, never the database: the error's message and stack, the app version (`VITE_WR_VERSION` at build) and the page's path.
  - **`docs/metrics.md`:** what each event means, then the SQL for the weekly table, the weekly return rate, feature use, first-week cohorts and room sizes. Arnav's own accounts are left out with a psql variable, so no address is in the public repo. Every query was checked against synthetic rows.
- **Claude's small choices (say if any should change):** the 30-minute session window; viewers count as sessions; a what-if writer counts as co-writing with someone in main (they're connected to main to compare and send); crash reports aren't tied to a user.
- **Tests:** API (Postgres): browser events with who and which episode; refusals for server-only events, outsiders and the signed-out; the what-if count; crash reports accepted signed out, refused when too long, never stored. Sync: sessions counted for everyone, the 2+ writer session for writers only (memory), and the 30-minute window against real Postgres.
- **Status:** built and tested to Arnav's D-082 calls; the small choices above are Claude's.

### D-082 · 2026-10-27 · Beta-readiness phase: the deploy, monitoring, load-test and usage decisions

The phase prompt ("make it beta-ready, measured and polished") asks to run the pages phase's beta-readiness checklist end to end. Two of its blockers had never been started: the app itself isn't deployed (only Cognito, SES and the budgets are), and the load-test harness (`tools/loadtest`) is an empty stub. Both are in this phase. `docs/metrics.md` and a runbook, named in the prompt, didn't exist yet; Claude writes both here.

- **Arnav's calls** (Claude's recommendation each time, except the dashboard):
  1. **Postgres on AWS: RDS** `db.t4g.micro`, single-AZ, with 7-day automatic backups, about $13-15 a month (open decision 15). The backups settle the checklist's backup item. Rejected: Aurora Serverless v2 (the first request after an idle pause takes about 15 s, so a writer opening Home waits); Postgres inside the container (no managed backups, and the data goes when the task is replaced).
  2. **A domain, bought now** (supersedes D-038's "deferred until just before the beta"). Arnav picks the name and buys it. Claude wires it to CloudFront with HTTPS, SES (a domain identity, then Arnav's production-access request) and Cognito. Rejected: no domain (every tester would first have to click an AWS verification email before any code reached them); settling the product name first (it doesn't block the build, so it's folded into choosing the domain).
  3. **Monitoring: CloudWatch only** (open decision 16): server logs in CloudWatch, a few alarms emailed to Arnav (a server down, API 5xx errors, edit-log append failures), and a tiny endpoint for browser crash reports that carries the error, the stack and the app version, never script text. Rejected: adding Sentry (a new third party seeing writers' sessions, which needs scrubbing); logs with no alarms (outages would be learned from testers).
  4. **Load tests: local first, then AWS** (open decision 11, method). The harness is proven on the laptop's 3-node cluster; the quotable numbers come from one run on a temporary 3-node AWS cluster with the load generator in the same region, torn down afterwards. Rejected: local only (DynamoDB Local's one-at-a-time writes distort the numbers, D-023); AWS only (every harness bug would cost a cloud run).
  5. **Load-test targets: rooms + capacity** (open decision 11, targets). "Latency" is one writer's keystroke reaching another writer's screen.
     - (a) 1,000 writers in 200 scripts (5 each, typing in realistic bursts) on 3 servers, with p95 latency under 150 ms.
     - (b) One 15-writer room.
     - (c) A server killed mid-run, with zero lost edits checked by comparing every tagged keystroke against the final scripts, plus the pause writers saw.
     - (d) A ramp on one server to find where p95 crosses 150 ms.
     - Rejected: beta scale only (about 50 writers is a weak resume number); 10,000 writers (a bigger generator and cluster, so more cost, far beyond any beta need).
  6. **Usage events: recorded on the server where they happen, with a user and an episode ID** (SPEC 5.9).
     - The sync server records "session started" and "session with 2+ concurrent writers"; the API records "what-if created".
     - The browser reports only browser-side events: a scene sent, a script imported, a PDF exported.
     - Each row is an event name, a user, an episode ID and a time, never content, so active scripts and rooms can be counted as well as people.
     - Rejected: no episode ID (no count of active scripts or rooms); everything from the browser (ad blockers and closed tabs drop events).
  7. **The beta metrics are a SQL file** (Arnav's choice over Claude's recommended `pnpm metrics` command): saved queries in `docs/metrics.md` to paste into psql. Rejected: a `pnpm metrics` command (more convenient, more code); an internal `/admin` page (new UI and a new admin permission to secure).
  8. **Production servers are bundled with esbuild** (open decision 10): each server builds into one JavaScript file, so images are smaller and a replacement server starts faster after a failover. Dev keeps `tsx`. Rejected: `tsx` at runtime (slower starts, which add to failover time); `tsc` (the workspace packages export `.ts` sources, so it needs more config than a bundle).
- **What changes for writers:** nothing visible yet. These decide how the beta is hosted, watched and measured.
- **Status:** Arnav's calls.

### D-081 · 2026-10-27 · What-if decisions confirmed; renaming and deleting what-ifs built

- **Arnav's calls** (D-080's defaults confirmed):
  1. Sends from one what-if within **5 minutes** share one restore point.
  2. A what-if **stays as it is** once every scene is sent ("Everything's in main").
  3. A snapshot restore is confirmed **inline in its row**, then it's one ordinary edit with Undo.
  4. **Renaming and deleting what-ifs, built now.** Both are for whoever started the what-if, or the showrunner (`canManage`, checked in the API).
     - **Rename:** click the what-if's name in the switcher ("Main › **Darker ending** ▾"), as episode titles (D-033). Clicking "Main ›" or ▾ still opens the menu. While renaming, the switcher is plain text with the field, since an input can't sit inside a button.
     - **Delete:** a hover × on its Drafts row, an inline confirm ("Delete “Name” for everyone?"), then "“Name” deleted". The what-if is soft-deleted, and a `wr_access` NOTIFY moves anyone in it back to main with "“Name” was deleted." There's no restore for deleted what-ifs (unlike episodes in D-037); say if you want one.
  - Rejected: 15 or 1 minutes; offering to delete or auto-archiving a fully sent what-if; a one-click restore with Undo; restoring into a new what-if; rename only, or neither.
- **Fixed on the way:**
  - Root's session depended on the draft *object*, so every refetch of the drafts list (after a rename) tore down and reconnected the editor. It now depends on the draft's ID and base snapshot.
  - While switching drafts, Root briefly had no current draft and unmounted the script screen, which flashed blank and lost the sidebar tab and page view. It now keeps the last draft on screen until the new one arrives.
- **Tests:** an API test of who may rename and delete (and that main can't be). A browser test: rename by clicking the name, the menu still opening, then delete from the row back to main.
- **Status:** Arnav's calls; built and tested. The remaining D-080 defaults (undo warning, automatic snapshots, snapshot text size, deleted-scene rows, `--on-accent`, "This scene isn't in main yet.", viewers seeing what-ifs) stay as built unless Arnav changes them.

### D-080 · 2026-10-27 · What-ifs built: forking, snapshots, the three-way comparison, Send to main, Compare, Review all, Changes

Built without Arnav's input on his instruction (D-079); his open decisions are built with Claude's recommended defaults, listed under "Waiting on Arnav" below and in Proposed.

- **The comparison** (`packages/schema/src/whatif.ts`, pure, with 18 tests):
  - Scenes are compared by scene ID and content hash, three ways: the base snapshot the what-if was forked from, the what-if, and main as it is now. Blue means only the what-if changed it; amber means main did too; changes only main made are ignored.
  - Added and deleted scenes count as changes. Moved scenes are found as the scenes outside a longest common subsequence of scene order, so swapping two scenes flags one of them, not every scene after them.
  - **Split and combined scenes:** scenes that share a line (block ID) between the base and the what-if form a group, sent together. Sending half a split alone would delete the other half's lines from main until it arrived.
  - **What was sent:** each what-if keeps a record of what it sent in its own Y.Doc (a `sent` map: the scene's lines, and the scene before it). That makes "Sent ✓" exact, and editing a sent scene again turns it blue (or amber if main changed it since), never permanently amber.
  - `planSend` builds main's new lines: the what-if's version of each sent scene, placed after the scene before it in the what-if; deleted scenes go; lines that moved in from elsewhere leave their old place.
  - `diffWords` is a word-level diff merged into phrases (the spike's diff was word by word).
- **The API** (`apps/api/src/routes/drafts.ts`, migration 003, 8 tests on Postgres and SeaweedFS):
  - Routes: list an episode's drafts; + New what-if (the browser sends main's current Yjs state, kept as an automatic snapshot "When “Name” began", and the what-if is based on it); + Snapshot; restore points before a send or a restore; a snapshot's bytes.
  - Snapshot bytes live in S3 under `restore-points/` (SeaweedFS locally, memory in tests), per SPEC 5.2. That adds `@aws-sdk/client-s3`, the same SDK family and version the sync server already uses.
  - Who may do what: forking and snapshots need edit rights (writers on their episodes, the showrunner); viewers can list and read. Every check goes through `canMerge`.
- **The app:**
  - **Routes:** `/e/<episode>/w/<what-if>`, so what-ifs have real links and back and forward work.
  - **A what-if session** (`whatif/useWhatIf.ts`) holds the what-if (the editor), a live copy of main over its own sync connection, and the base snapshot. The comparison reruns at most once a frame.
  - **Seeding:** a new what-if is seeded from its base snapshot's Yjs state when the server confirms it's empty. That's idempotent, so two people opening it at once can't duplicate it.
  - **Send to main:**
    1. A restore point (sends from one what-if within 5 minutes share one, server-side).
    2. Main's new lines are written with y-prosemirror's own `updateYFragment` diff, in a transaction with the send's own origin. Unchanged lines aren't touched, so a co-writer typing in them loses nothing.
    3. A Yjs UndoManager scoped to that origin, so Undo reverts exactly that send. If main changed those scenes since, the toast asks "…has changed in main since you sent it. Undo the send anyway?" with Undo anyway or Keep.
    4. Then the heading pulse, "Sent ✓", and "“Name” sent to main · Undo". Amber scenes open Compare first with "Main changed this scene too, so compare it first".
  - **Margin dots and keys:** a 10 px dot, 36 px left of the heading, with its ring when active. The popover sits in the margin (Send to main ⌘↵, Compare ⌘⇧↵; Ctrl on Windows and Linux). The keys act on the cursor's scene.
  - **Compare:** the 340 px right panel follows the cursor and shows main's version with main's additions highlighted, plus "changed by NAME, time".
    - The "changed by" comes from a per-scene record main's editors keep in main's Y.Doc (`whatif/sceneEdits.ts`), written 1.5 s after they stop typing in a scene.
    - It has Send mine to main and the prototype's empty states. The sidebar collapses when the window is under 1300 px (the prototype's rule) and comes back on close. Esc closes the topmost thing: popover or menu, then Review all, then Compare.
  - **Review all** and **Changes** follow the prototype's markup and wording. Changes shows additions in the ins colors and removals struck through in the del colors, inline, plus removed lines.
  - **The Drafts tab:** Main ("Editing now · names", live even from a what-if), + New what-if, WHAT-IFS ("creator · time · N scenes differ", the count reported by whoever has the what-if open), and SNAPSHOTS with + Snapshot. Restore is an inline confirm, then one ordinary, undoable edit.
  - **The draft switcher:** "Main ▾" or "Main › Name ▾", listing every draft with ✓ on the current one.
- **Fixed on the way:**
  - Toast actions now hide the toast *before* running, so a follow-up toast ("Send undone") isn't hidden at once.
  - Root refetches drafts per URL and only redirects "isn't there any more" on a list fetched for that URL, which a new what-if's navigation would otherwise hit.
  - A flaky Home test's click helper now waits for its target.
- **Tests** (real Chromium, real sync server, fake API; 7 for what-ifs):
  - At the document level: two writers sending different scenes at once both land; a co-writer typing in main during a send keeps their typing, in another scene and in an unchanged line of the same scene; Undo reverts only the send.
  - In the app: fork; edit; the blue dot and navigator ●; amber after a co-writer's change; ⌘↵ with the pulse, toast, "Sent ✓" and main updated; Undo; amber's Send opening Compare with "changed by Sam" and the highlight; Send mine to main; Esc; Changes; Review all down to "Everything's in main"; the switcher.
  - Re-editing a sent scene brings the dot back, and Undo after main changed asks first.
  - A viewer gets no + New what-if or + Snapshot.
  - + Snapshot, then restore with its restore point, then Undo.
  - Claude checked screenshots against prototype v2: the popover, Compare, Review all with Changes, the Drafts tab.
- **Waiting on Arnav (built with these defaults; each a one-line change):**
  1. **Grouping window for restore points** (SPEC "a few minutes", open question 26): **5 minutes**, per what-if.
  2. **A what-if after every scene is sent** (phase prompt): it **stays as it is**. Review all says "Everything's in main", the dots are gone, and the Drafts line reads "no changes yet". Alternatives: archive it automatically, or offer "Delete this what-if?".
  3. **How restoring a snapshot is confirmed** (open question 28): an **inline confirm in the snapshot's row** ("Restore “Name”? Your draft as it is now is kept as a snapshot first." Restore · Cancel), like delete (D-037). Then one ordinary edit into the current draft, with a restore point before it and Undo in the toast.
  4. **The warning before undoing an edited send** (open question 27): a **toast with Undo anyway · Keep** (no dialogs, SPEC 3.9).
  5. **Automatic snapshots** (open question 29): only before sends, before restores, and when a what-if begins.
  6. **Renaming and deleting what-ifs** (open question 30): **not built**. New what-ifs are "Untitled what-if", as in the prototype. **Viewers can see what-ifs** (read-only, can't fork, send or snapshot). **Only editors can take snapshots.**
  7. **Snapshot row text** (open question 31): **14 px, as the prototype**.
  8. **Scenes the what-if deleted:** listed in the Scenes tab where they were, struck through with their dot, and in Review all as "Name (deleted)". There's no margin dot, because there's no heading to put it on.
  9. **The primary button in dark mode** (the open contrast issue): a new `--on-accent` token, white in light mode as the prototype, and #1C1C1E in dark mode, about 7:1 on the dark accent.
  10. **Compare for a scene main doesn't have yet:** "This scene isn't in main yet." (not in the prototype).
- **Known limits (open issues):**
  - With Changes on, removed text is shown inline, so page view's breaks (computed from the script itself) don't account for it.
  - A viewer opening a what-if nobody has opened yet sees it empty, since only an editor can seed it.
  - Usage counting ("what-if created", "scene sent", SPEC 5.9) isn't built.
  - The Drafts tab's what-if count is only as fresh as whoever last had that what-if open.
- **Status:** built and tested; Arnav's decisions and hands-on testing pending.

### D-079 · 2026-10-27 · Real-pages phase approved: automatic (CONT'D), toasts wrap, four gaps for later

- **Arnav's calls:**
  1. **Long toasts wrap** (D-077): kept.
  2. **(CONT'D) after action: switched to Final Draft's default** (supersedes that part of D-071).
     - A character's cue shows " (CONT'D)" when the same character spoke last in the scene with only action between. Another speaker, a shot, a transition or a new scene resets it, and a (CONT'D) already typed is never doubled. Extensions are kept: "JOHN (O.S.) (CONT'D)".
     - It's display only, like capitals (D-014), so the stored text never changes.
     - It's counted by pagination and drawn in both views, as a non-editable suffix after the cue that the cursor stays in front of, and in the PDF.
     - Tests: 5 unit cases, and the screen-vs-PDF browser test now includes continued cues.
  3. **Future versions added:** inline bold, italic and underline; dual dialogue; an editable title page; scene numbers and revisions.
  4. **Next phase:** what-ifs, snapshots, the three-way scene comparison, margin dots, Send to main, Compare, Changes and Review all. Claude builds as much as it can without Arnav's input and logs the testing left for him.
- **Status:** Arnav's calls; built and tested.

### D-078 · 2026-10-27 · Typing on a 110-page script: measured smooth in both views

- **How it's measured** (`apps/web/test/perf.test.tsx`, real key presses in Chromium on Arnav's M2):
  - A 110-page generated script, typed into near the top (the worst case for re-pagination) and near the end, in the continuous view and in page view.
  - The editor's own work per key is timed around ProseMirror's state update, which includes re-pagination and redrawing the page-break widgets.
  - Input-to-paint per key comes from the browser's Event Timing API.
- **Results** (three runs):
  - Editor work per key: about 1.0–1.6 ms median, 1.2–1.9 ms p95, under 4.5 ms at worst, the same in both views.
  - Every measured key reached the screen within one frame (16 ms, the API's resolution).
- **One finding:** the session's very first key costs the browser a one-time 40–70 ms. That's its first layout and input setup over a 110-page editable document, outside our code (our work stayed under 4 ms), and spellcheck makes no difference. The test types one warm-up key, then holds every key under 50 ms and our work under 8 ms p95.
- **Why it's this cheap:** wrapped lines are memoized per block, pages before the change are reused (D-072), and page-break widgets keep their DOM through stable keys (D-074).
- **Status:** built and tested.

### D-077 · 2026-10-27 · Import from Final Draft and Fountain

- **Built** (`apps/web/src/import/importScript.ts`), following D-071's decisions:
  - **Final Draft:** read with the browser's XML parser.
    - Scene Heading, Action, Character, Parenthetical, Dialogue, Transition and Shot map one to one. General, Cast List, New Act and End of Act, and Lyrics are kept as Action.
    - Script notes (including ones nested inside paragraphs), scene numbers and revision marks aren't imported. Bold, italic and underline are removed. Dual dialogue becomes one speech after the other.
    - The title page's first line names the script; the rest of it is reported.
  - **Fountain:** our own parser, following the fountain.io syntax.
    - The title page (values may continue on indented lines); natural and forced headings (`.`), cues (`@`, lowercase extensions allowed), parentheticals, dialogue, transitions (`TO:` or `>`) and forced action (`!`).
    - Centered (`>…<`) and lyrics (`~`) are kept as Action. Sections, synopses, notes, boneyard, forced page breaks and scene numbers aren't imported.
    - Emphasis is removed (nested markers included; escaped `\*` kept as a star). CRLF and a byte-order mark are handled.
    - Fountain has no Shot element, so shots arrive as action, as in other tools.
    - Inner line breaks become spaces, because our blocks are one line of text; the report says how many paragraphs that touched.
- **Flow:**
  - Home's toolbar gets **Import** beside "+ New script", the same text-action style (D-071). It opens a file picker for .fdx, .fountain, .spmd and .txt.
  - The file is parsed in the browser. A plain script is created, named from the title page (or the file name), and opened.
  - The editor writes the blocks into the empty document at the moment a new script would get its first line (`import/pending.ts`, `seedNewScript`). That path runs once the server confirms the document is empty (D-074).
  - The toast reports plainly, for example: "Imported “Night Shift” · 16 pages. Kept as action: 2 act breaks, 1 general paragraph, 1 lyric. Not imported: 4 scene numbers, 1 note, 3 other title page entries. 1 dual-dialogue pair now runs one speech after the other. Bold, italic and underline were removed."
  - Files that aren't scripts get a plain message.
- **Claude's proposal, awaiting Arnav:** toasts used to be a single line. Long ones (only an import summary so far) now wrap at up to 600 px and stay up longer (6 to 15 s, by length). Short toasts look exactly as before.
- **Tests:**
  - "Night Shift", an original screenplay of 36 scenes and about 16 pages, generated as both Fountain and Final Draft with each format's extras (`apps/web/test/fixtures/make_fixtures.py`).
  - Both parsers give the expected blocks, the title and an exact report, and they agree block for block except Fountain's Shot.
  - It paginates with every rule holding. There are Fountain edge cases and messages for bad files.
  - End to end: Home › Import opens the script with every block and the toast, and page view shows the right number of pages.
- **Known limits:**
  - An import that's interrupted before the script opens (a reload) leaves an empty script.
  - Usage counting ("script imported", SPEC 5.9) isn't built yet.
- **Status:** built and tested; the toast change awaits Arnav.

### D-076 · 2026-10-27 · PDF export: drawn from the pagination output, with an auto title page

- **Arnav's call (from options):** an **auto title page** [recommended]. It shows the title (the series name and the episode in quotes, or the script's name), then "Written by" and the episode's writers, or the showrunners if nobody is assigned. A team is joined with "&", the WGA credit convention. It's unnumbered.
  - Rejected: no title page (not industry standard for a finished PDF); a title page editor now (new UI and data beyond SPEC, needing a mockup first).
  - An editable title page (draft date, contact, "based on") is a future version.
- **Built:**
  - `apps/web/src/export/pdf.ts`: `layoutPages()` and `layoutTitlePage()` are pure, saying where each string goes in points. They read the same pagination items page view draws, so page breaks, page numbers, (MORE), (CONT'D), (CONTINUED) and CONTINUED: match by construction.
  - `exportPdf()` loads `pdf-lib` and `@pdf-lib/fontkit` only on export, embeds Courier Prime subset (a typical script is about 19 KB), sets title, author and creator, and downloads "Series - Ep 3 - Name.pdf" (or "Name.pdf").
  - The baseline comes from Courier Prime's metrics (2048 units per em, ascent 1600, descent 700), the way the browser centers the 16 px line.
  - **Share › Export PDF** sits under a separator after the invite items, for everyone who can open the script, viewers included (D-071).
  - The font is now self-hosted for screen and PDF (`apps/web/public/fonts`, with its OFL license). Google Fonts is gone from `index.html`.
- **Tests (real Chromium):**
  - In page view, every line on screen, read from the DOM (text and position, converted to points), equals every string the PDF draws, on every page.
  - Share › Export PDF produces a valid PDF: pages = script pages + 1, US Letter, title set, Courier Prime embedded as FontFile2.
  - The title page is centered and laid out as above.
  - Claude also rendered the exported file to images and checked them.
- **Not built (SPEC 5.9):** usage counting has no endpoint yet, so "PDF exported" isn't recorded. It's on the beta-readiness checklist.
- **Status:** Arnav's call (title page); built and tested.

### D-075 · 2026-10-27 · Viewport anchoring in page view, tested with two writers

- **What was needed:** block-ID anchoring already held your line still through co-writers' edits (D-013). Page view added two ways to break it, both fixed:
  1. **Page breaks animated every size change.** A co-writer's edit that moved a break above you would ease it into place over 240 ms, after the anchoring had already corrected. Breaks now animate only during the collapse itself (`.pv-anim`, set by `editor/pageView.ts`); an edit moves them at once.
  2. **The browser's own scroll anchoring** (`overflow-anchor`) could correct the same shift a second time. It's now off for the script's scroller, leaving only ours.
- **Test** (`pages.test.tsx`): two writers side by side on a 40-scene script. Sam reads with his cursor 70% of the way down; Maya adds six lines near the top, moving every page break below. Sam's line moves less than 1 px on every update, in both the continuous view and page view.
- **Found on the way:** the tests' `clickEndOf` helper used `p:nth-child`, which also counts page-break widgets, so clicks landed on a later line. It's now `nth-of-type`.
- **As designed (D-013):** the anchor is your cursor's line when it's on screen, otherwise the first line on screen.
- **Status:** built and tested.

### D-074 · 2026-10-27 · Page view built on the pagination output; wrapping made exact; two bugs found on the way

- **How page view works** (`apps/web/src/editor/pagesPlugin.ts`):
  - The script stays one editable column. A ProseMirror plugin paginates the document on every change, incrementally (D-072), and draws one widget per page break: the rest of the page, the bottom margin, a 24 px desk-colored band, and the next page's top margin.
  - The widget also draws (MORE) at the cue column, (CONTINUED) on the page's last line, right-aligned to 7.5 in, the page number "12." at 7.5 in and 0.5 in from the top (industry position; none on page 1), CONTINUED: at 1.5 in, and NAME (CONT'D).
  - With the sidebar open the widgets have zero height, giving the continuous column, and splits inside a paragraph aren't drawn at all, so nothing rewraps. Collapsing grows them over the same 240 ms. The cursor's line is held still through the motion (`editor/pageView.ts`).
  - The page grows to hold every page, with the last one full height.
  - Decorations are rebuilt from the document each time (rule 2, D-012), with stable keys so unchanged breaks keep their DOM.
- **Wrapping made exact.** Probing found three things the first wrap model (D-072) got wrong:
  1. **Rounding:** Chromium lays text out in 1/64 px, so a column exactly N × 9.6 px wide can lose its last character. Every column now has half a pixel of slack: the right margin is 95.5 px, dialogue 336.5 px and parentheticals 230.9 px. That's invisible, and nowhere near room for another character.
  2. **Break opportunities** are now Chromium's measured pair table for 80 characters (`packages/pagination/src/breaks.ts`, generated), replacing hand-written rules that were partly wrong (for example, two hyphens *can* part).
  3. **One context rule:** a hyphen right before a digit binds to it like a minus sign, unless the hyphen follows a letter or digit.
  - `.ProseMirror.script` now uses `white-space: pre-wrap`, so line-end spaces hang; ProseMirror's `break-spaces` would start the next line with them.
- **Tests (real Chromium):**
  - `break-table.test.tsx` re-measures the table and the hyphen rule, and fails, printing a new table, if Chromium changes.
  - `pages.test.tsx`: 2,000 generated paragraphs wrap identically in the browser and the model. In page view, every line of a 37-page generated script sits exactly where the pagination output puts it, with the right page heights and page numbers. The continuous view is identical to having no breaks. Collapsing and reopening keeps the cursor's line within 2 px.
  - Screenshots checked by Claude, light and dark: a scene continuing over a break, and a speech split with (MORE)/(CONT'D).
- **Bugs found and fixed along the way:**
  - **Opening a script with no copy on this device added an empty line at the top.** The editor started on an empty document and y-prosemirror wrote its placeholder line into Yjs, which then merged above the server's first line. That hit every first open of an existing script on a device (a co-writer's, or later an imported one). Now, with no local copy, the editor waits for the server's document (`useScriptEditor.ts`); with a local copy, it still opens at once.
  - Two class-name clashes in the new widget: `.cue` (the toolbar's sync status) and `.right` (the right panel). Renamed to `pgcue` and `pgr`.
- **Known limits:** characters Courier Prime lacks (emoji, CJK) fall back to wider fonts; and the table is Chromium's (WebKit and Firefox are to be checked before the beta).
- **Status:** built and tested.

### D-073 · 2026-10-27 · Standing direction: script behavior follows industry standard

- **Arnav's call:** everything about the actual writing of the script (formatting, pagination, PDF, import) should be industry standard, with Final Draft as the reference, because Writers' Room should eventually be a real competitor. The base has to be there, along with quality-of-life features. Claude follows the standard without asking, logs each choice, and asks only where Arnav's input is needed: product and UI decisions, and conventions that conflict with something he explicitly chose.
- **Resolves D-071's proposal:** split action and dialogue at a sentence end even mid-line, as Final Draft does.
- **To raise with Arnav, not change silently:** Final Draft's default adds (CONT'D) when a character speaks again after action; Arnav chose page-break continueds only (D-071).
- **Status:** Arnav's call.

### D-072 · 2026-10-27 · Pagination package built: Chromium's wrap rules, the page layout, incremental recomputation

- **Why wrapping had to be probed:** page view and the PDF only match if our character-count wrapping (SPEC 5.8, never the DOM) breaks lines exactly where the browser does. A throwaway browser test printed Chromium's line breaks for crafted strings in Courier Prime. Findings:
  - **Spaces:** under ProseMirror's default `white-space: break-spaces`, a space that doesn't fit wraps to the *start* of the next line, so lines can begin with a visible space. Under `pre-wrap`, line-end spaces hang off the edge, which is the classic typewriter and PDF behavior. **Plan: the script switches to `pre-wrap`** (done with page view, step 2).
  - **Break opportunities:** after `-`, `--`, `–`, `—`, `…` and `?` (hyphens even before digits), and before `—`. Never at `/ . , : ; ! ( ) [ ] " ’`. A quote or closing bracket right after `?`, `…` or `—` removes that break. Runs of dashes break only after the last one.
  - **Long words** break at exactly the line width (`overflow-wrap: break-word`).
  - **Combining accents** take no width. No-break spaces and non-breaking hyphens never break.
  - **Known limit:** characters Courier Prime lacks (emoji, CJK) fall back to another font of a different width, so wrapping can drift for them. These were Chromium's results; WebKit and Firefox are to be checked before the beta.
- **Built** (`packages/pagination`, pure, no DOM):
  - `wrap.ts`: greedy wrapping by those rules, with offsets back into the text.
  - `geometry.ts`: 54 lines per page; columns of 60, 38, 24 and 35 characters; spacing mirroring `script.css`.
  - `paginate.ts`: places blocks until one doesn't fit, then tries break points from the latest backwards (a sentence split inside a block, or a break between blocks), taking the first that satisfies every rule (D-071).
  - If no break satisfies the rules (a page-long paragraph with no sentence end), the page is filled to the last line that fits instead of left empty.
  - Line counts are memoized by element type and text.
  - Incremental: pages whose layout never looked at or past the first changed block are reused, and layout restarts from there. Each page records the furthest block it read, including look-ahead into a speech.
- **Tests:** 35 in plain Node.
  - The wrap rules.
  - Every pagination rule: headings, shots and cues never last; (MORE)/(CONT'D) with 2+ lines each side; parenthetical stranding; transitions kept with the block before; action splits at sentence ends, mid-line included; scene continueds; capitals counted (ß becomes SS).
  - Properties over 30 generated scripts: every page fits; every character appears exactly once and in order; the rules hold. Incremental recomputation matches a full one after 250 random edits.
- **Speed** (118 pages, 1,919 blocks, M2): a full layout takes 2.0 ms median (3.3 ms p95). An incremental re-layout takes 1.95 ms for an edit near the start, 0.9 ms for one in the middle, and 0.04 ms for one near the end.
- **Status:** built and tested. The browser-parity corpus test comes with page view.

### D-071 · 2026-10-27 · Real-pages phase: placement, import handling, libraries and pagination conventions

Arnav's calls, from options Claude presented (recommendations in brackets):

- **Export** lives in the Share menu: a separator, then "Export PDF". Anyone who can open the script, viewers included, can export. [Recommended.] Rejected: a toolbar icon (adds a control to a deliberately minimal toolbar); a title menu (changes click-to-rename, D-033).
- **Import** is an "Import" text action beside "+ New script" in Home's toolbar, with the same hover style. It creates a new plain script from the file and opens it. [Recommended.] Rejected: turning "+ New script" and "+ New episode" into menus (two clicks for every new script); drag-and-drop (no visible affordance). Importing straight into a series as an episode is a later option.
- **Unsupported import elements:** [recommended]
  - Script text is kept as Action: centered text, lyrics, "General" paragraphs, act breaks.
  - Metadata isn't imported: notes, synopses, sections, boneyard, revision marks.
  - Bold, italic and underline are dropped (plain text in v1).
  - The title page's title becomes the script name.
  - Dual dialogue becomes one speech after the other.
  - The summary toast lists every conversion and omission plainly.
  - Rejected: keeping everything as Action (clutter, and wrong pagination until cleaned up); dropping everything unsupported (real script text could go missing).
- **Libraries:** `pdf-lib` (named in SPEC 5.7) and `@pdf-lib/fontkit` (needed to embed a custom font). Courier Prime's files (SIL Open Font License) are self-hosted and used for both the screen and the PDF, replacing Google Fonts. [Recommended.] Rejected: keeping Google Fonts on screen (two copies of the font that could differ).
- **Pagination conventions:**
  - (CONT'D) on a character cue appears only where a speech splits across pages. [Recommended.] Rejected: Final Draft's automatic continueds after action (visual noise).
  - **Scene continueds are on** (Arnav chose this over the recommended "off"). When a scene runs across a page break, the page ends with a blank line and "(CONTINUED)" right-aligned at 7.5 in, and the next page starts with "CONTINUED:" at 1.5 in and a blank line. Both count within the 54 lines.
    - They appear only when the break falls inside a scene: never before the first scene heading, and never right before a new heading.
    - These details are Claude's defaults, following Final Draft's; Arnav can change them.
  - A dialogue split keeps at least 2 lines on each side; otherwise the whole speech moves to the next page. [Recommended.] Rejected: 1 line (orphaned single lines).
  - Shots follow the scene-heading rule: never the last thing on a page. [Recommended.]
- **Settled by existing decisions, not reopened:**
  - With the sidebar open, the script stays Highland's continuous column (imported log, Arnav's call).
  - Collapsed, real pages appear on the desk color, with page numbers (SPEC 3.7: page numbers fade in only in page view) and (MORE)/(CONT'D).
  - Lines per page: 54. That's the 9 in text area at 6 lines per inch, matching the 1 in margins we already render (SPEC says "about 54-55").
- **Claude's defaults, stated to Arnav:**
  - A 24 px desk-colored gap between pages, matching the desk's side padding.
  - The page-break gaps grow during the existing 240 ms collapse, so the motion stays seamless.
- **Proposed, awaiting Arnav:** split action and dialogue at a sentence end even mid-line, with the rest starting fresh on the next page (Final Draft and Highland do this). The alternative, splitting only where a sentence ends exactly at a line end, leaves emptier pages.
- **Status:** Arnav's calls, except the item marked proposed.

### D-070 · 2026-10-26 · Accounts phase approved; remaining by-hand checks booked for later

- **Arnav's call:** the "real users and rooms" phase is approved, and the remaining by-hand checks are booked for a later demo:
  1. The browser against the 3-container cluster (demo step 10). Failover is reproduced on the containers (D-066) but hasn't been watched in the browser.
  2. Deleting an episode with two real accounts (step 11). It ran only as tests (D-067).
- **Confirmed by hand in this phase:** email sign-up and sign-in, including a returning writer (D-065); Google sign-in linking to the existing account (D-068); inviting, assigning, co-writing and the role changes (steps 3-9, with the fixes in D-066).
- **Next phase:** "real pages" (pagination, page view, viewport anchoring, PDF export, .fdx and Fountain import, performance).
- **Status:** Arnav's call.

### D-069 · 2026-10-26 · A line typed offline in an incognito window was lost; leaving with unsynced edits now asks first

- **What happened (Arnav, demo):** MATT's line after "John finishes his drink" was missing.
  - The stored script (snapshot plus edit log) has every other line, and there's no deleted-block marker where it was. So it never reached a server.
  - Sam typed it in the incognito window during step 10, when there was no reachable server (D-066 (3)). It was saved only in that window's local copy (IndexedDB). Closing the incognito window made Chrome delete that storage, and the line with it.
- **What it means for "zero lost edits":** the promise is about every edit a server has received and acknowledged, and the server side held. This one never got that far. From the writer's point of view, though, work disappeared without warning.
- **Options considered:**
  1. **The browser's leave prompt (chosen):** only while edits are unsynced, the browser's own "Leave site? Changes you made may not be saved" dialog, as Google Docs does.
  2. **Leave as is:** a normal window keeps its copy and syncs later; only incognito or cleared site data loses it.
  3. **The prompt plus a clearer toolbar cue** ("Not saved yet"): a toolbar design change, to be mocked up first.
- **Rejected, from writers' point of view:** (2) can still lose offline work silently, as here. (3) is more visible but changes the toolbar design; not needed for the safety net itself.
- **Built:**
  - While the open script has edits the server hasn't acknowledged (the same flag the safe sign-out uses, D-050), the page asks the browser to confirm before closing or reloading (`beforeunload` in `apps/web/src/editor/useScriptEditor.ts`). Once everything is synced, there's no prompt.
  - Browser test: no prompt when synced; none while offline with nothing new; a prompt after typing offline; none again after reconnecting. It fails without the change.
- **Limits:**
  - The dialog's wording is the browser's and can't be changed.
  - It covers the open script only. A script left for Home while still offline has no prompt when Home is then closed. A normal window keeps that copy; an incognito one doesn't. Logged as an open issue.
- **Also seen, logged as an open issue:** when the API itself is down, a reload shows the sign-in page, as though the writer were signed out (Sam's window after step 10, then "Something went wrong").
- **Status:** Arnav's call (option 1); built and tested.

### D-068 · 2026-10-26 · Google sign-in failed: the client secret had been pasted twice

- **Issue (demo step 2b):** Google answered "401 invalid_client: The provided client secret is invalid".
  - The stored secret was 70 characters, two copies of the real 35-character secret back to back. `read -s` shows nothing while pasting, so pasting twice is easy.
  - Claude checked this without displaying the value (length, prefix, whether the halves were equal).
- **Fix:**
  - Arnav stored the single secret with `put-secret-value`. Claude's own attempt to write the secret store was blocked by its command safety check.
  - Claude then updated Cognito's Google provider from Secrets Manager inside a script that never printed it. This was needed because CloudFormation copies the secret into Cognito at deploy time, and redeploying an unchanged template doesn't re-read it.
  - Verified: Cognito's copy matches the stored secret, and the client ID, scopes and attribute mapping are unchanged.
- **For next time:** after `read -s`, run `echo ${#VAR}` to check the length before using it.
- **Status:** fixed; 2b to retry.

### D-067 · 2026-10-26 · Demo step 11 run as tests, at Arnav's request

- **What:** Arnav asked Claude to do step 11 (deleting an episode) instead of clicking through it. Claude can't drive his Cognito-signed-in windows, so it ran the end-to-end tests that cover the same path. All passed:
  - **Real API, real Postgres, real sync server with Postgres access:** deleting the episode moves everyone in it out with 4410.
  - **API:** a deleted episode disappears for everyone, waits in the showrunner's Recently deleted, and returns to its place on Restore. A deleted series disappears from every member's Home until restored. Deleting a plain script's episode deletes the script.
  - **Browser, against the fake API:** × → inline confirm → Recently deleted → Restore; and the co-writer's window goes back to Home with "This episode was deleted by the showrunner."
- **Not seen by hand:** the same flow with two real accounts in two real windows. Also still open from the demo: the Google round trip (step 2b) and step 10 against the cluster from the browser.
- **Status:** done as tests; by-hand items noted.

### D-066 · 2026-10-26 · Demo steps 8-10: a stale "access changed" state, the database restart crash, and a step-10 setup mix-up

Found in Arnav's demo run. All three are bugs or tooling fixes, with no design change.

- **(1) Co-writer toggles sometimes left the screen stuck on "offline" until a refresh (steps 8-9).**
  - **Cause:** the editor hook kept the server's last refusal (`fatal`) and never cleared it.
    - Unticking (edit → view) fully remounts the script screen, so that worked.
    - Ticking (view → edit) reuses the same screen, so `fatal` stayed `'forbidden'`.
    - The next untick's refusal was also `'forbidden'`. React saw no change, so the page never reloaded the episode.
  - **Fix:** the refusal is now kept together with the session it belongs to, so a new session starts clean (`apps/web/src/editor/useScriptEditor.ts`).
  - **Test:** a new browser test (untick, tick, untick) hung at the third step before the fix and passes after it.
- **(2) The API died when Postgres restarted (the "Something went wrong" sign-in after step 10).**
  - **Cause:** `pnpm cluster:down` stops Postgres too. `pg`'s pool raises an error for a dropped idle connection, and with no listener Node treats that as fatal.
  - **Fix:** the API's pool and the sync server's access pool now log the error and replace the connection on the next query.
  - **Checked:** with the API holding an idle connection, a Postgres restart is logged and the next request is answered normally. The sync server's listener reconnects.
- **(3) Step 10 never reached the cluster from the browser.**
  - **Cause:** the `dev:web` from 21:18 (no `VITE_SYNC_URLS`, so it used the single server on :4000, which had been stopped) was still serving the windows on 5173. The restart with the cluster URLs started a second copy, which Vite quietly moved to 5174. So both windows showed "reconnecting" throughout. The demo script said "restart" without "stop the old one first"; Claude's mistake.
  - **Failover itself, reproduced:** the real containers (same image, Postgres access, DynamoDB, the Docker network), with only the token check swapped for a test key. Two writers typed through random servers, and sync-1, the episode's home, was killed. Both were back and converging within about 4 s, with every word present. The repro files and containers were removed afterwards.
  - **Fix:** `vite.config.ts` uses `strictPort`, so a second `dev:web` fails loudly instead of moving ports. Port 5174 isn't an allowed Google return address or `APP_URL` either.
- **Status:** fixed and tested; step 10 to re-run with the corrected instructions.

### D-065 · 2026-10-26 · Telling a half-finished sign-up from a confirmed account: ask Cognito (supersedes D-061's fix)

- **Issue (Arnav, demo step 2):** signing back in to a confirmed account failed with "That code has expired".
  - D-061's fix assumed Cognito refuses to re-send a sign-up code to a confirmed account. Tested on the real pool, it doesn't: it sends a fresh sign-up code (6 digits).
  - So every returning writer got a sign-up code. Cognito then refused that code ("already confirmed"), and the API showed that as "expired".
  - Every confirmed account was locked out of email codes; Google still worked.
- **Options considered:**
  1. **Ask Cognito (chosen):** the admin call `AdminGetUser` reports UNCONFIRMED or CONFIRMED. It's exact. The cost is that the API needs AWS permission to read users in our pool.
  2. **Check our own database:** a `users` row means they finished. No new permission, but a crash between confirming and writing the row would leave someone stuck on the sign-up path, which needs an extra recovery path.
  3. **Always send a sign-in code:** the simplest, but someone who abandoned signing up gets a code that never arrives and can't finish.
- **Rejected, from writers' point of view:** (2) is right almost always but has a rare stuck case. (3) is a dead end for the person who walked away mid-sign-up.
- **Built:**
  - `isConfirmed(email)` in `apps/api/src/auth/cognito.ts`, using `@aws-sdk/client-cognito-identity-provider` 3.1156.0 (the same SDK family and version as the SES client). The admin call has to be signed, which plain `fetch` can't do; flagged to Arnav as a new library.
  - `begin()` tries a sign-up first. If the address exists: an unconfirmed account gets a fresh sign-up code, and anything else gets a sign-in code.
  - The fake Cognito now re-sends sign-up codes to confirmed accounts, as the real pool does, and answers `AdminGetUser`. The "known email gets a sign-in code" test failed on the old logic (6 digits, not 8) and passes now.
- **Checked on the real pool:** both of Arnav's accounts report confirmed, and an unknown address gives `UserNotFoundException`. Locally the call uses the `writers-room` profile.
- **Follow-up for the deploy phase:** the API's Fargate task role needs `cognito-idp:AdminGetUser` on this pool only (now an open issue).
- **What changes for writers:** returning writers get a working sign-in code again. Someone who abandoned signing up still gets a fresh sign-up code.
- **Status:** Arnav's call (option 1); built, tested, checked on the real pool.

### D-064 · 2026-10-26 · `pnpm services:up` waits for Postgres to be ready

- **Issue (from Arnav's demo setup):** `pnpm services:up && pnpm --filter @wr/api migrate` failed with "Connection terminated unexpectedly". On a fresh start, Docker reports the containers as started while Postgres is still initializing, so the migration connected too early. A retry seconds later reported "up to date".
- **Fix (a tooling fix, no design change):** `services:up` is now `docker compose up -d --wait`. It returns only once Postgres's existing health check (`pg_isready`) passes.
- **Status:** fixed.

### D-063 · 2026-10-26 · Google sign-in deployed; the first attempt failed on resource order and rolled back

- **Arnav's part (done):**
  - He made a Google Cloud project with the OAuth consent screen (External, in testing; his two Gmail addresses as test users) and a Web client whose redirect URI is the pool's `/oauth2/idpresponse`.
  - He stored the client secret in Secrets Manager (`wr/google-oauth`, about $0.40 a month) from his own terminal, so it never passed through Claude.
  - He put the client ID in the git-ignored `infra/.env.local`.
- **Checked before deploying:** the secret exists (its metadata only; the value was never read). The template refers to it as `{{resolve:secretsmanager:wr/google-oauth:SecretString:clientSecret::}}`, so the value appears neither in the template nor in the repo.
- **First deploy failed, and nothing was harmed:** "The provider Google does not exist for User Pool". CloudFormation updated the app client (which names Google) before creating the Google provider, because nothing said the client depends on it. The stack rolled back completely (`UPDATE_ROLLBACK_COMPLETE`), so email sign-in was never affected.
- **Fix:** `client.node.addDependency(google)` in `infra/src/auth.ts`. A stack test now requires that dependency; it failed without the fix and passes with it.
- **Second deploy succeeded, and was checked:**
  - The pool lists Google, and the client supports COGNITO and Google with the callback `http://localhost:5173/api/auth/google/callback`.
  - The scopes are `openid email profile`; email, email_verified and name are mapped.
  - The redirect chain works without signing in: `/api/auth/google/start` → Cognito `/oauth2/authorize` → `accounts.google.com`, carrying Arnav's client ID and the `idpresponse` redirect URI.
- **Still to see, in the demo:** the full round trip with a real Google account, and linking by verified email (D-044) when the Google address already has an email-code account.
- **What changes for writers:** "Continue with Google" works for the two test addresses. Others need adding as test users until the consent screen is published (a beta-phase step).
- **Status:** deployed; round trip in the demo.

### D-062 · 2026-10-26 · The local stack checked on the real pool before the demo; the cluster image fixed

- **Checked:** the API and one sync server start against the deployed pool (`pnpm dev:api`, `pnpm dev:sync`). Signed out, the API answers 401 "Please sign in again", as it should. Migration 002 applied to the local Postgres.
- **Found and fixed (a build fix, no design change):** the 3-container cluster (`pnpm cluster:up`) crashed on start with `Cannot find package '@wr/auth'`. The sync image was written before `packages/auth` existed and copied only `@wr/shared`. `apps/sync/Dockerfile` now copies `@wr/auth` too, and all three servers start and find each other (sync-1, -2, -3).
- **Found, a dev-only trap (now an open issue):** running `pnpm dev:sync` on the Mac while the cluster runs makes the Mac's server a fourth member, because both share the local DynamoDB. The containers can't reach it at its `localhost` address. So the demo runs either the single server or the cluster, never both. Its membership row expired 6 s after it stopped, as designed.
- **Status:** fixed and verified locally; the browser against the cluster is the one path still to run, in the demo (as D-024 noted).

### D-061 · 2026-10-26 · Cognito deployed; the email-code assumptions checked on the real pool, and one fixed

- **Deployed (Arnav's go for this phase's deploys):**
  - `WrEmail`: both of Arnav's addresses verified and sending enabled.
  - `WrAuth`: the pool, the client and `writers-room-asabat.auth.us-east-2.amazoncognito.com`. Its settings were checked in AWS and match D-055: the Essentials plan; email as a case-insensitive username; `EMAIL_OTP` allowed; SES sending; a client with no secret, only `ALLOW_USER_AUTH` and refresh, 60-minute access tokens, 30-day refresh tokens, revocation on, and Cognito as the only provider until Google.
  - The IDs are in Arnav's local `.env` (git-ignored), together with `AWS_PROFILE=writers-room` for the API's SES sending and `WR_CLUSTER_SECRET`. `WR_DEV_AUTH` is gone.
- **The known risk from step 3, checked against the real pool** (using Arnav's second address, which received a code email):
  1. **Sign-up with no password works:** the account is created unconfirmed, with a session, and the code goes by email. ✓
  2. **Signing up again with the same address** gives `UsernameExistsException`. ✓
  3. **Different from what was assumed:** asking for a sign-in code (`USER_AUTH` / `EMAIL_OTP`) for an *unconfirmed* account returns a challenge as though a code were sent, not `UserNotConfirmedException`. That's the client's user-existence protection.
     - **The consequence:** someone who started signing up but never typed the code would, next time, be offered a sign-in that no code can complete.
- **The fix** (`apps/api/src/routes/auth.ts`): when the address already exists, first re-send a *sign-up* code (`ResendConfirmationCode`). Cognito refuses that for a confirmed account, and only then does the API start a sign-in code.
  - The fake Cognito now behaves like the real pool for unconfirmed accounts, a challenge no code can answer. The "someone who never finished signing up" test failed on the old logic and passes on the new one.
- **Still to check on the real pool, in the demo:** that Cognito refuses `ResendConfirmationCode` for a *confirmed* account with `InvalidParameterException`, as the fix expects. The first account confirmed in the demo provides the case.
- **What changes for writers:** someone who abandons signing up halfway can come back and finish, with a fresh sign-up code.
- **Status:** deployed; fix built and tested; one check left for the demo.

### D-060 · 2026-10-26 · First AWS deployment: CDK bootstrap and the budget alarms

- **Done (Arnav's go):**
  - `cdk bootstrap` in `us-east-2` created the CDK toolkit stack (`CDKToolkit`: its assets bucket, roles and version parameter).
  - `WrBudgets` deployed `writers-room-monthly`. Checked in AWS: $40 a month, $0 spent, with alerts at 50% actual ($20), 100% actual ($40) and 100% forecast ($40), emailed to Arnav's alert address.
  - Both were deployed with the `writers-room` profile as `arnav-admin`.
- **Correction:** AWS Budgets emails the address directly when a threshold is crossed. There's no subscription to confirm, despite what Claude said before.
- **Also:** `Stack#addDependency` is deprecated in this CDK version, so `infra/src/app.ts` now uses `addStackDependency`.
- **Next, with Arnav's go:** `WrEmail` (two verification links to click), then `WrAuth`.
- **Status:** deployed and verified.

### D-059 · 2026-10-26 · How this AWS account is secured (no root sign-in exists)

- **Found (read-only, IAM credential report):**
  - **No root sign-in.** The account's root user has **no password**, was never used, and has no access keys. The free-plan account belongs to an AWS-managed organization (all features on), which also explains the service control policies of D-058, so root sign-in credentials don't exist. Root MFA is therefore not applicable: there's nothing to sign in with. "Root MFA off" in the account summary is expected.
  - **Arnav's console login** is the account-level sign-in on AWS's "Choose AWS sessions" page. Its two-factor settings are managed there, not in IAM.
  - **`arnav-admin`:** MFA active (enabled 2026-10-26, through CloudShell); no console password; one active access key, kept in `~/.aws/credentials` on Arnav's Mac under the `writers-room` profile.
- **What it means:** the credential that can change the account from the CLI is `arnav-admin`'s access key. It stays out of the repository (it lives in `~/.aws`, never in the project). If it's ever exposed, deactivate it in IAM and create a new one.
- **Status:** recorded; no decision needed.

### D-058 · 2026-10-26 · Account checked: us-east-2 it is (supersedes D-030's region); arnav-admin needs admin rights

- **The read-only checks** (D-057), run as the `writers-room` CLI profile:
  - **Identity:** `arnav-admin` in Arnav's account.
  - **Plan:** FREE, active, with $100 of credits, expiring 2027-04-26 (D-038).
  - **Regions:** `us-east-2` and `ca-central-1` are both enabled by default.
  - **Montreal is forbidden by the account's AWS Organizations service control policy.** A read-only Cognito call in `ca-central-1` was refused with "an explicit deny in a service control policy", and simulating `cognito-idp:CreateUserPool` or `cloudformation:CreateStack` there gives `explicitDeny`. No permission inside the account can override that, so `ca-central-1` really does need the paid plan, as Arnav was told.
  - **Ohio is open:** Cognito answers (no pools yet). SES is healthy with sending enabled, in its sandbox, with a quota of 200 a day. Budgets and CloudFormation answer. Simulating in `us-east-2` shows no service-control-policy denial for anything the project plans: CloudFormation, S3, SSM, ECR, Cognito, SES, Secrets Manager, DynamoDB, ECS, RDS and CloudFront, plus account-wide IAM and Budgets.
  - **But `arnav-admin` has only `ReadOnlyAccess`.** Every create action is an *implicit* deny: nothing allows it, though nothing forbids it. D-038 planned an admin user; `AdministratorAccess` has to be attached before anything can be deployed.
- **Decision (Arnav's conditional call from D-057, now met): `us-east-2`, on the free plan.** This supersedes D-030's `ca-central-1`.
  - **Changed:** the infra and API region defaults (`infra/src/config.ts`, `.env.example`, `docker-compose.yml`), the local `infra/.env.local`, and the infra tests' region. The Privacy page (and prototype v2) now say "On Amazon Web Services in the United States (Ohio)."
  - The README notes the `writers-room` profile.
- **What changes for writers:** their accounts and scripts will live in the US (Ohio) rather than Canada, and the Privacy page says so. Latency from Toronto is about the same.
- **Needed from Arnav before deploying:** in the AWS console, IAM → Users → `arnav-admin` → Add permissions → Attach policies directly → **AdministratorAccess**. `ReadOnlyAccess` can then be removed. Claude re-runs the permission simulation afterwards.
- **Status:** Arnav's call (D-057's condition met). Nothing has been deployed.

### D-057 · 2026-10-26 · Region: us-east-2 if the account checks confirm (would supersede D-030's ca-central-1)

- **Context:** Arnav's new free-plan account was set up in `us-east-2` (Ohio), and choosing `ca-central-1` (Montreal, D-030) prompted him to leave the free plan.
  - **AWS's documentation** describes no regional limit on the free plan (only GovCloud and China are excluded), so the account itself needs checking.
  - **What works in us-east-2:** Cognito's Essentials plan with passwordless email codes is offered in every region Cognito runs in. Cognito sends through SES in its own region, which our setup already does because both read one region setting. Budgets are account-wide. Everything the deploy phase plans (DynamoDB, S3, Fargate, Postgres, CloudFront) is in Ohio.
- **Decision (Arnav's call, conditional):** if read-only checks of the account confirm that everything works in `us-east-2` and that `ca-central-1` would force the paid plan, use **`us-east-2` and keep the free plan** (D-038).
  - Rejected: `ca-central-1` on the paid plan. It keeps data in Canada, but the paid plan can bill, which D-038 avoided until the beta.
- **Checks before anything is created** (Arnav installs and configures the CLI himself, so his access key never passes through Claude):
  - who the CLI is signed in as;
  - the account's plan and region settings;
  - whether a read-only Cognito call in `ca-central-1` is refused;
  - SES in `us-east-2` (sandbox, sending enabled);
  - Cognito and Budgets access;
  - whether `arnav-admin` holds the permissions a CDK deployment needs.
- **What changes for writers, if confirmed:** accounts and scripts live in the US (Ohio) rather than Canada; the Privacy page's "Where it lives" is updated. Latency from Toronto is about the same. **For the system:** the region settings (`infra/.env.local`, `COGNITO_REGION`) and the log; no code names a region.
- **Status:** Arnav's call, pending the checks. D-030's region stands until they pass.

### D-056 · 2026-10-26 · D-055's AWS setup choices confirmed

- **Decision (Arnav's call):** D-055 (a)-(g) stand:
  - one $40 budget with three alerts;
  - three stacks deployed in order;
  - the user pool retained;
  - Google's client secret in Secrets Manager (about $0.40 a month, within the credits);
  - Cognito's default sign-in code wording for now;
  - "password" allowed only at the pool level;
  - invitations through SES.
- **Status:** Arnav's call. Waiting on Arnav's AWS account; Claude deploys one stack at a time after Arnav's go-ahead.

### D-055 · 2026-10-26 · Accounts phase step 8, part 1: the CDK app (budgets, SES, Cognito), not yet deployed

- **What was built** (`infra/`, CDK 2.274.0, constructs 10.8.1, the `aws-cdk` CLI 2.1146.1):
  - **`WrBudgets`:** one $40-a-month cost budget emailing Arnav when actual spend passes $20 and $40, and when the month is forecast to pass $40 (SPEC 5.5). It's deployed first. On the free plan nothing can be charged (D-038); the alarms stay for the paid plan.
  - **`WrEmail`:** an SES email identity for the sender and for each demo address (D-038, D-054). Each gets a verification link to click. Cognito can't send from an unverified address, so this deploys before `WrAuth`.
  - **`WrAuth`**, the Cognito user pool `writers-room`:
    - **Plan and sign-in:** the Essentials plan; the email as username, case-insensitive (D-044 (b)); self sign-up; passwordless email codes (`EMAIL_OTP`).
    - **Email:** sent through SES from the sender; the sign-up code email uses D-033's wording ("Your Writers’ Room code: {####}").
    - **The app client** `writers-room-web` (D-031): public, no secret; `ALLOW_USER_AUTH` and refresh only; 1-hour access and ID tokens, 30-day refresh tokens; revocation on (D-044 (h)); user-existence errors hidden. Its OAuth code flow returns to `<app>/api/auth/google/callback`.
    - **The domain** `<prefix>.auth.ca-central-1.amazoncognito.com`.
    - **Outputs:** the pool ID, the client ID, the domain, and the redirect URI to give Google.
    - **Google** is added only once its OAuth client exists (part 2).
  - **Settings** come from `infra/.env.local` (git-ignored, D-054; `.env.local.example` lists them). The scripts are `pnpm --filter @wr/infra bootstrap`, `synth`, `deploy:budgets`, `deploy:email` and `deploy:auth`.
  - **The API's SES mailer** (`@aws-sdk/client-sesv2` 3.1156.0, the SDK version the sync server already uses): when `WR_SENDER_EMAIL` is set, invitations go out through SES; otherwise they're printed.
- **Tests:** 6 CDK assertions on the synthesized templates, with no AWS access:
  - the budget's amount and its three alerts;
  - one SES identity per address;
  - the pool's Essentials plan, email-code policy, case-insensitive email username, SES sending and the code-email subject;
  - the client's flows, the absent secret, token lifetimes, revocation and the callback;
  - the pool being retained;
  - Google added only when configured, with its secret read from Secrets Manager.

  `pnpm check` passes (163 tests), and `cdk synth` builds all three templates.
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a) One budget, three alerts.** A single $40 budget alerts at $20 actual, $40 actual and $40 forecast, rather than two budgets. AWS's first two budgets are free either way.
  - **(b) Three stacks, deployed in order** (`WrBudgets`, then `WrEmail`, then `WrAuth`), so the alarms exist first and the addresses are verified before Cognito needs them.
  - **(c) The user pool is retained.** It survives deleting its stack (`RemovalPolicy.RETAIN`), so accounts can't vanish by accident.
  - **(d) Google's client secret lives in AWS Secrets Manager,** referenced by the template, so it's never in the repo or the template. It costs about $0.40 a month, covered by the free plan's credits. To confirm at the Google step; the alternative is passing it at deploy time, which leaves it visible in the CloudFormation template.
  - **(e) The sign-in code email uses Cognito's default wording for now.** The *sign-up* code email has D-033's wording; this CDK version doesn't expose the template for the passwordless sign-in message. It gets checked on the real pool and changed if possible.
  - **(f) "Password" stays allowed at the pool level** because Cognito requires it. The app client allows only `USER_AUTH`, the API never calls a password flow, and no user is ever given a password, so nobody can sign in with one through our app.
  - **(g) The SES mailer** replaces the printing one whenever a sender is configured.
- **What changes for writers:** nothing yet. Nothing is deployed.
- **Status:** built and tested; awaiting Arnav's AWS account (D-038), then deployment, one stack at a time, after Arnav's OK. (a)-(g) await Arnav.

### D-054 · 2026-10-26 · D-053 confirmed; the email addresses for the AWS setup

- **Decision (Arnav's call):**
  - D-053 (a) and (b) stand: Undo closes the co-writer menu like any outside click, and the copy toast tells the truth.
  - **Email addresses:** the AWS setup uses Arnav's two Gmail addresses.
    - One receives budget alerts and is the SES sender for sign-in codes and invitations until the domain exists (D-038).
    - Both are the demo's two accounts, verified in SES's sandbox.
    - They live only in local settings (`infra/.env.local`, git-ignored, read by the CDK app), never in the public repository. The Privacy page's contact address (D-039) was already chosen to be public.
- **Status:** Arnav's call. Arnav is creating the AWS account (free plan, a plain IAM admin user, the CLI in `ca-central-1`). Claude writes the CDK stacks: budgets first, then Cognito and SES.

### D-053 · 2026-10-26 · Accounts phase step 7: the Share menu

- **What was built** (`apps/web/src/components/Toolbar.tsx`, `CoWriterMenu.tsx`, prototype v2, D-032):
  - **Copy invite link** copies `<origin>/e/<episode id>`: members who open it land in the episode, and anyone else is told to ask the showrunner. The toast says "Link to “Ep 3 · The Long Night” copied".
  - **Invite co-writer…** opens the shared menu as a checklist headed "CO-WRITERS".
    - It lists the series' writers (with 20 px avatars and "(you)"), with ✓ on this episode's co-writers.
    - A click adds or removes one through the API, and the toast "Maya removed from Ep 3 · The Long Night" offers Undo.
    - With no writers in the series yet: "No writers in this series yet."
    - For the showrunner only, the D-027 invite row sits at the bottom. Its invitations assign this episode on acceptance (the API's `episodeId`).
  - **Viewers and unassigned writers** see only "Copy invite link". The API refuses the rest anyway (D-042).
  - **The fake API** gained the co-writer endpoints with the real rules (only writers; only those who may edit the episode). The test browser is granted clipboard permission.
- **Tests (browser, 4):**
  - the copied link is checked by reading the clipboard back;
  - the showrunner's checklist: toggling, Undo restoring Maya, and the invite row;
  - a writer adding a co-writer to their own episode, with no invite row;
  - someone who can't edit gets only Copy invite link.
- **A bug the test caught:** the toast said "copied" even when the browser refused clipboard access. It now says so only after the copy succeeds, and otherwise shows "Copy this link: …".
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a)** Clicking Undo in the toast closes the co-writer menu, like any click outside a menu (SPEC 3.9). The change is still undone.
  - **(b)** If the clipboard is refused, the toast shows the link to copy by hand rather than claiming it was copied.
- **What changes for writers:** sharing works: a link for the group chat, and two clicks to add a co-writer.
- **Status:** built and tested. (a) and (b) await Arnav. Accounts steps 1-7 are done; step 8 (AWS: budgets, then Cognito and SES) needs Arnav's account.

### D-052 · 2026-10-26 · D-051's Home choices confirmed

- **Decision (Arnav's call):** D-051 (a)-(k) stand:
  - the two-layer handoff;
  - `?new=1` for new scripts;
  - the editor takes the keyboard only if nothing else has it;
  - "just now" or "Oct 12";
  - a plain script's meta names its writers;
  - the upgrade toast;
  - "Accepted ✓" with the 0.8 s move;
  - avatar colors from the person;
  - Members ordering and count;
  - labeled toast actions;
  - the fake API's in-memory room.
- **Status:** Arnav's call. Step 7 (the Share menu) is next.

### D-051 · 2026-10-26 · Accounts phase step 6: Home, the handoff, Members, deleting and renaming in the web app

- **Decision Arnav made before building (Arnav's call):** removing someone from a series uses the **inline confirm**, like deleting: the row asks "Remove Maya from The Long Night?" with Cancel and Remove, and there's no Undo afterwards. The approved prototype had an Undo toast, but the server deletes a membership outright, so Undo would have needed a new "removed members" record. Prototype v2 is updated to match.
  - Rejected: a server-side record kept for an hour so Undo could restore the role and episodes (more to build), and delaying the removal by the toast's 6 s (the person would keep access meanwhile, and closing the tab would lose the removal).
- **What was built** (`apps/web/src/home/`, `Root.tsx`, `theme.ts`, `localCopies.ts`; matched to prototype v2 in light and dark):
  - **Home** (`HomeScreen.tsx`):
    - **Toolbar:** "Home", + New series, + New script (the 28 px hover boxes, D-036), the theme toggle and the account menu (name, email, Sign out).
    - **Sidebar:** RECENT, SCRIPTS, SERIES, INVITATIONS (Accept turns into "Accepted ✓") and RECENTLY DELETED (Restore, "N days left"), each hidden when empty.
    - **Center:** the series header (the title renames by click for the showrunner; meta like "3 episodes · you’re the showrunner" or "Script · just you"; + New episode for the showrunner; Members), episode rows with "Maya · edited Oct 12" or "● Maya, Sam · editing now", and the empty states.
    - **Refresh:** Home asks `/api/home` again every 15 s and on focus (D-033).
  - **Deleting (D-037):** the showrunner's hover × on episode rows and on script and series rows, the inline confirm, a typed name for a series, and Restore.
  - **Members (D-030, D-027)** (`MembersPanel.tsx`):
    - **Panel:** the 340 px right panel, opened and closed by "Members" (bold while open), the × or Esc.
    - **Rows:** each person with their role and episodes. For the showrunner, a role menu with Showrunner / Writer / Viewer, then "Remove from series" (the inline confirm). The INVITED section lists pending invitations, each with its own role and "Cancel invitation".
    - **Invite row:** the field-styled role picker and Invite. Errors from the API ("Make someone else showrunner first.") show in the toast.
  - **The handoff** (SPEC 3.10): Home and the open script are two stacked layers that crossfade over 220 ms, their contents sliding 10 px. Home stays mounted while a script is open (its selection and scroll survive), and the script layer is removed after fading out.
  - **The script toolbar:**
    - **Back** goes Home.
    - **The title** is the episode's real one ("Ep 2 · Undertow"), renamed by click if you may edit it. A new script or episode opens with its title ready to type.
    - **"View only"** shows for viewers and unassigned writers, whose page is read-only. A viewer never adds the starter line to an empty script.
    - **Avatars and the divider** show only when co-writers are present (prototype v2).
  - **Losing access mid-session (D-046):**
    - **4403:** the app asks the API what you may do now. If you lost edit access, it deletes this browser's copy and shows "Your access changed. Edits since then weren't saved.", then reloads view-only. If you gained it: "You can edit this episode now."
    - **4410:** back to Home with "This episode was deleted by the showrunner."
  - **The theme** (SPEC 3.10): follows the system until toggled, then remembered on this device (`wr-theme`) and applied before the first paint. The icon shows the mode you'd switch to.
  - **Safe sign-out (D-050):** documents with unacknowledged local edits are tracked. Sign out warns ("Some edits haven’t reached the server yet…", with Sign out anyway / Cancel) or clears every local script copy and signs out.
- **Tests:**
  - **Browser (Chromium), 16 new**, against a fake API that now keeps an in-memory room with the same rules and messages as the API, plus the test sync server:
    - Home's sections, header and rows;
    - a writer's series (no + New episode; Members read-only);
    - Accept;
    - the empty state;
    - + New script (the title keeps the keyboard, the handoff, Home lists it, RECENT);
    - + New episode turning a script into a series;
    - + New series;
    - "View only" with a read-only page;
    - deleting and restoring an episode;
    - a series' typed-name rule;
    - Members (the role menu, removing after the confirm, Esc);
    - inviting with the picker;
    - the theme toggle;
    - losing edit access, and an episode deleted, mid-session;
    - the safe sign-out.
  - **Results:** all 41 web tests pass, along with the full check and the service suites.
- **Bugs the tests caught, both fixed:**
  1. **The editor took the keyboard as it finished loading,** so a new episode's name was typed into the script. It now takes focus only if nothing else has it.
  2. **The rename box reopened after Enter,** because the title component was rebuilt on every change. It isn't any more.
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a) The handoff is two stacked layers** rather than one shared shell. It looks the same, because the toolbar, gray sidebar and white surface coincide and only their contents fade and slide, and it keeps Home's state while a script is open.
  - **(b) New scripts carry a `?new=1` flag.** "+ New script" and "+ New episode" open `/e/<id>?new=1`, which starts the title renaming and is then removed from the URL.
  - **(c) The editor takes the keyboard on load only if nothing else has it** (bug 1).
  - **(d) "edited" wording:** "just now" within a minute, otherwise the date ("Oct 12", with the year if it isn't this one).
  - **(e) A plain script's meta** ("Script · you and Maya") names its episode's writers, since Home's data doesn't list series members.
  - **(f) Gaining edit access mid-session** says "You can edit this episode now." and reloads editable.
  - **(g) Accept** turns into "Accepted ✓" (its width reserved so nothing moves), and the series moves into SERIES 0.8 s later (prototype v2).
  - **(h) Avatar colors** come from the person's ID, so they're the same in every browser.
  - **(i) Members ordering:** you first, then by role. The count line reads "4 people · 1 invited".
  - **(j) Labeled toast actions.** Toasts can carry labeled actions as well as Undo; the safe sign-out uses this.
  - **(k) The fake API's in-memory room.** For the browser tests, the fake API keeps an in-memory room. The test servers gained test-only controls: sign in as someone with the sample room, unassign, and change someone's access at the sync server.
- **Not yet:** the Share menu (step 7). Today it still shows placeholder toasts.
- **What changes for writers:** the whole home page is real. Writers create, open, name, share access to, delete and restore scripts and series, and the app explains every change of access.
- **Status:** built and tested. Arnav's call on member removal is recorded; (a)-(k) await Arnav.

### D-050 · 2026-10-26 · Signing out clears local script copies, but never loses unsynced edits silently

- **Context:** for offline editing, each browser keeps a copy of every script it has opened (y-indexeddb). On a shared computer, signing out would leave those copies for the next person using that browser profile.
- **Decision (Arnav's call): clear them, safely.**
  - Sign out (the account menu) first checks that every edit made in this browser has reached the server.
    - The browser remembers which documents have edits not yet acknowledged (D-019). The flag is set on a local edit and cleared when the client is fully synced, so it covers scripts that aren't open too.
  - If everything is synced, it deletes this browser's local copies, then signs out.
  - If not (the writer is offline), the toast says "Some edits haven't reached the server yet. Signing out now would lose them." with **Sign out anyway** and **Cancel**.
- **Rejected:**
  - Always clearing, which loses an offline writer's unsynced words.
  - Leaving the copies, which is weak on shared or lab computers.
- **What changes for writers:** nothing is left behind on a shared computer, and nothing is lost by accident. Opening a script after signing back in loads it from the server once.
- **Status:** Arnav's call. Built with the account menu in step 6.

### D-049 · 2026-10-26 · The code screen names no digit count; D-048's other choices confirmed

- **Decision (Arnav's call):** the code screen says **"We sent a code to maya@example.com."**, with the placeholder "Enter the code".
  - It still signs in as soon as the code is complete, using the length the API reports (6 for sign-up, 8 for sign-in).
  - Continue or Enter sends any 6-8-digit code, so nobody gets stuck if Cognito's lengths ever differ from what we expect.
  - Prototype v2's wording is updated to match ("6-digit" removed). This supersedes D-048 (a).
  - Rejected: naming the length ("We sent an 8-digit code…"). It's more specific, but it depends on Cognito's undocumented lengths staying as they are.
- **Also (Arnav's call):** D-048 (b)-(i) stand:
  - sign-in errors in the shared toast;
  - the public invitation preview;
  - Google as a link;
  - the name step before "signed in";
  - renewal a minute early, with one 401 retry;
  - `devAuth.ts` removed;
  - the placeholder until step 6;
  - the test reload hook.
- **What changes for writers:** the code screen never promises a length it might not deliver.
- **Status:** Arnav's call. Built: browser tests updated, including one proving an 8-digit code doesn't submit at six digits. Step 6 (Home) is next.

### D-048 · 2026-10-26 · Accounts phase step 5: sign-in, Terms, Privacy and invitation links in the web app

- **Decisions Arnav made before building (Arnav's calls):**
  1. **A tiny router of our own:** about 50 lines on the History API (`apps/web/src/router.ts`). It handles six fixed routes (`/`, `/e/<id>`, `/i/<token>`, `/terms`, `/privacy`, and a not-found case), with real URLs and back and forward. The 220 ms handoff stays fully in our hands.
     - Rejected: React Router (more than six flat routes need, and its transitions would have to be bent around the handoff).
  2. **A small fake API for the browser tests** (`apps/web/test/fakeApi.ts`): the same endpoints and shapes with canned data, started by the web tests' global setup. `/api` is proxied to it, as the dev server proxies to the real API. `pnpm check` stays Docker-free, and the real API's behavior keeps its own 50 tests. The full two-account run on the real stack is the step 9 demo.
     - Rejected: the real API and Postgres in the browser tests, which would move them out of `pnpm check`.
- **What was built:**
  - **The sign-in page** (`pages/SignIn.tsx`, `signin.css`), exactly as approved in prototype v2 (D-028, D-029):
    - **Steps:** email; then code (it signs in as the last digit lands, with "Use a different email · Send a new code"); then the first-time name step.
    - **Invitations:** the "Join <series>" version for invitation links.
    - **Google:** "Continue with Google" goes to `/api/auth/google/start`.
    - A failed Google return (`?signin=failed`) shows a toast.
  - **Terms and Privacy** (`pages/Legal.tsx`): the reviewed text, with the contact address (D-039) and "Last updated October 26, 2026".
  - **The session** (`auth.ts`): on load, the app asks `/api/auth/refresh` whether the cookie still signs it in. The access token is held in memory and renewed a minute before it expires. `SyncClient` gets `auth.token`, so every reconnect presents a fresh one. `api.ts` retries a 401 once with a fresh token.
  - **`Root.tsx`:**
    - Terms and Privacy show signed in or out.
    - `/i/<token>` previews the invitation, shows the "Join" sign-in when signed out, and accepts the invitation once signed in ("You joined Fogline").
    - `/e/<id>` asks the API for the episode and opens the script screen on its main draft.
    - A one-line placeholder stands in for Home until step 6.
  - **The API** gained `GET /api/invitations/preview` (public; series name, inviter and role; never accepts). `/email/start` and `/email/resend` now return `codeLength`.
  - **Gone:** `packages/shared/src/devAuth.ts`. `Identity` and the avatar `colorFor` moved to `packages/shared/src/identity.ts`, which the sync server shares.
  - **The Vite dev server** proxies `/api` to `localhost:${API_PORT ?? 4100}` (D-031's same origin).
- **Tests:**
  - **Browser (Chromium), against the fake API (10):**
    - a new writer gets the 6-digit code and the name step, and is in;
    - a returning writer gets the 8-digit code and skips the name step;
    - a wrong code shows a toast, and "Use a different email" keeps the address;
    - "Send a new code";
    - a reload stays signed in (the cookie);
    - the legal line opens Terms and Privacy, with the contact address;
    - the Google link, and a failed Google return;
    - an invitation link shows "Join Fogline" and is accepted after sign-in;
    - a used link says so.
  - **API (1):** the preview works without using the link up, and refuses used and unknown links.
  - **Results:** `pnpm check` passes (137 tests). `pnpm test:services`: API 50, sync 11. The real pages were also screenshotted in light and dark mode and match prototype v2.
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a) Code length (Cognito-forced, and a small deviation from the prototype's wording).**
    - Cognito's sign-up codes are 6 digits and its sign-in codes 8, according to a community report rather than AWS's docs, and they aren't configurable. So the API reports the length, and the page says "We sent a 6-digit code…" or "…an 8-digit code…" (placeholder "Enter 8-digit code") and submits on the last digit. The prototype only had "6-digit".
    - To be checked against the real pool at step 8.
    - The alternative is wording without a number ("We sent a code…").
  - **(b) Errors on the sign-in pages** (a wrong code, too many tries, a used invitation) show in the shared toast. The prototype designed no error area, and this adds no new UI element.
  - **(c) The public invitation preview endpoint,** which gives only what holding the link already grants.
  - **(d) "Continue with Google" is a link** (`<a href>`), since it's a navigation; it looks the same as the button.
  - **(e) The name step finishes before the app counts you as signed in.** The page holds the new session until the name is saved. If the tab closes first, the stand-in name stays (D-044 (e)).
  - **(f) Token renewal.** The access token is renewed a minute before it expires, and an API 401 gets one retry with a fresh token.
  - **(g) `devAuth.ts` is deleted.** `Identity` and `colorFor` now live in `shared/identity.ts`.
  - **(h) A one-line signed-in placeholder** ("Signed in as … · Sign out") until Home lands in step 6.
  - **(i) A test-only hook,** `reloadAuthForTests()` in `auth.ts`, so a test can simulate a page reload.
- **What changes for writers:** the real sign-in page, Terms and Privacy exist, and invitation links lead into the right series. Locally they work once Cognito exists (step 8).
- **Status:** built and tested. (a)-(i) await Arnav.

### D-047 · 2026-10-26 · D-046's sync choices confirmed

- **Decision (Arnav's call):** D-046 (a)-(j) stand:
  - 4403 means "ask the API" (upgrades included), and 4410 means deleted;
  - view-only connections are refused only when they actually edit;
  - a fresh token on every connect, with one 4401 retried;
  - messages are held during the token check;
  - live-status and "edited" write rates as described;
  - the document ID is the draft ID;
  - a test-only chaos server entry;
  - the cluster secret is always required (superseding D-025 (e));
  - `devAuth.ts` stays until step 5;
  - the purge job moves to the deploy phase.
- **Status:** Arnav's call. Step 5 (the web app's signed-out pages and session) is next.

### D-046 · 2026-10-26 · Accounts phase step 4: the sync server enforces roles; no development stub

- **Decisions Arnav made before building (Arnav's calls):**
  1. **Losing edit access while typing: discard, with a notice.** Within about a second the page turns "View only" and reloads the server's version. A toast says "Your access changed. Edits since then weren't saved."
     - Rejected: keeping the unsent words visible locally (the page would silently differ from everyone else's), and offering to copy them (more to build).
  2. **An episode deleted while people write in it: back to Home, with a toast.** "This episode was deleted by the showrunner." It can be restored for 30 days, with everyone's work intact.
     - Rejected: a frozen page with a banner, which goes against "nothing over the text".
  3. **A pluggable access source.** The sync server asks an `AccessSource` who may edit: Postgres in production, an in-memory one for the cluster, chaos and browser tests. The three required permission cases are proven against real Postgres and the real API.
     - Rejected: Postgres for every test (`pnpm check` would need Docker).

  The web side of 1 and 2 arrives with the home page (step 6). This step builds the server side and the client's close codes.
- **What was built:**
  - **No development stub.** The sync server takes a `TokenVerifier` (Cognito in `main.ts`) and an `AccessSource`. The unsigned `DEV-UNSIGNED.` tokens and `WR_DEV_AUTH` are gone from the servers, and `main.ts` refuses to start without the database, the cluster secret and the Cognito settings.
  - **Access at the home server** (`apps/sync/src/access.ts`, `pgAccess.ts`):
    - Each connection's draft is looked up, giving its episode and series. The person's role and assignment go through the shared `canEdit` / `canView`.
    - **Refusals:** no access closes with **4403**, deleted with **4410**, an unknown document with **4404**.
    - **View-only connections** join like any other, so they get every edit and all presence. An empty handshake reply is acknowledged as usual (so they settle as "synced"), and any real edit closes with 4403.
  - **Access changes:** the home server `LISTEN`s for the API's `wr_access` notifications and re-checks only the matching connections. A changed one gets 4403, a deleted one 4410. If the listener's connection drops, it reconnects with backoff and re-checks everyone.
  - **Live status** (D-033): the home server writes `episode_presence` when someone joins and every 10 s, and deletes the row when they leave (unless they're still there in another tab). `episodes.edited_at` is written at most once a minute per episode.
  - **The client** (`SyncClient`): `token` can be a function, called on every (re)connect, so long sessions always present a fresh access token. 4403 and 4410 are final (`fatal` = 'forbidden' / 'deleted'). One 4401 with a token function is retried with a fresh token; two in a row are final.
  - **Holding messages:** a new connection holds the messages that arrive while its token is checked, then hands them on in order.
  - **Docs and setup:** `PROTOCOL.md` (sign-in, access, the new close codes), README, `.env.example` (`WR_CLUSTER_SECRET`), and the compose cluster's environment (Postgres and Cognito).
- **Tests:**
  - **Sync, in memory (5):** a view-only connection sees edits but its own are refused; the 4403/4410 refusals at connect; access changes close exactly the affected connections; live status and the once-a-minute "edited"; enforcement through the forwarding hop.
  - **End to end, against real Postgres** (`apps/api/test/sync-permissions.test.ts`, 6), with roles set up through the real API and a real sync server on `pgAccess`:
    - **The three required cases:**
      - a writer can't edit an episode they aren't assigned to;
      - a viewer's updates are rejected while they still see everyone else's;
      - a co-writer gets edit rights the moment a writer adds them.
    - **Plus:** removing a co-writer cuts them off in under 1.5 s without a reconnect; deleting the episode moves everyone out with 4410; Home's green dot comes from the sync server's writes.
  - **Existing suites:** every existing sync, cluster, chaos and browser test now signs in with real test-key tokens through `@wr/auth`. The browser tests fetch theirs from the test server's control endpoint.
  - **Results:** `pnpm check` passes (127 tests). `pnpm test:services`: API 49, sync 11.
  - **Chaos suite** (3 real processes, now `test/chaosServer.ts`): **0 lost edits** in every scenario. Takeover is 6.7 s after a SIGKILL and 10.6 s after a SIGSTOP, unchanged from D-023. The graceful add-and-remove scenario's slowest writer waited 3.8-6.5 s; the previous commit measured 4.8 s the same day, so that's this machine's conditions, not a regression.
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a) What 4403 means.** It's "ask the API what you may do now". It's sent for no access, for an edit from a view-only connection, and for any change of mode while connected, upgrades included, because the client learns its mode from the API (D-031). 4410 means deleted.
  - **(b) How view-only connections work.** Their empty handshake reply is acknowledged like anyone's, and only an actual edit is refused.
  - **(c) Fresh tokens.** The client asks for a fresh token on every connect, and one 4401 is retried (an hour-old token simply expired). That also fixes a latent bug: a session longer than an hour would have been signed out at its next reconnect.
  - **(d) Holding messages.** A connection's messages are held while its token is checked. Without this, the client's opening state vector would be lost.
  - **(e) Live-status writes:** on join, every 10 s, and on leave; "edited" at most once a minute per episode per server.
  - **(f) The document ID is the draft's ID** (SPEC 5.2). An ID the database doesn't know gets 4404.
  - **(g) The chaos suite's server entry.** It runs `apps/sync/test/chaosServer.ts`, which trusts the run's test key (its public half passed in `WR_TEST_PUBLIC_JWK`). `main.ts` never reads that variable, so production can't be made to trust a test key.
  - **(h) The cluster secret is now always required.** `.env.example` has a local value. This supersedes D-025 (e)'s built-in development secret, since there's no longer a development mode.
  - **(i) `packages/shared/src/devAuth.ts` stays until step 5,** only for `devIdentity` (the name and color the test browsers show). No server accepts its tokens.
  - **(j) The 30-day purge job moves to the deploy phase.** It needs new delete operations on the DynamoDB log and S3 snapshots and a daily schedule, and nothing needs it before real users.
- **What changes for writers:**
  - Roles are now enforced where the typing happens. A viewer or an unassigned writer can read along but can't change a word, and losing access takes effect in about a second.
  - **Local development:** the app can't sign in until the Cognito pool exists (step 8). The automated tests cover every rule until then.
- **Status:** built and tested. Arnav's calls 1-3 are recorded; (a)-(j) await Arnav.

### D-045 · 2026-10-25 · D-044's sign-in choices confirmed

- **Decision (Arnav's call):** D-044 (a)-(h) stand:
  - sign-up first, falling back to the sign-in code;
  - addresses lowercased;
  - no server state between "Continue" and the code;
  - a 10-minute Lax cookie for Google's round trip;
  - the address's first part as a stand-in name;
  - `PATCH /api/me` for the name step;
  - unverified addresses refused;
  - signing out revokes the refresh token at Cognito.
- **Status:** Arnav's call. Step 4 (the sync server) is next.

### D-044 · 2026-10-25 · Accounts phase step 3: signing in through the API

- **What was built:**
  - **The Cognito client** (`apps/api/src/auth/cognito.ts`): plain JSON calls (D-031) for SignUp (no password), ResendConfirmationCode, ConfirmSignUp, InitiateAuth (`USER_AUTH` with `EMAIL_OTP`, with a confirmation session, or `REFRESH_TOKEN_AUTH`), RespondToAuthChallenge and RevokeToken. Google uses `/oauth2/authorize?identity_provider=Google` with PKCE S256, then `/oauth2/token`.
  - **Linking** (`src/auth/link.ts`): Cognito's ID token is checked with the new `idTokenVerifier` in `packages/auth` (audience = our client, `token_use: id`). Its verified email finds or creates the person, and its `sub` is recorded in `user_identities` (D-041). A race of two first sign-ins with one address lands on the same person.
  - **Endpoints** (`src/routes/auth.ts`, public):
    - `POST /api/auth/email/start`, `/email/resend` and `/email/verify`;
    - `GET /api/auth/google/start` and `/google/callback`;
    - `POST /api/auth/refresh` and `/signout`;
    - plus the signed-in `PATCH /api/me` for the name step.
  - **The refresh cookie** is `wr_refresh`: httpOnly, Secure, SameSite=Strict, path `/api/auth`, 30 days. The browser gets only the 1-hour access token, in the response body (D-031).
  - **Errors read as plain messages:** "That code isn’t right…", "That code has expired. Send a new one.", "Too many tries. Wait a minute…", "Check the email address."
  - **`main.ts`** now also needs `COGNITO_DOMAIN`, for Google.
- **Tests:** 10 sign-in tests (`apps/api/test/auth.test.ts`) against a local fake Cognito (`test/fakeCognito.ts`) that speaks the same operations and error names, issues test-key tokens, and records the codes it would have emailed. They cover:
  - **A new email:** signing up, the name step, then signed in.
  - **The cookie's attributes,** and that the refresh token never appears in a response body.
  - **A known email:** a wrong code gets a clear message, and the right one signs in.
  - **"Send a new code"**, including someone who never finished signing up.
  - **A garbled attempt** reads as an expired code.
  - **Google and an email code reach the same person.**
  - **A new Google account** takes its name and skips the name step.
  - **Google failing safely:** a forged state, a missing cookie, or an unverified email gives "signin=failed" with no session.
  - **Sessions:** refreshing with the cookie; no cookie means no session; signing out revokes everywhere.

  The full `pnpm check` passes (122 tests). `pnpm test:services`: API 43, sync 11.
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a) Sign-up first.** "Continue" always tries sign-up first. If Cognito says the address exists, it sends a sign-in code instead. If the account exists but was never confirmed, it re-sends the sign-up code. Both paths look the same to the writer. This rests on the Cognito behavior logged under Known risks, verified at step 8.
  - **(b) Lowercased addresses.** Email addresses are lowercased before reaching Cognito, so "Maya@…" and "maya@…" are one account. The pool is also made case-insensitive in step 8.
  - **(c) No server-side state between "Continue" and the code.** The browser holds an opaque blob (which path, the address, Cognito's session). Tampering gains nothing, because Cognito checks its own session, and a garbled blob reads as "expired".
  - **(d) The Google cookie.** Google's sign-in round trip keeps its anti-forgery `state` and PKCE verifier in a 10-minute httpOnly cookie, `wr_oauth`. It's SameSite=Lax because the browser returns from Google on a cross-site redirect, where a Strict cookie wouldn't be sent.
  - **(e) A stand-in name.** A new email sign-up is named with the address's first part ("riley") until the name step saves the typed name. If they close the tab first, that stays.
  - **(f) `PATCH /api/me` saves the name step.** It could technically rename someone later too, but the UI only offers it on the first-time step (D-032).
  - **(g) Unverified addresses are refused** when linking, so nobody can claim someone else's scripts with an unverified email.
  - **(h) Signing out revokes the refresh token at Cognito,** so a copied cookie stops working, not just this browser's.
- **What changes for writers:** nothing visible until the sign-in page (step 5) and Cognito (step 8) exist. **For the system:** the API can now create and resume sessions without the browser ever holding a long-lived secret.
- **Status:** built and tested against the fake. (a)-(h) await Arnav.

### D-043 · 2026-10-25 · D-042's building choices confirmed

- **Decision (Arnav's call):** D-042 (a)-(f) stand:
  - a creator is assigned to what they create;
  - re-inviting replaces the link;
  - accepting never lowers a role;
  - an episode's Recently deleted entry waits for its series;
  - pending invitees' addresses are visible to members, while members' own addresses never are;
  - Home is one request, repeated every 15 s and on focus.
- **Status:** Arnav's call. Step 3 (the sign-in endpoints) is next.

### D-042 · 2026-10-25 · Accounts phase step 2: the API, shared token checks, RECENT on the server, always a showrunner

- **Decisions Arnav made before building (Arnav's calls):**
  1. **Token checks live in a new server-only `packages/auth`,** used by apps/api and apps/sync. It keeps `packages/shared` runnable in the browser.
     - Rejected: putting them in shared (server-only types in a package that must run anywhere), and copying them into both apps (two copies of security code drifting apart).
  2. **RECENT is kept on the server,** in an `episode_opens` table (migration 002, times only), so it's the same on every device.
     - Rejected: per-device browser storage.
  3. **A series always keeps at least one showrunner.** The last one can't become a writer or viewer, or leave, until someone else is showrunner ("Make someone else showrunner first.").
     - Rejected: allowing it, which leaves a series nobody can manage.
- **What was built:**
  - **`packages/auth`** (with `jose` 6.2.13):
    - `tokenVerifier(issuers)` accepts only RS256 access tokens from a listed issuer, signed by that issuer's published keys, for our app client (`client_id`), and not expired.
    - `cognitoIssuer(region, pool, client)` fetches and caches the pool's JWKS.
    - `@wr/auth/testing` generates a per-run test key. It's trusted only when a test builds a server with it; no setting can turn it on.
  - **`apps/api`** (Fastify 5.12.7):
    - **The sign-in check:** every route but `/api/health` needs a Bearer access token, and its `sub` must be linked in `user_identities` (D-041).
    - **Routes:** `GET /api/me` and `GET /api/home` (series with episodes, numbers, writers, live people, per-episode `canEdit`; RECENT; INVITATIONS; RECENTLY DELETED).
    - **Series:** create (script or series), rename, delete, restore, new episode, members, change role, remove member, invite.
    - **Episodes:** open (returns `canEdit` and the main draft's ID, and records RECENT), rename, delete, restore, add or remove co-writers.
    - **Invitations:** accept by token, accept from the sidebar, change role, cancel.
    - **Every check** goes through `seriesFor` / `episodeFor` (`src/access.ts`) and the shared rule. Non-members get "doesn't exist" for series and "Ask the showrunner" for episodes.
    - **Access alerts:** every access change sends `NOTIFY wr_access` inside its transaction, so the alert fires only if the change commits.
    - **Emails:** invitations use D-033's Plain wording. Until SES exists (step 8), the development mailer prints the email, link included.
    - `pnpm --filter @wr/api dev` refuses to start without the Cognito pool's settings.
- **Tests:** 23 API tests against real Postgres, signed in with the test key (`pnpm --filter @wr/api test:services`), plus 7 token-check tests and the 10 migration tests. They cover:
  - **Signing in:** refusing missing, forged and unlinked tokens.
  - **The permission matrix,** as seen by the showrunner, writers, a viewer and a stranger.
  - **Episodes:** writers renaming only their own; only the showrunner creating, deleting or inviting.
  - **Co-writers:** a writer adding and removing a co-writer on their own episode only; viewers can't be co-writers.
  - **Roles:** demoting to viewer removes assignments; removal ends access; a series keeps its last showrunner.
  - **Invitations:** a link is one-time and works with any address; cancelled, expired and unknown links fail; INVITATIONS with Accept; already-a-member is refused.
  - **Deleting:** delete and restore return an episode to its place; a deleted series vanishes and comes back; deleting a plain script's episode deletes the script.
  - **Home:** RECENT order; the live dot's 30-second window.
  - **Access alerts:** NOTIFY sent once per committed access change, and never for a refused one.

  The full `pnpm check` passes: 120 tests, 47 skipped without services.
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a) A creator is assigned.** Whoever creates an episode (or a script) is assigned to it, as in the approved prototype (D-034, detail 5), so the showrunner shows among its writers ("Arnav, Sam · edited …").
  - **(b) Inviting again replaces the link.** Inviting an address that already has a pending invitation cancels the old link and sends a new one.
  - **(c) Accepting never lowers a role.** Accepting an invitation keeps a higher role you already have. An invitation sent from an episode assigns that episode only if you end up a writer.
  - **(d) Episode trash waits for its series.** RECENTLY DELETED lists an episode only while its series is live. If the whole series was deleted, the episode comes back with it, and its own entry reappears afterwards.
  - **(e) Who sees pending emails.** Every member can see pending invitations' addresses in Members, as the approved prototype shows a writer. Members' own email addresses aren't shown to anyone.
  - **(f) No WebSocket from Home.** Home's data comes from one request, which Home repeats every 15 s and on focus (D-033).
- **Not built yet:** the 30-day purge (see Open issues), and the sign-in endpoints that link identities and set the cookie (step 3).
- **What changes for writers:** nothing visible yet. **For the system:** the API enforces every role rule from SPEC 5.3, and the sync servers can now be told when access changes.
- **Status:** built and tested. (a)-(f) await Arnav.

### D-041 · 2026-10-25 · D-040's choices confirmed, including one person per verified email

- **Decision (Arnav's call):** all of D-040 (a)-(f) stand.
  - **(a)** Our database keeps one person per verified email. `user_identities` maps each Cognito sign-in (`sub`) to that person, and the API links it at sign-in. Google one day and an email code the next reach the same scripts.
    - Rejected: linking inside Cognito with a pre-sign-up Lambda (an extra AWS piece that can't run locally), and keeping the accounts separate (someone would find an empty home).
  - **(b)-(f)** as described in D-040.
- **Status:** Arnav's call. Step 2 (the API) builds on it.

### D-040 · 2026-10-25 · Accounts phase step 1: permission rules, schema, migrations

- **What was built:**
  - **`packages/shared/src/permissions.ts`:** the one rule SPEC 5.3 asks for. It's pure and environment-neutral, so the API, the home sync server and the web app share it.
    - `canEdit(user, scope)`: on a series, only the showrunner (rename, invite, roles, remove people, create, delete and restore episodes). On an episode, the showrunner or a writer assigned to it (typing, renaming, co-writers).
    - `canMerge(user, episode)`: the same as `canEdit` in v1, since writers send to main on their own episodes without approval. It's kept separate for scene locks and cross-episode proposals.
    - `canView(user, scope)`: any member.
    - `canBeCoWriter(role)`: writers only.
    - `user` is an `Access` (the user's role in that series plus their assigned episodes), loaded from Postgres by the caller.
  - **`apps/api/migrations/001_accounts_and_rooms.sql`:**
    - **Tables:** SPEC 5.2's `users`, `series`, `series_members`, `episodes`, `episode_writers`, `invitations`, `drafts`, `snapshots` and `usage_events`; plus `user_identities` (proposal a), `episode_presence` (D-033), and `deleted_at` on `series` and `episodes` (D-037).
    - **Constraints:** roles checked; one main draft per episode; only what-ifs have a base snapshot; invitation token hashes unique (the token is never stored); a fixed vocabulary of usage events with no content; emails unique regardless of case; cascading deletes for the purge job.
  - **`apps/api/src/db/migrate.ts`** (and `pnpm --filter @wr/api migrate`): applies `NNN_name.sql` files in order, each in its own transaction, recorded in `schema_migrations`. It's guarded by a Postgres advisory lock, so two servers starting together take turns.
  - **Libraries:** `pg` 8.23.1 and `@types/pg` 8.23.1 (D-031), plus `tsx` for the API's scripts, as in apps/sync.
- **Tests:**
  - **Permissions (7, plain Node):** the showrunner, writer, viewer and non-member matrix; co-writer eligibility; role parsing.
  - **Database (10, real Postgres, `pnpm --filter @wr/api test:services`):**
    - migrations apply once and then report "up to date";
    - two runners at once apply each file exactly once;
    - a failing file leaves nothing behind and isn't recorded;
    - the schema rules above are enforced by Postgres itself.

  The full `pnpm check` passes (113 tests, 24 skipped without services). The dev database is migrated.
- **Choices Claude made while building, for Arnav to confirm:**
  - **(a) One person per verified email.**
    - Cognito creates a separate user for each way of signing in, so Google and an email code would otherwise make two accounts for the same address.
    - The fix: `users` holds people, and `user_identities` maps each Cognito user (`sub`) to a person. At sign-in, the API (which sees Cognito's ID token, D-031) links an identity to the person with that verified email, or creates the person.
    - The sync server only needs `sub` to person, one indexed lookup.
    - The alternative is linking inside Cognito with a pre-sign-up Lambda trigger: more AWS pieces, and harder to test locally.
  - **(b) `canView` and `canBeCoWriter`** sit beside `canEdit` / `canMerge`. SPEC 5.3 names the latter two, and reading and co-writer eligibility also need a rule; all of them live in the one module.
  - **(c) No "deleted" flag in the rule.** Deleted series and episodes are never loaded by the API or the sync server, so they have no access. Restoring is checked as `canEdit` on the series scope.
  - **(d) Episode `position` is a sort key that's never reused.** "Ep N" is the episode's rank among those not deleted, so a restored episode returns to its place and nothing is renumbered in storage.
  - **(e) Test commands:** `pnpm check` stays runnable without containers. A new root `pnpm test:services` runs every package's service-backed suite (the API's Postgres tests, the sync server's DynamoDB and S3 tests).
  - **(f) Test isolation:** each test file creates its own throwaway database, dropped afterwards.
- **What changes for writers:** nothing visible yet. **For the system:** the source of truth for who's in which room, and the one place that decides what each person may do.
- **Status:** built and tested. (a)-(f) await Arnav's confirmation; (a) shapes step 3.

### D-039 · 2026-10-25 · Prototype v2 approved; Privacy contact address

- **Decision (Arnav's call):**
  - Prototype v2, with D-035 to D-037, is approved "for now" as what the accounts phase builds to. Later visual edits go through the log as usual.
  - The Privacy page's contact address for deletion requests is **sabat.arnav@gmail.com** until there's a domain (D-038).
  - Arnav left the deletion window unchanged, so it stays "within 30 days", matching the 30-day Recently deleted list (D-037). "Last updated" gets the date the pages ship.
- **What changes for writers:** the Privacy page names a real person to contact.
- **Status:** Arnav's call. Building starts with step 1 (the schema and permission rules). Arnav is told when the AWS steps (account, verifying emails, the Google client) are due.

### D-038 · 2026-10-25 · AWS on the free plan until the beta; domain deferred

- **Context:** Arnav has little money to spare right now and asked what AWS's free plan would mean, and whether choices can be changed later.
  - Accounts created since July 15, 2025 choose a free or a paid plan. Both start with sign-up credits (about $100-200; the console shows the exact amount).
  - The free plan can't be charged. It ends after 6 months or when the credits run out, whichever comes first. The account then closes, and AWS keeps its data for 90 days. It can be upgraded to paid at any time, keeping the remaining credits.
  - The free plan blocks AWS Marketplace, Savings Plans and Reserved Instances. Joining AWS Organizations or Control Tower upgrades it automatically, and it can't receive other promotional credits.
- **Decision (Arnav's call):**
  1. **Timing:** create the AWS account only at step 8 of this phase (Cognito, SES and the budget alarms), on the **free plan**. This phase's usage (Cognito Essentials with under 10,000 monthly users; SES in pennies) fits inside the free allowances and credits, so it costs $0, and the 6-month clock starts as late as possible.
  2. **Admin access:** a plain IAM admin user with MFA, plus the AWS CLI with that user's access key. This replaces Claude's earlier suggestion of IAM Identity Center, whose usual setup creates an AWS Organization, which would force the upgrade. Root gets MFA and isn't used day to day.
  3. **The domain waits until just before the beta.** This supersedes D-030's timing, not its choice: SES on our own domain with DKIM is still the plan for the beta.
     - Until then, SES stays in its sandbox, verified for Arnav's two demo addresses. It sends codes and invitations to exactly those two.
     - The sender for now is one of those verified addresses. Mail may land in spam, which is acceptable for a demo.
     - When it's bought, the domain comes from a low-cost registrar (Cloudflare or Porkbun, about $10-11 a year for .com), with DNS in Route 53 ($0.50 a month, covered by credits) so CDK can write the DKIM records.
  4. **Upgrade to the paid plan when the closed beta starts.** The deploy-phase cost levers (proposed 2026-10-24) still apply.
- **What changes for writers:** nothing yet. For the demo, the emails may land in Arnav's spam folder. **For the system:**
  - The CDK stacks take the sender address as configuration, so swapping in the domain later changes one setting and the DNS records, not code.
  - The budget alarms ($20 and $40) are still deployed first.
- **Rejected:**
  - Creating the account now, which starts the 6-month clock months early.
  - The paid plan from the start: possible charges before there are users.
  - Buying the domain now: $10-15 Arnav doesn't need to spend before the beta.
- **Status:** Arnav's call. This changes Claude's earlier advice: the paid plan from day one, Identity Center, and the domain at step 8.

### D-037 · 2026-10-24 · Deleting episodes, scripts and series; Recently deleted; + New series

- **Context:** reviewing prototype v2, Arnav asked for two things. The showrunner should be able to delete episodes, scripts and whole series, behind more confirmation because those are bigger decisions, shown as a minimal × at the right end of the hovered row. And there should be a way to create a series, not only a script.
- **Decisions (Arnav's calls):**
  1. **The ×** is shown to the showrunner only, at the very right of home's episode rows and the sidebar's SCRIPTS and SERIES rows (not RECENT, which is a list of shortcuts). It's hidden until the row is hovered or focused, drawn as the 14 px line × in the icon color, turning text-colored under the pointer, with no box of its own. Its 24 px of space is always reserved, so the row's "Maya · edited Oct 12" never moves.
     - In a one-episode script, the episode row's × deletes the script.
  2. **Confirming is inline, in the row**; no popup, nothing over the page.
     - **An episode or a script:** the row becomes "Delete “Ep 2 · Undertow” for everyone?" with Cancel and Delete. Delete is a text action in `--del-fg`.
     - **A series** asks for more: "Delete “The Long Night” and its 3 episodes for everyone?", a field "Type “The Long Night” to confirm", and Cancel / Delete. Delete stays faded and does nothing until the typed name matches.
     - Esc or Cancel backs out, and clicking anything else cancels too.
     - Rejected: a small menu at the × (it would float over the list), and typing the name for every delete (tedious when cleaning up several "Untitled" episodes).
  3. **Recently deleted, 30 days:**
     - Deleted items move to a RECENTLY DELETED section at the bottom of the sidebar, visible to the series' showrunner. Each row shows the name, what it was ("The Long Night", "Script", or "Series · 2 episodes") and "30 days left", plus a "Restore" text action, styled like Accept.
     - Restoring puts an episode back in its old position. An episode whose series was also deleted asks for the series to be restored first.
     - The toast says "“Ep 2 · Undertow” deleted · restore it from Recently deleted for 30 days".
     - **For the system:** deleting is a soft delete (`deleted_at` on `episodes` and `series`). After 30 days a cleanup job permanently erases the row, its Y.Doc edit log, its snapshots, and its drafts. Anyone writing in a deleted episode is moved out with "This episode was deleted." A deleted series disappears from every member's home.
     - Rejected: an Undo toast with a purge within a day (less time to notice a mistake), and erasing immediately (one wrong click would lose an episode forever).
  4. **"+ New series"** sits in the home toolbar before "+ New script", in the same text-action style with the D-036 hover box. It creates "Untitled series" with no episodes, you as showrunner, selected, and the title ready to type. The empty series shows "No episodes yet. Add one with + New episode." Anyone can create a series and becomes its showrunner (SPEC 5.3).
     - Rejected: a "+ New ▾" menu (an extra click for the most common action) and "+ New series" on the SERIES label (hidden until you already have a series).
     - Note: solo writers now see the word "series" in the toolbar. Their own scripts still look like plain scripts (D-033).
  5. **A series stays a series.** Each series now has a flag. Something created as a series, or a script that gained a second episode, keeps the series layer even at one episode ("The Long Night · 1 episode", "Ep 1 · Pilot") or none. A plain script (created by + New script, never given a second episode) keeps its one shared name.
     - Rejected: turning back into a script at one episode, where the series name would vanish and the room's home would jump sections.
- **What changes for writers:** a showrunner can clean up the room, two deliberate clicks for an episode and a typed name for a series, and has 30 days to change their mind. Showrunners can set up a series and its members before writing a page.
- **For the system:**
  - `series.is_series` (or a `kind` column), and `deleted_at` on `series` and `episodes`.
  - A daily purge job that also deletes DynamoDB edit-log items and S3 snapshots.
  - A close code that tells connected writers "deleted".
  - The API checks the showrunner role for deleting and restoring.
- **Status:** Arnav's call. Built into prototype v2 and walked through in Chromium (episode, script and series deletes, the typed-name rule, Esc, Restore, + New series, dark mode) with no script errors.

### D-036 · 2026-10-24 · The "+ New script" hover box matches the toolbar's icon slots

- **Decision (Arnav's call):** in the toolbar, the hover box of "+ New script" is the same height as the theme toggle's slot beside it: 28 px, 6 px radius, text centered vertically, 8 px side padding offset by an equal negative margin. Measured in Chromium, both boxes are 28 px tall with their tops at 14 px, so the two hovers line up. "+ New episode" and "Members" in the series header keep D-026's smaller box (4 px by 6 px padding): they sit beside text, not icons.
- **What changes for writers:** pointing along the toolbar, each hover highlight is the same height. **For the system:** one modifier class (`.ta.hv.tbh`) in prototype v2.
- **Status:** Arnav's call.

### D-035 · 2026-10-24 · "+ New script" gets the same hover

- **Decision (Arnav's call):** the home toolbar's "+ New script" gets the D-026 hover: a `--hover` background, 6 px radius, and padding offset by an equal negative margin so nothing moves. This extends D-026 by one control. The other text actions (Accept, + New what-if, + Snapshot) still have no hover; that part of D-026's open question stays open.
- **What changes for writers:** all three of home's create and open actions now respond the same way under the pointer. **For the system:** one class in prototype v2 (`ta hv`).
- **Status:** Arnav's call.

### D-034 · 2026-10-24 · Prototype v2: the accounts phase, clickable end to end

- **Decision (Arnav's call):** before building the phase, a clickable v2 prototype, so the visuals can be reviewed and edited first. It's a copy (`docs/prototype/writers-room-prototype-v2.html`) that becomes the visual and interaction source of truth from this phase on. The original stays untouched as the record of what the earlier phases matched.
  - Rejected: editing v1 in place, which would lose that record.
  - The scaled script page is unchanged from v1. The real build's page geometry still follows D-003.
- **What v2 adds to v1:**
  - **Sign-in, from the template (D-028, D-029):** the email, code and first-time-name steps; the "Join Fogline" version from an invitation link; "Continue with Google"; and the Terms and Privacy pages, drafted for review.
  - **Home:**
    - Sidebar sections RECENT, SCRIPTS, SERIES and INVITATIONS, each hidden when empty; Accept, after which the series joins SERIES.
    - The series header: renamed by clicking the title (showrunner only), with + New episode (showrunner only) and Members, both with the D-026 hover.
    - Episode rows with the live dot, the empty home for a new account, and the solo script that becomes a series at episode 2 (D-033).
  - **Members panel (D-030, D-027):** collapsible; role menus that change roles, remove members (with Undo) and cancel invitations; and the invite row with the field-styled picker.
  - **Account menu (D-032):** the name and email, then Sign out.
  - **Script screen:**
    - The toolbar title renames by click (D-033); "View only" appears for viewers and for writers not assigned to the episode; presence avatars show only the others connected.
    - Share › Copy invite link, and Share › Invite co-writer…, the checklist with Undo plus the showrunner's invite row (D-032).
    - New scripts and episodes open blank, with the title ready to type.
  - **A "Prototype" chip at the top center, dashed and labelled "Not part of the app":** switch your role in The Long Night, sign out, open an invitation link. Sign-in hints: `arnav@example.com` or Google opens the sample room, any other email is a new empty account, and any 6 digits work as the code.
- **Small details Claude chose while building, for Arnav's review:**
  1. Clickable titles get the `--hover` background on hover, like the D-026 text actions, so you can tell they're editable.
  2. Members lists you first, then by role (showrunner, writer, viewer). Its meta line reads "4 people · 1 invited".
  3. Changing a role, removing someone, inviting, cancelling an invitation, and accepting ("You joined Fogline") all confirm with the shared toast. Removals and co-writer changes offer Undo.
  4. The co-writer checklist is headed "CO-WRITERS" and shows each writer's avatar at 20 px.
  5. A new episode is assigned to whoever created it.
  6. After "Accept", "Accepted ✓" shows for about 0.8 s before the series moves into SERIES.
  7. In "View only", Send to main is refused with a toast. Which roles can see and create what-ifs and snapshots is still Phase 3's decision.
- **Checked:** a scripted walk through every flow in Chromium, in light and dark, with no script errors. That walk found and fixed four bugs:
  - the chip covered the Members panel's Invite button (moved to the top center);
  - a delayed focus crashed when the step had already changed;
  - rename lost keystrokes typed in the first 30 ms;
  - a toast from before signing out stayed visible.
- **Status:** built; awaiting Arnav's visual review and edits. The AWS setup follows the review.

### D-033 · 2026-10-24 · Invitation email wording, solo writers, naming, live status, "View only", cookie plugin

Items 1 and 2 were answered in the first round of the accounts phase, before D-026, and Claude missed logging them then. They're recorded here.

- **Decisions (Arnav's calls):**
  1. **Invitation email: wording 1, Plain.** The viewer version reads "Sam Jones invited you to read Fogline."
     - Subject: "Sam Jones invited you to Fogline".
     - Body: "Sam Jones invited you to write on **Fogline** in Writers’ Room." and a [Join Fogline] button.
     - Footer: "This link works for 14 days. If you weren’t expecting this, you can ignore it."
     - Sent from `Writers’ Room <invites@our domain>` (D-030).
     - The sign-in code email: subject "Your Writers’ Room code: 123456", body "Enter 123456 to sign in. It expires in a few minutes. If you didn’t ask for it, ignore this email."
     - Rejected: wording 2, "The room" (a playful subject from an unknown sender looks like marketing), and wording 3, "Role spelled out" (the longest; it explains what a click would show anyway).
  2. **Solo writers see the series layer only at the 2nd episode** (SPEC Part 2).
     - A one-episode series looks like a plain script everywhere: a SCRIPTS sidebar section, a header reading "Script · just you" (or "Script · you and Maya"), no "Ep 1 ·" and no "1 episode".
     - Its series and its episode share one name, and renaming the script renames both.
     - "+ New episode" turns it into a series: it moves to SERIES, episodes get numbered ("Ep 1 · Night Shift", "Ep 2 · Untitled"), and the meta line reads "2 episodes · you’re the showrunner".
     - Empty sidebar sections are hidden, and a brand-new account's home shows "No scripts yet. Start one with + New script." (pointing at the existing toolbar control, not a second button).
     - Rejected: also showing the series layer when a second person joins (a pair co-writing a feature would see series words they don't need), and always showing it (contradicts SPEC Part 2).
  3. **Creating and renaming:**
     - "+ New script" creates "Untitled script" (quietly, a one-episode series), and "+ New episode" creates "Ep N · Untitled". Each opens the new script at once through the 220 ms handoff, with the toolbar title selected for typing. Enter saves; Esc keeps the old name.
     - Afterwards, clicking the toolbar title renames the episode. Its writers and the showrunner can do that.
     - The showrunner renames a series by clicking its title in the home header.
     - The title is the only rename control (one control per action).
     - Rejected: a "Rename…" menu item on each row (a new per-row menu, and a trip back home to name a new script).
  4. **Live status on Home:**
     - Each home sync server upserts a presence row per open episode in Postgres (who's connected), refreshed every 10 s and treated as stale after 30 s. It also updates `episodes.edited_at` at most once a minute while edits arrive.
     - Home fetches its series from the API every 15 s and whenever the tab regains focus.
     - A row shows "● Maya, Sam · editing now" (the people connected right now) or "Maya, Sam · edited Oct 12" (the episode's assigned writers).
     - Rejected: a WebSocket subscription from Home (a new protocol message type, plus a sync connection per series shown, to save about 15 s).
  5. **"View only":** when someone can't edit an episode (a viewer, or a writer not assigned to it), the toolbar shows a 12 px muted "View only" after the draft switcher. The page shows no caret, and typing does nothing. They still appear in the presence avatars and see everyone's cursors live.
     - Rejected: no cue, where a writer who doesn't know they're unassigned would think the app is broken.
  6. **`@fastify/cookie`** sets and reads the refresh cookie (D-031). It's Fastify's official plugin, so the security-sensitive cookie parsing and escaping isn't hand-rolled.
- **What changes for writers:** a new script opens ready to be named. Home shows who's writing right now within about 15 s. Read-only is never mysterious.
- **For the system:**
  - A presence table written by the sync servers, plus `episodes.edited_at`.
  - The episode and series rename endpoints run through `canEdit` for episodes and a showrunner check for series.
- **Status:** Arnav's call.

### D-032 · 2026-10-24 · Invitation links, Copy invite link, Invite co-writer…, and the account menu

- **Decisions (Arnav's calls):**
  1. **Invitation links are one-time.**
     - The email's button carries a random token. Only its SHA-256 hash is stored, so a leaked database can't be used to accept invitations.
     - Whoever opens the link and signs in, with any email address, joins the series in the invited role. The token is then used up.
     - It expires after 14 days, and the showrunner can cancel it ("Cancel invitation" in Members).
     - Opening the link counts as accepting. Pending invitations also appear under INVITATIONS, with Accept, for anyone signed in with the invited address, which covers people who sign in without clicking the link.
     - Rejected: links tied to the invited email. That's safer if an email is forwarded, but people with a school address and a personal one get stuck, and the showrunner has to re-invite.
  2. **Share › "Copy invite link"** copies a link to the current episode (`/e/<episodeId>`). The prototype's label is unchanged.
     - Series members who open it land in the episode, in edit or view mode by their role.
     - Anyone else signs in and sees "You don't have access to this episode. Ask the showrunner." Only the showrunner brings new people in, by email in Members (SPEC 5.3).
     - Rejected: a reusable join link for the showrunner. It would keep working wherever it's pasted, need a revoke control, and make one menu item mean two things depending on role.
  3. **Share › "Invite co-writer…"** opens the shared menu as a checklist of the series' writers, with ✓ on those assigned to this episode.
     - Clicking a name adds or removes them as a co-writer, and a toast confirms it, with Undo.
     - The episode's writers and the showrunner can use it (SPEC 5.3: a writer adds existing members to their own episode, and the showrunner can remove anyone). Viewers aren't listed; the showrunner first makes them writers in Members.
     - For the showrunner only, the bottom of the menu has the D-027 invite row: an email field, a role picker and Invite, which invite a new person to the series and assign this episode.
     - Rejected: a right panel inside the script. It would be a second panel beside Compare, for a quick action.
  4. **The account avatar menu** is the shared menu: the name and email as a muted, non-clickable header, then "Sign out".
     - Changing your name or deleting your account is by request for now, and the Privacy page (D-029) says how.
     - Rejected: self-serve "Edit name…" and "Delete account…". Deleting a showrunner raises its own question (who inherits the series?) and adds scope.
- **What changes for writers:** one email button gets someone into the room with whichever account they use. A link pasted in the group chat opens the episode for members. Adding a co-writer is two clicks from inside the script.
- **For the system:**
  - **`invitations`:** series, role, email, the token's hash, inviter, expiry, accepted-by and accepted-at, cancelled-at, and an optional episode to assign on acceptance. That last field supports the showrunner's invite row in "Invite co-writer…".
  - **Routes:** `/i/<token>` (accept an invitation) and `/e/<episodeId>` (open an episode).
- **Status:** Arnav's call.

### D-031 · 2026-10-24 · Accounts libraries and security model: pg + SQL migrations, jose + fetch, httpOnly refresh cookie, Postgres-backed permissions with NOTIFY

- **Decisions (Arnav's calls):**
  1. **Postgres access:** `pg` (node-postgres), with hand-written SQL in one data module per app, and with the types written by hand.
     - Migrations are numbered `.sql` files (`apps/api/migrations/001_….sql`, …), applied in order by a small runner of ours. Each runs in a transaction and is recorded in a `schema_migrations` table.
     - Rejected: Kysely (one more layer to learn and explain) and Drizzle (generated SQL nobody wrote, which is hard to defend in an interview).
  2. **JWT and Cognito:** `jose` verifies tokens in the API and the sync servers (Cognito's public keys come from its JWKS URL and are cached) and signs the test tokens (D-030).
     - Every token check is the same: the signature, the issuer, the client ID, `token_use: "access"` and expiry.
     - Cognito's sign-in API (InitiateAuth with `USER_AUTH` and the `EMAIL_OTP` challenge, RespondToAuthChallenge, SignUp without a password, refresh) is called with plain JSON `fetch` requests. Unsigned calls from a public app client need no SDK.
     - Google sign-in goes to Cognito's `/oauth2/authorize?identity_provider=Google` with PKCE, so Cognito's own pages never show, and the code is exchanged at `/oauth2/token`.
     - Rejected: AWS's `aws-jwt-verify` plus the Cognito SDK (two packages and a heavier bundle, with tests still needing a signer), and Amplify (it hides the mechanics and decides where tokens live).
  3. **Where tokens live:** the API acts as the browser's go-between for Cognito.
     - The long-lived refresh token is stored in a cookie that is `httpOnly` (page scripts can't read it), `Secure` (HTTPS only, except on localhost in development) and `SameSite=Strict`, scoped to the API's auth path.
     - The browser keeps only the short-lived (1 hour) access token, in memory. It sends that token to the API as `Authorization: Bearer` and to the sync server on connect, and gets a fresh one from the API's refresh endpoint before it expires or after a page reload.
     - The web app and the API share an origin: the Vite dev proxy in development, CloudFront path routing on AWS. So the cookie is first-party and no CORS is needed.
     - Rejected: tokens in localStorage, since any script that ever ran in the page could take a lasting session.
  4. **Permissions at the sync server:**
     - On connect, the home server loads the user's series role and episode assignment from Postgres (read-only) and decides through the shared `canEdit(user, scope)`, as SPEC 5.3 requires. The entry server only verifies the token; the identity reaches the home through the signed forward header (D-022).
     - A read-only connection still receives updates and presence, but its updates are rejected.
     - When the API changes a role, an assignment or a membership, it runs `NOTIFY wr_access, '<episodeId>'` in the same transaction. Each sync server `LISTEN`s and re-checks only that episode's open connections, so revocation takes effect in about a second, without a reconnect.
     - Rejected: an API-signed ticket (a removed co-writer keeps editing until they reconnect) and asking the API on every connect (the API would sit in the path of every failover's reconnect burst).
- **What changes for writers:** they stay signed in for weeks. Removing someone from an episode or the series takes effect within about a second. **For the system:**
  - **New libraries:** `pg`, `jose`, and (proposed in this round) a cookie plugin for Fastify. The sync servers gain a Postgres connection.
  - **Coupling:** Postgres is now required on the connect path. If Postgres is down, new connections can't be authorized; open ones keep working. This is logged as a known risk.
- **Status:** Arnav's call.

### D-030 · 2026-10-24 · Members panel collapsible; SES on our own domain; ca-central-1; how dev and tests sign in

- **Decisions (Arnav's calls):**
  1. **Members view:**
     - The right panel (mockup "Members A"): 340 px, using Compare's component, beside the episode list.
     - It lists each person with their avatar, name, episodes and role. For the showrunner, each role is a quiet "Writer ▾" menu (Showrunner / Writer / Viewer / Remove from series), and an invited person's menu also has "Cancel invitation". The INVITED section lists pending people, and the invite row (D-027) sits at the bottom. Writers and viewers see the list read-only.
     - It's **collapsible:** "Members" toggles the panel (340 to 0 px over 240 ms, like the sidebar and Compare), and the × or Esc also closes it.
     - This changes SPEC 3.4's list, where "Members" was a one-shot action that bolds for 0.7 s: it's now an opener, bold while the panel is open, like Compare.
     - Rejected: the in-place list (B), which hid the episodes while open, and a dropdown, too cramped for a 15-person room.
  2. **Email sender:** Amazon SES, sending from a domain Arnav buys (about $10-15 a year), verified with DKIM so the mail is signed and lands in inboxes. SES is required anyway: Cognito's passwordless email codes need the Essentials plan *and* SES sending, and invitation emails can only go through SES. A real domain is also how SES leaves its sandbox, where it sends only to verified addresses, before the beta.
     - Rejected: sending from Gmail through SES, which fails Gmail's sender checks and lands in spam.
  3. **Region:** `ca-central-1` (Montreal). It's closest to the Toronto beta and keeps accounts and scripts in Canada, and Cognito Essentials and SES are both available there.
     - Rejected: `us-east-1`, about 5-10% cheaper but farther away, with the data in the US. CloudFront's certificate still has to live in `us-east-1`; that's a deploy detail.
  4. **How development and tests sign in:**
     - Running the app locally uses the real Cognito user pool, on the free tier (10,000 monthly active users on Essentials), with real emails.
     - Automated tests sign tokens with a test-only key pair generated per run. The API and sync servers trust that key only when started by the test harness, and check it with the same code as Cognito tokens: signature against a JWKS, issuer, audience/client ID, `token_use` and expiry.
     - The unsigned `DEV-UNSIGNED.` tokens and `WR_DEV_AUTH` are removed.
     - Rejected: the `cognito-local` emulator (unmaintained, and no passwordless email codes, so tests would pass against something we never ship), and real Cognito in tests (slow, flaky, and it needs AWS credentials on every run).
- **What changes for writers:** invitations and sign-in codes come from the app's own domain and arrive in the inbox. The Members panel slides in and out beside the episode list. **For the system:**
  - A Cognito user pool (Essentials plan, passwordless email codes plus a Google identity provider) and an SES domain identity, both in `ca-central-1` and both defined in CDK.
  - The servers verify JWTs against a configurable list of trusted issuers.
- **Needed from Arnav before Cognito can exist:** an AWS account, the budget alarms ($20 and $40) set up first, the domain, and a Google Cloud OAuth client for "Continue with Google". Claude gives step-by-step instructions for each.
- **Status:** Arnav's call.

### D-029 · 2026-10-24 · Sign-in: no toolbar, template sizes, wordmark, legal line with real pages

- **Decision (Arnav's call), settling D-028's four open parts:**
  1. **No toolbar** on the sign-in page, exactly as in the template. This is a named exception to SPEC 3.5 ("every screen"): the page has no actions a toolbar would hold. Every screen after sign-in keeps the toolbar.
  2. **The template's sizes:** a 400 px column, a 28 px semibold heading, 15 px text and 44-46 px controls. This exception to SPEC 3.3's tiers covers the sign-in steps (and the Terms and Privacy pages' headings) only; the app's chrome keeps the tiers.
  3. **The Courier Prime wordmark** "WRITERS’ ROOM" fills the template's logo slot, until there's a real logo.
  4. **The legal line stays,** and its links go to two short static pages built in this phase: Privacy (what's stored: email, name, the scripts themselves, and usage *counts* only, never content, per SPEC 5.9; who can see a script; how to delete an account) and plain-language Terms. Claude drafts both for Arnav's review. They're plain-language drafts, not legal advice, and Arnav should review them before the beta.
- **Options considered:**
  - (1) The toolbar per SPEC 3.5.
  - (2) Strict SPEC 3.3 tiers (a 15 px heading and 34 px controls).
  - (3) No wordmark.
  - (4) Dropping the legal line until the beta, or keeping a line without links.
- **Tradeoffs:**
  - Two documented exceptions to the spec, limited to one page.
  - The Terms and Privacy pages add a little scope beyond the phase's list; Arnav approved it.
  - A legal line that links to real pages is honest now, rather than a to-do for later.
- **What changes for writers:** the sign-in page is the template, in the app's colors. Before signing in they can read, in plain words, what's stored and who sees their scripts. **For the system:** two static routes (`/terms`, `/privacy`) in apps/web, which need no account.
- **Rejected:**
  - The toolbar: an empty bar that repeats the wordmark.
  - Strict tiers: a small form floating on an empty page.
  - No wordmark: it loses the template's top anchor.
  - No legal line: Arnav wants it from the start.
  - A line without links: not an agreement.
- **Status:** Arnav's call. The Terms and Privacy text comes to Arnav for review before it ships.

### D-028 · 2026-10-24 · Sign-in screen: Arnav's template, in our design system

- **Context:** the first round of mockups offered A (a quiet centered column) and B (a screenplay title page on the desk). Arnav preferred A, but it didn't have Highland's minimal, native macOS look: it stood out from the other screens and read as generic, especially the full-width blue "Email me a code". Claude redrew A as A1 (native control sizes, a small default button, plus a grayscale variant) and A2 (built from the home page's rows, with no buttons). Arnav then supplied a reference sign-in screen (Mobbin's) to use as an exact template, adapted to our scheme.
- **Decision (Arnav's call):** the template's layout, top to bottom:
  - a mark (a Courier Prime wordmark, "WRITERS’ ROOM", since we have no logo);
  - the heading "Sign in or create an account", then the muted subtitle "Write together in real time. No password needed.";
  - "Continue with Google", outlined with `--line` and no fill;
  - an "or" divider in `--line2`;
  - the email field, filled with `--side` and no border, with an accent focus ring;
  - "Continue", full width, on the inverted-surface tokens `--toast` / `--toast-fg`: light in dark mode, dark in light mode, never blue;
  - the 12 px muted legal line.

  The adaptations: our tokens in both themes, the system font, and 6 px corners instead of the template's pills. Template proportions are a 400 px column, a 28 px semibold heading, 15 px text and 44-46 px controls.
- **Steps on the same layout:**
  - **Code:** "Check your email", a code field, Continue, and "Use a different email · Send a new code" where the legal line was.
  - **Name, for a new email only:** "What should the room call you?"
  - **From an invite link:** "Join Fogline" and "Sam Jones invited you to write…".
  - Google users skip the code and name steps.
- **Template parts left out, with reasons:**
  - "Already have an account? Log in": with email codes, signing in and signing up are one flow; a new email just gets the name step.
  - "Trusted by teams at" and its logos: we have none, and inventing them would be fake.
- **Still open for Arnav:**
  1. Whether the 56 px toolbar shows (SPEC 3.5 says every screen has one; the template has none).
  2. Template sizes versus SPEC 3.3's tiers (a 28 px heading is outside them; the strict version uses 15 px and 34 px controls).
  3. Whether to keep the wordmark.
  4. Whether to keep the legal line, which needs real Terms and Privacy pages that don't exist yet.

  The mockup has a toggle for each.
- **Rejected:**
  - B · Title page: Arnav preferred A's directness.
  - The original A: it stood out from the app and looked generic.
  - A1 and A2: superseded by the template before Arnav chose between them.
- **What changes for writers:** a familiar, calm sign-in page that matches the app's colors in both themes. **For the system:** none yet; it's a mockup.
- **Status:** Arnav's call on the layout; four parts are open.

### D-027 · 2026-10-24 · The invite row's role picker and "Invite" look like the email field

- **Context:** in the Members mockups (`docs/mockups/accounts-phase.html`), Arnav found two things off in the invite row: the browser's native role select, whose system arrow doesn't match the app, and the solid blue "Invite" button.
- **Decision (Arnav's call):**
  - "Invite" takes the email field's look: 30 px tall, a 1 px `--line` border, 6 px radius, `--bg` fill, 13 px text-color, regular weight. Hover layers `--hover` over the fill, and keyboard focus gets the field's accent border and `--blue-ring`.
  - The role picker gets the same field look and becomes the app's own control: "Writer" plus a small muted "▾", opening the shared menu (Writer ✓ / Viewer), like the role controls in the member list. In the panel's footer, the menu opens upward, so it's never cut off.
  - The same applies to the invite row at the top of the in-place Members variant.
- **Options considered:** (a) keep the native select and the blue primary button, which is the prototype's `.pb`; (b) give both controls the field's look, with an app-drawn picker (chosen).
- **Tradeoffs:** SPEC 3.3 reserves blue for primary actions but doesn't require it, so this is allowed, but it means primary actions aren't always blue. The row reads as one quiet unit, which suits a panel the showrunner opens occasionally. Pressing Enter in the email field also sends the invite, so the button doesn't need to stand out.
- **What changes for writers:** the invite row looks native to the app instead of like a web form. **For the system:** a field-styled button style (`.fbtn`) and a small picker that reuses the shared menu.
- **Rejected:** (a), because the native arrow and the blue block clashed with the quiet panel.
- **Status:** Arnav's call. Whether other primary buttons (for example, Compare's "Send mine to main") keep the blue `.pb` is unchanged: they do, per the prototype.

### D-026 · 2026-10-24 · "+ New episode" and "Members" get a hover background

- **Context:** the accounts phase began with mockups (`docs/mockups/accounts-phase.html`) for the sign-in screen, the Members view, the invitation email and solo writers. Reviewing them, Arnav asked for the series header's "+ New episode" and "Members" to come alive on hover the way everything in the left panel does.
- **Decision:** both get the sidebar rows' hover treatment: a `--hover` background with a 6 px radius. Padding of 4 px by 6 px is offset by an equal negative margin, so the text sits exactly where it did and its neighbors never move. Everything else about them is unchanged: muted 13 px at rest, bold for about 0.7 s on click (or held while open), with bold width reserved in advance.
- **Options considered:**
  - (a) No hover, as in the prototype (SPEC 3.4 gives text actions a bold-on-click and nothing on hover).
  - (b) A hover background on these two only (chosen).
  - (c) A hover background on every text action (+ New script, Accept, + New what-if, + Snapshot).
- **Tradeoffs:** (b) makes the home header feel as responsive as the sidebar at no layout cost. It's a deviation from the prototype, and it leaves the other text actions without a hover for now; whether to extend it to them, option (c), is an open question for Arnav.
- **What changes for writers:** pointing at "+ New episode" or "Members" now shows they're clickable before you click. **For the system:** one CSS rule, applied in the mockups now and carried into the real home page when it's built.
- **Rejected:** (a), because the header controls felt dead next to the sidebar's hover rows.
- **Status:** Arnav's call. Option (c) is open.

### D-025 · 2026-10-24 · D-023 (e)-(g) confirmed

- **Decision:** after Claude's plain-language explanation, Arnav confirmed the last three D-023 choices:
  - (e) In dev mode, servers sign forwarded identities with a built-in cluster secret; outside dev, a server refuses to start without a real one. Where the AWS secret lives is decided with the deploy.
  - (f) `allowBuilds: { esbuild: false }`: esbuild's install script stays off (pnpm's safe default), since it only re-checks a binary pnpm already installs.
  - (g) The sync server image is `node:24.12.0-alpine`, running TypeScript with `tsx`, for local use. The production build (for example, bundling ahead of time) is decided with the deploy.
- **What changes for writers:** nothing. **For the system:** every cluster-phase choice is now settled, and two follow-ups (the AWS secret's location and the production build) are carried into the deploy phase.
- **Status:** Arnav's call. Every D-023 choice is confirmed; only the hands-on demo is deferred (D-024).

### D-024 · 2026-10-24 · Cluster phase: chaos suite passes on Arnav's machine; D-023 (a)-(d) confirmed

- **What happened:** Arnav ran `pnpm --filter @wr/sync test:chaos` himself, and all 3 scenarios passed. He confirmed D-023 items (a)-(d):
  - (a) the 5 s client connect timeout;
  - (b) the forwarding hop holding a new writer for up to 15 s, retrying every 500 ms;
  - (c) a graceful leave waiting one heartbeat before handing off;
  - (d) background log truncation after the pointer moves.
- **Still open:** items (e)-(g) (the dev cluster secret, the esbuild install-script setting, the server image), awaiting Arnav after Claude's explanation. The hands-on demo script is deferred to later, at Arnav's choice. The one path not yet exercised end to end is the browser against the 3-container Docker cluster.
- **Status:** Arnav's call.

### D-023 · 2026-10-24 · Cluster phase built: membership, ring, forwarding, fenced leases, failover, rebalancing

- **What was built:**
  - **Membership** (`cluster.ts`): a heartbeat every 2 s; a server is dead after 6 s.
  - **Consistent hashing** (`ring.ts`): 256 SHA-1 virtual nodes per server.
  - **Forwarding** (`server.ts`): a WebSocket pipe per writer, with the identity HMAC-signed by the cluster secret.
  - **Leases** (`storage/coordination.ts`): acquire increments the epoch in one conditional write; renew and release are conditional on owner and epoch; a new owner waits for expiry.
  - **Fenced storage:** every log append is a `TransactWriteItems` combining the lease check and the log put. Snapshots are immutable S3 objects plus a fenced, forward-only pointer item, and the log is truncated only after the pointer moves.
  - **Failover:** a new owner loads the pointer's snapshot plus the log tail, and the clients' handshake resends what it lacks.
  - **Graceful handoff:** idle rooms first, then snapshot, release, and close with 4409. Shutdown leaves the ring, waits one heartbeat, then hands off.
  - **Client:** a random server per connect, a heartbeat (ping every 5 s, give up after 10 s, checked every second), a 5 s connect timeout, "Reconnecting…", and an immediate reconnect on 4409 and 1001.
  - **Local cluster:** three nodes in docker compose (`pnpm cluster:up`, `apps/sync/Dockerfile`), with table creation that tolerates several servers racing.
  - **Docs:** `docs/sync-cluster.md` (the design, written for interviews) and an updated `PROTOCOL.md`.
- **Tests:**
  - **Ring (5):** determinism, balance, and minimal movement on join and leave.
  - **Storage and fencing against DynamoDB Local + SeaweedFS (11):** includes "eight servers race for one lease: exactly one wins", "an outdated owner's append is refused", and "an outdated owner can't move the snapshot pointer".
  - **In-process cluster (5):** routing, failover, split brain, adding a server (idle first), removing one.
  - **Chaos suite** with 3 real processes and the real timings (`test:chaos`, below).
- **Measured** (chaos suite, three runs; worst wait for a keystroke to be confirmed durable; **0 lost edits in every run**):

  | Scenario | Takeover | Worst writer wait |
  |---|---|---|
  | SIGKILL the home mid-typing | 6.1-7.3 s after the kill | 6.3-8.7 s |
  | SIGSTOP the home, then SIGCONT (split brain) | about 10.7 s after the freeze | about 13 s, for a normal writer on the frozen server |
  | Add a server, then SIGTERM one, 6 writers typing | graceful | 0.3-2.2 s |

  In the split-brain runs, the woken owner stepped down because its append was fenced, or because its lease renewal was refused. DynamoDB holds no epoch-1 log item after the first epoch-2 item.
- **Bugs the chaos runs found, all fixed:**
  1. Servers racing to create the DynamoDB tables crashed the losers. Table creation now tolerates `ResourceInUseException` and waits for the winner.
  2. After a crash, writers' reconnect backoff kept growing while the ring caught up. The forwarding hop now holds a new writer (answering its pings) and retries every 500 ms.
  3. The hop flushed a writer's opening messages to a home that then turned it away, so the next home never got the writer's state vector, and the writer never re-synced. Messages are now kept until a home starts the session, and replayed.
  4. A room being handed off still counted as held, so a writer reconnecting in that window re-opened the episode on the old server and took the lease back, forcing a second handoff. Only open or loading rooms count as held now.
  5. Handoffs waited for log truncation: deleting hundreds of items took 2-3 s per episode on DynamoDB Local. Truncation now runs in the background once the pointer has moved, which is safe at any time and by anyone.
  6. A graceful shutdown bounced writers back to the leaving server. It now leaves the ring and waits one heartbeat before handing off, still serving its episodes meanwhile.
  7. The client checked the heartbeat deadline only when it pinged, so a silent server was noticed after 10-15 s; it's now checked every second. A connection that never opens (a frozen server's OS still accepts TCP) had no timeout; there's now a 5 s connect timeout.
  8. A measurement bug in our own test: "confirmed" meant "nothing outstanding", which never happens while someone types faster than the round trip. That made graceful handoffs look like 10 s pauses. The suite now tracks each keystroke's own acknowledgment.
  9. Test isolation: each chaos scenario now runs its own cluster with its own membership table (an earlier scenario's servers had joined the next one's ring).
- **Choices made while building, for Arnav to confirm:**
  - (a) A 5 s client connect timeout.
  - (b) The forwarding hop holds a new writer for up to 15 s, retrying every 500 ms.
  - (c) A graceful leave waits one heartbeat (2 s) before handing off.
  - (d) Truncation runs in the background after the pointer moves.
  - (e) Dev mode falls back to a built-in cluster secret, and outside dev the server refuses to start without one.
  - (f) `allowBuilds: { esbuild: false }`: pnpm 12 blocks install scripts, and esbuild's only re-checks a binary pnpm already installed.
  - (g) The image is `node:24.12.0-alpine`, run with `tsx`. Production bundling is still to be decided with the deploy.
- **What changes for writers:** a server can crash, freeze, join or leave mid-scene. They see "Reconnecting…" for a few seconds (under a second for planned changes), keep typing, and lose nothing.
- **Status:** built and tested; awaiting Arnav's review and confirmation of (a)-(g).

### D-022 · 2026-10-24 · Cluster phase decisions

- **Decisions (all Arnav's calls):**
  1. **Lease and membership timings:** a home server renews each lease every 2 s, and a lease expires 6 s after its last renewal. Each server heartbeats into the membership table every 2 s, and a server unheard from for 6 s leaves the ring. The failover pause is about 6-8 s worst case. Rejected: renew 1 s / expire 3 s (a 3 s stall makes a healthy server lose its scripts), and 5 s / 15 s (writers wait 15-18 s after a crash).
  2. **Virtual nodes:** 256 per server, with positions from SHA-1 (Node's built-in crypto, no library). Claude's simulation of 20,000 episodes:
     - 1 vnode leaves one server up to 124% over its fair share, and a dead server's episodes all land on a single survivor.
     - 256 vnodes keep every server within about 9-15% of fair share, and spread a dead server's episodes over every survivor.
     - Only the dead server's episodes move (about 1/N of all episodes).

     Rejected: 128 and 64, which are less even and save nothing at our scale.
  3. **Forwarding:** a WebSocket pipe per forwarded writer. The entry server opens its own WebSocket to the home server's internal address and passes messages through both ways, untouched. The writer's verified identity travels in a header signed with a shared cluster secret (HMAC). Rejected: one multiplexed link per server pair (our own framing and flow control, plus head-of-line blocking), and a raw TCP splice (the entry server can't close a writer cleanly during a handoff).
  4. **What writers see during a failover pause:** they keep typing, and nothing blocks. Edits are kept on the device and merge when the new home is up. The cue reads "Reconnecting…" when the browser is online but the server can't be reached, and "Offline" only when the browser itself is offline. Rejected: reusing "Offline" (misleading when the writer's internet is fine), and pausing editing (it obstructs the writing and buys nothing).
  5. **Fencing:** every edit-log append is one DynamoDB transaction combining "the lease item still names me, with my epoch" and the log write. Snapshots become immutable S3 objects named by epoch and seq. The current snapshot is a pointer item, moved by the same kind of fenced transaction (and only forward), and the log is truncated only after the pointer moves. An outdated owner can't append, can't move the pointer, and so can't truncate.
     - Why the snapshot part matters: a paused server could otherwise overwrite a newer snapshot after the new owner had truncated the log, and edits would be lost.
     - Cost: transactional writes bill at 2x.
     - Rejected: an epoch in every log key with readers filtering (the outdated owner's writes would be acknowledged and then ignored, breaking "acknowledged means durable"), and fencing the log only (it leaves the snapshot overwrite open).
  6. **Entry point:** the client picks a random server from a configured list on every (re)connect. On AWS the list becomes the one load-balancer address. Rejected: a local HAProxy or nginx container (another service to own), and always server 1 (killing it cuts everyone off).
  7. **Client heartbeat:** new protocol messages ping (4) and pong (5). The client pings every 5 s, and if nothing at all arrives from the server for 10 s it drops the socket and reconnects. This rescues writers stuck on a frozen server, the split-brain test's case. Rejected: 2 s / 4 s (needless reconnects on slow networks), and no heartbeat (a frozen server could hold writers for minutes).
  8. **D-020's choices (a)-(g)** are confirmed as Arnav's calls.
- **Timeline:** Phase 1 is well ahead of the week 5-6 checkpoint. Neither cut-list item (rebalancing, virtual nodes) is needed.
- **What changes for writers:** a server can crash, freeze or be replaced while they write. They see "Reconnecting…" for a few seconds, keep typing, and lose nothing.
- **Status:** Arnav's call.

### D-021 · 2026-10-22 · Local services running; storage-backed tests pass; two fixes

- **What happened:** Arnav installed OrbStack, and `docker compose up` started Postgres, DynamoDB Local and SeaweedFS. The 6 storage-backed tests then passed: append order with conditional writes, 900 KB updates in chunks, an incomplete chunk group skipped without reusing its seq, truncation, the S3 snapshot round trip, and a real server process killed with SIGKILL mid-typing with every word recovered from DynamoDB and S3 alone. That closes the gap left in D-020. (Arnav's first `pnpm services:up` ran from his home folder rather than the repo, which is why it said the script didn't exist.)
- **Issue found and fixed (1): SeaweedFS ran out of volumes.** On the second run, S3 PUTs failed with `InternalError`. The logs showed "no free volumes left". SeaweedFS reserves 7 volumes per bucket and allows 8 per server by default, so any second bucket fails, including the app's real `wr-snapshots` alongside a test bucket.
  - Fix: `-volume.max=100 -master.volumeSizeLimitMB=64` in `docker-compose.yml` (volumes aren't preallocated, so no disk is used until written), and the tests now reuse one test table and bucket with per-run document IDs.
  - Options considered: (a) raise the limits; (b) lower SeaweedFS's per-bucket growth count through a master.toml file; (c) one bucket for everything. (a) is a single line and local-only.
  - What changes for writers: nothing; it's development only.
- **Issue found and fixed (2): the sync server could reach real AWS by accident.** Without `.env`, the server had no local endpoints, so the AWS SDK would have used whatever AWS credentials the machine has. It now refuses to start unless storage is explicit: local endpoints (from `.env`), `WR_STORAGE=memory`, or `WR_STORAGE=aws`.
  - What changes for writers: nothing. For the system, an accidental write to a real AWS account (and its bill) can't happen.
- **Status:** fixes made by Claude as part of the approved phase; reported to Arnav.

### D-020 · 2026-10-22 · Sync phase built: one server, durable log, presence, offline

- **What was built:**
  - **`apps/sync`** (Node, `ws`, y-protocols):
    - **Rooms:** one `Room` per episode, loaded on demand from the latest S3 snapshot plus the DynamoDB log tail, and unloaded with a snapshot 30 s after the last writer leaves.
    - **Ordering:** every update-bearing message is processed in order: append to the edit log, wait for the store to confirm, then apply (which broadcasts), then ack `[3][stored]` (D-019).
    - **Failed appends:** nothing is applied or acked, and the socket closes with 4500. The client's reconnect handshake resends the update.
    - **Snapshots:** taken at 1,000 updates, after 2 minutes, and on unload (D-018). The state and its seq are captured together, and the log is truncated below that seq only after S3 confirms.
    - **Edit log layout:** DynamoDB items keyed `docId` plus a zero-padded `seq.chunk` sort key, so updates over the 400 KB item limit are stored as chunks. On load, a chunk group left incomplete by a crash is skipped and its seq is never reused. Every write is conditional (`attribute_not_exists`), which is where the epoch fence goes in the scaled-service phase.
    - **Auth:** dev tokens only with `WR_DEV_AUTH=1`; everything else is refused until Cognito exists.
  - **`packages/shared`:** `PROTOCOL.md`, the protocol constants and close codes, the dev token, and **`SyncClient`**. The client handles the handshake resend (no separate queue), exponential backoff with full jitter, the sent/stored counts, the Offline/Syncing cue, and presence.
  - **`apps/web`:**
    - The episode's Y.Doc is kept on the device with y-indexeddb (D-018). It loads instantly, survives a closed tab while offline, and replaces the D-014 dev store, which is deleted.
    - Co-writers' avatars in the toolbar and "Editing now · …" in the Drafts tab.
    - 2px carets and selection tints in avatar colors, with the caret using the pale color on dark pages. The name shows on hover, and for 1.5 s when a writer starts typing again after a pause.
    - The quiet "Offline" / "Syncing…" cue.
    - Viewport anchoring for remote edits (P4).
    - Per-user undo is unchanged: the Yjs UndoManager tracks only local origins, and a test confirms it.
- **Tests (all passing):**
  - **Node, 10 tests:** two-writer convergence; no broadcast or ack before the append finishes; a failed append that's resent and not lost; 4401 for a bad token; offline merge of 400 edits; kill-and-restart mid-typing with zero lost edits (with an assertion that the crash really lands mid-typing); duplicates (the same update three times plus a full resend, all acked 1-4, text appears once, log replay harmless); snapshots with truncation and restart; idle and time-based snapshots; presence relay and removal.
  - **Browser, 5 new tests:** two apps co-write a scene live, with each other's avatar and caret; per-user undo across writers; the server killed mid-typing loses nothing; offline edits survive closing the tab and merge on restart; both writers edit while the server is down, then merge.
  - **Written but not yet run:** the storage-backed tests (see Open issues).
- **Found while building:**
  1. y-prosemirror queues cursor updates for the next tick, and one can arrive after the editor closes. The editor now ignores dispatches once destroyed.
  2. Yjs anchors a cursor to the character after it, so a writer's cursor doesn't move in Yjs terms while they type. The "name flashes when they start typing" behavior is therefore driven by remote transactions (whose clock advanced), not by cursor changes.
  3. A co-writer's caret label lives inside the line's DOM, so tests read line text without widgets.
  4. Web test files must run one at a time, because real key presses go to whichever frame has focus.
- **Choices made while building, for Arnav to confirm:**
  - (a) Toolbar avatars show co-writers only, and the Drafts tab lists "You" first.
  - (b) "Syncing…" shows only during the reconnect handshake, or after an edit has been unacknowledged for 1.5 s.
  - (c) A brand-new episode gets one empty action line once the server confirms it's empty. If two writers open the same brand-new episode at the same instant, it can start with two empty lines.
  - (d) The dev-only `WR_STORAGE=memory` server mode.
  - (e) `SyncClient` lives in `packages/shared`, so the load-test harness can reuse it.
  - (f) Server timings: a 30 s WebSocket ping for half-open sockets, and room unload 30 s after the last writer leaves.
  - (g) The local copy is keyed per episode per browser profile, so two `?as=` identities in the same browser share it. That's harmless, because Yjs merges, but it's worth knowing when testing.
- **What changes for writers:** they co-write live, see who's here and where they're typing, keep writing through outages and closed tabs, and never lose an edit that the server acknowledged, or one it didn't.
- **Status:** built and tested; awaiting Arnav's review, the confirmation of (a)-(g), and the storage-backed test run once OrbStack is installed.

### D-019 · 2026-10-22 · Ack format amended: count stored updates (supersedes the ack format in D-018)

- **What happened:** while designing D-018's ack ("durable up to clock N for client X"), Claude found that Yjs deletions don't advance a writer's clock: a Backspace produces a delete set, not new numbered items. So a clock-based ack can't confirm that a pending deletion is durable. No edit could be lost either way, because the reconnect handshake always resends the whole delete set. But the status cue could report "saved" a few milliseconds early.
- **Options considered:** (a) count stored updates; (b) a count plus client ID and clock; (c) keep the clock-only ack and accept the blind spot.
- **Decision:** (a). The ack is `[3][stored: varUint]`, the running count of this connection's update-bearing messages (sync step 2 and update) that are now in the DynamoDB log. The server sends exactly one ack per such message, in order, after the append succeeds. The client's unsaved work is sent minus stored. The counts reset on each new connection, and the Yjs handshake resends whatever the server lacks. Documented in `packages/shared/PROTOCOL.md`.
- **Tradeoffs:** (a) is the simplest and covers typing and deletions alike, but it says nothing across reconnects, which nothing needs. (b) adds a per-writer durable marker that has no current use. (c) gives a slightly dishonest status cue.
- **What changes for writers:** "Syncing…" disappears exactly when everything they did, including deletions, is safely stored.
- **Status:** Arnav's call.

### D-018 · 2026-10-22 · Sync phase decisions

- **Decisions (all Arnav's calls):**
  1. **Local services:** Arnav installs OrbStack, and `pnpm services:up` runs the existing `docker-compose.yml` (SPEC 5.1). Rejected: Docker Desktop (heavier, same result); running natively with the DynamoDB Local jar and Homebrew SeaweedFS (departs from SPEC 5.1 and from how CI and AWS will run).
  2. **Ack format:** "saved up to clock N per writer". *Superseded by D-019* the same day: the count of stored updates.
  3. **Snapshot frequency:** snapshot when the log tail reaches 1,000 updates, or 2 minutes after the last snapshot if anything changed, and once more when the last writer leaves. After the snapshot lands in S3, the log below it is truncated. Rejected: every 200 updates (several snapshots a minute in a busy room), and every 10 minutes (a long replay on restart, stretching the failover pause).
  4. **Offline durability (open decision 8):** unsynced edits are kept in the browser's IndexedDB with `y-indexeddb`, the official Yjs add-on, so they survive a closed tab or a dead laptop and merge on reconnect. Rejected: our own store (we'd own its compaction and edge cases), and memory only (a closed tab would lose an offline session).
  5. **Remote carets (SPEC 4.8):** a 2px caret in the co-writer's avatar color and a soft tint of the same color for their selection. Their first name shows in an 11px label above the caret on hover, and for about 1.5 s when they start typing after a pause. Rejected: an always-visible initials flag (clutter in the text), and margin dots only (you can't see where in the line they are).
  6. **Offline cue:** 12px muted "Offline" text right after the draft switcher, with the hover label "Your edits are saved on this device and will merge when you reconnect." It reads "Syncing…" while catching up, and nothing shows while online. Rejected: dimming your own avatar (too easy to miss), and toasts only (nothing persistent while offline).
  7. **Server tooling:** `ws` (Node has no built-in WebSocket server), the AWS SDK v3 DynamoDB and S3 clients, and `tsx` to run TypeScript in dev. Rejected: Node's built-in type stripping (every import would need a `.ts` extension, and enums would be off-limits), and compiling with tsc (a slower loop).
  8. **Dev auth stub (SPEC 5.6):** `?as=Maya` in the URL picks the writer. The stub issues an unsigned token clearly marked DEV, and the server accepts DEV tokens only when started in dev mode. `?ep=` picks the episode (default `dev-episode`). Rejected: a name prompt (a dev-only screen to build and then delete).
- **What changes for writers:** they co-write live and see each other's carets. They can keep writing offline, with edits saved on the device and merged on reconnect, and a quiet cue shows while they're offline or syncing.
- **Status:** Arnav's call.

### D-017 · 2026-10-22 · Empty character cues stay unflagged (D-014 reaffirmed)

- **What happened:** while testing, Arnav deleted the dialogue under a cue and expected a warning. Under D-014's rule, only dialogue or parentheticals with no cue are flagged, so an empty cue gets none. The warning itself was verified working in Chromium and WebKit.
- **Options considered:** (a) also flag cues with no lines, once the cursor leaves the line; (b) flag them immediately; (c) keep the current rule.
- **Decision:** (c), keep the rule. D-014 item 4 stands.
- **What changes for writers:** nothing. A cue left with no dialogue isn't marked; the writer can see it on the page.
- **Rejected:** (a) and (b), more triangles for a case writers can already see on the page.
- **Status:** Arnav's call.

### D-016 · 2026-10-22 · Editor phase built: schema package and Highland UI shell

- **What was built:**
  - **`packages/schema`:**
    - One `block` node with a `type` attribute (D-013).
    - The Enter, Tab and Shift+Tab state machine from SPEC 4.2 plus the D-014 rules. Each action is one transaction marked "structural".
    - Deterministic ID repair: the first copy keeps its ID and later copies become `-2`, `-3`, and so on. It runs in `appendTransaction` after local edits and is deferred after remote changes.
    - Orphan-dialogue detection with "Add character cue" and "Make this action" fixes.
    - Scene listing, combine detection, and navigator names.
    - 64 Node tests.
  - **`apps/web`:**
    - The script screen, pixel-matched to the prototype: toolbar, sidebar with a live Scenes tab and a placeholder Drafts tab, toasts, and the system light/dark theme.
    - The one-button collapse into page view with the true geometry of SPEC 3.8.
    - The editor bound to a Y.Doc through y-prosemirror, with the spike's settings: every block protected from undo deletion, and ID repair deferred after remote changes.
    - The Esc element menu in the margin; warning marks with their popover; the "Scenes N and N+1 combined · Undo" toast; temporary IndexedDB persistence.
    - 12 integration tests in real Chromium.
- **Found and fixed while building** (bugs, not decisions):
  1. Enter inside a parenthetical just before ")" left the cursor behind the ")", so the next line's text went into the parenthetical. A split now always puts the cursor at the start of the new line.
  2. The element menu and warning popover appeared about 100 px too high: ProseMirror's stylesheet makes the editor the lines' offset parent, so `offsetTop` missed the page's 96 px top margin. Overlays are now measured against the page.
  3. Turning a heading-only scene into action wasn't reported as a combine (see below).
- **Deviations, for Arnav to confirm:**
  - (a) SPEC 3.7 says the sidebar's contents fade as it collapses, while the prototype only clips them. The build fades them over the same 240 ms, because the spec wins over the prototype (Part 1, rule 5).
  - (b) The prototype shows "1." on page 1, but SPEC 3.8 says page 1 has no number. The build shows none.
  - (c) The element menu opens with the current type's row aligned with your line, the way a native pop-up menu does.
  - (d) A heading-only scene turned into action counts as "combined", because its line survives inside the previous scene. A scene deleted outright still isn't reported.
  - (e) The placeholders: the title "Untitled script", one presence avatar ("AR", "You"), and toasts for unbuilt controls (D-014 item 11).
- **Measured:** Courier Prime at 16 px is 9.594 px per character (575.6 px per 60), against the ideal 9.6. The D-003 risk is resolved for Chromium. Collapsing and expanding the sidebar leaves every line's position, width, height and line count unchanged on every animation frame (automated test).
- **What changes for writers:** they can write a whole scene from the keyboard. Enter and Tab cover the common flow, Esc opens the menu for anything else (including Shot), every action undoes in one step, and the page looks the same open or collapsed.
- **Status:** built and tested; awaiting Arnav's review and confirmation of (a)-(e) and of D-014 items 9-11.

### D-015 · 2026-10-22 · Workflow: push after every commit; web tests in real Chromium

- **Decision:** (1) after every commit, Claude pushes `main` to GitHub, never force-pushing and never touching other branches. (2) apps/web integration tests use Vitest browser mode driving real headless Chromium through Playwright, the setup proven in the spike. Its dev dependencies (`@vitest/browser-playwright`, `playwright`) move from `spike/` to `apps/web`.
- **Options considered:** for pushing, after every commit, at phase ends only, or ask each time. For web tests, real Chromium, jsdom, or none yet.
- **Tradeoffs:** pushing every commit makes GitHub mirror the laptop, which is good for backup and shows steady progress. Real Chromium starts slower (about 3 s) but measures real layout and key handling.
- **What changes for writers:** nothing. **For the system:** layout promises such as "collapse never rewraps a line" and "undo is one step per action" are guarded by automated tests.
- **Status:** Arnav's call.

### D-014 · 2026-10-22 · Editor details: element menu, spacing, warnings, keys, uppercase, dev persistence

- **Decisions (Arnav's calls, 1-8):**
  1. **Element menu (SPEC 4.3):** Esc opens it when nothing else is open, as a vertical menu in the empty left margin beside the cursor's line, in the menu style. A letter (S A C P D H T) switches the type and closes it; the arrow keys and Enter also work; Esc closes it. Rejected: a one-row bar above the line (it covers the line above), and a margin type label (one more moving thing beside the writing).
  2. **Spacing before scene headings (SPEC 3.8):** two blank lines, matching the prototype. Rejected: one blank line.
  3. **Formatting warnings (SPEC 4.5):** a small hollow triangle in muted red in the left margin, with a popover offering "Add character cue" and "Make this action". Rejected: a dotted underline (it marks the writing) and a ghost cue (it takes a line and shifts page breaks).
  4. **Warning rule:** a dialogue or parenthetical with no character cue above it, the start of a dialogue run that doesn't begin with a cue. Rejected for now: also flagging a cue with no lines.
  5. **Key gaps (SPEC 4.2), FD-style:**
     - Enter on an empty line changes it in place: Action → Scene Heading; Character, Dialogue, Scene Heading, Transition and Shot → Action; Parenthetical → Dialogue.
     - Tab: Parenthetical → Dialogue; empty Transition → Scene Heading; anywhere else Tab does nothing.
     - Shift+Tab steps back: Character → Action, Parenthetical → Dialogue, Transition → Character.
     - A new parenthetical starts as "( )" with the cursor inside.
     - Backspace is standard: it joins with the line above, and removes an empty line.

     Shot is reachable through the element menu. Rejected: SPEC rules only (more menu use), and Enter on an empty line opening the menu (an extra step in every scene).
  6. **Uppercase:** scene headings, characters, shots and transitions are shown in capitals through CSS (and later in pagination and PDF), while the stored text keeps the writer's casing. Rejected: converting as you type, because type changes would become text rewrites, which the spike showed are unsafe with co-writers.
  7. **Phase naming:** Arnav's phase prompts call this "phase 2". It's the editor-core part of SPEC Part 6's Phase 1 (the sync service follows). The log uses "editor phase" for it.
  8. **Dev-only persistence:** a small hand-written IndexedDB store of the Y.Doc's state, following Arnav's example in the phase prompt. There's no new library. It's clearly marked temporary, to be replaced by the sync server. Not chosen: `y-indexeddb`, a new dependency that would prejudge open decision 8 (offline durability across reloads).
- **Claude's choices while building, awaiting Arnav (9-11):**
  9. **Structural actions get their own undo step.** Enter, Tab, Shift+Tab, menu picks, warning fixes and scene-combine undo each close the current undo group before and after. Otherwise Yjs's 500 ms grouping would merge a quick Enter with the typing around it, breaking "undo is one step per action". Typing runs still group as usual.
  10. **Navigator names come from headings,** as in the prototype ("INT. KITCHEN – MORNING" shows as "Kitchen – Morning"). The INT./EXT. prefix is dropped and the words are title-cased; an empty heading shows "Untitled scene".
  11. **Placeholder controls** (back, Share's items, + New what-if, + Snapshot, the draft switcher) show a short toast saying when the feature arrives, as the prototype does for unwired items.
- **What changes for writers:** the whole scene can be written from the keyboard: Enter and Tab for the common flow, and Esc for the element menu (the only route to Shot). Warnings appear only after merges and never cover text. Capitals look right without changing what you typed.
- **Status:** 1-8 are Arnav's calls; 9-11 are Claude's proposals, awaiting Arnav.

### D-013 · 2026-10-22 · Spike approved: P1-P4 adopted, spike deleted

- **Decision:** Arnav approved all four spike proposals from D-012, as recommended:
  - **P1:** the element type is an attribute on one `block` node.
  - **P2:** split degradation is accepted for v1.
  - **P3:** fix-ups after remote changes run as a deferred, deterministic local transaction.
  - **P4:** the viewport is anchored to the cursor's block.

  The two required settings are adopted with them: protect every block type from undo deletion, and recompute every decoration from the document. SPEC 4.1 and 4.6 are updated to say so. `spike/` is deleted (its line in `pnpm-workspace.yaml` and its ESLint entry go too). `docs/spike-report.md` stays as the record, and the spike code remains in git history (commit 7138ce8).
- **Options and tradeoffs:** see D-012 and the report.
- **What changes for writers:** type changes, offline merges and co-writers' edits never lose text; your view holds still while others edit above you.
- **Still proposed:** the performance budget from D-012 (see Proposed).
- **Status:** Arnav's call.

### D-012 · 2026-10-20 · Spike outcome: Yjs passes, with four design changes

- **What happened:** the 2-3 day spike ran all 8 tests from the spike plan. It used real headless Chromium with real key presses, two simulated clients, and both schema variants, for 56 test cases. All passed under the design proposed below. Full results, evidence and limits are in `docs/spike-report.md`.
- **Proposal:** keep Yjs 13.6 + y-prosemirror 1.3.7. Loro and prosemirror-collab are not needed, so SPEC 4.9's offline promise ("edits made offline merge on reconnect, no length limit") stands. Adopt:
  - **P1. Element type as an attribute.** One `block` node with a `type` attribute (`scene_heading`, `action`, …) instead of one ProseMirror node type per element.
    - Options: (a) attribute; (b) node types, as SPEC 4.1 reads literally; (c) node types plus custom binding code.
    - Tradeoffs: (a) is safe under concurrency, but per-type rules live in our code rather than in the schema. (b) is idiomatic ProseMirror but loses data. (c) means maintaining a fork of y-prosemirror's diffing.
    - Writers: with (b), pressing Tab while a co-writer types in that line silently deleted the co-writer's words (test 3), and 12% of edits were lost in a long offline merge (test 4). With (a), nothing is lost.
  - **P2. Accept the split degradation for v1.**
    - Options: (a) accept it; (b) a custom split that keeps the original element for the half where a remote cursor sits (about 1-2 days).
    - Writers: if you split the exact line a co-writer is typing in, their new words may land on the first half and an in-progress word can tear across the two lines. Nothing is ever lost. (b) only moves the problem to the other half.
  - **P3. Fix-ups after remote changes run as a deferred, deterministic local transaction.**
    - Options: (a) a deferred transaction; (b) one elected client repairs; (c) the server repairs.
    - Why it's needed: y-prosemirror drops transactions appended during a remote change, which made the clients' documents diverge in test 3.
    - Writers: nothing visible. Without the fix, screens could silently disagree.
  - **P4. Viewport anchored to the cursor's block.**
    - Options: (a) the cursor's block; (b) the browser's built-in anchoring.
    - Writers: with (a), your line moved 0 px through six kinds of remote edit above you. With (b) it moved about 32 px whenever a page break reflowed.
  - **Required settings (no real alternative):** protect every block type in the undo manager, because under the default, undoing a split deleted a co-writer's text (test 6); and recompute every decoration from the document, keying position-based features by block ID, because mapped decorations vanish on every remote change (test 5).
  - **Proposed performance budget:** a regression test failing if p95 local keystroke or remote update exceeds 16 ms on a 110-page script. Measured: p95 8.0 ms and 3.5 ms.
- **Rejected, from the user's point of view:** node types per element (it eats co-writers' words); Loro and prosemirror-collab (not needed, since Yjs passed); the browser's built-in scroll anchoring alone (your line still jumps when pages reflow).
- **What changes for writers:** nothing they'd notice, which is the point. Typing, Tab, offline work, undo, Send to main and page breaks all behave as SPEC describes, under concurrency. **For the system:** SPEC 4.1 (how element types are stored) and SPEC 4.6 (when the ID plugin runs) change once approved, along with three rules for all future editor code (F2, F3, F4 in the report).
- **Status:** Claude's proposal, awaiting Arnav.

### D-011 · 2026-10-20 · Spike test harness: real Chromium

- **Decision:** the spike's 8 tests run in Vitest browser mode, driving headless Chromium through Playwright, with real keyboard input. There's also a two-editor demo page Arnav can open and try. `playwright` and `@vitest/browser-playwright` are installed in `spike/` only and leave with it.
- **Options considered:** (a) real Chromium for all 8 tests; (b) jsdom for the convergence tests plus separate Playwright scripts for tests 5 and 7; (c) jsdom only.
- **Tradeoffs:** (a) is one runner with real layout, real input events and real timing, but slower to start and needs a Chromium download of about 150 MB. (b) gives the same evidence with two setups. (c) is fastest but has no layout, so it can't measure cursor and viewport stability or real typing cost.
- **What changes for writers:** nothing directly. The spike's verdict on "your view doesn't jump" and "typing stays fast" is measured in a real browser, not simulated. **For the system:** the evidence is trustworthy.
- **Rejected:** (b) adds a second setup for the same evidence; (c) can't answer tests 5 and 7.
- **Status:** Arnav's call.

### D-010 · 2026-10-20 · Spike binding: stable y-prosemirror

- **Decision:** the spike tests `yjs` 13.6.33 with `y-prosemirror` 1.3.7, the stable line, against ProseMirror's current 1.x packages.
- **Options considered:** (a) the stable line; (b) the `@y/prosemirror` 2.0 pre-release rewrite on the Yjs 14 beta; (c) both, stable first, then tests 2 and 5 again on the rewrite.
- **Tradeoffs:** (a) is mature and widely used, but in maintenance mode, with no release since July 2025. (b) is future-facing, but a pre-release whose API could still change. (c) costs about half a day more.
- **What changes for writers:** nothing directly. They get the editor binding that's most likely to behave the same tomorrow as it does today. **For the system:** v1 builds on a proven base. Moving to the rewrite later would be a separate decision with its own tests.
- **Rejected:** (b) for the risk of the API changing under us; (c) wasn't needed for the go/no-go call.
- **Status:** Arnav's call.

### D-009 · 2026-10-20 · Confirmations: tooling defaults and revision colors

- **Decision:** (1) every D-006 tooling default is confirmed, with TypeScript 6.0.3 rather than 7.0 as the headline. (2) The two D-005 readings are confirmed: revision colors after sends (Hollywood page colors and margin asterisks) are out of v1, and the prototype's "BLUE" snapshot tag is not built.
- **Options considered for revision colors:** (a) all future, matching SPEC; (b) margin asterisks in v1 with colors later; (c) everything in v1.
- **Tradeoffs:** (a) keeps Phase 3 at its planned scope. (b) is cheap, because it's built from the diff we already compute, but it's still added scope. (c) adds the most scope and contradicts SPEC Part 2.
- **What changes for writers:** in v1, writers find out what changed through Changes, Compare and the margin dots, not through revision colors. **For the system:** no revision-color state on snapshots in v1, though the snapshots table can take a tag later.
- **Note:** Arnav found the first framing of the D-005 question unclear, because it pointed at item numbers instead of saying what would change. From now on, questions are asked in plain terms first.
- **Rejected:** (b) and (c), as added scope with no v1 need.
- **Status:** Arnav's call.

### D-008 · 2026-10-20 · The repo is on GitHub

- **Decision:** the local repo's remote `origin` is https://github.com/arnavsabat/writers-room, a public repository that Arnav created through the GitHub website. `main` is pushed to it.
- **Options considered:** (a) Arnav creates the repo on github.com and Claude adds the remote and pushes; (b) install the GitHub CLI (`gh`) so Claude can create repos and open pull requests itself. On visibility: public now, or private until the spike passes.
- **Tradeoffs:** (a) needs no new tools, but pull requests have to be opened in the browser. (b) adds a tool to Arnav's machine. A public repo is visible to recruiters from day one, but so is half-finished work.
- **What changes for writers:** nothing. **For the system:** the code and this log are backed up off the laptop and can be shared, and CI can be added later (that would be its own decision).
- **Rejected:** (b) for now, because nothing needs `gh` yet. It can be revisited when pull requests or CI come up.
- **Status:** Arnav's call (Arnav chose the website route; the repo was created public).

### D-007 · 2026-10-20 · Issue: local services can't run yet on the dev machine

- **What happened:** Phase 0 setup found no container runtime and no global pnpm on Arnav's Mac. `docker-compose.yml` is written but has not been started. All other Phase 0 checks (format, lint, typecheck, tests, web build) ran through `corepack pnpm` and pass.
- **Options:** (a) Arnav installs a container runtime (Docker Desktop, OrbStack or Colima) and runs `corepack enable`; (b) Claude installs them. Not chosen: (b), because changing global software on Arnav's machine is Arnav's call.
- **What changes for writers:** nothing. **For the system:** the Postgres, DynamoDB Local and SeaweedFS containers are unverified until a runtime exists. They're needed from Phase 1.
- **Status:** open issue. Arnav's action.

### D-006 · 2026-10-20 · Phase 0 tooling defaults

- **Decision:** the conventional defaults for the scaffold, listed so none of them is silent:
  1. **TypeScript 6.0.3**, not 7.0.2. TS 7 (the native Go compiler) is about 10x faster, but typescript-eslint supports only `<6.1`, so TS 7 would cost us type-aware linting.
  2. **pnpm 12.12.1**, pinned through `packageManager` and run through corepack, so everyone uses the same pnpm without a global install.
  3. **Node 24.12** (the LTS release installed here), pinned in `.node-version` and `engines`.
  4. **Compiler settings:** `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax` and `isolatedModules`. Module resolution is `Bundler`. Workspace packages export their TypeScript source directly (no build step between packages). `types` is empty by default, so `packages/schema`, `packages/pagination` and `packages/shared` can't accidentally use Node or DOM APIs: they have to run identically in the browser and on the server. Tests that need Node get their own `test/tsconfig.json`.
  5. **ESLint 10** flat config: `@eslint/js` recommended, typescript-eslint `recommendedTypeChecked`, React Hooks rules for the web app, and `eslint-config-prettier` so formatting is Prettier's job alone.
  6. **Prettier** with print width 100 and single quotes. `docs/` and `CLAUDE.md` are excluded, so the verbatim spec, this log and the prototype are never reformatted.
  7. **Vitest 5** with one project per workspace folder, so the web app can later use a DOM environment while the packages stay on plain Node.
  8. Packages are named **`@wr/*`**, which is short and survives a product rename.
  9. **Postgres 18.6, DynamoDB Local 3.3.1 and SeaweedFS 4.48** in compose, all pinned to exact versions.
  10. **tokens.css** also holds the avatar pairs (`--avatar-N-bg/fg`, the same in both themes, as in the prototype) and the two font stacks (`--font-ui`, `--font-script`). Hex values are lowercase and `.05` is written `0.05` (Prettier's style). The colors are identical, and `packages/shared/test/tokens.test.ts` checks every value against SPEC 3.1.
  11. The token test reads `tokens.css` from disk, because Vitest replaces CSS imports with an empty string.
- **Tradeoffs:** all are mainstream and easy to reverse. The main cost is TS 6's slower type checking until we move to 7.
- **What changes for writers:** nothing. **For the system:** consistent tooling. The shared packages are kept environment-neutral, which is what lets pagination run identically everywhere.
- **Rejected:** TS 7 (loses type-aware lint, see above); a global pnpm install (machine-specific drift); Tailwind (excluded by SPEC 5.1).
- **Status:** Claude's proposal, awaiting Arnav.

### D-005 · 2026-10-20 · Reconciling the imported log with SPEC.md

- **Decision:** SPEC.md wins over older entries. These imported items are superseded. The original text stays below, unedited.
  1. *Merge review layout A* (a scene list plus the full screenplay view) and *"Review all opens the batch review screen (layout A)"* → Review all is a dropdown under its icon, and conflicts go through the Compare panel (SPEC 3.9). A full-screen merge dialog is permanently rejected.
  2. *"Keep main (pre-selected) or Use branch version" per conflicted scene* → amber scenes open Compare, whose one action is "Send mine to main". Not sending keeps main. The no-blending rule still holds.
  3. *"One click undoes the whole merge"* → Undo reverts only the scenes that send touched, and warns if a sent scene was edited since (SPEC 3.9; this matches the confirmed October 20 item).
  4. *A history button in the toolbar* (the Arc split list) → permanently rejected (SPEC Part 2).
  5. *Sidebar slide of about 200 ms* → 240 ms ease (SPEC 3.7).
  6. *The unlink-page-view escape hatch* → permanently rejected.
  7. *Text-styled toolbar items, "Review all goes bold when active", Share styled like the Drafts tab* → toolbar items are icon buttons that never bold (SPEC 3.4, 3.5; the imported "Toolbar rework" entry had already superseded these).
  8. *"Send to main appears beside changed scenes only while Changes is on"* → margin dots show whether Changes is on or off, and the Changes toggle only controls inline highlights (SPEC 3.9).
  9. *Sizing tiers: 16 px muted icons; Send to main and Compare as 12 px inline actions* → 18 px icons in 32x28 slots; the draft switcher at 13 px in the icon color; Send to main and Compare are 13 px popover menu items (SPEC 3.3, 3.9).
  10. *Writer-facing name "Bring back to main"* → "Send to main".
  11. *Phase 2 = "pagination and roles"* → Phase 2 = accounts, roles and home, pagination, page view, PDF and import (SPEC Part 6).
  12. *Revision colors after merges (Hollywood colors, asterisks in the margin), confirmed October 20* → SPEC lists revision colors only as future work, so this is treated as out of v1. **Claude's reading, awaiting Arnav.**
  13. *Home page "+ New series"* → the home toolbar has + New script, and the series header has + New episode (SPEC 3.5, 3.10).
  14. *"Still undecided: AWS services, authentication"* → resolved by the October 20 pre-build decisions and SPEC 5.5-5.6.
  15. *Timeline of 7-9 weeks* (Known risks) → 8.5-10.5 weeks after the spike.
  16. *The prototype's "BLUE" tag on a snapshot row* → not built, since revision color tags on snapshots are a future version. **Claude's reading, awaiting Arnav.** (The prototype's unused `sheetOld()` review dialog and `.shade` backdrop are likewise leftovers and won't be built.)
- **What changes for writers:** nothing new. This only records which version of each idea is current.
- **Status:** Arnav's call (via SPEC.md), except items 12 and 16.

### D-004 · 2026-10-20 · Local S3-compatible store: SeaweedFS

- **Decision:** docker compose runs SeaweedFS 4.48 (with its S3 gateway on port 8333) as the local stand-in for S3 snapshot storage.
- **Options considered:** SeaweedFS; Adobe S3Mock; Garage. Ruled out because they're no longer usable: MinIO (the community edition's Docker images were removed and the repository archived in 2026) and LocalStack (an auth token is required since 2026.03.0).
- **Tradeoffs:** SeaweedFS is Apache 2.0, a single container, actively maintained, and a real persistent S3 API. It's a little heavier than a mock. S3Mock is lighter but less faithful. Garage is faithful but needs a bootstrap step and is AGPL.
- **What changes for writers:** nothing; it's development only. **For the system:** snapshot and compaction code is tested against a real object store locally, and production uses AWS S3 through the same SDK calls (only the endpoint changes).
- **Rejected, from the user's point of view:** MinIO and LocalStack would break or complicate first-time setup for anyone cloning the repo. S3Mock could hide snapshot bugs that would then surface in production as lost or unreadable snapshots. Garage adds setup friction with no benefit at our scale.
- **Status:** Arnav's call.

### D-003 · 2026-10-20 · Technical pivot: true screenplay page geometry (SPEC 3.8)

- **Decision:** keep every visual detail of the prototype, but replace its approximate page (612 px wide, 16 px type at line-height 1.15, about 45 characters per action line) with true screenplay geometry at 96 CSS px per inch:
  - US Letter, 816 x 1056 px; Courier Prime at 16 px with a 16 px line height (6 lines and 10 characters per inch); margins of 1.5 in on the left and 1 in on the other sides.
  - Element positions: scene heading, action and shot at 1.5 in, 6 in wide; character at 3.7 in; parenthetical at 3.1 in (about 2.4 in wide); dialogue at 2.5 in (3.5 in wide); transitions right-aligned to 7.5 in.
  - One blank line between elements. Page numbers at top right, 0.5 in from the top, formatted "12."; page 1 is unnumbered.
- **Options considered:** (a) true geometry; (b) the prototype's approximate geometry; (c) true geometry scaled down to fit narrower screens.
- **Tradeoffs:** (a) is about 60 characters per action line and about 54-55 lines per page, matching Final Draft and Highland, so page counts mean what writers expect ("a page is a minute"), and PDF export matches the screen. It costs a wider page: 816 px plus the 300 px sidebar is about 1,120 px, which is why the sidebar auto-collapses when Compare opens on narrow screens. (b) would make page counts wrong by about 25%. (c) breaks the "identical geometry, no rewrap" rule between views.
- **What changes for writers:** pages, page counts and line breaks match industry tools and the exported PDF exactly. **For the system:** pagination can count characters instead of measuring the DOM (SPEC 5.8), because the column widths are fixed character counts (60 for action, 35 for dialogue).
- **Rejected, from the user's point of view:** (b) gives wrong page counts, which a writer submitting to a contest or producer would notice immediately. (c) would make lines jump when the sidebar toggles.
- **Status:** Arnav's call.

### D-002 · 2026-10-20 · Stack and infrastructure

- **Decision** (consolidates the October 20 pre-build decisions in the imported log, as written into SPEC 5.1 and 5.5-5.7):
  - A pnpm monorepo, strict TypeScript everywhere: `apps/web` (React + Vite, plain CSS on the Part 3 tokens), `apps/sync` (a custom Node WebSocket server on y-protocols; Hocuspocus as a reference only), `apps/api` (Fastify), `packages/schema`, `packages/pagination`, `packages/shared`, `infra` (CDK), `tools/loadtest`.
  - Postgres for relational data; DynamoDB (on demand) for the edit log, leases and membership, with conditional writes for fencing; S3 for compacted snapshots.
  - AWS, lean: S3 + CloudFront, one small always-on ECS Fargate container for beta, a small Postgres, and CDK. Budget alarms at about $20 and $40 a month before the first deploy. The multi-node cluster is spun up only for load tests and demos. Use the Paid account plan, never the Free plan. Never Lambda with API Gateway WebSockets.
  - Auth: Amazon Cognito with our own sign-in screen (email one-time codes plus Google, no passwords), and JWTs verified by the API and sync servers. A clearly marked development auth stub until Cognito exists.
  - PDF generated in the browser from the pagination output; .fdx and Fountain import in v1, export later.
  - Local development: docker compose with Postgres, DynamoDB Local and an S3-compatible store (D-004), able to run 3 sync nodes (added in Phase 1).
- **Options considered and rejected:** see the imported "Pre-build decisions (October 20)" section: Next.js, Svelte, Hocuspocus's broker model, Rust or Go servers, FastAPI, DynamoDB for relational data, a Postgres-based log, Kafka or Kinesis, Redis locks, etcd or ZooKeeper, redirect-based routing, full always-on AWS, Lambda WebSockets, Clerk or Auth0, building our own auth, browser print-to-PDF, server-side headless Chrome.
- **What changes for writers:** nothing directly. They get a fast web app that keeps working through server failures. **For the system:** one language end to end, and the sync layer (home servers, leases, fencing, durable log) is our own code.
- **Status:** Arnav's call.

### D-001 · 2026-10-20 · The decision log moves into the repo

- **Decision:** the log lives at `docs/decision-log.md`, the spec at `docs/SPEC.md` (Parts 2-6 of the project prompt, verbatim), and the working rules at `CLAUDE.md` (Part 1 plus a condensed Parts 2-5). SPEC.md overrides older log entries. The log is updated the moment any decision, pivot, issue, blocker or deviation happens, and history is only ever superseded, never deleted.
- **Options considered:** (a) in the repo; (b) keep it in chat exports or a separate doc.
- **Tradeoffs:** (a) is versioned with the code, so every commit shows which decision it implements, and Claude can keep it current automatically. (b) drifts from the code.
- **What changes for writers:** nothing. **For the system:** a reviewable history that doubles as interview prep.
- **Status:** Arnav's call.

---

## Imported log (exported October 19-20, 2026, kept verbatim)

The text below is the exported planning log, unchanged except that each heading moved down two levels so it nests under this section. Where it conflicts with SPEC.md, SPEC.md wins (see D-005).

### Writers' Room Tool: Project Log

Running log of what the project is, what's in scope, and every decision made. Last updated: October 19, 2026.

#### What it is

A real-time collaborative screenwriting tool built like a writers' room, with its own polished UI (fast and clean like Highland, with Arc Studio Pro as the reference for other features), role-based collaboration, scene-level branching, and a horizontally scaled sync service. An AI continuity checker is planned for a future version. Arnav is involved in all major design and technical decisions and needs to understand how every piece works. Claude writes the code.

#### Decided

**Project choice**

- Writers' room tool chosen as the resume project.
- UofT course-alert idea dropped (against UofT policy).

**Product feel**

- Own UI for production-ready polish. The main writing page and menus are modeled on Highland's fast, clean design (Arnav's call): light, minimal chrome, the script as the focus, and a plain scene navigator sidebar. Other features take design inspiration from Arc Studio Pro (Arnav's call).
- Strict screenplay formatting is in scope: element types (Scene Heading, Action, Character, Parenthetical, Dialogue) with Enter/Tab switching the next line's type.
- Collaborative page layout is in scope: page breaks recalculate across all users' screens without jarring anyone's view.

**Continuity checker**

- Moved out of v1 to a future version (Arnav's call): no AI engineering in v1, and a better way to integrate AI may be clearer by then.
- When it returns, the planned starting set is state, knowledge, presence, name/relationship and scene-heading checks. Motivation and tone stay out, and the timeline checker stays on hold.
- v1 keeps the seams: the series, episode and scene data model with stable scene IDs.

**Roles and permissions**

- Three roles: Showrunner, Writer, Viewer.
- Writers are assigned to episodes. A Writer edits assigned episodes and reads the rest.
- An episode can have several writers editing at once (Arnav's call). An episode's writer can add any existing series member as a co-writer. The showrunner sees every assignment and can remove anyone, and only the showrunner invites new people into the series. Whoever creates a series is its showrunner, so small teams just work.
- Every writer on an episode can merge into it without approval.
- Merge conflicts are expected to be rare: co-writers will usually coordinate and take different scenes in their what-ifs (Arnav's read). The main exception is sweeping edits like renaming a character across many scenes, so the conflict screen stays simple rather than heavily polished.
- Out of v1: cross-episode proposals (design the model so they slot in later) and scene-level locks.

**Scope cuts**

- Pitch voting and beat board skipped for now.

**Data model**

- Schema designed for a full series (bible, cross-episode facts) from day one; v1 ships episode-level only.

**Stack**

- ProseMirror + Yjs for editor and sync, gated by a 2-3 day spike. Fallbacks if the spike fails: Loro, then prosemirror-collab.
- Offline under the last fallback (Arnav's call): if both Yjs and Loro fail and prosemirror-collab is used, v1's offline promise shrinks to "brief disconnects never lose work," stated honestly. In plain terms: it only matters in an unlikely double failure, and it avoids building a custom sync layer.

**Branching**

- Scene-level merge: the writer chooses which scenes to bring from a branch back into main. Each merge block is one scene.
- An automatic restore point is saved before every merge, and one click undoes the whole merge.
- When a scene changed on both the branch and main, the writer picks one version per scene: Keep main (pre-selected) or Use branch version. Text inside a scene is never blended automatically.
- The merge UI must be really easy and simple; this is a priority.
- Merge review layout A (Arnav's call): a scene list on the left and the full screenplay view with inline highlights.
- Scenes that combine or split (Arnav's call): deleting a heading reads as "that scene removed, the previous scene changed," and typing a new heading mid-scene reads as "scene changed, new scene added." A what-if that edited a folded-away scene becomes a removed-versus-edited conflict under the pick-one rule, so no new rules are needed. Deleting a heading shows a "Scenes 14 and 15 combined · Undo" notice to catch accidents.

**Phasing and systems depth**

- Phase 1 now includes a horizontally scaled sync service: multiple sync servers, cross-server sync for the same script, durable saving with history compaction, and load tests. Deployed on AWS.
- Why, in plain terms: the features stay the same and writers notice nothing in normal use. A server crash no longer drops everyone's session, and the project becomes a distributed system with measurable numbers (concurrent editors, p95 sync latency, zero lost edits when a node fails). Without it, phase 1 reads as "integrated Yjs into an editor."
- Cost: about 1-1.5 extra weeks, so phase 1 lands around week 5-6.
- New phasing: (1) editor, element state machine, Yjs sync, scaled sync service, load tests; (2) pagination and roles; (3) branching with the merge UI. The continuity pipeline moved to a future version.

**How sync servers share a script**

- Decision (Arnav's call): each script has one home server. A routing layer using consistent hashing sends everyone editing that script to its home, and another server takes over from the latest snapshot and edit log if the home dies.
- Why, in plain terms: one copy per script, no central broker, and one place to save and enforce permissions. Scaling means adding servers and moving scripts. Consistent hashing, ownership leases and failover are what big-tech interviews probe. Writers notice no difference from the alternative in normal use.
- Downsides and planned workarounds (proposed):
  - Two servers briefly both think they own a script during failover. Ownership is a lease renewed every few seconds, a new owner waits for it to expire, and each save carries a fencing token so storage rejects an outdated owner. Yjs merging is the safety net. Remaining: a pause of a few seconds for writers.
  - Unsaved edits lost when a server dies. Every edit is written to a durable log before it's confirmed, and clients resend unconfirmed edits on reconnect (duplicates are ignored). Remaining: none, which makes zero lost edits a load-test claim.
  - Reconnect surge when a server dies. Randomized retry delays, and virtual nodes spread the dead server's scripts across many servers. Remaining: a brief load spike.
  - One script can't be split across servers. Not needed: a room is roughly 5-15 people per script.
  - Moving scripts when servers are added. Consistent hashing moves only a small fraction, with graceful handoff and idle scripts first.
- Cost: about 1.5-2 weeks, the top end of the extra time budgeted for the scaled sync service.

**Formatting enforcement**

- Decision (Arnav's call): a permissive schema with visible fixes. While typing, the Enter/Tab state machine guarantees correct formatting. If simultaneous edits or an offline merge break a rule (for example, dialogue left with no character), the spot is marked inline with a one-click fix: insert a character cue or convert the line to action.
- Why, in plain terms: no text is ever lost, and the writer sees the problem immediately. Writers only meet this after simultaneous edits to the same spot, never during normal typing.

**Real users**

- Decision (Arnav's call): a closed beta only, starting after phase 2 and after Arnav's own thorough testing. Recruit roughly 5-10 writing pairs or small rooms from UofT film and screenwriting clubs, Toronto film programs, and online screenwriting communities.
- Why, in plain terms: with the AI checker gone, resume numbers come from load tests and real users. A closed beta gives real feedback and usage numbers with a support load that fits a semester. Phase 2 is the start point because pagination is what makes it feel like a real screenwriting app.
- Measurement (proposed): count events only, never script content, because a writer's unproduced script is their intellectual property. Track writers and scripts, sessions with two or more people writing at once, what-ifs created and scenes brought back, and weekly return rate.

**Phase 1 checkpoint and cut order**

- Decision (Arnav's call): a hard checkpoint at the end of week 6 after the spike passes. If phase 1 isn't done, cut in this order instead of extending: (1) rebalancing when servers are added, so v1 runs a fixed number of servers; (2) virtual nodes for the reconnect surge, accepting a brief load spike; (3) autocomplete for character names and scene headings; (4) long offline sessions, shrinking the promise to brief disconnects.
- Never cut: the Enter/Tab element editor, zero lost edits (durable log and client resend), failover with leases and fencing tokens, and the load tests.
- Why, in plain terms: a slip never turns into an open-ended delay, and the cuts go cheapest loss first while protecting everything the project's story depends on.

**Writing page and Arc-inspired features**

- Decision (Arnav's call): the look and feel should be almost exactly like Highland, first and foremost, and the entire project should look and feel effortless. Arc Studio features are adopted only where they fit that style, and anything out of scope or beyond basic v1 UI goes to a future version.
- Arc features Arnav likes: a hidden left sidebar listing scenes to jump to; minimal Script, Beats and Outline tabs; scenes shown as cards like Arc's Beats page; drag-and-drop scenes; and a minimal pop-up element menu with single-key shortcuts (Scene, Action, Character, Parens, Dialogue, Shot, Transition).
- Confirmed split. v1: the hidden scene navigator with jump-to-scene, in Highland's plain style; the element menu with shortcuts, adding Shot and Transition as element types; a Highland-style draft switcher for what-ifs; presence avatars and a history button. Future: the Beats tab with scene cards and card drag-and-drop, the Outline tab, and dragging scenes in the navigator.
- Dragging scenes is on the backburner (Arnav's call) because moving a scene in a live shared script is a delete and re-insert under the hood: a co-writer typing inside that scene during the move could lose their edit, and two people moving the same scene at once could duplicate it.
- Bringing scenes back into main gets our own innovative, effortless design regardless of what Arc does (Arnav's call).
- Clarification: Highland is a plain-text app built on Fountain markup. We copy its look and speed, not its plain-text model, because sync and scene-level merging depend on typed blocks.

**What-if navigation**

- Decision (Arnav's call): what-ifs work like Arc Studio's Drafts panel, restyled to Highland's plain look. A Drafts tab sits beside Scenes in the sidebar, with main at the top showing who's editing, what-ifs below, and snapshots listed. A breadcrumb switcher ("Main › Darker ending ▾") at the top of the page moves between them.
- Going beyond Arc (Arnav especially liked this): a Changes toggle shows a what-if's differences from main inline, and each changed scene gets a small "Send to main" beside its heading, with a toast and Undo. The review screen (layout A) is only for batches and conflicts.
- Why, in plain terms: merging happens right where the writer is already looking, in one click, with Undo as the safety net instead of a separate review step.
- Proposed: what-ifs fork from main only in v1 (no what-if of a what-if), so every merge is "this version versus main"; a manual Snapshot button alongside the automatic restore points; color tags on snapshots as the landing spot for revision colors.
- Arc's Comments and Notes tabs: future versions.

**Sidebar collapse and page view**

- Decision (Arnav's call): the left sidebar collapses smoothly, and collapsing it switches the page to an industry-standard screenwriting look: real paginated pages on a gray background, standard margins, page numbers at top right, and (MORE)/(CONT'D) at page breaks. With the sidebar open, the page stays in Highland's clean continuous view.
- Proposed motion: the sidebar slides out over about 200 ms and the script re-centers onto pages while staying anchored to the scene you were on, so you never lose your place.
- Proposed escape hatch: if writers ever want pages with the sidebar open, a view setting can unlink the two. Linked stays the default.
- Toolbar style (Arnav's call): toolbar labels such as "Review all" and "Changes" use the same plain styling as the sidebar's Scenes and Drafts tabs.
- Toolbar contents inside a what-if: "Review all" opens the batch review screen (layout A) for sending several scenes at once and resolving conflicts. The Changes toggle shows or hides the inline differences from main, and "Send to main" appears beside changed scenes only while it's on, so the writing view stays clean when it's off.
- Proposed: drop the separate history icon from the toolbar, since snapshots and restore points already live in the Drafts tab.

**Making collapse feel effortless**

- Goal (Arnav's call): the open view and the collapsed page view should feel like one surface, so collapsing is a small, calm change rather than a jump.
- Proposed approach, shown in the clickable prototype on the design canvas: (1) the script uses exact page geometry in both views (12-point Courier, page-width text column, standard indents), so not a single line rewraps; (2) in the open view the page is white on white, so its edges are invisible; (3) on collapse, the sidebar's gray spreads to become the desk around the page, the page's shadow and page number fade in, and the script slides to center; (4) the toolbar never changes. Reduced-motion settings turn the animation off.
- "Review all" (Arnav's call): goes bold when active, matching the selected sidebar tab.

**Control sizing system**

- Rule (Arnav's call): controls are sized by importance, and controls with similar functions always share one size. Share matches the Drafts tab, and so does every control added later.
- Tiers: (1) the script title, 15 px semibold, the only element at that size; (2) every toolbar and sidebar control (Scenes, Drafts, Review all, Changes, Share, the draft switcher, + New what-if, + Snapshot), 13 px in muted gray, turning dark and bold when active; (3) inline actions inside the script (Send to main, Compare), 12 px; (4) metadata such as timestamps and counts, 12 px muted; (5) section labels, 11 px capitals. Icons are 16 px muted. Navigator scene names are content, not controls, at 15 px.
- Blue is reserved for active-tab underlines, toggles, and the Send to main action.
- Why, in plain terms: the eye reads one consistent family of controls, so nothing looks out of place, and importance comes from the tier rather than one-off styling.

**Toolbar items and text actions**

- Rule (Arnav's call): every item in a toolbar is the same size. Review all, Changes and Share each sit in an identical 28 px-tall slot with the same padding, and the Changes toggle is scaled down so its item matches the text items.
- Rule (Arnav's call): clickable text that opens a feature (Review all, Share, + New what-if, + Snapshot, Compare) turns bold when clicked. Actual buttons (the Send to main pill, toggles, the draft switcher, filled primary buttons) keep their own pressed states and never bold.
- Rule (Arnav's call): the bold goes away after the click wherever that makes sense. One-shot actions (+ Snapshot, + New what-if) bold briefly as confirmation, then return to normal once the action completes. Actions that open something (Share, Review all, Compare) stay bold while their panel or screen is open and clear when it closes. Tabs (Scenes, Drafts) stay bold while selected.
- Implementation detail: each text action reserves its bold width in advance, so going bold never nudges the items next to it.

**Home page (mocked up, awaiting confirmation)**

- Arnav's idea: a minimalistic page users see first, from which they click into the writing layout. It counts as basic v1 UI, since series, episodes and invitations need somewhere to live.
- Proposed layout: the same gray sidebar and white surface as the writing page. The sidebar lists Recent, your series, and Invitations; the main area shows the selected series' episodes as plain rows with who's writing and when it was last edited, plus + New series and a Members link for the showrunner.
- Proposed transition: clicking an episode keeps the sidebar in place and swaps its contents from series to that episode's scenes, so entering a script is a calm handoff rather than a page change.
- Proposed: "New script" quietly creates a series with one episode, so solo and short-film writers never see the series layer.

**Toolbar rework (Highland style)**

- Decision (Arnav's call): the toolbar matches Highland's: the script title in bold on the left with the draft switcher as quiet text beside it, and on the right small monochrome icon buttons and a thin divider. No pills or text buttons.
- What changed: Review all, Changes and Share became icon buttons in identical 32 by 28 px slots with hover labels. The Changes icon shows its on state with a soft gray background and a blue icon. Presence avatars sit left of the divider.
- One control for the sidebar (Arnav's call): the sidebar icon alone collapses the sidebar into page view and brings it back. The segmented Script view / Page view switch was removed, so no action ever has two controls.
- How earlier rules carry over: toolbar items are buttons, so they use pressed states rather than bolding. The bold-on-click rule still governs text actions in the sidebar and home page (+ Snapshot, + New what-if, + New episode, Members, Accept, Compare).
- Tradeoff: icon-only controls are less self-explanatory, so every icon gets a hover label, and Changes and Review only appear inside a what-if.

**Send to main and Compare**

- Goal (Arnav's call): both tools must be seamless and never obstruct the writing.
- Decision (Arnav's call): both live in the empty left binding margin. A changed scene gets a small dot there (blue: differs from main; amber: main changed it too), visible with Changes on or off. The Changes toggle now only controls inline highlights.
- Clicking a dot opens a small popover that sits in the margin, never over the text, with Send to main (⌘↵) and Compare (⌘⇧↵). The shortcuts act on the scene the cursor is in.
- Compare opens a right-side panel that slides in like the sidebar, showing main's version of the scene you're in with main's changes highlighted. You can keep writing, the panel follows your cursor from scene to scene, and Esc or × closes it. Its one action is Send mine to main. The page shifts left to make room; on narrow screens the left sidebar collapses automatically.
- An amber scene is never sent blind: Send to main on it opens Compare first. A sent scene that's edited again gets its dot back. Consecutive sends from one what-if within a few minutes share one restore point.
- Why, in plain terms: the margin is always-empty space in a screenplay, so the tools are one click away without ever touching the text, and comparing never takes you out of the script.

**Interactive prototype (October 19)**

- Built at Arnav's request: one clickable page with everything so far, published as "Writers' Room · Interactive prototype".
- Proposed details it introduces, awaiting confirmation: Review all opens a small dropdown under its icon, like the other menus, instead of a dialog (Arnav found the dialog too heavy): the same blue and amber dots as the margin, a check mark on blue scenes you tap to include, Compare beside amber scenes, and one line at the bottom to send them; no checkboxes, dividers, backdrop or Cancel button, and Esc or a click elsewhere closes it; Share opens a small menu (Copy invite link, Invite co-writer); the draft switcher opens a small menu of drafts with a check on the current one; the Compare panel shows "This scene matches main" for unchanged scenes.
- Not mocked (too much technical work for a prototype): real typing with the Enter/Tab element editor, real pagination with page breaks, and live co-editing.

**Light and dark mode**

- Decision (Arnav's call): a light/dark toggle on the home page. The app starts in whatever mode the system is using, and the toggle overrides it within the app.
- How it looks: a sun/moon icon button beside the account avatar in the home toolbar, sized like every other toolbar icon, with a hover label ("Switch to dark mode").
- Proposed: the choice is remembered on that device, so the app opens in the mode you picked last time.

#### Features in scope

1. **Screenplay element editor.** Typed blocks with Enter/Tab auto-switching. Base of the real-screenwriting-app feel.
2. **Real-time multi-user editing (CRDT).** Simultaneous editing with no conflicts.
3. **Presence and offline sync.** See who's in the doc; offline edits merge on reconnect.
4. **Scaled sync service.** Multiple servers, one home server per script, a durable edit log and failover. Writers see no difference until something breaks. Main distributed-systems depth.
5. **Pagination.** Page breaks computed as a pure function of document state, so every client agrees without syncing them. Each viewport anchors to a block so remote edits don't shift what you're reading.
6. **Roles and permissions.** Showrunner, Writer, Viewer, with per-episode assignment, enforced at the home server.
7. **Branching and merging.** Fork a "what if" version of an episode, then bring chosen scenes back into main.
8. **Series-ready schema, episode-level product.**
9. **Load-test harness.** Simulates hundreds of writers to measure sync latency and lost edits. Source of the resume numbers.

#### Scope: v1 and future versions

Both lists are subject to change, and nothing here is final until Arnav confirms it.

Design principle: v1 is built around the future-version list, so those features can slot in later without rewrites. v1 leaves the seams for them but does not build them.

**v1 (episode-level product)**

- Screenplay element editor with Enter/Tab switching
- Real-time multi-user editing with presence and offline sync
- Scaled sync service: one home server per script, durable edit log, failover
- Pagination that stays stable under remote edits
- Roles: Showrunner, Writer, Viewer, with per-episode assignment
- Scene-level branching and merging, with a simple merge UI
- Series-ready data schema
- Load-test harness for sync latency and lost-edit numbers
- Build order: (1) editor, sync, scaled sync service, load tests; (2) pagination and roles; (3) branching and the merge UI

**Future versions (not committed)**

- Continuity checker with AI extraction (state, knowledge, presence, names/relationships, scene-heading lints), plus its precision/recall eval harness
- Beats tab with scene cards and card drag-and-drop (the beat board)
- Outline tab
- Dragging scenes to reorder them in the navigator
- Comments and notes tabs
- Revision color tags on snapshots
- Export to Final Draft (.fdx) and Fountain
- Cross-episode proposals
- Scene-level locks
- Series-level product: bible and cross-episode continuity checking
- Timeline checker (on hold; time travel and parallel timelines stay out of scope even then)
- Setup/payoff tracking and prop/costume continuity
- Pitch voting
- Script jam event (timed team co-writing at UTM) and a public launch

**Excluded for now**

- Motivation and tone contradiction checks

#### Proposed items (confirmed October 20)

- Branches as separate docs; accepting a scene copies its blocks into main as ordinary edits (never merging two CRDT histories).
- Scene-level diff via a three-way comparison per scene (starting snapshot, branch, current main), using stable scene IDs.
- Flat block schema (a list of typed blocks, no nesting) and a permissive block order, with flow enforced by the Enter/Tab state machine and lints.
- Coarse roles in v1 until server-side enforcement is verified.
- Undo after a merge reverts only the scenes that merge touched, not the whole document, so later edits by others survive. If a merged scene was edited since, the tool warns first.
- Writer-facing names: "what-if" for a branch and "Bring back to main" for a merge. Branch, merge and diff never appear in the UI.
- Revision colors after merges, following the Hollywood convention (white, blue, pink, yellow, green, goldenrod) with asterisks in the margin on changed lines. Visual only, with no page locking. A modest addition built from the diff already computed.

#### Spike plan (2-3 days, gate for the Yjs decision)

Flat-schema editor with the Enter/Tab state machine, two simulated clients, and these tests:

1. Concurrent Enters at end of line.
2. Mid-line split while the other client types in the tail.
3. Element type change while the other client types in the same block.
4. Both clients offline, then merged.
5. Remote edits above your cursor: cursor and viewport hold still, and fake page-break markers don't flicker or vanish.
6. Undo after a split is one step, and undo never reverts someone else's edit.
7. Performance on a script of about 110 pages at typing speed.
8. Branch test: fork a doc, edit both copies, render the snapshot diff, copy one scene's changes into main.

Pass: everything converges with no lost text. Mid-line split (test 2) may degrade gracefully but must never corrupt.

#### Still undecided

- Visual direction: resolved (Highland look and the UI decisions above, captured in the interactive prototype).
- Specific AWS services for hosting, including the store for ownership leases.
- Authentication (how people log in).
- Confirmation of the proposed items above.
- Project name.

#### Open issues from the October 19 review

A full review of decisions and scope raised these; they are being worked through one at a time.

- Distributed-systems depth: resolved by the phasing decision.
- How servers share a script: resolved (one home server per script).
- Strict formatting versus the permissive schema: resolved (visible fixes).
- Flashback problem in continuity checks: deferred with the continuity checker. The proposed fix (a "flashback" tag on scenes) returns with it.
- Eval data licensing and writers' AI sensitivity: deferred with the continuity checker.
- Fallback stack and offline: resolved (accept the downgrade in the double-failure case).
- Multiple writers per episode: resolved (writers can add co-writers).
- Scene identity when scenes combine or split: resolved (removed plus changed).
- Real-user plan: resolved (closed beta after phase 2 and Arnav's own testing).
- Scope versus timeline: resolved (week-6 checkpoint and cut order).

#### Before the task breakdown (October 19)

The UI design is settled. These still need decisions before v1 can be split into layered tasks:

- Stack: resolved (see Pre-build decisions).
- AWS services and cost ceiling: resolved.
- Authentication: resolved.
- PDF export and script import: resolved.
- Confirmation pass: resolved. Every proposed item confirmed except snapshot color tags (moved to the future list) and the unlink-page-view setting (dropped).
- Can wait until the build: project name, exact motion timings, monitoring tool choice, beta recruiting logistics.

#### Pre-build decisions (October 20, all Arnav's calls)

- Frontend: React + Vite + TypeScript, styled with the prototype's CSS variables (no Tailwind) so the look stays identical. Rejected: Next.js (server rendering the editor can't use, harder AWS deploy); Svelte (new framework, fewer ProseMirror examples).
- Sync server: a custom Node + TypeScript WebSocket server built on Yjs's own sync and awareness protocols, so home servers, leases, fencing and the durable log are Arnav's own work. Rejected: Hocuspocus (its scaling model is the rejected shared broker; kept as a reference only); Rust or Go ports (fight the ecosystem).
- API server: Fastify in the same TypeScript monorepo, sharing types. Rejected: FastAPI (a second language doubles the tooling).
- Database for users, series, episodes, roles, invitations and snapshot records: Postgres. Rejected: DynamoDB for this (awkward for relationships).
- Durable edit log and ownership leases: DynamoDB, using conditional writes so a server with an outdated ownership number is rejected. Compacted snapshots go to S3. Rejected: a Postgres log (hand-rolled fencing), Kafka or Kinesis (overkill), Redis locks (debated correctness, extra cost), etcd or ZooKeeper (running a cluster).
- Routing: any server accepts a connection and forwards it internally to the script's home server. Rejected: redirecting clients to the home server (exposes every node publicly).
- AWS: the lean setup. Frontend on S3 + CloudFront; one small always-on ECS Fargate container for beta; DynamoDB on demand; a small Postgres; AWS CDK in TypeScript; budget alarms around $20 and $40 a month. The multi-node cluster is spun up from code only for load tests and demos, then torn down. Use the Paid account plan, never the Free plan, because the Free plan closes the account and deletes its data after 6 months or when credits run out. Rejected: full always-on (burns credits for no beta benefit); Lambda with API Gateway WebSockets (stateless, breaks the home-server design).
- Authentication: Amazon Cognito with a custom Highland-style sign-in screen, email one-time codes plus Google sign-in, no passwords. Rejected: Clerk or Auth0 (a third party in the AWS story); building our own (security risk and time).
- PDF export: generated in the browser from our own pagination output, so pages match the screen exactly. Rejected: browser print-to-PDF (varies by browser); server-side headless Chrome (extra infrastructure).
- Import: Final Draft (.fdx) and Fountain both in v1, so beta writers can bring real scripts. Exports to those formats go to the future list. Adds about 1.5 weeks.
- Technical pivot flagged during prompt writing: the prototype's script page used approximate geometry (a 612 px page with 16 px type gives about 45 characters per action line, where the industry standard is 60). The real build keeps every visual detail of the prototype but uses true screenplay geometry: US Letter at 96 px per inch (816 by 1056 px), 12-point Courier Prime (16 px), 1.5 inch left margin, 1 inch right, top and bottom margins, and standard element indents.
- Updated timeline: v1 roughly 8.5-10.5 weeks after the spike, including PDF export and import.

#### Known risks

- Mid-line paragraph splits under concurrent editing (Yjs binding).
- Cursor stability when nodes are deleted by other users.
- Page-break markers must survive remote updates (annotation handling in the Yjs binding).
- Binding churn: a rewrite has been planned and no stable release was confirmed.
- Scene IDs staying unique through copy-paste and splits.
- Timeline: v1 is roughly 7-9 weeks (scaled sync service in, continuity checker out), alongside midterms and NeetCode prep.

#### Rejected options and why

Reasons are mine unless marked as Arnav's call. "Not chosen" means the option lost to a better fit, not that it was ruled out forever. Each entry says what users would have experienced.

**Project choice**

- UofT course-alert service (Arnav's call): against UofT policy, so students couldn't use it openly, and it would have been a resume liability.
- Internship alert engine (Arnav's call): built by many people already and wouldn't carry personal passion, even though it had the easiest path to real users.
- Live baseball game-state engine: not chosen. Fans would have gotten live win probabilities, but the writers' room won on passion. The season is also ending, so it would depend on replayed games.
- Webhook delivery platform, Raft key-value store: not chosen. Their users are other developers (or no one), so the impact story was thin.

**Continuity checker**

- Motivation and tone checks (Arnav's call): good stories break these rules on purpose, so writers would mostly see false alarms and stop trusting the tool.
- Timeline checker (Arnav's call to hold): the hard part is vague language like "a few weeks later." Wide tolerances miss errors and narrow ones raise false flags. Extra tuning was estimated at two or more weeks.
- Setup/payoff tracking and prop/costume continuity: deferred. Writers would value setup/payoff (it catches things never resolved), but it is heavier than the v1 set.

**Roles and permissions**

- Flat roles for the whole series: rejected. Every writer could edit every episode, unlike a real room where writers own episodes.
- Scene-level locks: deferred. Most realistic for writers, but the server would have to inspect each edit, which is the riskiest part to build.
- Showrunner approval on every merge (Arnav's call): tedious for no payoff. Writers merge freely into their own episode, and the restore point covers mistakes.
- Cross-episode proposals: out of v1. A writer who wants to fix someone else's episode has to raise it outside the tool for now.

**Scope cuts**

- Pitch voting (Arnav's call): a side feature that doesn't deepen the system. Rooms can vote elsewhere.
- Beat board (Arnav's call): two synced views of one script is medium-to-hard. Writers have only the script view in v1.

**Data model**

- Episode-only schema: rejected, because adding series features later would force a rewrite and migrate existing scripts.
- Full series-level product in v1: rejected. It roughly doubles the data model, and v1 users work one episode at a time without cross-episode continuity checks.

**Stack**

- prosemirror-collab (central step log): the fallback if the spike fails. Better for branching and roles, but weaker offline, and a writer needs a connection to commit edits.
- Loro: second fallback. Younger and with a smaller community, so its editor binding is less proven.
- Automerge: rejected. Its editor binding is alpha, so it's too risky for the core typing experience.
- Hosted collaboration services: rejected, because they hide the internals Arnav wants to own and explain.

**Branching and merging**

- Whole-branch merge only: rejected. Writers who liked half of an experiment would redo the other half by hand.
- Block (paragraph or line) level merge: rejected. It can leave broken structure (dialogue with no character) and needs a heavy review screen.
- Automatic CRDT merge: rejected. Writers couldn't accept part of a branch, and if both sides edited one paragraph the text can interleave into nonsense.
- Blending text inside a conflicted scene: rejected for v1. It risks incoherent dialogue and is a big build, so writers copy lines from the branch by hand after merging.

**Look and feel**

- Copying Celtx's interface (Arnav's call): he doesn't like its UI, and production-ready polish needs his own design.
- Measuring page breaks in the browser and syncing them between users: not chosen. Pages could differ between screens and shift under remote edits, so pagination is computed from the document itself.

**Phasing**

- Keep the original phasing: rejected. The first resume-ready version would have been mostly library integration, with the systems work months away.
- A thin continuity slice in phase 1 instead: rejected for now. It's a strong AI-engineering story, but it needs the story-state store, LLM integration and eval data before producing any number, so it is a much bigger slice.

**Merge review layout**

- Card list (layout B), Arnav's call: one scroll of scene cards. Layout A's scene list plus full screenplay view was preferred for navigating and reviewing.

**Server document sharing**

- Shared broker (any server serves any script, edits broadcast through pub/sub), Arnav's call: rejected. It's simpler, about 1 week, but the broker becomes a central bottleneck and single point of failure, every server keeps its own copy of popular scripts, and "I used pub/sub" is a common interview story.

**AI in v1**

- Continuity checker in v1, Arnav's call: moved to a future version, with no AI engineering in v1 and room for a better AI idea later. In plain terms: writers get no continuity flags in v1, but v1 drops about 2-3 weeks of work plus LLM cost and script-privacy concerns, and the systems work becomes the centerpiece. Resume numbers now come from load tests and real users rather than precision and recall.

**Formatting enforcement**

- Strict schema: rejected. When a simultaneous edit produces a broken structure, the sync library has to repair it, which can silently drop a writer's text, the worst failure a writing tool can have.
- Permissive schema with silent lints: rejected. No text is lost, but writers might never notice the broken formatting.

**Adding co-writers**

- Only the showrunner assigns writers: rejected. Writers would have to ask the showrunner every time they want a co-writer.
- One writer per episode: rejected. It cuts against real-time co-writing, the core of the product.

**Offline under the fallback stack**

- Long offline as non-negotiable: rejected. prosemirror-collab would be out, and a double failure would force a custom sync layer, possibly adding weeks.
- Narrowing the offline promise now regardless of stack: rejected. It gives up something Yjs probably delivers for free.

**Scenes that combine or split**

- Blocking heading deletion behind a "combine scenes" command: rejected. It keeps IDs safe but fights natural editing.
- Line-level identity tracking: rejected for v1. It matches moved content exactly, but it is much more complex to build and to show in the merge screen.

**Real users**

- Public launch (screenwriting subreddit, Product Hunt): not planned for now. Bigger numbers, but bugs get exposed publicly and the support load doesn't fit mid-semester.
- Script jam (timed team co-writing event at UTM): not planned for now (Arnav's call). It would concentrate real concurrent usage and showcase branching, and it stays on the future list.

**Phase 1 slips**

- Extending the deadline as needed: rejected. It risks an open-ended delay while internship recruiting is already underway.

**Design inspiration (revised)**

- Celtx as the inspiration (Arnav's call): dropped as too clunky overall, in favor of Highland for the writing page and menus and Arc Studio Pro for other features.

**Send to main and Compare**

- Inline Send to main pill beside the heading: replaced. It competed with the script and disappeared when Changes was off.
- Compare as a full screen: rejected. It pulled the writer out of the script.
- "Take main's version into this what-if" (Arnav's call): dropped. Writers work scene by scene, so pulling big chunks from main is unlikely; scenes move from what-ifs to main.
