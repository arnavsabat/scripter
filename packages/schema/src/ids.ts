// Stable, unique block and scene IDs (SPEC 4.6), kept unique through paste, split and merges.
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { typeOf } from './schema';

// The schema package runs in browsers and Node alike; both provide these globals.
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };
declare function setTimeout(callback: () => void, ms: number): unknown;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A new random ID: a prefix plus 10 base-36 characters (about 52 bits). */
export function newId(prefix: 'b' | 's' = 'b'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = prefix;
  for (const byte of bytes) out += ALPHABET[byte % 36];
  return out;
}

/**
 * Repairs missing and duplicate IDs. Deterministic: the first occurrence keeps its ID and later
 * ones become `<id>-2`, `<id>-3`, … So when two clients repair the same merged document, they
 * choose the same IDs and their repairs agree instead of fighting (D-013, P3).
 */
export function repairIds(state: EditorState): Transaction | null {
  const used = new Set<string>();
  const usedScenes = new Set<string>();
  state.doc.forEach((node) => {
    if (typeof node.attrs.id === 'string') used.add(node.attrs.id);
    if (typeof node.attrs.sceneId === 'string') usedScenes.add(node.attrs.sceneId);
  });
  const seen = new Set<string>();
  const seenScenes = new Set<string>();
  const fresh = (base: string, pool: Set<string>) => {
    let n = 2;
    while (pool.has(`${base}-${n}`)) n++;
    const id = `${base}-${n}`;
    pool.add(id);
    return id;
  };
  const tr = state.tr;
  state.doc.forEach((node: Node, pos, index) => {
    const attrs = { ...node.attrs };
    let changed = false;
    const id = typeof attrs.id === 'string' && attrs.id ? attrs.id : null;
    if (!id || seen.has(id)) {
      attrs.id = fresh(id ?? `b-at${index}`, used);
      changed = true;
    }
    seen.add(attrs.id as string);
    const isHeading = typeOf(node) === 'scene_heading';
    const sceneId = typeof attrs.sceneId === 'string' && attrs.sceneId ? attrs.sceneId : null;
    if (isHeading && (!sceneId || seenScenes.has(sceneId))) {
      attrs.sceneId = fresh(sceneId ?? `s-at${index}`, usedScenes);
      changed = true;
    } else if (!isHeading && sceneId) {
      attrs.sceneId = null;
      changed = true;
    }
    if (isHeading) seenScenes.add(attrs.sceneId as string);
    if (changed) tr.setNodeMarkup(pos, undefined, attrs);
  });
  return tr.docChanged ? tr.setMeta(idPluginKey, true) : null;
}

export const idPluginKey = new PluginKey('wr-ids');

export interface IdPluginOptions {
  /** True for transactions that apply a co-writer's change (set by the sync layer). */
  isRemote?: (tr: Transaction) => boolean;
}

/**
 * After local edits, repairs IDs in appendTransaction, so the repair joins the same undo step.
 * After a remote change, appended transactions are never synced by y-prosemirror (spike finding
 * F2), so the repair runs as its own deferred transaction, kept out of the undo history.
 */
export function idPlugin({ isRemote = () => false }: IdPluginOptions = {}) {
  let remotePending = false;
  let scheduled = false;
  return new Plugin({
    key: idPluginKey,
    appendTransaction(trs, _old, state) {
      if (!trs.some((tr) => tr.docChanged)) return null;
      if (trs.some(isRemote)) {
        remotePending = true;
        return null;
      }
      return repairIds(state);
    },
    view: () => ({
      update(view) {
        if (!remotePending || scheduled) return;
        remotePending = false;
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          if (view.isDestroyed) return;
          const tr = repairIds(view.state);
          if (tr) view.dispatch(tr.setMeta('addToHistory', false));
        }, 0);
      },
    }),
  });
}
