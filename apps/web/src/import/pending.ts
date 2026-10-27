// An imported script on its way into a new episode (D-077): Home parses the file and creates the
// script, then the editor writes these blocks into the empty document once the server confirms
// it's empty (the same moment a new script gets its first line). Cleared once written.
//
// Kept in this tab's sessionStorage too (D-085), so a reload before the server answers still
// finishes the import instead of leaving an empty script. It's the writer's own file, in the same
// browser that keeps the script's offline copy; closing the tab drops it.
import type { ImportedBlock } from './importScript';

const pending = new Map<string, ImportedBlock[]>();
const key = (episodeId: string) => `wr-import-${episodeId}`;

export const pendingImports = {
  set: (episodeId: string, blocks: ImportedBlock[]) => {
    pending.set(episodeId, blocks);
    try {
      sessionStorage.setItem(key(episodeId), JSON.stringify(blocks));
    } catch {
      // too big or storage blocked: the import still works unless the page reloads first
    }
  },
  get: (episodeId: string): ImportedBlock[] | undefined => {
    const held = pending.get(episodeId);
    if (held) return held;
    try {
      const saved = sessionStorage.getItem(key(episodeId));
      return saved ? (JSON.parse(saved) as ImportedBlock[]) : undefined;
    } catch {
      return undefined;
    }
  },
  clear: (episodeId: string) => {
    pending.delete(episodeId);
    try {
      sessionStorage.removeItem(key(episodeId));
    } catch {
      // fine
    }
  },
};
