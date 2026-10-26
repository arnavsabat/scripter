// The REST API (SPEC 5.1). Every route except /api/health needs a valid Cognito access token
// (D-031); the token's subject is looked up in user_identities to find the person (D-041).
import type { TokenVerifier } from '@wr/auth';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import { ApiError } from './errors';
import type { Mailer } from './mailer';
import { episodeRoutes } from './routes/episodes';
import { homeRoutes } from './routes/home';
import { invitationRoutes } from './routes/invitations';
import { seriesRoutes } from './routes/series';

export interface User {
  id: string;
  name: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
  interface FastifyContextConfig {
    /** Reachable without signing in. */
    public?: boolean;
  }
}

export interface AppDeps {
  db: pg.Pool;
  verify: TokenVerifier;
  mailer: Mailer;
  /** Where the web app lives, for links in emails (e.g. https://…/i/<token>). */
  appUrl: string;
  logger?: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });
  app.decorateRequest('user', null as unknown as User);

  app.addHook('onRequest', async (req) => {
    if (req.routeOptions.config.public) return;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const verified = token ? await deps.verify(token) : null;
    if (!verified) throw new ApiError(401, 'signed_out', 'Please sign in again.');
    const { rows } = await deps.db.query<User>(
      `select u.id, u.name, u.email from user_identities i join users u on u.id = i.user_id
        where i.cognito_sub = $1`,
      [verified.sub],
    );
    if (!rows[0]) throw new ApiError(401, 'signed_out', 'Please sign in again.');
    req.user = rows[0];
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError)
      return reply.status(err.status).send({ error: err.code, message: err.message });
    const validation = (err as { validation?: unknown }).validation;
    if (validation)
      return reply.status(400).send({ error: 'bad_request', message: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: 'server_error', message: 'Something went wrong.' });
  });

  app.get('/api/health', { config: { public: true } }, () => ({ ok: true }));
  app.get('/api/me', (req) => req.user);

  homeRoutes(app, deps);
  seriesRoutes(app, deps);
  episodeRoutes(app, deps);
  invitationRoutes(app, deps);
  return app;
}
