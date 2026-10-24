// Storage-backed tests against the local services (DynamoDB Local + SeaweedFS from
// docker-compose.yml). Run with `pnpm --filter @wr/sync test:services` after `pnpm services:up`.
// Skipped unless WR_TEST_SERVICES=1, so `pnpm test` works without containers.
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { awsStorage, type AwsStorageConfig } from '../src/storage/aws';
import { dynamoClient } from '../src/storage/dynamo';
import { FencedError, type Fence, type Storage } from '../src/storage/types';

const enabled = process.env.WR_TEST_SERVICES === '1';
if (!enabled)
  console.log(
    'storage tests skipped: run `pnpm services:up`, then `pnpm --filter @wr/sync test:services`',
  );

/** Test tables and bucket: fixed names (a bucket per run would use up SeaweedFS's volumes); every run uses its own episode IDs. */
export const TEST_STORAGE: AwsStorageConfig = {
  region: 'us-east-1',
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'wr_local',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'wr_local_secret',
  editLogTable: 'wr-edit-log-test',
  coordinationTable: 'wr-coordination-test',
  membersTable: 'wr-members-test',
  snapshotBucket: 'wr-snapshots-test',
};
const run = Date.now().toString(36);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!enabled)('DynamoDB + S3 storage (local services)', () => {
  let storage: Storage;
  /** Takes the lease on a fresh episode and returns its fencing token. */
  const own = async (doc: string, server = 'test-server', ttl = 60_000): Promise<Fence> => {
    const got = await storage.leases.acquire(doc, server, ttl);
    if (!got.ok) throw new Error('lease busy');
    return { serverId: server, epoch: got.epoch };
  };

  beforeAll(async () => {
    storage = await awsStorage(TEST_STORAGE);
  });

  describe('edit log', () => {
    it('appends in order, reads back, and refuses to write the same seq twice', async () => {
      const doc = `order-${run}`;
      const fence = await own(doc);
      for (let seq = 0; seq < 5; seq++)
        await storage.log.append(doc, seq, new Uint8Array([seq, seq]), fence);
      const tail = await storage.log.readFrom(doc, 2);
      expect(tail.entries.map((e) => [e.seq, [...e.update]])).toEqual([
        [2, [2, 2]],
        [3, [3, 3]],
        [4, [4, 4]],
      ]);
      expect(tail.nextSeq).toBe(5);
      await expect(storage.log.append(doc, 3, new Uint8Array([9]), fence)).rejects.toThrow();
    });

    it('stores updates bigger than the 400 KB item limit in chunks, byte for byte', async () => {
      const doc = `big-${run}`;
      const fence = await own(doc);
      const big = new Uint8Array(randomBytes(900_000));
      await storage.log.append(doc, 0, big, fence);
      const [entry] = (await storage.log.readFrom(doc, 0)).entries;
      expect(entry!.update.byteLength).toBe(900_000);
      expect(Buffer.compare(Buffer.from(entry!.update), Buffer.from(big))).toBe(0);
    });

    it('skips an incomplete chunk group left by a crash, and never reuses its seq', async () => {
      const doc = `torn-${run}`;
      const fence = await own(doc);
      await storage.log.append(doc, 0, new Uint8Array([1]), fence);
      // A crash after the first of three chunks of seq 1 was written.
      await dynamoClient(TEST_STORAGE.dynamoEndpoint, 'us-east-1').send(
        new PutItemCommand({
          TableName: TEST_STORAGE.editLogTable,
          Item: {
            docId: { S: doc },
            k: { S: `${'1'.padStart(15, '0')}.00000` },
            seq: { N: '1' },
            chunk: { N: '0' },
            chunks: { N: '3' },
            update: { B: new Uint8Array([7, 7]) },
          },
        }),
      );
      const tail = await storage.log.readFrom(doc, 0);
      expect(tail.entries.map((e) => e.seq)).toEqual([0]);
      expect(tail.nextSeq).toBe(2);
    });

    it('truncates everything below a seq', async () => {
      const doc = `trunc-${run}`;
      const fence = await own(doc);
      for (let seq = 0; seq < 40; seq++)
        await storage.log.append(doc, seq, new Uint8Array([seq]), fence);
      await storage.log.truncateBelow(doc, 30);
      const tail = await storage.log.readFrom(doc, 0);
      expect(tail.entries.map((e) => e.seq)).toEqual([30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
    });
  });

  describe('leases and fencing (D-022)', () => {
    it('one owner at a time: a held lease can’t be taken; an expired one can, with a higher epoch', async () => {
      const doc = `lease-${run}`;
      const a = await storage.leases.acquire(doc, 'server-a', 600);
      expect(a).toEqual({ ok: true, epoch: 1 });
      const b1 = await storage.leases.acquire(doc, 'server-b', 600);
      expect(b1.ok).toBe(false);
      await sleep(700); // a stops renewing; its lease runs out
      const b2 = await storage.leases.acquire(doc, 'server-b', 600);
      expect(b2).toEqual({ ok: true, epoch: 2 });
      expect(await storage.leases.renew(doc, { serverId: 'server-a', epoch: 1 }, 600)).toBe(false);
    });

    it('two servers racing for the same expired lease: exactly one wins', async () => {
      const doc = `race-${run}`;
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => storage.leases.acquire(doc, `racer-${i}`, 5000)),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    });

    it('an outdated owner’s append is refused; the new owner’s goes through', async () => {
      const doc = `fence-${run}`;
      const old = await own(doc, 'server-a', 300);
      await storage.log.append(doc, 0, new Uint8Array([1]), old);
      await sleep(400);
      const current = await own(doc, 'server-b');
      await expect(storage.log.append(doc, 1, new Uint8Array([2]), old)).rejects.toBeInstanceOf(
        FencedError,
      );
      await storage.log.append(doc, 1, new Uint8Array([3]), current);
      const tail = await storage.log.readFrom(doc, 0);
      expect(tail.entries.map((e) => [...e.update])).toEqual([[1], [3]]);
    });

    it('release lets the next owner take over at once', async () => {
      const doc = `release-${run}`;
      const a = await own(doc, 'server-a', 60_000);
      await storage.leases.release(doc, a);
      const b = await storage.leases.acquire(doc, 'server-b', 60_000);
      expect(b).toEqual({ ok: true, epoch: 2 });
    });
  });

  describe('snapshots: immutable objects and a fenced pointer', () => {
    it('saves and loads, and the pointer never moves backwards', async () => {
      const doc = `snap-${run}`;
      const fence = await own(doc);
      expect(await storage.snapshots.load(doc)).toBeNull();
      await storage.snapshots.save(doc, { seq: 100, state: new Uint8Array([1]) }, fence);
      await storage.snapshots.save(doc, { seq: 50, state: new Uint8Array([2]) }, fence); // older: ignored
      const loaded = await storage.snapshots.load(doc);
      expect(loaded?.seq).toBe(100);
      expect([...loaded!.state]).toEqual([1]);
    });

    it('an outdated owner can’t move the pointer (the paused-server-overwrites-snapshot case)', async () => {
      const doc = `snapfence-${run}`;
      const old = await own(doc, 'server-a', 300);
      await sleep(400);
      const current = await own(doc, 'server-b');
      await storage.snapshots.save(doc, { seq: 200, state: new Uint8Array([2]) }, current);
      await expect(
        storage.snapshots.save(doc, { seq: 300, state: new Uint8Array([9]) }, old),
      ).rejects.toBeInstanceOf(FencedError);
      expect((await storage.snapshots.load(doc))?.seq).toBe(200);
    });
  });

  describe('membership', () => {
    it('records heartbeats and removes a server that leaves', async () => {
      await storage.members.heartbeat({ id: `m-${run}`, url: 'ws://x:1' });
      expect((await storage.members.list()).some((m) => m.id === `m-${run}`)).toBe(true);
      await storage.members.remove(`m-${run}`);
      expect((await storage.members.list()).some((m) => m.id === `m-${run}`)).toBe(false);
    });
  });
});
