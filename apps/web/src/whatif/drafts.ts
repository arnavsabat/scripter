// The API side of what-ifs and snapshots (D-080): an episode's drafts, forking, restore points.
import { api, apiBytes } from '../api';

export interface DraftInfo {
  id: string;
  kind: 'main' | 'whatif';
  name: string;
  baseSnapshotId: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  scenesDiffer: number;
}

export interface SnapshotInfo {
  id: string;
  draftId: string;
  kind: 'automatic' | 'manual';
  label: string;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  fromDraftId: string | null;
}

/** Bytes as base64, in chunks (a long script's state is too big for one String.fromCharCode). */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const listDrafts = async (episodeId: string) =>
  (await api<{ drafts: DraftInfo[] }>('GET', `/api/episodes/${episodeId}/drafts`)).drafts;

export const createWhatIf = (episodeId: string, mainState: Uint8Array, name?: string) =>
  api<DraftInfo>('POST', `/api/episodes/${episodeId}/whatifs`, {
    state: toBase64(mainState),
    ...(name ? { name } : {}),
  });

export const listSnapshots = async (draftId: string) =>
  (await api<{ snapshots: SnapshotInfo[] }>('GET', `/api/drafts/${draftId}/snapshots`)).snapshots;

export const createSnapshot = (
  draftId: string,
  state: Uint8Array,
  reason: 'manual' | 'send' | 'restore',
  extra: { fromDraftId?: string; restoringId?: string } = {},
) =>
  api<{ snapshot: SnapshotInfo; reused: boolean }>('POST', `/api/drafts/${draftId}/snapshots`, {
    state: toBase64(state),
    reason,
    ...extra,
  });

export const snapshotState = (snapshotId: string) => apiBytes(`/api/snapshots/${snapshotId}/state`);

export const reportScenesDiffer = (draftId: string, scenesDiffer: number) =>
  api('PATCH', `/api/drafts/${draftId}`, { scenesDiffer });

/** "just now", "5 min ago", "2h ago", "Oct 15": how the Drafts tab dates things. */
export function when(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const min = Math.round((now - t) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
