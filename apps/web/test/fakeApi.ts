// A stand-in for apps/api in the browser tests (D-048): the same endpoints and shapes, with canned
// data, so the browser tests run without Postgres. The real API's behavior has its own tests
// (apps/api/test). Access tokens are real test-key tokens, so the sync server accepts them.
// Codes: a new address's sign-up code is 123456, a known address's sign-in code is 12345678.
import type { TestIssuer } from '@wr/auth/testing';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fakeRooms } from './fakeRooms';

export const FAKE_API_PORT = 4789;

interface User {
  id: string;
  name: string;
  email: string;
}

export async function startFakeApi(issuer: TestIssuer) {
  const users = new Map<string, User>(); // by email
  const tokens = new Map<string, string>(); // access token -> email
  const refresh = new Map<string, string>(); // cookie -> email
  const accepted: string[] = [];
  const rooms = fakeRooms(users);

  const read = async (req: IncomingMessage) => {
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    return (raw ? JSON.parse(raw) : {}) as Record<string, string>;
  };
  const send = (res: ServerResponse, status: number, body: unknown, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, error: string, message: string) =>
    send(res, status, { error, message });
  const who = (req: IncomingMessage) =>
    users.get(tokens.get((req.headers.authorization ?? '').replace('Bearer ', '')) ?? '');
  const cookie = (req: IncomingMessage) =>
    /(?:^|;\s*)wr_refresh=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];

  async function issue(u: User) {
    const accessToken = await issuer.sign(u.name);
    tokens.set(accessToken, u.email);
    const r = randomBytes(12).toString('hex');
    refresh.set(r, u.email);
    return {
      body: { accessToken, expiresIn: 3600, user: u },
      cookie: `wr_refresh=${r}; Path=/api/auth; HttpOnly; SameSite=Strict`,
    };
  }

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://local');
      const path = url.pathname;
      const m = req.method;
      if (path === '/__fake/reset') {
        users.clear();
        tokens.clear();
        refresh.clear();
        accepted.length = 0;
        rooms.reset();
        return send(res, 200, { ok: true });
      }
      // Test shortcut: sign in as someone (sets the refresh cookie), optionally with the
      // prototype's sample room seeded from their point of view.
      if (path === '/__fake/unassign' || path === '/__fake/assign') {
        const b = await read(req);
        rooms[path === '/__fake/assign' ? 'assign' : 'unassign'](b.episode!, b.name!);
        return send(res, 200, { ok: true });
      }
      if (path === '/__fake/login') {
        const b = await read(req);
        const u = rooms.user(b.name ?? 'Arnav');
        if (b.room) rooms.seed(u);
        const s = await issue(u);
        return send(res, 200, s.body, { 'set-cookie': s.cookie });
      }
      if (path === '/__fake/accepted') return send(res, 200, accepted);
      if (m === 'POST' && (path === '/api/auth/email/start' || path === '/api/auth/email/resend')) {
        const b = await read(req);
        const fromAttempt = (JSON.parse(b.attempt ?? '{}') as { email?: string }).email;
        const email = (b.email ?? fromAttempt ?? '').toLowerCase();
        return send(res, 200, {
          attempt: JSON.stringify({ email }),
          codeLength: users.has(email) ? 8 : 6,
        });
      }
      if (m === 'POST' && path === '/api/auth/email/verify') {
        const b = await read(req);
        const { email } = JSON.parse(b.attempt ?? '{}') as { email: string };
        const known = users.get(email);
        if (b.code !== (known ? '12345678' : '123456'))
          return fail(
            res,
            400,
            'wrong_code',
            'That code isn’t right. Check the email and try again.',
          );
        const u = known ?? { id: `u-${users.size + 1}`, name: email.split('@')[0]!, email };
        users.set(email, u);
        const s = await issue(u);
        return send(res, 200, { ...s.body, needsName: !known }, { 'set-cookie': s.cookie });
      }
      if (m === 'POST' && path === '/api/auth/refresh') {
        const email = refresh.get(cookie(req) ?? '');
        const u = email ? users.get(email) : undefined;
        if (!u) return fail(res, 401, 'signed_out', 'Please sign in again.');
        const s = await issue(u);
        return send(res, 200, s.body, { 'set-cookie': s.cookie });
      }
      if (m === 'POST' && path === '/api/auth/signout') {
        refresh.delete(cookie(req) ?? '');
        return send(
          res,
          200,
          { ok: true },
          {
            'set-cookie': 'wr_refresh=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0',
          },
        );
      }
      if (m === 'GET' && path === '/api/invitations/preview') {
        const t = url.searchParams.get('token') ?? '';
        if (t.startsWith('fogline'))
          return send(res, 200, { seriesName: 'Fogline', from: 'Sam Jones', role: 'writer' });
        if (t.startsWith('used'))
          return fail(
            res,
            410,
            'invitation_used',
            'This invitation has expired or was already used. Ask the showrunner for a new one.',
          );
        return fail(res, 404, 'invitation_unknown', 'This invitation link isn’t valid.');
      }
      const me = who(req);
      if (!me) return fail(res, 401, 'signed_out', 'Please sign in again.');
      if (path === '/api/me' && m === 'GET') return send(res, 200, me);
      if (path === '/api/me' && m === 'PATCH') {
        me.name = (await read(req)).name ?? me.name;
        return send(res, 200, me);
      }
      let parsed: Record<string, string> | undefined;
      const body = async () => (parsed ??= await read(req));
      if (m === 'POST' && path === '/api/invitations/accept')
        accepted.push(`${me.email} ${(await body()).token}`);
      const r = await rooms.handle(m ?? 'GET', path, body, me);
      if (r) return send(res, r.status, r.body);
      return fail(res, 404, 'not_found', 'That doesn’t exist.');
    })();
  });
  await new Promise<void>((r) => server.listen(FAKE_API_PORT, '127.0.0.1', r));
  return () =>
    new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    });
}
