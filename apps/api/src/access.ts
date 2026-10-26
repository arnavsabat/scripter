// Loads a series or episode together with the caller's access to it, and refuses through the shared
// rule (D-040). Every route that touches a series or an episode starts here, so no route can forget
// a check. Deleted rows are never found, so they have no access.
import {
  canEdit,
  canView,
  isRole,
  type Access,
  type EpisodeScope,
  type SeriesScope,
} from '@wr/shared';
import type pg from 'pg';
import { ApiError, forbidden, notFound } from './errors';

export type Q = pg.Pool | pg.PoolClient;

export interface SeriesRow {
  id: string;
  name: string;
  isSeries: boolean;
}

export interface EpisodeRow {
  id: string;
  name: string;
  series: SeriesRow;
}

export const NO_ACCESS = 'You don’t have access to this episode. Ask the showrunner.';

export async function loadAccess(q: Q, userId: string, seriesId: string): Promise<Access> {
  const { rows } = await q.query<{ role: string | null; assigned: string[] }>(
    `select
       (select role from series_members where series_id = $2 and user_id = $1) as role,
       coalesce((select array_agg(w.episode_id::text) from episode_writers w
                   join episodes e on e.id = w.episode_id
                  where w.user_id = $1 and e.series_id = $2), '{}') as assigned`,
    [userId, seriesId],
  );
  const r = rows[0]!;
  return { role: isRole(r.role) ? r.role : null, assigned: new Set(r.assigned) };
}

/**
 * A live series the caller belongs to. Non-members get "doesn't exist", so series IDs reveal
 * nothing. `edit` also requires canEdit (the showrunner). `lock` holds the row until the
 * transaction ends, so concurrent changes to one series run one at a time.
 */
export async function seriesFor(
  q: Q,
  userId: string,
  seriesId: string,
  need: 'view' | 'edit',
  lock = false,
): Promise<{ series: SeriesRow; access: Access }> {
  const { rows } = await q.query<{ id: string; name: string; is_series: boolean }>(
    `select id, name, is_series from series where id = $1 and deleted_at is null${lock ? ' for update' : ''}`,
    [seriesId],
  );
  const row = rows[0];
  if (!row) throw notFound('That series');
  const access = await loadAccess(q, userId, seriesId);
  const scope: SeriesScope = { kind: 'series', seriesId };
  if (!canView(access, scope)) throw notFound('That series');
  if (need === 'edit' && !canEdit(access, scope))
    throw forbidden('Only the showrunner can do that.');
  return { series: { id: row.id, name: row.name, isSeries: row.is_series }, access };
}

/** A live episode in a live series. Members who may not edit it get 403 for `edit`. */
export async function episodeFor(
  q: Q,
  userId: string,
  episodeId: string,
  need: 'view' | 'edit',
): Promise<{ episode: EpisodeRow; access: Access; scope: EpisodeScope }> {
  const { rows } = await q.query<{
    id: string;
    name: string;
    series_id: string;
    series_name: string;
    is_series: boolean;
  }>(
    `select e.id, e.name, s.id as series_id, s.name as series_name, s.is_series
       from episodes e join series s on s.id = e.series_id
      where e.id = $1 and e.deleted_at is null and s.deleted_at is null`,
    [episodeId],
  );
  const row = rows[0];
  if (!row) throw notFound('That episode');
  const access = await loadAccess(q, userId, row.series_id);
  const scope: EpisodeScope = { kind: 'episode', seriesId: row.series_id, episodeId };
  if (!canView(access, scope)) throw new ApiError(403, 'no_access', NO_ACCESS);
  if (need === 'edit' && !canEdit(access, scope))
    throw forbidden('You can’t edit this episode. Ask the showrunner to add you as a writer.');
  return {
    episode: {
      id: row.id,
      name: row.name,
      series: { id: row.series_id, name: row.series_name, isSeries: row.is_series },
    },
    access,
    scope,
  };
}
