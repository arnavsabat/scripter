// The 30-day purge (D-037, D-090): series, episodes and what-ifs deleted more than 30 days ago
// are removed for good, with everything they wrote: each draft's edit log and snapshots (the
// sync service's storage), its restore points (S3, under restore-points/), then the database
// rows. Postgres is the work list: rows go last, so a purge cut short is simply finished the
// next day. Runs daily as a scheduled task (purge-cli.ts); never on anything deleted more recently.
import type pg from 'pg';
import type { Storage } from './storage/types';

export interface PurgeDeps {
  db: pg.Pool;
  storage: Pick<Storage, 'log' | 'snapshots'>;
  /** Deletes one object from the snapshot bucket (a restore point). */
  deleteBlob: (key: string) => Promise<void>;
  /** How long a deletion waits under RECENTLY DELETED (D-037). */
  days?: number;
  /** Count only; delete nothing. */
  dryRun?: boolean;
}

export interface PurgeResult {
  series: number;
  episodes: number;
  drafts: number;
  restorePoints: number;
}

export async function purge({
  db,
  storage,
  deleteBlob,
  days = 30,
  dryRun = false,
}: PurgeDeps): Promise<PurgeResult> {
  const cutoff = `${days} days`;
  // What's due: series past the window; episodes past it (or in a due series); drafts past it
  // (deleted what-ifs) or in a due episode.
  const { rows: series } = await db.query<{ id: string }>(
    `select id from series where deleted_at < now() - $1::interval`,
    [cutoff],
  );
  const { rows: episodes } = await db.query<{ id: string }>(
    `select e.id from episodes e join series s on s.id = e.series_id
      where e.deleted_at < now() - $1::interval or s.deleted_at < now() - $1::interval`,
    [cutoff],
  );
  const { rows: drafts } = await db.query<{ id: string; episode_id: string }>(
    `select d.id, d.episode_id from drafts d
       join episodes e on e.id = d.episode_id join series s on s.id = e.series_id
      where d.deleted_at < now() - $1::interval or e.deleted_at < now() - $1::interval
         or s.deleted_at < now() - $1::interval`,
    [cutoff],
  );
  const { rows: points } = await db.query<{ s3_key: string }>(
    `select s3_key from snapshots where draft_id = any($1::uuid[]) and s3_key like 'restore-points/%'`,
    [drafts.map((d) => d.id)],
  );
  const result = {
    series: series.length,
    episodes: episodes.length,
    drafts: drafts.length,
    restorePoints: points.length,
  };
  if (dryRun) return result;

  // 1. What the rows point at.
  for (const d of drafts) {
    await storage.log.forget(d.id);
    await storage.snapshots.forget(d.id);
  }
  for (const p of points) await deleteBlob(p.s3_key);

  // 2. The rows, in one transaction. Episodes and series cascade to their drafts, snapshots,
  //    writers, invitations and RECENT; usage counts keep their rows with the episode emptied.
  const client = await db.connect();
  try {
    await client.query('begin');
    const due = new Set(episodes.map((e) => e.id));
    const loose = drafts.filter((d) => !due.has(d.episode_id)).map((d) => d.id);
    await client.query(`delete from drafts where id = any($1::uuid[])`, [loose]);
    await client.query(`delete from episodes where id = any($1::uuid[])`, [[...due]]);
    await client.query(`delete from series where id = any($1::uuid[])`, [series.map((s) => s.id)]);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
  return result;
}
