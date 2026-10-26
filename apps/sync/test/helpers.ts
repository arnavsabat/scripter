import { SyncClient, type SocketLike } from '@wr/shared';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { startSyncServer, type SyncServer, type SyncServerOptions } from '../src/server';
import { memoryStorage } from '../src/storage/memory';
import { testServerAuth, tokenFor } from './testAuth';

export type Storage = ReturnType<typeof memoryStorage>;

/** Cluster timings scaled down 6x so tests run fast; the chaos suite uses the real ones. */
export const FAST = { leaseTtlMs: 1000, renewEveryMs: 330, heartbeatMs: 330, deadAfterMs: 1000 };

export async function server(storage: Storage, port = 0, extra: Partial<SyncServerOptions> = {}) {
  return startSyncServer({ port, storage, ...testServerAuth(), ...FAST, ...extra });
}

/** A client whose network can be switched off: while offline, connections are refused. */
export function client(
  srv: { port: number },
  name: string,
  docId = 'ep-test',
  token: string | (() => Promise<string>) = tokenFor(name),
) {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const net = { offline: false };
  const c = new SyncClient({
    serverUrl: `ws://127.0.0.1:${srv.port}`,
    docId,
    token,
    doc,
    awareness,
    backoff: { baseMs: 20, capMs: 200 },
    socket: (url) =>
      new WebSocket(net.offline ? 'ws://127.0.0.1:9/offline' : url) as unknown as SocketLike,
  });
  return { c, doc, awareness, net, text: () => doc.getText('t').toJSON() };
}

export const type = (doc: Y.Doc, s: string) => doc.getText('t').insert(doc.getText('t').length, s);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until(check: () => boolean, ms = 5000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await sleep(5);
  }
}

/** Rebuilds the document purely from storage: what a brand-new server would load. */
export async function fromStorage(storage: Storage, docId = 'ep-test') {
  const doc = new Y.Doc();
  const snap = await storage.snapshots.load(docId);
  if (snap) Y.applyUpdate(doc, snap.state);
  for (const e of (await storage.log.readFrom(docId, snap?.seq ?? 0)).entries)
    Y.applyUpdate(doc, e.update);
  return doc.getText('t').toJSON();
}

export type { SyncServer };
