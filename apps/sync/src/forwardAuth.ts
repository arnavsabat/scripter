// How a forwarded connection proves who the writer is (D-022). The entry server has already
// verified the writer's token; it passes the identity to the home server in a header signed
// with a secret shared only by the cluster (HMAC-SHA256), valid for 30 seconds.
import type { Identity } from '@wr/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const FORWARD_HEADER = 'x-wr-forwarded';
const VALID_MS = 30_000;

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export function signForward(identity: Identity, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ ...identity, exp: Date.now() + VALID_MS })).toString(
    'base64url',
  );
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyForward(header: string | undefined, secret: string): Identity | null {
  if (!header) return null;
  const [payload, signature] = header.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Identity & {
      exp: number;
    };
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return { userId: data.userId, name: data.name, color: data.color };
  } catch {
    return null;
  }
}
