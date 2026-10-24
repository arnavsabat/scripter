// Membership (SPEC 5.4, D-022): every server heartbeats into the members table every 2 s and
// reads everyone's heartbeats on the same schedule. A server unheard from for 6 s is dead. The
// live set becomes the hash ring, so every server computes the same home for every episode.
//
// The ring is only a routing hint: two servers can briefly disagree while a change spreads.
// Correctness never depends on it; the lease (with its fencing token) decides who may write.
import { buildRing, homeOf, VNODES, type Ring } from './ring';
import type { Logger } from './room';
import type { Member, MembershipStore } from './storage/types';

export interface ClusterOptions {
  self: { id: string; url: string };
  store: MembershipStore;
  heartbeatMs: number;
  deadAfterMs: number;
  vnodes?: number;
  logger: Logger;
  /** Called whenever the set of live servers changes. */
  onChange: (ring: Ring) => void;
  frozen?: () => boolean;
}

export class Cluster {
  ring: Ring;
  private members = new Map<string, Member>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly opts: ClusterOptions) {
    this.ring = buildRing([opts.self.id], opts.vnodes ?? VNODES);
  }

  get selfId() {
    return this.opts.self.id;
  }

  async start() {
    await this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.heartbeatMs);
  }

  /** One heartbeat plus one read of everyone else's. */
  private async tick() {
    if (this.stopped || this.opts.frozen?.()) return;
    try {
      await this.opts.store.heartbeat(this.opts.self);
      const now = Date.now();
      const alive = (await this.opts.store.list()).filter(
        (m) => now - m.heartbeatAt <= this.opts.deadAfterMs,
      );
      if (this.stopped) return;
      this.members = new Map(alive.map((m) => [m.id, m]));
      this.members.set(this.opts.self.id, { ...this.opts.self, heartbeatAt: now }); // we're alive
      const ids = [...this.members.keys()].sort();
      if (ids.join() !== this.ring.servers.join()) {
        const before = this.ring.servers;
        this.ring = buildRing(ids, this.opts.vnodes ?? VNODES);
        this.opts.logger.info('membership changed', {
          self: this.opts.self.id,
          before,
          after: ids,
        });
        this.opts.onChange(this.ring);
      }
    } catch (err) {
      this.opts.logger.error('membership heartbeat failed', { err: String(err) });
    }
  }

  homeOf(docId: string) {
    return homeOf(this.ring, docId);
  }

  urlOf(serverId: string) {
    return this.members.get(serverId)?.url ?? null;
  }

  /** Leave the ring on purpose (graceful shutdown): others see it on their next read. */
  async leave() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.opts.store.remove(this.opts.self.id).catch(() => {});
    // From our own point of view we're already out, so every room we hold now "belongs elsewhere".
    this.members.delete(this.opts.self.id);
    this.ring = buildRing([...this.members.keys()], this.opts.vnodes ?? VNODES);
  }

  /** Crash simulation: stop heartbeating without deregistering (others time us out). */
  halt() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }
}
