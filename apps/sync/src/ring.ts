// Consistent hashing with virtual nodes (SPEC 5.4, D-022).
//
// Picture a circle of 2^32 positions. Each live server is placed on it 256 times (its virtual
// nodes), at positions given by hashing "<serverId>#<i>". An episode's home is the first server
// position at or clockwise after hash(episodeId).
//   - Every server computes this independently from the same membership list, so they all
//     agree on each episode's home without talking to each other.
//   - When a server joins or leaves, only the episodes on the arcs it gains or loses move
//     (about 1/N of them), rather than everything reshuffling as with hash(id) % N.
//   - With 256 positions per server the arcs average out, so load is even, and a dead server's
//     episodes are spread over every survivor instead of piling onto one neighbour.
import { createHash } from 'node:crypto';

export const VNODES = 256;

/** First 32 bits of SHA-1: well spread, deterministic, and built into Node. */
export const position = (value: string) =>
  createHash('sha1').update(value).digest().readUInt32BE(0);

export interface Ring {
  readonly servers: readonly string[];
  /** Sorted virtual-node positions and the server each belongs to. */
  readonly points: Uint32Array;
  readonly owners: readonly string[];
}

export function buildRing(serverIds: Iterable<string>, vnodes = VNODES): Ring {
  const servers = [...new Set(serverIds)].sort();
  const entries: [number, string][] = [];
  for (const id of servers)
    for (let i = 0; i < vnodes; i++) entries.push([position(`${id}#${i}`), id]);
  // Ties are astronomically unlikely; break them by server ID so every server sorts identically.
  entries.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  return {
    servers,
    points: Uint32Array.from(entries.map((e) => e[0])),
    owners: entries.map((e) => e[1]),
  };
}

/** The episode's home server: binary search for the first point at or after its position. */
export function homeOf(ring: Ring, docId: string): string | null {
  if (ring.owners.length === 0) return null;
  const p = position(docId);
  let lo = 0;
  let hi = ring.points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ring.points[mid]! < p) lo = mid + 1;
    else hi = mid;
  }
  return ring.owners[lo % ring.owners.length]!; // past the last point: wrap around the circle
}
