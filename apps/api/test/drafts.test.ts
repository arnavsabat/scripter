// What-ifs and snapshots (SPEC 3.6, 3.9, 5.2; D-080) against a real Postgres: forking from main,
// the Drafts tab's list, restore points grouped per what-if, and who may do what.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESTORE_POINT_WINDOW_MINUTES } from '../src/routes/drafts';
import { apiHarness, type Person } from './apiHarness';
import { servicesEnabled } from './testDb';

interface Draft {
  id: string;
  kind: 'main' | 'whatif';
  name: string;
  baseSnapshotId: string | null;
  createdBy: { id: string; name: string } | null;
  scenesDiffer: number;
}
interface Snapshot {
  id: string;
  kind: 'automatic' | 'manual';
  label: string;
  createdBy: { name: string } | null;
  fromDraftId: string | null;
}

const state = (text: string) => Buffer.from(text).toString('base64');

describe.skipIf(!servicesEnabled)('what-ifs and snapshots', () => {
  let h: Awaited<ReturnType<typeof apiHarness>>;
  let arnav: Person, maya: Person, priya: Person, stranger: Person;
  let episode: string;
  let main: Draft;

  const drafts = async (p: Person) =>
    (await p.call<{ drafts: Draft[] }>('GET', `/api/episodes/${episode}/drafts`)).body.drafts;
  const snapshots = async (p: Person, draft: string) =>
    (await p.call<{ snapshots: Snapshot[] }>('GET', `/api/drafts/${draft}/snapshots`)).body
      .snapshots;
  const bytes = async (p: Person, snapshot: string) => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/api/snapshots/${snapshot}/state`,
      headers: { authorization: `Bearer ${p.token}` },
    });
    return { status: res.statusCode, text: res.rawPayload.toString() };
  };

  beforeAll(async () => {
    h = await apiHarness();
    [arnav, maya, priya, stranger] = (await Promise.all(
      ['Arnav', 'Maya', 'Priya', 'Stranger'].map((n) => h.person(n)),
    )) as [Person, Person, Person, Person];
    const s = await arnav.call<{ seriesId: string }>('POST', '/api/series', {
      kind: 'series',
      name: 'Fogline',
    });
    episode = (
      await arnav.call<{ episodeId: string }>('POST', `/api/series/${s.body.seriesId}/episodes`, {
        name: 'Pilot',
      })
    ).body.episodeId;
    for (const [p, role] of [
      [maya, 'writer'],
      [priya, 'viewer'],
    ] as const) {
      await arnav.call('POST', `/api/series/${s.body.seriesId}/invitations`, {
        email: p.email,
        role,
      });
      await p.call('POST', '/api/invitations/accept', { token: h.lastInviteToken(p.email) });
    }
    await arnav.call('PUT', `/api/episodes/${episode}/writers/${maya.id}`);
    main = (await drafts(arnav))[0]!;
  });
  afterAll(async () => {
    await h?.close();
  });

  it('an episode starts with just main', async () => {
    expect((await drafts(maya)).map((d) => [d.kind, d.name])).toEqual([['main', 'Main']]);
    expect(main.baseSnapshotId).toBeNull();
  });

  it('+ New what-if: a snapshot of main as it was, and a what-if based on it', async () => {
    const r = await maya.call<Draft>('POST', `/api/episodes/${episode}/whatifs`, {
      name: 'Darker ending',
      state: state('main as of now'),
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      kind: 'whatif',
      name: 'Darker ending',
      createdBy: { name: 'Maya' },
    });
    expect((await drafts(priya)).map((d) => d.name)).toEqual(['Main', 'Darker ending']);
    // The base is a snapshot of main, listed in main's SNAPSHOTS, with the bytes the browser sent.
    const base = (await snapshots(maya, main.id))[0]!;
    expect(base).toMatchObject({
      id: r.body.baseSnapshotId,
      kind: 'automatic',
      label: 'When “Darker ending” began',
    });
    expect(await bytes(priya, base.id)).toEqual({ status: 200, text: 'main as of now' });
  });

  it('viewers and outsiders can’t fork; outsiders can’t even see', async () => {
    expect(
      (await priya.call('POST', `/api/episodes/${episode}/whatifs`, { state: state('x') })).status,
    ).toBe(403);
    expect((await stranger.call('GET', `/api/episodes/${episode}/drafts`)).status).toBe(403);
    const base = (await snapshots(maya, main.id))[0]!;
    expect((await bytes(stranger, base.id)).status).toBe(403);
  });

  it('restore points before sends: one per what-if within a few minutes', async () => {
    const wi = (await drafts(maya)).find((d) => d.kind === 'whatif')!;
    const first = await maya.call<{ snapshot: Snapshot; reused: boolean }>(
      'POST',
      `/api/drafts/${main.id}/snapshots`,
      {
        state: state('before send 1'),
        reason: 'send',
        fromDraftId: wi.id,
      },
    );
    expect(first.body).toMatchObject({
      reused: false,
      snapshot: {
        kind: 'automatic',
        label: 'Before sending from “Darker ending”',
        fromDraftId: wi.id,
      },
    });
    const second = await maya.call<{ snapshot: Snapshot; reused: boolean }>(
      'POST',
      `/api/drafts/${main.id}/snapshots`,
      {
        state: state('before send 2'),
        reason: 'send',
        fromDraftId: wi.id,
      },
    );
    expect(second.body.reused).toBe(true);
    expect(second.body.snapshot.id).toBe(first.body.snapshot.id);
    // Past the window, a new one.
    await h.admin.query(
      `update snapshots set created_at = now() - make_interval(mins => $2) where id = $1`,
      [first.body.snapshot.id, RESTORE_POINT_WINDOW_MINUTES + 1],
    );
    const third = await maya.call<{ reused: boolean }>('POST', `/api/drafts/${main.id}/snapshots`, {
      state: state('before send 3'),
      reason: 'send',
      fromDraftId: wi.id,
    });
    expect(third.body.reused).toBe(false);
  });

  it('+ Snapshot and the restore point before a restore', async () => {
    const manual = await maya.call<{ snapshot: Snapshot }>(
      'POST',
      `/api/drafts/${main.id}/snapshots`,
      {
        state: state('a moment worth keeping'),
        reason: 'manual',
      },
    );
    expect(manual.body.snapshot).toMatchObject({
      kind: 'manual',
      label: 'Snapshot',
      createdBy: { name: 'Maya' },
    });
    const before = await maya.call<{ snapshot: Snapshot }>(
      'POST',
      `/api/drafts/${main.id}/snapshots`,
      {
        state: state('just before'),
        reason: 'restore',
        restoringId: manual.body.snapshot.id,
      },
    );
    expect(before.body.snapshot.label).toBe('Before restoring “Snapshot”');
    expect((await snapshots(priya, main.id))[0]!.id).toBe(before.body.snapshot.id); // newest first
    expect(
      (
        await priya.call('POST', `/api/drafts/${main.id}/snapshots`, {
          state: state('x'),
          reason: 'manual',
        })
      ).status,
    ).toBe(403);
  });

  it('the what-if’s scene count, for the Drafts tab', async () => {
    const wi = (await drafts(maya)).find((d) => d.kind === 'whatif')!;
    expect((await maya.call('PATCH', `/api/drafts/${wi.id}`, { scenesDiffer: 3 })).status).toBe(
      200,
    );
    expect((await drafts(arnav)).find((d) => d.id === wi.id)!.scenesDiffer).toBe(3);
  });

  it('the sync service can open the what-if like any draft: access follows the episode', async () => {
    const wi = (await drafts(maya)).find((d) => d.kind === 'whatif')!;
    const { rows } = await h.admin.query<{ episode_id: string }>(
      `select episode_id from drafts where id = $1`,
      [wi.id],
    );
    expect(rows[0]!.episode_id).toBe(episode);
  });
});
