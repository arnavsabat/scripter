import type pg from 'pg';

/** Runs `fn` in one transaction: committed if it returns, rolled back if it throws. */
export async function withTx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const result = await fn(c);
    await c.query('commit');
    return result;
  } catch (err) {
    await c.query('rollback');
    throw err;
  } finally {
    c.release();
  }
}

/**
 * Tells the sync servers that access changed (D-031). Sent inside the transaction, so Postgres
 * delivers it only if the change commits. Each server re-checks its open connections to the
 * named series (or just that episode).
 */
export async function notifyAccess(
  c: pg.PoolClient,
  change: { series: string; episode?: string },
): Promise<void> {
  await c.query(`select pg_notify('wr_access', $1)`, [JSON.stringify(change)]);
}
