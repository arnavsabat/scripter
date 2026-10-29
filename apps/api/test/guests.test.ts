// "Try a demo script" (D-108): a guest is a silent Cognito user on the guest client, a person who
// lasts a day, can write, and can't invite anyone or join a room; the limits hold.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiHarness } from './apiHarness';
import { servicesEnabled } from './testDb';

interface Guest {
  accessToken: string;
  expiresIn: number;
  user: { id: string; name: string; email: string; guestUntil: string };
}

describe.skipIf(!servicesEnabled)('guests', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  beforeAll(async () => {
    h = await apiHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  let address = 0;
  /** Each start from its own address unless one is given, so the hourly limit stays out of the way. */
  async function start(from = `10.0.0.${++address}`) {
    const res = await h.app.inject({ method: 'POST', url: '/api/auth/guest', remoteAddress: from });
    const cookie = res.cookies.find((c) => c.name === 'wr_refresh');
    return { status: res.statusCode, body: res.json<Guest & { error?: string }>(), cookie };
  }
  const as = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    h.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  it('signs a guest in silently on the guest client, for a day, with a guest cookie', async () => {
    const mailsBefore = h.mailer.sent.length;
    const g = await start();
    expect(g.status).toBe(200);
    expect(g.body.user.name).toBe('Guest');
    expect(g.body.user.email).toMatch(/^guest-[0-9a-f-]{36}@guest\.app\.test$/);
    const hours = (Date.parse(g.body.user.guestUntil) - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.01); // Postgres's clock can run a little ahead of Node's
    // Created confirmed and silent: Cognito sends nothing, and neither do we.
    const calls = h.cognito.adminCalls.filter((c) => c.username === g.body.user.email);
    expect(calls.map((c) => c.op)).toEqual([
      'AdminCreateUser',
      'AdminSetUserPassword',
      'AdminInitiateAuth',
    ]);
    expect(calls[0]!.messageAction).toBe('SUPPRESS');
    expect(h.mailer.sent.length).toBe(mailsBefore);
    expect(g.cookie?.value.startsWith('g:')).toBe(true);
    expect(g.cookie?.httpOnly).toBe(true);
    expect(g.cookie?.maxAge).toBe(24 * 3600);
    // The guest client's token is an ordinary pass to the API.
    const me = await as(g.body.accessToken, 'GET', '/api/me');
    expect(me.json()).toMatchObject({ id: g.body.user.id, name: 'Guest' });
  });

  it('a guest stays signed in through the guest client, and signing out revokes it', async () => {
    const g = await start();
    const cookies = { wr_refresh: g.cookie!.value };
    const refreshed = await h.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<Guest>().user.id).toBe(g.body.user.id);
    // Guests keep the one day-long cookie: refreshing doesn't extend the demo.
    expect(refreshed.cookies.find((c) => c.name === 'wr_refresh')).toBeUndefined();
    await h.app.inject({ method: 'POST', url: '/api/auth/signout', cookies });
    const after = await h.app.inject({ method: 'POST', url: '/api/auth/refresh', cookies });
    expect(after.statusCode).toBe(401);
  });

  it('a guest writes, but can’t invite anyone (no email) or join a room by invitation', async () => {
    const g = await start();
    const script = await as(g.body.accessToken, 'POST', '/api/series', {
      kind: 'script',
      name: 'The Avengers (excerpt)',
    });
    expect(script.statusCode).toBe(200);
    const { seriesId } = script.json<{ seriesId: string }>();
    const mailsBefore = h.mailer.sent.length;
    const invite = await as(g.body.accessToken, 'POST', `/api/series/${seriesId}/invitations`, {
      email: 'stranger@example.com',
      role: 'writer',
    });
    expect(invite.statusCode).toBe(403);
    expect(invite.json<{ error: string }>().error).toBe('guest');
    expect(h.mailer.sent.length).toBe(mailsBefore);

    // A real showrunner's invitation link doesn't let a guest into their room either.
    const maya = await h.person('Maya');
    const room = await maya.call<{ seriesId: string }>('POST', '/api/series', { kind: 'script' });
    await maya.call('POST', `/api/series/${room.body.seriesId}/invitations`, {
      email: 'someone@example.com',
      role: 'writer',
    });
    const token = h.lastInviteToken('someone@example.com');
    const join = await as(g.body.accessToken, 'POST', '/api/invitations/accept', { token });
    expect(join.statusCode).toBe(403);
    const members = await h.admin.query(
      `select 1 from series_members where series_id = $1 and user_id = $2`,
      [room.body.seriesId, g.body.user.id],
    );
    expect(members.rowCount).toBe(0);
  });

  it('after its day, a guest is nobody: the API and refreshing both refuse', async () => {
    const g = await start();
    await h.admin.query(
      `update users set guest_until = now() - interval '1 second' where id = $1`,
      [g.body.user.id],
    );
    expect((await as(g.body.accessToken, 'GET', '/api/me')).statusCode).toBe(401);
    const refreshed = await h.app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { wr_refresh: g.cookie!.value },
    });
    expect(refreshed.statusCode).toBe(401);
  });

  it('at most 5 demos an hour from one address', async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await start('10.9.9.9')).status);
    expect(results).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await start('10.9.9.10')).status).toBe(200); // another visitor is unaffected
  });

  it('at most 200 demos a day in all', async () => {
    const { rows } = await h.admin.query<{ n: number }>(
      `select count(*)::int as n from users where guest_until is not null`,
    );
    await h.admin.query(
      `insert into users (email, name, guest_until)
         select 'filler-' || g || '@guest.app.test', 'Guest', now() + interval '1 day'
           from generate_series(1, $1) g`,
      [200 - rows[0]!.n],
    );
    const full = await start();
    expect(full.status).toBe(429);
    expect(full.body.error).toBe('demo_full');
  });
});
