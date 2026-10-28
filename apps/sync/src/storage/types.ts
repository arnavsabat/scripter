// Durable storage and coordination for the sync cluster (SPEC 5.4, D-022):
// - the edit log (DynamoDB): every update, appended before it's acknowledged;
// - snapshots: immutable S3 objects plus a pointer item saying which one is current;
// - leases: which server owns each episode, with an epoch number that is the fencing token;
// - membership: which servers are alive (their heartbeats).
// Implementations: dynamo.ts + s3.ts for real use, memory.ts for tests (same semantics).

export interface LogEntry {
  /** Position in this document's log: 0, 1, 2, … with no gaps. */
  seq: number;
  update: Uint8Array;
}

export interface LogTail {
  entries: LogEntry[];
  nextSeq: number;
}

/** Proof of ownership presented with every write: "I'm this server, holding this epoch". */
export interface Fence {
  serverId: string;
  epoch: number;
}

/** The write was refused because the lease no longer names this server and epoch. */
export class FencedError extends Error {
  constructor(docId: string, fence: Fence) {
    super(`fenced: ${fence.serverId} no longer holds epoch ${fence.epoch} of ${docId}`);
    this.name = 'FencedError';
  }
}

export interface EditLog {
  /**
   * Appends one Yjs update, atomically with a check that `fence` still matches the lease.
   * Resolves only once it's durable. Rejects with FencedError if the lease has moved on,
   * or with an ordinary error if `seq` is already taken.
   */
  append(docId: string, seq: number, update: Uint8Array, fence: Fence): Promise<void>;
  /**
   * Every complete entry with seq >= fromSeq, in order, and the next free seq: one past the
   * highest seq seen, counting an incomplete entry left by a crash mid-write (which was never
   * acknowledged, so it's skipped and its seq is never reused).
   */
  readFrom(docId: string, fromSeq: number): Promise<LogTail>;
  /** Deletes every entry with seq < belowSeq (after a snapshot pointer has moved past them). */
  truncateBelow(docId: string, belowSeq: number): Promise<void>;
  /** Deletes the document's whole log: the 30-day purge of deleted scripts (D-037, D-090). */
  forget(docId: string): Promise<void>;
}

export interface Snapshot {
  /** The snapshot contains every log entry with seq < this. */
  seq: number;
  state: Uint8Array;
}

export interface SnapshotStore {
  /** The current snapshot (the one the pointer names), or null. */
  load(docId: string): Promise<Snapshot | null>;
  /**
   * Stores the snapshot as a new immutable object, then moves the pointer to it in one fenced
   * write that only ever moves forward. Rejects with FencedError if the lease has moved on.
   */
  save(docId: string, snapshot: Snapshot, fence: Fence): Promise<void>;
  /** Deletes every snapshot object, the pointer and the lease: the 30-day purge (D-090). */
  forget(docId: string): Promise<void>;
}

export interface Lease {
  owner: string | null;
  epoch: number;
  /** Wall-clock milliseconds. */
  expiresAt: number;
}

export type Acquired =
  { ok: true; epoch: number } | { ok: false; holder: string; expiresAt: number };

export interface LeaseStore {
  /**
   * Takes the lease if it's unowned, released or expired, incrementing the epoch: the new epoch
   * is this owner's fencing token. Otherwise reports who holds it and until when.
   */
  acquire(docId: string, serverId: string, ttlMs: number): Promise<Acquired>;
  /** Extends the lease if it still names this server and epoch. False means it's been lost. */
  renew(docId: string, fence: Fence, ttlMs: number): Promise<boolean>;
  /** Gives the lease up (graceful handoff) so the next owner needn't wait for expiry. */
  release(docId: string, fence: Fence): Promise<void>;
  peek(docId: string): Promise<Lease | null>;
}

export interface Member {
  id: string;
  /** Internal WebSocket base URL other servers forward to, e.g. ws://sync-2:4000 */
  url: string;
  /** Wall-clock milliseconds of the last heartbeat. */
  heartbeatAt: number;
}

export interface MembershipStore {
  heartbeat(member: Omit<Member, 'heartbeatAt'>): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<Member[]>;
}

export interface Storage {
  log: EditLog;
  snapshots: SnapshotStore;
  leases: LeaseStore;
  members: MembershipStore;
}
