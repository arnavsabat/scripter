// Sync server tests (Node): real WebSockets, real y-protocols, in-memory storage with the same
// semantics as DynamoDB/S3. Storage-backed versions run in aws-storage.test.ts.
import { CLOSE, MSG_ACK, MSG_SYNC, SYNC_UPDATE } from '@wr/shared';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { memoryStorage } from '../src/storage/memory';
import { client, fromStorage, server, sleep, type, until, type SyncServer } from './helpers';
import { issuer } from './testAuth';

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
function track<T extends { c?: { destroy(): void }; kill?: () => Promise<void> }>(x: T) {
  if (x.c) cleanup.push(() => x.c!.destroy());
  if (x.kill) cleanup.push(() => x.kill!());
  return x;
}

describe('two writers', () => {
  it('converge: each sees the other’s edits, and the server log holds them all', async () => {
    const storage = memoryStorage();
    const srv = track(await server(storage));
    const a = track(client(srv, 'Maya'));
    const b = track(client(srv, 'Sam'));
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
    type(a.doc, 'INT. KITCHEN - NIGHT. ');
    type(b.doc, 'Rain hammers the window. ');
    await until(() => a.text() === b.text() && a.text().length > 40);
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
    expect(await fromStorage(storage)).toBe(a.text());
  });

  it('an edit is not broadcast or acknowledged until the log append has finished', async () => {
    const storage = memoryStorage();
    let release!: () => void;
    const srv = track(await server(storage));
    const a = track(client(srv, 'Maya'));
    const b = track(client(srv, 'Sam'));
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
    storage.log.beforeAppend = () => new Promise<void>((r) => (release = r));
    type(a.doc, 'slow write');
    await sleep(150);
    expect(b.text()).toBe(''); // not broadcast yet
    expect(a.c.unsaved).toBe(1); // not acknowledged yet
    release();
    await until(() => b.text() === 'slow write');
    await a.c.whenSynced();
    expect(a.c.unsaved).toBe(0);
  });

  it('a failed append is never acknowledged; the client reconnects, resends, and nothing is lost', async () => {
    const storage = memoryStorage();
    const srv = track(await server(storage));
    const a = track(client(srv, 'Maya'));
    const b = track(client(srv, 'Sam'));
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
    let failures = 1;
    storage.log.beforeAppend = () => {
      if (failures-- > 0) throw new Error('DynamoDB unavailable');
    };
    const closes: number[] = [];
    a.c.onChange(() => closes.push(a.c.connection === 'offline' ? 1 : 0));
    type(a.doc, 'must survive');
    await until(() => b.text() === 'must survive');
    await a.c.whenSynced();
    expect(closes).toContain(1); // the server dropped A with 4500, and A came back
    expect(await fromStorage(storage)).toBe('must survive');
  });

  it('rejects a bad token with 4401 and stops retrying', async () => {
    const srv = track(await server(memoryStorage()));
    // The old unsigned development token is just a bad token now (D-046).
    const a = track(client(srv, 'Maya', 'ep-test', 'DEV-UNSIGNED.eyJ1c2VySWQiOiJtYXlhIn0'));
    await until(() => a.c.connection === 'stopped');
    expect(a.c.fatal).toBe('unauthorized');
    expect(CLOSE.UNAUTHORIZED).toBe(4401);
  });
});

describe('offline editing', () => {
  it('both writers edit while disconnected; everything merges on reconnect', async () => {
    const storage = memoryStorage();
    const srv = track(await server(storage));
    const a = track(client(srv, 'Maya'));
    const b = track(client(srv, 'Sam'));
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
    a.net.offline = true;
    b.net.offline = true;
    srv.dropConnections();
    await until(() => a.c.connection === 'offline' && b.c.connection === 'offline');
    expect(a.c.cue).toBe('reconnecting'); // the network is fine; the server is unreachable (D-022)
    for (let i = 0; i < 200; i++) {
      type(a.doc, `a${i} `);
      type(b.doc, `b${i} `);
    }
    a.net.offline = false;
    b.net.offline = false;
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
    await until(() => a.text() === b.text());
    const words = a.text().trim().split(' ');
    expect(words).toHaveLength(400);
    expect(new Set(words).size).toBe(400);
    expect(await fromStorage(storage)).toBe(a.text());
  });
});

describe('server crash', () => {
  it('kill the server mid-typing, restart it: zero lost edits', async () => {
    const storage = memoryStorage();
    let srv: SyncServer = await server(storage);
    const port = srv.port;
    cleanup.push(() => srv.kill());
    const a = track(client(srv, 'Maya'));
    const b = track(client(srv, 'Sam'));
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);

    const typing = (async () => {
      for (let i = 0; i < 300; i++) {
        type(a.doc, `w${i} `);
        if (i % 3 === 0) type(b.doc, `x${i} `);
        await sleep(2);
      }
    })();
    await sleep(200); // mid-typing…
    const typedBeforeKill = a.text().length;
    const storedBeforeKill = storage.log.appends;
    await srv.kill(); // …the process dies: sockets cut, memory gone, no snapshot
    await sleep(150); // writers keep typing while it's down
    const typedDuringOutage = a.text().length - typedBeforeKill;
    srv = await server(storage, port); // a fresh process loads snapshot + log tail
    await typing;
    // The crash really happened mid-typing: edits were stored before it and typed during it.
    expect(storedBeforeKill).toBeGreaterThan(10);
    expect(typedDuringOutage).toBeGreaterThan(0);
    await Promise.all([a.c.whenSynced(15_000), b.c.whenSynced(15_000)]);
    await until(() => a.text() === b.text());

    const words = new Set(a.text().trim().split(' '));
    for (let i = 0; i < 300; i++) {
      expect(words.has(`w${i}`), `w${i}`).toBe(true);
      if (i % 3 === 0) expect(words.has(`x${i}`), `x${i}`).toBe(true);
    }
    expect(await fromStorage(storage)).toBe(a.text()); // and it's all durable
    const fresh = track(client(srv, 'Reader'));
    await fresh.c.whenSynced();
    expect(fresh.text()).toBe(a.text());
  });
});

describe('duplicates', () => {
  it('the same update sent three times, plus a full resend, changes nothing and is acked every time', async () => {
    const storage = memoryStorage();
    const srv = track(await server(storage));
    const b = track(client(srv, 'Sam'));
    await b.c.whenSynced();

    // A raw connection, to send exactly the bytes we choose.
    const ws = new WebSocket(
      `ws://127.0.0.1:${srv.port}/doc/ep-test?token=${await issuer.sign('Raw')}`,
    );
    ws.binaryType = 'arraybuffer';
    const acks: number[] = [];
    ws.onmessage = (ev) => {
      const d = decoding.createDecoder(new Uint8Array(ev.data as ArrayBuffer));
      if (decoding.readVarUint(d) === MSG_ACK) acks.push(decoding.readVarUint(d));
    };
    await new Promise((r) => (ws.onopen = r));
    cleanup.push(() => ws.close());

    const doc = new Y.Doc();
    type(doc, 'once and only once');
    const update = Y.encodeStateAsUpdate(doc);
    const message = (u: Uint8Array) => {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      encoding.writeVarUint(e, SYNC_UPDATE);
      encoding.writeVarUint8Array(e, u);
      return encoding.toUint8Array(e);
    };
    for (let i = 0; i < 3; i++) ws.send(message(update));
    await until(() => acks.length === 3);
    expect(acks).toEqual([1, 2, 3]);
    await until(() => b.text() === 'once and only once');

    // A client that reconnects resends its whole state: still no duplicate text.
    ws.send(message(Y.encodeStateAsUpdate(doc)));
    await until(() => acks.length === 4);
    await sleep(50);
    expect(b.text()).toBe('once and only once');
    // The log holds the duplicates, and replaying it is harmless too.
    expect(storage.log.appends).toBe(4);
    expect(await fromStorage(storage)).toBe('once and only once');
  });
});

describe('snapshots (D-018: every 1,000 updates or 2 minutes, and on idle)', () => {
  it('compacts to the snapshot store, truncates the log below it, and restarts from snapshot + tail', async () => {
    const storage = memoryStorage();
    let srv = await server(storage, 0, { snapshotEvery: 50 });
    const port = srv.port;
    const a = track(client(srv, 'Maya'));
    await a.c.whenSynced();
    for (let i = 0; i < 130; i++) {
      type(a.doc, `s${i} `);
      await sleep(1);
    }
    await a.c.whenSynced();
    await until(() => storage.snapshots.saves >= 2);
    const snap = (await storage.snapshots.load('ep-test'))!;
    const remaining = [...storage.log.entries.get('ep-test')!.keys()];
    expect(Math.min(...remaining)).toBeGreaterThanOrEqual(snap.seq); // nothing below the snapshot
    expect(remaining.length).toBeLessThan(50 + 5);

    await srv.kill();
    srv = await server(storage, port);
    cleanup.push(() => srv.kill());
    await a.c.whenSynced(10_000);
    const reader = track(client(srv, 'Reader'));
    await reader.c.whenSynced();
    expect(reader.text()).toBe(a.text());
    expect(reader.text().trim().split(' ')).toHaveLength(130);
  });

  it('snapshots when the last writer leaves, and after a quiet period with changes', async () => {
    const storage = memoryStorage();
    const srv = track(await server(storage, 0, { idleUnloadMs: 50, snapshotAfterMs: 100 }));
    const a = client(srv, 'Maya');
    await a.c.whenSynced();
    type(a.doc, 'quiet room');
    await a.c.whenSynced();
    await until(() => storage.snapshots.saves === 1, 3000); // the time-based snapshot
    type(a.doc, ' again');
    await a.c.whenSynced();
    a.c.destroy();
    await until(() => storage.snapshots.saves === 2, 3000); // the unload snapshot
    expect(srv.rooms.size).toBe(0);
    expect(await fromStorage(storage)).toBe('quiet room again');
  });
});

describe('presence', () => {
  it('relays awareness, and removes a writer who leaves', async () => {
    const srv = track(await server(memoryStorage()));
    const a = track(client(srv, 'Maya'));
    const b = track(client(srv, 'Sam'));
    await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
    a.awareness.setLocalStateField('user', { name: 'Maya', color: 0 });
    await until(
      () =>
        (b.awareness.getStates().get(a.doc.clientID) as { user?: { name: string } } | undefined)
          ?.user?.name === 'Maya',
    );
    a.c.destroy();
    await until(() => !b.awareness.getStates().has(a.doc.clientID));
  });
});
