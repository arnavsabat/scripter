// A stand-in for Cognito in tests (D-030: there's no official emulator). It speaks the same JSON
// operations and error names our client uses, issues tokens signed by the test key, and keeps the
// codes it would have emailed so tests can type them. Each way of signing in is its own Cognito
// user with its own `sub`, as in the real service: linking them is our job (D-041).
// What it assumes about the real Cognito is logged as a known risk and checked at step 8.
import type { TestIssuer } from '@wr/auth/testing';
import Fastify from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';

type Res = { status: number; body: object };

interface EmailUser {
  sub: string;
  confirmed: boolean;
  code?: string;
  /** Set by the admin calls only (guests, D-108). */
  password?: string;
}

/** The server-only guest client (D-108): admin password sign-in, nothing else. */
const GUEST_CLIENT = 'test-guests';

export async function fakeCognito(issuer: TestIssuer) {
  const users = new Map<string, EmailUser>();
  const sessions = new Map<
    string,
    { email: string; purpose: 'otp' | 'confirmed'; code?: string }
  >();
  const refreshTokens = new Map<
    string,
    { sub: string; email: string; name?: string; google?: boolean; client?: string }
  >();
  /** Admin calls the guest path made, in order, for the tests to check. */
  const adminCalls: { op: string; username: string; messageAction?: unknown }[] = [];
  const googleCodes = new Map<
    string,
    { sub: string; email: string; name: string; verified: boolean }
  >();
  const codes: { email: string; code: string }[] = [];
  const sixDigits = () => String(Math.floor(100000 + Math.random() * 900000));
  const eightDigits = () => String(Math.floor(10000000 + Math.random() * 90000000));
  const fail = (type: string, status = 400): Res => ({
    status,
    body: { __type: type, message: type },
  });

  async function issue(
    sub: string,
    email: string,
    extra: { name?: string; google?: boolean; client?: string } = {},
  ) {
    const refresh = randomBytes(24).toString('base64url');
    refreshTokens.set(refresh, { sub, email, ...extra });
    const { client, ...claims } = extra;
    return {
      AccessToken: await issuer.sign(sub, client ? { clientId: client } : {}),
      IdToken: await issuer.signId(sub, {
        email,
        ...claims,
        ...(client ? { clientId: client } : {}),
      }),
      RefreshToken: refresh,
      ExpiresIn: 3600,
    };
  }

  const ops: Record<string, (b: Record<string, unknown>) => Promise<Res> | Res> = {
    SignUp(b) {
      const email = String(b.Username);
      if (users.has(email)) return fail('UsernameExistsException');
      const code = sixDigits();
      users.set(email, { sub: `email-${randomUUID()}`, confirmed: false, code });
      codes.push({ email, code });
      return { status: 200, body: { UserConfirmed: false, UserSub: users.get(email)!.sub } };
    },
    // Like the real pool (D-065): it sends a sign-up code even to a confirmed account, and hides
    // whether the account exists at all.
    ResendConfirmationCode(b) {
      const u = users.get(String(b.Username));
      if (u) {
        u.code = sixDigits();
        codes.push({ email: String(b.Username), code: u.code });
      }
      return { status: 200, body: { CodeDeliveryDetails: { DeliveryMedium: 'EMAIL' } } };
    },
    // The admin call (signed with AWS credentials) that tells the two apart.
    AdminGetUser(b) {
      const u = users.get(String(b.Username));
      if (!u) return fail('UserNotFoundException');
      return {
        status: 200,
        body: { Username: u.sub, UserStatus: u.confirmed ? 'CONFIRMED' : 'UNCONFIRMED' },
      };
    },
    // Guests (D-108): created confirmed and silent, given a password, signed in on the guest client.
    AdminCreateUser(b) {
      const email = String(b.Username);
      adminCalls.push({ op: 'AdminCreateUser', username: email, messageAction: b.MessageAction });
      if (users.has(email)) return fail('UsernameExistsException');
      users.set(email, { sub: `guest-${randomUUID()}`, confirmed: true });
      return { status: 200, body: { User: { Username: email } } };
    },
    AdminSetUserPassword(b) {
      const u = users.get(String(b.Username));
      adminCalls.push({ op: 'AdminSetUserPassword', username: String(b.Username) });
      if (!u) return fail('UserNotFoundException');
      u.password = String(b.Password);
      return { status: 200, body: {} };
    },
    async AdminInitiateAuth(b) {
      const p = (b.AuthParameters ?? {}) as Record<string, string>;
      const email = String(p.USERNAME);
      const u = users.get(email);
      adminCalls.push({ op: 'AdminInitiateAuth', username: email });
      if (b.ClientId !== GUEST_CLIENT || b.AuthFlow !== 'ADMIN_USER_PASSWORD_AUTH')
        return fail('InvalidParameterException');
      if (!u?.password || u.password !== p.PASSWORD) return fail('NotAuthorizedException');
      return {
        status: 200,
        body: { AuthenticationResult: await issue(u.sub, email, { client: GUEST_CLIENT }) },
      };
    },
    AdminDeleteUser(b) {
      const email = String(b.Username);
      adminCalls.push({ op: 'AdminDeleteUser', username: email });
      if (!users.delete(email)) return fail('UserNotFoundException');
      for (const [t, r] of refreshTokens) if (r.email === email) refreshTokens.delete(t);
      return { status: 200, body: {} };
    },
    ConfirmSignUp(b) {
      const email = String(b.Username);
      const u = users.get(email);
      if (!u) return fail('UserNotFoundException');
      if (b.ConfirmationCode !== u.code) return fail('CodeMismatchException');
      u.confirmed = true;
      const session = randomUUID();
      sessions.set(session, { email, purpose: 'confirmed' });
      return { status: 200, body: { Session: session } };
    },
    async InitiateAuth(b) {
      const p = (b.AuthParameters ?? {}) as Record<string, string>;
      if (b.AuthFlow === 'REFRESH_TOKEN_AUTH') {
        const r = refreshTokens.get(p.REFRESH_TOKEN ?? '');
        // A refresh token works only on the client that issued it, as in Cognito.
        if (!r || (b.ClientId === GUEST_CLIENT) !== (r.client === GUEST_CLIENT))
          return fail('NotAuthorizedException');
        const t = await issue(r.sub, r.email, {
          ...(r.name ? { name: r.name } : {}),
          google: !!r.google,
          ...(r.client ? { client: r.client } : {}),
        });
        return { status: 200, body: { AuthenticationResult: { ...t, RefreshToken: undefined } } };
      }
      const email = String(p.USERNAME);
      const u = users.get(email);
      if (typeof b.Session === 'string') {
        const s = sessions.get(b.Session);
        if (!s || s.purpose !== 'confirmed' || s.email !== email || !u)
          return fail('NotAuthorizedException');
        sessions.delete(b.Session);
        return { status: 200, body: { AuthenticationResult: await issue(u.sub, email) } };
      }
      if (!u) return fail('UserNotFoundException');
      // Like the real pool (checked 2026-10-26, D-061): with user-existence errors hidden, an
      // unconfirmed account gets a challenge as if a code were sent, but no code can ever succeed.
      if (!u.confirmed) {
        const session = randomUUID();
        sessions.set(session, { email, purpose: 'otp', code: 'never' });
        return { status: 200, body: { ChallengeName: 'EMAIL_OTP', Session: session } };
      }
      const code = eightDigits(); // Cognito's sign-in codes are 8 digits, sign-up codes 6
      const session = randomUUID();
      sessions.set(session, { email, purpose: 'otp', code });
      codes.push({ email, code });
      return { status: 200, body: { ChallengeName: 'EMAIL_OTP', Session: session } };
    },
    async RespondToAuthChallenge(b) {
      const s = sessions.get(String(b.Session));
      const r = (b.ChallengeResponses ?? {}) as Record<string, string>;
      if (!s || s.purpose !== 'otp' || s.email !== r.USERNAME)
        return fail('NotAuthorizedException');
      if (r.EMAIL_OTP_CODE !== s.code) return fail('CodeMismatchException');
      sessions.delete(String(b.Session));
      return {
        status: 200,
        body: { AuthenticationResult: await issue(users.get(s.email)!.sub, s.email) },
      };
    },
    RevokeToken(b) {
      refreshTokens.delete(String(b.Token));
      return { status: 200, body: {} };
    },
  };

  const app = Fastify();
  app.addContentTypeParser(
    'application/x-amz-json-1.1',
    { parseAs: 'string' },
    (_r, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error);
      }
    },
  );
  // OAuth's token endpoint takes a form body.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_r, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  app.post('/', async (req, reply) => {
    const op = String(req.headers['x-amz-target']).split('.').pop()!;
    const handler = ops[op];
    if (!handler) return reply.status(400).send({ __type: 'UnknownOperationException' });
    const r = await handler(req.body as Record<string, unknown>);
    return reply.status(r.status).send(r.body);
  });
  app.post<{ Body: Record<string, string> }>('/oauth2/token', async (req, reply) => {
    const g = googleCodes.get(req.body.code ?? '');
    if (!g || !req.body.code_verifier) return reply.status(400).send({ error: 'invalid_grant' });
    googleCodes.delete(req.body.code!);
    const t = await issue(g.sub, g.email, { name: g.name, google: true });
    if (!g.verified)
      t.IdToken = await issuer.signId(g.sub, {
        email: g.email,
        name: g.name,
        google: true,
        emailVerified: false,
      });
    return {
      access_token: t.AccessToken,
      id_token: t.IdToken,
      refresh_token: t.RefreshToken,
      expires_in: t.ExpiresIn,
    };
  });
  const url = await app.listen({ port: 0, host: '127.0.0.1' });

  return {
    url,
    /** The last code "emailed" to this address. */
    lastCode(email: string) {
      const c = [...codes].reverse().find((x) => x.email === email);
      if (!c) throw new Error(`no code sent to ${email}`);
      return c.code;
    },
    codesSent: (email: string) => codes.filter((c) => c.email === email).length,
    adminCalls,
    hasUser: (email: string) => users.has(email),
    /** What Google would hand back after the writer picks an account: an authorization code. */
    googleSignIn(email: string, name: string, opts: { verified?: boolean; sub?: string } = {}) {
      const code = randomBytes(12).toString('base64url');
      googleCodes.set(code, {
        sub: opts.sub ?? `google_${randomUUID()}`,
        email,
        name,
        verified: opts.verified ?? true,
      });
      return code;
    },
    close: () => app.close(),
  };
}
