// The durable edit log in DynamoDB (SPEC 5.4). One item per chunk of one update:
//   partition key docId (S), sort key k (S) = zero-padded seq + "." + zero-padded chunk index,
//   plus seq (N), chunk (N), chunks (N) and update (B).
// A DynamoDB item can't exceed 400 KB, but a Yjs update can (a big paste, an import, a long
// offline session), so large updates are split into chunks written in order. The server acks
// only after every chunk is written, so an incomplete group (a crash mid-write) was never
// acknowledged; readers skip it and the client resends through the reconnect handshake.
// Each item is written with attribute_not_exists, so a seq can never be written twice. (Epoch
// fencing for multiple servers is added to this same condition in the scaled-service phase.)
import {
  BatchWriteItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  ResourceNotFoundException,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import type { EditLog, LogEntry, LogTail } from './types';

const CHUNK_BYTES = 350_000;

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

  async append(docId: string, seq: number, update: Uint8Array) {
    const chunks = Math.max(1, Math.ceil(update.byteLength / CHUNK_BYTES));
    for (let chunk = 0; chunk < chunks; chunk++) {
      await this.client.send(
        new PutItemCommand({
          TableName: this.table,
          Item: {
            docId: { S: docId },
            k: { S: key(seq, chunk) },
            seq: { N: String(seq) },
            chunk: { N: String(chunk) },
            chunks: { N: String(chunks) },
            update: { B: update.subarray(chunk * CHUNK_BYTES, (chunk + 1) * CHUNK_BYTES) },
          },
          ConditionExpression: 'attribute_not_exists(k)',
        }),
      );
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
