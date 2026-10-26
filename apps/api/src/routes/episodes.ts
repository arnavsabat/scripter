// Episodes: opening one, renaming, deleting and restoring, and co-writers (SPEC 5.3; D-032, D-033, D-037).
import { canBeCoWriter, canEdit, isRole } from '@wr/shared';
import type { FastifyInstance } from 'fastify';
import { episodeFor, seriesFor } from '../access';
import type { AppDeps } from '../app';
import { notifyAccess, withTx } from '../db/tx';
import { ApiError, notFound } from '../errors';

const uuid = { type: 'string', format: 'uuid' } as const;
const idParams = { type: 'object', required: ['id'], properties: { id: uuid } } as const;
const writerParams = {
  type: 'object',
  required: ['id', 'userId'],
  properties: { id: uuid, userId: uuid },
} as const;

export function episodeRoutes(app: FastifyInstance, { db }: AppDeps): void {
  // Opening an episode (the handoff, or a /e/<id> link from Copy invite link). Records RECENT.
  app.get<{ Params: { id: string } }>(
    '/api/episodes/:id',
    { schema: { params: idParams } },
    async (req) => {
      const { episode, access, scope } = await episodeFor(db, req.user.id, req.params.id, 'view');
      const { rows } = await db.query<{ number: string; draft_id: string }>(
        `select (select count(*) + 1 from episodes x
                    where x.series_id = e.series_id and x.deleted_at is null and x.position < e.position) as number,
                  (select id from drafts d where d.episode_id = e.id and d.kind = 'main') as draft_id
             from episodes e where e.id = $1`,
        [episode.id],
      );
      await db.query(
        `insert into episode_opens (user_id, episode_id) values ($1, $2)
           on conflict (user_id, episode_id) do update set opened_at = now()`,
        [req.user.id, episode.id],
      );
      return {
        id: episode.id,
        name: episode.name,
        number: Number(rows[0]!.number),
        series: episode.series,
        role: access.role,
        canEdit: canEdit(access, scope),
        // The main draft's Y.Doc on the sync service (SPEC 5.2).
        draftId: rows[0]!.draft_id,
      };
    },
  );

  // Rename: anyone who may edit the episode (D-033). A plain script's series follows.
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    '/api/episodes/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
        },
      },
    },
    async (req) =>
      withTx(db, async (c) => {
        const { episode } = await episodeFor(c, req.user.id, req.params.id, 'edit');
        const n = req.body.name.trim() || episode.name;
        await c.query(`update episodes set name = $2 where id = $1`, [episode.id, n]);
        if (!episode.series.isSeries)
          await c.query(`update series set name = $2 where id = $1`, [episode.series.id, n]);
        return { ok: true };
      }),
  );

  // Delete (showrunner). In a plain script, the episode is the script, so the script goes (D-037).
  app.delete<{ Params: { id: string } }>(
    '/api/episodes/:id',
    { schema: { params: idParams } },
    async (req) =>
      withTx(db, async (c) => {
        const { episode } = await episodeFor(c, req.user.id, req.params.id, 'view');
        const { series } = await seriesFor(c, req.user.id, episode.series.id, 'edit', true);
        if (series.isSeries)
          await c.query(`update episodes set deleted_at = now() where id = $1`, [episode.id]);
        else await c.query(`update series set deleted_at = now() where id = $1`, [series.id]);
        await notifyAccess(c, { series: series.id, episode: episode.id });
        return { ok: true, deleted: series.isSeries ? 'episode' : 'script' };
      }),
  );

  app.post<{ Params: { id: string } }>(
    '/api/episodes/:id/restore',
    { schema: { params: idParams } },
    async (req) =>
      withTx(db, async (c) => {
        const { rows } = await c.query<{ series_id: string }>(
          `select series_id from episodes
              where id = $1 and deleted_at > now() - interval '30 days'`,
          [req.params.id],
        );
        if (!rows[0]) throw notFound('That deleted episode');
        // The series must be live and the caller its showrunner.
        await seriesFor(c, req.user.id, rows[0].series_id, 'edit', true);
        await c.query(`update episodes set deleted_at = null where id = $1`, [req.params.id]);
        await notifyAccess(c, { series: rows[0].series_id, episode: req.params.id });
        return { ok: true };
      }),
  );

  // Co-writers (D-032): an episode's writers and the showrunner add or remove the series' writers.
  app.put<{ Params: { id: string; userId: string } }>(
    '/api/episodes/:id/writers/:userId',
    { schema: { params: writerParams } },
    async (req) =>
      withTx(db, async (c) => {
        const { episode } = await episodeFor(c, req.user.id, req.params.id, 'edit');
        const { rows } = await c.query<{ role: string }>(
          `select role from series_members where series_id = $1 and user_id = $2`,
          [episode.series.id, req.params.userId],
        );
        const role = rows[0]?.role;
        if (!canBeCoWriter(isRole(role) ? role : null))
          throw new ApiError(
            409,
            'not_a_writer',
            'Only writers in this series can be co-writers. The showrunner can change their role in Members.',
          );
        await c.query(
          `insert into episode_writers (episode_id, user_id, added_by) values ($1, $2, $3)
             on conflict do nothing`,
          [episode.id, req.params.userId, req.user.id],
        );
        await notifyAccess(c, { series: episode.series.id, episode: episode.id });
        return { ok: true };
      }),
  );

  app.delete<{ Params: { id: string; userId: string } }>(
    '/api/episodes/:id/writers/:userId',
    { schema: { params: writerParams } },
    async (req) =>
      withTx(db, async (c) => {
        const { episode } = await episodeFor(c, req.user.id, req.params.id, 'edit');
        await c.query(`delete from episode_writers where episode_id = $1 and user_id = $2`, [
          episode.id,
          req.params.userId,
        ]);
        await notifyAccess(c, { series: episode.series.id, episode: episode.id });
        return { ok: true };
      }),
  );
}
