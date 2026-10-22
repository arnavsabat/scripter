// Scene identity (SPEC 4.6): scenes are runs of blocks starting at a scene heading, identified by
// the heading's sceneId. Deleting a heading (or changing its type) folds that scene into the one
// before it; the app shows "Scenes N and N+1 combined · Undo".
import type { Node } from 'prosemirror-model';
import { typeOf } from './schema';

export interface SceneInfo {
  sceneId: string;
  /** 1-based scene number, counting headings. */
  number: number;
  /** Position of the heading block. */
  pos: number;
  heading: string;
  /** Block IDs of the heading and everything up to the next heading. */
  blockIds: string[];
}

export function scenesOf(doc: Node): SceneInfo[] {
  const scenes: SceneInfo[] = [];
  doc.forEach((node, pos) => {
    if (typeOf(node) === 'scene_heading') {
      scenes.push({
        sceneId: String(node.attrs.sceneId),
        number: scenes.length + 1,
        pos,
        heading: node.textContent,
        blockIds: [String(node.attrs.id)],
      });
    } else {
      scenes[scenes.length - 1]?.blockIds.push(String(node.attrs.id));
    }
  });
  return scenes;
}

/** The scene containing document position `pos` (null before the first heading). */
export function sceneAt(scenes: SceneInfo[], pos: number): SceneInfo | null {
  let found: SceneInfo | null = null;
  for (const s of scenes) {
    if (s.pos <= pos) found = s;
    else break;
  }
  return found;
}

export interface Combine {
  /** Scene numbers in the document before the change. */
  first: number;
  second: number;
}

/**
 * Scenes whose heading disappeared while some of their body survived: they were folded into
 * the previous scene. A scene deleted with its body, or the first scene losing its heading
 * (nothing to fold into), isn't reported.
 */
export function detectCombines(before: Node, after: Node): Combine[] {
  const headingsAfter = new Set(scenesOf(after).map((s) => s.sceneId));
  const idsAfter = new Set<string>();
  after.forEach((node) => idsAfter.add(String(node.attrs.id)));
  const combines: Combine[] = [];
  for (const scene of scenesOf(before)) {
    if (scene.number === 1 || headingsAfter.has(scene.sceneId)) continue;
    if (scene.blockIds.slice(1).some((id) => idsAfter.has(id)))
      combines.push({ first: scene.number - 1, second: scene.number });
  }
  return combines;
}

const PREFIX =
  /^(?:INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?)(?:\s+|$)/i;

/**
 * The navigator's friendly name for a scene, as in the prototype: "INT. KITCHEN - MORNING"
 * becomes "Kitchen – Morning" (D-014, item 10).
 */
export function sceneName(heading: string): string {
  const rest = heading.trim().replace(PREFIX, '');
  if (!rest) return 'Untitled scene';
  return rest
    .replace(/\s+[-–—]\s+/g, ' – ')
    .toLowerCase()
    .replace(/(^|[\s(/])([a-z])/g, (_, before: string, ch: string) => before + ch.toUpperCase());
}
