// Snapshots (SPEC 5.4, D-022): immutable objects in S3, plus a pointer item in DynamoDB naming
// the current one.
//
// Why not just overwrite one object? Because a paused, outdated server could wake up and
// overwrite a newer snapshot with an older one after the new owner had already truncated the
// log below the newer one: those edits would be gone. Here, saving is:
//   1. PUT a new object, snapshots/<docId>/<epoch>-<seq>.ybin (never overwritten);
//   2. move the pointer to it in one DynamoDB transaction that also checks the lease, and only
//      if the new seq is higher than the pointer's (it never moves backwards);
//   3. only then may the log below seq be truncated (the room does that after save resolves).
// An outdated owner fails step 2, so it can never move the pointer or truncate.
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import { leaseCheck, pointerKey } from './coordination';
import { FencedError, type Fence, type Snapshot, type SnapshotStore } from './types';

const objectKey = (docId: string, epoch: number, seq: number) =>
  `snapshots/${docId}/${String(epoch).padStart(10, '0')}-${String(seq).padStart(15, '0')}.ybin`;

export class S3SnapshotStore implements SnapshotStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly dynamo: DynamoDBClient,
    private readonly coordinationTable: string,
  ) {}

  /** Creates the bucket if it doesn't exist (local development; AWS buckets come from CDK). */
  async ensureBucket() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  private async pointer(docId: string) {
    const res = await this.dynamo.send(
      new GetItemCommand({
        TableName: this.coordinationTable,
        Key: pointerKey(docId),
        ConsistentRead: true,
      }),
    );
    return res.Item ? { key: res.Item.key!.S!, seq: Number(res.Item.seq!.N) } : null;
  }

  private async getObject(key: string) {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return { bytes: await res.Body!.transformToByteArray(), metadata: res.Metadata ?? {} };
  }

  async load(docId: string): Promise<Snapshot | null> {
    const pointer = await this.pointer(docId);
    if (pointer) return { seq: pointer.seq, state: (await this.getObject(pointer.key)).bytes };
    // Snapshots saved before D-022 were a single object with the seq in its metadata.
    try {
      const legacy = await this.getObject(`snapshots/${docId}.ybin`);
      return { seq: Number(legacy.metadata.seq ?? '0'), state: legacy.bytes };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async save(docId: string, snapshot: Snapshot, fence: Fence) {
    const previous = await this.pointer(docId);
    if (previous && previous.seq >= snapshot.seq) return; // nothing newer to record
    const key = objectKey(docId, fence.epoch, snapshot.seq);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: snapshot.state,
        ContentType: 'application/octet-stream',
      }),
    );
    try {
      await this.dynamo.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            leaseCheck(this.coordinationTable, docId, fence),
            {
              Put: {
                TableName: this.coordinationTable,
                Item: {
                  ...pointerKey(docId),
                  key: { S: key },
                  seq: { N: String(snapshot.seq) },
                  epoch: { N: String(fence.epoch) },
                },
                ConditionExpression: 'attribute_not_exists(pk) OR seq < :seq',
                ExpressionAttributeValues: { ':seq': { N: String(snapshot.seq) } },
              },
            },
          ],
        }),
      );
    } catch (err) {
      // The new object is now an orphan: nothing points at it. Remove it (best effort).
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
        .catch(() => {});
      if (err instanceof TransactionCanceledException) {
        if (err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed')
          throw new FencedError(docId, fence);
        return; // the pointer already moved past this seq: a newer snapshot exists
      }
      throw err;
    }
    // The old object is no longer referenced (best effort; a leftover costs only storage).
    if (previous)
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: previous.key }))
        .catch(() => {});
  }
}

export function s3Client(
  endpoint: string | undefined,
  region: string,
  accessKeyId?: string,
  secretAccessKey?: string,
) {
  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
}
