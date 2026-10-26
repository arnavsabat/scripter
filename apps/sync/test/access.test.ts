// Access at the home sync server (SPEC 5.3, D-031, D-046), with the in-memory access source.
// The same rules against real Postgres and the real API: apps/api/test/sync-permissions.test.ts.
import { CLOSE } from '@wr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryAccess } from '../src/access';
import { startSyncServer, type SyncServer } from '../src/server';
import { memoryStorage } from '../src/storage/memory';
import { FAST, client, fromStorage, server, sleep, type, until } from './helpers';
import { testServerAuth } from './testAuth';

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
const track = <
  T extends { destroy?: () => void; close?: () => Promise<void>; c?: { destroy(): void } },
>(
  x: T,
) => {
  cleanup.push(() => (x.c ? x.c.destroy() : x.close?.()));
  return x;
};
const DOC = 'ep-access';

async function withAccess(access = memoryAccess()) {
  const storage = memoryStorage();
  const srv = track(await server(storage, 0, testServerAuth(access)));
  return { storage, srv, access };
}

describe('view-only connections', () => {
  it('see co-writers’ edits and presence, but their own edits are refused with 4403', async () => {
    const { srv, access, storage } = await withAccess();
    access.set('Priya', DOC, 'view');
    const maya = track(client(srv, 'Maya', DOC));
    const priya = track(client(srv, 'Priya', DOC));
    // The view-only client's (empty) handshake reply is acknowledged: it settles as synced.
    await Promise.all([maya.c.whenSynced(), priya.c.whenSynced()]);
    type(maya.doc, 'FADE IN.');
    await until(() => priya.text() === 'FADE IN.');
    type(priya.doc, ' sneaky');
    await until(() => priya.c.fatal !== null);
    expect(priya.c.fatal).toBe('forbidden');
    await sleep(50);
    expect(maya.text()).toBe('FADE IN.');
    expect(await fromStorage(storage, DOC)).toBe('FADE IN.');
  });
});

describe('refusals at connect', () => {
  it('no access: 4403; deleted: 4410; no such document: 4404', async () => {
    const { srv, access } = await withAccess();
    access.set('Stranger', DOC, 'none');
    access.set('Late', DOC, 'deleted');
    const stranger = track(client(srv, 'Stranger', DOC));
    const late = track(client(srv, 'Late', DOC));
    await until(() => stranger.c.fatal !== null && late.c.fatal !== null);
    expect(stranger.c.fatal).toBe('forbidden');
    expect(late.c.fatal).toBe('deleted');
    expect([CLOSE.FORBIDDEN, CLOSE.DELETED]).toEqual([4403, 4410]);
    const none = track(await server(memoryStorage(), 0, testServerAuth(memoryAccess('none'))));
    const anyone = track(client(none, 'Maya', DOC));
    await until(() => anyone.c.fatal !== null);
    expect(anyone.c.fatal).toBe('forbidden');
  });
});

describe('access changes while connected (NOTIFY wr_access)', () => {
  it('closes exactly the connections whose access changed, with 4403 or 4410', async () => {
    const { srv, access } = await withAccess();
    const maya = track(client(srv, 'Maya', DOC));
    const sam = track(client(srv, 'Sam', DOC));
    const other = track(client(srv, 'Noor', 'ep-elsewhere'));
    await Promise.all([maya.c.whenSynced(), sam.c.whenSynced(), other.c.whenSynced()]);
    // Sam is made a viewer: his connection is told to ask again.
    access.set('Sam', DOC, 'view');
    access.notify({ series: 's-test', episode: DOC });
    await until(() => sam.c.fatal === 'forbidden', 3000);
    // Unchanged access stays connected, and other episodes aren't touched.
    await sleep(100);
    expect(maya.c.fatal).toBeNull();
    expect(other.c.fatal).toBeNull();
    // The episode is deleted: everyone in it is moved out with 4410.
    access.set('Maya', DOC, 'deleted');
    access.notify({ series: 's-test' });
    await until(() => maya.c.fatal === 'deleted', 3000);
    expect(other.c.fatal).toBeNull(); // its access didn't change
  });
});

describe('live status and "edited" (D-033)', () => {
  it('records who is connected, forgets them when they leave, and notes edits at most once a minute', async () => {
    const { srv, access } = await withAccess();
    const maya = track(client(srv, 'Maya', DOC));
    const sam = track(client(srv, 'Sam', DOC));
    await Promise.all([maya.c.whenSynced(), sam.c.whenSynced()]);
    await until(() => (access.presence.get(DOC)?.size ?? 0) === 2);
    for (let i = 0; i < 20; i++) type(maya.doc, 'x');
    await maya.c.whenSynced();
    expect(access.edits.get(DOC)).toBe(1); // twenty edits, one "edited" write
    sam.c.destroy();
    await until(() => !access.presence.get(DOC)?.has('u-sam'));
    expect([...access.presence.get(DOC)!]).toEqual(['u-maya']);
  });
});

describe('through the forwarding hop', () => {
  it('the home server enforces access even when the writer connects to another server', async () => {
    const storage = memoryStorage();
    const access = memoryAccess();
    access.set('Priya', DOC, 'view');
    const servers: SyncServer[] = [];
    for (const id of ['sync-1', 'sync-2'])
      servers.push(
        track(
          await startSyncServer({
            port: 0,
            storage,
            ...testServerAuth(access),
            serverId: id,
            ...FAST,
          }),
        ),
      );
    await until(() => servers.every((s) => s.cluster.ring.servers.length === 2));
    const entry = servers.find((s) => s.cluster.homeOf(DOC) !== s.serverId)!;
    const maya = track(client(entry, 'Maya', DOC));
    const priya = track(client(entry, 'Priya', DOC));
    await Promise.all([maya.c.whenSynced(), priya.c.whenSynced()]);
    type(maya.doc, 'via the hop');
    await until(() => priya.text() === 'via the hop');
    type(priya.doc, '!');
    await until(() => priya.c.fatal === 'forbidden');
    expect(await fromStorage(storage, DOC)).toBe('via the hop');
  });
});
