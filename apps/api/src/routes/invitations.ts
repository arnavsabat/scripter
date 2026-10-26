// Accepting, re-roling and cancelling invitations (D-032). A link is one-time and works for
// 14 days; whoever opens it and signs in joins, with any email address.
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { seriesFor } from '../access';
import type { AppDeps } from '../app';
import { notifyAccess, withTx } from '../db/tx';
import { ApiError, notFound } from '../errors';
import { hashToken } from './series';

const uuid = { type: 'string', format: 'uuid' } as const;
const idParams = { type: 'object', required: ['id'], properties: { id: uuid } } as const;
const RANK: Record<string, number> = { viewer: 1, writer: 2, showrunner: 3 };

interface InvitationRow {
  id: string;
  series_id: string;
  series_name: string;
  email: string;
  role: string;
  episode_id: string | null;
  usable: boolean;
}

const SELECT = `select i.id, i.series_id, s.name as series_name, i.email, i.role, i.episode_id,
                       (i.accepted_at is null and i.cancelled_at is null and i.expires_at > now()
                        and s.deleted_at is null) as usable
                  from invitations i join series s on s.id = i.series_id`;

/** Joins the series in the invited role, never lowering a role the person already has. */
async function join(c: pg.PoolClient, inv: InvitationRow, userId: string) {
  if (!inv.usable)
    throw new ApiError(
      410,
      'invitation_used',
      'This invitation has expired or was already used. Ask the showrunner for a new one.',
    );
  const { rows } = await c.query<{ role: string }>(
    `select role from series_members where series_id = $1 and user_id = $2`,
    [inv.series_id, userId],
  );
  const current = rows[0]?.role;
  const role = current && RANK[current]! >= RANK[inv.role]! ? current : inv.role;
  await c.query(
    `insert into series_members (series_id, user_id, role) values ($1, $2, $3)
     on conflict (series_id, user_id) do update set role = excluded.role`,
    [inv.series_id, userId, role],
  );
  if (role === 'writer' && inv.episode_id)
    await c.query(
      `insert into episode_writers (episode_id, user_id, added_by)
       select $1, $2, i.invited_by from invitations i where i.id = $3
       on conflict do nothing`,
      [inv.episode_id, userId, inv.id],
    );
  await c.query(`update invitations set accepted_by = $2, accepted_at = now() where id = $1`, [
    inv.id,
    userId,
  ]);
  await notifyAccess(c, { series: inv.series_id });
  return { seriesId: inv.series_id, seriesName: inv.series_name, role };
}

export function invitationRoutes(app: FastifyInstance, { db }: AppDeps): void {
  // From the email's link: /i/<token>, after signing in (D-032).
  app.post<{ Body: { token: string } }>(
    '/api/invitations/accept',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string', minLength: 20, maxLength: 200 } },
        },
      },
    },
    async (req) =>
      withTx(db, async (c) => {
        const { rows } = await c.query<InvitationRow>(
          `${SELECT} where i.token_hash = $1 for update of i`,
          [hashToken(req.body.token)],
        );
        if (!rows[0])
          throw new ApiError(404, 'invitation_unknown', 'This invitation link isn’t valid.');
        return join(c, rows[0], req.user.id);
      }),
  );

  // From INVITATIONS in the home sidebar: for the address it was sent to.
  app.post<{ Params: { id: string } }>(
    '/api/invitations/:id/accept',
    { schema: { params: idParams } },
    async (req) =>
      withTx(db, async (c) => {
        const { rows } = await c.query<InvitationRow>(`${SELECT} where i.id = $1 for update of i`, [
          req.params.id,
        ]);
        const inv = rows[0];
        if (!inv || inv.email.toLowerCase() !== req.user.email.toLowerCase())
          throw notFound('That invitation');
        return join(c, inv, req.user.id);
      }),
  );

  app.patch<{ Params: { id: string }; Body: { role: 'writer' | 'viewer' } }>(
    '/api/invitations/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['role'],
          properties: { role: { enum: ['writer', 'viewer'] } },
        },
      },
    },
    async (req) =>
      withTx(db, async (c) => {
        const inv = (await c.query<InvitationRow>(`${SELECT} where i.id = $1`, [req.params.id]))
          .rows[0];
        if (!inv?.usable) throw notFound('That invitation');
        await seriesFor(c, req.user.id, inv.series_id, 'edit');
        await c.query(`update invitations set role = $2 where id = $1`, [inv.id, req.body.role]);
        return { ok: true };
      }),
  );

  // "Cancel invitation" in Members (D-030, D-032): the link stops working.
  app.delete<{ Params: { id: string } }>(
    '/api/invitations/:id',
    { schema: { params: idParams } },
    async (req) =>
      withTx(db, async (c) => {
        const inv = (await c.query<InvitationRow>(`${SELECT} where i.id = $1`, [req.params.id]))
          .rows[0];
        if (!inv) throw notFound('That invitation');
        await seriesFor(c, req.user.id, inv.series_id, 'edit');
        await c.query(`update invitations set cancelled_at = now() where id = $1`, [inv.id]);
        return { ok: true };
      }),
  );
}
