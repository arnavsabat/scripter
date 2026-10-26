// Who a connection is, as presence shows it: the person's ID, display name and avatar color.

export interface Identity {
  userId: string;
  name: string;
  /** Index into the presence avatar color pairs (SPEC 3.1). */
  color: number;
}

export const AVATAR_COLORS = 3;

/** A stable avatar color for a person, the same in every browser and on every server. */
export function colorFor(userId: string): number {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % AVATAR_COLORS;
}
