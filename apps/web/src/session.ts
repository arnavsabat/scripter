// Who is writing, and which episode (D-018 item 8). ⚠️ The identity is a DEVELOPMENT STUB:
// `?as=Maya` picks the writer and the token is unsigned. Cognito replaces this with accounts.
import { devIdentity, makeDevToken, type Identity } from '@wr/shared';

export interface Session {
  serverUrl: string;
  docId: string;
  identity: Identity;
  token: string;
}

export function sessionFromUrl(url: URL, serverUrl: string): Session {
  const identity = devIdentity(url.searchParams.get('as') ?? 'Writer');
  const docId = (url.searchParams.get('ep') ?? 'dev-episode').toLowerCase();
  return { serverUrl, docId, identity, token: makeDevToken(identity) };
}

/** Two-letter initials for an avatar: "Maya" → "MA", "Sam Jones" → "SJ". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return raw.toUpperCase();
}
