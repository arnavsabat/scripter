// Cluster coordination in DynamoDB (SPEC 5.4, D-022).
//
// The coordination table (partition key `pk`) holds two kinds of item per episode:
//   lease#<docId>  { owner, epoch, expiresAt }   who owns the episode, and the fencing token
//   snap#<docId>   { key, seq, epoch }           which S3 snapshot object is current
// The members table (partition key `id`) holds one heartbeat item per live server.
//
// Every ownership rule is a DynamoDB conditional write, so DynamoDB, not any server's opinion
// or clock, is the referee. Clocks only decide when a lease *counts* as expired; even if two
// servers disagree about the time, the epoch check means only the newest owner can write.
import {
  CreateTableCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ResourceNotFoundException,
  ScanCommand,
  UpdateItemCommand,
  ConditionalCheckFailedException,
  type AttributeValue,
  type TransactWriteItem,
} from '@aws-sdk/client-dynamodb';
import type { Acquired, Fence, Lease, LeaseStore, Member, MembershipStore } from './types';

const leaseKey = (docId: string) => ({ pk: { S: `lease#${docId}` } });
export const pointerKey = (docId: string) => ({ pk: { S: `snap#${docId}` } });

/** The transaction item that fences a write: "the lease still names this server and epoch". */
export function leaseCheck(table: string, docId: string, fence: Fence): TransactWriteItem {
  return {
    ConditionCheck: {
      TableName: table,
      Key: leaseKey(docId),
      ConditionExpression: '#owner = :me AND epoch = :epoch',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: {
        ':me': { S: fence.serverId },
        ':epoch': { N: String(fence.epoch) },
      },
    },
  };
}

export async function ensureTable(client: DynamoDBClient, table: string, hashKey: string) {
  try {
    await client.send(new DescribeTableCommand({ TableName: table }));
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
  await client.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: hashKey, AttributeType: 'S' }],
      KeySchema: [{ AttributeName: hashKey, KeyType: 'HASH' }],
    }),
  );
}

export class DynamoLeaseStore implements LeaseStore {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly table: string,
  ) {}

  /**
   * One conditional write: take the lease only if nobody owns it, it was released, or it has
   * expired; and in the same write, increment the epoch. Two servers racing for an expired
   * lease can't both win: DynamoDB applies conditional writes to one item one at a time.
   */
  async acquire(docId: string, serverId: string, ttlMs: number): Promise<Acquired> {
    const now = Date.now();
    try {
      const res = await this.client.send(
        new UpdateItemCommand({
          TableName: this.table,
          Key: leaseKey(docId),
          UpdateExpression:
            'SET #owner = :me, expiresAt = :exp, epoch = if_not_exists(epoch, :zero) + :one',
          ConditionExpression: 'attribute_not_exists(#owner) OR expiresAt < :now',
          ExpressionAttributeNames: { '#owner': 'owner' },
          ExpressionAttributeValues: {
            ':me': { S: serverId },
            ':exp': { N: String(now + ttlMs) },
            ':now': { N: String(now) },
            ':zero': { N: '0' },
            ':one': { N: '1' },
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return { ok: true, epoch: Number(res.Attributes?.epoch?.N) };
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
      const lease = await this.peek(docId);
      return { ok: false, holder: lease?.owner ?? '?', expiresAt: lease?.expiresAt ?? 0 };
    }
  }

  async renew(docId: string, fence: Fence, ttlMs: number) {
    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.table,
          Key: leaseKey(docId),
          UpdateExpression: 'SET expiresAt = :exp',
          ConditionExpression: '#owner = :me AND epoch = :epoch',
          ExpressionAttributeNames: { '#owner': 'owner' },
          ExpressionAttributeValues: {
            ':exp': { N: String(Date.now() + ttlMs) },
            ':me': { S: fence.serverId },
            ':epoch': { N: String(fence.epoch) },
          },
        }),
      );
      return true;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) return false;
      throw err;
    }
  }

  async release(docId: string, fence: Fence) {
    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.table,
          Key: leaseKey(docId),
          UpdateExpression: 'REMOVE #owner SET expiresAt = :zero',
          ConditionExpression: '#owner = :me AND epoch = :epoch',
          ExpressionAttributeNames: { '#owner': 'owner' },
          ExpressionAttributeValues: {
            ':zero': { N: '0' },
            ':me': { S: fence.serverId },
            ':epoch': { N: String(fence.epoch) },
          },
        }),
      );
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err; // already not ours: fine
    }
  }

  async peek(docId: string): Promise<Lease | null> {
    const res = await this.client.send(
      new GetItemCommand({ TableName: this.table, Key: leaseKey(docId), ConsistentRead: true }),
    );
    if (!res.Item) return null;
    return {
      owner: res.Item.owner?.S ?? null,
      epoch: Number(res.Item.epoch?.N ?? 0),
      expiresAt: Number(res.Item.expiresAt?.N ?? 0),
    };
  }
}

export class DynamoMembershipStore implements MembershipStore {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly table: string,
  ) {}

  async heartbeat(member: Omit<Member, 'heartbeatAt'>) {
    await this.client.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          id: { S: member.id },
          url: { S: member.url },
          heartbeatAt: { N: String(Date.now()) },
        },
      }),
    );
  }

  async remove(id: string) {
    await this.client.send(
      new DeleteItemCommand({ TableName: this.table, Key: { id: { S: id } } }),
    );
  }

  async list(): Promise<Member[]> {
    const out: Member[] = [];
    let start: Record<string, AttributeValue> | undefined;
    do {
      const page = await this.client.send(
        new ScanCommand({ TableName: this.table, ConsistentRead: true, ExclusiveStartKey: start }),
      );
      for (const item of page.Items ?? [])
        out.push({ id: item.id!.S!, url: item.url!.S!, heartbeatAt: Number(item.heartbeatAt!.N) });
      start = page.LastEvaluatedKey;
    } while (start);
    return out;
  }
}
