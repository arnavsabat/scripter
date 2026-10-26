// Light and dark (SPEC 3.10): follow the system until the writer picks one with the toggle; the
// choice is remembered on this device. tokens.css reads `data-theme` on <html>.
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'wr-theme';
const listeners = new Set<() => void>();
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

/** Before the first render, so a remembered choice never flashes the other theme. */
export function initTheme() {
  const t = saved();
  if (t) document.documentElement.dataset.theme = t;
  dark().addEventListener('change', () => listeners.forEach((l) => l()));
}

const current = (): Theme => saved() ?? (dark().matches ? 'dark' : 'light');

export function toggleTheme() {
  const next: Theme = current() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // private mode: the choice lasts for this page only
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useTheme = () => useSyncExternalStore(subscribe, current);
