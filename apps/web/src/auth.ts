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
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; me: Me };

/** Refresh this long before the access token expires, so a request never carries a stale one. */
const EARLY_MS = 60_000;

let state: AuthState = { status: 'loading' };
let access: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<string> | null = null;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  for (const l of listeners) l();
}

function keep(s: SignedIn) {
  access = { token: s.accessToken, expiresAt: Date.now() + s.expiresIn * 1000 };
  set({ status: 'signedIn', me: s.user });
}

/** Trades the refresh cookie for an access token; signs out if the cookie is gone or revoked. */
function refresh(): Promise<string> {
  refreshing ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('signed out');
      const s = (await res.json()) as SignedIn;
      keep(s);
      return s.accessToken;
    } catch (err) {
      access = null;
      set({ status: 'signedOut' });
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

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
  /** A sign-in just finished (email code or name step). */
  signedIn: keep,
  /** The name step saved a name. */
  renamed: (me: Me) => {
    if (state.status === 'signedIn') set({ status: 'signedIn', me });
  },
  /** A valid access token: the one in memory, or a fresh one. Rejects when signed out. */
  token: (): Promise<string> => {
    if (access && access.expiresAt - Date.now() > EARLY_MS) return Promise.resolve(access.token);
    return refresh();
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
  set({ status: 'loading' });
}
