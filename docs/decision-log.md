# Writers' Room: Decision Log

The running record of every decision, technical pivot, issue, blocker and deviation on Writers' Room (working title). It has lived in the repo since October 20, 2026; the history before that was exported from planning chats and is kept word for word at the bottom of this file.

How to read it:

- The sections at the top (Decided through Known risks) are the **current state**. They are rewritten as things change.
- **Log entries** are the permanent, dated history. Entries are never deleted or edited after the fact. A changed decision gets a new entry that names the one it supersedes.
- `docs/SPEC.md` is the specification. Wherever an older entry (especially in the imported log) conflicts with SPEC.md, **SPEC.md wins**. D-005 lists every conflict found so far.
- "Arnav's call" means Arnav decided it. "Claude's proposal, awaiting Arnav" means it is not settled until Arnav confirms.

---

## Decided

The full specification is `docs/SPEC.md`; this is the index. Entry numbers point to the reasoning.

- **Product and scope:** SPEC Part 2. A Highland-style, real-time collaborative screenwriting tool for small rooms, pairs and solo writers, with what-ifs and Send to main. No AI in v1. The systems work (scaled sync service plus load tests) is the centerpiece.
- **Design system and UI:** SPEC Part 3. The prototype (`docs/prototype/writers-room-prototype.html`) is the visual and interaction source of truth, except for page geometry (D-003). Tokens live in `packages/shared/tokens.css` (D-006).
- **Editor behavior:** SPEC Part 4. Flat ProseMirror block schema, Enter/Tab state machine (defaults, to be confirmed in the editor phase), permissive schema with visible fixes, Yjs per-user undo.
- **Architecture:** SPEC Part 5 and D-002. pnpm TypeScript monorepo; React + Vite; custom y-protocols sync server; Fastify; Postgres; DynamoDB for edit log, leases and membership; S3 snapshots; Cognito; CDK; lean AWS.
- **Page geometry:** true screenplay geometry at 96 px per inch (D-003).
- **Local S3-compatible store:** SeaweedFS (D-004).
- **Plan:** SPEC Part 6. Spike first (2-3 days, gates the stack); Phase 1 with a hard checkpoint at the end of week 6 and a fixed cut order; Phase 2; closed beta; Phase 3; beta hardening. v1 is roughly 8.5-10.5 weeks after the spike.
- **Where the log lives:** in the repo, alongside SPEC.md and CLAUDE.md (D-001).
- **Hosting the code:** a public GitHub repo, `arnavsabat/writers-room`, as `origin`; `main` is pushed (D-008).
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

- **(a)** One person per verified email: `users` plus `user_identities`. Google sign-in and email codes reach the same account.
  - **(b)** `canView` and `canBeCoWriter` alongside `canEdit` / `canMerge`.
  - **(c)** Deleted series and episodes are simply never loaded, so the rule needs no "deleted" flag.
  - **(d)** Episode positions are never reused, and "Ep N" is the episode's rank.
  - **(e)** `pnpm check` stays free of services; `pnpm test:services` runs the Postgres- and AWS-backed suites.
  - **(f)** Every test file gets its own throwaway database.
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
- **Performance budget (from D-012):** a regression test failing if the p95 local keystroke or remote update exceeds 16 ms on a 110-page script. It's added with the editor package's performance test.
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
- **D-020: web test runs end with a 10-second wait.** Vite's own browser connections outlive the test server's teardown, so Vitest waits out its timeout. The run still exits 0, and our servers leave nothing open.

- **Spike follow-ups (D-012):**
  - The key editor tests have only run in Chromium; WebKit and Firefox still need running in the editor phase.
  - Duplicate-ID repair after merges must become deterministic.
  - The word diff must group changes into phrases.
  - Watch the beta for test 2's split degradation.
  - One long task of about 100-160 ms per run during solo typing needs a look.

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
10. How TypeScript runs on Node: dev uses `tsx` (D-018). Production bundling is decided with the first deploy.
11. Load-test targets and method: concurrent editors per script and per server, the p95 latency goal, how failover is injected, and how "zero lost edits" is verified (SPEC 5.4).
12. Autocomplete behavior and look (SPEC 4.4; first on the cut list after the sync cuts).
13. ~~AWS region~~: `ca-central-1` (D-030).
14. How to gate the first AWS deploy before Cognito exists (SPEC 5.6). Also at deploy (D-025): where the cluster secret lives on AWS, and how the sync server is built for production.
15. Which kind of "small Postgres" to run on AWS: RDS, Aurora Serverless v2, or Postgres on the Fargate task (SPEC 5.5).
16. Monitoring and logging tool (the imported log deferred this to the build).

Phase 2:

17. ~~Spacing before scene headings~~: decided in D-014 (two blank lines).
18. Mobile and narrow-screen behavior (SPEC 3.8: raise when it comes up).
19. ~~The sign-in screen design~~: decided in D-028 and D-029.
20. ~~Email delivery~~ and ~~the invite link flow~~: SES on our own domain (D-030); one-time links (D-032).
21. Screens the prototype doesn't mock: ~~Members~~ (D-030), ~~Invite co-writer…~~ and ~~the account avatar menu~~ (D-032). ~~+ New episode~~ (D-033).
- New (found 2026-10-24, accounts phase): the prototype's blue primary button (`.pb`, white text on `--accent`) fails SPEC 3.11's 4.5:1 contrast in dark mode: white on `#6EA2E6` is about 2.6:1 (light mode, on `#2F6DB5`, is about 5.3:1). It's used for Compare's "Send mine to main". Options to bring Arnav: dark text on the dark-mode accent, a deeper dark-mode accent for filled buttons only, or the inverted-surface style used by sign-in's Continue (D-028).
- New (D-042, moved by D-046): the 30-day purge job (D-037) isn't built yet. It needs new delete operations on the DynamoDB edit log and S3 snapshots, plus a daily schedule, so it's built in the deploy phase, before real users. Until then, soft-deleted items are only hidden.
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
25. Product name (still a working title).

Phase 3:

26. What a "few minutes" means for sends sharing one restore point (SPEC 3.9).
27. How the warning before undoing an edited sent scene looks, given there are no dialogs (SPEC 3.9).
28. Restoring a snapshot: is it an ordinary edit into the current draft, a new what-if, or a choice between the two? (SPEC Part 2 lists "snapshots and restore", but the behavior isn't specified.)
29. When automatic snapshots are taken, other than before a send (SPEC 3.6 shows "time · automatic").
30. Renaming and deleting what-ifs; whether Viewers can see what-ifs; who can create snapshots.
31. Snapshot row text size: the prototype uses 14 px, which matches no tier in SPEC 3.3.

## Future versions

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

Earlier rejections, with reasons from the writer's point of view, are in the imported log below (section "Rejected options and why").

## Known risks

- New (accounts step 3): the email-code flow assumes what Cognito's docs show: `SignUp` works without a password, and `ConfirmSignUp`'s session can be passed to `InitiateAuth` (`USER_AUTH`) to sign in at once. It also assumes `SignUp` reports an existing address with `UsernameExistsException` even when user-existence errors are hidden; the docs found don't settle that. Our local fake Cognito follows these assumptions, so they're verified against the real pool at step 8, before the demo.
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
