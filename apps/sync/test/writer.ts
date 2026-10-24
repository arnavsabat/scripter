// A simulated writer for cluster tests: a SyncClient that types numbered words at a steady pace
// and records, for every word, when it was typed, when the server confirmed it durable, and when
// a co-writer first saw it. The worst gaps are the writer-visible pause.
import { SyncClient, devIdentity, makeDevToken, type SocketLike } from '@wr/shared';
import * as Y from 'yjs';

export interface Writer {
  name: string;
  client: SyncClient;
  doc: Y.Doc;
  text(): string;
  /** Starts typing `count` words, one every `everyMs`. Resolves when the last is typed. */
  type(count: number, everyMs: number): Promise<void>;
  words: string[];
  typedAt: Map<string, number>;
  durableAt: Map<string, number>;
  destroy(): void;
}

export function writer(
  urls: string[] | (() => string[]),
  name: string,
  docId: string,
  opts: {
    heartbeat?: { everyMs: number; deadAfterMs: number };
    backoff?: { baseMs: number; capMs: number };
  } = {},
): Writer {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  const typedAt = new Map<string, number>();
  const durableAt = new Map<string, number>();
  const words: string[] = [];
  let pending: string[] = [];
  const client = new SyncClient({
    serverUrl: typeof urls === 'function' ? urls() : urls,
    docId,
    token: makeDevToken(devIdentity(name)),
    doc,
    backoff: opts.backoff ?? { baseMs: 100, capMs: 1000 },
    ...(opts.heartbeat ? { heartbeat: opts.heartbeat } : {}),
    socket: (url) => new WebSocket(url) as unknown as SocketLike,
  });
  // A word is durable once the client has nothing unacknowledged left after typing it.
  client.onChange(() => {
    if (!client.synced) return;
    const now = Date.now();
    for (const w of pending) durableAt.set(w, now);
    pending = [];
  });
  return {
    name,
    client,
    doc,
    words,
    typedAt,
    durableAt,
    text: () => text.toJSON(),
    async type(count, everyMs) {
      for (let i = 0; i < count; i++) {
        const w = `${name}${words.length}`;
        words.push(w);
        typedAt.set(w, Date.now());
        pending.push(w);
        text.insert(text.length, `${w} `);
        await new Promise((r) => setTimeout(r, everyMs));
      }
    },
    destroy: () => client.destroy(),
  };
}

/** Records when each word first appears in an observer's copy. */
export function watchArrivals(observer: Writer) {
  const seenAt = new Map<string, number>();
  observer.doc.getText('t').observe(() => {
    const now = Date.now();
    for (const w of observer.text().split(' ')) if (w && !seenAt.has(w)) seenAt.set(w, now);
  });
  return seenAt;
}

export interface PauseReport {
  scenario: string;
  words: number;
  lost: number;
  /** Longest time a typed word waited to be confirmed durable. */
  worstUnconfirmedMs: number;
  /** Longest time a co-writer waited to see a typed word. */
  worstPropagationMs: number;
}

export function report(
  scenario: string,
  author: Writer,
  observer: Writer,
  seenAt: Map<string, number>,
): PauseReport {
  const finalWords = new Set(observer.text().split(' '));
  let worstUnconfirmed = 0;
  let worstPropagation = 0;
  for (const w of author.words) {
    const t = author.typedAt.get(w)!;
    worstUnconfirmed = Math.max(worstUnconfirmed, (author.durableAt.get(w) ?? Infinity) - t);
    worstPropagation = Math.max(worstPropagation, (seenAt.get(w) ?? Infinity) - t);
  }
  const r = {
    scenario,
    words: author.words.length,
    lost: author.words.filter((w) => !finalWords.has(w)).length,
    worstUnconfirmedMs: Math.round(worstUnconfirmed),
    worstPropagationMs: Math.round(worstPropagation),
  };
  console.log(`[PAUSE] ${JSON.stringify(r)}`);
  return r;
}
