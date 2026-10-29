// Writes that lost a race for the same DynamoDB item (D-102). When two writes reach one item at
// once and either is part of a transaction, DynamoDB refuses one of them: TransactionConflict.
// The lease item is in every fenced append and snapshot-pointer move, and renewals update it
// every 2 s, so under load they collide constantly; the first AWS load test saw hundreds a
// minute, starving renewals until leases expired. A refused attempt wrote nothing (transactions
// are all-or-nothing), so it's always safe to try again: a few times, after a short random wait
// that grows with each try, so the two writers don't collide again in lockstep.
//
// Never retried: a failed condition. That's the fence or the lease saying "not yours", a real
// answer, not a race.
import {
  TransactionCanceledException,
  TransactionConflictException,
} from '@aws-sdk/client-dynamodb';

export interface RetryOptions {
  /** Attempts in all, the first included. */
  tries: number;
  /** The wait before try n is a random time in [minMs, maxMs] × (n - 1). */
  minMs: number;
  maxMs: number;
}

/** Four tries within about 0.25 s: well inside a renewal's 2 s slot and the lease's 6 s. */
export const CONFLICT_RETRY: RetryOptions = { tries: 4, minMs: 5, maxMs: 40 };

/** True when the write was refused only because another write to the item was in flight. */
export function isConflict(err: unknown): boolean {
  if (err instanceof TransactionConflictException) return true;
  if (!(err instanceof TransactionCanceledException)) return false;
  const codes = (err.CancellationReasons ?? []).map((r) => r?.Code);
  return codes.includes('TransactionConflict') && !codes.includes('ConditionalCheckFailed');
}

export async function retryConflicts<T>(
  attempt: () => Promise<T>,
  opts: RetryOptions = CONFLICT_RETRY,
  onRetry?: (tryNumber: number, err: unknown) => void,
): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      if (n >= opts.tries || !isConflict(err)) throw err;
      onRetry?.(n, err);
      const wait = (opts.minMs + Math.random() * (opts.maxMs - opts.minMs)) * n;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
