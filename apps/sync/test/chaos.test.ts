// Chaos tests (D-022): three real sync server processes, real DynamoDB Local + SeaweedFS, and the
// real timings (lease 6 s, renew 2 s, heartbeat 2 s, dead after 6 s; client ping 5 s / 10 s).
//   - kill the home server mid-typing (SIGKILL);
//   - freeze the home (SIGSTOP) until its lease expires and another server takes over, then wake
//     it (SIGCONT) and prove its writes are fenced off: no stale-epoch item lands in the log;
//   - add and remove servers while writers type.
// Every scenario asserts zero lost edits and converged documents, and prints the pause writers
// saw. Run with `pnpm --filter @wr/sync test:chaos` (needs `pnpm services:up`).
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRing, homeOf } from '../src/ring';
import { awsStorage, type AwsStorageConfig } from '../src/storage/aws';
import { dynamoClient } from '../src/storage/dynamo';
import type { Storage } from '../src/storage/types';
import { until } from './helpers';
import { report, watchArrivals, writer, type PauseReport, type Writer } from './writer';

const enabled = process.env.WR_TEST_SERVICES === '1';
const run = Date.now().toString(36);
const STORAGE: AwsStorageConfig = {
  region: 'us-east-1',
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'wr_local',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'wr_local_secret',
  editLogTable: 'wr-edit-log-chaos',
  // Fresh coordination and membership tables per run, so no earlier run's servers linger.
  coordinationTable: `wr-coordination-chaos-${run}`,
  membersTable: `wr-members-chaos-${run}`, // used only by this file's own storage reads
  snapshotBucket: 'wr-snapshots-test',
};
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One real sync server process. */
class Node {
  proc: ChildProcess | null = null;
  readonly logs: { at: number; line: string }[] = [];
  constructor(
    readonly id: string,
    readonly port: number,
    /** Each scenario's servers form their own cluster, with their own membership table. */
    readonly membersTable: string,
  ) {}
  get url() {
    return `ws://127.0.0.1:${this.port}`;
  }
  async start() {
    this.proc = spawn(process.execPath, ['--import', 'tsx', MAIN], {
      env: {
        ...process.env,
        PORT: String(this.port),
        WR_SERVER_ID: this.id,
        WR_INTERNAL_URL: this.url,
        WR_DEV_AUTH: '1',
        WR_CLUSTER_SECRET: 'chaos-secret',
        DYNAMODB_ENDPOINT: STORAGE.dynamoEndpoint,
        S3_ENDPOINT: STORAGE.s3Endpoint,
        S3_ACCESS_KEY_ID: STORAGE.s3AccessKeyId,
        S3_SECRET_ACCESS_KEY: STORAGE.s3SecretAccessKey,
        S3_SNAPSHOT_BUCKET: STORAGE.snapshotBucket,
        WR_EDIT_LOG_TABLE: STORAGE.editLogTable,
        WR_COORDINATION_TABLE: STORAGE.coordinationTable,
        WR_MEMBERS_TABLE: this.membersTable,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const capture = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n'))
        if (line) this.logs.push({ at: Date.now(), line });
    };
    this.proc.stdout!.on('data', capture);
    this.proc.stderr!.on('data', capture);
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${this.port}/healthz`)).ok) return;
      } catch {
        /* not up yet */
      }
      await sleep(100);
    }
    throw new Error(`${this.id} did not start`);
  }
  signal(sig: NodeJS.Signals) {
    this.proc?.kill(sig);
  }
  async exited() {
    if (!this.proc || this.proc.exitCode !== null) return;
    await new Promise((r) => this.proc!.once('exit', r));
  }
  logged(pattern: RegExp) {
    return this.logs.find((l) => pattern.test(l.line));
  }
}

const reports: PauseReport[] = [];
const nodes: Node[] = [];
const writers: Writer[] = [];
let storage: Storage;
let nextPort = 4900 + Math.floor(Math.random() * 50) * 2;

async function startNodes(n: number, prefix: string) {
  const started: Node[] = [];
  for (let i = 1; i <= n; i++) {
    const node = new Node(`${prefix}-${i}`, nextPort++, `wr-members-chaos-${prefix}`);
    nodes.push(node);
    started.push(node);
    await node.start();
  }
  // Let every node read everyone's heartbeat (they read the members table every 2 s).
  await sleep(2500);
  return started;
}
function stopAll(list: Node[]) {
  for (const n of list) {
    n.signal('SIGCONT');
    n.signal('SIGKILL');
  }
}
const homeAmong = (live: Node[], doc: string) =>
  live.find((n) => n.id === homeOf(buildRing(live.map((x) => x.id)), doc))!;
const keep = (w: Writer) => {
  writers.push(w);
  return w;
};
const same = (a: Writer, b: Writer) => a.text() === b.text();

describe.skipIf(!enabled)('chaos: a real 3-node cluster with the real timings', () => {
  beforeAll(async () => {
    storage = await awsStorage(STORAGE);
  });
  afterAll(() => {
    for (const w of writers) w.destroy();
    for (const n of nodes) {
      n.signal('SIGCONT');
      n.signal('SIGKILL');
    }
    console.log('\n[CHAOS SUMMARY]');
    for (const r of reports) console.log(`[CHAOS] ${JSON.stringify({ ...r, worstAt: undefined })}`);
  });

  it('kill the home server mid-typing (SIGKILL): zero lost edits', async () => {
    const live = await startNodes(3, `kill-${run}`);
    const doc = `chaos-kill-${run}`;
    const home = homeAmong(live, doc);
    const others = live.filter((n) => n !== home);
    // a enters through a non-home server (forwarded); b picks any server, like a browser.
    const a = keep(writer([others[0]!.url], 'a', doc));
    const b = keep(
      writer(
        live.map((n) => n.url),
        'b',
        doc,
      ),
    );
    await Promise.all([a.client.whenSynced(15_000), b.client.whenSynced(15_000)]);
    const seen = watchArrivals(b);
    const typing = a.type(400, 25); // ~10 s of steady typing
    await sleep(2000);
    const killedAt = Date.now();
    home.signal('SIGKILL'); // no snapshot, no lease release, no deregistration
    await typing;
    await Promise.all([a.client.whenSynced(30_000), b.client.whenSynced(30_000)]);
    await until(() => same(a, b), 10_000);
    const takeover = others
      .flatMap((n) => n.logs)
      .find(
        (l) => l.line.includes('room loaded') && l.line.includes(doc) && /"epoch":2/.test(l.line),
      );
    const r = report('SIGKILL home mid-typing', a, b, seen);
    reports.push({
      ...r,
      scenario: `${r.scenario} (takeover ${takeover ? takeover.at - killedAt : '?'} ms after kill)`,
    });
    expect(r.lost).toBe(0);
    expect(takeover).toBeDefined();
    stopAll(live);
  });

  it('freeze the home (SIGSTOP) until its lease expires; on waking (SIGCONT) its writes are fenced off', async () => {
    const live = await startNodes(3, `pause-${run}`);
    const doc = `chaos-pause-${run}`;
    const old = homeAmong(live, doc);
    const entry = live.find((n) => n !== old)!;
    // The worst case: a writer connected straight to the frozen owner that never notices
    // (heartbeat disabled), so it keeps sending edits into a server that will wake up stale.
    const stuck = keep(
      writer([old.url], 'stuck', doc, { heartbeat: { everyMs: 600_000, deadAfterMs: 600_000 } }),
    );
    const other = keep(writer([entry.url], 'other', doc));
    // And an ordinary writer on the frozen server (normal heartbeat): what a real person sees.
    const typical = keep(writer([old.url, entry.url], 'typical', doc));
    await Promise.all([stuck, other, typical].map((w) => w.client.whenSynced(15_000)));
    while (typical.client.connection !== 'online') await sleep(50);
    await stuck.type(20, 20);
    await until(() => same(stuck, other), 5000);

    const typicalSeen = watchArrivals(other);
    const frozenAt = Date.now();
    const typicalTyping = typical.type(200, 50); // keeps typing straight through the freeze
    old.signal('SIGSTOP');
    // Another server takes over once the lease has expired: epoch 2.
    let takeoverAt = 0;
    for (let i = 0; i < 300 && !takeoverAt; i++) {
      const lease = await storage.leases.peek(doc);
      if (lease && lease.epoch >= 2) takeoverAt = Date.now();
      else await sleep(100);
    }
    if (!takeoverAt)
      for (const n of live)
        console.log(
          `[DEBUG ${n.id}]\n` + n.logs.map((l) => `${l.at - frozenAt} ${l.line}`).join('\n'),
        );
    expect(takeoverAt).toBeGreaterThan(0);
    const seen = watchArrivals(stuck);
    await other.type(40, 20); // the new owner accepts edits
    await stuck.type(20, 20); // …while the stuck writer's edits queue up for the frozen old owner
    old.signal('SIGCONT'); // it wakes still believing it owns the episode

    await until(() => !!old.logged(/room lost ownership/), 15_000);
    await typicalTyping;
    const lost = old.logged(/room lost ownership/)!;
    await Promise.all([stuck, other, typical].map((w) => w.client.whenSynced(30_000)));
    await until(() => same(stuck, other) && same(typical, other), 10_000);
    const words = new Set(other.text().split(' '));
    for (const w of [...stuck.words, ...other.words, ...typical.words])
      expect(words.has(w), w).toBe(true);

    // The fencing proof, read straight from DynamoDB: no log item written by the stale owner
    // (epoch 1) sits after the first item the new owner (epoch 2+) wrote.
    const items = await dynamoClient(STORAGE.dynamoEndpoint, 'us-east-1').send(
      new QueryCommand({
        TableName: STORAGE.editLogTable,
        KeyConditionExpression: 'docId = :d',
        ExpressionAttributeValues: { ':d': { S: doc } },
        ConsistentRead: true,
      }),
    );
    const log = (items.Items ?? []).map((i) => ({
      seq: Number(i.seq!.N),
      epoch: Number(i.epoch!.N),
    }));
    const firstNew = Math.min(...log.filter((e) => e.epoch >= 2).map((e) => e.seq));
    const staleAfterTakeover = log.filter((e) => e.epoch === 1 && e.seq >= firstNew);
    expect(staleAfterTakeover).toEqual([]);
    void seen;
    const r = report(
      'SIGSTOP home, then SIGCONT (split brain): a normal writer on the frozen server',
      typical,
      other,
      typicalSeen,
    );
    reports.push({
      ...r,
      scenario: `${r.scenario} (takeover ${takeoverAt - frozenAt} ms after freeze; woken owner stepped down: ${(JSON.parse(lost.line.slice(lost.line.indexOf('{'))) as { reason: string }).reason})`,
    });
    expect(r.lost).toBe(0);
    stopAll(live);
  });

  it('add a server and remove one (SIGTERM) while six writers type: zero lost edits', async () => {
    const live = await startNodes(2, `scale-${run}`);
    const docs = Array.from({ length: 6 }, (_, i) => `chaos-scale-${run}-${i}`);
    const ws = docs.map((d, i) =>
      keep(
        writer(
          live.map((n) => n.url),
          `s${i}`,
          d,
        ),
      ),
    );
    const observers = docs.map((d, i) =>
      keep(
        writer(
          live.map((n) => n.url),
          `o${i}`,
          d,
        ),
      ),
    );
    await Promise.all([...ws, ...observers].map((w) => w.client.whenSynced(15_000)));
    const seen = observers.map((o) => watchArrivals(o));
    const t0 = Date.now();
    const typing = Promise.all(ws.map((w) => w.type(300, 30))); // ~9 s each
    await sleep(2000);
    const addedAt = Date.now() - t0;
    const added = new Node(`scale-${run}-3`, nextPort++, `wr-members-chaos-scale-${run}`);
    nodes.push(added);
    await added.start(); // joins the ring: its episodes are handed over gracefully
    await sleep(3000);
    const termAt = Date.now() - t0;
    live[0]!.signal('SIGTERM'); // graceful removal: leave the ring, hand everything off, exit
    await live[0]!.exited();
    console.log(
      `[TIMELINE] added at +${addedAt} ms, SIGTERM at +${termAt} ms, exited at +${Date.now() - t0} ms`,
    );
    await typing;
    await Promise.all([...ws, ...observers].map((w) => w.client.whenSynced(30_000)));
    for (const [i, w] of ws.entries()) await until(() => same(w, observers[i]!), 10_000);
    const handoffs = [...live, added]
      .flatMap((n) => n.logs)
      .filter((l) => l.line.includes('room handed off')).length;
    let worst: PauseReport | null = null;
    for (const [i, w] of ws.entries()) {
      const r = report(`writer ${i}`, w, observers[i]!, seen[i]!);
      console.log(
        `[TIMELINE] writer ${i}: worst wait ${r.worstUnconfirmedMs} ms for a word typed at +${(r.worstAt ?? t0) - t0} ms`,
      );
      expect(r.lost).toBe(0);
      if (!worst || r.worstUnconfirmedMs > worst.worstUnconfirmedMs) worst = r;
    }
    reports.push({
      ...worst!,
      scenario: `add a server, then SIGTERM one, 6 writers (${handoffs} graceful handoffs; worst writer shown)`,
    });
  });
});
