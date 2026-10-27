// Page geometry in characters and lines (SPEC 3.8, D-003): US Letter at 10 characters and
// 6 lines per inch. The screen (apps/web/src/script.css) and the PDF use these same numbers.
import type { ElementType } from '@wr/schema';

/** 9 in of text between the 1 in top and bottom margins, at 6 lines per inch. */
export const LINES_PER_PAGE = 54;

/** Where each element starts, in inches from the page's left edge, and how wide it may run. */
export const COLUMNS: Record<ElementType, { left: number; width: number }> = {
  scene_heading: { left: 1.5, width: 60 },
  action: { left: 1.5, width: 60 },
  shot: { left: 1.5, width: 60 },
  character: { left: 3.7, width: 38 },
  parenthetical: { left: 3.1, width: 24 },
  dialogue: { left: 2.5, width: 35 },
  transition: { left: 1.5, width: 60 }, // right-aligned to 7.5 in
};

/** Shown in capitals; the stored text keeps the writer's casing (D-014). */
export const UPPERCASE: ReadonlySet<ElementType> = new Set([
  'scene_heading',
  'character',
  'transition',
  'shot',
]);

const SPEECH: ReadonlySet<ElementType> = new Set(['character', 'parenthetical', 'dialogue']);

/** Blank lines before an element, as script.css spaces them (first on a page: none). */
export function spaceBefore(prev: ElementType | null, type: ElementType): number {
  if (prev === null) return 0;
  if (type === 'scene_heading') return 2; // D-014
  if ((type === 'parenthetical' || type === 'dialogue') && SPEECH.has(prev)) return 0;
  return 1;
}
