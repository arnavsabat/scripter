// Vitest global setup (runs in Node): a real sync server with in-memory storage for the browser
// tests, plus a tiny control endpoint so tests can kill, restart or cut it off.
import { createServer } from 'node:http';
import { startSyncServer, type SyncServer } from '@wr/sync';
import { memoryStorage } from '@wr/sync/memory';
import * as Y from 'yjs';

export const SYNC_PORT = 4787;
/** Cluster timings scaled down so kill-and-restart doesn't wait the full 6 s lease (D-022). */
const FAST = { leaseTtlMs: 1000, renewEveryMs: 330, heartbeatMs: 330, deadAfterMs: 1000 };
export const CONTROL_PORT = 4788;

export default async function setup() {
  const storage = memoryStorage();
  let server: SyncServer | null = await startSyncServer({
    port: SYNC_PORT,
    storage,
    devAuth: true,
  });
  const control = createServer((req, res) => {
    void (async () => {
      res.setHeader('access-control-allow-origin', '*');
      const url = new URL(req.url ?? '/', 'http://local');
      if (url.pathname === '/kill') {
        await server?.kill();
        server = null;
      } else if (url.pathname === '/restart') {
        server ??= await startSyncServer({ port: SYNC_PORT, storage, devAuth: true, ...FAST });
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
    control.closeAllConnections();
    control.close();
    await server?.kill();
  };
}
