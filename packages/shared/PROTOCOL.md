# Wire protocol: browser ↔ sync server

One WebSocket per open episode. Every message is binary, and every integer is a lib0 `varUint`: 7 bits per byte, with the high bit meaning "more bytes follow". This is the same encoding y-protocols uses. Message types 0 and 1 are y-protocols' own; type 3 is ours. The code lives in `src/protocol.ts`.

## Connecting

```
ws(s)://<sync host>/doc/<episodeId>?token=<token>
```

- `episodeId` must match `^[a-z0-9][a-z0-9-]{0,63}$`. If it doesn't, the server closes the socket with **4404**.
- The token is checked on connect (SPEC 5.4). A missing or invalid token closes the socket with **4401**.
  - Browsers can't set headers on a WebSocket, so the token travels in the query string. That's why it must be short-lived once Cognito exists.
  - Until then, the only accepted tokens are **development tokens**: `DEV-UNSIGNED.` followed by base64url of `{"userId","name","color"}` (`src/devAuth.ts`). The server accepts them only when started with `WR_DEV_AUTH=1`.

## Messages

| Type | Name      | Body                                                     | Direction       |
| ---- | --------- | -------------------------------------------------------- | --------------- |
| 0    | sync      | y-protocols sync message (below)                         | both            |
| 1    | awareness | y-protocols awareness update: cursors, selections, names | both            |
| 3    | ack       | `stored: varUint`                                        | server → client |
| 4    | ping      | (none)                                                   | client → server |
| 5    | pong      | (none)                                                   | server → client |

**Sync (type 0)** is followed by a sub-type:

| Sub-type | Name   | Body                         | Meaning                                          |
| -------- | ------ | ---------------------------- | ------------------------------------------------ |
| 0        | step 1 | `stateVector: varUint8Array` | "This is what I have; send me what I lack."      |
| 1        | step 2 | `update: varUint8Array`      | The reply to step 1: everything the asker lacks. |
| 2        | update | `update: varUint8Array`      | A live edit.                                     |

## The handshake

Both sides run the handshake on every connect and every reconnect:

1. The server sends **step 1** with its state vector. The client replies with **step 2**: every edit the server doesn't have, plus Yjs's full delete set.
2. The client sends **step 1** with its state vector. The server replies with **step 2**: every edit the client doesn't have.
3. Both sides send awareness.

This is how unacknowledged edits are resent (SPEC 5.4). The client never needs a separate queue: whatever the server lacks is computed from the two state vectors and sent again. Yjs ignores anything it already has, so a resend can't create duplicates.

## Acknowledgment (type 3, D-019)

`[3][stored]`, where `stored` is the running count of **update-bearing messages from this connection** (sync step 2 and sync update) that are now durable in the DynamoDB edit log.

- The server handles one connection's messages strictly in order. For each update-bearing message, it does this:
  1. Appends the update to the edit log.
  2. Waits for DynamoDB to confirm.
  3. Applies the update to its Y.Doc and broadcasts it to the other connections.
  4. Sends exactly one ack.

  Empty or duplicate updates are acked too, so the counts always line up.

- The client counts the update-bearing messages it sends on the connection. It has unsaved work while `sent > stored`, which drives the "Syncing…" cue.
- Both counts start at 0 on every new connection. Edits that were in flight when a connection dropped are covered by the next handshake, not by the old counts.
- If an append fails, the server **does not** apply, broadcast or ack the update. It closes the socket with **4500**, and the client reconnects and resends through the handshake. An edit is never confirmed before it's durable.

Why a count rather than "saved up to clock N": Yjs deletions don't advance a writer's clock (a Backspace adds to the delete set, not a new numbered item), so a clock can't confirm a pending deletion. A count covers typing and deletions alike.

## Heartbeat and connecting (D-022)

- The client sends **ping** every 5 s, and the server answers **pong** at once, even while it's still loading the episode (waiting for a dead owner's lease to expire). If _nothing at all_ has arrived for 10 s (checked every second), the client abandons the socket without waiting for a close handshake and reconnects. A frozen server keeps its sockets open, so without this, writers could be stuck for minutes.
- A connection that hasn't opened within 5 s is abandoned too. A frozen server's operating system still accepts the TCP connection, but the WebSocket handshake never completes.
- With a cluster, the client is given the list of server URLs and connects to a random one each time. Any server accepts, and forwards to the episode's home if it isn't the home itself (`docs/sync-cluster.md`).

## Between servers

A server forwarding a writer to the episode's home opens its own WebSocket to the home's internal URL, with the same path, and passes messages through untouched. The writer's identity, already verified, travels in the `x-wr-forwarded` header: base64url JSON plus an HMAC-SHA256 signature made with the cluster secret (`WR_CLUSTER_SECRET`), valid for 30 s. Browsers never see this header.

## Close codes

| Code | Meaning                                | Client behavior                                |
| ---- | -------------------------------------- | ---------------------------------------------- |
| 1001 | Server going away: shutdown            | Reconnect now (backoff reset)                  |
| 1013 | Try again: no home reachable right now | Reconnect with backoff                         |
| 4409 | Moved: the episode lives elsewhere now | Reconnect now (backoff reset)                  |
| 4401 | Unauthorized                           | Stop and ask for a new token                   |
| 4404 | Bad episode ID                         | Stop                                           |
| 4500 | Storage failed                         | Reconnect with backoff (the handshake resends) |

Reconnects use exponential backoff with full jitter (SPEC 5.4): `delay = random(0, min(10 s, 250 ms × 2^attempt))`.
