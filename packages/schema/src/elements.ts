// Screenplay element types and the Enter/Tab state machine tables (SPEC 4.2, D-014).

export const ELEMENT_TYPES = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const isElementType = (x: unknown): x is ElementType =>
  typeof x === 'string' && (ELEMENT_TYPES as readonly string[]).includes(x);

/** Element menu order, labels and single-key shortcuts (SPEC 4.3). */
export const ELEMENT_MENU: readonly { type: ElementType; label: string; key: string }[] = [
  { type: 'scene_heading', label: 'Scene', key: 'S' },
  { type: 'action', label: 'Action', key: 'A' },
  { type: 'character', label: 'Character', key: 'C' },
  { type: 'parenthetical', label: 'Parens', key: 'P' },
  { type: 'dialogue', label: 'Dialogue', key: 'D' },
  { type: 'shot', label: 'Shot', key: 'H' },
  { type: 'transition', label: 'Transition', key: 'T' },
];

/** Shown in capitals; the stored text keeps the writer's casing (D-014). */
export const UPPERCASE_TYPES: ReadonlySet<ElementType> = new Set([
  'scene_heading',
  'character',
  'shot',
  'transition',
]);

/** Enter at the end (or middle) of a line: the new line's type (SPEC 4.2). */
export const ENTER_NEXT: Readonly<Record<ElementType, ElementType>> = {
  scene_heading: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'scene_heading',
  shot: 'action',
};

/** Enter on an empty line changes that line in place (D-014). */
export const ENTER_EMPTY: Readonly<Record<ElementType, ElementType>> = {
  action: 'scene_heading',
  scene_heading: 'action',
  character: 'action',
  dialogue: 'action',
  parenthetical: 'dialogue',
  transition: 'action',
  shot: 'action',
};

/** Tab (SPEC 4.2 plus D-014). `empty` rules apply only to an empty line. Anything else: no-op. */
export function tabTarget(type: ElementType, empty: boolean): ElementType | null {
  if (type === 'action' && empty) return 'character';
  if (type === 'character' && empty) return 'transition';
  if (type === 'transition' && empty) return 'scene_heading';
  if (type === 'dialogue') return 'parenthetical';
  if (type === 'parenthetical') return 'dialogue';
  return null;
}

/** Shift+Tab steps back (D-014). */
export function shiftTabTarget(type: ElementType): ElementType | null {
  if (type === 'character') return 'action';
  if (type === 'parenthetical') return 'dialogue';
  if (type === 'transition') return 'character';
  return null;
}
