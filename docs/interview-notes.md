# Writers' Room: Interview Notes

A short brief for talking about the project: the pitch, the four hardest problems with their mechanism and tradeoffs, the numbers you can quote (and how they were measured), and the questions to expect. The deep versions are `docs/sync-cluster.md` (the sync service), `docs/decision-log.md` (every decision, with rejected options), and the code paths named below.

## The pitch (30 seconds)

"Writers' Room is a real-time collaborative screenwriting tool for TV writers' rooms. Several writers edit one episode at once; anyone can fork a what-if, rewrite scenes, and send chosen scenes back to the main script. Under it is a sync service I built from scratch: every script has one home server, picked by consistent hashing; ownership is a DynamoDB lease with a fencing token; every keystroke is durably appended before anyone sees it; and when a server dies, another takes over in about six seconds with zero lost edits, which a chaos suite and a load-test harness prove."

## 1. Exactly one writer per script: leases and fencing tokens

**The problem.** With several servers, two can believe they own the same script: a garbage-collection pause, a frozen VM or a network partition can stop a server for longer than its lease, and it wakes up still thinking it's the owner. If both accept edits, their histories fork.

**The mechanism** (`apps/sync/src/storage/coordination.ts`, `dynamo.ts`, `room.ts`):
- **The lease** is one DynamoDB item per script, `{ owner, epoch, expiresAt }`.
  - **Acquire:** a conditional write that only succeeds if the lease is free or expired, and it increments `epoch`. DynamoDB serializes conditional writes per item, so when several servers race, exactly one wins (tested with eight racers).
  - **Renew** every 2 s; **expire** after 6 s.
  - **Release** on a graceful handoff, so the next owner needn't wait.
- **The fencing token is the epoch.** Every edit-log append is a `TransactWriteItems`: a `ConditionCheck` that the lease still names this server and this epoch, plus the `Put` of the log item. A stale owner's write fails at the storage layer, whatever its own clock or memory says. On that failure it steps down at once.
- **Snapshots are fenced too:** the snapshot pointer only moves forward, in a fenced transaction, and the log is truncated only after the pointer moves. So a paused old owner can never overwrite a newer snapshot and delete edits.
- **Belt and braces:** a new owner also waits for an unexpired lease to run out before taking over.

**Tradeoffs to talk about:**
- **Lease length (6 s):**
  - Shorter means faster failover, but a slow network or a long GC pause then causes needless failovers.
  - Longer means fewer false alarms, but writers wait longer when a server really dies.
  - 2 s renewals give three chances before expiry.
- **Why DynamoDB conditional writes, not ZooKeeper, etcd or Raft:** the edit log already lives in DynamoDB, so putting the fence in the same transaction as the append makes the check and the write atomic, with no second system to run. The cost is that the lease's expiry uses server wall clocks. Clock skew can only make failover slower or faster; it can never let two servers write, because the fence, not the clock, decides.
- **Membership is only a routing hint.** Servers heartbeat into a table, and every server builds the same consistent-hash ring (256 SHA-1 virtual nodes each, so a dead server's scripts spread over every survivor). They can disagree for a moment; the lease decides who writes.

## 2. Failover with zero lost edits

**The promise:** an acknowledged edit is durable; an unacknowledged edit is still on the writer's device and is resent.

**The mechanism:**
- **Append, apply, broadcast, ack, in that order,** one update at a time per script (`room.ts`, `ingest`). Nothing is broadcast or acknowledged before the append resolves. If the append fails, the writer is disconnected and resends.
- **Resending is the Yjs handshake, not a queue.** On every connect the client and server swap state vectors and send each other exactly what the other lacks. Yjs ignores duplicates, so resending is always safe, even after a crash mid-append.
- **Taking over** means loading the latest S3 snapshot, then the log entries after it. Large updates are chunked under DynamoDB's 400 KB item limit, and an incomplete chunk group from a crash is skipped (it was never acknowledged).
- **Holding writers through the gap:** the server a writer reached keeps their messages, answers their heartbeats and retries the new home every 500 ms. So a failover costs one reconnect, not an exponential backoff.

**Measured:**
- **The chaos suite** (real server processes, SIGKILL and SIGSTOP): a crash costs writers about 6-8 s, a frozen server about 10-13 s (the client's 10 s heartbeat, then a reconnect), with every word surviving.
- **The load test** locally: a server SIGKILLed mid-run made keystrokes wait at most 6.6 s, with 0 lost characters and every edit acknowledged.
- **AWS numbers** come from the load-test cluster (`docs/metrics.md`).

**Tradeoffs:**
- **Every keystroke pays a DynamoDB round trip before anyone sees it.** That costs latency (milliseconds in-region) and money (a transactional write per keystroke, which is why the beta's cost is mostly DynamoDB at scale), in exchange for "acknowledged means durable".
- **Updates are appended strictly in order per script.** That's simple to reason about (one log, no gaps), but it caps one script at one update per round trip. The next step would be **group commit**: merge the updates queued behind a slow append into one log entry, keeping append-before-ack while multiplying throughput. It's measured and noted, not built (D-092).

## 3. Pagination as a pure function

**The problem:** a screenplay's page count is the unit of the industry (a page is about a minute of screen time), so every writer must see the same page breaks, and the PDF must match the screen. Syncing page breaks would mean conflicts; measuring the DOM differs between machines.

**The mechanism** (`packages/pagination`):
- **The input is the document's blocks; the output is lines and page breaks.** No DOM, no state, no I/O, so every client computes identical pages on its own, and nothing about pages is ever synced.
- **Wrapping by character count:** Courier Prime is monospace, so each column is an exact number of characters (60 for action, 35 for dialogue, 24 for parentheticals).
  - **Where a line may break** comes from a table I measured in Chromium: 80 characters, every pair, plus one context rule (a hyphen before a digit binds like a minus sign).
  - **Half a pixel of slack per column,** because Chromium lays text out in 1/64 px, so a column exactly N characters wide could lose its last character to rounding.
- **The page rules** (Final Draft's):
  - 54 lines a page;
  - no scene heading at the bottom of a page;
  - a cue stays with its first line of dialogue;
  - a split speech gets (MORE) and NAME (CONT'D), split at a sentence end;
  - no stranded parenthetical;
  - a transition stays with the line before;
  - an action splits only at a sentence end, with two lines on each side;
  - (CONTINUED) and CONTINUED: where a scene runs on.
- **Incremental:** a page is reused unless its layout looked at the changed block, so an edit near the end re-paginates only the end.
- **The same output drives everything:** page view (widgets between lines that fill out each page, with zero height in the open view, so nothing rewraps when you toggle) and the PDF (pdf-lib with the same font file). A browser test checks every line on screen against what the PDF draws.

**Measured:**
- A 118-page script paginates in about 2 ms; an edit near the end re-paginates in about 0.04 ms.
- Typing on 110 pages stays under 2 ms of editor work per key, with three writers, in both views.

**Tradeoffs:**
- **It relies on the browser wrapping exactly as the table says.** Chromium and Safari match it on 1,500 test paragraphs; Firefox breaks a few pairs differently (about 1% of action paragraphs), so it's supported with a note (D-089). The alternative, measuring the DOM, would be exact on screen but different on every machine, and a server-side PDF couldn't share it.
- **The browser is the reference, not the other way round:** if Chromium changes, a test fails and prints the newly measured table.

## 4. The scene-level three-way comparison (what-ifs)

**The problem:** a what-if is a fork of an episode. When a writer sends scenes back, the tool must know, per scene, whether only the what-if changed it (safe to send), whether main changed it too (look first), or neither. It must also cope with scenes that moved, split or merged, and with co-writers typing in main at the same moment.

**The mechanism** (`packages/schema/src/whatif.ts`, `apps/web/src/whatif/`):
- **Three inputs:** the base (a snapshot of main taken when the what-if was forked), the what-if, and main now. Scenes are matched by a stable scene ID on each heading and compared by content hash.
  - **Blue:** only the what-if changed it.
  - **Amber:** main changed it too.
  - **"Sent ✓":** it matches what this what-if last sent.
  - Changes only main made are ignored.
- **Moves** are the scenes outside a longest common subsequence of scene order, so swapping two scenes flags one, not everything after them. **Splits and merges** are found through shared line IDs, and those scenes are sent together.
- **Send to main is an ordinary edit,** not a merge:
  - main's new lines are written with y-prosemirror's own diff, so unchanged lines (where a co-writer may be typing) aren't touched;
  - the transaction has its own origin, so a Yjs UndoManager scoped to it undoes exactly that send and nothing typed since;
  - a restore point is saved first.
- **It reruns at most once a frame:** 4.2 ms at 110 pages.

**Tradeoffs:**
- **Scenes, not lines, are the unit,** because that's how writers think and send. The cost is coarseness: if main changed one line of a long scene, the whole scene turns amber and opens Compare rather than auto-merging. That's deliberate, since auto-merged prose can read wrong, and there's no full-screen merge dialog (a spec rule).
- **What was sent is remembered in the what-if's own document,** so "Sent ✓" is exact, and a re-edited sent scene turns blue again rather than staying amber forever.

## Other decisions worth defending

- **A CRDT (Yjs), not operational transformation.**
  - **For:** offline editing merges deterministically, and the server never has to transform operations.
  - **Against:** y-prosemirror replaces the whole ProseMirror document on every remote change. That set three rules for all editor code: never append a fix in the same dispatch as a remote change; recompute every decoration from the document; and anchor the viewport to the cursor's block (D-012, D-013).
- **A home server per script, not a stateless fleet.** Yjs needs one in-memory document per script to merge and broadcast. AWS Lambda with API Gateway WebSockets was rejected for that reason (stateless, so no home).
- **One small task runs both the API and sync for the beta,** behind CloudFront with a private VPC origin, so the load balancer has no public address. The multi-server cluster is spun up only for load tests.
- **Usage is counted, never content** (SPEC 5.9): events with a user, a script and a time, mostly recorded by the servers, so ad blockers can't skew them.
- **Accessibility was audited by test,** not by eye: contrast against the composited background on every screen in both themes, names on every control, and visible focus, in CI.

## Numbers you can quote

| Claim | Number | Source |
|---|---|---|
| Failover pause, crashed server | about 6-8 s, zero lost edits | chaos suite (D-023); load test 6.6 s locally (D-092) |
| Failover pause, frozen server | about 10-13 s | chaos suite (D-023) |
| Editor work per keystroke, 110 pages, three writers, both views | under 2 ms p95 | D-087, `docs/metrics.md` |
| Remote update cost, 110 pages | 3.5 ms p95 | D-087 |
| Pagination, 118 pages | about 2 ms; 0.04 ms incremental | D-078 |
| Three-way comparison, 110 pages | 4.2 ms | D-087 |
| Sync load: 1,000 writers, 200 scripts, 3 servers | *pending the AWS run* | `docs/metrics.md` |

Say where a number came from: the local load numbers prove behavior, not capacity, because DynamoDB Local processes writes one at a time (about 100-150 appends a second on a laptop).

## Questions to expect

- **"What if DynamoDB is down?"** Writers keep typing; their edits wait on their devices (memory and IndexedDB) and are resent when it's back. Nothing new is acknowledged meanwhile, so nothing is lost; the server refuses the append and drops the connection, so they see "Reconnecting…" or "Syncing…" until it's back. Availability is traded for durability, on purpose.
- **"What about clock skew?"** It can only shift when a lease looks expired. The fencing check in storage is what stops a second writer, and it doesn't read any clock.
- **"Why not Postgres for the log?"** DynamoDB gives per-item conditional writes and transactions at any scale, with no connection limits, and no database server to run. Postgres holds what is relational (accounts, roles, series).
- **"How do you know no edits were lost?"** The load test types a known string per writer, reads every script back with a fresh client at the end, and compares character by character. The chaos suite does the same with real processes killed and frozen.
- **"What would you build next?"** Group commit for busy scripts; then the AI continuity checker and the Beats board (both seams in v1); then the series-level product.
