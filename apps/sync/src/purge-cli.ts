// `node purge.js` (the daily scheduled task, D-090), or `pnpm --filter @wr/sync purge` locally.
// The same storage settings as the sync server; Postgres from DATABASE_URL or the PG* variables.
// With COGNITO_USER_POOL_ID it also removes expired guests' Cognito users (D-108). `--dry-run`
// only counts.
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { purge } from './purge';
import { awsConfigFromEnv, awsStorage } from './storage/aws';
import { s3Client } from './storage/s3';

const env = process.env;
if (env.WR_STORAGE !== 'aws' && !env.DYNAMODB_ENDPOINT) {
  console.error('purge: set WR_STORAGE=aws for real AWS, or the local endpoints (.env.example)');
  process.exit(1);
}
const cfg = awsConfigFromEnv(env);
const s3 = s3Client(cfg.s3Endpoint, cfg.region, cfg.s3AccessKeyId, cfg.s3SecretAccessKey);
const pool = env.COGNITO_USER_POOL_ID;
const cognito =
  pool && new CognitoIdentityProviderClient({ region: env.COGNITO_REGION ?? cfg.region });
const db = new pg.Pool({
  ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : {}),
  max: 2,
});
try {
  const result = await purge({
    db,
    storage: await awsStorage(cfg),
    deleteBlob: async (Key) => {
      await s3.send(new DeleteObjectCommand({ Bucket: cfg.snapshotBucket, Key }));
    },
    ...(cognito
      ? {
          deleteCognitoUser: async (Username: string) => {
            try {
              await cognito.send(new AdminDeleteUserCommand({ UserPoolId: pool, Username }));
            } catch (err) {
              // Already gone (a run cut short after this step): nothing left to do.
              if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
            }
          },
        }
      : {}),
    dryRun: process.argv.includes('--dry-run'),
  });
  console.log(JSON.stringify({ level: 'info', msg: 'purge finished', ...result }));
} catch (err) {
  console.error(JSON.stringify({ level: 'error', msg: 'purge failed', err: String(err) }));
  process.exitCode = 1;
} finally {
  await db.end();
}
