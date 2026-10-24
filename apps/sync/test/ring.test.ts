import { describe, expect, it } from 'vitest';
import { buildRing, homeOf } from '../src/ring';

const docs = Array.from({ length: 6000 }, (_, i) => `episode-${i}`);
const servers = (n: number) => Array.from({ length: n }, (_, i) => `sync-${i + 1}`);

describe('consistent hash ring (D-022: 256 SHA-1 virtual nodes)', () => {
  it('is deterministic and independent of the order servers are listed in', () => {
    const a = buildRing(['sync-1', 'sync-2', 'sync-3']);
    const b = buildRing(['sync-3', 'sync-1', 'sync-2']);
    for (const d of docs.slice(0, 500)) expect(homeOf(a, d)).toBe(homeOf(b, d));
  });

  it('spreads episodes evenly across servers', () => {
    for (const n of [3, 10]) {
      const ring = buildRing(servers(n));
      const counts = new Map<string, number>();
      for (const d of docs) counts.set(homeOf(ring, d)!, (counts.get(homeOf(ring, d)!) ?? 0) + 1);
      const fair = docs.length / n;
      for (const c of counts.values()) expect(Math.abs(c - fair) / fair).toBeLessThan(0.3);
    }
  });

  it('when a server leaves, only its own episodes move, and they spread over every survivor', () => {
    const before = buildRing(servers(5));
    const after = buildRing(servers(5).filter((s) => s !== 'sync-3'));
    const heirs = new Set<string>();
    for (const d of docs) {
      const was = homeOf(before, d);
      const now = homeOf(after, d);
      if (was !== 'sync-3') expect(now, d).toBe(was);
      else heirs.add(now!);
    }
    expect([...heirs].sort()).toEqual(['sync-1', 'sync-2', 'sync-4', 'sync-5']);
  });

  it('when a server joins, the only episodes that move are the ones it now owns', () => {
    const before = buildRing(servers(3));
    const after = buildRing(servers(4));
    let moved = 0;
    for (const d of docs) {
      if (homeOf(before, d) !== homeOf(after, d)) {
        expect(homeOf(after, d)).toBe('sync-4');
        moved++;
      }
    }
    expect(moved / docs.length).toBeGreaterThan(0.15);
    expect(moved / docs.length).toBeLessThan(0.35); // about 1/4
  });

  it('has no home with no servers', () => {
    expect(homeOf(buildRing([]), 'x')).toBeNull();
  });
});
