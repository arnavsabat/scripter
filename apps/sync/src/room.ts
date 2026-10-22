// One episode document, loaded on demand (SPEC 5.2, 5.4).
//
// The rule this file exists to enforce: an update is appended to the durable edit log BEFORE it
// is applied, broadcast to other writers, or acknowledged. Updates are processed strictly one
// at a time, so log positions (seq) have no gaps and acks go out in order (PROTOCOL.md).
import { encodeAck, MSG_AWARENESS, MSG_SYNC, SYNC_UPDATE } from '@wr/shared';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { Storage } from './storage/types';

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

export interface RoomOptions {
  docId: string;
  storage: Storage;
  /** Snapshot after this many log entries (D-018: 1,000). */
  snapshotEvery: number;
  /** …or this long after the last snapshot if anything changed (D-018: 2 minutes). */
  snapshotAfterMs: number;
  logger: Logger;
}

export interface Logger {
  info(msg: string, data?: object): void;
  error(msg: string, data?: object): void;
}

/** Origin for updates loaded from storage, so they aren't broadcast. */
const LOAD = Symbol('load');

const isEmptyUpdate = (u: Uint8Array) => u.byteLength === 2 && u[0] === 0 && u[1] === 0;

export class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly peers = new Set<Peer>();
  readonly ready: Promise<void>;
  /** Next free position in the edit log. */
  nextSeq = 0;
  private sinceSnapshot = 0;
  private lastSnapshotAt = Date.now();
  private chain: Promise<void> = Promise.resolve();
  private snapshotting: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval>;
  private destroyed = false;

  constructor(private readonly opts: RoomOptions) {
    this.awareness.setLocalState(null); // the server has no presence of its own
    this.doc.on('update', this.broadcastUpdate);
    this.awareness.on('update', this.onAwareness);
    this.ready = this.load();
    this.timer = setInterval(
      () => {
        if (this.sinceSnapshot > 0 && Date.now() - this.lastSnapshotAt >= this.opts.snapshotAfterMs)
          void this.snapshot();
      },
      Math.min(10_000, this.opts.snapshotAfterMs),
    );
  }

  get docId() {
    return this.opts.docId;
  }

  /** Startup and failover path: the latest snapshot, then the log tail after it. */
  private async load() {
    const { log, snapshots } = this.opts.storage;
    const snapshot = await snapshots.load(this.docId);
    if (snapshot) Y.applyUpdate(this.doc, snapshot.state, LOAD);
    const tail = await log.readFrom(this.docId, snapshot?.seq ?? 0);
    for (const entry of tail.entries) Y.applyUpdate(this.doc, entry.update, LOAD);
    this.nextSeq = tail.nextSeq;
    this.sinceSnapshot = tail.entries.length;
    this.opts.logger.info('room loaded', {
      docId: this.docId,
      snapshotSeq: snapshot?.seq ?? null,
      tail: tail.entries.length,
      nextSeq: this.nextSeq,
    });
  }

  /**
   * An update from a peer (sync step 2 or update). Queued behind every earlier one, then:
   * durable append → apply (which broadcasts) → ack. If the append fails, nothing is applied
   * or acked and the peer is disconnected; its reconnect handshake resends the update.
   */
  ingest(peer: Peer, update: Uint8Array) {
    this.chain = this.chain.then(async () => {
      if (peer.closed || this.destroyed) return;
      try {
        if (!isEmptyUpdate(update)) {
          const seq = this.nextSeq;
          await this.opts.storage.log.append(this.docId, seq, update);
          this.nextSeq = seq + 1;
          this.sinceSnapshot += 1;
          Y.applyUpdate(this.doc, update, peer);
        }
      } catch (err) {
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
   * Compacts the document into S3, then truncates the log below it. The state and its seq are
   * captured together, synchronously, so the snapshot covers exactly the entries below `seq`.
   * The log is only truncated after S3 confirms; if the save fails, the log still has everything.
   */
  snapshot(): Promise<void> {
    if (this.snapshotting) return this.snapshotting;
    if (this.sinceSnapshot === 0) return Promise.resolve();
    const seq = this.nextSeq;
    const state = Y.encodeStateAsUpdate(this.doc);
    const covered = this.sinceSnapshot;
    this.sinceSnapshot = 0;
    this.lastSnapshotAt = Date.now();
    const { log, snapshots } = this.opts.storage;
    this.snapshotting = (async () => {
      try {
        await snapshots.save(this.docId, { seq, state });
        await log.truncateBelow(this.docId, seq);
        this.opts.logger.info('snapshot saved', {
          docId: this.docId,
          seq,
          bytes: state.byteLength,
          covered,
        });
      } catch (err) {
        this.sinceSnapshot += covered; // try again later; the log still holds everything
        this.opts.logger.error('snapshot failed', { docId: this.docId, err: String(err) });
      } finally {
        this.snapshotting = null;
      }
    })();
    return this.snapshotting;
  }

  /** Graceful unload: finish queued updates, snapshot, stop timers. */
  async close() {
    clearInterval(this.timer);
    await this.chain;
    await this.snapshotting;
    await this.snapshot();
    this.destroy();
  }

  /** Abrupt stop with no snapshot (crash simulation in tests). */
  destroy() {
    this.destroyed = true;
    clearInterval(this.timer);
    this.awareness.destroy();
    this.doc.destroy();
  }
}
