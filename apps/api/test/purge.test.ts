// The 30-day purge (D-037, D-090) against a real Postgres, with the sync service's in-memory
// storage: a series, an episode and a what-if deleted over 30 days ago go for good, with their
// edit logs, snapshots, leases and restore points; anything deleted more recently, and
// everything live, is untouched; a dry run changes nothing.
import { purge } from '@wr/sync/purge';
import { memoryStorage } from '@wr/sync/memory';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiHarness, type Person } from './apiHarness';
import { servicesEnabled } from './testDb';

describe.skipIf(!servicesEnabled)('the 30-day purge', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  let arnav: Person;
  const storage = memoryStorage();
  const deleted: string[] = [];
  const ids = { oldSeries: '', oldEpisodes: [] as string[], recentEpisode: '', liveEpisode: '' };
  const drafts = { old: [] as string[], recent: '', liveMain: '', oldWhatIf: '', liveWhatIf: '' };

  const draftsOf = async (episode: string) =>
    (
      await h.admin.query<{ id: string; kind: string }>(
        `select id, kind from drafts where episode_id = $1 order by kind`,
        [episode],
      )
    ).rows;
  const touch = (draft: string) => {
    storage.log.entries.set(draft, new Map([[0, new Uint8Array([1])]]));
    storage.snapshots.snapshots.set(draft, { seq: 1, state: new Uint8Array([2]) });
    storage.leases.leases.set(draft, { owner: 'sync-1', epoch: 3, expiresAt: 0 });
  };
  const has = (draft: string) =>
    storage.log.entries.has(draft) ||
    storage.snapshots.snapshots.has(draft) ||
    storage.leases.leases.has(draft);
  const run = (dryRun = false) =>
    purge({
      db: h.db,
      storage,
      deleteBlob: (key) => {
        deleted.push(key);
        return Promise.resolve();
      },
      dryRun,
    });
  const ago = (table: string, id: string, days: number) =>
    h.admin.query(`update ${table} set deleted_at = now() - $2::interval where id = $1`, [
      id,
      `${days} days`,
    ]);

  beforeAll(async () => {
    h = await apiHarness();
    arnav = await h.person('Arnav');
    const old = await arnav.call<{ seriesId: string }>('POST', '/api/series', {
      kind: 'series',
      name: 'Old',
    });
    ids.oldSeries = old.body.seriesId;
    for (const name of ['One', 'Two'])
      ids.oldEpisodes.push(
        (
          await arnav.call<{ episodeId: string }>('POST', `/api/series/${ids.oldSeries}/episodes`, {
            name,
          })
        ).body.episodeId,
      );
    const live = await arnav.call<{ seriesId: string }>('POST', '/api/series', {
      kind: 'series',
      name: 'Live',
    });
    const episode = async (name: string) =>
      (
        await arnav.call<{ episodeId: string }>(
          'POST',
          `/api/series/${live.body.seriesId}/episodes`,
          {
            name,
          },
        )
      ).body.episodeId;
    ids.liveEpisode = await episode('Pilot');
    ids.recentEpisode = await episode('Cut');
    for (const e of ids.oldEpisodes) drafts.old.push(...(await draftsOf(e)).map((d) => d.id));
    drafts.recent = (await draftsOf(ids.recentEpisode))[0]!.id;
    drafts.liveMain = (await draftsOf(ids.liveEpisode))[0]!.id;
    // Two what-ifs of the live pilot (each with its base restore point); one is deleted.
    const state = Buffer.from('main').toString('base64');
    const wi = async () =>
      (
        await arnav.call<{ id: string }>('POST', `/api/episodes/${ids.liveEpisode}/whatifs`, {
          state,
        })
      ).body.id;
    drafts.oldWhatIf = await wi();
    drafts.liveWhatIf = await wi();
    // A snapshot taken inside the doomed what-if: its restore point goes with it.
    await arnav.call('POST', `/api/drafts/${drafts.oldWhatIf}/snapshots`, {
      state,
      reason: 'manual',
    });
    for (const d of [
      ...drafts.old,
      drafts.recent,
      drafts.liveMain,
      drafts.oldWhatIf,
      drafts.liveWhatIf,
    ])
      touch(d);

    // Delete through the API, then wind the clock back on three of them.
    expect((await arnav.call('DELETE', `/api/series/${ids.oldSeries}`)).status).toBe(200);
    expect((await arnav.call('DELETE', `/api/episodes/${ids.recentEpisode}`)).status).toBe(200);
    expect((await arnav.call('DELETE', `/api/drafts/${drafts.oldWhatIf}`)).status).toBe(200);
    await ago('series', ids.oldSeries, 31);
    await ago('drafts', drafts.oldWhatIf, 31);
    await ago('episodes', ids.recentEpisode, 29);
  });
  afterAll(async () => {
    await h?.close();
  });

  it('a dry run counts what is due and changes nothing', async () => {
    expect(await run(true)).toEqual({
      series: 1,
      episodes: 2,
      drafts: 3,
      restorePoints: 1,
      guests: 0,
    });
    expect(has(drafts.old[0]!)).toBe(true);
    expect(deleted).toEqual([]);
  });

  it('removes what was deleted over 30 days ago, with its storage and restore points', async () => {
    const points = (
      await h.admin.query<{ s3_key: string }>(`select s3_key from snapshots where draft_id = $1`, [
        drafts.oldWhatIf,
      ])
    ).rows.map((r) => r.s3_key);
    expect(await run()).toEqual({ series: 1, episodes: 2, drafts: 3, restorePoints: 1, guests: 0 });
    // Postgres: the old series, its episodes and drafts, and the old what-if are gone.
    const count = async (sql: string, args: unknown[]) =>
      Number((await h.admin.query<{ n: string }>(sql, args)).rows[0]!.n);
    expect(await count(`select count(*) n from series where id = $1`, [ids.oldSeries])).toBe(0);
    expect(
      await count(`select count(*) n from episodes where id = any($1::uuid[])`, [ids.oldEpisodes]),
    ).toBe(0);
    expect(
      await count(`select count(*) n from drafts where id = any($1::uuid[])`, [
        [...drafts.old, drafts.oldWhatIf],
      ]),
    ).toBe(0);
    // Storage and restore points went with them.
    for (const d of [...drafts.old, drafts.oldWhatIf]) expect(has(d)).toBe(false);
    expect(deleted.sort()).toEqual(points.sort());
    // Deleted 29 days ago: still under RECENTLY DELETED, untouched. Live drafts too.
    expect(await count(`select count(*) n from episodes where id = $1`, [ids.recentEpisode])).toBe(
      1,
    );
    for (const d of [drafts.recent, drafts.liveMain, drafts.liveWhatIf]) expect(has(d)).toBe(true);
    // The live what-if's base restore point (a snapshot of main) is still there.
    expect(
      await count(`select count(*) n from drafts where id = $1 and deleted_at is null`, [
        drafts.liveWhatIf,
      ]),
    ).toBe(1);
  });

  it('a second run finds nothing more to do', async () => {
    expect(await run()).toEqual({ series: 0, episodes: 0, drafts: 0, restorePoints: 0, guests: 0 });
  });
});

describe.skipIf(!servicesEnabled)('expired guests (D-108)', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  const storage = memoryStorage();
  const removed: string[] = [];
  beforeAll(async () => {
    h = await apiHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  /** A guest who has written a script; `ended` puts their day behind them. */
  async function guestWithScript(ended: boolean) {
    const res = await h.app.inject({ method: 'POST', url: '/api/auth/guest' });
    const g = res.json<{ accessToken: string; user: { id: string; email: string } }>();
    const script = await h.app.inject({
      method: 'POST',
      url: '/api/series',
      headers: { authorization: `Bearer ${g.accessToken}` },
      payload: { kind: 'script', name: 'The Avengers (excerpt)' },
    });
    const { seriesId, episodeId } = script.json<{ seriesId: string; episodeId: string }>();
    const { rows } = await h.admin.query<{ id: string }>(
      `select id from drafts where episode_id = $1`,
      [episodeId],
    );
    storage.log.entries.set(rows[0]!.id, new Map([[0, new Uint8Array([1])]]));
    if (ended)
      await h.admin.query(
        `update users set guest_until = now() - interval '1 minute' where id = $1`,
        [g.user.id],
      );
    return { ...g.user, seriesId, draft: rows[0]!.id };
  }

  it('removes an expired guest’s scripts at once, then the person and their Cognito user', async () => {
    const gone = await guestWithScript(true);
    const staying = await guestWithScript(false);
    const result = await purge({
      db: h.db,
      storage,
      deleteBlob: () => Promise.resolve(),
      deleteCognitoUser: (username) => {
        removed.push(username);
        return Promise.resolve();
      },
    });
    expect(result).toMatchObject({ series: 1, episodes: 1, drafts: 1, guests: 1 });
    const n = async (sql: string, id: string) => (await h.admin.query(sql, [id])).rowCount;
    expect(await n(`select 1 from series where id = $1`, gone.seriesId)).toBe(0);
    expect(await n(`select 1 from users where id = $1`, gone.id)).toBe(0);
    expect(storage.log.entries.has(gone.draft)).toBe(false);
    expect(removed).toEqual([gone.email]);
    // A guest still inside their day keeps everything.
    expect(await n(`select 1 from series where id = $1`, staying.seriesId)).toBe(1);
    expect(await n(`select 1 from users where id = $1`, staying.id)).toBe(1);
    expect(storage.log.entries.has(staying.draft)).toBe(true);
  });
});
