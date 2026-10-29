// The load-test harness itself (D-092): its percentiles are exact, and a small room against an
// in-process sync server types, measures latency and verifies every keystroke came back.
import { createPortableTestIssuer } from '@wr/auth/testing';
import { tokenVerifier } from '@wr/auth';
import { startSyncServer } from '@wr/sync';
import { memoryAccess } from '@wr/sync/access';
import { memoryStorage } from '@wr/sync/memory';
import { describe, expect, it } from 'vitest';
import { Room, type Typing } from '../src/room';
import { Histogram } from '../src/stats';

describe('Histogram', () => {
  it('percentiles, the maximum and the count over a limit, exactly', () => {
    const h = new Histogram();
    for (let ms = 1; ms <= 100; ms++) h.add(ms);
    expect(h.summary()).toMatchObject({ samples: 100, p50: 50, p95: 95, p99: 99, max: 100 });
    expect(h.over(90)).toBe(10);
    const other = new Histogram();
    other.add(40_000); // past the last bucket: counted as overflow
    h.merge(new Histogram(other.counts));
    expect(h.total).toBe(101);
    expect(h.max).toBe(30_001);
  });
});

describe('a room', () => {
  it('three writers type, everyone sees everyone, and every keystroke reads back', async () => {
    const issuer = await createPortableTestIssuer();
    const server = await startSyncServer({
      port: 0,
      storage: memoryStorage(),
      verify: tokenVerifier([issuer.trusted]),
      access: memoryAccess(),
      clusterSecret: 'test',
    });
    const latency = new Histogram();
    const room = new Room(
      'harness-room',
      3,
      [`ws://127.0.0.1:${server.port}`],
      (name) => issuer.sign(name),
      (_sent, ms) => latency.add(ms),
    );
    try {
      await room.open();
      room.start({ burst: [3, 5], keyGapMs: [20, 40], pauseMs: [50, 100] }, 50);
      await new Promise((r) => setTimeout(r, 1500));
      room.stop();
      expect(await room.drain(5000)).toBe(0);
      const result = await room.verify();
      expect(result.keystrokes).toBeGreaterThan(20);
      expect(result).toMatchObject({
        writers: 3,
        lost: 0,
        lostAcked: 0,
        pending: 0,
        readFailed: false,
        unacked: 0,
        failed: 0,
      });
      // Each keystroke reaches the two other writers.
      expect(latency.total).toBeGreaterThan(result.keystrokes);
      expect(latency.summary().p95).toBeLessThan(500);
    } finally {
      room.close();
      await server.close();
    }
  });

  it('tells an unacknowledged edit from a lost one: devices gone before the ack lose only pending typing (D-103)', async () => {
    const issuer = await createPortableTestIssuer();
    const storage = memoryStorage();
    const server = await startSyncServer({
      port: 0,
      storage,
      verify: tokenVerifier([issuer.trusted]),
      access: memoryAccess(),
      clusterSecret: 'test',
    });
    const room = new Room(
      'harness-pending',
      3,
      [`ws://127.0.0.1:${server.port}`],
      (name) => issuer.sign(name),
      () => {},
    );
    const typing: Typing = { burst: [3, 5], keyGapMs: [20, 40], pauseMs: [50, 100] };
    try {
      await room.open();
      room.start(typing, 50);
      await new Promise((r) => setTimeout(r, 800));
      room.stop();
      expect(await room.drain(5000)).toBe(0); // all of this is durable
      // Now DynamoDB stalls: more typing waits on the writers' devices…
      let release!: () => void;
      storage.log.beforeAppend = () => new Promise<void>((r) => (release = r));
      room.start(typing, 50);
      await new Promise((r) => setTimeout(r, 600));
      // …and the devices go away before it's acknowledged.
      room.close();
      storage.log.beforeAppend = undefined;
      release?.();
      const result = await room.verify();
      expect(result.pending).toBeGreaterThan(0);
      expect(result.lostAcked).toBe(0);
      expect(result.readFailed).toBe(false);
    } finally {
      await server.close();
    }
  }, 15_000);
});
