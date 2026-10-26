// This browser's copies of scripts (y-indexeddb, for offline editing) and which of them hold
// edits the server hasn't acknowledged yet (D-050): signing out clears the copies, but never
// silently while one of them is still unsynced.
const KEY = 'wr-unsynced';

function read(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable: nothing to remember
  }
}

export const localCopies = {
  /** A local edit to this document hasn't been acknowledged yet. */
  markUnsynced(docId: string) {
    const ids = read();
    if (!ids.includes(docId)) write([...ids, docId]);
  },
  /** Everything in this document is on the server. */
  markSynced(docId: string) {
    const ids = read();
    if (ids.includes(docId)) write(ids.filter((i) => i !== docId));
  },
  unsynced: () => read(),
  /** Deletes one document's copy (after losing edit access, D-046). */
  clear(docId: string): Promise<void> {
    this.markSynced(docId);
    return deleteDb(`wr-${docId}`);
  },
  /** Deletes every script copy in this browser (signing out, D-050). */
  async clearAll(): Promise<void> {
    write([]);
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs
        .map((d) => d.name)
        .filter((n): n is string => !!n?.startsWith('wr-'))
        .map(deleteDb),
    );
  },
};

const deleteDb = (name: string) =>
  new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
