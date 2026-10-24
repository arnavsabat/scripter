// Entry point. Configuration comes from the environment (see the repo's .env.example).
import { awsConfigFromEnv, awsStorage } from './storage/aws';
import { memoryStorage } from './storage/memory';
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
  return awsStorage(awsConfigFromEnv(env));
}

const devAuth = env.WR_DEV_AUTH === '1';
if (devAuth) logger.info('⚠️  WR_DEV_AUTH=1: accepting unsigned development tokens');

const server = await startSyncServer({
  port: Number(env.PORT ?? 4000),
  storage: await storageFromEnv(),
  devAuth,
  ...(env.WR_SERVER_ID ? { serverId: env.WR_SERVER_ID } : {}),
  ...(env.WR_INTERNAL_URL ? { internalUrl: env.WR_INTERNAL_URL } : {}),
  ...(env.WR_CLUSTER_SECRET ? { clusterSecret: env.WR_CLUSTER_SECRET } : {}),
  logger,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('shutting down gracefully', { signal });
    void server.close().then(() => process.stdout.write('', () => process.exit(0))); // flush logs first
  });
}
