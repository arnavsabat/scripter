// The migration runner and the schema's own rules, against a real Postgres (D-031).
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate';
import { createTestDb, servicesEnabled, type TestDb } from './testDb';

describe.skipIf(!servicesEnabled)('migrations', () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.drop();
  });

  it('applies every migration to an empty database, then has nothing left to do', async () => {
    const c = await db.client();
    expect(await migrate(c)).toEqual([
      '001_accounts_and_rooms',
      '002_recent',
      '003_whatifs',
      '004_usage',
      '005_guests',
    ]);
    expect(await migrate(c)).toEqual([]);
    const { rows } = await c.query<{ version: string }>('select version from schema_migrations');
    expect(rows.map((r) => r.version)).toEqual([
      '001_accounts_and_rooms',
      '002_recent',
      '003_whatifs',
      '004_usage',
      '005_guests',
    ]);
  });

  it('two runners starting at once apply each migration exactly once', async () => {
    const [a, b] = await Promise.all([db.client(), db.client()]);
    const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
    expect([...ra, ...rb].sort()).toEqual([
      '001_accounts_and_rooms',
      '002_recent',
      '003_whatifs',
      '004_usage',
      '005_guests',
    ]);
  });

  it('a failing migration leaves nothing behind and is not recorded', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wr-migrations-'));
    await writeFile(join(dir, '001_ok.sql'), 'create table a (x int);');
    await writeFile(join(dir, '002_bad.sql'), 'create table b (x int); select * from missing;');
    const c = await db.client();
    await expect(migrate(c, dir)).rejects.toThrow(/002_bad failed/);
    const tables = await c.query<{ t: string }>(
      `select table_name as t from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(tables.rows.map((r) => r.t)).toEqual(['a', 'schema_migrations']); // no table b
    const { rows } = await c.query<{ version: string }>('select version from schema_migrations');
    expect(rows.map((r) => r.version)).toEqual(['001_ok']);
  });
});

describe.skipIf(!servicesEnabled)('schema rules', () => {
  let db: TestDb;
  let c: pg.Client;
  const ids = { user: '', series: '', episode: '' };
  beforeEach(async () => {
    db = await createTestDb();
    c = await db.client();
    await migrate(c);
    ids.user = (
      await c.query<{ id: string }>(
        `insert into users (email, name) values ('maya@example.com', 'Maya') returning id`,
      )
    ).rows[0]!.id;
    ids.series = (
      await c.query<{ id: string }>(
        `insert into series (name, created_by) values ('The Long Night', $1) returning id`,
        [ids.user],
      )
    ).rows[0]!.id;
    ids.episode = (
      await c.query<{ id: string }>(
        `insert into episodes (series_id, name, position) values ($1, 'Pilot', 1) returning id`,
        [ids.series],
      )
    ).rows[0]!.id;
  });
  afterEach(async () => {
    await db.drop();
  });

  it('accepts only the three roles', async () => {
    await expect(
      c.query(`insert into series_members values ($1, $2, 'admin')`, [ids.series, ids.user]),
    ).rejects.toThrow(/series_members_role_check/);
    await c.query(
      `insert into series_members (series_id, user_id, role) values ($1, $2, 'writer')`,
      [ids.series, ids.user],
    );
  });

  it('one email is one person, whatever its capitalisation', async () => {
    await expect(
      c.query(`insert into users (email, name) values ('MAYA@example.com', 'Maya again')`),
    ).rejects.toThrow(/users_email_key/);
  });

  it('an episode has exactly one main draft, and only what-ifs have a base snapshot', async () => {
    await c.query(`insert into drafts (episode_id, kind) values ($1, 'main')`, [ids.episode]);
    await expect(
      c.query(`insert into drafts (episode_id, kind) values ($1, 'main')`, [ids.episode]),
    ).rejects.toThrow(/drafts_one_main/);
    await expect(
      c.query(`insert into drafts (episode_id, kind) values ($1, 'whatif')`, [ids.episode]),
    ).rejects.toThrow(/drafts_check/);
  });

  it('positions are unique within a series, so restored episodes keep their place', async () => {
    await expect(
      c.query(`insert into episodes (series_id, name, position) values ($1, 'Dup', 1)`, [
        ids.series,
      ]),
    ).rejects.toThrow(/episodes_series_id_position_key/);
  });

  it('an invitation link can only exist once, and only for writer or viewer', async () => {
    const hash = Buffer.alloc(32, 7);
    const insert = (role: string) =>
      c.query(
        `insert into invitations (series_id, email, role, token_hash, expires_at)
         values ($1, 'jo@example.com', $2, $3, now() + interval '14 days')`,
        [ids.series, role, hash],
      );
    await expect(insert('showrunner')).rejects.toThrow(/invitations_role_check/);
    await insert('writer');
    await expect(insert('viewer')).rejects.toThrow(/invitations_token_hash_key/);
  });

  it('usage events are counts with a fixed vocabulary', async () => {
    await c.query(`insert into usage_events (event) values ('pdf_exported')`);
    await expect(
      c.query(`insert into usage_events (event) values ('typed_a_word')`),
    ).rejects.toThrow(/usage_events_event_check/);
  });

  it('deleting a series cascades to its members, episodes and their drafts', async () => {
    await c.query(
      `insert into series_members (series_id, user_id, role) values ($1, $2, 'showrunner')`,
      [ids.series, ids.user],
    );
    await c.query(`insert into drafts (episode_id, kind) values ($1, 'main')`, [ids.episode]);
    await c.query(`delete from series where id = $1`, [ids.series]);
    for (const t of ['series_members', 'episodes', 'drafts']) {
      const { rows } = await c.query<{ n: string }>(`select count(*) as n from ${t}`);
      expect(rows[0]!.n, t).toBe('0');
    }
  });
});
