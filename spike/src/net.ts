// A fake network between Y.Docs. Online, every local update is delivered to the other docs on
// the next task (like a WebSocket). Offline, nothing is delivered; reconnecting syncs by
// exchanging state vectors, the same way the real sync protocol (y-protocols sync step 1/2) does.
import * as Y from 'yjs';

export const REMOTE = Symbol('remote');

export interface Delivery {
  to: string;
  bytes: number;
  ms: number;
}

export class Network {
  online = true;
  readonly deliveries: Delivery[] = [];
  private queue: { to: Y.Doc; update: Uint8Array }[] = [];
  private scheduled = false;
  private readonly names = new Map<Y.Doc, string>();
  /** Hooks around each delivery (test 5 uses them to anchor the viewport to a block ID). */
  beforeApply?: (to: Y.Doc) => void;
  afterApply?: (to: Y.Doc) => void;

  constructor(private readonly docs: Y.Doc[]) {
    docs.forEach((doc, i) => {
      this.names.set(doc, `doc${i}`);
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        if (origin === REMOTE || !this.online) return;
        for (const other of this.docs) if (other !== doc) this.queue.push({ to: other, update });
        this.schedule();
      });
    });
  }

  name(doc: Y.Doc, name: string) {
    this.names.set(doc, name);
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    setTimeout(() => this.flush(), 0);
  }

  /** Delivers everything queued, timing how long each receiving client takes to apply it. */
  flush() {
    this.scheduled = false;
    const items = this.queue;
    this.queue = [];
    for (const { to, update } of items) {
      this.beforeApply?.(to);
      const t0 = performance.now();
      Y.applyUpdate(to, update, REMOTE);
      const ms = performance.now() - t0;
      this.afterApply?.(to);
      this.deliveries.push({
        to: this.names.get(to) ?? '?',
        bytes: update.byteLength,
        ms,
      });
    }
  }

  /** Waits until every in-flight update has been delivered. */
  async settle() {
    for (let i = 0; i < 50 && (this.queue.length || this.scheduled); i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    if (this.queue.length) this.flush();
  }

  goOffline() {
    this.flush();
    this.online = false;
  }

  /** Reconnect: each pair sends exactly what the other is missing (state-vector diff). */
  reconnect() {
    let bytes = 0;
    const t0 = performance.now();
    for (const a of this.docs) {
      for (const b of this.docs) {
        if (a === b) continue;
        const diff = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
        bytes += diff.byteLength;
        Y.applyUpdate(b, diff, REMOTE);
      }
    }
    this.online = true;
    return { bytes, ms: performance.now() - t0 };
  }
}
