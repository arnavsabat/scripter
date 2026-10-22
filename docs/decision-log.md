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

## Proposed (awaiting Arnav)

- **Performance budget (from D-012):** a regression test failing if the p95 local keystroke or remote update exceeds 16 ms on a 110-page script. It's added with the editor package's performance test.
- **Small choices made while building the editor shell (D-014, items 9-11):**
  - Structural actions get their own undo step.
  - Scene names in the navigator are derived from headings, as in the prototype ("INT. KITCHEN - NIGHT" shows as "Kitchen – Night").
  - Placeholder toasts for controls whose features come later.

## Open issues

**Blockers and environment issues**

- **Spike follow-ups (D-012):**
  - The key editor tests have only run in Chromium; WebKit and Firefox still need running in the editor phase.
  - Duplicate-ID repair after merges must become deterministic.
  - The word diff must group changes into phrases.
  - Watch the beta for test 2's split degradation.
  - One long task of about 100-160 ms per run during solo typing needs a look.

- **D-007:** No container runtime (Docker Desktop, OrbStack or Colima) is installed on Arnav's machine, so `docker-compose.yml` has not been started or verified. pnpm isn't on PATH either. Arnav runs `corepack enable` once to fix that.

**Decisions the spec leaves open** (each is brought to Arnav with options when its phase starts)

Spike and Phase 1:

1. The Enter/Tab rules: Arnav confirms or adjusts them after trying the editor (the gaps were filled in D-014).
2. ~~Element menu~~: decided in D-014.
3. Remote cursor and selection style (SPEC 4.8).
4. Lease renew and expiry timings, the heartbeat interval, and the membership timeout (SPEC 5.4).
5. Number of virtual nodes per server, and the hash function.
6. How the sync servers forward connections to each other internally: a raw WebSocket proxy or our own framed protocol between servers.
7. Snapshot compaction trigger (every N updates, every T seconds, or on idle) and the log truncation policy (SPEC 5.4).
8. Client-side durability for offline work: whether unacknowledged updates survive a tab close or reload (IndexedDB), or only a dropped connection (in memory) (SPEC 4.9, 5.4).
9. ~~Formatting warning style~~: decided in D-014.
10. How TypeScript runs on Node in dev and production: tsx, Node 24's built-in type stripping, or compiling with tsc or esbuild (D-006).
11. Load-test targets and method: concurrent editors per script and per server, the p95 latency goal, how failover is injected, and how "zero lost edits" is verified (SPEC 5.4).
12. Autocomplete behavior and look (SPEC 4.4; first on the cut list after the sync cuts).
13. AWS region (for example, ca-central-1 for Toronto users or us-east-1 for cost and service availability).
14. How to gate the first AWS deploy before Cognito exists (SPEC 5.6).
15. Which kind of "small Postgres" to run on AWS: RDS, Aurora Serverless v2, or Postgres on the Fargate task (SPEC 5.5).
16. Monitoring and logging tool (the imported log deferred this to the build).

Phase 2:

17. ~~Spacing before scene headings~~: decided in D-014 (two blank lines).
18. Mobile and narrow-screen behavior (SPEC 3.8: raise when it comes up).
19. The sign-in screen design (SPEC 5.6: Highland style, not yet mocked).
20. Email delivery for one-time codes and invites (Cognito's built-in email or Amazon SES), and the invite link flow.
21. Screens the prototype doesn't mock: Members, + New episode, Invite co-writer…, and the account avatar menu (where sign-out lives).
22. Renaming scripts and episodes.
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

- Mid-line paragraph splits under concurrent editing (Yjs binding). Measured in the spike (D-012, test 2): nothing is lost and the structure never corrupts, but text typed concurrently in the second half of a line lands on the first half, and an in-progress word can tear. The risk is accepted pending P2.
- Cursor stability when nodes are deleted by other users. Tested in the spike: the cursor moves to the start of the next line. Low risk now.
- Page-break markers must survive remote updates (annotation handling in the Yjs binding). Resolved by design (D-012, F3): y-prosemirror replaces the whole document on every remote change, so decorations must be recomputed from the document. Mapped decorations vanish (20 → 0 in the control test).
- New (D-012, F2): any transaction appended during a remote change is never written to Yjs, so clients silently diverge. Every auto-fix after a remote change must run as a separate local transaction.
- New (D-012): y-prosemirror 1.3.7 is in maintenance mode. Its local keystroke cost grows with document length (p95 8 ms at 110 pages, so about 2x headroom).
- Binding churn: a rewrite of the ProseMirror-Yjs binding has been planned, and no stable release has been confirmed. Update (D-010): the rewrite now exists as the pre-release `@y/prosemirror` 2.0.0-15 on the Yjs 14 beta, and the stable `y-prosemirror` 1.3.7 hasn't had a release since July 2025. We build on the stable line, and an upgrade later would be its own decision.
- Scene IDs staying unique through copy-paste and splits.
- Timeline: v1 is roughly 8.5-10.5 weeks after the spike (supersedes the imported 7-9 week estimate), alongside midterms and NeetCode prep.
- New (D-003): the true-geometry promise assumes Courier Prime renders exactly 10 characters per inch at 16 px (an advance width of 0.6 em) in every browser. If it doesn't, character-count line wrapping and the on-screen lines will disagree. This gets verified in the editor phase, before pagination is built on it.
- New (D-004): SeaweedFS's S3 behavior may differ from AWS S3 in edge cases, so snapshot code also has to be tested against real S3 before the first deploy.
- New (D-006): typescript-eslint lags behind TypeScript 7, so we stay on TS 6.0 until it catches up.

---

## Log entries (newest first)

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
