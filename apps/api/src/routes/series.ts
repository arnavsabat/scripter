// Series and scripts, their members and roles, and new invitations (SPEC 5.3; D-032, D-033, D-037, D-042).
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { canInvite } from '@wr/shared';
import { accountOf, guestRefused, seriesFor } from '../access';
import type { AppDeps } from '../app';
import { notifyAccess, withTx } from '../db/tx';
import { ApiError, notFound } from '../errors';
import { invitationEmail } from '../mailer';

const uuid = { type: 'string', format: 'uuid' } as const;
const idParams = { type: 'object', required: ['id'], properties: { id: uuid } } as const;
const name = { type: 'string', minLength: 1, maxLength: 120 } as const;
const INVITE_DAYS = 14;

export const hashToken = (token: string) => createHash('sha256').update(token).digest();

/** Inserts an episode at the end of its series, with its main draft, assigned to its creator. */
export async function addEpisode(c: pg.PoolClient, seriesId: string, epName: string, by: string) {
  const { rows } = await c.query<{ id: string }>(
    `insert into episodes (series_id, name, position, created_by)
     values ($1, $2, (select coalesce(max(position), 0) + 1 from episodes where series_id = $1), $3)
     returning id`,
    [seriesId, epName, by],
  );
  const id = rows[0]!.id;
  await c.query(`insert into episode_writers (episode_id, user_id, added_by) values ($1, $2, $2)`, [
    id,
    by,
  ]);
  await c.query(`insert into drafts (episode_id, kind, created_by) values ($1, 'main', $2)`, [
    id,
    by,
  ]);
  return id;
}

/** The last showrunner can't step down or leave until someone else is showrunner. */
async function keepAShowrunner(c: pg.PoolClient, seriesId: string, userId: string) {
  const { rows } = await c.query<{ role: string; showrunners: string }>(
    `select role, (select count(*) from series_members where series_id = $1 and role = 'showrunner') as showrunners
       from series_members where series_id = $1 and user_id = $2`,
    [seriesId, userId],
  );
  const r = rows[0];
  if (!r) throw notFound('That member');
  if (r.role === 'showrunner' && Number(r.showrunners) === 1)
    throw new ApiError(409, 'last_showrunner', 'Make someone else showrunner first.');
}

export function seriesRoutes(app: FastifyInstance, { db, mailer, appUrl }: AppDeps): void {
  // + New script (a one-episode series, D-033) or + New series (empty, D-037).
  app.post<{ Body: { kind: 'script' | 'series'; name?: string } }>(
    '/api/series',
    {
      schema: {
        body: {
          type: 'object',
          required: ['kind'],
          properties: { kind: { enum: ['script', 'series'] }, name },
        },
      },
    },
    async (req) => {
      const me = req.user.id;
      const isSeries = req.body.kind === 'series';
      const seriesName = req.body.name ?? (isSeries ? 'Untitled series' : 'Untitled script');
      return withTx(db, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into series (name, is_series, created_by) values ($1, $2, $3) returning id`,
          [seriesName, isSeries, me],
        );
        const seriesId = rows[0]!.id;
        await c.query(
          `insert into series_members (series_id, user_id, role) values ($1, $2, 'showrunner')`,
          [seriesId, me],
        );
        const episodeId = isSeries ? null : await addEpisode(c, seriesId, seriesName, me);
        return { seriesId, episodeId };
      });
    },
  );

  // Rename (showrunner). A plain script's series and its one episode share a name (D-033).
  app.patch<{ Params: { id: string }; Body: { name: string } }>(
    '/api/series/:id',
    {
      schema: {
        params: idParams,
        body: { type: 'object', required: ['name'], properties: { name } },
      },
    },
    async (req) =>
      withTx(db, async (c) => {
        const { series } = await seriesFor(c, req.user.id, req.params.id, 'edit', true);
        const n = req.body.name.trim() || series.name;
        await c.query(`update series set name = $2 where id = $1`, [series.id, n]);
        if (!series.isSeries)
          await c.query(
            `update episodes set name = $2 where series_id = $1 and deleted_at is null`,
            [series.id, n],
          );
        return { ok: true };
      }),
  );

  // Delete (showrunner): hidden at once, restorable for 30 days, then purged (D-037).
  app.delete<{ Params: { id: string } }>(
    '/api/series/:id',
    { schema: { params: idParams } },
    async (req) =>
      withTx(db, async (c) => {
        const { series } = await seriesFor(c, req.user.id, req.params.id, 'edit', true);
        await c.query(`update series set deleted_at = now() where id = $1`, [series.id]);
        await notifyAccess(c, { series: series.id });
        return { ok: true };
      }),
  );

  app.post<{ Params: { id: string } }>(
    '/api/series/:id/restore',
    { schema: { params: idParams } },
    async (req) =>
      withTx(db, async (c) => {
        const { rowCount } = await c.query(
          `update series s set deleted_at = null
               from series_members m
              where s.id = $1 and m.series_id = s.id and m.user_id = $2 and m.role = 'showrunner'
                and s.deleted_at > now() - interval '30 days'`,
          [req.params.id, req.user.id],
        );
        if (!rowCount) throw notFound('That deleted series');
        await notifyAccess(c, { series: req.params.id });
        return { ok: true };
      }),
  );

  // + New episode (showrunner). Turns a plain script into a series for good (D-033, D-037).
  app.post<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/series/:id/episodes',
    { schema: { params: idParams, body: { type: 'object', properties: { name } } } },
    async (req) =>
      withTx(db, async (c) => {
        const { series } = await seriesFor(c, req.user.id, req.params.id, 'edit', true);
        if (!series.isSeries)
          await c.query(`update series set is_series = true where id = $1`, [series.id]);
        const episodeId = await addEpisode(c, series.id, req.body.name ?? 'Untitled', req.user.id);
        return { episodeId };
      }),
  );

  // The Members panel (D-030): every member sees it; only the showrunner changes it.
  app.get<{ Params: { id: string } }>(
    '/api/series/:id/members',
    { schema: { params: idParams } },
    async (req) => {
      const { series } = await seriesFor(db, req.user.id, req.params.id, 'view');
      const members = (
        await db.query<{ id: string; name: string; role: string; episodes: string[] }>(
          `select u.id, u.name, m.role,
                    coalesce(array_agg(e.id::text order by e.position)
                             filter (where e.id is not null), '{}') as episodes
               from series_members m join users u on u.id = m.user_id
               left join episode_writers w on w.user_id = m.user_id
               left join episodes e on e.id = w.episode_id and e.series_id = m.series_id
                                   and e.deleted_at is null
              where m.series_id = $1
              group by u.id, u.name, m.role, m.joined_at
              order by m.joined_at`,
          [series.id],
        )
      ).rows;
      const invited = (
        await db.query<{ id: string; email: string; role: string; created_at: Date }>(
          `select id, email, role, created_at from invitations
              where series_id = $1 and accepted_at is null and cancelled_at is null
                and expires_at > now()
              order by created_at`,
          [series.id],
        )
      ).rows.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        invitedAt: i.created_at.toISOString(),
      }));
      return { members, invited };
    },
  );

  app.patch<{ Params: { id: string; userId: string }; Body: { role: string } }>(
    '/api/series/:id/members/:userId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: { id: uuid, userId: uuid },
        },
        body: {
          type: 'object',
          required: ['role'],
          properties: { role: { enum: ['showrunner', 'writer', 'viewer'] } },
        },
      },
    },
    async (req) =>
      withTx(db, async (c) => {
        const { series } = await seriesFor(c, req.user.id, req.params.id, 'edit', true);
        const { userId } = req.params;
        if (req.body.role !== 'showrunner') await keepAShowrunner(c, series.id, userId);
        await c.query(`update series_members set role = $3 where series_id = $1 and user_id = $2`, [
          series.id,
          userId,
          req.body.role,
        ]);
        // A viewer writes nothing, so their assignments in this series go.
        if (req.body.role === 'viewer')
          await c.query(
            `delete from episode_writers w using episodes e
                where w.episode_id = e.id and e.series_id = $1 and w.user_id = $2`,
            [series.id, userId],
          );
        await notifyAccess(c, { series: series.id });
        return { ok: true };
      }),
  );

  app.delete<{ Params: { id: string; userId: string } }>(
    '/api/series/:id/members/:userId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: { id: uuid, userId: uuid },
        },
      },
    },
    async (req) =>
      withTx(db, async (c) => {
        const { series } = await seriesFor(c, req.user.id, req.params.id, 'edit', true);
        const { userId } = req.params;
        await keepAShowrunner(c, series.id, userId);
        await c.query(
          `delete from episode_writers w using episodes e
              where w.episode_id = e.id and e.series_id = $1 and w.user_id = $2`,
          [series.id, userId],
        );
        await c.query(`delete from series_members where series_id = $1 and user_id = $2`, [
          series.id,
          userId,
        ]);
        await notifyAccess(c, { series: series.id });
        return { ok: true };
      }),
  );

  // Invite by email (showrunner only, SPEC 5.3). One-time link, 14 days, only its hash kept (D-032).
  app.post<{
    Params: { id: string };
    Body: { email: string; role: 'writer' | 'viewer'; episodeId?: string };
  }>(
    '/api/series/:id/invitations',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['email', 'role'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            role: { enum: ['writer', 'viewer'] },
            episodeId: uuid,
          },
        },
      },
    },
    async (req) => {
      if (!canInvite(accountOf(req.user))) throw guestRefused();
      const email = req.body.email.trim();
      const token = randomBytes(32).toString('base64url');
      const result = await withTx(db, async (c) => {
        const { series } = await seriesFor(c, req.user.id, req.params.id, 'edit', true);
        const member = await c.query(
          `select 1 from series_members m join users u on u.id = m.user_id
              where m.series_id = $1 and lower(u.email) = lower($2)`,
          [series.id, email],
        );
        if (member.rowCount)
          throw new ApiError(409, 'already_member', `${email} is already in ${series.name}.`);
        if (req.body.episodeId) {
          const ep = await c.query(
            `select 1 from episodes where id = $1 and series_id = $2 and deleted_at is null`,
            [req.body.episodeId, series.id],
          );
          if (!ep.rowCount) throw notFound('That episode');
        }
        // Inviting the same address again replaces the old link.
        await c.query(
          `update invitations set cancelled_at = now()
              where series_id = $1 and lower(email) = lower($2)
                and accepted_at is null and cancelled_at is null`,
          [series.id, email],
        );
        const { rows } = await c.query<{ id: string }>(
          `insert into invitations (series_id, email, role, episode_id, token_hash, invited_by, expires_at)
             values ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7))
             returning id`,
          [
            series.id,
            email,
            req.body.role,
            req.body.episodeId ?? null,
            hashToken(token),
            req.user.id,
            INVITE_DAYS,
          ],
        );
        return { id: rows[0]!.id, seriesName: series.name };
      });
      await mailer.send(
        invitationEmail({
          to: email,
          inviterName: req.user.name,
          seriesName: result.seriesName,
          role: req.body.role,
          link: `${appUrl}/i/${token}`,
        }),
      );
      return { id: result.id };
    },
  );
}
