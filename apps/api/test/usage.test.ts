// Usage counting and crash reports (SPEC 5.9, D-082) against a real Postgres: the browser's events
// land with who and which episode, only for people who can see the episode; what-ifs are counted
// by the API itself; crash reports are accepted signed out and never stored in the database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiHarness, type Person } from './apiHarness';
import { servicesEnabled } from './testDb';

describe.skipIf(!servicesEnabled)('usage events', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  let arnav: Person, priya: Person, stranger: Person;
  let episode: string;

  const events = async () =>
    (
      await h.admin.query<{ event: string; user_id: string; episode_id: string }>(
        `select event, user_id, episode_id from usage_events order by id`,
      )
    ).rows.map((r) => [r.event, r.user_id, r.episode_id]);

  beforeAll(async () => {
    h = await apiHarness();
    [arnav, priya, stranger] = (await Promise.all(
      ['Arnav', 'Priya', 'Stranger'].map((n) => h.person(n)),
    )) as [Person, Person, Person];
    const s = await arnav.call<{ seriesId: string }>('POST', '/api/series', {
      kind: 'series',
      name: 'Fogline',
    });
    episode = (
      await arnav.call<{ episodeId: string }>('POST', `/api/series/${s.body.seriesId}/episodes`, {
        name: 'Pilot',
      })
    ).body.episodeId;
    await arnav.call('POST', `/api/series/${s.body.seriesId}/invitations`, {
      email: priya.email,
      role: 'viewer',
    });
    await priya.call('POST', '/api/invitations/accept', { token: h.lastInviteToken(priya.email) });
  });
  afterAll(async () => {
    await h?.close();
  });

  it('records browser events with who and which episode, a send counting each scene', async () => {
    await h.admin.query('delete from usage_events');
    expect(
      (
        await arnav.call('POST', '/api/usage', {
          event: 'scene_sent',
          episodeId: episode,
          count: 3,
        })
      ).status,
    ).toBe(204);
    expect(
      (await priya.call('POST', '/api/usage', { event: 'pdf_exported', episodeId: episode }))
        .status,
    ).toBe(204);
    expect(await events()).toEqual([
      ['scene_sent', arnav.id, episode],
      ['scene_sent', arnav.id, episode],
      ['scene_sent', arnav.id, episode],
      ['pdf_exported', priya.id, episode],
    ]);
  });

  it('refuses events the server counts itself and outsiders; extra fields are dropped', async () => {
    await h.admin.query('delete from usage_events');
    const post = (p: Person, body: object) => p.call('POST', '/api/usage', body);
    expect((await post(arnav, { event: 'session_started', episodeId: episode })).status).toBe(400);
    expect((await post(stranger, { event: 'pdf_exported', episodeId: episode })).status).toBe(403);
    expect((await h.anonymous('POST', '/api/usage')).status).toBe(401);
    expect(await events()).toEqual([]);
    // Anything else in the body is stripped by the schema before the handler sees it.
    await post(arnav, { event: 'pdf_exported', episodeId: episode, text: 'INT. KITCHEN' });
    const { rows } = await h.admin.query<Record<string, unknown>>(`select * from usage_events`);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'episode_id',
      'event',
      'id',
      'occurred_at',
      'user_id',
    ]);
  });

  it('+ New what-if is counted by the API', async () => {
    await h.admin.query('delete from usage_events');
    await arnav.call('POST', `/api/episodes/${episode}/whatifs`, {
      state: Buffer.from('main').toString('base64'),
    });
    expect(await events()).toEqual([['whatif_created', arnav.id, episode]]);
  });

  it('accepts crash reports signed out, without touching the database', async () => {
    await h.admin.query('delete from usage_events');
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/client-errors',
      payload: { message: 'TypeError: x is undefined', stack: 'at f (app.js:1:2)', version: 'abc' },
    });
    expect(res.statusCode).toBe(204);
    const big = await h.app.inject({
      method: 'POST',
      url: '/api/client-errors',
      payload: { message: 'x'.repeat(5000) },
    });
    expect(big.statusCode).toBe(400);
    expect(await events()).toEqual([]);
  });
});
