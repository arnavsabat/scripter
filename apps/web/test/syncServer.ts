// Vitest global setup (runs in Node): a real sync server with in-memory storage for the browser
// tests, plus a tiny control endpoint so tests can kill, restart or cut it off, and get sign-in
// tokens: the test key's private half stays here in Node, and the browser asks for a fresh token
// on every connect (D-046), as the real app asks the API.
import { createServer } from 'node:http';
import { tokenVerifier } from '@wr/auth';
import { createTestIssuer } from '@wr/auth/testing';
import { SyncClient, colorFor, type SocketLike } from '@wr/shared';
import { startSyncServer, type SyncServer } from '@wr/sync';
import { memoryAccess } from '@wr/sync/access';
import { memoryStorage } from '@wr/sync/memory';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { startFakeApi } from './fakeApi';

export const SYNC_PORT = 4787;
/** Cluster timings scaled down so kill-and-restart doesn't wait the full 6 s lease (D-022). */
const FAST = { leaseTtlMs: 1000, renewEveryMs: 330, heartbeatMs: 330, deadAfterMs: 1000 };
export const CONTROL_PORT = 4788;

/**
 * Co-writers for the performance test (D-087), here in Node so their work never shares the
 * browser's main thread with the editor being measured. Each types into its own line at about
 * five characters a second, in bursts like real typing, and publishes its cursor there, as a
 * browser would.
 */
interface Bot {
  stop: () => void;
}
async function startWriter(
  docId: string,
  name: string,
  block: number,
  token: string,
): Promise<Bot> {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const userId = `u-${name.toLowerCase()}`;
  awareness.setLocalStateField('user', { userId, name, color: colorFor(userId), hex: '#2E4A25' });
  const client = new SyncClient({
    serverUrl: `ws://127.0.0.1:${SYNC_PORT}`,
    docId,
    token,
    doc,
    awareness,
    socket: (url) => new WebSocket(url) as unknown as SocketLike,
  });
  await client.whenSynced();
  const fragment = doc.getXmlFragment('script');
  const words = 'the rain keeps falling on the harbor and nobody moves '.split('');
  let i = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const line = fragment.get(Math.min(block, fragment.length - 1)) as Y.XmlElement;
    const text = line.get(0) as Y.XmlText;
    text.insert(text.length, words[i++ % words.length]!);
    const at: unknown = Y.relativePositionToJSON(
      Y.createRelativePositionFromTypeIndex(text, text.length),
    );
    awareness.setLocalStateField('cursor', { anchor: at, head: at });
    // ~5 keys a second, with a pause now and then, as people type.
    setTimeout(tick, i % 25 === 0 ? 900 : 120 + Math.random() * 120);
  };
  tick();
  return {
    stop: () => {
      stopped = true;
      client.destroy();
      awareness.destroy();
      doc.destroy();
    },
  };
}

export default async function setup() {
  const writers: Bot[] = [];
  const storage = memoryStorage();
  const issuer = await createTestIssuer();
  const auth = {
    verify: tokenVerifier([issuer.trusted]),
    access: memoryAccess(),
    clusterSecret: 'test-cluster-secret',
  };
  let server: SyncServer | null = await startSyncServer({ port: SYNC_PORT, storage, ...auth });
  const stopApi = await startFakeApi(issuer);
  const control = createServer((req, res) => {
    void (async () => {
      res.setHeader('access-control-allow-origin', '*');
      const url = new URL(req.url ?? '/', 'http://local');
      if (url.pathname === '/kill') {
        await server?.kill();
        server = null;
      } else if (url.pathname === '/restart') {
        server ??= await startSyncServer({ port: SYNC_PORT, storage, ...auth, ...FAST });
      } else if (url.pathname === '/access') {
        // What a writer may now do with a document (the API's job in production, D-046).
        const mode = url.searchParams.get('mode') as 'edit' | 'view' | 'none' | 'deleted';
        auth.access.set(
          url.searchParams.get('name') ?? '',
          url.searchParams.get('doc') ?? '',
          mode,
        );
        auth.access.notify({ series: 's-test' });
      } else if (url.pathname === '/token') {
        res.end(await issuer.sign(url.searchParams.get('name') ?? 'Writer'));
        return;
      } else if (url.pathname === '/writers') {
        // /writers?doc=<id>&at=5,900 starts one co-writer per line index; /writers?stop=1 stops them.
        for (const w of writers.splice(0)) w.stop();
        const docId = url.searchParams.get('doc');
        if (docId)
          for (const [n, at] of (url.searchParams.get('at') ?? '').split(',').entries()) {
            const name = ['Sam', 'Noor', 'Priya', 'Leo'][n] ?? `Writer${n}`;
            writers.push(await startWriter(docId, name, Number(at), await issuer.sign(name)));
          }
      } else if (url.pathname === '/drop') {
        server?.dropConnections();
      } else if (url.pathname === '/stored') {
        // The episode rebuilt purely from storage: what a fresh server would load.
        const docId = url.searchParams.get('doc') ?? '';
        const doc = new Y.Doc();
        const snap = await storage.snapshots.load(docId);
        if (snap) Y.applyUpdate(doc, snap.state);
        for (const e of (await storage.log.readFrom(docId, snap?.seq ?? 0)).entries)
          Y.applyUpdate(doc, e.update);
        res.end(doc.getXmlFragment('script').toJSON());
        return;
      }
      res.end('ok');
    })();
  });
  await new Promise<void>((r) => control.listen(CONTROL_PORT, '127.0.0.1', r));
  return async () => {
    for (const w of writers.splice(0)) w.stop();
    control.closeAllConnections();
    control.close();
    await server?.kill();
    await stopApi();
  };
}
