// The cluster, in one process: three servers sharing in-memory storage (same semantics as
// DynamoDB + S3), with every timing scaled down 6x so the suite runs in seconds. The chaos suite
// (chaos.test.ts) repeats these with real processes, real storage and the real D-022 timings.
import { afterEach, describe, expect, it } from 'vitest';
import { homeOf } from '../src/ring';
import { startSyncServer, type SyncServer } from '../src/server';
import { memoryStorage } from '../src/storage/memory';
import { FAST, until } from './helpers';
import { testServerAuth } from './testAuth';
import { report, watchArrivals, writer, type Writer } from './writer';

const HEARTBEAT = { everyMs: 300, deadAfterMs: 1000 }; // the client heartbeat, scaled like FAST

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

async function cluster(n: number, storage = memoryStorage()) {
  const servers: SyncServer[] = [];
  for (let i = 1; i <= n; i++)
    servers.push(
      await startSyncServer({
        port: 0,
        storage,
        ...testServerAuth(),
        serverId: `sync-${i}`,
        ...FAST,
      }),
    );
  await until(() => servers.every((s) => s.cluster.ring.servers.length === n), 5000);
  cleanup.push(() => Promise.all(servers.map((s) => s.kill().catch(() => {}))));
  return { storage, servers };
}

/** A writer pinned to one entry server (so we control which hop it takes). */
const pinned = (srv: SyncServer, name: string, doc: string) =>
  track(writer([`ws://127.0.0.1:${srv.port}`], name, doc, { heartbeat: HEARTBEAT }));
const track = (w: Writer) => {
  cleanup.push(() => w.destroy());
  return w;
};
const same = (a: Writer, b: Writer) => a.text() === b.text();

describe('routing', () => {
  it('every server agrees on each episode’s home, and writers on any server reach it', async () => {
    const { servers } = await cluster(3);
    const docs = Array.from({ length: 12 }, (_, i) => `ep-route-${i}`);
    for (const d of docs) {
      const homes = new Set(servers.map((s) => s.cluster.homeOf(d)));
      expect(homes.size).toBe(1);
    }
    const doc = docs[0]!;
    const home = servers.find((s) => s.serverId === servers[0]!.cluster.homeOf(doc))!;
    const others = servers.filter((s) => s !== home);
    // One writer per server: two of them are forwarded to the home.
    const a = pinned(home, 'a', doc);
    const b = pinned(others[0]!, 'b', doc);
    const c = pinned(others[1]!, 'c', doc);
    await Promise.all([a, b, c].map((w) => w.client.whenSynced()));
    await Promise.all([a.type(20, 5), b.type(20, 5), c.type(20, 5)]);
    await until(() => same(a, b) && same(b, c));
    expect(a.text().trim().split(' ')).toHaveLength(60);
    // Only the home holds the room; the others just pipe.
    expect(home.rooms.has(doc)).toBe(true);
    for (const s of others) expect(s.rooms.has(doc)).toBe(false);
  });
});

describe('failover', () => {
  it('kill the home server mid-typing: the next owner takes over, zero lost edits', async () => {
    const { servers } = await cluster(3);
    const doc = 'ep-failover';
    const homeId = servers[0]!.cluster.homeOf(doc)!;
    const home = servers.find((s) => s.serverId === homeId)!;
    const [entryA, entryB] = servers.filter((s) => s !== home);
    // Writers enter through the two surviving servers, so they're forwarded to the home.
    const a = pinned(entryA!, 'a', doc);
    const b = pinned(entryB!, 'b', doc);
    await Promise.all([a.client.whenSynced(), b.client.whenSynced()]);
    const seen = watchArrivals(b);
    const typing = a.type(150, 10);
    await new Promise((r) => setTimeout(r, 400));
    await home.kill(); // crash: no snapshot, no lease release, no deregistration
    await typing;
    await Promise.all([a.client.whenSynced(10_000), b.client.whenSynced(10_000)]);
    await until(() => same(a, b), 5000);
    const r = report('in-process: home killed mid-typing', a, b, seen);
    expect(r.lost).toBe(0);
    const newHome = servers.find((s) => s !== home && s.rooms.has(doc))!;
    expect(newHome).toBeDefined();
    expect(newHome.rooms.get(doc)!.fence!.epoch).toBe(2); // the fencing token moved on
  });
});

describe('split brain', () => {
  it('a frozen owner’s lease expires and another takes over; when it wakes, its writes are fenced off', async () => {
    const { servers, storage } = await cluster(3);
    const doc = 'ep-split';
    const homeId = servers[0]!.cluster.homeOf(doc)!;
    const old = servers.find((s) => s.serverId === homeId)!;
    const entry = servers.find((s) => s !== old)!;
    // One writer stays connected straight to the old owner and never notices the freeze
    // (heartbeat disabled), the worst case: it keeps sending edits into the stale owner.
    const stuck = track(
      writer([`ws://127.0.0.1:${old.port}`], 'stuck', doc, {
        heartbeat: { everyMs: 60_000, deadAfterMs: 600_000 },
      }),
    );
    const other = pinned(entry, 'other', doc);
    await Promise.all([stuck.client.whenSynced(), other.client.whenSynced()]);
    await stuck.type(10, 5);
    await until(() => same(stuck, other));

    const staleRoom = old.rooms.get(doc)!;
    expect(staleRoom.fence!.epoch).toBe(1);
    old.freeze(); // like SIGSTOP: no renewals, no heartbeats, no message processing
    await until(() => servers.some((s) => s !== old && s.rooms.get(doc)?.fence?.epoch === 2), 8000);
    await other.type(10, 5); // the new owner keeps accepting edits
    await stuck.type(10, 5); // …while the stuck writer types into the frozen old owner
    old.thaw(); // it wakes up still believing it owns the episode

    // Its first write (or lease renewal) was refused: the stale room (epoch 1) stepped down.
    await until(() => staleRoom.state === 'closed', 5000);
    expect(storage.log.fenced).toBeGreaterThan(0); // storage refused the stale owner's append
    await Promise.all([stuck.client.whenSynced(10_000), other.client.whenSynced(10_000)]);
    // The woken server rejoins the ring and may take the episode back, moving the writers once
    // more; under a loaded machine that can outlast 5 s, so allow the same margin as above.
    await until(() => same(stuck, other), 15_000);
    const words = new Set(other.text().split(' '));
    for (const w of [...stuck.words, ...other.words]) expect(words.has(w), w).toBe(true);
    // Whoever owns the episode now (the woken server rejoins the ring and may get it back,
    // under a new epoch) holds a newer token than the stale room did.
    const owner = servers.find((s) => s.rooms.get(doc)?.state === 'open');
    expect(owner?.rooms.get(doc)?.fence?.epoch).toBeGreaterThan(1);
    console.log(`[SPLIT-BRAIN] fenced appends refused: ${storage.log.fenced}; no lost words`);
  });
});

describe('rebalancing', () => {
  it('adding a server moves only the episodes it now owns, gracefully and idle ones first', async () => {
    const storage = memoryStorage();
    const servers: SyncServer[] = [];
    for (let i = 1; i <= 2; i++)
      servers.push(
        await startSyncServer({
          port: 0,
          storage,
          ...testServerAuth(),
          serverId: `sync-${i}`,
          ...FAST,
        }),
      );
    cleanup.push(() => Promise.all(servers.map((s) => s.kill().catch(() => {}))));
    await until(() => servers.every((s) => s.cluster.ring.servers.length === 2));
    const docs = Array.from({ length: 10 }, (_, i) => `ep-add-${i}`);
    const writers = docs.map((d, i) => pinned(servers[i % 2]!, `w${i}`, d));
    await Promise.all(writers.map((w) => w.client.whenSynced()));
    // Half the episodes are busy (typing), half idle, when the new server joins.
    const busy = writers.filter((_, i) => i % 2 === 0);
    const typing = Promise.all(busy.map((w) => w.type(60, 15)));
    await new Promise((r) => setTimeout(r, 200));
    const handoffs: { server: string; doc: string }[] = [];
    for (const s of servers)
      for (const r of s.rooms.values()) {
        const original = r.handoff.bind(r);
        r.handoff = async (reason) => {
          handoffs.push({ server: s.serverId, doc: r.docId });
          return original(reason);
        };
      }
    const third = await startSyncServer({
      port: 0,
      storage,
      ...testServerAuth(),
      serverId: 'sync-3',
      ...FAST,
    });
    servers.push(third);
    await typing;
    await Promise.all(writers.map((w) => w.client.whenSynced(10_000)));
    // Each episode now lives on its ring home, and nothing was lost.
    for (const [i, d] of docs.entries()) {
      const home = homeOf(third.cluster.ring, d);
      const holder = servers.find((s) => s.rooms.has(d));
      if (holder) expect(holder.serverId).toBe(home);
      const words = new Set(writers[i]!.text().split(' '));
      for (const w of writers[i]!.words) expect(words.has(w), w).toBe(true);
    }
    const moved = docs.filter((d) => homeOf(third.cluster.ring, d) === 'sync-3');
    expect(new Set(handoffs.map((h) => h.doc))).toEqual(new Set(moved));
    // Idle scripts first: on each server, every idle episode was handed off before any busy one.
    const idle = new Set(docs.filter((_, i) => i % 2 === 1));
    for (const s of ['sync-1', 'sync-2']) {
      const order = handoffs.filter((h) => h.server === s).map((h) => h.doc);
      const firstBusy = order.findIndex((d) => !idle.has(d));
      if (firstBusy >= 0)
        expect(
          order.slice(firstBusy).some((d) => idle.has(d)),
          order.join(),
        ).toBe(false);
    }
    console.log(
      `[REBALANCE] added sync-3: ${moved.length}/${docs.length} episodes moved: ${handoffs.map((h) => `${h.doc}${idle.has(h.doc) ? '(idle)' : '(busy)'} from ${h.server}`).join(', ')}`,
    );
  });

  it('removing a server gracefully hands its episodes off with no lost edits', async () => {
    const { servers } = await cluster(3);
    const docs = Array.from({ length: 9 }, (_, i) => `ep-remove-${i}`);
    const leaving = servers[0]!;
    const stay = servers.slice(1);
    const writers = docs.map((d, i) => pinned(stay[i % 2]!, `r${i}`, d));
    await Promise.all(writers.map((w) => w.client.whenSynced()));
    const typing = Promise.all(writers.map((w) => w.type(40, 15)));
    await new Promise((r) => setTimeout(r, 150));
    const owned = docs.filter((d) => leaving.rooms.has(d));
    await leaving.close(); // graceful: leave the ring, hand off every room, then stop
    await typing;
    await Promise.all(writers.map((w) => w.client.whenSynced(10_000)));
    for (const [i] of docs.entries()) {
      const words = new Set(writers[i]!.text().split(' '));
      for (const w of writers[i]!.words) expect(words.has(w), w).toBe(true);
    }
    // Every episode the leaving server held is open again on one of the servers that stayed.
    await until(
      () => owned.every((d) => stay.some((s) => s.rooms.get(d)?.state === 'open')),
      10_000,
    );
    console.log(
      `[REBALANCE] removed ${leaving.serverId}: ${owned.length} episodes handed off, no lost words`,
    );
  });
});
