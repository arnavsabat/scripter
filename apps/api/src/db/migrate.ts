// Applies migrations/*.sql in order (D-031). Each file runs in its own transaction, so a failing
// file leaves nothing behind, and is recorded in schema_migrations so it never runs twice. An
// advisory lock makes concurrent runners (two API containers starting at once) take turns.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientBase } from 'pg';

/** Next to the source in development; the production image sets WR_MIGRATIONS_DIR (D-091). */
export const MIGRATIONS_DIR =
  process.env.WR_MIGRATIONS_DIR ?? fileURLToPath(new URL('../../migrations', import.meta.url));

/** Any constant works; it only has to be the same for every runner. */
const LOCK_KEY = 7_143_001;
const FILE = /^(\d{3}_[a-z0-9_]+)\.sql$/;

/** Applies every pending migration and returns the versions it applied, oldest first. */
export async function migrate(client: ClientBase, dir = MIGRATIONS_DIR): Promise<string[]> {
  await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
  try {
    await client.query(
      `create table if not exists schema_migrations (
         version text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const done = new Set(
      (await client.query<{ version: string }>('select version from schema_migrations')).rows.map(
        (r) => r.version,
      ),
    );
    const versions = (await readdir(dir))
      .map((f) => FILE.exec(f)?.[1])
      .filter((v): v is string => v !== undefined)
      .sort();
    const applied: string[] = [];
    for (const version of versions) {
      if (done.has(version)) continue;
      const sql = await readFile(join(dir, `${version}.sql`), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [version]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`migration ${version} failed, nothing from it was applied`, { cause: err });
      }
      applied.push(version);
    }
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
  }
}
