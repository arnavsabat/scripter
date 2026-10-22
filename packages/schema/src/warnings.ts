// Formatting warnings (SPEC 4.5, D-014). Typing never breaks the format, but simultaneous edits,
// offline merges or deleting a cue can. These are computed from the document on every change
// (spike finding F3: never mapped through transactions), and fixing one is a single action.
import type { Node } from 'prosemirror-model';
import { TextSelection, type Command } from 'prosemirror-state';
import type { ElementType } from './elements';
import { STRUCTURAL, setTypeTr } from './commands';
import { newId } from './ids';
import { blockAttrs, blockType, typeOf } from './schema';

export interface FormattingIssue {
  kind: 'orphan-dialogue';
  /** Position of the block that starts the orphaned dialogue run. */
  pos: number;
  blockId: string;
}

const DIALOGUE_RUN: ReadonlySet<ElementType> = new Set(['character', 'parenthetical', 'dialogue']);

/** Dialogue or a parenthetical with no character cue above it: only the first line of the run is flagged. */
export function findIssues(doc: Node): FormattingIssue[] {
  const issues: FormattingIssue[] = [];
  let prev: ElementType | null = null;
  doc.forEach((node, pos) => {
    const type = typeOf(node);
    if (
      (type === 'dialogue' || type === 'parenthetical') &&
      (prev === null || !DIALOGUE_RUN.has(prev))
    )
      issues.push({ kind: 'orphan-dialogue', pos, blockId: String(node.attrs.id) });
    prev = type;
  });
  return issues;
}

/** Fix: insert an empty character cue above the line and put the cursor in it. */
export const addCueAbove =
  (pos: number): Command =>
  (state, dispatch) => {
    if (!dispatch) return true;
    const tr = state.tr.insert(pos, blockType.create(blockAttrs('character', newId(), null)));
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    dispatch(tr.setMeta(STRUCTURAL, true).scrollIntoView());
    return true;
  };

/** Fix: turn the line into action. */
export const makeAction =
  (pos: number): Command =>
  (state, dispatch) => {
    if (dispatch) dispatch(setTypeTr(state.tr, pos, 'action'));
    return true;
  };
