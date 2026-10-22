// ⚠️ TEMPORARY, DEVELOPMENT ONLY (D-014, item 8). Keeps the local script in this browser's
// IndexedDB so work survives a reload until the sync server exists. It stores the Y.Doc's full
// state as one binary blob. Delete this file when the editor connects to apps/sync.
import * as Y from 'yjs';

export interface ScriptStore {
  /** The saved Y.Doc state, or null for a brand-new script. */
  load(): Promise<Uint8Array | null>;
  save(state: Uint8Array): Promise<void>;
}

const DB = 'writers-room-dev';
const STORE = 'scripts';
const KEY = 'local-script';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

export const devIndexedDbStore: ScriptStore = {
  async load() {
    const db = await open();
    const value: unknown = await request(db.transaction(STORE).objectStore(STORE).get(KEY));
    db.close();
    return value instanceof Uint8Array ? value : null;
  },
  async save(state) {
    const db = await open();
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(state, KEY));
    db.close();
  },
};

/** Erases the saved dev script (used by `?reset` in the URL). */
export async function resetDevStore() {
  const db = await open();
  await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY));
  db.close();
}

/** For tests: a store that lives in memory. */
export function memoryStore(
  initial: Uint8Array | null = null,
): ScriptStore & { saved: Uint8Array | null } {
  return {
    saved: initial,
    load() {
      return Promise.resolve(this.saved);
    },
    save(state) {
      this.saved = state;
      return Promise.resolve();
    },
  };
}

/** Saves the doc 300 ms after the last change, and immediately when the page is hidden. */
export function autosave(ydoc: Y.Doc, store: ScriptStore) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    void store.save(Y.encodeStateAsUpdate(ydoc));
  };
  const onUpdate = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  };
  const onHide = () => {
    if (timer !== undefined) flush();
  };
  ydoc.on('update', onUpdate);
  window.addEventListener('pagehide', onHide);
  return () => {
    ydoc.off('update', onUpdate);
    window.removeEventListener('pagehide', onHide);
    if (timer !== undefined) flush();
  };
}
