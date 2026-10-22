// Entry point. Configuration comes from the environment (see the repo's .env.example).
import { DynamoEditLog, dynamoClient } from './storage/dynamo';
import { memoryStorage } from './storage/memory';
import { S3SnapshotStore, s3Client } from './storage/s3';
import type { Storage } from './storage/types';
import { startSyncServer } from './server';

const env = process.env;
const logger = {
  info: (msg: string, data?: object) =>
    console.log(JSON.stringify({ level: 'info', msg, ...data })),
  error: (msg: string, data?: object) =>
    console.error(JSON.stringify({ level: 'error', msg, ...data })),
};

async function storageFromEnv(): Promise<Storage> {
  // Never fall through to real AWS by accident: without local endpoints the AWS SDK would use
  // whatever credentials this machine has. Real AWS must be asked for explicitly.
  if (env.WR_STORAGE !== 'memory' && env.WR_STORAGE !== 'aws' && !env.DYNAMODB_ENDPOINT) {
    logger.error(
      'no storage configured: copy .env.example to .env (local services), or set WR_STORAGE=memory, or WR_STORAGE=aws for real AWS',
    );
    process.exit(1);
  }
  if (env.WR_STORAGE === 'memory') {
    logger.info('⚠️  in-memory storage: nothing survives a restart (development only)');
    return memoryStorage();
  }
  const region = env.AWS_REGION ?? 'us-east-1';
  const log = new DynamoEditLog(
    dynamoClient(env.DYNAMODB_ENDPOINT, region),
    env.WR_EDIT_LOG_TABLE ?? 'wr-edit-log',
  );
  const snapshots = new S3SnapshotStore(
    s3Client(env.S3_ENDPOINT, region, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY),
    env.S3_SNAPSHOT_BUCKET ?? 'wr-snapshots',
  );
  if (env.DYNAMODB_ENDPOINT) await log.ensureTable(); // local emulators only
  if (env.S3_ENDPOINT) await snapshots.ensureBucket();
  return { log, snapshots };
}

const devAuth = env.WR_DEV_AUTH === '1';
if (devAuth) logger.info('⚠️  WR_DEV_AUTH=1: accepting unsigned development tokens');

const server = await startSyncServer({
  port: Number(env.PORT ?? 4000),
  storage: await storageFromEnv(),
  devAuth,
  logger,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('shutting down gracefully', { signal });
    void server.close().then(() => process.exit(0));
  });
}
