// What the script screen needs to connect: the sync servers, the draft's document, who we are
// (for presence), and a fresh access token on every connect (D-046).
import type { BlockSpec } from '@wr/schema';
import type { Identity } from '@wr/shared';

export interface Session {
  /** One sync server URL, or the cluster's list (the client picks one at random, D-022). */
  serverUrl: string | readonly string[];
  /** The main draft's document ID, from the API (SPEC 5.2). */
  docId: string;
  identity: Identity;
  /** The sign-in token, or a function asked for a fresh one on every connect (D-046). */
  token: string | (() => Promise<string>);
  /** False for viewers and unassigned writers: the page is read-only ("View only", D-033). */
  canEdit?: boolean;
  /** An imported script to write into the new, empty document (D-077), then `onSeeded`. */
  seed?: readonly BlockSpec[];
  onSeeded?: () => void;
}

/** Two-letter initials for an avatar: "Maya" → "MA", "Sam Jones" → "SJ". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return raw.toUpperCase();
}
