// The API against a real Postgres, signed in with the test key: who can do what (SPEC 5.3),
// invitations (D-032), deleting and restoring (D-037), and the NOTIFY the sync servers listen for (D-031).
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiHarness, type Person } from './apiHarness';
import { servicesEnabled } from './testDb';

interface Episode {
  id: string;
  name: string;
  number: number;
  canEdit: boolean;
  writers: { id: string; name: string }[];
  live: { id: string; name: string }[];
}
interface Series {
  id: string;
  name: string;
  isSeries: boolean;
  role: string;
  canEdit: boolean;
  episodes: Episode[];
}
interface Home {
  series: Series[];
  recent: string[];
  invitations: { id: string; seriesId: string; seriesName: string; from: string; role: string }[];
  trash: { kind: string; id: string; name: string; number?: number; episodes?: number }[];
}

describe.skipIf(!servicesEnabled)('API', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  let arnav: Person, maya: Person, sam: Person, priya: Person, stranger: Person;
  let roomId: string;
  let ep: string[]; // Pilot, Undertow, The Long Night

  const home = async (p: Person) => (await p.call<Home>('GET', '/api/home')).body;
  const series = async (p: Person, id: string) => (await home(p)).series.find((s) => s.id === id);

  beforeAll(async () => {
    h = await apiHarness();
    const people: Person[] = [];
    for (const n of ['Arnav', 'Maya', 'Sam', 'Priya', 'Stranger']) people.push(await h.person(n));
    [arnav, maya, sam, priya, stranger] = people as [Person, Person, Person, Person, Person];
    // Arnav sets up "The Long Night" with three episodes and invites the room.
    const created = await arnav.call<{ seriesId: string }>('POST', '/api/series', {
      kind: 'series',
      name: 'The Long Night',
    });
    roomId = created.body.seriesId;
    ep = [];
    for (const name of ['Pilot', 'Undertow', 'The Long Night'])
      ep.push(
        (
          await arnav.call<{ episodeId: string }>('POST', `/api/series/${roomId}/episodes`, {
            name,
          })
        ).body.episodeId,
      );
    for (const [p, role] of [
      [maya, 'writer'],
      [sam, 'writer'],
      [priya, 'viewer'],
    ] as const) {
      await arnav.call('POST', `/api/series/${roomId}/invitations`, { email: p.email, role });
      expect(
        (await p.call('POST', '/api/invitations/accept', { token: h.lastInviteToken(p.email) }))
          .status,
      ).toBe(200);
    }
    // Maya writes Ep 1, Sam writes Ep 2; Ep 3 is theirs together.
    await arnav.call('PUT', `/api/episodes/${ep[0]}/writers/${maya.id}`);
    await arnav.call('PUT', `/api/episodes/${ep[1]}/writers/${sam.id}`);
    await arnav.call('PUT', `/api/episodes/${ep[2]}/writers/${maya.id}`);
    await maya.call('PUT', `/api/episodes/${ep[2]}/writers/${sam.id}`); // a writer adds a co-writer
  });
  afterAll(async () => {
    await h?.close();
  });

  describe('signing in', () => {
    it('refuses requests without a token, with a bad token, or for an unlinked identity', async () => {
      expect((await h.anonymous('GET', '/api/home')).status).toBe(401);
      expect((await h.withToken('nonsense', 'GET', '/api/home')).status).toBe(401);
      const unlinked = await h.issuer.sign('a-cognito-user-we-never-linked');
      expect((await h.withToken(unlinked, 'GET', '/api/home')).status).toBe(401);
      expect((await h.anonymous('GET', '/api/health')).status).toBe(200);
    });
    it('knows who you are', async () => {
      const me = await maya.call<{ name: string }>('GET', '/api/me');
      expect(me.body.name).toBe('Maya');
    });
  });

  describe('scripts and series (D-033, D-037)', () => {
    it('+ New script makes a plain script: one episode, its creator showrunner and writer', async () => {
      const { body } = await sam.call<{ seriesId: string; episodeId: string }>(
        'POST',
        '/api/series',
        {
          kind: 'script',
        },
      );
      const s = await series(sam, body.seriesId);
      expect(s).toMatchObject({ name: 'Untitled script', isSeries: false, role: 'showrunner' });
      expect(s!.episodes).toHaveLength(1);
      expect(s!.episodes[0]).toMatchObject({ id: body.episodeId, canEdit: true });
      expect(s!.episodes[0]!.writers.map((w) => w.name)).toEqual(['Sam']);
      // Renaming the episode renames the script (they share one name until it's a series).
      await sam.call('PATCH', `/api/episodes/${body.episodeId}`, { name: 'Night Bus' });
      expect((await series(sam, body.seriesId))!.name).toBe('Night Bus');
      // A second episode turns it into a series for good.
      await sam.call('POST', `/api/series/${body.seriesId}/episodes`, {});
      const after = await series(sam, body.seriesId);
      expect(after!.isSeries).toBe(true);
      expect(after!.episodes.map((e) => [e.number, e.name])).toEqual([
        [1, 'Night Bus'],
        [2, 'Untitled'],
      ]);
    });
    it('+ New series starts empty, and nobody else can see it', async () => {
      const { body } = await priya.call<{ seriesId: string }>('POST', '/api/series', {
        kind: 'series',
      });
      expect(await series(priya, body.seriesId)).toMatchObject({
        name: 'Untitled series',
        isSeries: true,
        episodes: [],
        role: 'showrunner',
      });
      expect(await series(maya, body.seriesId)).toBeUndefined();
      expect((await maya.call('GET', `/api/series/${body.seriesId}/members`)).status).toBe(404);
    });
  });

  describe('who can do what (SPEC 5.3)', () => {
    it('the showrunner can edit every episode; writers only their own; the viewer none', async () => {
      const edits = async (p: Person) => (await series(p, roomId))!.episodes.map((e) => e.canEdit);
      expect(await edits(arnav)).toEqual([true, true, true]);
      expect(await edits(maya)).toEqual([true, false, true]);
      expect(await edits(sam)).toEqual([false, true, true]);
      expect(await edits(priya)).toEqual([false, false, false]);
    });
    it('opening an episode says whether you may edit it, and non-members are told to ask', async () => {
      const opened = await sam.call<{ canEdit: boolean; draftId: string; number: number }>(
        'GET',
        `/api/episodes/${ep[0]}`,
      );
      expect(opened.status).toBe(200);
      expect(opened.body).toMatchObject({ canEdit: false, number: 1 });
      expect(opened.body.draftId).toMatch(/^[0-9a-f-]{36}$/);
      const outsider = await stranger.call<{ error: string; message: string }>(
        'GET',
        `/api/episodes/${ep[0]}`,
      );
      expect(outsider.status).toBe(403);
      expect(outsider.body.message).toMatch(/Ask the showrunner/);
    });
    it('writers can rename their own episode but not someone else’s, nor the series', async () => {
      expect((await maya.call('PATCH', `/api/episodes/${ep[0]}`, { name: 'Pilot' })).status).toBe(
        200,
      );
      expect(
        (await maya.call('PATCH', `/api/episodes/${ep[1]}`, { name: 'Mine now' })).status,
      ).toBe(403);
      expect((await maya.call('PATCH', `/api/series/${roomId}`, { name: 'Mine' })).status).toBe(
        403,
      );
      expect((await priya.call('PATCH', `/api/episodes/${ep[0]}`, { name: 'x' })).status).toBe(403);
    });
    it('only the showrunner creates or deletes episodes and invites people', async () => {
      expect((await maya.call('POST', `/api/series/${roomId}/episodes`, {})).status).toBe(403);
      expect((await maya.call('DELETE', `/api/episodes/${ep[1]}`)).status).toBe(403);
      expect(
        (
          await maya.call('POST', `/api/series/${roomId}/invitations`, {
            email: 'x@example.com',
            role: 'writer',
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('co-writers (D-032)', () => {
    it('a writer adds a co-writer to their own episode, not to someone else’s', async () => {
      expect((await sam.call('PUT', `/api/episodes/${ep[0]}/writers/${sam.id}`)).status).toBe(403);
      expect((await sam.call('PUT', `/api/episodes/${ep[1]}/writers/${maya.id}`)).status).toBe(200);
      // Arnav is listed too: whoever creates an episode is assigned to it (D-034).
      expect((await series(arnav, roomId))!.episodes[1]!.writers.map((w) => w.name)).toEqual([
        'Arnav',
        'Sam',
        'Maya',
      ]);
      expect((await maya.call('GET', `/api/episodes/${ep[1]}`)).body).toMatchObject({
        canEdit: true,
      });
      // …and removes them again
      expect((await sam.call('DELETE', `/api/episodes/${ep[1]}/writers/${maya.id}`)).status).toBe(
        200,
      );
      expect((await maya.call('GET', `/api/episodes/${ep[1]}`)).body).toMatchObject({
        canEdit: false,
      });
    });
    it('viewers can’t be co-writers until the showrunner makes them writers', async () => {
      const r = await arnav.call<{ error: string }>(
        'PUT',
        `/api/episodes/${ep[0]}/writers/${priya.id}`,
      );
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('not_a_writer');
    });
  });

  describe('roles and members', () => {
    it('Members shows everyone with their episodes, to every member', async () => {
      const { body, status } = await priya.call<{
        members: { name: string; role: string; episodes: string[] }[];
      }>('GET', `/api/series/${roomId}/members`);
      expect(status).toBe(200);
      const maya_ = body.members.find((m) => m.name === 'Maya')!;
      expect(maya_.role).toBe('writer');
      expect(maya_.episodes).toEqual([ep[0], ep[2]]);
    });
    it('making a writer a viewer takes away their episodes', async () => {
      const temp = await h.person('Temp');
      await arnav.call('POST', `/api/series/${roomId}/invitations`, {
        email: temp.email,
        role: 'writer',
      });
      await temp.call('POST', '/api/invitations/accept', { token: h.lastInviteToken(temp.email) });
      await arnav.call('PUT', `/api/episodes/${ep[0]}/writers/${temp.id}`);
      expect((await temp.call('GET', `/api/episodes/${ep[0]}`)).body).toMatchObject({
        canEdit: true,
      });
      await arnav.call('PATCH', `/api/series/${roomId}/members/${temp.id}`, { role: 'viewer' });
      expect((await temp.call('GET', `/api/episodes/${ep[0]}`)).body).toMatchObject({
        canEdit: false,
      });
      // Removing someone ends their access entirely.
      await arnav.call('DELETE', `/api/series/${roomId}/members/${temp.id}`);
      expect((await temp.call('GET', `/api/episodes/${ep[0]}`)).status).toBe(403);
    });
    it('a series always keeps a showrunner', async () => {
      const r = await arnav.call<{ error: string; message: string }>(
        'PATCH',
        `/api/series/${roomId}/members/${arnav.id}`,
        { role: 'writer' },
      );
      expect(r.status).toBe(409);
      expect(r.body.message).toBe('Make someone else showrunner first.');
      expect((await arnav.call('DELETE', `/api/series/${roomId}/members/${arnav.id}`)).status).toBe(
        409,
      );
    });
  });

  describe('invitations (D-032)', () => {
    it('a link works once, for whoever signs in with it, and puts them in the invited role', async () => {
      await arnav.call('POST', `/api/series/${roomId}/invitations`, {
        email: 'lee@school.example',
        role: 'writer',
        episodeId: ep[1],
      });
      const token = h.lastInviteToken('lee@school.example');
      const mail = h.mailer.sent.at(-1)!;
      expect(mail.subject).toBe('Arnav invited you to The Long Night');
      expect(mail.text).toContain('Arnav invited you to write on The Long Night in Writers’ Room.');
      // Lee signs in with a personal address instead: the link still works (one-time, not tied to email).
      const lee = await h.person('Lee', 'lee.personal@example.com');
      const accepted = await lee.call<{ role: string }>('POST', '/api/invitations/accept', {
        token,
      });
      expect(accepted.status).toBe(200);
      expect(accepted.body.role).toBe('writer');
      // The showrunner's invite from an episode also assigned it.
      expect((await lee.call('GET', `/api/episodes/${ep[1]}`)).body).toMatchObject({
        canEdit: true,
      });
      // Used up.
      const again = await stranger.call<{ error: string }>('POST', '/api/invitations/accept', {
        token,
      });
      expect(again.status).toBe(410);
    });
    it('a cancelled or expired link stops working; an unknown one is refused', async () => {
      const inv = await arnav.call<{ id: string }>('POST', `/api/series/${roomId}/invitations`, {
        email: 'kai@example.com',
        role: 'viewer',
      });
      const token = h.lastInviteToken('kai@example.com');
      await arnav.call('DELETE', `/api/invitations/${inv.body.id}`);
      expect((await stranger.call('POST', '/api/invitations/accept', { token })).status).toBe(410);
      await arnav.call('POST', `/api/series/${roomId}/invitations`, {
        email: 'kai@example.com',
        role: 'viewer',
      });
      const fresh = h.lastInviteToken('kai@example.com');
      await h.admin.query(
        `update invitations set expires_at = now() - interval '1 second' where email = 'kai@example.com'`,
      );
      expect(
        (await stranger.call('POST', '/api/invitations/accept', { token: fresh })).status,
      ).toBe(410);
      expect(
        (await stranger.call('POST', '/api/invitations/accept', { token: 'x'.repeat(43) })).status,
      ).toBe(404);
    });
    it('pending invitations appear under INVITATIONS for the invited address, with Accept', async () => {
      const noor = await h.person('Noor');
      await arnav.call('POST', `/api/series/${roomId}/invitations`, {
        email: noor.email,
        role: 'viewer',
      });
      const inv = (await home(noor)).invitations;
      expect(inv).toEqual([
        expect.objectContaining({ seriesName: 'The Long Night', from: 'Arnav', role: 'viewer' }),
      ]);
      expect((await stranger.call('POST', `/api/invitations/${inv[0]!.id}/accept`)).status).toBe(
        404,
      );
      expect((await noor.call('POST', `/api/invitations/${inv[0]!.id}/accept`)).status).toBe(200);
      expect((await home(noor)).invitations).toEqual([]);
      expect((await series(noor, roomId))!.role).toBe('viewer');
    });
    it('inviting someone already in the series is refused', async () => {
      const r = await arnav.call('POST', `/api/series/${roomId}/invitations`, {
        email: 'MAYA@example.com',
        role: 'viewer',
      });
      expect(r.status).toBe(409);
    });
  });

  describe('deleting and restoring (D-037)', () => {
    it('a deleted episode disappears for everyone, waits in the showrunner’s trash, and returns to its place', async () => {
      expect((await arnav.call('DELETE', `/api/episodes/${ep[1]}`)).status).toBe(200);
      expect((await series(maya, roomId))!.episodes.map((e) => [e.number, e.name])).toEqual([
        [1, 'Pilot'],
        [2, 'The Long Night'],
      ]);
      expect((await maya.call('GET', `/api/episodes/${ep[1]}`)).status).toBe(404);
      expect((await home(arnav)).trash).toEqual([
        expect.objectContaining({ kind: 'episode', id: ep[1], name: 'Undertow', number: 2 }),
      ]);
      expect((await home(maya)).trash).toEqual([]); // writers have nothing to restore
      expect((await maya.call('POST', `/api/episodes/${ep[1]}/restore`)).status).toBe(403);
      expect((await arnav.call('POST', `/api/episodes/${ep[1]}/restore`)).status).toBe(200);
      expect((await series(maya, roomId))!.episodes.map((e) => e.name)).toEqual([
        'Pilot',
        'Undertow',
        'The Long Night',
      ]);
    });
    it('a deleted series disappears from every member’s home until restored', async () => {
      const { body } = await maya.call<{ seriesId: string }>('POST', '/api/series', {
        kind: 'series',
        name: 'Saltwater',
      });
      await maya.call('POST', `/api/series/${body.seriesId}/episodes`, {});
      expect((await maya.call('DELETE', `/api/series/${body.seriesId}`)).status).toBe(200);
      expect(await series(maya, body.seriesId)).toBeUndefined();
      expect((await home(maya)).trash).toEqual([
        expect.objectContaining({ kind: 'series', name: 'Saltwater', episodes: 1 }),
      ]);
      await maya.call('POST', `/api/series/${body.seriesId}/restore`);
      expect((await series(maya, body.seriesId))!.episodes).toHaveLength(1);
    });
    it('deleting a plain script’s episode deletes the script', async () => {
      const { body } = await priya.call<{ seriesId: string; episodeId: string }>(
        'POST',
        '/api/series',
        {
          kind: 'script',
        },
      );
      const r = await priya.call<{ deleted: string }>('DELETE', `/api/episodes/${body.episodeId}`);
      expect(r.body.deleted).toBe('script');
      expect(await series(priya, body.seriesId)).toBeUndefined();
    });
  });

  describe('RECENT (D-042)', () => {
    it('lists the last three episodes you opened, newest first, on any device', async () => {
      for (const id of [ep[0], ep[1], ep[2], ep[0]]) await sam.call('GET', `/api/episodes/${id}`);
      expect((await home(sam)).recent).toEqual([ep[0], ep[2], ep[1]]);
    });
  });

  describe('live status (D-033)', () => {
    it('shows who is connected right now, and forgets them after 30 s', async () => {
      await h.admin.query(
        `insert into episode_presence (episode_id, user_id, server_id) values ($1, $2, 'sync-1'), ($1, $3, 'sync-1')`,
        [ep[2], maya.id, sam.id],
      );
      const live = (await series(arnav, roomId))!.episodes[2]!.live.map((p) => p.name).sort();
      expect(live).toEqual(['Maya', 'Sam']);
      await h.admin.query(`update episode_presence set seen_at = now() - interval '31 seconds'`);
      expect((await series(arnav, roomId))!.episodes[2]!.live).toEqual([]);
    });
  });

  describe('change alerts for the sync servers (D-031)', () => {
    it('notifies wr_access when access changes, and only once the change commits', async () => {
      const listener = new pg.Client({
        connectionString: (h.db.options as { connectionString: string }).connectionString,
      });
      await listener.connect();
      const got: string[] = [];
      listener.on('notification', (n) => got.push(n.payload ?? ''));
      await listener.query('listen wr_access');
      await arnav.call('DELETE', `/api/episodes/${ep[2]}/writers/${sam.id}`);
      await arnav.call('PATCH', `/api/episodes/${ep[0]}`, { name: 'Pilot' }); // renaming isn't an access change
      // A refused change sends nothing.
      await maya.call('PATCH', `/api/series/${roomId}/members/${sam.id}`, { role: 'viewer' });
      await new Promise((r) => setTimeout(r, 200));
      await listener.end();
      expect(got.map((p) => JSON.parse(p) as unknown)).toEqual([
        { series: roomId, episode: ep[2] },
      ]);
    });
  });
});
