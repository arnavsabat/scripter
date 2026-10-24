// In-memory storage for tests (and `WR_STORAGE=memory` for quick local runs). It shares the real
// implementations' semantics: appends and snapshot-pointer moves are refused unless the fence
// matches the lease, leases are taken with an epoch increment, and nothing survives the process.
// Several in-process servers can share one instance, like servers sharing DynamoDB.
import {
  FencedError,
  type Acquired,
  type EditLog,
  type Fence,
  type Lease,
  type LeaseStore,
  type LogTail,
  type Member,
  type MembershipStore,
  type Snapshot,
  type SnapshotStore,
  type Storage,
} from './types';

export class MemoryLeaseStore implements LeaseStore {
  readonly leases = new Map<string, Lease>();
  /** Test hook: the wall clock (so tests can skew it). */
  now: () => number = () => Date.now();

  /** True if `fence` is the current owner and epoch: the same check DynamoDB transactions make. */
  holds(docId: string, fence: Fence) {
    const lease = this.leases.get(docId);
    return !!lease && lease.owner === fence.serverId && lease.epoch === fence.epoch;
  }

  acquire(docId: string, serverId: string, ttlMs: number): Promise<Acquired> {
    const now = this.now();
    const lease = this.leases.get(docId);
    if (lease?.owner && lease.expiresAt >= now)
      return Promise.resolve({ ok: false, holder: lease.owner, expiresAt: lease.expiresAt });
    const epoch = (lease?.epoch ?? 0) + 1;
    this.leases.set(docId, { owner: serverId, epoch, expiresAt: now + ttlMs });
    return Promise.resolve({ ok: true, epoch });
  }

  renew(docId: string, fence: Fence, ttlMs: number) {
    if (!this.holds(docId, fence)) return Promise.resolve(false);
    this.leases.get(docId)!.expiresAt = this.now() + ttlMs;
    return Promise.resolve(true);
  }

  release(docId: string, fence: Fence) {
    if (this.holds(docId, fence))
      this.leases.set(docId, { owner: null, epoch: fence.epoch, expiresAt: 0 });
    return Promise.resolve();
  }

  peek(docId: string) {
    const lease = this.leases.get(docId);
    return Promise.resolve(lease ? { ...lease } : null);
  }
}

export class MemoryEditLog implements EditLog {
  readonly entries = new Map<string, Map<number, Uint8Array>>();
  /** Test hook: runs before every append (to delay or fail it). */
  beforeAppend?: (docId: string, seq: number) => Promise<void> | void;
  appends = 0;
  /** Appends refused because the writer's fence was out of date (the split-brain proof). */
  fenced = 0;

  constructor(private readonly leases: MemoryLeaseStore) {}

  async append(docId: string, seq: number, update: Uint8Array, fence: Fence) {
    await this.beforeAppend?.(docId, seq);
    // Check and write in one synchronous step, as one DynamoDB transaction would.
    if (!this.leases.holds(docId, fence)) {
      this.fenced += 1;
      throw new FencedError(docId, fence);
    }
    let doc = this.entries.get(docId);
    if (!doc) this.entries.set(docId, (doc = new Map<number, Uint8Array>()));
    if (doc.has(seq)) throw new Error(`seq ${seq} already taken for ${docId}`);
    doc.set(seq, update.slice());
    this.appends += 1;
  }

  readFrom(docId: string, fromSeq: number): Promise<LogTail> {
    const doc = this.entries.get(docId) ?? new Map<number, Uint8Array>();
    const entries = [...doc.entries()]
      .filter(([seq]) => seq >= fromSeq)
      .sort(([a], [b]) => a - b)
      .map(([seq, update]) => ({ seq, update }));
    const last = entries.at(-1);
    return Promise.resolve({ entries, nextSeq: last ? last.seq + 1 : fromSeq });
  }

  truncateBelow(docId: string, belowSeq: number) {
    const doc = this.entries.get(docId);
    if (doc) for (const seq of [...doc.keys()]) if (seq < belowSeq) doc.delete(seq);
    return Promise.resolve();
  }
}

export class MemorySnapshotStore implements SnapshotStore {
  /** The current snapshot per episode (what the pointer names). */
  readonly snapshots = new Map<string, Snapshot>();
  saves = 0;
  fenced = 0;

  constructor(private readonly leases: MemoryLeaseStore) {}

  load(docId: string) {
    return Promise.resolve(this.snapshots.get(docId) ?? null);
  }

  save(docId: string, snapshot: Snapshot, fence: Fence) {
    if (!this.leases.holds(docId, fence)) {
      this.fenced += 1;
      return Promise.reject(new FencedError(docId, fence));
    }
    const current = this.snapshots.get(docId);
    if (current && current.seq >= snapshot.seq) return Promise.resolve(); // the pointer only moves forward
    this.snapshots.set(docId, { seq: snapshot.seq, state: snapshot.state.slice() });
    this.saves += 1;
    return Promise.resolve();
  }
}

export class MemoryMembershipStore implements MembershipStore {
  readonly members = new Map<string, Member>();
  now: () => number = () => Date.now();
  heartbeat(member: Omit<Member, 'heartbeatAt'>) {
    this.members.set(member.id, { ...member, heartbeatAt: this.now() });
    return Promise.resolve();
  }
  remove(id: string) {
    this.members.delete(id);
    return Promise.resolve();
  }
  list() {
    return Promise.resolve([...this.members.values()].map((m) => ({ ...m })));
  }
}

export function memoryStorage() {
  const leases = new MemoryLeaseStore();
  return {
    leases,
    log: new MemoryEditLog(leases),
    snapshots: new MemorySnapshotStore(leases),
    members: new MemoryMembershipStore(),
  } satisfies Storage;
}
