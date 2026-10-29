// The client's reconnect backoff (SPEC 5.4, D-105): full jitter, capped at 3 s, so a writer whose
// reconnects keep being refused (a load balancer still routing to a dead server) still tries
// again within 3 s, however many tries have failed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { SyncClient, type SocketLike } from '../src/client';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A socket that's refused at once, like a load balancer answering 502 for a dead server. */
function refusedSocket(opens: number[]) {
  return (): SocketLike => {
    opens.push(Date.now());
    const socket: SocketLike = {
      binaryType: 'arraybuffer',
      readyState: 3,
      send() {},
      close() {},
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    setTimeout(() => socket.onclose?.({ code: 1006 }), 0);
    return socket;
  };
}

describe('reconnect backoff', () => {
  it('keeps retrying at most 3 s apart, even at the top of the jitter, after many refusals', async () => {
    const opens: number[] = [];
    const client = new SyncClient({
      serverUrl: 'ws://lb.test',
      docId: 'ep',
      token: 'token',
      doc: new Y.Doc(),
      socket: refusedSocket(opens),
      random: () => 0.999, // the longest wait the jitter can pick
    });
    await vi.advanceTimersByTimeAsync(60_000);
    client.destroy();
    const gaps = opens.slice(1).map((t, i) => t - opens[i]!);
    // It backs off (the first retries are quick), then holds at the cap.
    expect(gaps[0]).toBeLessThan(500);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(3_000);
    expect(gaps.slice(-5).every((g) => g > 2_500)).toBe(true);
    expect(opens.length).toBeGreaterThan(20); // a 10 s cap would have managed about 8
  });
});
