// What the browser reports (D-082): usage events only it can see (SPEC 5.9), and crashes, which
// go to the server log (CloudWatch on AWS). Neither ever carries script content: usage is an event
// name and an episode, and a crash report is the error's message and stack, cut short.
import type { FastifyInstance } from 'fastify';
import { episodeFor } from '../access';
import type { AppDeps } from '../app';
import { ApiError } from '../errors';
import { BROWSER_EVENTS, countUsage } from '../usage';

/** At most `limit` calls a window per key, kept in memory (one API process for the beta). */
export function perWindow(limit: number, windowMs: number) {
  const seen = new Map<string, { start: number; n: number }>();
  return (key: string) => {
    const now = Date.now();
    const s = seen.get(key);
    if (!s || now - s.start >= windowMs) {
      if (seen.size > 10_000) seen.clear();
      seen.set(key, { start: now, n: 1 });
      return true;
    }
    s.n += 1;
    return s.n <= limit;
  };
}
export const perMinute = (limit: number) => perWindow(limit, 60_000);

const tooMany = () => new ApiError(429, 'too_many', 'Too many requests. Try again in a minute.');

export function reportRoutes(app: FastifyInstance, { db }: AppDeps) {
  const usageAllowed = perMinute(120);
  app.post<{ Body: { event: (typeof BROWSER_EVENTS)[number]; episodeId: string; count?: number } }>(
    '/api/usage',
    {
      schema: {
        body: {
          type: 'object',
          required: ['event', 'episodeId'],
          additionalProperties: false,
          properties: {
            event: { type: 'string', enum: [...BROWSER_EVENTS] },
            episodeId: { type: 'string', format: 'uuid' },
            count: { type: 'integer', minimum: 1, maximum: 50 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!usageAllowed(req.user.id)) throw tooMany();
      const { episode } = await episodeFor(db, req.user.id, req.body.episodeId, 'view');
      await countUsage(db, req.body.event, req.user.id, episode.id, req.body.count ?? 1);
      return reply.status(204).send();
    },
  );

  // Public, so a crash on the sign-in page is reported too; limited per address.
  const errorsAllowed = perMinute(20);
  app.post<{ Body: { message: string; stack?: string; version?: string; where?: string } }>(
    '/api/client-errors',
    {
      config: { public: true },
      bodyLimit: 16 * 1024,
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          additionalProperties: false,
          properties: {
            message: { type: 'string', maxLength: 2000 },
            stack: { type: 'string', maxLength: 8000 },
            version: { type: 'string', maxLength: 64 },
            where: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    (req, reply) => {
      if (!errorsAllowed(req.ip)) throw tooMany();
      const { message, stack, version, where } = req.body;
      req.log.warn(
        {
          clientError: {
            message: message.slice(0, 500),
            stack: stack?.slice(0, 4000),
            version,
            where,
          },
        },
        'browser error',
      );
      return reply.status(204).send();
    },
  );
}
