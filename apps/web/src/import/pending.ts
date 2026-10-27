// An imported script on its way into a new episode (D-077): Home parses the file and creates the
// script, then the editor writes these blocks into the empty document once the server confirms
// it's empty (the same moment a new script gets its first line). Cleared once written.
import type { ImportedBlock } from './importScript';

const pending = new Map<string, ImportedBlock[]>();

export const pendingImports = {
  set: (episodeId: string, blocks: ImportedBlock[]) => void pending.set(episodeId, blocks),
  get: (episodeId: string) => pending.get(episodeId),
  clear: (episodeId: string) => void pending.delete(episodeId),
};
