# Spike report: can ProseMirror + Yjs handle our editor?

October 20, 2026 · Status: **proposal, awaiting Arnav's call** (decision log D-012)

## Verdict

**Yes, with four design changes.** Yjs 13.6 + y-prosemirror 1.3.7 passed all 8 tests: every run converged and no text was lost. That holds as long as we store each block's element type as an attribute rather than as its own ProseMirror node type, and apply three binding-specific fixes (below). Under the other design, with one node type per element, Yjs lost writers' text in tests 3 and 4. Loro and the prosemirror-collab fallback aren't needed, so the offline promise in SPEC 4.9 stands.

| # | Test | Result (recommended design) | One-line proof |
|---|------|------|------|
| 1 | Concurrent Enters at line ends | **Pass** | Both writers' new lines kept, each writer's order preserved, IDs unique |
| 2 | Mid-line split while the other types in the tail | **Pass, degrades as allowed** | No character lost or duplicated, structure valid; the other writer's text can land on the first half of the split line |
| 3 | Type change while the other types in the block | **Pass** (fails with one node type per element) | Typing survives Tab and menu type changes; two clashing type changes converge to one |
| 4 | Both offline, edit, reconnect | **Pass** (fails with one node type per element) | 1,500 random edits per writer: all 2,086 inserted tokens present exactly once after a 19 ms merge |
| 5 | Remote edits above your cursor | **Pass** with block-ID anchoring | Cursor kept its exact place; your line moved 0 px; page breaks correct on every frame |
| 6 | Undo | **Pass** with one setting changed | Split, Enter type switch and Tab each undo in one step; undo never touched the other writer's text |
| 7 | 110-page performance | **Pass** | p95 9 ms per keystroke, p95 3.5 ms per remote update, editor opens in 25 ms |
| 8 | What-if fork and Send to main | **Pass** | Correct per-scene status, scene sent as an ordinary edit, one undo reverts it, histories never mixed |

## What the spike built

Throwaway code in `spike/` (deleted after your call):

- `src/schema.ts`: the flat block schema from SPEC 4.1, in two variants so we could compare them:
  - **nodeTypes:** one ProseMirror node type per element (`scene_heading`, `action`, …).
  - **typeAttr:** a single `block` node whose `type` attribute holds the element type.
- `src/editor.ts`: the Enter/Tab state machine from SPEC 4.2, where each switch is one transaction; the block and scene ID plugin from SPEC 4.6; a fake page-break decoration computed by character count; and the binding of the editor to a Y.Doc with y-prosemirror's sync and undo plugins.
- `src/net.ts`: a fake network between Y.Docs.
  - Online, updates are delivered on the next task.
  - Offline, nothing is delivered. Reconnecting exchanges state vectors, the way y-protocols' sync step 1/2 will in the real server.
- `src/scenes.ts`: grouping blocks into scenes by scene ID, the three-way scene status, a word diff, and Send to main.
- `test/`: the 8 tests, 56 test cases across both variants.
- `demo/`: two editors side by side with an offline/reconnect button (`pnpm --filter @wr/spike dev`).

**How the tests run (D-011):**
- Vitest browser mode in real headless Chromium (Chrome Headless Shell 156) through Playwright, on Arnav's MacBook (Apple M2, 8 GB).
- Typing uses **real key presses** (Playwright's keyboard), so the Enter/Tab keymap and ProseMirror's handling of DOM input are exercised for real.
- Concurrency is made deterministic. Both clients go offline, both edit, then they reconnect, so every "simultaneous" case is genuinely concurrent and repeatable.
- Every result is printed as an `[EVIDENCE …]` line in the test log, and the numbers below come from the final clean run (56 of 56 passed, 94 s).

## The four design changes the spike forces

These are the important part of the report. Each one is a decision for the real build.

### F1. Store the element type as an attribute, not as the node type (decides tests 3 and 4)

- **The cause:** in y-prosemirror, a ProseMirror node's type becomes the Yjs element's *name*, and a Yjs element's name can never change. So with one node type per element, changing Action to Character deletes the block and creates a new one.
- **What that does to writers:** anything a co-writer typed into that block at the same moment goes into the deleted copy and is lost. If two writers change the same block's type at once, the line is duplicated.
- **The fix:** with the type stored as an attribute, a type change just edits the attribute in place. Yjs merges concurrent attribute changes by "last writer wins", so the block is never recreated.

Evidence, from the version with one node type per element:
- **Tab during typing:** dialogue "We can still fix this." becomes a parenthetical while the other writer types " Please." Result: "We can still fix this." *(" Please." lost)*.
- **Two clashing type changes:** one writer chose Character, the other Shot, and one also typed. Result: the line appears twice, `shot: She does not believe it either. Hold on her.` and `character: She does not believe it either.`
- **Long offline session:** 260 of 2,086 tokens (12%) were lost or duplicated.

The same three cases with the type as an attribute: nothing lost, nothing duplicated.

SPEC 4.1's element types are unchanged. They just live in an attribute. **This is the main decision to make (P1 below).**

### F2. Never "fix up" the document in the same step as a remote change (found in test 3)

- **The cause:** y-prosemirror applies a remote change while holding an internal lock, and any transaction appended during that dispatch, such as our ID plugin re-numbering a duplicate ID, is **never written to Yjs**.
- **What that does to writers:** each writer's screen quietly drifts away from the shared document and from each other. Test 3 caught exactly this before the fix: two clients showed different block IDs for the same line.
- **The fix in the spike:** fix-ups after local edits stay in `appendTransaction`, as SPEC 4.6 says. After a remote change, the repair runs as a separate, deferred local transaction, which syncs normally.
- **What else it covers:** anything that auto-corrects the document must follow the same rule. The formatting warnings in SPEC 4.5 are fine, because they're decorations, and their one-click fix is a user action.
- **Still open:** two clients can both repair the same duplicate after a merge. They converge (last writer wins), but the real build should make the repair deterministic so both pick the same new ID.

### F3. Anything tied to document positions must be recomputed from the document, or keyed by block ID (test 5)

- **The cause:** on every remote change, y-prosemirror 1.x replaces the *whole* ProseMirror document (it restores your cursor from Yjs relative positions afterwards).
- **The proof:** decorations that are mapped through transactions (the usual ProseMirror approach) vanish. In the control test, 20 page-break markers became 0 after one remote keystroke.
- **The fix:** the page breaks computed from the document on every change (which is exactly how SPEC 5.8 already designs pagination) were correct on every sampled animation frame. Markers whose page didn't move kept the same DOM node, so nothing flickered.
- **The cost:** recomputing breaks for 110 pages takes 0.1-0.2 ms.
- **What this means for the real build:** future position-based features (comment anchors, bookmarks, remote-cursor labels) must use block IDs or Yjs relative positions, never raw positions.

### F4. Configure two binding settings: scroll anchoring and undo protection (tests 5 and 6)

- **Scroll anchoring.** When a co-writer adds text above you, page breaks reflow. A break that moves into the space between the top of the screen and your cursor pushes your line down by about 32 px.
  - The browser's built-in scroll anchoring can't prevent that, because it anchors to the top of the viewport.
  - Anchoring to **the block your cursor is in**, as SPEC 3.7 already says for collapse, held your line at **0 px** through every kind of remote edit.
  - Without any anchoring it moved up to 327 px.
- **Undo protection.** By default, y-prosemirror's undo only protects nodes named `paragraph`.
  - Under the default, undoing your split after a co-writer typed into the new line **deleted the co-writer's text**.
  - With every block type protected, their text survives as its own line. This is a one-line setting, with no alternative worth weighing.

## Results test by test

Each test shows what it checks, what happened, and what it proved in plain English. "Both designs" means both schema variants behaved the same.

### Test 1: concurrent Enters at the end of lines (Pass, both designs)

- **Checks:** both writers press Enter at the end of the same line and type; Enter at different lines; five Enter+word pairs each at the same spot.
- **Evidence:**
  - Same line: both new lines exist (`action: Beta line.`, `action: Alpha line.`) and the original line is untouched.
  - Bursts: `A1…A5` and `B1…B5` each kept their writer's order.
  - Block IDs were unique in every case, and the reconnect sent 171-212 bytes.
- **What it proved:** when two writers start new lines at the same place, both lines survive in a stable order on every screen. This is the most common collaborative structural edit, and it's solid.

### Test 2: mid-line split while the other writer types in the tail (Pass; degrades as allowed)

- **Checks:** writer A presses Enter in the middle of a line while writer B types at the end of it, inside the second half, or in the first half. A live variant does the same with the network on and B typing character by character.
- **Evidence:** every case converged, kept a valid structure, and lost or duplicated no character (checked by comparing exact character counts). Where B's text landed:
  - **Typing at the end:** `Rain hammers the window.  Thunder.` / `MARA grips the counter.` B's text moved to the *first* half.
  - **Typing inside the second half:** `Rain hammers the window. (wet) ` / `MARA grips the counter.`, also moved to the first half.
  - **Typing in the first half:** stays exactly where typed.
  - **Live:** `Rain hammers the window. tning cracks.` / `MARA grips the counter. Ligh`. B's in-progress word was torn across the two lines.
- **Why:** Yjs can't move text between elements. A split is "shorten this line, then create a new line containing a copy of the second half", so text typed concurrently into the original second half stays with the original line.
- **What it proved:** the rule "may degrade gracefully but must never corrupt" holds. Nothing is lost, but the other writer may have to move a few words back. It only happens when someone splits the exact line another writer is typing in, which the "writers coordinate and take different scenes" premise makes rare. A mitigation exists if beta writers hit it (P2).

### Test 3: element type change while the other writer types in the same block (Pass with type-as-attribute; fails otherwise)

- **Checks:**
  - Tab turns dialogue into a parenthetical (a real key press) while B types in it.
  - An element-menu-style change turns Action into Character while B types.
  - Both writers change the same block to different types while one also types.
- **Evidence (type as attribute):** `parenthetical: We can still fix this. Please.`. Typing kept in both single-change cases. With two clashing changes, one type wins on both screens (`character`), and the text appears once.
- **Evidence (one node type per element):** the typing was lost in both single-change cases, and the line was duplicated in the clash case (see F1).
- **What it proved:** this test decides the schema. Writers change element types constantly (every Tab), so the design where that can silently eat a co-writer's words is unacceptable.

### Test 4: both writers offline, both edit, then reconnect and merge (Pass with type-as-attribute)

- **Checks:**
  - **A realistic session with real keys:** A finishes a scene with Enter, Tab, a character cue and dialogue, while B rewrites a line in the same scene and adds to another.
  - **A long offline session:** 1,500 random edits per writer on a 20-page script. The edits are 70% insertions of unique tokens, 15% Enter splits and 15% type changes.
- **Evidence:**
  - The realistic session converged with every edit in place.
  - Long session, type as attribute: 2,086 of 2,086 tokens present exactly once. The merge sent 130 KB and took 19 ms, and the document grew from 66 KB to 194 KB.
  - Long session, one node type per element: 260 tokens lost or duplicated.
- **What it proved:** a writer can work offline for a long session, and the merge on reconnect keeps everything. That's the offline promise in SPEC 4.9, with no length limit in sight. It also confirms F1 at scale.

### Test 5: remote edits above your cursor (Pass with cursor-block anchoring)

- **Checks:** you're working 300+ blocks down a 20-page script (516 blocks) while a co-writer, above you, makes six kinds of edit:
  - inserts 3 lines at the top
  - types 40 characters, one update per keystroke
  - deletes a line
  - changes an element type
  - splits a line
  - pastes 30 lines

  Four scroll setups were run: the browser's built-in anchoring, no anchoring, anchoring to the top visible block, and anchoring to the cursor's block.
- **Evidence:**

  | Scroll setup | Your line's movement after each edit (px) |
  |---|---|
  | None | 112, 128, 96, 112, 128, 327 |
  | Browser built-in | 32, 32, 32, 32, 32, 0 |
  | Top visible block | 32, 32, 32, 32, 32, 0 |
  | **Cursor's block** | **0, 0, 0, 0, 0, 0** |

  In every setup:
  - Your cursor stayed at the same block and offset after every edit.
  - Page breaks matched the document on every animation frame sampled during the edits, with 0 bad frames.
  - Only the edited block was re-rendered: 0-1 block elements replaced per edit, out of 516.
  - If the co-writer deletes the line your cursor is in, your cursor moves to the start of the next line.
  - The mapped-decoration control lost all 20 page breaks after one remote keystroke (F3).
- **What it proved:** remote edits above you don't move what you're looking at, don't move your cursor, and don't make the page breaks flicker. This needs block-ID anchoring and decorations computed from the document, both of which the spec already calls for.

### Test 6: undo (Pass, with the protection setting from F4)

- **Checks:**
  - Undo after a mid-line split, after an Enter that switched Character to Dialogue, and after a Tab.
  - Undo with the other writer's edits on the same line and elsewhere.
  - Undoing a split after the other writer typed into the new line, under both protection settings.
- **Evidence:**
  - One Mod-Z restored the exact pre-split document, and a second Mod-Z removed the earlier typing.
  - The Enter type switch and the Tab each undid in one step.
  - After A's undo, B's ` BBB` and ` BBB2` were untouched on both screens.
  - Split undone after B typed into the new line: with protection the result is `Rain hammers the window. MARA grips the counter.` / ` (B was here)`; under the default setting B's line was gone.
- **What it proved:** undo is per writer and never takes back someone else's work, and every type switch is one undo step (SPEC 4.2, 4.7). Not tested here: by default, Yjs's undo manager groups edits made within 500 ms of each other into one step (like ProseMirror's own history), so a split typed straight after other typing would undo together with it. The tests pause before splitting to test the split alone. Whether to keep that default is an editor-phase detail.

### Test 7: performance on a ~110-page script (Pass)

The script: 110 pages, 2,525 blocks, 113,374 characters, and a 352 KB Yjs document. The thresholds were fixed before measuring: p95 at or under one 60 fps frame (16 ms) for keystrokes and remote updates, and an editor open time at or under 1,500 ms.

| Measure (type as attribute) | Result |
|---|---|
| Open the editor on the 110-page document | 21-25 ms |
| Decode the document from its Yjs update | 12 ms |
| Local keystroke (state + DOM + sync into Yjs), typing alone | p50 5.9 ms · p95 8.0 ms · max 16 ms |
| Remote keystroke applied on the other screen | p50 3.0 ms · p95 3.5 ms · max 4.1 ms |
| Both writers typing at once: local / remote on A | p95 5.4 ms / p95 5.1 ms |
| Recompute all page breaks | p95 0.1 ms |
| Update size per keystroke | median 22 bytes |
| JS heap | 35 MB |

- **How it was run:** about 10 characters per second (a fast typist), real key presses, an Enter every 20 characters, 200 keystrokes alone and then 150 per writer typing together.
- **The one-node-type-per-element version** performs about the same.
- **What it proved:** a feature-length script stays well inside one frame per keystroke, even with two writers typing. Local cost grows with document length, because y-prosemirror diffs the top-level block list on each change, but 110 pages has 2x headroom.

### Test 8: what-if fork and Send to main (Pass, both designs)

- **Fork:** the what-if is a *new* Y.Doc loaded from main's snapshot bytes (1.2 KB here), the way S3 will hold it, with no connection to main.
- **Edits:**
  - What-if: rewrites Mara's line (scene 1) and adds to the harbor action (scene 2).
  - Main's other writer: adds to the harbor action (scene 2) and the office (scene 3).
- **Evidence:**
  - Status from the three-way comparison (fork snapshot, what-if, current main), by scene ID: kitchen `differs`, harbor `conflict`, office `same`. That's exactly the blue dot, amber dot and no dot of SPEC 3.9.
  - Diff render of the kitchen scene: `<ins>It</ins><del>We</del> <ins>is</ins><del>can</del> …`. It's correct, but word-by-word. The real build should group changes into phrases.
  - Send to main: the kitchen scene is copied into main as one ordinary ProseMirror edit while the other writer types in the office scene. Both screens converged, the kitchen line became `It is already too late.`, and the office line kept both of the other writer's additions. The kitchen scene's status then became `same`, so its dot would disappear.
  - Undo: one Mod-Z on the sender reverted the kitchen line to `We can still fix this.`, and the other writer's office edits survived.
  - Sending while a co-writer types in the *same* scene: their typing in a line the send didn't change (` Thunder.`) survived. y-prosemirror turns the replaced scene into in-place text edits wherever the blocks still match.
  - Histories: main contains no Yjs items from the what-if's client, and the what-if none from main's later writer. The two documents never merged.
- **What it proved:** the what-if model in SPEC 5.2 and 3.9 works on Yjs as designed. Fork from a snapshot, compare by scene ID, send as an ordinary edit that syncs and undoes, never merge histories.

## Limits of this spike (read before trusting the numbers)

- **The network was simulated in the page.** It had no WebSocket, no real latency, no server and no lost packets. The server side (y-protocols over WebSocket, the edit log, failover) is Phase 1's job and has its own load tests.
- **Only Chromium was tested**, and headless. Safari and Firefox handle `contenteditable` input differently. The editor phase should run the key tests in WebKit and Firefox (Playwright supports both).
- **One laptop** (Apple M2, 8 GB). Slower machines will be slower, but there's about 2x headroom at 110 pages.
- **The browser's own "slow interaction" counter isn't trustworthy in headless mode.** It reported many input events between 16 and 32 ms because headless frame timing rounds up to whole frames, so the report relies on measured dispatch times instead. One long task (about 100-160 ms) occurred once per run during solo typing, probably first-keystroke warm-up. It should be watched in the editor phase.
- **The test 2 "live" case depends on timing.** Exactly how the in-progress word tears can vary, but the guarantee that no character is lost held in every run.
- **IDs, pagination and the diff were crude stand-ins:** random IDs, character counts without word wrapping, and a word-by-word diff. None of these change the conclusions.
- **Not tested:** IndexedDB persistence across reloads (open decision 8), remote cursors (open decision 3), and copy-paste between scripts.

## Proposed decisions (awaiting Arnav)

**P1. How to store the element type. Recommendation: (a).**
- (a) **One `block` node with a `type` attribute.** Type changes are safe under concurrency (tests 3 and 4). Writers see no difference. Code is a little less "ProseMirror-idiomatic": per-type rules live in our code (the state machine, keymaps and CSS), not in the schema.
- (b) One node type per element (SPEC 4.1 read literally). Every Tab can silently delete a co-writer's words. Rejected by the evidence.
- (c) One node type per element, plus custom binding code that turns type changes into attribute edits. That's possible but means maintaining a fork of y-prosemirror's diffing, for no writer-visible gain.

**P2. The split degradation (test 2). Recommendation: (a).**
- (a) **Accept it for v1** and watch for it in the beta. Nothing is ever lost; at worst, a co-writer moves a few words.
- (b) Smarter splits: when another writer's cursor is in the second half of the line, keep the original element for that half and copy the first half instead. It's about 1-2 days of custom binding work, and it only moves the problem to whoever is typing in the first half.

**P3. Fix-ups after remote changes (F2). Recommendation: (a).**
- (a) **A deferred local transaction, as in the spike**, made deterministic in the real build so all clients choose the same new ID.
- (b) Only one elected client repairs. That's more moving parts, and it fails when that client is offline.
- (c) The home sync server repairs. That needs the server to understand ProseMirror documents, which it otherwise doesn't need to.

**P4. Viewport anchoring (F4). Recommendation: (a).**
- (a) **Anchor to the cursor's block when it's on screen, otherwise the top visible block.** 0 px of movement.
- (b) The browser's built-in anchoring. Zero code, but your line still moves about 32 px whenever a page break reflows.

**Not decisions, just required settings:**
- Protect every block type in the undo manager (F4).
- Recompute every decoration from the document, and key anything position-based by block ID (F3).

**Proposed regression budget:** keep test 7 as a performance test in the real editor package, failing if p95 rises above 16 ms at 110 pages.

## What happens next

On your approval:

1. `spike/` is deleted, along with its line in `pnpm-workspace.yaml` and its entry in `eslint.config.js`. This report stays.
2. The adopted decisions are logged as Arnav's calls, and SPEC 4.1 and 4.6 are updated to match. P1 changes how "types" are stored, and P3 changes when the ID plugin runs.
3. Phase 1 starts with the editor, carrying over the tests that matter: convergence, undo, anchoring and performance.

## How to reproduce

```sh
corepack pnpm --filter @wr/spike exec playwright install chromium   # once
corepack pnpm --filter @wr/spike test                                # all 56 cases, ~95 s
corepack pnpm --filter @wr/spike dev                                 # the two-editor demo
```

Each test prints `[EVIDENCE <test>] {json}` lines. The complete log of the final run was `spike/evidence/full-run.log`. Its key lines are quoted throughout this report, because the spike folder will be deleted.
