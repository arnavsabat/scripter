// TEST ONLY: a sync server process for the chaos suite (chaos.test.ts). Like main.ts, but it
// trusts the chaos run's test key, whose public half arrives in WR_TEST_PUBLIC_JWK, and lets
// everyone edit (in-memory access). main.ts never reads that variable, so production can't
// be made to trust a test key (D-030, D-046).
import { tokenVerifier } from '@wr/auth';
import { trustedTestKey } from '@wr/auth/testing';
import { memoryAccess } from '../src/access';
import { startSyncServer } from '../src/server';
import { awsConfigFromEnv, awsStorage } from '../src/storage/aws';

const env = process.env;
const logger = {
  info: (msg: string, data?: object) =>
    console.log(JSON.stringify({ level: 'info', msg, ...data })),
  error: (msg: string, data?: object) =>
    console.error(JSON.stringify({ level: 'error', msg, ...data })),
};
const server = await startSyncServer({
  port: Number(env.PORT),
  storage: await awsStorage(awsConfigFromEnv(env)),
  verify: tokenVerifier([
    trustedTestKey(JSON.parse(env.WR_TEST_PUBLIC_JWK!) as Parameters<typeof trustedTestKey>[0]),
  ]),
  access: memoryAccess(),
  clusterSecret: env.WR_CLUSTER_SECRET!,
  serverId: env.WR_SERVER_ID!,
  internalUrl: env.WR_INTERNAL_URL!,
  logger,
});
process.once('SIGTERM', () => {
  logger.info('shutting down gracefully', { signal: 'SIGTERM' });
  void server.close().then(() => process.stdout.write('', () => process.exit(0)));
});
