// Writes racing for the lease item (D-102): conflicts are retried, refusals never are, and a
// snapshot whose pointer didn't move is never reported as saved. No services: the AWS clients
// are fakes that answer each command by its type.
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
  TransactionConflictException,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { DynamoLeaseStore } from '../src/storage/coordination';
import { DynamoEditLog } from '../src/storage/dynamo';
import { isConflict, retryConflicts } from '../src/storage/retry';
import { S3SnapshotStore } from '../src/storage/s3';
import { FencedError } from '../src/storage/types';

const meta = { $metadata: {} };
const conflict = () => new TransactionConflictException({ message: 'in flight', ...meta });
const cancelled = (...codes: string[]) =>
  new TransactionCanceledException({
    message: 'cancelled',
    ...meta,
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
const refused = () => new ConditionalCheckFailedException({ message: 'not yours', ...meta });
const fast = { tries: 4, minMs: 0, maxMs: 1 };
const fence = { serverId: 'sync-a', epoch: 3 };

/** A fake AWS client: each command type gets the next outcome from its own queue. */
function fakeClient(outcomes: Record<string, (Error | object)[]>) {
  const calls: string[] = [];
  const client = {
    send(command: object) {
      const name = command.constructor.name;
      calls.push(name);
      const next = outcomes[name]?.shift() ?? {};
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
  return { client, calls };
}

describe('telling a race from a refusal', () => {
  it('a conflict is a race; a failed condition (the fence) is a refusal, even with a conflict beside it', () => {
    expect(isConflict(conflict())).toBe(true);
    expect(isConflict(cancelled('None', 'TransactionConflict'))).toBe(true);
    expect(isConflict(cancelled('ConditionalCheckFailed', 'TransactionConflict'))).toBe(false);
    expect(isConflict(cancelled('ConditionalCheckFailed', 'None'))).toBe(false);
    expect(isConflict(refused())).toBe(false);
    expect(isConflict(new Error('ThrottlingException'))).toBe(false);
  });

  it('retries a race until it succeeds, and gives up after the last try', async () => {
    let n = 0;
    await expect(
      retryConflicts(() => (++n < 3 ? Promise.reject(conflict()) : Promise.resolve('ok')), fast),
    ).resolves.toBe('ok');
    expect(n).toBe(3);
    n = 0;
    await expect(retryConflicts(() => (++n, Promise.reject(conflict())), fast)).rejects.toThrow(
      TransactionConflictException,
    );
    expect(n).toBe(4);
  });

  it('never retries a refusal', async () => {
    let n = 0;
    await expect(retryConflicts(() => (++n, Promise.reject(refused())), fast)).rejects.toThrow(
      ConditionalCheckFailedException,
    );
    expect(n).toBe(1);
  });
});

describe('the lease item under load', () => {
  it('a renewal that collides with an append is retried instead of failing (the 590 failures)', async () => {
    const { client, calls } = fakeClient({ UpdateItemCommand: [conflict(), conflict()] });
    const leases = new DynamoLeaseStore(client as unknown as DynamoDBClient, 'coord');
    await expect(leases.renew('doc', fence, 6000)).resolves.toBe(true);
    expect(calls).toEqual(['UpdateItemCommand', 'UpdateItemCommand', 'UpdateItemCommand']);
  });

  it('a renewal of a lease that moved on is still an immediate "lost"', async () => {
    const { client, calls } = fakeClient({ UpdateItemCommand: [refused()] });
    const leases = new DynamoLeaseStore(client as unknown as DynamoDBClient, 'coord');
    await expect(leases.renew('doc', fence, 6000)).resolves.toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("an append that collides with a renewal is retried, not the writer's connection closed", async () => {
    const { client, calls } = fakeClient({
      TransactWriteItemsCommand: [cancelled('TransactionConflict', 'None')],
    });
    const log = new DynamoEditLog(client as unknown as DynamoDBClient, 'log', 'coord');
    await log.append('doc', 7, new Uint8Array([1, 2, 3]), fence);
    expect(calls).toEqual(['TransactWriteItemsCommand', 'TransactWriteItemsCommand']);
  });

  it('a fenced append is still a FencedError at once', async () => {
    const { client, calls } = fakeClient({
      TransactWriteItemsCommand: [cancelled('ConditionalCheckFailed', 'None')],
    });
    const log = new DynamoEditLog(client as unknown as DynamoDBClient, 'log', 'coord');
    await expect(log.append('doc', 7, new Uint8Array([1]), fence)).rejects.toThrow(FencedError);
    expect(calls).toHaveLength(1);
  });
});

describe("a snapshot is reported saved only when its pointer moved (the truncation that wasn't safe)", () => {
  const store = (pointerOutcomes: (Error | object)[]) => {
    const s3 = fakeClient({});
    const dynamo = fakeClient({ TransactWriteItemsCommand: pointerOutcomes });
    return {
      snapshots: new S3SnapshotStore(
        s3.client as unknown as S3Client,
        'bucket',
        dynamo.client as unknown as DynamoDBClient,
        'coord',
      ),
      s3Calls: s3.calls,
    };
  };
  const snap = { seq: 40, state: new Uint8Array([0, 0]) };

  it('a pointer move that keeps conflicting fails the save, so the room keeps its log', async () => {
    const { snapshots, s3Calls } = store(
      Array.from({ length: 4 }, () => cancelled('None', 'TransactionConflict')),
    );
    await expect(snapshots.save('doc', snap, fence)).rejects.toThrow(TransactionCanceledException);
    expect(s3Calls).toContain('DeleteObjectCommand'); // the orphaned object is cleaned up
  });

  it('a conflict that clears on retry saves normally', async () => {
    const { snapshots } = store([cancelled('None', 'TransactionConflict')]);
    await expect(snapshots.save('doc', snap, fence)).resolves.toBeUndefined();
  });

  it('a newer pointer already in place is success; a moved lease is FencedError', async () => {
    await expect(
      store([cancelled('None', 'ConditionalCheckFailed')]).snapshots.save('doc', snap, fence),
    ).resolves.toBeUndefined();
    await expect(
      store([cancelled('ConditionalCheckFailed', 'None')]).snapshots.save('doc', snap, fence),
    ).rejects.toThrow(FencedError);
  });

  it('anything else (throttling) fails the save too', async () => {
    const { snapshots } = store([new Error('ThrottlingException')]);
    await expect(snapshots.save('doc', snap, fence)).rejects.toThrow('ThrottlingException');
  });
});
