// The production access source: Postgres, read through the shared rule (D-031, D-040). Access
// changes arrive as NOTIFY wr_access from the API; if the listening connection drops, it
// reconnects with backoff and asks for every connection to be re-checked, since alerts sent
// meanwhile were missed.
import { canEdit, canView, isRole, type EpisodeScope, type Identity } from '@wr/shared';
import pg from 'pg';
import { colorFor, type AccessChange, type AccessResult, type AccessSource } from './access';
import type { Logger } from './room';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `databaseUrl` unset: the PG* variables (on AWS, D-091). */
export function pgAccess(databaseUrl: string | undefined, logger: Logger): AccessSource {
  const conn = databaseUrl ? { connectionString: databaseUrl } : {};
  const db = new pg.Pool({ ...conn, max: 5 });
  // A dropped idle connection is replaced on the next query; unhandled, it would stop the server.
  db.on('error', (err) => logger.error('access database connection lost', { err: String(err) }));
  let listener: pg.Client | null = null;
  let closed = false;

  return {
    async identify(sub) {
      const { rows } = await db.query<{ id: string; name: string }>(
        // A guest past their day is nobody (D-108).
        `select u.id, u.name from user_identities i join users u on u.id = i.user_id
          where i.cognito_sub = $1 and (u.guest_until is null or u.guest_until > now())`,
        [sub],
      );
      const u = rows[0];
      return u ? ({ userId: u.id, name: u.name, color: colorFor(u.id) } satisfies Identity) : null;
    },

    async check(userId, docId): Promise<AccessResult> {
      if (!UUID.test(docId)) return { ok: false, reason: 'unknown' };
      const { rows } = await db.query<{
        episode_id: string;
        series_id: string;
        deleted: boolean;
        role: string | null;
        assigned: boolean;
      }>(
        `select d.episode_id, e.series_id,
                (d.deleted_at is not null or e.deleted_at is not null or s.deleted_at is not null) as deleted,
                (select role from series_members m where m.series_id = e.series_id and m.user_id = $2) as role,
                exists (select 1 from episode_writers w where w.episode_id = e.id and w.user_id = $2) as assigned
           from drafts d join episodes e on e.id = d.episode_id join series s on s.id = e.series_id
          where d.id = $1`,
        [docId, userId],
      );
      const r = rows[0];
      if (!r) return { ok: false, reason: 'unknown' };
      if (r.deleted) return { ok: false, reason: 'deleted' };
      const access = {
        role: isRole(r.role) ? r.role : null,
        assigned: new Set(r.assigned ? [r.episode_id] : []),
      };
      const scope: EpisodeScope = {
        kind: 'episode',
        seriesId: r.series_id,
        episodeId: r.episode_id,
      };
      if (!canView(access, scope)) return { ok: false, reason: 'none' };
      return {
        ok: true,
        mode: canEdit(access, scope) ? 'edit' : 'view',
        seriesId: r.series_id,
        episodeId: r.episode_id,
      };
    },

    subscribe(onChange, onResync) {
      let attempt = 0;
      const connect = async () => {
        if (closed) return;
        const client = new pg.Client(conn);
        client.on('notification', (n) => {
          try {
            const change = JSON.parse(n.payload ?? '') as AccessChange;
            if (typeof change.series === 'string') onChange(change);
          } catch {
            // not ours
          }
        });
        client.on('error', (err) => {
          logger.error('access listener lost; reconnecting', { err: String(err) });
          listener = null;
          void client.end().catch(() => {});
          retry();
        });
        try {
          await client.connect();
          await client.query('listen wr_access');
          listener = client;
          if (attempt > 0) onResync(); // anything sent while we were away was missed
          attempt = 0;
        } catch (err) {
          logger.error('access listener failed to start', { err: String(err) });
          void client.end().catch(() => {});
          retry();
        }
      };
      const retry = () => {
        if (closed) return;
        attempt += 1;
        setTimeout(() => void connect(), Math.random() * Math.min(10_000, 250 * 2 ** attempt));
      };
      void connect();
    },

    async present(episodeId, userIds, serverId) {
      if (!userIds.length) return;
      await db.query(
        `insert into episode_presence (episode_id, user_id, server_id, seen_at)
         select $1, u, $3, now() from unnest($2::uuid[]) as u
         on conflict (episode_id, user_id) do update set server_id = excluded.server_id, seen_at = now()`,
        [episodeId, userIds, serverId],
      );
    },

    async left(episodeId, userId) {
      await db.query(`delete from episode_presence where episode_id = $1 and user_id = $2`, [
        episodeId,
        userId,
      ]);
    },

    async edited(episodeId) {
      await db.query(`update episodes set edited_at = now() where id = $1`, [episodeId]);
    },

    async counted(event, userIds, episodeId) {
      if (!userIds.length) return;
      await db.query(
        `insert into usage_events (event, user_id, episode_id)
         select $1, u, $3 from unnest($2::uuid[]) as u
          where not exists (
            select 1 from usage_events e
             where e.event = $1 and e.user_id = u and e.episode_id = $3
               and e.occurred_at > now() - interval '30 minutes')`,
        [event, userIds, episodeId],
      );
    },

    async close() {
      closed = true;
      await listener?.end().catch(() => {});
      await db.end();
    },
  };
}
