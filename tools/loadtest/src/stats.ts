// Latency statistics for the load tests (D-092). A full run is millions of samples, so they go
// into a histogram of 1 ms buckets (up to 30 s, then one overflow bucket) instead of an array:
// fixed memory, mergeable across worker threads, and exact to the millisecond for percentiles.

const MAX_MS = 30_000;

export class Histogram {
  readonly counts: number[];
  total = 0;
  max = 0;
  sum = 0;

  constructor(counts?: number[]) {
    this.counts = counts ?? new Array<number>(MAX_MS + 2).fill(0);
    if (counts)
      for (let ms = 0; ms < counts.length; ms++) {
        const n = counts[ms]!;
        if (!n) continue;
        this.total += n;
        this.sum += n * ms;
        this.max = ms;
      }
  }

  add(ms: number) {
    const b = Math.max(0, Math.min(MAX_MS + 1, Math.round(ms)));
    this.counts[b]! += 1;
    this.total += 1;
    this.sum += b;
    if (b > this.max) this.max = b;
  }

  merge(other: Histogram) {
    for (let i = 0; i < other.counts.length; i++) this.counts[i]! += other.counts[i]!;
    this.total += other.total;
    this.sum += other.sum;
    this.max = Math.max(this.max, other.max);
  }

  /** The smallest latency at or below which `p` of the samples fall (p in 0..1). */
  percentile(p: number) {
    if (!this.total) return 0;
    const target = Math.ceil(p * this.total);
    let seen = 0;
    for (let ms = 0; ms < this.counts.length; ms++) {
      seen += this.counts[ms]!;
      if (seen >= target) return ms;
    }
    return this.max;
  }

  /** How many samples took longer than `ms`. */
  over(ms: number) {
    let n = 0;
    for (let b = Math.floor(ms) + 1; b < this.counts.length; b++) n += this.counts[b]!;
    return n;
  }

  summary() {
    return {
      samples: this.total,
      p50: this.percentile(0.5),
      p95: this.percentile(0.95),
      p99: this.percentile(0.99),
      max: this.max,
      mean: this.total ? Math.round((this.sum / this.total) * 10) / 10 : 0,
    };
  }
}
