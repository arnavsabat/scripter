// What-ifs and snapshots (SPEC 3.6, 3.9, 5.2; D-080). A what-if is a draft forked from a snapshot
// of main (main only, never another what-if); a snapshot is a draft's Yjs state, kept as a blob
// and listed in the Drafts tab. The scripts themselves stay on the sync service: the browser sends
// the state it has open when it forks or takes a snapshot.
import { canMerge } from '@wr/shared';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { episodeFor, type Q } from '../access';
import type { AppDeps } from '../app';
import { withTx } from '../db/tx';
import { ApiError, forbidden, notFound } from '../errors';

/** Sends from one what-if within this many minutes share one restore point (D-080, proposed). */
export const RESTORE_POINT_WINDOW_MINUTES = 5;
/** A 110-page script's state is well under 1 MB; this leaves room. */
const MAX_STATE_BYTES = 8 * 1024 * 1024;

const uuid = { type: 'string', format: 'uuid' } as const;
const idParams = { type: 'object', required: ['id'], properties: { id: uuid } } as const;
const name = { type: 'string', minLength: 1, maxLength: 120 } as const;
const state = {
  type: 'string',
  minLength: 1,
  maxLength: Math.ceil(MAX_STATE_BYTES / 3) * 4,
} as const;

interface DraftRow {
  id: string;
  episode_id: string;
  kind: 'main' | 'whatif';
  name: string | null;
  base_snapshot_id: string | null;
  created_by: string | null;
  creator_name: string | null;
  created_at: Date;
  scenes_differ: number;
}

const draftJson = (d: DraftRow) => ({
  id: d.id,
  kind: d.kind,
  name: d.kind === 'main' ? 'Main' : (d.name ?? 'Untitled what-if'),
  baseSnapshotId: d.base_snapshot_id,
  createdBy: d.created_by ? { id: d.created_by, name: d.creator_name ?? '' } : null,
  createdAt: d.created_at.toISOString(),
  scenesDiffer: d.scenes_differ,
});

interface SnapshotRow {
  id: string;
  draft_id: string;
  kind: 'automatic' | 'manual';
  label: string | null;
  created_by: string | null;
  creator_name: string | null;
  created_at: Date;
  from_draft_id: string | null;
}

const snapshotJson = (s: SnapshotRow) => ({
  id: s.id,
  draftId: s.draft_id,
  kind: s.kind,
  label: s.label ?? 'Snapshot',
  createdBy: s.created_by ? { id: s.created_by, name: s.creator_name ?? '' } : null,
  createdAt: s.created_at.toISOString(),
  fromDraftId: s.from_draft_id,
});

const DRAFT_COLUMNS = `d.id, d.episode_id, d.kind, d.name, d.base_snapshot_id, d.created_by,
  u.name as creator_name, d.created_at, d.scenes_differ`;
const SNAPSHOT_COLUMNS = `s.id, s.draft_id, s.kind, s.label, s.created_by, u.name as creator_name,
  s.created_at, s.from_draft_id`;

/** A live draft, with the caller's access to its episode (every draft route starts here). */
async function draftFor(q: Q, userId: string, draftId: string, need: 'view' | 'edit') {
  const { rows } = await q.query<DraftRow>(
    `select ${DRAFT_COLUMNS} from drafts d left join users u on u.id = d.created_by
      where d.id = $1 and d.deleted_at is null`,
    [draftId],
  );
  const draft = rows[0];
  if (!draft) throw notFound('That draft');
  const { episode, access, scope } = await episodeFor(q, userId, draft.episode_id, 'view');
  if (need === 'edit' && !canMerge(access, scope))
    throw forbidden('You can’t change this episode. Ask the showrunner to add you as a writer.');
  return { draft, episode };
}

function decodeState(base64: string): Uint8Array {
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_STATE_BYTES)
    throw new ApiError(400, 'bad_state', 'That snapshot is empty or too large.');
  return new Uint8Array(bytes);
}

const blobKey = (snapshotId: string) => `restore-points/${snapshotId}`;

export function draftRoutes(app: FastifyInstance, { db, blobs }: AppDeps): void {
  const big = { bodyLimit: MAX_STATE_BYTES * 2 };

  // The Drafts tab: main first, then the what-ifs, oldest first.
  app.get<{ Params: { id: string } }>(
    '/api/episodes/:id/drafts',
    { schema: { params: idParams } },
    async (req) => {
      const { episode } = await episodeFor(db, req.user.id, req.params.id, 'view');
      const { rows } = await db.query<DraftRow>(
        `select ${DRAFT_COLUMNS} from drafts d left join users u on u.id = d.created_by
          where d.episode_id = $1 and d.deleted_at is null
          order by d.kind = 'main' desc, d.created_at`,
        [episode.id],
      );
      return { drafts: rows.map(draftJson) };
    },
  );

  // + New what-if: a snapshot of main as it is now (the browser sends it), then the what-if.
  app.post<{ Params: { id: string }; Body: { name?: string; state: string } }>(
    '/api/episodes/:id/whatifs',
    {
      ...big,
      schema: {
        params: idParams,
        body: { type: 'object', required: ['state'], properties: { name, state } },
      },
    },
    async (req) => {
      const { episode, access, scope } = await episodeFor(db, req.user.id, req.params.id, 'view');
      if (!canMerge(access, scope))
        throw forbidden('Only the episode’s writers and the showrunner can start a what-if.');
      const bytes = decodeState(req.body.state);
      const whatIfName = req.body.name?.trim() || 'Untitled what-if';
      const snapshotId = randomUUID();
      await blobs.put(blobKey(snapshotId), bytes);
      const id = await withTx(db, async (c) => {
        const main = await c.query<{ id: string }>(
          `select id from drafts where episode_id = $1 and kind = 'main' and deleted_at is null`,
          [episode.id],
        );
        if (!main.rows[0]) throw notFound('That episode’s main draft');
        await c.query(
          `insert into snapshots (id, draft_id, s3_key, kind, label, created_by)
           values ($1, $2, $3, 'automatic', $4, $5)`,
          [
            snapshotId,
            main.rows[0].id,
            blobKey(snapshotId),
            `When “${whatIfName}” began`,
            req.user.id,
          ],
        );
        const r = await c.query<{ id: string }>(
          `insert into drafts (episode_id, kind, name, base_snapshot_id, created_by)
           values ($1, 'whatif', $2, $3, $4) returning id`,
          [episode.id, whatIfName, snapshotId, req.user.id],
        );
        return r.rows[0]!.id;
      });
      const { draft } = await draftFor(db, req.user.id, id, 'view');
      return draftJson(draft);
    },
  );

  // The what-if's "N scenes differ", counted by whoever has it open.
  app.patch<{ Params: { id: string }; Body: { scenesDiffer: number } }>(
    '/api/drafts/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['scenesDiffer'],
          properties: { scenesDiffer: { type: 'integer', minimum: 0, maximum: 100_000 } },
        },
      },
    },
    async (req) => {
      const { draft } = await draftFor(db, req.user.id, req.params.id, 'view');
      if (draft.kind !== 'whatif') return { ok: true };
      await db.query(`update drafts set scenes_differ = $2 where id = $1`, [
        draft.id,
        req.body.scenesDiffer,
      ]);
      return { ok: true };
    },
  );

  // SNAPSHOTS in the Drafts tab: this draft's, newest first.
  app.get<{ Params: { id: string } }>(
    '/api/drafts/:id/snapshots',
    { schema: { params: idParams } },
    async (req) => {
      const { draft } = await draftFor(db, req.user.id, req.params.id, 'view');
      const { rows } = await db.query<SnapshotRow>(
        `select ${SNAPSHOT_COLUMNS} from snapshots s left join users u on u.id = s.created_by
          where s.draft_id = $1 order by s.created_at desc`,
        [draft.id],
      );
      return { snapshots: rows.map(snapshotJson) };
    },
  );

  // + Snapshot, and the automatic restore points before a send or a restore (SPEC 3.9).
  app.post<{
    Params: { id: string };
    Body: {
      state: string;
      reason: 'manual' | 'send' | 'restore';
      fromDraftId?: string;
      restoringId?: string;
    };
  }>(
    '/api/drafts/:id/snapshots',
    {
      ...big,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['state', 'reason'],
          properties: {
            state,
            reason: { enum: ['manual', 'send', 'restore'] },
            fromDraftId: uuid,
            restoringId: uuid,
          },
        },
      },
    },
    async (req) => {
      const { draft } = await draftFor(db, req.user.id, req.params.id, 'edit');
      const { reason } = req.body;
      let label = 'Snapshot';
      let from: string | null = null;
      if (reason === 'send') {
        if (!req.body.fromDraftId)
          throw new ApiError(400, 'bad_request', 'Which what-if is sending?');
        const source = await draftFor(db, req.user.id, req.body.fromDraftId, 'view');
        if (source.draft.episode_id !== draft.episode_id || source.draft.kind !== 'whatif')
          throw new ApiError(400, 'bad_request', 'That what-if belongs to another episode.');
        from = source.draft.id;
        label = `Before sending from “${source.draft.name ?? 'Untitled what-if'}”`;
        // Sends from one what-if within a few minutes share one restore point.
        const recent = await db.query<SnapshotRow>(
          `select ${SNAPSHOT_COLUMNS} from snapshots s left join users u on u.id = s.created_by
            where s.draft_id = $1 and s.from_draft_id = $2 and s.kind = 'automatic'
              and s.created_at > now() - make_interval(mins => $3)
            order by s.created_at desc limit 1`,
          [draft.id, from, RESTORE_POINT_WINDOW_MINUTES],
        );
        if (recent.rows[0]) return { snapshot: snapshotJson(recent.rows[0]), reused: true };
      } else if (reason === 'restore') {
        const r = await db.query<{ label: string | null }>(
          `select label from snapshots where id = $1 and draft_id = $2`,
          [req.body.restoringId ?? null, draft.id],
        );
        label = `Before restoring “${r.rows[0]?.label ?? 'a snapshot'}”`;
      }
      const bytes = decodeState(req.body.state);
      const id = randomUUID();
      await blobs.put(blobKey(id), bytes);
      await db.query(
        `insert into snapshots (id, draft_id, s3_key, kind, label, created_by, from_draft_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          draft.id,
          blobKey(id),
          reason === 'manual' ? 'manual' : 'automatic',
          label,
          req.user.id,
          from,
        ],
      );
      const { rows } = await db.query<SnapshotRow>(
        `select ${SNAPSHOT_COLUMNS} from snapshots s left join users u on u.id = s.created_by where s.id = $1`,
        [id],
      );
      return { snapshot: snapshotJson(rows[0]!), reused: false };
    },
  );

  // A snapshot's state: for restoring it, and a what-if's base for the comparison.
  app.get<{ Params: { id: string } }>(
    '/api/snapshots/:id/state',
    { schema: { params: idParams } },
    async (req, reply) => {
      const { rows } = await db.query<{ draft_id: string; s3_key: string }>(
        `select draft_id, s3_key from snapshots where id = $1`,
        [req.params.id],
      );
      const snap = rows[0];
      if (!snap) throw notFound('That snapshot');
      await draftFor(db, req.user.id, snap.draft_id, 'view');
      const bytes = await blobs.get(snap.s3_key);
      if (!bytes) throw notFound('That snapshot’s contents');
      return reply.type('application/octet-stream').send(Buffer.from(bytes));
    },
  );
}
