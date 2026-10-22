// Storage-backed tests against the local services (DynamoDB Local + SeaweedFS from
// docker-compose.yml). Run with `pnpm --filter @wr/sync test:services` after `pnpm services:up`.
// Skipped unless WR_TEST_SERVICES=1, so `pnpm test` works without containers.
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { DynamoEditLog, dynamoClient } from '../src/storage/dynamo';
import { S3SnapshotStore, s3Client } from '../src/storage/s3';
import type { Storage } from '../src/storage/types';
import { client, sleep, type, until } from './helpers';

const enabled = process.env.WR_TEST_SERVICES === '1';
if (!enabled)
  console.log(
    'aws-storage tests skipped: run `pnpm services:up`, then `pnpm --filter @wr/sync test:services`',
  );

const DYNAMO = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const S3 = process.env.S3_ENDPOINT ?? 'http://localhost:8333';
const S3_KEY = process.env.S3_ACCESS_KEY_ID ?? 'wr_local';
const S3_SECRET = process.env.S3_SECRET_ACCESS_KEY ?? 'wr_local_secret';
// One fixed test table and bucket (a new bucket per run would use up SeaweedFS's volumes);
// every run uses its own document IDs, so runs never see each other's data.
const run = Date.now().toString(36);
const TABLE = 'wr-edit-log-test';
const BUCKET = 'wr-snapshots-test';

describe.skipIf(!enabled)('DynamoDB edit log and S3 snapshots (local services)', () => {
  const ddb = dynamoClient(DYNAMO, 'us-east-1');
  const log = new DynamoEditLog(ddb, TABLE);
  const snapshots = new S3SnapshotStore(s3Client(S3, 'us-east-1', S3_KEY, S3_SECRET), BUCKET);
  const storage: Storage = { log, snapshots };

  beforeAll(async () => {
    await log.ensureTable();
    await snapshots.ensureBucket();
  });

  it('appends in order, reads back, and refuses to write the same seq twice', async () => {
    const doc = `order-${run}`;
    for (let seq = 0; seq < 5; seq++) await log.append(doc, seq, new Uint8Array([seq, seq]));
    const tail = await log.readFrom(doc, 2);
    expect(tail.entries.map((e) => [e.seq, [...e.update]])).toEqual([
      [2, [2, 2]],
      [3, [3, 3]],
      [4, [4, 4]],
    ]);
    expect(tail.nextSeq).toBe(5);
    await expect(log.append(doc, 3, new Uint8Array([9]))).rejects.toThrow(/conditional/i);
  });

  it('stores updates bigger than the 400 KB item limit in chunks, byte for byte', async () => {
    const doc = `big-${run}`;
    const big = new Uint8Array(randomBytes(900_000));
    await log.append(doc, 0, big);
    const [entry] = (await log.readFrom(doc, 0)).entries;
    expect(entry!.update.byteLength).toBe(900_000);
    expect(Buffer.compare(Buffer.from(entry!.update), Buffer.from(big))).toBe(0);
  });

  it('skips an incomplete chunk group left by a crash, and never reuses its seq', async () => {
    const doc = `torn-${run}`;
    await log.append(doc, 0, new Uint8Array([1]));
    // Simulate a crash after the first of three chunks of seq 1 was written.
    await ddb.send(
      new PutItemCommand({
        TableName: TABLE,
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
    const tail = await log.readFrom(doc, 0);
    expect(tail.entries.map((e) => e.seq)).toEqual([0]);
    expect(tail.nextSeq).toBe(2);
  });

  it('truncates everything below a seq', async () => {
    const doc = `trunc-${run}`;
    for (let seq = 0; seq < 40; seq++) await log.append(doc, seq, new Uint8Array([seq]));
    await log.truncateBelow(doc, 30);
    const tail = await log.readFrom(doc, 0);
    expect(tail.entries.map((e) => e.seq)).toEqual([30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
  });

  it('saves and loads snapshots with the seq they cover', async () => {
    const doc = `snap-${run}`;
    expect(await snapshots.load(doc)).toBeNull();
    await snapshots.save(doc, { seq: 1234, state: new Uint8Array([4, 5, 6]) });
    const loaded = await snapshots.load(doc);
    expect(loaded?.seq).toBe(1234);
    expect([...loaded!.state]).toEqual([4, 5, 6]);
  });

  describe('a real server process, killed with SIGKILL mid-typing', () => {
    const port = 4790 + Math.floor(Math.random() * 100);
    let child: ChildProcess | null = null;
    const start = async () => {
      child = spawn(
        process.execPath,
        ['--import', 'tsx', fileURLToPath(new URL('../src/main.ts', import.meta.url))],
        {
          env: {
            ...process.env,
            PORT: String(port),
            WR_DEV_AUTH: '1',
            DYNAMODB_ENDPOINT: DYNAMO,
            S3_ENDPOINT: S3,
            S3_ACCESS_KEY_ID: S3_KEY,
            S3_SECRET_ACCESS_KEY: S3_SECRET,
            S3_SNAPSHOT_BUCKET: BUCKET,
            WR_EDIT_LOG_TABLE: TABLE,
          },
          stdio: 'ignore',
        },
      );
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return;
        } catch {
          /* not up yet */
        }
        await sleep(100);
      }
      throw new Error('server did not start');
    };
    afterAll(() => {
      child?.kill('SIGKILL');
    });

    it('loses nothing: every word typed before, during and after the crash is stored', async () => {
      await start();
      const srv = { port };
      const doc = `crash-${run}`;
      const a = client(srv, 'Maya', doc);
      const b = client(srv, 'Sam', doc);
      await Promise.all([a.c.whenSynced(), b.c.whenSynced()]);
      const typing = (async () => {
        for (let i = 0; i < 200; i++) {
          type(a.doc, `w${i} `);
          if (i % 4 === 0) type(b.doc, `x${i} `);
          await sleep(5);
        }
      })();
      await sleep(300);
      child!.kill('SIGKILL'); // no graceful shutdown, no final snapshot
      await sleep(400);
      await start(); // a fresh process: snapshot + DynamoDB log tail
      await typing;
      await Promise.all([a.c.whenSynced(20_000), b.c.whenSynced(20_000)]);
      await until(() => a.text() === b.text(), 5000);

      // Rebuild purely from DynamoDB + S3, as the next server would.
      const rebuilt = new Y.Doc();
      const snap = await storage.snapshots.load(doc);
      if (snap) Y.applyUpdate(rebuilt, snap.state);
      for (const e of (await storage.log.readFrom(doc, snap?.seq ?? 0)).entries)
        Y.applyUpdate(rebuilt, e.update);
      const words = new Set(rebuilt.getText('t').toJSON().trim().split(' '));
      for (let i = 0; i < 200; i++) {
        expect(words.has(`w${i}`), `w${i}`).toBe(true);
        if (i % 4 === 0) expect(words.has(`x${i}`), `x${i}`).toBe(true);
      }
      a.c.destroy();
      b.c.destroy();
    });
  });
});
