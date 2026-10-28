// A load-test worker thread (D-092): it runs its share of the rooms, so the load generator uses
// several cores and never becomes the bottleneck it's measuring. Sender and receivers of every
// keystroke are in the same thread, so latency is measured on one clock.
import { testIssuerFromJwks } from '@wr/auth/testing';
import type { JWK } from 'jose';
import { parentPort, workerData } from 'node:worker_threads';
import { Room, type RoomResult, type Typing } from './room';
import { Histogram } from './stats';

export interface Job {
  rooms: { docId: string; size: number }[];
  servers: string[];
  keys: { privateJwk: JWK; publicJwk: JWK };
  typing: Typing;
  drainMs: number;
}

/** Sent once every worker is connected: when they all start typing, and stop (epoch ms). */
export interface Go {
  type: 'go';
  startAt: number;
  stopAt: number;
}

export interface Second {
  samples: number;
  over150: number;
  over1s: number;
  max: number;
}

export interface WorkerReport {
  histogram: number[];
  /** Per second of the run, by when the keystroke was sent. */
  timeline: Record<number, Second>;
  rooms: RoomResult[];
  connectMs: number;
}

const job = workerData as Job;
const issuer = await testIssuerFromJwks(job.keys.privateJwk, job.keys.publicJwk);
const tokens = new Map<string, Promise<string>>();
const token = (name: string) => {
  let t = tokens.get(name);
  if (!t) tokens.set(name, (t = issuer.sign(name)));
  return t;
};

let go: Go = { type: 'go', startAt: 0, stopAt: 0 };
const histogram = new Histogram();
const timeline: Record<number, Second> = {};
const record = (sentAt: number, latency: number) => {
  histogram.add(latency);
  const second = Math.floor((performance.timeOrigin + sentAt - go.startAt) / 1000);
  const s = (timeline[second] ??= { samples: 0, over150: 0, over1s: 0, max: 0 });
  s.samples += 1;
  if (latency > 150) s.over150 += 1;
  if (latency > 1000) s.over1s += 1;
  if (latency > s.max) s.max = Math.round(latency);
};

const t0 = Date.now();
const rooms = job.rooms.map((r) => new Room(r.docId, r.size, job.servers, token, record));
// Open a few rooms at a time, so connecting isn't a stampede of its own.
for (let i = 0; i < rooms.length; i += 10)
  await Promise.all(rooms.slice(i, i + 10).map((r) => r.open()));
const connectMs = Date.now() - t0;
go = await new Promise<Go>((resolve) => {
  parentPort!.once('message', (m: Go) => resolve(m));
  parentPort!.postMessage({ type: 'ready', connectMs });
});
await new Promise((r) => setTimeout(r, Math.max(0, go.startAt - Date.now())));
for (const r of rooms) r.start(job.typing);
await new Promise((r) => setTimeout(r, Math.max(0, go.stopAt - Date.now())));
for (const r of rooms) r.stop();
await Promise.all(rooms.map((r) => r.drain(job.drainMs)));
const results: RoomResult[] = [];
for (const r of rooms) results.push(await r.verify());
for (const r of rooms) r.close();
parentPort!.postMessage({
  type: 'done',
  report: {
    histogram: histogram.counts,
    timeline,
    rooms: results,
    connectMs,
  } satisfies WorkerReport,
});
