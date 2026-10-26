// One person per verified email (D-041). Each Cognito user (one per way of signing in) is linked
// to the person with that email, or creates them.
import type { IdClaims } from '@wr/auth';
import type pg from 'pg';
import type { User } from '../app';
import { withTx } from '../db/tx';
import { ApiError } from '../errors';

export async function linkSignIn(
  db: pg.Pool,
  claims: IdClaims,
): Promise<{ user: User; isNew: boolean }> {
  if (!claims.emailVerified)
    throw new ApiError(403, 'email_unverified', 'That email address isn’t verified.');
  return withTx(db, async (c) => {
    const linked = await c.query<User>(
      `select u.id, u.name, u.email from user_identities i join users u on u.id = i.user_id
        where i.cognito_sub = $1`,
      [claims.sub],
    );
    if (linked.rows[0]) return { user: linked.rows[0], isNew: false };
    const fallback = claims.email.split('@')[0]!.slice(0, 80) || 'Writer';
    // Two first sign-ins racing with one address both land on the same person.
    const created = await c.query<User>(
      `insert into users (email, name) values ($1, $2)
       on conflict ((lower(email))) do nothing
       returning id, name, email`,
      [claims.email, claims.name ?? fallback],
    );
    const user =
      created.rows[0] ??
      (
        await c.query<User>(`select id, name, email from users where lower(email) = lower($1)`, [
          claims.email,
        ])
      ).rows[0]!;
    await c.query(
      `insert into user_identities (cognito_sub, user_id, provider) values ($1, $2, $3)
       on conflict (cognito_sub) do nothing`,
      [claims.sub, user.id, claims.provider],
    );
    return { user, isNew: created.rows.length === 1 };
  });
}
