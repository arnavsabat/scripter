// LOAD TEST ONLY (D-092): a sync server for the load-test cluster. Like apps/sync/src/main.ts,
// but it trusts the load-test run's key, whose public half arrives in WR_LOADTEST_PUBLIC_JWK, and
// lets everyone edit (in-memory access: the real Postgres check runs once per connection, never
// per keystroke, so it doesn't change what's measured). The production image never contains this
// file, and main.ts never reads that variable, so production can't be made to trust the key
// (D-030, D-046). Storage is the real thing: DynamoDB and S3 (or the local emulators).
import { tokenVerifier } from '@wr/auth';
import { trustedTestKey } from '@wr/auth/testing';
import { startSyncServer } from '@wr/sync';
import { memoryAccess } from '@wr/sync/access';
import { awsConfigFromEnv, awsStorage } from '@wr/sync/aws';

const env = process.env;
const logger = {
  info: (msg: string, data?: object) =>
    console.log(JSON.stringify({ level: 'info', msg, ...data })),
  error: (msg: string, data?: object) =>
    console.error(JSON.stringify({ level: 'error', msg, ...data })),
};

/** As main.ts: on ECS, the task's own private address (WR_INTERNAL_URL=auto). */
async function internalUrl() {
  if (env.WR_INTERNAL_URL !== 'auto') return env.WR_INTERNAL_URL;
  const task = (await (await fetch(`${env.ECS_CONTAINER_METADATA_URI_V4}/task`)).json()) as {
    Containers?: { Networks?: { IPv4Addresses?: string[] }[] }[];
  };
  const ip = task.Containers?.flatMap((c) => c.Networks ?? []).flatMap(
    (n) => n.IPv4Addresses ?? [],
  )[0];
  return `ws://${ip}:${env.PORT ?? 4000}`;
}

const internal = await internalUrl();
const server = await startSyncServer({
  port: Number(env.PORT ?? 4000),
  storage: await awsStorage(awsConfigFromEnv(env)),
  verify: tokenVerifier([
    trustedTestKey(JSON.parse(env.WR_LOADTEST_PUBLIC_JWK!) as Parameters<typeof trustedTestKey>[0]),
  ]),
  access: memoryAccess(),
  clusterSecret: env.WR_CLUSTER_SECRET!,
  ...(env.WR_SERVER_ID ? { serverId: env.WR_SERVER_ID } : {}),
  ...(internal ? { internalUrl: internal } : {}),
  logger,
});
// The load-test cluster's crash switch (D-093): POST /__crash on its own port, with the cluster
// secret, ends the process at once (no handoff, no lease release): a crash, as the failover
// scenario needs, where ECS's own stop would be graceful. Off unless WR_LOADTEST_CRASH_PORT is set.
if (env.WR_LOADTEST_CRASH_PORT) {
  const { createServer } = await import('node:http');
  createServer((req, res) => {
    if (
      req.method === 'POST' &&
      req.url === '/__crash' &&
      req.headers['x-loadtest-secret'] === env.WR_CLUSTER_SECRET
    ) {
      logger.error('crashing on request (load test)');
      res.end('bye');
      process.exit(137);
    }
    res.statusCode = 404;
    res.end();
  }).listen(Number(env.WR_LOADTEST_CRASH_PORT));
}

process.once('SIGTERM', () => {
  logger.info('shutting down gracefully', { signal: 'SIGTERM' });
  void server.close().then(() => process.stdout.write('', () => process.exit(0)));
});
