// Compacted snapshots in S3 (SPEC 5.4): one object per episode, overwritten in place.
// S3 PUTs are atomic, so readers see either the old snapshot or the new one, never half of one.
// The object's metadata records the log position it covers ("seq").
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Snapshot, SnapshotStore } from './types';

const objectKey = (docId: string) => `snapshots/${docId}.ybin`;

export class S3SnapshotStore implements SnapshotStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  /** Creates the bucket if it doesn't exist (local development; AWS buckets come from CDK). */
  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async load(docId: string): Promise<Snapshot | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey(docId) }),
      );
      const state = await res.Body!.transformToByteArray();
      return { seq: Number(res.Metadata?.seq ?? '0'), state };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async save(docId: string, snapshot: Snapshot) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(docId),
        Body: snapshot.state,
        Metadata: { seq: String(snapshot.seq) },
        ContentType: 'application/octet-stream',
      }),
    );
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
