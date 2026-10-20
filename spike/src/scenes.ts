// Scene-level comparison for the branch test (test 8): group blocks into scenes by scene ID,
// compare base snapshot / what-if / main per scene, render a word diff, and send one scene
// into main as an ordinary ProseMirror edit.
import type { BlockInfo, Client } from './editor';

export interface Scene {
  sceneId: string;
  heading: string;
  blocks: BlockInfo[];
}

/** Blocks before the first heading form a "preamble" scene. */
export function scenesOf(blocks: BlockInfo[]): Scene[] {
  const scenes: Scene[] = [];
  let current: Scene = { sceneId: 'preamble', heading: '', blocks: [] };
  for (const b of blocks) {
    if (b.type === 'scene_heading') {
      if (current.blocks.length) scenes.push(current);
      current = { sceneId: b.sceneId ?? b.id, heading: b.text, blocks: [] };
    }
    current.blocks.push(b);
  }
  if (current.blocks.length) scenes.push(current);
  return scenes;
}

const ser = (s: Scene | undefined) =>
  s ? s.blocks.map((b) => `${b.type}\u0000${b.text}`).join('\u0001') : '';

export type SceneStatus = 'same' | 'differs' | 'conflict';

/**
 * Three-way status for every scene in the what-if:
 * same = matches main; differs = only the what-if changed it; conflict = main changed it too.
 */
export function sceneStatus(base: BlockInfo[], main: BlockInfo[], whatIf: BlockInfo[]) {
  const index = (bs: BlockInfo[]) => new Map(scenesOf(bs).map((s) => [s.sceneId, s]));
  const b = index(base);
  const m = index(main);
  const out: Record<string, SceneStatus> = {};
  for (const s of scenesOf(whatIf)) {
    const wiS = ser(s);
    const baseS = ser(b.get(s.sceneId));
    const mainS = ser(m.get(s.sceneId));
    if (wiS === baseS || wiS === mainS) out[s.heading] = 'same';
    else out[s.heading] = mainS !== baseS ? 'conflict' : 'differs';
  }
  return out;
}

/** Word-level diff (LCS over words and spaces) rendered as <ins>/<del> HTML. */
export function wordDiffHtml(from: string, to: string) {
  const a = from.split(/(\s+)/);
  const b = to.split(/(\s+)/);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = '';
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      html += esc(a[i]!);
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      html += `<ins>${esc(b[j]!)}</ins>`;
      j++;
    } else {
      html += `<del>${esc(a[i]!)}</del>`;
      i++;
    }
  }
  return html.replace(/<\/ins><ins>/g, '').replace(/<\/del><del>/g, '');
}

/**
 * Send to main: replace the scene's blocks in main with the what-if's blocks, as one ordinary
 * ProseMirror transaction on a main client. y-prosemirror turns it into normal Yjs edits, so it
 * syncs to everyone and lands on the sender's undo stack. The two Yjs histories are never merged.
 */
export function sendScene(main: Client, scene: Scene) {
  const { doc } = main.view.state;
  let from = -1;
  let to = doc.content.size;
  doc.forEach((node, pos) => {
    const isHeading = main.kit.typeOf(node) === 'scene_heading';
    if (from >= 0 && isHeading && to === doc.content.size && pos > from) to = pos;
    if (isHeading && node.attrs.sceneId === scene.sceneId) from = pos;
  });
  if (from < 0) throw new Error(`Scene ${scene.sceneId} not in main`);
  const nodes = scene.blocks.map((b) =>
    main.kit.block({
      type: b.type,
      text: b.text,
      id: b.id,
      ...(b.sceneId ? { sceneId: b.sceneId } : {}),
    }),
  );
  main.view.dispatch(main.view.state.tr.replaceWith(from, to, nodes));
}
