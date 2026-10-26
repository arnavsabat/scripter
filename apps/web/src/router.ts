// A tiny router on the History API (D-048): six fixed routes, real URLs, back and forward.
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'episode'; id: string }
  | { name: 'invite'; token: string }
  | { name: 'terms' }
  | { name: 'privacy' }
  | { name: 'notFound' };

export function parse(path: string): Route {
  if (path === '/' || path === '') return { name: 'home' };
  if (path === '/terms') return { name: 'terms' };
  if (path === '/privacy') return { name: 'privacy' };
  const episode = /^\/e\/([0-9a-f-]{36})$/.exec(path);
  if (episode) return { name: 'episode', id: episode[1]! };
  const invite = /^\/i\/([A-Za-z0-9_-]{20,200})$/.exec(path);
  if (invite) return { name: 'invite', token: invite[1]! };
  return { name: 'notFound' };
}

const listeners = new Set<() => void>();
let current = parse(location.pathname);
const update = () => {
  current = parse(location.pathname);
  for (const l of listeners) l();
};
window.addEventListener('popstate', update);

export function navigate(path: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  update();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useRoute = () => useSyncExternalStore(subscribe, () => current);
