// Editing commands. Every structural change (Enter, Tab, Shift+Tab, a type change from the
// element menu, a warning fix) is exactly one transaction, so it's one undo step (SPEC 4.2).
import type { Node } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import { ENTER_EMPTY, ENTER_NEXT, shiftTabTarget, tabTarget, type ElementType } from './elements';
import { newId } from './ids';
import { blockAttrs, blockType, typeOf } from './schema';

/** Marks a transaction as one structural action; the editor gives it its own undo step (D-014). */
export const STRUCTURAL = 'wr-structural';

const EMPTY_PARENS = '()';

/** A line counts as empty if it has no text, or (for a parenthetical) only its "()". */
export function isEmptyLine(node: Node) {
  const text = node.textContent;
  return text === '' || (typeOf(node) === 'parenthetical' && text === EMPTY_PARENS);
}

/** The block the selection starts in, with its document position. */
function currentBlock(state: EditorState) {
  const $from = state.selection.$from;
  return { node: $from.parent, pos: $from.before(1), offset: $from.parentOffset };
}

/**
 * Changes the type of the block at `pos` in place. A line that becomes an empty parenthetical
 * gets "()" with the cursor inside; an empty "()" that stops being a parenthetical loses it.
 */
export function setTypeTr(tr: Transaction, pos: number, to: ElementType): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (!node) throw new Error(`No block at ${pos}`);
  const from = typeOf(node);
  const sceneId = (node.attrs.sceneId as string | null) ?? newId('s');
  tr.setNodeMarkup(pos, undefined, blockAttrs(to, node.attrs.id as string, sceneId));
  if (to === 'parenthetical' && node.textContent === '') {
    tr.insertText(EMPTY_PARENS, pos + 1);
    tr.setSelection(TextSelection.create(tr.doc, pos + 2));
  } else if (
    from === 'parenthetical' &&
    to !== 'parenthetical' &&
    node.textContent === EMPTY_PARENS
  ) {
    tr.delete(pos + 1, pos + 1 + EMPTY_PARENS.length);
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  }
  return tr.setMeta(STRUCTURAL, true);
}

/** Element menu: switch the current line to `to`. */
export const setElementType =
  (to: ElementType): Command =>
  (state, dispatch) => {
    const { node, pos } = currentBlock(state);
    if (typeOf(node) === to) return false;
    if (dispatch) dispatch(setTypeTr(state.tr, pos, to).scrollIntoView());
    return true;
  };

/**
 * Enter (SPEC 4.2, D-014):
 * - on an empty line, change that line in place;
 * - at the start of a non-empty line, open a line above it (the text keeps its type and ID);
 * - otherwise split, and the new line gets the next type. Inside a parenthetical, a cursor just
 *   before the closing ")" splits after it, so the ")" stays put.
 */
export const enter: Command = (state, dispatch) => {
  if (!dispatch) return true;
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const $pos = tr.selection.$from;
  const node = $pos.parent;
  const pos = $pos.before(1);
  const type = typeOf(node);

  if (isEmptyLine(node)) {
    dispatch(setTypeTr(tr, pos, ENTER_EMPTY[type]).scrollIntoView());
    return true;
  }
  if ($pos.parentOffset === 0) {
    const above = type === 'scene_heading' ? 'action' : type;
    tr.insert(pos, blockType.create(blockAttrs(above, newId(), newId('s'))));
    dispatch(tr.setMeta(STRUCTURAL, true).scrollIntoView());
    return true;
  }
  let splitAt = $pos.pos;
  const after = node.textContent.slice($pos.parentOffset);
  if (type === 'parenthetical' && after === ')') splitAt = $pos.end();
  const next = ENTER_NEXT[type];
  tr.split(splitAt, 1, [{ type: blockType, attrs: blockAttrs(next, newId(), newId('s')) }]);
  // A split always puts the cursor at the start of the new line, even when it happened after
  // the cursor (the parenthetical case); +2 steps over the closing and opening block tokens.
  tr.setSelection(TextSelection.create(tr.doc, splitAt + 2));
  dispatch(tr.setMeta(STRUCTURAL, true).scrollIntoView());
  return true;
};

/** Tab (SPEC 4.2, D-014). Always handled, so Tab never moves focus out of the script. */
export const tab: Command = (state, dispatch) => {
  const { node, pos } = currentBlock(state);
  const to = tabTarget(typeOf(node), isEmptyLine(node));
  if (to && dispatch) dispatch(setTypeTr(state.tr, pos, to).scrollIntoView());
  return true;
};

/** Shift+Tab steps back (D-014). Always handled. */
export const shiftTab: Command = (state, dispatch) => {
  const { node, pos } = currentBlock(state);
  const to = shiftTabTarget(typeOf(node));
  if (to && dispatch) dispatch(setTypeTr(state.tr, pos, to).scrollIntoView());
  return true;
};
