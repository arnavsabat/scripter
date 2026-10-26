// A throwaway Postgres database per test file, on the local server from docker-compose.yml.
// Tests that use it are skipped unless WR_TEST_SERVICES=1, so `pnpm test` works without containers.
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export const servicesEnabled = process.env.WR_TEST_SERVICES === '1';
if (!servicesEnabled)
  console.log(
    'database tests skipped: run `pnpm services:up`, then `pnpm --filter @wr/api test:services`',
  );

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://wr:wr_dev_only@localhost:5432/writers_room';

export interface TestDb {
  url: string;
  client(): Promise<pg.Client>;
  drop(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const name = `wr_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const opened: pg.Client[] = [];
  return {
    url: url.toString(),
    async client() {
      const c = new pg.Client({ connectionString: url.toString() });
      await c.connect();
      opened.push(c);
      return c;
    },
    async drop() {
      await Promise.all(opened.map((c) => c.end().catch(() => {})));
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}
