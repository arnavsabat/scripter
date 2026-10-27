// The S3 blob store against the local SeaweedFS (the same API as S3 on AWS, D-080).
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { s3Blobs } from '../src/blobs';
import { servicesEnabled } from './testDb';

const env = process.env;
const cfg = {
  bucket: 'wr-restore-points-test',
  region: env.AWS_REGION ?? 'us-east-1',
  endpoint: env.S3_ENDPOINT ?? 'http://localhost:8333',
  accessKeyId: env.S3_ACCESS_KEY_ID ?? 'wr_local',
  secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? 'wr_local_secret',
};

describe.skipIf(!servicesEnabled)('S3 blobs', () => {
  it('stores and returns bytes; a missing key is null', async () => {
    const s3 = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    await s3.send(new CreateBucketCommand({ Bucket: cfg.bucket })).catch(() => {});
    const blobs = s3Blobs(cfg);
    const key = `restore-points/${randomUUID()}`;
    const bytes = new Uint8Array([1, 2, 3, 250, 0, 7]);
    await blobs.put(key, bytes);
    expect(await blobs.get(key)).toEqual(bytes);
    expect(await blobs.get(`restore-points/${randomUUID()}`)).toBeNull();
  });
});
