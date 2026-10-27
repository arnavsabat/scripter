// Who last changed each of main's scenes, and when (D-080): Compare's "changed by NAME, time".
// Main's editors keep it in main's own document (a Y.Map beside the script), updated a moment
// after they stop typing in a scene, so it syncs and survives like the script does.
import { scenesOfBlocks } from '@wr/schema';
import type * as Y from 'yjs';
import { blocksOfYDoc } from './docs';

export interface SceneEdit {
  by: string;
  at: number;
}

const ORIGIN = { sceneEdits: true };
export const sceneEditsOf = (ydoc: Y.Doc) => ydoc.getMap<SceneEdit>('sceneEdits');

/** Records `name` against the scenes that local edits change. Returns a function that stops it. */
export function trackSceneEdits(
  ydoc: Y.Doc,
  name: string,
  isLocal: (origin: unknown) => boolean,
): () => void {
  const hashes = () => new Map(scenesOfBlocks(blocksOfYDoc(ydoc)).map((s) => [s.id, s.hash]));
  let last = hashes();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const record = () => {
    const now = hashes();
    const changed = [...now].filter(([id, h]) => last.get(id) !== h).map(([id]) => id);
    last = now;
    if (!changed.length) return;
    ydoc.transact(() => {
      for (const id of changed) sceneEditsOf(ydoc).set(id, { by: name, at: Date.now() });
    }, ORIGIN);
  };
  const onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin === ORIGIN) return;
    if (!isLocal(origin)) {
      last = hashes(); // a co-writer's change is theirs to record
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(record, 1500);
  };
  ydoc.on('update', onUpdate);
  return () => {
    clearTimeout(timer);
    ydoc.off('update', onUpdate);
  };
}
