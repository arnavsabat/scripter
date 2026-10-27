// A whole API on a throwaway database, signed in with the test-only key (D-030). Requests go
// through Fastify's inject(), so no port is opened.
import { idTokenVerifier, tokenVerifier } from '@wr/auth';
import { createTestIssuer } from '@wr/auth/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app';
import { cognitoClient } from '../src/auth/cognito';
import { migrate } from '../src/db/migrate';
import { memoryMailer } from '../src/mailer';
import { fakeCognito } from './fakeCognito';
import { createTestDb } from './testDb';

export interface Person {
  id: string;
  name: string;
  email: string;
  token: string;
  call<T = Record<string, unknown>>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    body?: object,
  ): Promise<{ status: number; body: T }>;
}

export async function apiHarness() {
  const tdb = await createTestDb();
  const admin = await tdb.client();
  await migrate(admin);
  const db = new pg.Pool({ connectionString: tdb.url, max: 5 });
  const issuer = await createTestIssuer();
  const mailer = memoryMailer();
  const cognito = await fakeCognito(issuer);
  const app = await buildApp({
    db,
    verify: tokenVerifier([issuer.trusted]),
    auth: {
      cognito: cognitoClient({
        clientId: issuer.trusted.clientId,
        apiUrl: cognito.url,
        oauthUrl: cognito.url,
        region: 'us-east-2',
        userPoolId: 'us-east-2_test',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      }),
      verifyId: idTokenVerifier(issuer.trusted),
    },
    mailer,
    appUrl: 'https://app.test',
  });

  const request = async (
    token: string | null,
    method: string,
    url: string,
    body?: object,
  ): Promise<{ status: number; body: never }> => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body ? { payload: body } : {}),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : null) as never };
  };

  /** A signed-in person: a user, a linked Cognito identity (D-041), and a valid access token. */
  async function person(
    name: string,
    email = `${name.toLowerCase()}@example.com`,
  ): Promise<Person> {
    const { rows } = await admin.query<{ id: string }>(
      `insert into users (email, name) values ($1, $2) returning id`,
      [email, name],
    );
    const sub = randomUUID();
    await admin.query(
      `insert into user_identities (cognito_sub, user_id, provider) values ($1, $2, 'test')`,
      [sub, rows[0]!.id],
    );
    const token = await issuer.sign(sub);
    return {
      id: rows[0]!.id,
      name,
      email,
      token,
      call: (method, url, body) => request(token, method, url, body),
    };
  }

  /** The token in the newest invitation email to `to`. */
  function lastInviteToken(to: string): string {
    const mail = [...mailer.sent].reverse().find((m) => m.to === to);
    const token = mail?.text.match(/\/i\/([A-Za-z0-9_-]+)/)?.[1];
    if (!token) throw new Error(`no invitation email to ${to}`);
    return token;
  }

  return {
    app,
    admin,
    db,
    issuer,
    mailer,
    cognito,
    person,
    lastInviteToken,
    anonymous: (method: string, url: string) => request(null, method, url),
    withToken: (token: string, method: string, url: string) => request(token, method, url),
    async close() {
      await app.close();
      await cognito.close();
      await db.end();
      await tdb.drop();
    },
  };
}
