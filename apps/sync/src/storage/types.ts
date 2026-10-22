// Durable storage for episode documents (SPEC 5.4): an append-only edit log (DynamoDB) and
// compacted snapshots (S3). Implementations: dynamo.ts / s3.ts for real use, memory.ts for tests.

export interface LogEntry {
  /** Position in this document's log: 0, 1, 2, … with no gaps. */
  seq: number;
  update: Uint8Array;
}

export interface LogTail {
  entries: LogEntry[];
  nextSeq: number;
}

export interface EditLog {
  /** Appends one Yjs update. Resolves only once it's durable; rejects if `seq` is already taken. */
  append(docId: string, seq: number, update: Uint8Array): Promise<void>;
  /**
   * Every complete entry with seq >= fromSeq, in order, and the next free seq: one past the
   * highest seq seen, counting an incomplete entry left by a crash mid-write (which was never
   * acknowledged, so it's skipped and its seq is never reused).
   */
  readFrom(docId: string, fromSeq: number): Promise<LogTail>;
  /** Deletes every entry with seq < belowSeq (after a snapshot has captured them). */
  truncateBelow(docId: string, belowSeq: number): Promise<void>;
}

export interface Snapshot {
  /** The snapshot contains every log entry with seq < this. */
  seq: number;
  state: Uint8Array;
}

export interface SnapshotStore {
  load(docId: string): Promise<Snapshot | null>;
  save(docId: string, snapshot: Snapshot): Promise<void>;
}

export interface Storage {
  log: EditLog;
  snapshots: SnapshotStore;
}
