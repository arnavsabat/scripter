// One simulated script and its writers (D-092). Every writer is a real SyncClient with its own
// Y.Doc and presence, exactly as a browser would connect, typing into a line of its own at about
// five keys a second in bursts, with pauses, and moving its cursor with every key (y-prosemirror
// sends a presence update per keystroke). Every other writer in the room notes when each
// keystroke reaches it: that's the latency SPEC 5.4 and D-082 talk about, keystroke to another
// writer's screen, including the durable append before the server broadcasts it.
//
// Zero lost edits is checked at the end: a fresh client reads the script back from the servers,
// and each line must equal, character for character, everything its writer typed. Two numbers
// come out of it (D-103): characters the server had *acknowledged* but that are missing, the
// durability claim, which must be 0; and characters still waiting on a writer's device when the
// run stopped, which a real browser would keep and resend (a speed problem, not a loss).
import { SyncClient, type SocketLike } from '@wr/shared';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

export interface Typing {
  /** Keys per burst, and the gap between keys within one (ms). */
  burst: [number, number];
  keyGapMs: [number, number];
  /** The pause between bursts (ms). */
  pauseMs: [number, number];
}
/** About 5 keys a second while typing, and about half the time spent typing. */
export const REALISTIC: Typing = { burst: [4, 15], keyGapMs: [140, 260], pauseMs: [800, 4000] };

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const TEXT = 'Fog rolls in off the water. She waits on the pier, and nobody comes. ';

interface Writer {
  index: number;
  doc: Y.Doc;
  awareness: Awareness;
  client: SyncClient;
  line: Y.XmlText | null;
  typed: string;
  /** How much of `typed` the server has acknowledged: all of it, as of the last fully synced moment. */
  durable: number;
  /** When each of this writer's keystrokes left (performance.now()). */
  sent: number[];
  timer: ReturnType<typeof setTimeout> | null;
}

export interface RoomResult {
  docId: string;
  writers: number;
  keystrokes: number;
  /** Characters missing or wrong in the read-back, against what was typed. */
  lost: number;
  /** …of which the server had acknowledged as durable: a lost edit (must be 0). */
  lostAcked: number;
  /** Characters typed but not yet acknowledged when the run stopped (still on the writer). */
  pending: number;
  /** The read-back itself failed: `lostAcked` then counts every acknowledged character. */
  readFailed: boolean;
  /** Writers whose edits weren't all acknowledged when the run ended. */
  unacked: number;
  /** Writers that never finished connecting (bad server, refused). */
  failed: number;
}

export class Room {
  private writers: Writer[] = [];
  private stopped = false;

  constructor(
    readonly docId: string,
    private readonly size: number,
    private readonly servers: readonly string[],
    private readonly token: (name: string) => Promise<string>,
    /** Every latency sample from this room, overall and per second of the run. */
    private readonly record: (sentAt: number, latency: number) => void,
  ) {}

  private connect(index: number, doc: Y.Doc, awareness?: Awareness) {
    const name = `${this.docId}-w${index}`;
    return new SyncClient({
      serverUrl: this.servers,
      docId: this.docId,
      token: () => this.token(name),
      doc,
      ...(awareness ? { awareness } : {}),
      socket: (url) => new WebSocket(url) as unknown as SocketLike,
    });
  }

  /** Connects every writer; the first one lays out a line per writer once the server says it's empty. */
  async open() {
    for (let i = 0; i < this.size; i++) {
      const doc = new Y.Doc();
      const awareness = new Awareness(doc);
      awareness.setLocalStateField('user', { name: `Writer ${i}`, color: i % 3 });
      this.writers.push({
        index: i,
        doc,
        awareness,
        client: this.connect(i, doc, awareness),
        line: null,
        typed: '',
        durable: 0,
        sent: [],
        timer: null,
      });
    }
    for (const w of this.writers)
      w.client.onChange(() => {
        if (w.client.synced) w.durable = w.typed.length;
      });
    const first = this.writers[0]!;
    await first.client.whenSynced(30_000);
    const fragment = first.doc.getXmlFragment('script');
    if (fragment.length === 0)
      first.doc.transact(() => {
        fragment.insert(
          0,
          Array.from({ length: this.size }, (_, i) => {
            const block = new Y.XmlElement('block');
            block.setAttribute('type', 'action');
            block.setAttribute('id', `lt-${i}`);
            block.insert(0, [new Y.XmlText()]);
            return block;
          }),
        );
      });
    await Promise.all(
      this.writers.map(async (w) => {
        const f = w.doc.getXmlFragment('script');
        await waitFor(() => f.length >= this.size, 30_000);
        w.line = (f.get(w.index) as Y.XmlElement).get(0) as Y.XmlText;
        this.observe(w);
      }),
    );
  }

  /** Notes, for this writer, when each other writer's keystrokes arrive. */
  private observe(w: Writer) {
    const lines = w.doc
      .getXmlFragment('script')
      .toArray()
      .map((b) => (b as Y.XmlElement).get(0) as Y.XmlText);
    const owner = new Map(lines.map((t, i) => [t, i]));
    const seen = lines.map(() => 0);
    w.doc.getXmlFragment('script').observeDeep((events, tr) => {
      if (tr.local) return;
      const now = performance.now();
      for (const e of events) {
        const j = owner.get(e.target as Y.XmlText);
        if (j === undefined || j === w.index) continue;
        const len = (e.target as Y.XmlText).length;
        const sent = this.writers[j]!.sent;
        for (let k = seen[j]!; k < len; k++)
          if (sent[k] !== undefined) this.record(sent[k]!, now - sent[k]!);
        seen[j] = Math.max(seen[j]!, len);
      }
    });
  }

  /** Every writer types until stop(), each starting at a random moment within `staggerMs`. */
  start(typing: Typing, staggerMs = 2000) {
    this.stopped = false; // a room can type again after a stop
    for (const w of this.writers) this.burst(w, typing, Math.random() * staggerMs);
  }

  private burst(w: Writer, typing: Typing, delay: number) {
    let left = Math.round(between(typing.burst));
    const key = () => {
      if (this.stopped || !w.line) return;
      const ch = TEXT[w.typed.length % TEXT.length]!;
      w.sent.push(performance.now());
      w.typed += ch;
      w.doc.transact(() => w.line!.insert(w.line!.length, ch));
      // The cursor moves with the key, as the editor's presence does.
      const at: unknown = Y.relativePositionToJSON(
        Y.createRelativePositionFromTypeIndex(w.line, w.line.length),
      );
      w.awareness.setLocalStateField('cursor', { anchor: at, head: at });
      left -= 1;
      w.timer = setTimeout(
        left > 0 ? key : () => this.burst(w, typing, 0),
        left > 0 ? between(typing.keyGapMs) : between(typing.pauseMs),
      );
    };
    w.timer = setTimeout(key, delay);
  }

  stop() {
    this.stopped = true;
    for (const w of this.writers) if (w.timer) clearTimeout(w.timer);
  }

  /** Waits until every writer's edits are acknowledged (durable), up to `ms`. */
  async drain(ms: number) {
    await waitFor(() => this.writers.every((w) => w.client.synced), ms).catch(() => {});
    return this.writers.filter((w) => !w.client.synced).length;
  }

  /** Reads the script back with a fresh client and compares every line with what was typed. */
  async verify(): Promise<RoomResult> {
    const doc = new Y.Doc();
    const client = this.connect(999, doc);
    let lost = 0;
    let lostAcked = 0;
    let readFailed = false;
    try {
      await client.whenSynced(60_000);
      const lines = doc.getXmlFragment('script').toArray();
      for (const w of this.writers) {
        const block = lines[w.index] as Y.XmlElement | undefined;
        const text = block?.get(0) as Y.XmlText | undefined;
        const got = text ? String(text.toString()) : '';
        if (got === w.typed) continue;
        const kept = commonPrefix(got, w.typed);
        lost += Math.max(1, w.typed.length - kept);
        lostAcked += Math.max(0, w.durable - kept);
      }
    } catch {
      // Couldn't read it back at all: count everything, and every acknowledged character.
      readFailed = true;
      lost = this.writers.reduce((n, w) => n + w.typed.length, 0);
      lostAcked = this.writers.reduce((n, w) => n + w.durable, 0);
    } finally {
      client.destroy();
      doc.destroy();
    }
    return {
      docId: this.docId,
      writers: this.size,
      keystrokes: this.writers.reduce((n, w) => n + w.typed.length, 0),
      lost,
      lostAcked,
      pending: this.writers.reduce((n, w) => n + w.typed.length - w.durable, 0),
      readFailed,
      unacked: this.writers.filter((w) => !w.client.synced).length,
      failed: this.writers.filter((w) => !w.line).length,
    };
  }

  close() {
    this.stop();
    for (const w of this.writers) {
      w.client.destroy();
      w.awareness.destroy();
      w.doc.destroy();
    }
  }
}

const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

export async function waitFor(check: () => boolean, ms: number) {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}
