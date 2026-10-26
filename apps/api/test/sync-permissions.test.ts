// The phase's required permission tests, end to end (SPEC 5.3; D-031, D-046): roles set up
// through the real API on real Postgres, a real sync server reading access from that database
// (pgAccess) and listening for its NOTIFY, and writers signing in with test-key tokens.
import { tokenVerifier } from '@wr/auth';
import { SyncClient, type SocketLike } from '@wr/shared';
import { startSyncServer, type SyncServer } from '@wr/sync';
import { memoryStorage } from '@wr/sync/memory';
import { pgAccess } from '@wr/sync/pg-access';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { apiHarness, type Person } from './apiHarness';
import { servicesEnabled } from './testDb';

const until = async (check: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe.skipIf(!servicesEnabled)('permissions at the sync server', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  let sync: SyncServer;
  let access: ReturnType<typeof pgAccess>;
  let storage: ReturnType<typeof memoryStorage>;
  let arnav: Person, maya: Person, sam: Person, priya: Person;
  const draft: string[] = []; // the main drafts of Ep 1 (Maya's) and Ep 2 (nobody's)
  const ep: string[] = [];
  const clients: SyncClient[] = [];

  /** A writer's browser, in miniature: a Y.Doc kept in step by the real client. */
  function open(p: Person, docId: string) {
    const doc = new Y.Doc();
    const c = new SyncClient({
      serverUrl: `ws://127.0.0.1:${sync.port}`,
      docId,
      // A fresh token per connect, signed for this person's linked Cognito identity.
      token: async () =>
        h.issuer.sign(
          (
            await h.admin.query<{ cognito_sub: string }>(
              `select cognito_sub from user_identities where user_id = $1`,
              [p.id],
            )
          ).rows[0]!.cognito_sub,
        ),
      doc,
      backoff: { baseMs: 20, capMs: 200 },
      socket: (url) => new WebSocket(url) as unknown as SocketLike,
    });
    clients.push(c);
    const text = doc.getText('t');
    return { c, doc, text: () => text.toJSON(), type: (s: string) => text.insert(text.length, s) };
  }
  const stored = async (docId: string) => {
    const doc = new Y.Doc();
    for (const e of (await storage.log.readFrom(docId, 0)).entries) Y.applyUpdate(doc, e.update);
    return doc.getText('t').toJSON();
  };

  beforeAll(async () => {
    h = await apiHarness();
    const people: Person[] = [];
    for (const n of ['Arnav', 'Maya', 'Sam', 'Priya']) people.push(await h.person(n));
    [arnav, maya, sam, priya] = people as [Person, Person, Person, Person];
    const s = (await arnav.call<{ seriesId: string }>('POST', '/api/series', { kind: 'series' }))
      .body.seriesId;
    for (const name of ['Pilot', 'Undertow'])
      ep.push(
        (await arnav.call<{ episodeId: string }>('POST', `/api/series/${s}/episodes`, { name }))
          .body.episodeId,
      );
    for (const [p, role] of [
      [maya, 'writer'],
      [sam, 'writer'],
      [priya, 'viewer'],
    ] as const) {
      await arnav.call('POST', `/api/series/${s}/invitations`, { email: p.email, role });
      await p.call('POST', '/api/invitations/accept', { token: h.lastInviteToken(p.email) });
    }
    await arnav.call('PUT', `/api/episodes/${ep[0]}/writers/${maya.id}`);
    for (const id of ep)
      draft.push(
        (await arnav.call<{ draftId: string }>('GET', `/api/episodes/${id}`)).body.draftId,
      );

    storage = memoryStorage();
    access = pgAccess((h.db.options as { connectionString: string }).connectionString, {
      info: () => {},
      error: () => {},
    });
    sync = await startSyncServer({
      port: 0,
      storage,
      verify: tokenVerifier([h.issuer.trusted]),
      access,
      clusterSecret: 'test-cluster-secret',
      leaseTtlMs: 1000,
      renewEveryMs: 330,
      heartbeatMs: 330,
      deadAfterMs: 1000,
    });
    await new Promise((r) => setTimeout(r, 300)); // let the NOTIFY listener connect
  });
  afterAll(async () => {
    for (const c of clients) c.destroy();
    await sync?.kill();
    await access?.close();
    await h?.close();
  });

  it('a writer can’t edit an episode they aren’t assigned to', async () => {
    const m = open(maya, draft[1]!); // Ep 2: Maya is a writer in the series, but not on this episode
    await m.c.whenSynced(); // she may read it
    m.type('Not my episode');
    await until(() => m.c.fatal !== null);
    expect(m.c.fatal).toBe('forbidden');
    expect(await stored(draft[1]!)).toBe('');
  });

  it('a viewer’s updates are rejected, while they still see everyone else’s', async () => {
    const m = open(maya, draft[0]!);
    const p = open(priya, draft[0]!);
    await Promise.all([m.c.whenSynced(), p.c.whenSynced()]);
    m.type('INT. KITCHEN – NIGHT');
    await until(() => p.text() === 'INT. KITCHEN – NIGHT');
    p.type(' (viewer was here)');
    await until(() => p.c.fatal !== null);
    expect(p.c.fatal).toBe('forbidden');
    await m.c.whenSynced();
    expect(await stored(draft[0]!)).toBe('INT. KITCHEN – NIGHT');
    m.c.destroy();
  });

  it('a co-writer gets edit rights the moment a writer adds them', async () => {
    // Maya adds Sam as co-writer on her episode, through the API.
    expect((await maya.call('PUT', `/api/episodes/${ep[0]}/writers/${sam.id}`)).status).toBe(200);
    const s = open(sam, draft[0]!);
    await s.c.whenSynced();
    s.type(' Rain hammers the window.');
    await s.c.whenSynced(); // acknowledged, so durable
    expect(s.c.fatal).toBeNull();
    expect(await stored(draft[0]!)).toContain('Rain hammers the window.');
  });

  it('removing a co-writer cuts them off within a second, without them reconnecting', async () => {
    const s = open(sam, draft[0]!);
    await s.c.whenSynced();
    const started = Date.now();
    expect((await arnav.call('DELETE', `/api/episodes/${ep[0]}/writers/${sam.id}`)).status).toBe(
      200,
    );
    await until(() => s.c.fatal !== null, 3000);
    expect(s.c.fatal).toBe('forbidden');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('deleting the episode moves everyone in it out with 4410', async () => {
    const m = open(maya, draft[0]!);
    await m.c.whenSynced();
    expect((await arnav.call('DELETE', `/api/episodes/${ep[0]}`)).status).toBe(200);
    await until(() => m.c.fatal !== null, 3000);
    expect(m.c.fatal).toBe('deleted');
    await arnav.call('POST', `/api/episodes/${ep[0]}/restore`);
  });

  it('Home’s green dot shows who is connected, from the sync server’s writes', async () => {
    const m = open(maya, draft[0]!);
    await m.c.whenSynced();
    await new Promise((r) => setTimeout(r, 200));
    const home = (
      await arnav.call<{ series: { episodes: { id: string; live: { name: string }[] }[] }[] }>(
        'GET',
        '/api/home',
      )
    ).body;
    const live = home.series[0]!.episodes.find((e) => e.id === ep[0])!.live.map((p) => p.name);
    expect(live).toEqual(['Maya']);
  });
});
