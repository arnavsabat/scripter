// What only the browser sees (D-082): usage events (SPEC 5.9) and crashes. Usage is an event name
// and an episode, never content; a crash report is the error's message and stack. Both are fire
// and forget, so a lost report never bothers the writer.
import { api, publicApi } from './api';

export type BrowserEvent = 'scene_sent' | 'script_imported' | 'pdf_exported';

export function countUsage(event: BrowserEvent, episodeId: string | undefined, count = 1) {
  if (!episodeId) return;
  void api('POST', '/api/usage', { event, episodeId, count }).catch(() => {});
}

const VERSION = (import.meta.env.VITE_WR_VERSION as string | undefined) ?? 'dev';
const MAX_REPORTS = 5; // per page load, so a looping error can't flood the log

/** Sends uncaught errors and rejections to the API's log (CloudWatch on AWS). */
export function reportCrashes() {
  let sent = 0;
  const report = (err: unknown) => {
    if (sent >= MAX_REPORTS) return;
    sent += 1;
    const e = err instanceof Error ? err : new Error(String(err));
    void publicApi('POST', '/api/client-errors', {
      message: `${e.name}: ${e.message}`.slice(0, 2000),
      ...(e.stack ? { stack: e.stack.slice(0, 8000) } : {}),
      version: VERSION,
      where: location.pathname.slice(0, 200),
    }).catch(() => {});
  };
  window.addEventListener('error', (e) => report(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => report(e.reason));
}
