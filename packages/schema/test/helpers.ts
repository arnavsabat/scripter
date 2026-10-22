import { EditorState, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { idPlugin } from '../src/ids';
import { blockAttrs, blockType, schema, typeOf, type BlockSpec } from '../src/schema';

let n = 0;
export function doc(specs: BlockSpec[]) {
  return schema.nodes.doc.create(
    null,
    specs.map((s) =>
      blockType.create(
        blockAttrs(s.type, s.id ?? `t${n++}`, s.sceneId ?? `ts${n++}`),
        s.text ? schema.text(s.text) : null,
      ),
    ),
  );
}

export function state(specs: BlockSpec[]) {
  return EditorState.create({ schema, doc: doc(specs), plugins: [idPlugin()] });
}

/** Document position at `offset` inside block `index` ("end" = end of its text). */
export function at(s: EditorState, index: number, offset: number | 'end' = 0) {
  let pos = -1;
  s.doc.forEach((node, p, i) => {
    if (i === index) pos = p + 1 + (offset === 'end' ? node.content.size : offset);
  });
  if (pos < 0) throw new Error(`no block ${index}`);
  return pos;
}

export function cursor(s: EditorState, index: number, offset: number | 'end' = 0) {
  return s.apply(s.tr.setSelection(TextSelection.create(s.doc, at(s, index, offset))));
}

export function select(s: EditorState, index: number, from: number, to: number) {
  return s.apply(
    s.tr.setSelection(TextSelection.create(s.doc, at(s, index, from), at(s, index, to))),
  );
}

/** Runs a command, requiring exactly one dispatched transaction (one undo step). */
export function run(s: EditorState, command: Command) {
  const dispatched: Transaction[] = [];
  const handled = command(s, (tr) => dispatched.push(tr));
  if (dispatched.length > 1) throw new Error(`${dispatched.length} transactions dispatched`);
  const tr = dispatched[0];
  return { handled, tr, state: tr ? s.apply(tr) : s };
}

export const lines = (s: EditorState) => {
  const out: string[] = [];
  s.doc.forEach((node) => out.push(`${typeOf(node)}: ${node.textContent}`));
  return out;
};

export const ids = (s: EditorState) => {
  const out: string[] = [];
  s.doc.forEach((node) => out.push(String(node.attrs.id)));
  return out;
};

/** Where the cursor is: block index and offset. */
export function caret(s: EditorState) {
  const $h = s.selection.$head;
  return { block: $h.index(0), offset: $h.parentOffset };
}

export function type(s: EditorState, text: string) {
  return s.apply(s.tr.insertText(text));
}
