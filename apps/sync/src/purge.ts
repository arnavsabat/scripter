// The 30-day purge (D-037, D-090): series, episodes and what-ifs deleted more than 30 days ago
// are removed for good, with everything they wrote: each draft's edit log and snapshots (the
// sync service's storage), its restore points (S3, under restore-points/), then the database
// rows. Postgres is the work list: rows go last, so a purge cut short is simply finished the
// next day. Runs daily as a scheduled task (purge-cli.ts); never on anything deleted more recently.
// Guests past their day (D-108) go the same way: their scripts at once, then the person and their
// Cognito user.
import type pg from 'pg';
import type { Storage } from './storage/types';

export interface PurgeDeps {
  db: pg.Pool;
  storage: Pick<Storage, 'log' | 'snapshots'>;
  /** Deletes one object from the snapshot bucket (a restore point). */
  deleteBlob: (key: string) => Promise<void>;
  /** How long a deletion waits under RECENTLY DELETED (D-037). */
  days?: number;
  /** Deletes a guest's Cognito user (D-108); unset, guests' scripts go but the people wait. */
  deleteCognitoUser?: (username: string) => Promise<void>;
  /** Count only; delete nothing. */
  dryRun?: boolean;
}

export interface PurgeResult {
  series: number;
  episodes: number;
  drafts: number;
  restorePoints: number;
  guests: number;
}

/** A series is a guest's when an expired guest is in it and nobody else who's still here is. */
const GUEST_SERIES = `(exists (select 1 from series_members m join users u on u.id = m.user_id
                              where m.series_id = s.id and u.guest_until < now())
   and not exists (select 1 from series_members m join users u on u.id = m.user_id
                    where m.series_id = s.id and (u.guest_until is null or u.guest_until >= now())))`;

export async function purge({
  db,
  storage,
  deleteBlob,
  deleteCognitoUser,
  days = 30,
  dryRun = false,
}: PurgeDeps): Promise<PurgeResult> {
  const cutoff = `${days} days`;
  // What's due: series past the window or an expired guest's; episodes past it (or in a due
  // series); drafts past it (deleted what-ifs) or in a due episode.
  const seriesDue = `(s.deleted_at < now() - $1::interval or ${GUEST_SERIES})`;
  const { rows: series } = await db.query<{ id: string }>(
    `select s.id from series s where ${seriesDue}`,
    [cutoff],
  );
  const { rows: episodes } = await db.query<{ id: string }>(
    `select e.id from episodes e join series s on s.id = e.series_id
      where e.deleted_at < now() - $1::interval or ${seriesDue}`,
    [cutoff],
  );
  const { rows: drafts } = await db.query<{ id: string; episode_id: string }>(
    `select d.id, d.episode_id from drafts d
       join episodes e on e.id = d.episode_id join series s on s.id = e.series_id
      where d.deleted_at < now() - $1::interval or e.deleted_at < now() - $1::interval
         or ${seriesDue}`,
    [cutoff],
  );
  const { rows: guests } = await db.query<{ id: string; email: string }>(
    `select id, email from users where guest_until < now()`,
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
    guests: deleteCognitoUser ? guests.length : 0,
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

  // 3. Expired guests, now that their scripts are gone: the Cognito user, then the person (whose
  //    usage counts keep their rows, anonymous). A failure leaves the row for tomorrow's run.
  if (deleteCognitoUser)
    for (const g of guests) {
      await deleteCognitoUser(g.email);
      await db.query(`delete from users where id = $1`, [g.id]);
    }
  return result;
}
