// ⚠️ LEFTOVER of the development auth stub (SPEC 5.6, D-018 item 8). No server accepts these
// tokens any more (D-046); the web app's sign-in (accounts step 5) removes this file. Until then
// only `devIdentity` is used, for the name and color the tests' browsers show.
import { fromBase64UrlEncoded, toBase64UrlEncoded } from 'lib0/buffer';
import { decodeUtf8, encodeUtf8 } from 'lib0/string';

export const DEV_TOKEN_PREFIX = 'DEV-UNSIGNED.';

export interface Identity {
  userId: string;
  name: string;
  /** Index into the presence avatar color pairs (SPEC 3.1). */
  color: number;
}

export const AVATAR_COLORS = 3;

export function makeDevToken(identity: Identity): string {
  return DEV_TOKEN_PREFIX + toBase64UrlEncoded(encodeUtf8(JSON.stringify(identity)));
}

/** Returns the identity, or null for anything that isn't a well-formed dev token. */
export function readDevToken(token: string): Identity | null {
  if (!token.startsWith(DEV_TOKEN_PREFIX)) return null;
  try {
    const value: unknown = JSON.parse(
      decodeUtf8(fromBase64UrlEncoded(token.slice(DEV_TOKEN_PREFIX.length))),
    );
    if (typeof value !== 'object' || value === null) return null;
    const { userId, name, color } = value as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof name !== 'string' || typeof color !== 'number')
      return null;
    return { userId, name: name.slice(0, 40), color: Math.abs(Math.trunc(color)) % AVATAR_COLORS };
  } catch {
    return null;
  }
}

/** The dev identity for a display name: stable ID and color, so the same name looks the same everywhere. */
export function devIdentity(name: string): Identity {
  const clean = name.trim().slice(0, 40) || 'Writer';
  let hash = 0;
  for (const ch of clean.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    userId: `dev-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: clean,
    color: hash % AVATAR_COLORS,
  };
}
