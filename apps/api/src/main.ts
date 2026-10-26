// `pnpm --filter @wr/api dev`: the API on API_PORT (default 4100). It trusts only the Cognito user
// pool named in the environment; there is no development stub (D-030), so until the pool exists
// (accounts step 8) the API refuses to start.
import { cognitoIssuer, idTokenVerifier, tokenVerifier } from '@wr/auth';
import pg from 'pg';
import { buildApp } from './app';
import { cognitoClient } from './auth/cognito';
import { consoleMailer, sesMailer } from './mailer';

const env = process.env;
const missing = [
  'DATABASE_URL',
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

const db = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
const pool = cognitoIssuer(env.COGNITO_REGION!, env.COGNITO_USER_POOL_ID!, env.COGNITO_CLIENT_ID!);
const app = await buildApp({
  db,
  verify: tokenVerifier([pool]),
  auth: {
    cognito: cognitoClient({
      clientId: env.COGNITO_CLIENT_ID!,
      apiUrl: `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/`,
      oauthUrl: env.COGNITO_DOMAIN!,
    }),
    verifyId: idTokenVerifier(pool),
  },
  mailer: env.WR_SENDER_EMAIL ? sesMailer(env.WR_SENDER_EMAIL, env.COGNITO_REGION!) : consoleMailer, // development without SES: the email (and its link) is printed
  appUrl: env.APP_URL ?? 'http://localhost:5173',
  logger: true,
});
await app.listen({ port: Number(env.API_PORT ?? 4100), host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => db.end());
  });
