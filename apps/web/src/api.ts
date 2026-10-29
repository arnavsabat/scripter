// Calls to our API (apps/api). Same origin: the Vite dev proxy locally, CloudFront on AWS (D-031).
import { Unreachable, auth } from './auth';

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * What "can't reach" says (D-107). The browser knows when it's offline; otherwise the fault is
 * ours (the servers are down or failing), and the message says so rather than blaming the
 * writer's connection.
 */
export const OFFLINE =
  'You’re offline. Your work is safe on this device and syncs when you’re back.';
export const OUR_FAULT =
  'Scripter isn’t responding. That’s on us, not your connection. Try again in a minute.';
export const unreachableMessage = () => (navigator.onLine === false ? OFFLINE : OUR_FAULT);

/** No answer, or a 502-504 from whatever sits in front of the API, reads as "can't reach" (D-084). */
async function send(method: Method, path: string, body: unknown, token: string | null) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }).catch(() => {
    throw new ApiFailure(0, 'unreachable', unreachableMessage());
  });
  if (res.status >= 502 && res.status <= 504)
    throw new ApiFailure(res.status, 'unreachable', unreachableMessage());
  return res;
}

async function read<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok)
    throw new ApiFailure(
      res.status,
      json.error ?? 'error',
      json.message ?? 'Something went wrong.',
    );
  return json as T;
}

/** The access token, or "can't reach" when it can't be renewed because the API is away. */
const unreachable = (err: unknown) => {
  if (err instanceof Unreachable) throw new ApiFailure(0, 'unreachable', unreachableMessage());
  throw err;
};
const token = () => auth.token().catch(unreachable);
const retryToken = () => auth.retry().catch(unreachable);

/** A signed-in call. A 401 gets one retry with a fresh token (the old one may just have expired). */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body, await token());
  if (res.status === 401) res = await send(method, path, body, await retryToken());
  return read<T>(res);
}

/** The sign-in endpoints and the invitation preview, which need no token. */
export async function publicApi<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return read<T>(await send(method, path, body, null));
}

/** A signed-in GET of raw bytes (a snapshot's state, D-080). */
export async function apiBytes(path: string): Promise<Uint8Array> {
  let res = await send('GET', path, undefined, await token());
  if (res.status === 401) res = await send('GET', path, undefined, await retryToken());
  if (!res.ok) await read(res);
  return new Uint8Array(await res.arrayBuffer());
}
