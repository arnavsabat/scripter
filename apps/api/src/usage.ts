// Usage counting (SPEC 5.9, D-082): an event name, who, which episode and when. Never content.
// The sync server counts sessions; the API counts what-ifs; the browser reports the rest through
// POST /api/usage.
import type { Q } from './access';

export const BROWSER_EVENTS = ['scene_sent', 'script_imported', 'pdf_exported'] as const;
export type UsageEvent =
  'session_started' | 'multi_writer_session' | 'whatif_created' | (typeof BROWSER_EVENTS)[number];

/** Records `count` of one event (a send of three scenes is three "scene sent"). */
export async function countUsage(
  q: Q,
  event: UsageEvent,
  userId: string,
  episodeId: string,
  count = 1,
): Promise<void> {
  await q.query(
    `insert into usage_events (event, user_id, episode_id)
     select $1, $2, $3 from generate_series(1, $4)`,
    [event, userId, episodeId, count],
  );
}
