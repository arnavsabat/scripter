// The durable edit log in DynamoDB (SPEC 5.4). One item per chunk of one update:
//   partition key docId (S), sort key k (S) = zero-padded seq + "." + zero-padded chunk index,
//   plus seq (N), chunk (N), chunks (N) and update (B).
// A DynamoDB item can't exceed 400 KB, but a Yjs update can (a big paste, an import, a long
// offline session), so large updates are split into chunks written in order. The server acks
// only after every chunk is written, so an incomplete group (a crash mid-write) was never
// acknowledged; readers skip it and the client resends through the reconnect handshake.
// Fencing (D-022): every append is a DynamoDB transaction that also checks the lease item still
// names this server and epoch. If another server has taken the lease (a higher epoch), the
// whole write is refused, so an outdated owner can never add to the log. Each log item is also
// written with attribute_not_exists, so a seq can never be written twice.
import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  QueryCommand,
  ResourceNotFoundException,
  TransactWriteItemsCommand,
  TransactionCanceledException,
  type AttributeValue,
  type TransactWriteItem,
} from '@aws-sdk/client-dynamodb';
import { leaseCheck } from './coordination';
import { FencedError, type EditLog, type Fence, type LogEntry, type LogTail } from './types';

const CHUNK_BYTES = 350_000;
/** A transaction is limited to 4 MB and 100 items: 10 chunks of 350 KB plus the lease check fit. */
const CHUNKS_PER_TRANSACTION = 10;

function concat(parts: Uint8Array[]) {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
const key = (seq: number, chunk = 0) =>
  `${String(seq).padStart(15, '0')}.${String(chunk).padStart(5, '0')}`;

export class DynamoEditLog implements EditLog {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly table: string,
    /** The coordination table holding the lease items that fence every append. */
    private readonly coordinationTable: string,
  ) {}

  /** Creates the table if it doesn't exist (local development; AWS tables come from CDK). */
  async ensureTable() {
    try {
      await this.client.send(new DescribeTableCommand({ TableName: this.table }));
      return;
    } catch (err) {
      if (!(err instanceof ResourceNotFoundException)) throw err;
    }
    await this.client.send(
      new CreateTableCommand({
        TableName: this.table,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'docId', AttributeType: 'S' },
          { AttributeName: 'k', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'docId', KeyType: 'HASH' },
          { AttributeName: 'k', KeyType: 'RANGE' },
        ],
      }),
    );
  }

  async append(docId: string, seq: number, update: Uint8Array, fence: Fence) {
    const chunks = Math.max(1, Math.ceil(update.byteLength / CHUNK_BYTES));
    const item = (chunk: number): TransactWriteItem => ({
      Put: {
        TableName: this.table,
        Item: {
          docId: { S: docId },
          k: { S: key(seq, chunk) },
          seq: { N: String(seq) },
          chunk: { N: String(chunk) },
          chunks: { N: String(chunks) },
          epoch: { N: String(fence.epoch) },
          update: { B: update.subarray(chunk * CHUNK_BYTES, (chunk + 1) * CHUNK_BYTES) },
        },
        ConditionExpression: 'attribute_not_exists(k)',
      },
    });
    // Almost every update is one chunk, so one transaction: [lease still mine?] + [log item].
    // A huge update spans several transactions, each fenced; a crash between them leaves an
    // incomplete group, which was never acknowledged and which readers skip.
    for (let first = 0; first < chunks; first += CHUNKS_PER_TRANSACTION) {
      const items = [leaseCheck(this.coordinationTable, docId, fence)];
      for (let c = first; c < Math.min(chunks, first + CHUNKS_PER_TRANSACTION); c++)
        items.push(item(c));
      try {
        await this.client.send(new TransactWriteItemsCommand({ TransactItems: items }));
      } catch (err) {
        if (
          err instanceof TransactionCanceledException &&
          err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed'
        )
          throw new FencedError(docId, fence);
        throw err;
      }
    }
  }

  private async *query(docId: string, condition: string, bound: string, projection?: string) {
    let start: Record<string, AttributeValue> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: `docId = :d AND ${condition}`,
          ExpressionAttributeValues: { ':d': { S: docId }, ':b': { S: bound } },
          ConsistentRead: true,
          ExclusiveStartKey: start,
          ...(projection ? { ProjectionExpression: projection } : {}),
        }),
      );
      yield* page.Items ?? [];
      start = page.LastEvaluatedKey;
    } while (start);
  }

  async readFrom(docId: string, fromSeq: number): Promise<LogTail> {
    const entries: LogEntry[] = [];
    let nextSeq = fromSeq;
    let seq = -1;
    let chunks = 0;
    let parts: Uint8Array[] = [];
    const flush = () => {
      if (seq >= 0 && parts.length === chunks) entries.push({ seq, update: concat(parts) });
    };
    for await (const item of this.query(docId, 'k >= :b', key(fromSeq))) {
      const itemSeq = Number(item.seq?.N);
      if (itemSeq !== seq) {
        flush();
        seq = itemSeq;
        chunks = Number(item.chunks?.N);
        parts = [];
        nextSeq = itemSeq + 1;
      }
      if (Number(item.chunk?.N) === parts.length && item.update?.B) parts.push(item.update.B);
    }
    flush();
    return { entries, nextSeq };
  }

  async truncateBelow(docId: string, belowSeq: number) {
    let batch: Record<string, AttributeValue>[] = [];
    const send = async () => {
      let requests = batch.map((Key) => ({ DeleteRequest: { Key } }));
      while (requests.length) {
        const res = await this.client.send(
          new BatchWriteItemCommand({ RequestItems: { [this.table]: requests } }),
        );
        requests = (res.UnprocessedItems?.[this.table] ?? []).map((r) => ({
          DeleteRequest: { Key: r.DeleteRequest!.Key! },
        }));
      }
      batch = [];
    };
    for await (const item of this.query(docId, 'k < :b', key(belowSeq), 'docId, k')) {
      batch.push({ docId: item.docId!, k: item.k! });
      if (batch.length === 25) await send();
    }
    if (batch.length) await send();
  }
}

export function dynamoClient(endpoint: string | undefined, region: string) {
  return new DynamoDBClient({
    region,
    ...(endpoint
      ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {}),
  });
}
