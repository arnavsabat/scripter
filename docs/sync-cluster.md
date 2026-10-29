# How the sync cluster works

This is the systems centerpiece (SPEC 5.4; decisions D-018, D-019 and D-022). It's written to be read before an interview: each section gives the mechanism, why it's built that way, and what would go wrong without it. The code is in `apps/sync/src` and the wire protocol is in `packages/shared/PROTOCOL.md`.

## The promise

- Several servers share the load. Any of them can die, freeze, join or leave while people are typing.
- **Zero lost edits.** An edit the server has acknowledged is durable. An edit it hasn't acknowledged is still in the writer's browser (in memory and in IndexedDB), and it's resent on reconnect.
- **One writer per episode at a time,** even when servers disagree about who is alive.
- A writer sees at most a pause of a few seconds and keeps typing through it.

## The pieces

| Piece | Where | What it holds |
|---|---|---|
| Edit log | DynamoDB `wr-edit-log` | Every update to every episode, in order (`docId` plus a zero-padded `seq`) |
| Leases | DynamoDB `wr-coordination`, `lease#<docId>` | Who owns each episode: `{ owner, epoch, expiresAt }` |
| Snapshot pointers | DynamoDB `wr-coordination`, `snap#<docId>` | Which S3 snapshot is current: `{ key, seq, epoch }` |
| Snapshots | S3, `snapshots/<docId>/<epoch>-<seq>.ybin` | Compacted document states, never overwritten |
| Membership | DynamoDB `wr-members` | One heartbeat item per live server: `{ id, url, heartbeatAt }` |

## 1. Membership: who's alive

- **Mechanism:** every 2 s, each server writes its heartbeat (its ID, internal URL and the time), then reads everyone's. A server unheard from for 6 s is considered dead. The live set is sorted and becomes the hash ring (`cluster.ts`).
- **Why it's built this way:**
  - There's no leader and no consensus protocol. Every server computes the same answer from the same table, which is simple and has no single coordinating process to lose.
  - Servers can briefly disagree, for up to one heartbeat period, while a change spreads. That's fine because membership is only a routing hint. Who may write is decided by leases (section 4), never by membership.
- **Graceful leave:** a server shutting down deletes its heartbeat item, so the others drop it on their next read instead of waiting 6 s.

## 2. Consistent hashing: whose episode is it

- **Mechanism (`ring.ts`):**
  - Picture a circle of 2³² positions. Each live server is placed on it 256 times, at `SHA-1("<serverId>#<i>")` truncated to 32 bits. Those are its *virtual nodes*.
  - An episode's home is the first server position at or clockwise after `SHA-1(episodeId)`, found by binary search.
- **Why consistent hashing:** with `hash(id) % N`, adding a fourth server would move about 75% of episodes. Here only the episodes on the arcs the new server takes over move (about 1/N), and a dead server's episodes are the only ones that move when it dies.
- **Why 256 virtual nodes (D-022):** with one position per server, arcs are wildly unequal. In our simulation, one server got 124% more than its fair share, and a dead server's episodes all fell on a single neighbor. With 256, every server stays within about 9-15% of fair share, and a dead server's episodes spread across **every** survivor, so no single server absorbs the whole failover load.

## 3. Routing and the forwarding hop

- **Mechanism (`server.ts`, `onConnection` and `forward`):**
  1. Any server accepts a writer's WebSocket and verifies the token.
  2. If it already holds the episode, or the ring says it's the home, it serves the writer.
  3. Otherwise it opens its own WebSocket to the home's internal URL and pipes messages both ways, untouched.
  4. The writer's verified identity travels in an `x-wr-forwarded` header, an HMAC-SHA256 signature made with a cluster-only secret and valid for 30 s, so the home doesn't re-verify the browser's token.
- **Why a pipe per writer (D-022):**
  - The protocol stays identical on both sides, and each writer's stream is independent: no shared link where one slow writer delays others.
  - Unlike a raw TCP splice, the entry server sees message boundaries, so it can hold, replay and close cleanly.
  - Redirecting the browser to the home was rejected in the pre-build decisions, because it would expose every node publicly.
- **Holding a writer through a failover:** if the home can't be reached on a new connection (it just died and the ring hasn't caught up), or it turns the hop away before the session starts, the entry server doesn't reject the writer. It:
  - answers the writer's heartbeat pings itself;
  - keeps every message the writer has sent;
  - retries every 500 ms, re-resolving the home each time, for up to 15 s;
  - replays the kept messages to whichever home finally starts the session.

  Without this, each failed attempt would push the client's exponential backoff further out. With it, a failover costs one reconnect.
- **A loop guard:** a forwarded connection that reaches a server that doesn't think it's the home is told 4409 ("moved") rather than forwarded again.

## 4. Leases and fencing tokens: exactly one writer

This is the part interviewers probe. All of it is conditional writes in DynamoDB (`storage/coordination.ts`).

**Acquire.** One `UpdateItem` on `lease#<docId>`:

```
SET owner = :me, expiresAt = :now + 6s, epoch = if_not_exists(epoch, 0) + 1
CONDITION attribute_not_exists(owner) OR expiresAt < :now
```

DynamoDB applies conditional writes to a single item one at a time, so if several servers race for an expired lease, exactly one wins. That's tested with eight racers. The winner gets the new `epoch`, and **that number is its fencing token.**

**Renew** every 2 s: `SET expiresAt = :now + 6s CONDITION owner = :me AND epoch = :myEpoch`. If the condition fails, the lease has been taken. The server steps down at once: it stops writing and sends its writers away with 4409.

**Release** (graceful handoff): `REMOVE owner CONDITION owner = :me AND epoch = :myEpoch`. The next owner can take over immediately instead of waiting for expiry.

**Wait for expiry before taking over.** A new owner that finds an unexpired lease waits until it expires (`room.ts`, `load`), holding its writers meanwhile.

**Fencing every write.**
- Leases alone aren't enough, because a server can believe it owns a lease it has lost. A GC pause, a frozen VM or a slow network can all stop a server for longer than its lease. When it wakes up, its own clock and memory still say "I'm the owner".
- So every write carries the token, and **storage checks it**. An edit-log append is one `TransactWriteItems`:
  1. `ConditionCheck` on `lease#<docId>`: `owner = :me AND epoch = :myEpoch`.
  2. `Put` of the log item, with `attribute_not_exists(k)` so a seq can never be written twice.
- Either both happen or neither does. An outdated owner's append is refused (`FencedError`), so it can never add to the log, and it steps down.

**Fencing snapshots too.**
- **The danger:** if a snapshot were one overwritable S3 object, a paused outdated server could wake up and overwrite a *newer* snapshot with its older state, after the new owner had already truncated the log below the newer one. Those edits would be gone.
- **So, three steps:**
  1. Snapshots are immutable objects, named `<epoch>-<seq>`.
  2. Making one current means moving the `snap#<docId>` pointer in a transaction that also checks the lease, and only forward (`seq < :newSeq`).
  3. The log below a seq is truncated only after the pointer has moved past it.
- An outdated owner fails step 2, so it can't move the pointer, and therefore can't truncate.

**Clocks.**
- `expiresAt` uses wall-clock time, so clock skew between servers can make one take over a little early or late.
- That affects *when* failover happens, never *correctness*: even if two servers both think they own an episode, only the one whose epoch matches the lease item can write. That's the whole point of the fencing token.

## 5. The ordering rule on the home server

For each episode, the home's `Room` runs one append at a time. Updates that arrive while an append is in flight wait in a queue, and go out together as the next one: **group commit** (D-103), one merged Yjs update in one fenced log item, up to 256 KB. For each batch:

1. **Append** to the edit log (the fenced transaction), and wait for DynamoDB to confirm.
2. **Apply** the update to the in-memory Y.Doc. That broadcasts it to the episode's other writers.
2b. Each update is applied separately, with its own sender as the origin, so no writer is sent its own edit back.
3. **Acknowledge** each message, in order: `[3][stored]`, meaning "N of your update messages on this connection are now durable" (D-019). Still exactly one ack per message.

Nothing is broadcast or acknowledged before it's durable. If the append is fenced, the room steps down. If it fails for any other reason, nothing in the batch is applied or acknowledged, and every writer in it is disconnected. Their reconnect handshakes resend the edits.

**Races on the lease item (D-102, D-103).** Every fenced write (append, snapshot pointer) condition-checks the episode's lease item inside a transaction, and renewals update that same item every 2 s. DynamoDB refuses one of two concurrent writes to an item when either is transactional (`TransactionConflict`). Such a refusal wrote nothing, so every lease-item write retries a conflict up to four times with growing random waits (`storage/retry.ts`); a failed *condition*, the fence saying "not yours", is never retried. And a snapshot is reported saved only if its pointer actually moved: otherwise the room could truncate log entries that no snapshot covers.

## 6. Failover: the home server dies

The SIGKILL chaos test follows exactly this sequence:

| Time | What happens |
|---|---|
| 0 s | The home server dies with no warning: no snapshot, no lease release, no goodbye. |
| 0 s | Its writers' sockets close, and forwarded writers' pipes close. Clients reconnect to a random server and are held there by the forwarding hop. They keep typing into their local Y.Doc; the cue says "Reconnecting…". |
| ≤ 6 s | The dead server's heartbeat is 6 s old, so the others drop it from their rings, and the episode's new home is the next server on the ring. |
| ≤ 6 s | The dead server's lease expired 6 s after its last renewal. The new home's conditional acquire succeeds: **epoch 2**. |
| +~100 ms | The new home loads the current snapshot (via the pointer) and then the log tail after it. |
| +~100 ms | The handshake: the new home sends its state vector, each client answers with everything it has that the server lacks, and the new home appends it (fenced, epoch 2) and acknowledges it. **Every edit made during the outage is now durable.** |

**Measured** (3 real processes, DynamoDB Local, real timings): the takeover happens **6.1-7.3 s** after the kill, writers' worst wait for a keystroke to be confirmed is **6.3-8.7 s**, and **0 edits are lost**.

Why zero lost edits holds:
- Acknowledged edits were durable before they were acknowledged.
- Unacknowledged edits are still in the client's Y.Doc, and the handshake resends whatever the server lacks.
- Duplicates are harmless, because Yjs ignores edits it already has (tested by sending the same update three times).

## 7. Split brain: the home freezes

**The scenario** (`SIGSTOP`, then `SIGCONT`): a frozen server can't renew its lease, can't heartbeat, and can't answer anyone, but its sockets stay open. Here's what happens:

1. **Writers notice through the heartbeat.** The client pings every 5 s and gives up on any connection silent for 10 s, checking every second. Without the heartbeat, the frozen server's open sockets would trap writers for minutes. Writers then reconnect elsewhere.
2. **Someone else takes over.** The ring drops the frozen server after 6 s, and its lease has expired. The next home acquires it, epoch 2, and serves those writers.
3. **The frozen server wakes up still believing it owns the episode.** Whatever it tries first is refused:
   - its queued edits fail the fenced append (logged `append fenced: another server owns this episode`), or
   - its lease renewal fails (`lease taken by another server`).

   Either way it steps down and sends its remaining writers away. Their unacknowledged edits reach the real owner through the handshake.

**Proof, read straight from DynamoDB:** no log item with epoch 1 sits after the first item written under epoch 2. Measured takeover: about **10.7 s** after the freeze, dominated by the 10 s client heartbeat. **0 edits lost.**

## 8. Rebalancing: servers join and leave

- **A server joins.** The others see it on their next membership read. Each server hands off the rooms whose ring home is now the newcomer, **idle ones first**, one at a time. A handoff:
  1. finishes queued updates;
  2. snapshots (moving the fenced pointer);
  3. releases the lease;
  4. closes the writers' sockets with 4409.

  Writers reconnect immediately (4409 resets the backoff), get routed to the new home, and it acquires the *released* lease without waiting. Log truncation runs afterwards in the background: once the pointer has moved, deleting below it is safe at any time.
- **A server leaves gracefully** (SIGTERM):
  1. It deletes its heartbeat.
  2. It waits one heartbeat interval while still serving, so the others route around it.
  3. It hands every room off, idle first, and exits.

**Measured** (adding a server, then removing one, with six writers typing): the worst wait for a keystroke to be confirmed is **0.3-2.2 s**, and **0 edits are lost**.

## 9. Reconnects

- Exponential backoff with full jitter: `delay = random(0, min(10 s, 250 ms × 2^attempt))`. Randomizing the whole interval spreads a crowd of reconnecting clients out, instead of having them all retry in lockstep.
- A successful handshake resets the backoff, and so do "moved" (4409) and "going away" (1001), since a new home is ready.
- A connection that hasn't opened within 5 s is abandoned and retried. A frozen server's operating system still accepts TCP connections, but the WebSocket handshake never finishes.

## What this does *not* cover yet

- **DynamoDB itself becoming unavailable.** Writers keep editing locally, nothing is acknowledged, and everything merges when it returns, but no new edits become durable meanwhile.
- **Load:** these numbers come from one laptop running DynamoDB Local. The load-test phase measures throughput and latency on AWS.
- **Rebalancing is greedy.** A server that flaps in and out of the ring would cause repeated handoffs. That's safe, but disruptive.
