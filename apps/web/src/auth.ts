// Signed-in state in the browser (D-031). The access token lives here, in memory only, and lasts
// an hour; the refresh token is an httpOnly cookie the page can't read, which /api/auth/refresh
// trades for a new access token on load and before the old one runs out.
import { useSyncExternalStore } from 'react';

export interface Me {
  id: string;
  name: string;
  email: string;
}

export interface SignedIn {
  accessToken: string;
  expiresIn: number;
  user: Me;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; me: Me }
  /** The API didn't answer at the app's start (D-084): retrying by itself. */
  | { status: 'unreachable' };

/** Refresh this long before the access token expires, so a request never carries a stale one. */
const EARLY_MS = 60_000;
/** Set while signed in, so the app's start can show Home's skeleton rather than nothing (D-084). */
const HINT = 'wr-signed-in';

let state: AuthState = { status: 'loading' };
let access: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<string> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  try {
    if (next.status === 'signedIn') localStorage.setItem(HINT, '1');
    if (next.status === 'signedOut') localStorage.removeItem(HINT);
  } catch {
    // storage blocked: the hint is only a nicety
  }
  for (const l of listeners) l();
}

function keep(s: SignedIn) {
  access = { token: s.accessToken, expiresAt: Date.now() + s.expiresIn * 1000 };
  attempt = 0;
  clearTimeout(retryTimer);
  set({ status: 'signedIn', me: s.user });
}

/** No answer, or the server (or CloudFront in front of it) failing: not the same as signed out. */
export class Unreachable extends Error {}

/** At the start, try again with backoff and full jitter: up to 1 s, 2 s, 4 s… capped at 30 s. */
function scheduleRetry() {
  clearTimeout(retryTimer);
  attempt += 1;
  const wait = Math.random() * Math.min(30_000, 1000 * 2 ** (attempt - 1));
  retryTimer = setTimeout(() => void refresh().catch(() => {}), wait);
}

/**
 * Trades the refresh cookie for an access token. A refused cookie signs out; an unreachable API
 * doesn't: at the start it shows the "can't reach" notice, and once signed in it changes nothing
 * (the script stays open, and the next request tries again).
 */
function refresh(): Promise<string> {
  refreshing ??= (async () => {
    try {
      let res: Response;
      try {
        res = await fetch('/api/auth/refresh', { method: 'POST' });
      } catch {
        throw new Unreachable();
      }
      if (res.status >= 500) throw new Unreachable();
      if (!res.ok) throw new Error('signed out');
      const s = (await res.json()) as SignedIn;
      keep(s);
      return s.accessToken;
    } catch (err) {
      if (err instanceof Unreachable) {
        if (state.status !== 'signedIn') {
          set({ status: 'unreachable' });
          scheduleRetry();
        }
      } else {
        access = null;
        set({ status: 'signedOut' });
      }
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

if (typeof window !== 'undefined')
  window.addEventListener('online', () => {
    if (state.status === 'unreachable') void refresh().catch(() => {});
  });

export const auth = {
  get: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** On load: are we still signed in? */
  start: () => {
    if (state.status === 'loading') void refresh().catch(() => {});
  },
  /** The "can't reach" notice's Try again. */
  retryNow: () => {
    clearTimeout(retryTimer);
    return refresh().then(
      () => true,
      () => false,
    );
  },
  /** Whether this browser was signed in last time, so the start can show a skeleton (D-084). */
  wasSignedIn: () => {
    try {
      return localStorage.getItem(HINT) === '1';
    } catch {
      return false;
    }
  },
  /** A sign-in just finished (email code or name step). */
  signedIn: keep,
  /** The name step saved a name. */
  renamed: (me: Me) => {
    if (state.status === 'signedIn') set({ status: 'signedIn', me });
  },
  /** A valid access token: the one in memory, or a fresh one. Rejects when signed out. */
  token: (): Promise<string> => {
    if (access && access.expiresAt - Date.now() > EARLY_MS) return Promise.resolve(access.token);
    // Can't renew it right now, but it hasn't run out: use it while it lasts.
    const current = access;
    return refresh().catch((err: unknown) => {
      if (err instanceof Unreachable && current && current.expiresAt > Date.now())
        return current.token;
      throw err;
    });
  },
  /** The server said 401: the token in memory is no good, so get another. */
  retry: () => refresh(),
  signOut: async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    access = null;
    set({ status: 'signedOut' });
  },
};

export const useAuth = () => useSyncExternalStore(auth.subscribe, auth.get);

/** Tests only: forget everything, as a page reload would (the refresh cookie stays). */
export function reloadAuthForTests() {
  access = null;
  refreshing = null;
  attempt = 0;
  clearTimeout(retryTimer);
  set({ status: 'loading' });
}
