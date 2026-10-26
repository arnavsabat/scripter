// Signing in (SPEC 5.6; D-028, D-031). The API is the browser's go-between for Cognito: the
// long-lived refresh token lives in an httpOnly cookie page scripts can't read, and the browser
// only ever holds a 1-hour access token, in memory.
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDeps, User } from '../app';
import { CognitoError, type Tokens } from '../auth/cognito';
import { linkSignIn } from '../auth/link';
import { ApiError } from '../errors';

const REFRESH = 'wr_refresh';
const OAUTH = 'wr_oauth';
const REFRESH_DAYS = 30;

/** What a writer sees for each refusal from Cognito. */
function explain(err: unknown): never {
  if (!(err instanceof CognitoError)) throw err;
  switch (err.type) {
    case 'CodeMismatchException':
      throw new ApiError(
        400,
        'wrong_code',
        'That code isn’t right. Check the email and try again.',
      );
    case 'ExpiredCodeException':
    case 'NotAuthorizedException':
      throw new ApiError(400, 'code_expired', 'That code has expired. Send a new one.');
    case 'TooManyRequestsException':
    case 'LimitExceededException':
    case 'TooManyFailedAttemptsException':
      throw new ApiError(429, 'slow_down', 'Too many tries. Wait a minute, then try again.');
    case 'InvalidParameterException':
      throw new ApiError(400, 'bad_email', 'Check the email address.');
    default:
      throw new ApiError(502, 'sign_in_failed', 'Signing in didn’t work. Please try again.');
  }
}

/** The sign-in in progress between "Continue" and the code: which path, the address, Cognito's session. */
interface Attempt {
  kind: 'signin' | 'signup';
  email: string;
  session?: string;
}
const pack = (a: Attempt) => Buffer.from(JSON.stringify(a)).toString('base64url');
/**
 * How long the emailed code is, so the page can say so and submit on the last digit. Cognito's
 * sign-up codes have 6 digits and its sign-in codes 8; neither is configurable (checked against
 * the real pool in step 8).
 */
const codeLength = (a: Attempt) => (a.kind === 'signup' ? 6 : 8);
const started = (a: Attempt) => ({ attempt: pack(a), codeLength: codeLength(a) });
function unpack(s: string): Attempt {
  try {
    const a = JSON.parse(Buffer.from(s, 'base64url').toString()) as Partial<Attempt>;
    if ((a.kind === 'signin' || a.kind === 'signup') && typeof a.email === 'string')
      return { kind: a.kind, email: a.email, ...(a.session ? { session: a.session } : {}) };
  } catch {
    // fall through
  }
  throw new ApiError(400, 'code_expired', 'That code has expired. Send a new one.');
}

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { auth, db, appUrl } = deps;
  const callback = `${appUrl}/api/auth/google/callback`;
  const cookieOpts = {
    httpOnly: true,
    secure: true, // browsers treat http://localhost as secure, so this holds in development too
    sameSite: 'strict' as const,
    path: '/api/auth',
    maxAge: REFRESH_DAYS * 24 * 3600,
  };
  const pub = { config: { public: true } };

  /** Codes are sent from here: a new address gets a sign-up code, a known one a sign-in code. */
  async function begin(email: string): Promise<Attempt> {
    try {
      const session = await auth.cognito.signUp(email);
      return { kind: 'signup', email, ...(session ? { session } : {}) };
    } catch (err) {
      if (!(err instanceof CognitoError) || err.type !== 'UsernameExistsException') explain(err);
    }
    // The address exists. If it never finished signing up, send a fresh sign-up code: asking for
    // a sign-in code would get a challenge no code can answer, because the pool hides whether
    // accounts exist (checked on the real pool, D-061). Cognito refuses to re-send a sign-up code
    // to a confirmed account, which is how we tell the two apart.
    try {
      await auth.cognito.resendSignUpCode(email);
      return { kind: 'signup', email };
    } catch (err) {
      if (!(err instanceof CognitoError) || err.type !== 'InvalidParameterException') explain(err);
    }
    try {
      return { kind: 'signin', email, session: await auth.cognito.startEmailCode(email) };
    } catch (err) {
      explain(err);
    }
  }

  /** Links the sign-in to a person, keeps the refresh token in the cookie, hands back the access token. */
  async function finish(tokens: Tokens, reply: FastifyReply) {
    const claims = await auth.verifyId(tokens.idToken);
    if (!claims)
      throw new ApiError(502, 'sign_in_failed', 'Signing in didn’t work. Please try again.');
    const { user, isNew } = await linkSignIn(db, claims);
    if (tokens.refreshToken) void reply.setCookie(REFRESH, tokens.refreshToken, cookieOpts);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user,
      // Only a brand-new email sign-up has no name yet: the "What should the room call you?" step.
      needsName: isNew && !claims.name,
    };
  }

  app.post<{ Body: { email: string } }>(
    '/api/auth/email/start',
    {
      ...pub,
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email', maxLength: 254 } },
        },
      },
    },
    async (req) => started(await begin(req.body.email.trim().toLowerCase())),
  );

  app.post<{ Body: { attempt: string } }>(
    '/api/auth/email/resend',
    {
      ...pub,
      schema: {
        body: {
          type: 'object',
          required: ['attempt'],
          properties: { attempt: { type: 'string', maxLength: 8000 } },
        },
      },
    },
    async (req) => started(await begin(unpack(req.body.attempt).email)),
  );

  app.post<{ Body: { attempt: string; code: string } }>(
    '/api/auth/email/verify',
    {
      ...pub,
      schema: {
        body: {
          type: 'object',
          required: ['attempt', 'code'],
          properties: {
            attempt: { type: 'string', maxLength: 8000 },
            code: { type: 'string', pattern: '^[0-9]{6,8}$' },
          },
        },
      },
    },
    async (req, reply) => {
      const a = unpack(req.body.attempt);
      let tokens: Tokens;
      try {
        if (a.kind === 'signin') {
          if (!a.session) throw new CognitoError('NotAuthorizedException', 'no session');
          tokens = await auth.cognito.answerEmailCode(a.email, a.session, req.body.code);
        } else {
          const session = await auth.cognito.confirmSignUp(a.email, req.body.code, a.session);
          tokens = await auth.cognito.signInWithSession(a.email, session);
        }
      } catch (err) {
        explain(err);
      }
      return finish(tokens, reply);
    },
  );

  // "Continue with Google": straight to Google through Cognito, with PKCE (D-031).
  app.get('/api/auth/google/start', pub, (_req, reply) => {
    const state = randomBytes(16).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    // Lax, not Strict: the browser comes back from Google on a top-level cross-site redirect.
    void reply.setCookie(OAUTH, `${state}.${verifier}`, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 600,
    });
    return reply.redirect(auth.cognito.googleUrl(callback, state, challenge));
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    '/api/auth/google/callback',
    pub,
    async (req, reply) => {
      const [state, verifier] = (req.cookies[OAUTH] ?? '').split('.');
      void reply.clearCookie(OAUTH, { path: '/api/auth/google' });
      if (!req.query.code || !state || !verifier || req.query.state !== state)
        return reply.redirect(`${appUrl}/?signin=failed`);
      try {
        const tokens = await auth.cognito.exchangeCode(req.query.code, callback, verifier);
        await finish(tokens, reply);
      } catch {
        return reply.redirect(`${appUrl}/?signin=failed`);
      }
      // The app asks /api/auth/refresh for its access token as it loads.
      return reply.redirect(`${appUrl}/`);
    },
  );

  // On every page load, and before the access token expires.
  app.post('/api/auth/refresh', pub, async (req, reply) => {
    const refreshToken = req.cookies[REFRESH];
    const signedOut = () => {
      void reply.clearCookie(REFRESH, { path: '/api/auth' });
      return new ApiError(401, 'signed_out', 'Please sign in again.');
    };
    if (!refreshToken) throw signedOut();
    let tokens: Tokens;
    try {
      tokens = await auth.cognito.refresh(refreshToken);
    } catch {
      throw signedOut();
    }
    const verified = await deps.verify(tokens.accessToken);
    const { rows } = verified
      ? await db.query<User>(
          `select u.id, u.name, u.email from user_identities i join users u on u.id = i.user_id
            where i.cognito_sub = $1`,
          [verified.sub],
        )
      : { rows: [] };
    if (!rows[0]) throw signedOut();
    if (tokens.refreshToken) void reply.setCookie(REFRESH, tokens.refreshToken, cookieOpts);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user: rows[0] };
  });

  app.post('/api/auth/signout', pub, async (req, reply) => {
    const refreshToken = req.cookies[REFRESH];
    if (refreshToken) await auth.cognito.revoke(refreshToken).catch(() => {});
    void reply.clearCookie(REFRESH, { path: '/api/auth' });
    return { ok: true };
  });

  // The first-time name step (D-028). Later name changes are by request for now (D-032).
  app.patch<{ Body: { name: string } }>(
    '/api/me',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (req) => {
      const name = req.body.name.trim();
      if (!name) throw new ApiError(400, 'bad_request', 'Type a name.');
      const { rows } = await db.query<User>(
        `update users set name = $2 where id = $1 returning id, name, email`,
        [req.user.id, name],
      );
      return rows[0];
    },
  );
}
