# CLAUDE.md: Writers' Room

Instructions for Claude working in this repo. Part 1 is verbatim from the project prompt and is non-negotiable. Parts 2-5 are condensed; the full text is `docs/SPEC.md`, and SPEC.md wins on any detail. Keep this file in sync with `docs/decision-log.md`: when a logged decision changes something summarized here, update this file in the same commit.

Key files: `docs/SPEC.md` (spec) · `docs/decision-log.md` (decisions, newest entry D-017) · `docs/prototype/writers-room-prototype.html` (visual and interaction source of truth) · `packages/shared/tokens.css` (design tokens).

You are my pair engineer on "Writers' Room" (working title), a real-time collaborative screenwriting tool built like a TV writers' room. I'm Arnav, a CS student, and this is my main resume project for software engineering internships. You write the code. I make every design and technical decision, and I must understand how every piece works well enough to explain it in an interview.

=====================================================
PART 1. HOW WE WORK (non-negotiable)
=====================================================
1. Never make a product, design or architecture decision silently. When something comes up that this document does not settle, stop and present 2-3 options, each with tradeoffs and a plain-language note on what changes for writers, plus your recommendation. Wait for my call before building it.
2. Explain as you go. After each meaningful piece, give me (a) a short plain-English explanation of how it works and why, and (b) the deeper technical version I could repeat in an interview. Point me to the files to read.
3. Keep the running decision log at docs/decision-log.md updated for every decision, technical pivot, issue, blocker or deviation, the moment it happens. Each entry has: the date; the decision; the options considered; the tradeoffs; a plain-terms explanation of what changes for writers and for the system; the rejected options with brief reasons from the user's point of view; and whether it was Arnav's call or your proposal awaiting my confirmation. Never delete history: supersede an entry with a new one that references it. The imported log contains some early entries that later decisions superseded; wherever an older entry conflicts with docs/SPEC.md, SPEC.md wins. Keep these sections current: Decided, Proposed (awaiting Arnav), Open issues, Future versions, Rejected options and why, Known risks.
4. "idea check": whenever I say it (or something similar), reply with a project summary: what the tool is, the features in scope with the reason and functionality of each, what's explicitly out, and what's still undecided.
5. The prototype (docs/prototype/writers-room-prototype.html) is the visual and interaction source of truth. Match its colors, type sizes, weights, spacing, icons, menus, motion and behavior exactly unless this document says otherwise. If the real build can't match something, tell me, propose options, and log it.
6. Work in small, reviewable steps with tests. Commit often with clear messages. Don't start the next phase until I approve the current one. At the end of each phase, give me a demo script (what to click, what to watch for) and an explain-back summary.
7. Don't add features, libraries, services or UI elements that aren't in this document without asking. Don't skip anything that is in it.
8. Create and maintain CLAUDE.md at the repo root containing Part 1 and a condensed version of Parts 2-5, and keep it in sync with the decision log.

=====================================================
PARTS 2-5, CONDENSED (full text: docs/SPEC.md)
=====================================================

## Part 2. Product

- A real-time collaborative screenwriting tool: several writers edit one episode at once; writers fork **what-ifs**, rewrite scenes, and **Send to main** chosen scenes. It looks and feels almost exactly like **Highland**, with Arc Studio Pro ideas only where they fit. Not Celtx. Governing principle: it must feel effortless and never obstruct the writing.
- Users: rooms of about 5-15 per script, pairs, and solo writers, who usually work on different scenes.
- Resume centerpiece: the horizontally scaled sync service (home server per script, leases with fencing tokens, failover, zero lost edits) and load-test numbers. **No AI in v1.**
- **v1:** the element editor (Enter/Tab plus the element menu); CRDT real-time editing, presence and offline merge; the scaled sync service and load-test harness; pagination as a pure function, with page view when the sidebar collapses; roles (Showrunner, Writer, Viewer), per-episode assignment and co-writers; what-ifs (forking, the Drafts tab, snapshots and restore, scene comparison, margin dots, Send to main, Compare, Review all, Changes); the home page (series, episodes, invitations); light/dark mode; PDF export; .fdx and Fountain import; a series-ready data model ("New script" quietly creates a one-episode series).
- **Out of v1 (leave seams, don't build):** AI continuity checker and its evals; Beats tab and beat board; Outline tab; dragging scenes; comments and notes; revision color tags; .fdx and Fountain export; cross-episode proposals; scene locks; the series-level product; the timeline checker; setup/payoff and prop/costume tracking; pitch voting; the script jam and public launch. Dropped entirely: "take main's version into this what-if".
- **Permanently rejected:** motion and tone checks; an unlink-page-view setting; a history icon in the toolbar; a Script/Page segmented switch; any full-screen merge dialog; Celtx-style UI.

## Part 3. Design system (match the prototype)

- **Tokens:** every color is a CSS variable in `packages/shared/tokens.css` (light on `:root`; dark under `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`). Never hard-code a color. `packages/shared/test/tokens.test.ts` guards the values.
- **Type:** UI uses the system stack (`--font-ui`); the script uses Courier Prime 400/700 (`--font-script`).
- **Sizing tiers:** the title is 15 px semibold (the only one at that size). Sidebar and home text controls are 13 px muted, turning text-color and bold when active. The draft switcher is 13 px in the icon color. Metadata is 12 px muted. Section labels are 11 px, weight 600, caps, .06em tracking. Scene and episode names are 15 px weight 500. Toolbar icons are 18 px line icons (stroke 1.6, round) in 32x28 slots with 6 px radius. Accent blue is only for the active tab underline, toggle on-states, Send to main and primary actions.
- **Text actions bold; buttons never do.** One-shot text actions bold for about 0.7 s. Openers (Compare) stay bold while open. Tabs stay bold while selected. Bold width is reserved in advance (the inline-grid `::after` trick). Buttons use hover and pressed backgrounds; an icon's on-state is accent-bg with an accent icon.
- **Toolbar:** 56 px, bg color, 1 px line2 bottom border. Script screens: back, sidebar toggle, title, draft switcher ("Main ▾" / "Main › Name ▾"); on the right, avatars (24 px, overlapping by 6), a divider, [Changes, Review all inside what-ifs only], and Share last. Home: "Home"; + New script, theme toggle, account avatar. Every icon has a hover label and aria-label. **One control per action.**
- **Sidebar:** 300 px, side background. Scenes | Drafts tabs. Scenes rows show the sel background for the cursor's scene, plus dots or "Sent ✓" in what-ifs, and a legend. The Drafts tab has Main, + New what-if, WHAT-IFS, and SNAPSHOTS with + Snapshot.
- **Collapse = page view:** width 300 to 0 over 240 ms. The desk color spreads, and the page shadow and page numbers fade in. Open view is white on white. Text geometry is identical in both views (nothing rewraps). Scroll stays anchored to the cursor's scene; the toolbar never changes.
- **Page geometry (D-003):** two blank lines before scene headings (D-014); 96 px/in; US Letter 816x1056; Courier Prime 16 px/16 px; margins L 1.5 in, R/T/B 1 in. Heading, action and shot at 1.5 in (6 in wide); character at 3.7 in; parenthetical at 3.1 in (2.4 in wide); dialogue at 2.5 in (3.5 in wide); transitions right-aligned to 7.5 in. Headings, shots, characters and transitions are uppercase. One blank line between elements. Page numbers "12." at top right, 0.5 in from the top; none on page 1.
- **What-if UI, with nothing over the text:** 10 px margin dots 36 px left of the heading (accent = differs; amber = main changed too); a margin popover (Send to main ⌘↵, Compare ⌘⇧↵). Send = an ordinary edit into main, with a restore point first (shared across sends within a few minutes), a heading pulse, "Sent ✓", and a toast with Undo (reverting only the touched scenes). Amber scenes open Compare first. Compare = a 340 px right panel showing main's version, which follows the cursor, with "Send mine to main". The Changes toggle controls ins/del highlights. Review all = a dropdown checklist with "Send N scenes". Menus and toasts follow the shared styles. Esc closes the topmost thing first.
- **Home:** RECENT / SERIES / INVITATIONS sidebar; a 760 px centered episode list. Opening an episode is a crossfade handoff (220 ms), not a page load. The theme toggle follows the system until overridden (`data-theme` plus localStorage).
- **A11y:** aria-labels, visible focus, keyboard-navigable menus, 4.5:1 contrast, `prefers-reduced-motion` disables all motion.

## Part 4. Editor

- A flat ProseMirror schema: **one `block` node with a `type` attribute** (`scene_heading, action, character, parenthetical, dialogue, transition, shot`; D-013). Any order is allowed. Stable block IDs on every block, and a scene ID on each heading.
- **Three rules for all editor code, from the spike (D-012, D-013):**
  1. Never append or auto-fix in the same dispatch as a remote change. y-prosemirror drops it, and clients diverge. Run it as a separate, deferred, deterministic local transaction.
  2. Recompute every decoration from the document. Never map positions through remote changes, because y-prosemirror replaces the whole document on each one. Key position-based features by block ID.
  3. Protect every block type in the Yjs undo manager, and anchor the viewport to the cursor's block on remote updates.
- **Enter/Tab:**
  - Enter: SPEC 4.2 defaults. On an empty line, Enter changes that line in place (Action → Scene Heading; Character, Dialogue, Scene Heading, Transition and Shot → Action; Parenthetical → Dialogue).
  - Tab: empty Action → Character; Dialogue → Parenthetical; empty Character → Transition; Parenthetical → Dialogue; empty Transition → Scene Heading. Tab anywhere else does nothing.
  - Shift+Tab steps back. A new parenthetical starts as "( )".
  - Each structural action is one transaction and one undo step (D-014).
- **Element menu:** Esc (when nothing else is open) opens a vertical menu in the left margin beside the cursor's line. S A C P D H T switch the type; Esc closes it.
- **Uppercase** (headings, characters, shots, transitions) is display-only; the text is stored as typed.
- **Formatting warnings:** a muted-red hollow triangle in the margin for orphan dialogue or parentheticals, with "Add character cue" / "Make this action". Text is never dropped.
- **Scene identity:** deleting a heading (or changing its type) combines the scene with the previous one and shows "Scenes N and N+1 combined · Undo".
- Per-user Yjs UndoManager (local origins only). Presence: avatars plus remote cursors (style still to propose). Offline merges on reconnect.

## Part 5. Architecture

- **Monorepo:** `apps/web` (React + Vite, plain CSS, no Tailwind), `apps/sync` (custom y-protocols WebSocket server; Hocuspocus is a reference only), `apps/api` (Fastify), `packages/schema`, `packages/pagination`, `packages/shared`, `infra` (CDK), `tools/loadtest`. Local: docker compose (Postgres, DynamoDB Local, SeaweedFS), plus 3 sync nodes from Phase 1.
- **Data:** Postgres tables `users, series, series_members, episodes, episode_writers, invitations, drafts, snapshots, usage_events`. One Y.Doc per main draft and one per what-if (forked from a snapshot of main, never from another what-if). Series data lives outside the Y.Docs.
- **Roles:** Showrunner (everything); Writer (edits assigned episodes, adds co-writers from series members, creates what-ifs, sends to main without approval); Viewer (read-only). Enforced per connection at the home sync server. Every check goes through `canEdit` / `canMerge(user, scope)`.
- **Sync service:** one home server per episode doc by consistent hashing with virtual nodes over DynamoDB heartbeats. Any server forwards to the home. DynamoDB leases with an epoch fencing token. Every update is appended to the DynamoDB edit log, conditional on the current epoch, **before** ack and broadcast. Clients resend unacked updates (Yjs dedupes), which gives zero lost edits. Periodic S3 snapshots truncate the log. Failover loads snapshot plus log tail. Backoff with full jitter. Graceful handoff on scaling. Tokens verified on connect.
- **AWS (lean):** S3 + CloudFront, one Fargate container, DynamoDB on demand, a small Postgres, CDK. Budget alarms at $20 and $40 **before** the first deploy. The multi-node cluster only for load tests and demos. Never Lambda with API Gateway WebSockets.
- **Auth:** Cognito with a custom sign-in (email OTP plus Google, no passwords). JWTs verified by the API and sync. A clearly marked dev stub until then.
- **PDF and import:** browser-side PDF from the pagination output (Courier Prime embedded). Import .fdx and Fountain.
- **Pagination:** a pure function of blocks; wrapping by character count (never measure the DOM); about 54-55 lines per page; rules for headings, cues, (MORE)/(CONT'D), parentheticals, transitions and action splits; incremental from the first changed block; viewports anchored to block IDs.
- **Usage:** count events only, never content.

=====================================================
REPO WORKING NOTES
=====================================================

- Node 24.12 (`.node-version`), pnpm 12.12.1 via corepack (`corepack enable` once). Strict TypeScript 6.0.3 (not 7: typescript-eslint doesn't support it yet; D-006).
- `pnpm check` runs format check, lint, typecheck and tests. Run it before every commit.
- `packages/schema`, `packages/pagination` and `packages/shared` must stay environment-neutral (no Node or DOM types in `src`). Tests that need Node use a `test/tsconfig.json`.
- `docs/` and this file are excluded from Prettier. Never reformat the spec, the log or the prototype.
- Log entries are numbered D-001, D-002, …; the newest goes at the top of "Log entries". Update the current-state sections at the same time.
- Commit messages end with the attribution line given in the session's system reminder.
- After every commit, push `main` to GitHub (D-015). Never force-push or touch other branches.
- apps/web integration tests run in real Chromium (Vitest browser mode with Playwright, D-015); install it once with `pnpm --filter @wr/web exec playwright install chromium`. Package tests run in plain Node.
- Margin overlays are positioned with `topInPage()` (apps/web/src/editor/marginKeys.ts), never `offsetTop`: ProseMirror's stylesheet makes the editor the lines' offset parent.
- `apps/web/src/editor/devStore.ts` is temporary (D-014 item 8). Delete it when the editor connects to apps/sync.
