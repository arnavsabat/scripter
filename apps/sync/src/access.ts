// Who is connecting, and what they may do with an episode (SPEC 5.3, D-031, D-046). The home
// server asks at connect time and again whenever the API reports an access change. Production
// reads Postgres (pgAccess.ts); tests that don't need a database use memoryAccess() below.
import { AVATAR_COLORS, type Identity } from '@wr/shared';

/** What a connection may do: type in the episode, or only read it (it still sees edits and presence). */
export type Mode = 'edit' | 'view';

export type AccessResult =
  | { ok: true; mode: Mode; seriesId: string; episodeId: string }
  | { ok: false; reason: 'none' | 'deleted' | 'unknown' };

/** Sent by the API on every access change (NOTIFY wr_access): a whole series, or one episode in it. */
export interface AccessChange {
  series: string;
  episode?: string;
}

export interface AccessSource {
  /** The person a verified token's subject is linked to (D-041), or null if it isn't linked. */
  identify(sub: string): Promise<Identity | null>;
  /** What this person may do with this document (a draft's Y.Doc) right now. */
  check(userId: string, docId: string): Promise<AccessResult>;
  /**
   * Calls `onChange` for each access change. `onResync` runs when changes may have been missed
   * (the listening connection dropped and came back), so every connection is re-checked.
   */
  subscribe(onChange: (c: AccessChange) => void, onResync: () => void): void;
  /** Home's green dot (D-033): who's connected to an episode, refreshed every 10 s. */
  present(episodeId: string, userIds: readonly string[], serverId: string): Promise<void>;
  left(episodeId: string, userId: string): Promise<void>;
  /** "edited Oct 12": called at most once a minute per episode while edits arrive. */
  edited(episodeId: string): Promise<void>;
  close(): Promise<void>;
}

/** A stable avatar color for a person (SPEC 3.1's three pairs). */
export function colorFor(userId: string): number {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % AVATAR_COLORS;
}

/**
 * For tests without a database. A token's subject is the person's name ("Maya" signs in as Maya).
 * Everyone may edit every document unless a test says otherwise with set(); notify() plays the
 * part of the API's NOTIFY.
 */
export function memoryAccess(defaultMode: Mode | 'none' = 'edit') {
  const rules = new Map<string, AccessResult>(); // `${userId} ${docId}`
  const listeners: ((c: AccessChange) => void)[] = [];
  const presence = new Map<string, Set<string>>();
  const edits = new Map<string, number>();
  const key = (u: string, d: string) => `${u} ${d}`;
  const idFor = (name: string) => `u-${name.toLowerCase()}`;
  const source: AccessSource & {
    set(name: string, docId: string, r: Mode | 'none' | 'deleted'): void;
    notify(c: AccessChange): void;
    presence: Map<string, Set<string>>;
    edits: Map<string, number>;
  } = {
    identify(sub) {
      return Promise.resolve({ userId: idFor(sub), name: sub, color: colorFor(idFor(sub)) });
    },
    check(userId, docId) {
      const rule = rules.get(key(userId, docId));
      if (rule) return Promise.resolve(rule);
      return Promise.resolve(
        defaultMode === 'none'
          ? { ok: false as const, reason: 'none' as const }
          : { ok: true as const, mode: defaultMode, seriesId: 's-test', episodeId: docId },
      );
    },
    subscribe(onChange) {
      listeners.push(onChange);
    },
    present(episodeId, userIds) {
      presence.set(episodeId, new Set(userIds));
      return Promise.resolve();
    },
    left(episodeId, userId) {
      presence.get(episodeId)?.delete(userId);
      return Promise.resolve();
    },
    edited(episodeId) {
      edits.set(episodeId, (edits.get(episodeId) ?? 0) + 1);
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
    set(name, docId, r) {
      rules.set(
        key(idFor(name), docId),
        r === 'none' || r === 'deleted'
          ? { ok: false, reason: r }
          : { ok: true, mode: r, seriesId: 's-test', episodeId: docId },
      );
    },
    notify(c) {
      for (const l of listeners) l(c);
    },
    presence,
    edits,
  };
  return source;
}
