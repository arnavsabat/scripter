// The load-test harness (SPEC 5.4, D-082, D-092). Runs D-082's targets against a sync cluster:
//
//   rooms     1,000 writers in 200 scripts of 5, typing for 3 minutes on 3 servers (p95 < 150 ms)
//   room15    one 15-writer room
//   failover  a server killed mid-run: zero lost edits, and the pause writers saw
//   ramp      one server, more and more writers, until p95 crosses 150 ms
//
// Local:  pnpm loadtest <scenario> --local 3        (spawns servers on DynamoDB Local + SeaweedFS)
// AWS:    the generator task in WrLoad (docs/runbook.md): --servers ws://<load balancer> --crash-member
//         (keys from WR_LOADTEST_KEYS; one live server crashed through its crash switch, D-093)
// Any setting can be overridden: --rooms --size --seconds --workers --kill-at --steps --label.
// Results print as a table and are written to tools/loadtest/results/<label>.json; --json also
// prints them as one line of JSON (on AWS, read it back from the task's CloudWatch logs).
import { createPortableTestIssuer } from '@wr/auth/testing';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { REALISTIC } from './room';
import { Histogram } from './stats';
import type { Go, Job, Second, WorkerReport } from './worker';

type Scenario = 'rooms' | 'room15' | 'failover' | 'ramp';
const PRESETS: Record<Scenario, Settings> = {
  rooms: { rooms: 200, size: 5, seconds: 180, nodes: 3 },
  room15: { rooms: 1, size: 15, seconds: 120, nodes: 3 },
  failover: { rooms: 60, size: 5, seconds: 120, nodes: 3, killAt: 50 },
  ramp: { rooms: 0, size: 5, seconds: 45, nodes: 1, steps: [50, 100, 200, 400, 800, 1200] },
};
interface Settings {
  rooms: number;
  size: number;
  seconds: number;
  nodes: number;
  killAt?: number;
  steps?: number[];
}

// ---- Arguments ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const scenario = argv[0] as Scenario;
if (!PRESETS[scenario]) {
  console.error('usage: pnpm loadtest <rooms|room15|failover|ramp> [--local N | --servers urls]');
  process.exit(1);
}
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const num = (name: string, fallback: number) => Number(flag(name) ?? fallback);
const preset = PRESETS[scenario];
const settings: Settings = {
  rooms: num('rooms', preset.rooms),
  size: num('size', preset.size),
  seconds: num('seconds', preset.seconds),
  nodes: num('local', preset.nodes),
  ...(flag('kill-at') || preset.killAt ? { killAt: num('kill-at', preset.killAt ?? 0) } : {}),
  ...(flag('steps') || preset.steps
    ? { steps: (flag('steps') ?? preset.steps!.join(',')).split(',').map(Number) }
    : {}),
};
const workers = num('workers', Math.max(1, Math.min(8, cpus().length - 2)));
const label =
  flag('label') ?? `${scenario}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
const run = Date.now().toString(36);

// ---- Servers -----------------------------------------------------------------------------
const SERVER = fileURLToPath(new URL('./server.ts', import.meta.url));
const local: { proc: ChildProcess; port: number; id: string }[] = [];

async function startLocal(n: number, publicJwk: object) {
  const env = process.env;
  for (let i = 0; i < n; i++) {
    const port = 4501 + i;
    const id = `lt-${i + 1}`;
    const proc = spawn(process.execPath, ['--import', 'tsx', SERVER], {
      env: {
        ...env,
        PORT: String(port),
        WR_SERVER_ID: id,
        WR_INTERNAL_URL: `ws://127.0.0.1:${port}`,
        WR_LOADTEST_PUBLIC_JWK: JSON.stringify(publicJwk),
        WR_CLUSTER_SECRET: 'loadtest-only',
        AWS_REGION: env.AWS_REGION ?? 'us-east-1',
        DYNAMODB_ENDPOINT: env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
        S3_ENDPOINT: env.S3_ENDPOINT ?? 'http://localhost:8333',
        S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID ?? 'wr_local',
        S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? 'wr_local_secret',
        S3_SNAPSHOT_BUCKET: 'wr-snapshots-test',
        WR_EDIT_LOG_TABLE: 'wr-edit-log-lt',
        // Fresh leases and membership per run, so no earlier run's servers linger.
        WR_COORDINATION_TABLE: `wr-coordination-lt-${run}`,
        WR_MEMBERS_TABLE: `wr-members-lt-${run}`,
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    local.push({ proc, port, id });
    for (let t = 0; ; t++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break;
      } catch {
        /* starting */
      }
      if (t > 300) throw new Error(`${id} did not start`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return local.map((s) => `ws://127.0.0.1:${s.port}`);
}
const stopLocal = () => {
  for (const s of local) s.proc.kill('SIGTERM');
};

// ---- One measured run ----------------------------------------------------------------------
interface RunResult {
  writers: number;
  rooms: number;
  latency: ReturnType<Histogram['summary']> & { over150: number; over1s: number };
  keystrokes: number;
  lostCharacters: number;
  unackedWriters: number;
  failedWriters: number;
  connectSeconds: number;
  timeline: Record<number, Second>;
  kill?: { atSecond: number; pause: { maxMs: number; keystrokesOver1s: number } };
}

async function measure(
  servers: string[],
  keys: Job['keys'],
  rooms: number,
  size: number,
  seconds: number,
  kill?: { atSecond: number; run: () => void },
): Promise<RunResult> {
  const plans = Array.from({ length: rooms }, (_, i) => ({
    docId: `lt-${run}-${rooms}x${size}-${i}`,
    size,
  }));
  const n = Math.min(workers, rooms);
  const threads = Array.from({ length: n }, (_, w) => {
    const job: Job = {
      rooms: plans.filter((_, i) => i % n === w),
      servers,
      keys,
      typing: REALISTIC,
      drainMs: 60_000,
    };
    // Next to this file: worker.ts under tsx, worker.js in the bundled image.
    const file = import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js';
    return new Worker(new URL(file, import.meta.url), { workerData: job });
  });
  const ready = threads.map(
    (t) =>
      new Promise<number>((r) => t.once('message', (m: { connectMs: number }) => r(m.connectMs))),
  );
  const connect = Math.max(...(await Promise.all(ready)));
  const startAt = Date.now() + 1000;
  const go: Go = { type: 'go', startAt, stopAt: startAt + seconds * 1000 };
  const done = threads.map(
    (t) =>
      new Promise<WorkerReport>((resolve, reject) => {
        t.on('message', (m: { type: string; report?: WorkerReport }) => {
          if (m.type === 'done') resolve(m.report!);
        });
        t.once('error', reject);
      }),
  );
  for (const t of threads) t.postMessage(go);
  if (kill) setTimeout(kill.run, startAt - Date.now() + kill.atSecond * 1000);
  const reports = await Promise.all(done);
  await Promise.all(threads.map((t) => t.terminate()));

  const histogram = new Histogram();
  const timeline: Record<number, Second> = {};
  for (const r of reports) {
    histogram.merge(new Histogram(r.histogram));
    for (const [sec, s] of Object.entries(r.timeline)) {
      const t = (timeline[Number(sec)] ??= { samples: 0, over150: 0, over1s: 0, max: 0 });
      t.samples += s.samples;
      t.over150 += s.over150;
      t.over1s += s.over1s;
      t.max = Math.max(t.max, s.max);
    }
  }
  const roomResults = reports.flatMap((r) => r.rooms);
  const after = kill
    ? Object.entries(timeline).filter(
        ([s]) => Number(s) >= kill.atSecond - 2 && Number(s) <= kill.atSecond + 30,
      )
    : [];
  return {
    writers: rooms * size,
    rooms,
    latency: { ...histogram.summary(), over150: histogram.over(150), over1s: histogram.over(1000) },
    keystrokes: roomResults.reduce((s, r) => s + r.keystrokes, 0),
    lostCharacters: roomResults.reduce((s, r) => s + r.lost, 0),
    unackedWriters: roomResults.reduce((s, r) => s + r.unacked, 0),
    failedWriters: roomResults.reduce((s, r) => s + r.failed, 0),
    connectSeconds: Math.round(connect / 100) / 10,
    timeline,
    ...(kill
      ? {
          kill: {
            atSecond: kill.atSecond,
            pause: {
              maxMs: Math.max(0, ...after.map(([, s]) => s.max)),
              keystrokesOver1s: after.reduce((n, [, s]) => n + s.over1s, 0),
            },
          },
        }
      : {}),
  };
}

// ---- Main ----------------------------------------------------------------------------------
// The keys: this run's own (local), a file, or WR_LOADTEST_KEYS (the AWS generator task).
const keyFile = flag('key');
const keyJson = keyFile ? readFileSync(keyFile, 'utf8') : process.env.WR_LOADTEST_KEYS;
const issuer = keyJson ? null : await createPortableTestIssuer();
const keys: Job['keys'] = keyJson
  ? (JSON.parse(keyJson) as Job['keys'])
  : { privateJwk: issuer!.privateJwk, publicJwk: issuer!.publicJwk };
const remote = flag('servers')?.split(',').filter(Boolean);
const servers = remote ?? (await startLocal(settings.nodes, keys.publicJwk));
const killCmd = flag('kill-cmd');
/** A crash, not a goodbye: SIGKILL locally; on AWS, a live member's crash switch. */
const killSecond = () => {
  if (argv.includes('--crash-member')) void crashMember();
  else if (killCmd) execSync(killCmd, { stdio: 'inherit' });
  else local[Math.min(1, local.length - 1)]!.proc.kill('SIGKILL');
};
async function crashMember() {
  const { awsConfigFromEnv, awsStorage } = await import('@wr/sync/aws');
  const members = await (await awsStorage(awsConfigFromEnv(process.env))).members.list();
  const victim = members.sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!victim) return console.error('crash: no live members');
  const host = new URL(victim.url.replace(/^ws/, 'http')).hostname;
  console.log(`crashing ${victim.id} (${host})`);
  await fetch(`http://${host}:${process.env.WR_LOADTEST_CRASH_PORT ?? 4001}/__crash`, {
    method: 'POST',
    headers: { 'x-loadtest-secret': process.env.WR_CLUSTER_SECRET ?? '' },
  }).catch(() => {}); // the connection dies with the process
}

const machine = {
  date: new Date().toISOString(),
  commit: (() => {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      return 'unknown';
    }
  })(),
  generator: {
    cpus: cpus().length,
    model: cpus()[0]?.model,
    memoryGB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
    workers,
  },
  target: remote
    ? 'remote'
    : `local: ${settings.nodes} server processes on DynamoDB Local + SeaweedFS`,
};

const results: { settings: Settings; machine: typeof machine; runs: RunResult[] } = {
  settings,
  machine,
  runs: [],
};
const row = (r: RunResult) =>
  `${String(r.writers).padStart(5)} writers ${String(r.rooms).padStart(4)} rooms  p50 ${String(r.latency.p50).padStart(4)} ms  p95 ${String(r.latency.p95).padStart(5)} ms  p99 ${String(r.latency.p99).padStart(5)} ms  max ${String(r.latency.max).padStart(5)} ms  samples ${r.latency.samples}  keystrokes ${r.keystrokes}  lost ${r.lostCharacters}  unacked ${r.unackedWriters}  failed ${r.failedWriters}` +
  (r.kill
    ? `  pause ${r.kill.pause.maxMs} ms (${r.kill.pause.keystrokesOver1s} keystrokes over 1 s)`
    : '');
try {
  if (scenario === 'ramp') {
    for (const writers of settings.steps!) {
      const r = await measure(
        servers,
        keys,
        Math.ceil(writers / settings.size),
        settings.size,
        settings.seconds,
      );
      results.runs.push(r);
      console.log(row(r));
      if (r.latency.p95 > 150 || r.failedWriters > 0) break;
    }
  } else {
    const r = await measure(
      servers,
      keys,
      settings.rooms,
      settings.size,
      settings.seconds,
      settings.killAt !== undefined ? { atSecond: settings.killAt, run: killSecond } : undefined,
    );
    results.runs.push(r);
    console.log(row(r));
  }
} finally {
  stopLocal();
}
if (argv.includes('--json')) console.log(`LOADTEST_RESULT ${JSON.stringify(results)}`);
// The results file, when the folder is writable (in the AWS image, the JSON line is the record).
try {
  const dir = fileURLToPath(new URL('../results/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${label}.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`results: tools/loadtest/results/${label}.json`);
} catch (err) {
  console.error(`results not written: ${String(err)}`);
}
process.exit(0);
