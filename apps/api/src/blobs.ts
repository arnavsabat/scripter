// Where snapshot bytes live (SPEC 5.2: the snapshots table holds the S3 key): S3 on AWS and
// SeaweedFS locally; in memory for tests. A snapshot is a draft's Yjs state, so a what-if seeded
// from one is the same document however many clients seed it at once (D-080).
import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export function memoryBlobs(): BlobStore & { size(): number } {
  const blobs = new Map<string, Uint8Array>();
  return {
    put: (key, bytes) => (blobs.set(key, bytes), Promise.resolve()),
    get: (key) => Promise.resolve(blobs.get(key) ?? null),
    size: () => blobs.size,
  };
}

export interface S3BlobConfig {
  bucket: string;
  region: string;
  /** Local SeaweedFS; unset on AWS. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function s3Blobs(cfg: S3BlobConfig): BlobStore {
  const s3 = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
    ...(cfg.accessKeyId && cfg.secretAccessKey
      ? { credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } }
      : {}),
  });
  return {
    async put(key, bytes) {
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'application/octet-stream',
        }),
      );
    },
    async get(key) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return r.Body ? await r.Body.transformToByteArray() : null;
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
  };
}
