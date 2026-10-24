// One episode document on its home server (SPEC 5.2, 5.4, D-022).
//
// Two rules this file exists to enforce:
//  1. An update is appended to the durable edit log BEFORE it is applied, broadcast or
//     acknowledged, one at a time, so log positions have no gaps and acks go out in order.
//  2. Only the lease holder writes. The room acquires the episode's lease before loading it,
//     presents its fencing token (server ID + epoch) with every append and snapshot, renews the
//     lease every 2 s, and steps down the moment storage says the token is out of date.
import { encodeAck, MSG_AWARENESS, MSG_SYNC, SYNC_UPDATE } from '@wr/shared';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import { FencedError, type Fence, type Storage } from './storage/types';

export interface Peer {
  /** Display name, for logs only. */
  readonly name: string;
  /** Count of this connection's update-bearing messages that are durable (D-019). */
  stored: number;
  /** Awareness client IDs this connection controls, removed when it leaves. */
  readonly awarenessIds: Set<number>;
  closed: boolean;
  send(message: Uint8Array): void;
  close(code: number, reason: string): void;
}

export interface Logger {
  info(msg: string, data?: object): void;
  error(msg: string, data?: object): void;
}

export interface RoomOptions {
  docId: string;
  serverId: string;
  storage: Storage;
  /** Snapshot after this many log entries (D-018: 1,000). */
  snapshotEvery: number;
  /** …or this long after the last snapshot if anything changed (D-018: 2 minutes). */
  snapshotAfterMs: number;
  /** Lease length and renewal interval (D-022: 6 s and 2 s). */
  leaseTtlMs: number;
  renewEveryMs: number;
  logger: Logger;
  /** Called when the room stops for good: handed off, lost its lease, or fenced. */
  onClosed: (room: Room) => void;
  /** Test hook: true while this server is frozen (renewals don't run, as in a real pause). */
  frozen?: () => boolean;
}

/** Close code telling a client "this episode lives elsewhere now; reconnect right away". */
export const MOVED = 4409;

/** Origin for updates loaded from storage, so they aren't broadcast. */
const LOAD = Symbol('load');

const isEmptyUpdate = (u: Uint8Array) => u.byteLength === 2 && u[0] === 0 && u[1] === 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly peers = new Set<Peer>();
  readonly ready: Promise<void>;
  /** The fencing token: set once the lease is acquired. */
  fence: Fence | null = null;
  /** Next free position in the edit log. */
  nextSeq = 0;
  /** When a writer last sent an edit (idle rooms move first during rebalancing). */
  lastActivity = Date.now();
  state: 'loading' | 'open' | 'closing' | 'closed' = 'loading';
  private sinceSnapshot = 0;
  private lastSnapshotAt = Date.now();
  private lastRenewedAt = 0;
  private chain: Promise<void> = Promise.resolve();
  private snapshotting: Promise<void> | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(private readonly opts: RoomOptions) {
    this.awareness.setLocalState(null); // the server has no presence of its own
    this.doc.on('update', this.broadcastUpdate);
    this.awareness.on('update', this.onAwareness);
    this.ready = this.load();
  }

  get docId() {
    return this.opts.docId;
  }

  /**
   * Take the lease, then load. If another server still holds an unexpired lease (it crashed or
   * froze), wait for it to expire, the "wait for expiry before taking over" rule, rather than
   * ever having two owners. Writers connected meanwhile wait, typing into their local copy.
   */
  private async load() {
    const { leases, log, snapshots } = this.opts.storage;
    const deadline = Date.now() + this.opts.leaseTtlMs * 3;
    for (;;) {
      const got = await leases.acquire(this.docId, this.opts.serverId, this.opts.leaseTtlMs);
      if (got.ok) {
        this.fence = { serverId: this.opts.serverId, epoch: got.epoch };
        this.lastRenewedAt = Date.now();
        break;
      }
      if (Date.now() > deadline)
        throw new Error(`lease for ${this.docId} still held by ${got.holder}`);
      // Wake just after it expires (with a little slack), or poll if the expiry looks far off.
      await sleep(Math.min(Math.max(got.expiresAt - Date.now() + 50, 50), 500));
    }
    const snapshot = await snapshots.load(this.docId);
    if (snapshot) Y.applyUpdate(this.doc, snapshot.state, LOAD);
    const tail = await log.readFrom(this.docId, snapshot?.seq ?? 0);
    for (const entry of tail.entries) Y.applyUpdate(this.doc, entry.update, LOAD);
    this.nextSeq = tail.nextSeq;
    this.sinceSnapshot = tail.entries.length;
    this.state = 'open';
    this.timers.push(setInterval(() => void this.renew(), this.opts.renewEveryMs));
    this.timers.push(
      setInterval(
        () => {
          if (
            this.sinceSnapshot > 0 &&
            Date.now() - this.lastSnapshotAt >= this.opts.snapshotAfterMs
          )
            void this.snapshot();
        },
        Math.min(10_000, this.opts.snapshotAfterMs),
      ),
    );
    this.opts.logger.info('room loaded', {
      docId: this.docId,
      epoch: this.fence.epoch,
      snapshotSeq: snapshot?.seq ?? null,
      tail: tail.entries.length,
      nextSeq: this.nextSeq,
    });
  }

  /** Renew the lease. If it's no longer ours, or we couldn't renew it in time, step down. */
  private async renew() {
    if (this.state !== 'open' || !this.fence || this.opts.frozen?.()) return;
    try {
      const ok = await this.opts.storage.leases.renew(this.docId, this.fence, this.opts.leaseTtlMs);
      if (ok) this.lastRenewedAt = Date.now();
      else return this.lose('lease taken by another server');
    } catch (err) {
      this.opts.logger.error('lease renew failed', { docId: this.docId, err: String(err) });
    }
    // Couldn't reach DynamoDB for a whole lease period: assume someone else may own it now.
    if (Date.now() - this.lastRenewedAt > this.opts.leaseTtlMs)
      this.lose('lease expired before renewal');
  }

  /**
   * An update from a peer (sync step 2 or update). Queued behind every earlier one, then:
   * fenced durable append → apply (which broadcasts) → ack. If the append is fenced, this server
   * is an outdated owner and the whole room steps down. If it fails otherwise, the peer is
   * disconnected; its reconnect handshake resends the update. Either way nothing is acked.
   */
  ingest(peer: Peer, update: Uint8Array) {
    this.lastActivity = Date.now();
    this.chain = this.chain.then(async () => {
      if (peer.closed || this.state !== 'open') {
        // Arrived while handing off or closing: the next server will get it via the handshake.
        if (!peer.closed) peer.close(MOVED, 'episode moved');
        return;
      }
      try {
        if (!isEmptyUpdate(update)) {
          const seq = this.nextSeq;
          await this.opts.storage.log.append(this.docId, seq, update, this.fence!);
          this.nextSeq = seq + 1;
          this.sinceSnapshot += 1;
          Y.applyUpdate(this.doc, update, peer);
        }
      } catch (err) {
        if (err instanceof FencedError)
          return this.lose('append fenced: another server owns this episode');
        this.opts.logger.error('append failed; closing connection', {
          docId: this.docId,
          peer: peer.name,
          err: String(err),
        });
        peer.close(4500, 'storage failed');
        return;
      }
      peer.stored += 1;
      peer.send(encodeAck(peer.stored));
      if (this.sinceSnapshot >= this.opts.snapshotEvery) void this.snapshot();
    });
    return this.chain;
  }

  /** Waits for every queued update to be processed. */
  settled() {
    return this.chain;
  }

  private broadcastUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === LOAD) return;
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_SYNC);
    encoding.writeVarUint(e, SYNC_UPDATE);
    encoding.writeVarUint8Array(e, update);
    const message = encoding.toUint8Array(e);
    for (const peer of this.peers) if (peer !== origin) peer.send(message);
  };

  private onAwareness = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const changed = [...added, ...updated, ...removed];
    if (origin && this.peers.has(origin as Peer)) {
      const peer = origin as Peer;
      for (const id of added) peer.awarenessIds.add(id);
      for (const id of removed) peer.awarenessIds.delete(id);
    }
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      e,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
    );
    const message = encoding.toUint8Array(e);
    for (const peer of this.peers) peer.send(message);
  };

  join(peer: Peer) {
    this.peers.add(peer);
  }

  leave(peer: Peer) {
    this.peers.delete(peer);
    awarenessProtocol.removeAwarenessStates(this.awareness, [...peer.awarenessIds], null);
  }

  /**
   * Compacts the document into a new snapshot, moves the pointer to it (fenced), and only then
   * truncates the log below it (in the background: nothing waits for the deletes). The state and its seq are captured together, synchronously, so
   * the snapshot covers exactly the entries below `seq`.
   */
  snapshot(): Promise<void> {
    if (this.snapshotting) return this.snapshotting;
    if (this.sinceSnapshot === 0 || !this.fence) return Promise.resolve();
    const seq = this.nextSeq;
    const state = Y.encodeStateAsUpdate(this.doc);
    const covered = this.sinceSnapshot;
    const fence = this.fence;
    this.sinceSnapshot = 0;
    this.lastSnapshotAt = Date.now();
    const { log, snapshots } = this.opts.storage;
    this.snapshotting = (async () => {
      try {
        await snapshots.save(this.docId, { seq, state }, fence);
        // Once the pointer has moved past seq, deleting the log below it is safe at any time and
        // by anyone, so it never needs to hold anything up: run it in the background.
        void log
          .truncateBelow(this.docId, seq)
          .catch((err: unknown) =>
            this.opts.logger.error('truncate failed', { docId: this.docId, err: String(err) }),
          );
        this.opts.logger.info('snapshot saved', {
          docId: this.docId,
          seq,
          bytes: state.byteLength,
          covered,
        });
      } catch (err) {
        this.sinceSnapshot += covered; // try again later; the log still holds everything
        if (err instanceof FencedError)
          this.lose('snapshot fenced: another server owns this episode');
        else this.opts.logger.error('snapshot failed', { docId: this.docId, err: String(err) });
      } finally {
        this.snapshotting = null;
      }
    })();
    return this.snapshotting;
  }

  /**
   * Graceful handoff (rebalancing or shutdown): finish queued updates, snapshot, release the
   * lease so the next owner needn't wait for it to expire, and send every writer on their way.
   */
  async handoff(reason: string) {
    if (this.state === 'closing' || this.state === 'closed') return;
    await this.ready.catch(() => {});
    this.state = 'closing';
    await this.chain;
    await this.snapshotting;
    await this.snapshot();
    if (this.fence) await this.opts.storage.leases.release(this.docId, this.fence).catch(() => {});
    this.opts.logger.info('room handed off', {
      docId: this.docId,
      reason,
      epoch: this.fence?.epoch,
    });
    this.finish(MOVED, 'episode moved');
  }

  /**
   * This server is an outdated owner (its lease was taken, or a write was fenced). Stop at once:
   * nothing more is written, and writers reconnect to the real owner. Their unacknowledged edits
   * are still in their browsers and reach the new owner through the handshake.
   */
  lose(reason: string) {
    if (this.state === 'closed') return;
    this.opts.logger.error('room lost ownership', {
      docId: this.docId,
      reason,
      epoch: this.fence?.epoch,
    });
    this.finish(MOVED, 'episode moved');
  }

  private finish(code: number, reason: string) {
    this.state = 'closed';
    for (const t of this.timers) clearInterval(t);
    for (const peer of [...this.peers]) peer.close(code, reason);
    this.peers.clear();
    this.awareness.destroy();
    this.doc.destroy();
    this.opts.onClosed(this);
  }

  /** Abrupt stop with no snapshot and no lease release (crash simulation in tests). */
  destroy() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    for (const t of this.timers) clearInterval(t);
    this.awareness.destroy();
    this.doc.destroy();
  }
}
