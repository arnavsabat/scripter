// Home's data (GET /api/home, D-042): one request, repeated every 15 s and whenever the tab
// regains focus (D-033), which is how the green "editing now" dot appears and fades.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export interface Person {
  id: string;
  name: string;
}
export interface HomeEpisode {
  id: string;
  name: string;
  number: number;
  editedAt: string;
  writers: Person[];
  live: Person[];
  canEdit: boolean;
}
export interface HomeSeries {
  id: string;
  name: string;
  isSeries: boolean;
  role: 'showrunner' | 'writer' | 'viewer';
  canEdit: boolean;
  episodes: HomeEpisode[];
}
export interface Invitation {
  id: string;
  seriesId: string;
  seriesName: string;
  from: string;
  role: string;
}
export type TrashItem =
  | { kind: 'series' | 'script'; id: string; name: string; episodes: number; deletedAt: string }
  | {
      kind: 'episode';
      id: string;
      name: string;
      number: number;
      seriesId: string;
      seriesName: string;
      deletedAt: string;
    };
export interface HomeData {
  series: HomeSeries[];
  recent: string[];
  invitations: Invitation[];
  trash: TrashItem[];
  /** When this answer arrived: "edited 2 min ago" and "29 days left" count from here. */
  fetchedAt: number;
}

const EVERY_MS = 15_000;

export function useHome() {
  const [data, setData] = useState<HomeData | null>(null);
  const [asked, setAsked] = useState(0);
  /** Ask again now (after a change), as well as every 15 s and on focus. */
  const reload = useCallback(() => setAsked((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<Omit<HomeData, 'fetchedAt'>>('GET', '/api/home').then(
      (d) => {
        if (live) setData({ ...d, fetchedAt: Date.now() });
      },
      () => {}, // offline or signed out: keep showing what we had
    );
    return () => {
      live = false;
    };
  }, [asked]);
  useEffect(() => {
    const timer = setInterval(reload, EVERY_MS);
    window.addEventListener('focus', reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', reload);
    };
  }, [reload]);
  return { data, reload };
}

/** "Ep 2 · Undertow", or a plain script's own name (D-033). */
export const episodeLabel = (s: HomeSeries, e: { name: string; number: number }) =>
  s.isSeries ? `Ep ${e.number} · ${e.name}` : e.name;

const firstName = (p: Person, me: string) => (p.id === me ? 'you' : p.name.split(/\s+/)[0]!);

export function editedAgo(iso: string, now: number) {
  const at = new Date(iso);
  if (now - at.getTime() < 60_000) return 'just now';
  const sameYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "● Maya, Sam · editing now" or "Maya · edited Oct 12" (SPEC 3.10, D-033). */
export function rowMeta(e: HomeEpisode, me: string, now: number) {
  if (e.live.length)
    return { live: true, text: `${e.live.map((p) => firstName(p, me)).join(', ')} · editing now` };
  const who = e.writers.map((p) => firstName(p, me)).join(', ');
  return { live: false, text: `${who ? `${who} · ` : ''}edited ${editedAgo(e.editedAt, now)}` };
}

const PHRASE = {
  showrunner: 'you’re the showrunner',
  writer: 'you’re a writer',
  viewer: 'you’re a viewer',
} as const;

/** "3 episodes · you’re the showrunner", or for a plain script "Script · just you" (D-033). */
export function seriesMeta(s: HomeSeries, me: string) {
  if (!s.isSeries) {
    const others = (s.episodes[0]?.writers ?? []).filter((p) => p.id !== me);
    return `Script · ${others.length ? `you and ${others.map((p) => firstName(p, me)).join(', ')}` : 'just you'}`;
  }
  const n = s.episodes.length;
  return `${n} episode${n === 1 ? '' : 's'} · ${PHRASE[s.role]}`;
}
