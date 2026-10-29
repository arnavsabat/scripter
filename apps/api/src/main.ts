// `pnpm --filter @wr/api dev`: the API on API_PORT (default 4100). It trusts only the Cognito user
// pool named in the environment; there is no development stub (D-030), so until the pool exists
// (accounts step 8) the API refuses to start. On AWS (D-091) Postgres comes from the PG* variables
// (with PGSSLMODE=verify-full and the RDS certificates in NODE_EXTRA_CA_CERTS), and
// WR_MIGRATE_ON_START=1 applies pending migrations before it listens.
import { migrate } from './db/migrate';
import { cognitoIssuer, idTokenVerifier, tokenVerifier } from '@wr/auth';
import pg from 'pg';
import { buildApp } from './app';
import { memoryBlobs, s3Blobs } from './blobs';
import { cognitoClient } from './auth/cognito';
import { consoleMailer, sesMailer } from './mailer';

const env = process.env;
const missing = [
  ...(env.DATABASE_URL || env.PGHOST ? [] : ['DATABASE_URL']),
  'COGNITO_REGION',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
  'COGNITO_DOMAIN',
].filter((k) => !env[k]);
if (missing.length) {
  console.error(
    `The API needs ${missing.join(', ')} (see .env.example). Cognito arrives in step 8.`,
  );
  process.exit(1);
}

function blobsFromEnv() {
  if (!env.S3_SNAPSHOT_BUCKET || (!env.S3_ENDPOINT && env.WR_STORAGE !== 'aws')) {
    console.warn('[blobs] no S3 configured: snapshots are kept in memory (development only)');
    return memoryBlobs();
  }
  return s3Blobs({
    bucket: env.S3_SNAPSHOT_BUCKET,
    region: env.AWS_REGION ?? 'us-east-1',
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    ...(env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID } : {}),
    ...(env.S3_SECRET_ACCESS_KEY ? { secretAccessKey: env.S3_SECRET_ACCESS_KEY } : {}),
  });
}

const db = new pg.Pool({
  ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : {}),
  max: 10,
});
// An idle connection dropped by Postgres (a restart, a failover) is discarded and replaced on the
// next query; without a listener, Node would treat the error as fatal and stop the API (D-066).
db.on('error', (err) => console.error(`[db] idle connection lost: ${err.message}`));
// The web client, and the server-only guest client when there is one (D-108).
const pool = cognitoIssuer(
  env.COGNITO_REGION!,
  env.COGNITO_USER_POOL_ID!,
  env.COGNITO_CLIENT_ID!,
  ...(env.COGNITO_GUEST_CLIENT_ID ? [env.COGNITO_GUEST_CLIENT_ID] : []),
);
const app = await buildApp({
  // Behind CloudFront and the load balancer (D-091): the visitor's address is two hops back in
  // X-Forwarded-For, which per-address limits need (D-108). Unset locally.
  ...(env.WR_TRUST_PROXY_HOPS ? { trustProxy: Number(env.WR_TRUST_PROXY_HOPS) } : {}),
  db,
  verify: tokenVerifier([pool]),
  auth: {
    cognito: cognitoClient({
      clientId: env.COGNITO_CLIENT_ID!,
      ...(env.COGNITO_GUEST_CLIENT_ID ? { guestClientId: env.COGNITO_GUEST_CLIENT_ID } : {}),
      apiUrl: `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/`,
      oauthUrl: env.COGNITO_DOMAIN!,
      region: env.COGNITO_REGION!,
      userPoolId: env.COGNITO_USER_POOL_ID!,
    }),
    verifyId: idTokenVerifier(pool),
  },
  mailer: env.WR_SENDER_EMAIL ? sesMailer(env.WR_SENDER_EMAIL, env.COGNITO_REGION!) : consoleMailer, // development without SES: the email (and its link) is printed
  // Snapshot bytes (D-080): the same bucket as the sync service's, under restore-points/. Locally
  // that's SeaweedFS (S3_ENDPOINT); never real AWS by accident (WR_STORAGE=aws for that).
  blobs: blobsFromEnv(),
  appUrl: env.APP_URL ?? 'http://localhost:5173',
  logger: true,
});
if (env.WR_MIGRATE_ON_START === '1') {
  const client = await db.connect();
  try {
    const applied = await migrate(client);
    app.log.info({ applied }, applied.length ? 'migrations applied' : 'migrations up to date');
  } finally {
    client.release();
  }
}
await app.listen({ port: Number(env.API_PORT ?? 4100), host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => db.end());
  });
