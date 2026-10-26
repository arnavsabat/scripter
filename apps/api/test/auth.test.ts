// Signing in through the API, against the fake Cognito (D-030): email codes, Google, staying signed
// in with the httpOnly refresh cookie, signing out, and one person per verified email (D-041).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiHarness } from './apiHarness';
import { servicesEnabled } from './testDb';

interface Cookie {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
}
interface SignedIn {
  accessToken: string;
  expiresIn: number;
  user: { id: string; name: string; email: string };
  needsName: boolean;
}

describe.skipIf(!servicesEnabled)('signing in', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  beforeAll(async () => {
    h = await apiHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  const post = async (url: string, payload?: object, cookies?: Record<string, string>) => {
    const res = await h.app.inject({
      method: 'POST',
      url,
      ...(payload ? { payload } : {}),
      ...(cookies ? { cookies } : {}),
    });
    return {
      status: res.statusCode,
      body: res.json<Record<string, unknown>>(),
      cookies: res.cookies as Cookie[],
    };
  };
  const me = async (token: string) =>
    (
      await h.app.inject({
        method: 'GET',
        url: '/api/me',
        headers: { authorization: `Bearer ${token}` },
      })
    ).json<{
      id: string;
      name: string;
    }>();

  /** The whole email flow: Continue → code → signed in. */
  async function emailSignIn(email: string) {
    const start = await post('/api/auth/email/start', { email });
    expect(start.status).toBe(200);
    const verify = await post('/api/auth/email/verify', {
      attempt: start.body.attempt,
      code: h.cognito.lastCode(email.toLowerCase()),
    });
    expect(verify.status).toBe(200);
    return { ...(verify.body as unknown as SignedIn), cookies: verify.cookies };
  }

  it('a new email signs up with a code, gets the name step, and lands signed in', async () => {
    const s = await emailSignIn('riley@example.com');
    expect(s.needsName).toBe(true);
    expect(s.user.name).toBe('riley'); // until they type one
    expect((await me(s.accessToken)).id).toBe(s.user.id);
    const named = await h.app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { authorization: `Bearer ${s.accessToken}` },
      payload: { name: 'Riley Chen' },
    });
    expect(named.json<{ name: string }>().name).toBe('Riley Chen');
  });

  it('keeps the refresh token in a cookie page scripts can’t read, sent only to the auth endpoints', async () => {
    const s = await emailSignIn('cookie@example.com');
    const c = s.cookies.find((x) => x.name === 'wr_refresh')!;
    expect(c).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/api/auth',
    });
    expect(c.maxAge).toBe(30 * 24 * 3600);
    // The access token is in the response body; the refresh token never is.
    const { cookies: _set, ...body } = s;
    expect(_set.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain(c.value);
  });

  it('a known email gets a sign-in code; a wrong code is refused with a clear message', async () => {
    const first = await emailSignIn('sam@example.com');
    const start = await post('/api/auth/email/start', { email: 'SAM@example.com' });
    const wrong = await post('/api/auth/email/verify', {
      attempt: start.body.attempt,
      code: '000000',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('wrong_code');
    expect(wrong.body.message).toMatch(/isn’t right/);
    const right = await post('/api/auth/email/verify', {
      attempt: start.body.attempt,
      code: h.cognito.lastCode('sam@example.com'),
    });
    expect(right.status).toBe(200);
    expect(right.body).toMatchObject({ needsName: false, user: { id: first.user.id } });
  });

  it('"Send a new code" sends another one, and someone who never finished signing up can', async () => {
    const start = await post('/api/auth/email/start', { email: 'drift@example.com' });
    // They wander off, then come back and press Continue again (the account exists but isn't confirmed).
    const again = await post('/api/auth/email/start', { email: 'drift@example.com' });
    expect(again.status).toBe(200);
    const resent = await post('/api/auth/email/resend', { attempt: again.body.attempt });
    expect(resent.status).toBe(200);
    expect(h.cognito.codesSent('drift@example.com')).toBe(3);
    // Only the newest code works.
    const ok = await post('/api/auth/email/verify', {
      attempt: resent.body.attempt,
      code: h.cognito.lastCode('drift@example.com'),
    });
    expect(ok.status).toBe(200);
    expect(start.status).toBe(200);
  });

  it('a garbled sign-in attempt reads as an expired code, not a crash', async () => {
    const r = await post('/api/auth/email/verify', { attempt: 'not-an-attempt', code: '123456' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('code_expired');
  });

  it('Google and an email code reach the same person (D-041)', async () => {
    const viaEmail = await emailSignIn('maya@example.com');
    const start = await h.app.inject({ method: 'GET', url: '/api/auth/google/start' });
    expect(start.statusCode).toBe(302);
    const to = new URL(start.headers.location as string);
    expect(to.pathname).toBe('/oauth2/authorize');
    expect(to.searchParams.get('identity_provider')).toBe('Google');
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    const oauth = (start.cookies as Cookie[]).find((c) => c.name === 'wr_oauth')!;
    expect(oauth).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    const back = await h.app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${h.cognito.googleSignIn('maya@example.com', 'Maya Alvarez')}&state=${to.searchParams.get('state')}`,
      cookies: { wr_oauth: oauth.value },
    });
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe('https://app.test/');
    const refresh = (back.cookies as Cookie[]).find((c) => c.name === 'wr_refresh')!;
    const session = await post('/api/auth/refresh', undefined, { wr_refresh: refresh.value });
    expect(session.status).toBe(200);
    expect((session.body.user as { id: string }).id).toBe(viaEmail.user.id);
  });

  it('a new Google account takes its name from Google and skips the name step', async () => {
    const start = await h.app.inject({ method: 'GET', url: '/api/auth/google/start' });
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const oauth = (start.cookies as Cookie[]).find((c) => c.name === 'wr_oauth')!;
    const back = await h.app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=${h.cognito.googleSignIn('priya@example.com', 'Priya Nair')}&state=${state}`,
      cookies: { wr_oauth: oauth.value },
    });
    const refresh = (back.cookies as Cookie[]).find((c) => c.name === 'wr_refresh')!;
    const session = await post('/api/auth/refresh', undefined, { wr_refresh: refresh.value });
    expect(session.body.user).toMatchObject({ name: 'Priya Nair', email: 'priya@example.com' });
  });

  it('Google sign-in fails safely: wrong state, no cookie, or an unverified email', async () => {
    const start = await h.app.inject({ method: 'GET', url: '/api/auth/google/start' });
    const oauth = (start.cookies as Cookie[]).find((c) => c.name === 'wr_oauth')!;
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const tries: { url: string; cookies: Record<string, string> }[] = [
      {
        url: `?code=${h.cognito.googleSignIn('x@example.com', 'X')}&state=forged`,
        cookies: { wr_oauth: oauth.value },
      },
      { url: `?code=${h.cognito.googleSignIn('x@example.com', 'X')}&state=${state}`, cookies: {} },
      {
        url: `?code=${h.cognito.googleSignIn('y@example.com', 'Y', { verified: false })}&state=${state}`,
        cookies: { wr_oauth: oauth.value },
      },
    ];
    for (const t of tries) {
      const r = await h.app.inject({
        method: 'GET',
        url: `/api/auth/google/callback${t.url}`,
        cookies: t.cookies,
      });
      expect(r.headers.location).toBe('https://app.test/?signin=failed');
      expect((r.cookies as Cookie[]).some((c) => c.name === 'wr_refresh' && c.value)).toBe(false);
    }
  });

  it('stays signed in with the cookie, and signing out ends it everywhere', async () => {
    const s = await emailSignIn('noor@example.com');
    const cookie = s.cookies.find((c) => c.name === 'wr_refresh')!.value;
    const refreshed = await post('/api/auth/refresh', undefined, { wr_refresh: cookie });
    expect(refreshed.status).toBe(200);
    expect((await me(refreshed.body.accessToken as string)).id).toBe(s.user.id);
    expect((await post('/api/auth/refresh')).status).toBe(401); // no cookie, no session
    const out = await post('/api/auth/signout', undefined, { wr_refresh: cookie });
    expect(out.status).toBe(200);
    expect(out.cookies.find((c) => c.name === 'wr_refresh')?.value).toBe('');
    expect((await post('/api/auth/refresh', undefined, { wr_refresh: cookie })).status).toBe(401);
  });

  it('the sign-in endpoints are the only ones reachable without a token', async () => {
    expect((await h.anonymous('GET', '/api/home')).status).toBe(401);
    expect((await h.anonymous('PATCH', '/api/me')).status).toBe(401);
  });
});
