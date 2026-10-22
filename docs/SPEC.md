# Writers' Room: Specification (Parts 2-6)

Verbatim copy of Parts 2-6 of the project prompt, added October 20, 2026. Where an older decision-log entry conflicts with this file, this file wins. Changes to the spec are recorded as decision-log entries; this file is only edited to apply a logged decision, and each such edit names the entry.

=====================================================
PART 2. THE PRODUCT
=====================================================
What it is: a real-time collaborative screenwriting tool. Several writers edit the same episode at once with no conflicts. Writers can fork a "what-if" version of an episode, rewrite scenes freely, and send chosen scenes back into the main script. It looks and feels almost exactly like Highland (fast, clean, minimal), with feature ideas borrowed from Arc Studio Pro only where they fit that style. Celtx is explicitly not a reference. Governing principle: the whole app must look and feel effortless and never obstruct the writing.

Who uses it: small writing rooms (roughly 5-15 people per script), writing pairs, and solo writers. Writers usually coordinate and work on different scenes.

Resume angle: the systems work is the centerpiece. That means the horizontally scaled sync service (one home server per script, leases with fencing tokens, failover, zero lost edits) and load-test numbers. There is no AI in v1.

In v1:
- Screenplay element editor with Enter/Tab switching and a minimal element menu with single-key shortcuts.
- Real-time multi-user editing (CRDT), presence, and offline editing that merges on reconnect.
- The scaled sync service and a load-test harness.
- Pagination as a pure function of document state; page view when the sidebar collapses.
- Roles (Showrunner, Writer, Viewer) with per-episode assignment and co-writers.
- What-ifs: forking, the Drafts tab, snapshots and restore, scene-level comparison, margin dots, Send to main, Compare, Review all, Changes.
- Home page with series, episodes and invitations.
- Light/dark mode.
- PDF export, plus Final Draft (.fdx) and Fountain import.
- A series-ready data model with an episode-level product: "New script" quietly creates a one-episode series, so solo writers never see the series layer until a second episode exists.

Out of v1 (future versions, design seams for them but don't build them): the AI continuity checker and its eval harness; the Beats tab and beat board with card drag-and-drop; the Outline tab; dragging scenes to reorder them; comments and notes tabs; revision color tags on snapshots; export to Final Draft or Fountain; cross-episode proposals; scene-level locks; the series-level product (bible, cross-episode continuity); the timeline checker; setup/payoff and prop/costume tracking; pitch voting; the script jam and public launch; Arc's "take main's version into this what-if" (dropped entirely).

Permanently rejected: motion and tone continuity checks; a setting to unlink page view from the sidebar (it would be a second control for one action); a history icon in the toolbar; a Script/Page segmented switch; any full-screen dialog for merging; Celtx-style UI.

=====================================================
PART 3. DESIGN SYSTEM AND UI SPEC (match the prototype)
=====================================================
3.1 Tokens. Define every color as a CSS variable on :root and redefine all of them for dark mode, both under @media (prefers-color-scheme: dark) guarded with :root:not([data-theme="light"]) and under :root[data-theme="dark"].
Light: bg #FFFFFF; side #E9E9EC; sel #D6D7DC; text #1F1F22; muted #5F5F64; icon #6B6B70; line #DEDEE2; line2 #ECECEF; accent #2F6DB5; accent-bg #E6E7EB; desk #E9E9EC; page #FFFFFF; ink #111111; ins-bg #E3F1E6; ins-fg #1E5A2E; del-bg #F8E3E1; del-fg #9A2B23; amber #C98A1B; amber-ring #F6E7CC; blue-ring #DCE6F5; panel #FAFAFB; menu #FFFFFF; hover rgba(0,0,0,.05); toast #2B2B2F; toast-fg #FFFFFF; toast-link #9CC1F0; green #3B8E4F.
Dark: bg #1C1C1E; side #26262A; sel #3A3A3F; text #ECECEE; muted #A1A1A8; icon #A1A1A8; line #38383C; line2 #2F2F33; accent #6EA2E6; accent-bg #34363C; desk #26262A; page #1C1C1E; ink #E8E8EA; ins-bg #1F3A27; ins-fg #9FD6AE; del-bg #3F2322; del-fg #F0A49C; amber #E0A84A; amber-ring #4A3A1E; blue-ring #22344D; panel #202023; menu #2A2A2E; hover rgba(255,255,255,.06); toast #ECECEE; toast-fg #1C1C1E; toast-link #2F6DB5; green #6CC685.
Presence avatar pairs (bg/fg): #C9D8EE/#1F3F6B, #E2D4EC/#4A2A63, #D9E6D3/#2E4A25; add more pairs in the same soft style when needed.

3.2 Type. UI font stack: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif. Script font: Courier Prime (Google Fonts, 400 and 700), fallback "Courier New", monospace.

3.3 Control sizing tiers. Controls are sized by importance, and controls with similar functions always share one size.
- The script or page title ("Ep 3 · The Long Night", "Home") is 15 px semibold, the only element at that size in the chrome.
- Sidebar and home text controls (Scenes, Drafts, + New what-if, + Snapshot, + New script, + New episode, Members, Accept) are 13 px muted. Active ones turn text-color and bold.
- The draft switcher is 13 px in the icon color.
- Inline and metadata text (timestamps, counts, shortcut hints) is 12 px muted.
- Section labels (RECENT, SERIES, INVITATIONS, WHAT-IFS, SNAPSHOTS, SEND TO MAIN) are 11 px, weight 600, capitals, letter-spacing .06em, muted.
- Navigator scene names and episode names are content: 15 px, weight 500.
- Toolbar icons are 18 px line icons (stroke 1.6, round caps and joins, currentColor) centered in identical 32x28 px slots with 6 px radius.
- Blue (accent) is reserved for the active-tab underline, toggle on-states, Send to main, and primary actions.

3.4 Text actions versus buttons.
- Clickable text that triggers a feature turns bold when clicked. One-shot actions (+ Snapshot, + New what-if, + New script, + New episode, Members, Accept) bold for about 0.7 s as confirmation, then return to normal. Text that opens something (Compare) stays bold while its panel is open. Tabs stay bold while selected.
- Each text action reserves its bold width in advance (the inline-grid ::after technique in the prototype), so bolding never nudges its neighbors.
- Actual buttons (toolbar icons, the draft switcher, the Send to main menu item, primary buttons, toggles) never bold. They use hover and pressed backgrounds; an icon's on-state is the accent-bg background with an accent icon.

3.5 Toolbar (every screen). 56 px tall, bg color, 1px line2 bottom border, Highland style.
- Left, on script screens: back arrow (to home), sidebar toggle icon, the bold title, then the draft switcher as quiet text ("Main ▾", or "Main › Darker ending ▾" in a what-if).
- Right: presence avatars (24 px circles, 10 px initials weight 600, 2px bg-colored border, overlapping by 6 px), a 1px x 22 px divider, then icon buttons. Inside a what-if only, add the Changes toggle and Review all. Share is always last.
- On the home screen: "Home" on the left; on the right, + New script, the theme toggle, and the account avatar.
- Every icon has a hover label and an aria-label.
- One control rule: no action ever has two controls. The sidebar icon is the only way to collapse and restore the sidebar.

3.6 Left sidebar. 300 px wide, side background, 1px right border, scrolls on its own.
- Tabs: Scenes | Drafts, 13 px, 20 px gap, padding 16/18/10. The active tab is bold with a 2px accent underline.
- Scenes tab: one row per scene. Rows are 9/12 px padding with 6 px radius; the selected row (the scene the cursor is in) uses the sel background. Inside a what-if, the right end of a row shows a 13 px change dot (accent = differs from main, amber = main changed it too) or "Sent ✓" in 12 px muted. A legend at the bottom reads "● differs from main ● main changed too". Clicking a row scrolls smoothly to that scene's heading.
- Drafts tab:
  - The Main row (bold "Main", with "Editing now · names" in 12 px muted), then the + New what-if text action.
  - The WHAT-IFS label, then one row per what-if: name, with "creator · time · N scenes differ" underneath.
  - The SNAPSHOTS label with + Snapshot on the right, then one row per snapshot: name, with "time · automatic" or "time · person" underneath.
  - Clicking main or a what-if switches to it.

3.7 Sidebar collapse and page view.
- Collapsing animates the sidebar width from 300 to 0 over 240 ms ease, fading its contents.
- Collapsed, the page becomes the industry-standard page view: the area around the page turns the desk color (the sidebar gray spreading into the background), and the page's shadow (0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08)) and page numbers fade in.
- Open, the same page is white on white, so its edges are invisible: Highland's clean column.
- The script's text geometry is identical in both views, so no line ever rewraps. The scroll position stays anchored to the scene the cursor is in.
- The toolbar never changes during the transition.
- prefers-reduced-motion turns all animation off.

3.8 Script page geometry. This is a technical pivot from the prototype; log it.
- The prototype's page was approximate (612 px wide with 16 px type, about 45 characters per action line). The real build keeps every visual detail of the prototype but uses true screenplay geometry at 96 CSS px per inch.
- Page: US Letter, 816 x 1056 px. 12-point Courier Prime: 16 px font with a 16 px line height (6 lines per inch, 10 characters per inch). Margins: left 1.5 in (144 px), right 1 in (96 px), top and bottom 1 in (96 px).
- Element positions, measured from the page's left edge:
  - Scene heading, Action and Shot start at 1.5 in, full 6 in width. Scene headings and Shots are uppercase.
  - Character starts at 3.7 in and is uppercase.
  - Parenthetical starts at 3.1 in, width about 2.4 in.
  - Dialogue starts at 2.5 in, width 3.5 in.
  - Transitions are uppercase and right-aligned to 7.5 in.
- One blank line separates elements. Parentheticals and dialogue sit directly under their character cue. Present the default spacing before scene headings (one or two blank lines) as a decision.
  - Decided (D-014): two blank lines before scene headings, matching the prototype.
  - Decided (D-014): the uppercase elements are shown in capitals (CSS, and later pagination and PDF), while the stored text keeps the writer's casing, so a type change never rewrites text.
- Page numbers sit at top right, 0.5 in from the top, in the format "12."; page 1 has no number. Pages in page view are separated by a gap showing the desk color.
- If the page can't fit beside open panels, the left sidebar collapses automatically when Compare opens (and returns when Compare closes). Otherwise, wide content scrolls horizontally inside the script area. v1 is desktop-first; raise mobile as a decision when it comes up.

3.9 What-if comparison UI (no dialogs, nothing over the text).
- Margin dots: each changed scene shows a 10 px dot in the empty left binding margin, 36 px left of the heading text and aligned with it. Accent means it differs from main; amber means main changed it too. Dots show whether Changes is on or off. An active dot gets a 4 px ring (blue-ring or amber-ring).
- Clicking a dot opens a popover that sits entirely in the margin, never over text: about 170 px wide, using the menu style. It has two items: "Send to main" with hint ⌘↵, and "Compare" with hint ⌘⇧↵ (Ctrl on Windows/Linux). The shortcuts act on the scene the cursor is in.
- Send to main:
  - It copies the what-if's version of that scene into main as an ordinary edit, so it syncs to everyone and appears in undo.
  - An automatic restore point is saved first; consecutive sends from one what-if within a few minutes share one restore point ("Before sending from 'Darker ending'").
  - The scene heading pulses (blue-ring background fading over 1.2 s), the dot disappears, the navigator shows "Sent ✓", and a toast reads "'Scene name' sent to main · Undo".
  - Undo reverts only the scenes that send touched, so other people's later edits survive. If a sent scene was edited since, warn before undoing.
  - Editing a sent scene again brings its dot back.
  - Amber scenes are never sent blind: Send to main on an amber scene opens Compare first, with the toast "Main changed this scene too, so compare it first".
- Compare panel:
  - A 340 px panel slides in from the right (width animation, 240 ms) and the page shifts over smoothly. Writing continues while it's open.
  - Header: "Main's version" in 13 px semibold, with "scene name · changed by NAME, time" in 12 px muted, and a close × icon.
  - Body: main's version of the scene the cursor is in, in Courier Prime at 13 px with proportionally scaled indents. What main added since the what-if began is highlighted with the ins colors. A 12 px muted note explains the highlights.
  - Footer: "Esc to close" in 12 px muted, and a primary "Send mine to main" button (accent background, white 13 px weight 600 text, 30 px tall, 6 px radius).
  - The panel follows the cursor from scene to scene. For unchanged scenes it says "This scene matches main."; for sent scenes, "This scene was sent. It matches main now." Esc or × closes it.
  - It works with the sidebar open or collapsed.
- Changes toggle (toolbar icon, what-if only): turns inline highlights on and off. Additions use the ins colors; removals use the del colors with a strikethrough. Off means a clean script.
- Review all (toolbar icon, what-if only): opens a dropdown under the icon, not a dialog, with no backdrop and no Cancel button.
  - It starts with the SEND TO MAIN label, then rows of dot + scene name (13 px). Clicking a blue row toggles a quiet ✓ on the right; blue rows start checked.
  - Amber rows show a Compare text action instead, which closes the dropdown and opens Compare.
  - A thin separator, then one bottom line in accent weight 600: "Send N scenes". With nothing checked it reads "Select scenes to send" in muted text and is disabled. With nothing left to send, the dropdown says "Everything's in main".
  - Esc or a click elsewhere closes it.
- Menus: the draft switcher (main and each what-if, with a ✓ on the current one) and Share (Copy invite link; Invite co-writer…) share one style: menu background, 1px line border, 8 px radius, shadow 0 6px 20px rgba(0,0,0,.12), 4 px padding, 30 px items with 6 px radius and hover backgrounds, 13 px text, 12 px muted hints.
- Toasts: bottom center, toast background, 13 px, 10/16 px padding, 8 px radius. They rise and fade in over 0.2 s, last 6 s, and Undo appears as a toast-link-colored button.
- Esc closes the topmost thing first: popover or menu, then Review all, then Compare.

3.10 Home page and handoff.
- The home page uses the same skeleton: toolbar, gray sidebar, white surface.
- Sidebar: RECENT (recently opened episodes), SERIES (the selected series uses the sel background), INVITATIONS (series name, "from NAME", and an Accept text action that becomes "Accepted ✓").
- Main area: content centered at max-width 760 px, 40/48 px padding. The series header shows the title in 15 px semibold, with meta underneath ("3 episodes · you're the showrunner"); the right side has + New episode and Members. Below are episode rows, 48 px tall with line2 dividers and hover backgrounds: episode name on the left, "names · edited DATE" on the right in 12 px muted. A live episode shows a green ● and "editing now".
- Clicking an episode is a handoff, not a page load. The sidebar stays in place while its contents crossfade from series to that episode's scenes (opacity plus a 10 px slide, 220 ms), the toolbar swaps to the script's toolbar, and the script fades in. The back arrow reverses it.
- Theme toggle: a sun/moon icon button beside the avatar. On first launch the app follows the system's light or dark mode. The toggle overrides it within the app (setting the data-theme attribute), and the choice is remembered on that device (localStorage). The icon shows the mode you'd switch to, and its hover label says so.

3.11 Accessibility and motion. Every icon has an aria-label and hover label. Focus states are visible. Menus are keyboard-navigable. Text contrast is at least 4.5:1 in both themes. prefers-reduced-motion disables all transitions and animations.

=====================================================
PART 4. EDITOR BEHAVIOR
=====================================================
4.1 Schema. ProseMirror with a flat block schema: the document is a list of typed blocks with no nesting. Types: scene_heading, action, character, parenthetical, dialogue, transition, shot. The schema is permissive about order: any block can follow any other. Every scene heading carries a stable scene ID attribute, and every block has a stable block ID.
- Decided (D-013, from the spike): the element type is stored as a `type` attribute on a single `block` node, not as separate ProseMirror node types. With separate node types, a type change recreates the Yjs element and silently loses a co-writer's concurrent typing.

4.2 Enter/Tab state machine (defaults; confirm with me in the editor phase).
- Enter after Scene Heading goes to Action. After Action: Action. After Character: Dialogue. After Parenthetical: Dialogue. After Dialogue: Action. After Transition: Scene Heading. After Shot: Action.
- Tab on an empty Action goes to Character. Tab in Dialogue goes to Parenthetical. Tab on an empty Character goes to Transition.
- Every type switch is a single transaction (bind Enter and Tab with higher precedence than the defaults), so one Ctrl+Z undoes it.
- Decided (D-014), filling the gaps:
  - Enter on an empty line changes that line in place: Action → Scene Heading; Character, Dialogue, Scene Heading, Transition and Shot → Action; Parenthetical → Dialogue.
  - More Tab rules: Parenthetical → Dialogue; empty Transition → Scene Heading. Tab anywhere else does nothing and never leaves the script.
  - Shift+Tab steps back: Character → Action, Parenthetical → Dialogue, Transition → Character.
  - A new parenthetical starts as "()" with the cursor inside.
  - Backspace at the start of a line joins it with the line above; on an empty line it removes the line.

4.3 Element menu (designed but not yet mocked; bring me Highland-style options before building).
- A minimal floating bar that appears only when needed, never permanently. It lists Scene (S), Action (A), Character (C), Parens (P), Dialogue (D), Shot (H) and Transition (T), with single-key shortcuts while it's open and a check mark on the current type.
- Use the menu style tokens and 13 px items with 12 px muted shortcut letters. Propose when it appears (for example, on Esc or a shortcut).
- Decided (D-014): Esc opens it when nothing else is open, as a vertical menu in the empty left margin beside the cursor's line. A letter switches the type and closes the menu; Esc closes it.

4.4 Autocomplete for character names and scene headings (INT./EXT., known locations, times of day). It's on the cut list if Phase 1 slips.

4.5 Formatting enforcement: a permissive schema with visible fixes. Formatting is guaranteed while typing. If simultaneous edits or an offline merge break a rule (for example, dialogue with no character), mark the spot inline with a small warning and a one-click fix: insert a character cue, or convert the line to action. Never silently drop text.
- Decided (D-014): the warning is a small hollow triangle in muted red in the left margin beside the line. Clicking it opens a menu-style popover with "Add character cue" and "Make this action". The rule checked in v1 is a dialogue or parenthetical with no character cue above it.

4.6 Scene identity.
- Deleting a scene heading reads as "that scene removed, the previous scene changed" and shows the notice "Scenes 14 and 15 combined · Undo".
- Typing a new heading mid-scene reads as "scene changed, new scene added".
- An appendTransaction plugin keeps scene and block IDs unique through paste and split.
- Decided (D-013, from the spike): after a co-writer's change arrives, the ID repair runs as a separate, deferred local transaction rather than in appendTransaction, because y-prosemirror never syncs transactions appended to a remote change. The repair is deterministic, so every client picks the same new ID.

4.7 Undo. Per-user undo through the Yjs UndoManager tracking local origins only, so undo never reverts someone else's edit.

4.8 Presence. Avatars in the toolbar, plus remote cursors and selections. Propose a Highland-minimal style (for example, a 2px colored caret with the name on hover).

4.9 Offline. Edits made offline merge on reconnect, with no length limit on the Yjs stack. If the spike forces the prosemirror-collab fallback, the promise shrinks to "brief disconnects never lose work", stated honestly.

=====================================================
PART 5. ARCHITECTURE
=====================================================
5.1 Stack.
- TypeScript everywhere, in a pnpm monorepo.
- apps/web: React + Vite, styled with plain CSS using the Part 3 tokens. No Tailwind.
- apps/sync: a custom Node WebSocket sync server on Yjs's y-protocols (sync and awareness). Hocuspocus is a reference only.
- apps/api: Fastify REST API.
- packages/schema: ProseMirror schema, element types, state machine, ID plugin.
- packages/pagination: the pure pagination function.
- packages/shared: types and the wire protocol.
- infra: AWS CDK in TypeScript.
- tools/loadtest: the load-test harness.
- Local development uses docker compose with Postgres, DynamoDB Local and an S3-compatible store, and can run 3 sync nodes locally.

5.2 Data model.
- Postgres:
  - users
  - series
  - series_members (role: showrunner, writer or viewer)
  - episodes
  - episode_writers (assignment)
  - invitations
  - drafts (main or what-if per episode: creator, base snapshot reference, created time)
  - snapshots (draft, S3 key, kind automatic or manual, label, created by, time)
  - usage_events (counts only)
- Each episode's main draft is one Y.Doc, and each what-if is its own Y.Doc forked from a snapshot of main. What-ifs fork from main only, never from another what-if.
- Series-level data lives outside the Y.Docs, so the model supports a full series from day one.

5.3 Roles and permissions.
- Showrunner: everything, including inviting new people into the series, assigning episodes, editing any episode, and removing anyone.
- Writer: edits their assigned episodes and reads the rest. A writer can add any existing series member as a co-writer on their own episode (the showrunner sees every assignment), create what-ifs of their episodes, and send to main on their episodes without approval.
- Viewer: read-only.
- Whoever creates a series is its showrunner.
- Enforcement happens at the home sync server per connection: read-only connections have their updates rejected. Roles stay coarse (edit or view per episode) in v1.
- Route every permission check through one function, canEdit and canMerge(user, scope), with scope at episode level now and scene level later, so cross-episode proposals and scene locks can slot in later.

5.4 Scaled sync service (the systems centerpiece).
- Each episode document has exactly one home server, chosen by consistent hashing with virtual nodes over the live membership list (server heartbeats in DynamoDB).
- Any server accepts a client's connection and, if it isn't the home, forwards the connection internally to the home server.
- Ownership is a lease in DynamoDB: the owner renews it every few seconds, and it expires otherwise. A new owner waits for expiry, then acquires it with a conditional write that increments an epoch number, the fencing token. (Propose exact renew and expiry timings.)
- Every incoming update is appended to the durable edit log in DynamoDB, with a conditional check that the writer's epoch is still current, before it's acknowledged and broadcast. A server with an outdated epoch is rejected.
- Clients keep unacknowledged updates and resend them on reconnect. Yjs ignores duplicates, which gives zero lost edits.
- Snapshots: periodically compact the Y.Doc state to S3 and truncate the log below the snapshot.
- Failover: the next owner loads the latest snapshot plus the log tail. Yjs merging is the safety net if two servers ever briefly both accept edits; the writer-visible cost is a pause of a few seconds.
- Reconnects use exponential backoff with full jitter, and virtual nodes spread a dead server's scripts across many servers.
- When servers are added or removed, handoff is graceful: save, release the lease, redirect clients. Idle scripts move first.
- Authentication tokens are verified on connect.

5.5 AWS (lean).
- Frontend: S3 + CloudFront.
- Compute: one small always-on ECS Fargate container for beta.
- DynamoDB on demand: edit log, leases, membership.
- A small Postgres.
- Infrastructure: CDK in TypeScript.
- AWS Budgets alarms around $20 and $40 a month, set up before the first deploy.
- The multi-node cluster is defined in CDK, spun up only for load tests and demos, then torn down.
- Never Lambda with API Gateway WebSockets: it's stateless, which breaks the home-server design.

5.6 Authentication. Amazon Cognito with our own Highland-style sign-in screen (no hosted UI): email one-time codes plus Google sign-in, no passwords. JWTs are verified by the API and sync servers. Invites go out as email links. Before Cognito exists, use a clearly marked development auth stub; propose how to gate the first AWS deploy.

5.7 PDF export and import.
- PDF is generated in the browser from the pagination output (for example with pdf-lib, with Courier Prime embedded), so page breaks, page numbers, (MORE) and (CONT'D) match the screen exactly.
- Import Final Draft (.fdx XML paragraph types) and Fountain into our block types.
- Exports to .fdx and Fountain are future versions.

5.8 Pagination (packages/pagination). Pagination is a pure function of the document blocks, so every client computes identical page breaks independently and nothing about pages is synced.
- Line wrapping is computed by character count, which works because the font is monospace; never measure the DOM.
- About 54-55 lines per page.
- Rules:
  - Never end a page with a scene heading.
  - Keep a character cue with at least its first dialogue line.
  - Split dialogue at a sentence boundary, with (MORE) at the bottom and "NAME (CONT'D)" at the top of the next page.
  - Never strand a parenthetical at a page bottom.
  - Keep transitions with the preceding block.
  - Split action only at sentence boundaries, with at least 2 lines on each side.
- Recompute incrementally from the first changed block, with memoized line counts.
- Viewports anchor to block IDs, so remote edits above you never move what you're reading.

5.9 Usage measurement. Count events only; never record script content. Events: session started, session with 2+ concurrent writers, what-if created, scene sent, script imported, PDF exported. The weekly return rate is derived from these.

=====================================================
PART 6. PLAN, CHECKPOINTS AND CUTS
=====================================================
- The spike comes first (2-3 days) and gates the stack.
- Phase 1 (lands around week 5-6 after the spike): editor, element state machine, Yjs sync, the scaled sync service, load tests, deployed on AWS. Hard checkpoint at the end of week 6.
- If Phase 1 slips, cut in this order instead of extending: (1) server rebalancing, so v1 runs a fixed number of servers; (2) virtual nodes, accepting a brief reconnect spike; (3) autocomplete; (4) long offline sessions, shrinking the promise to brief disconnects.
- Never cut: the Enter/Tab element editor, zero lost edits, failover with leases and fencing tokens, the load tests.
- Phase 2: accounts, roles and home; pagination, page view, PDF and import. The closed beta starts after Phase 2 and Arnav's own thorough testing: roughly 5-10 writing pairs or small rooms recruited from UofT film and screenwriting clubs, Toronto film programs, and online communities.
- Phase 3: what-ifs and the full Send to main / Compare system.
- Then beta hardening.
- Whole v1: roughly 8.5-10.5 weeks after the spike.
- I'll feed you one phase prompt at a time. Each says what to read, what to build, which decisions to bring me, and how we'll know it's done.
