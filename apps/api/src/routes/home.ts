// GET /api/home: everything the home screen shows in one request (SPEC 3.10, D-033, D-037, D-042).
// Home asks again every 15 s and when the tab regains focus, which is how the green dot updates.
import { canEdit, isRole, type Access } from '@wr/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

interface Person {
  id: string;
  name: string;
}

export function homeRoutes(app: FastifyInstance, { db }: AppDeps): void {
  app.get('/api/home', async (req) => {
    const me = req.user.id;
    const series = (
      await db.query<{ id: string; name: string; is_series: boolean; role: string }>(
        `select s.id, s.name, s.is_series, m.role
             from series_members m join series s on s.id = m.series_id
            where m.user_id = $1 and s.deleted_at is null
            order by s.created_at desc`,
        [me],
      )
    ).rows;
    const ids = series.map((s) => s.id);
    const episodes = (
      await db.query<{
        id: string;
        series_id: string;
        name: string;
        edited_at: Date;
        number: string;
      }>(
        `select id, series_id, name, edited_at,
                  row_number() over (partition by series_id order by position) as number
             from episodes where series_id = any($1) and deleted_at is null
            order by series_id, position`,
        [ids],
      )
    ).rows;
    const people = async (sql: string) => {
      const by = new Map<string, Person[]>();
      for (const r of (await db.query<Person & { episode_id: string }>(sql, [ids])).rows)
        by.set(r.episode_id, [...(by.get(r.episode_id) ?? []), { id: r.id, name: r.name }]);
      return by;
    };
    const writers = await people(
      `select w.episode_id, u.id, u.name from episode_writers w
           join users u on u.id = w.user_id join episodes e on e.id = w.episode_id
          where e.series_id = any($1) order by w.added_at`,
    );
    const live = await people(
      `select p.episode_id, u.id, u.name from episode_presence p
           join users u on u.id = p.user_id join episodes e on e.id = p.episode_id
          where e.series_id = any($1) and p.seen_at > now() - interval '30 seconds'
          order by p.user_id`,
    );

    const recent = (
      await db.query<{ episode_id: string }>(
        `select o.episode_id from episode_opens o
             join episodes e on e.id = o.episode_id and e.deleted_at is null
             join series s on s.id = e.series_id and s.deleted_at is null
             join series_members m on m.series_id = s.id and m.user_id = o.user_id
            where o.user_id = $1 order by o.opened_at desc limit 3`,
        [me],
      )
    ).rows.map((r) => r.episode_id);

    const invitations = (
      await db.query<{
        id: string;
        series_id: string;
        series_name: string;
        from_name: string | null;
        role: string;
      }>(
        `select i.id, s.id as series_id, s.name as series_name, u.name as from_name, i.role
             from invitations i join series s on s.id = i.series_id and s.deleted_at is null
             left join users u on u.id = i.invited_by
            where lower(i.email) = lower($1) and i.accepted_at is null and i.cancelled_at is null
              and i.expires_at > now()
              and not exists (select 1 from series_members m
                               where m.series_id = i.series_id and m.user_id = $2)
            order by i.created_at desc`,
        [req.user.email, me],
      )
    ).rows.map((i) => ({
      id: i.id,
      seriesId: i.series_id,
      seriesName: i.series_name,
      from: i.from_name ?? 'Someone',
      role: i.role,
    }));

    // RECENTLY DELETED: what the caller can still restore, as a showrunner (D-037).
    const trash = [
      ...(
        await db.query<{
          id: string;
          name: string;
          is_series: boolean;
          deleted_at: Date;
          episodes: string;
        }>(
          `select s.id, s.name, s.is_series, s.deleted_at,
                    (select count(*) from episodes e where e.series_id = s.id and e.deleted_at is null) as episodes
               from series s join series_members m on m.series_id = s.id
              where m.user_id = $1 and m.role = 'showrunner'
                and s.deleted_at > now() - interval '30 days'`,
          [me],
        )
      ).rows.map((s) => ({
        kind: s.is_series ? ('series' as const) : ('script' as const),
        id: s.id,
        name: s.name,
        episodes: Number(s.episodes),
        deletedAt: s.deleted_at.toISOString(),
      })),
      ...(
        await db.query<{
          id: string;
          name: string;
          number: string;
          deleted_at: Date;
          series_id: string;
          series_name: string;
        }>(
          `select e.id, e.name, e.deleted_at, s.id as series_id, s.name as series_name,
                    (select count(*) + 1 from episodes x where x.series_id = e.series_id
                        and x.deleted_at is null and x.position < e.position) as number
               from episodes e join series s on s.id = e.series_id and s.deleted_at is null
               join series_members m on m.series_id = s.id and m.user_id = $1 and m.role = 'showrunner'
              where e.deleted_at > now() - interval '30 days'`,
          [me],
        )
      ).rows.map((e) => ({
        kind: 'episode' as const,
        id: e.id,
        name: e.name,
        number: Number(e.number),
        seriesId: e.series_id,
        seriesName: e.series_name,
        deletedAt: e.deleted_at.toISOString(),
      })),
    ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

    const assigned = new Set(
      (
        await db.query<{ episode_id: string }>(
          `select episode_id from episode_writers where user_id = $1`,
          [me],
        )
      ).rows.map((r) => r.episode_id),
    );

    return {
      me: req.user,
      series: series.map((s) => {
        const access: Access = { role: isRole(s.role) ? s.role : null, assigned };
        return {
          id: s.id,
          name: s.name,
          isSeries: s.is_series,
          role: s.role,
          canEdit: canEdit(access, { kind: 'series', seriesId: s.id }),
          episodes: episodes
            .filter((e) => e.series_id === s.id)
            .map((e) => ({
              id: e.id,
              name: e.name,
              number: Number(e.number),
              editedAt: e.edited_at.toISOString(),
              writers: writers.get(e.id) ?? [],
              live: live.get(e.id) ?? [],
              canEdit: canEdit(access, { kind: 'episode', seriesId: s.id, episodeId: e.id }),
            })),
        };
      }),
      recent,
      invitations,
      trash,
    };
  });
}
