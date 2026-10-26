// Calls to our API (apps/api). Same origin: the Vite dev proxy locally, CloudFront on AWS (D-031).
import { auth } from './auth';

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

async function send(method: Method, path: string, body: unknown, token: string | null) {
  return fetch(path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
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

/** A signed-in call. A 401 gets one retry with a fresh token (the old one may just have expired). */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body, await auth.token());
  if (res.status === 401) res = await send(method, path, body, await auth.retry());
  return read<T>(res);
}

/** The sign-in endpoints and the invitation preview, which need no token. */
export async function publicApi<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return read<T>(await send(method, path, body, null));
}
