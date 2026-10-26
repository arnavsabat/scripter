// Entry point. Configuration comes from the environment (see the repo's .env.example).
// Sign-in is Cognito only (D-030, D-046): until the user pool exists (accounts step 8) the
// server refuses to start. Tests build servers directly, with a test key.
import { cognitoIssuer, tokenVerifier } from '@wr/auth';
import { pgAccess } from './pgAccess';
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

const missing = [
  'DATABASE_URL',
  'WR_CLUSTER_SECRET',
  'COGNITO_REGION',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
].filter((k) => !env[k]);
if (missing.length) {
  logger.error(`the sync server needs ${missing.join(', ')} (see .env.example)`);
  process.exit(1);
}

const access = pgAccess(env.DATABASE_URL!, logger);
const server = await startSyncServer({
  port: Number(env.PORT ?? 4000),
  storage: await storageFromEnv(),
  verify: tokenVerifier([
    cognitoIssuer(env.COGNITO_REGION!, env.COGNITO_USER_POOL_ID!, env.COGNITO_CLIENT_ID!),
  ]),
  access,
  clusterSecret: env.WR_CLUSTER_SECRET!,
  ...(env.WR_SERVER_ID ? { serverId: env.WR_SERVER_ID } : {}),
  ...(env.WR_INTERNAL_URL ? { internalUrl: env.WR_INTERNAL_URL } : {}),
  logger,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('shutting down gracefully', { signal });
    void server
      .close()
      .then(() => access.close())
      .then(() => process.stdout.write('', () => process.exit(0))); // flush logs first
  });
}
