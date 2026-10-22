// In-memory storage for tests (and `WR_STORAGE=memory` for quick local runs). It shares the
// real implementations' semantics: append rejects a taken seq, and nothing survives the process.
import type { EditLog, LogTail, Snapshot, SnapshotStore, Storage } from './types';

export class MemoryEditLog implements EditLog {
  readonly entries = new Map<string, Map<number, Uint8Array>>();
  /** Test hook: runs before every append (to delay or fail it). */
  beforeAppend?: (docId: string, seq: number) => Promise<void> | void;
  appends = 0;

  async append(docId: string, seq: number, update: Uint8Array) {
    await this.beforeAppend?.(docId, seq);
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
  readonly snapshots = new Map<string, Snapshot>();
  saves = 0;
  load(docId: string) {
    return Promise.resolve(this.snapshots.get(docId) ?? null);
  }
  save(docId: string, snapshot: Snapshot) {
    this.snapshots.set(docId, { seq: snapshot.seq, state: snapshot.state.slice() });
    this.saves += 1;
    return Promise.resolve();
  }
}

export const memoryStorage = (): Storage & {
  log: MemoryEditLog;
  snapshots: MemorySnapshotStore;
} => ({
  log: new MemoryEditLog(),
  snapshots: new MemorySnapshotStore(),
});
