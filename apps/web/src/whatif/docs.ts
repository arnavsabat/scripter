// Reading a draft's lines out of its Y.Doc, and writing lines back as an ordinary, minimal edit
// (D-080): the same diff y-prosemirror makes for typing, so lines that didn't change aren't
// touched and a co-writer typing in them loses nothing.
import { blockAttrs, blockType, schema, scriptBlocks, type ScriptBlock } from '@wr/schema';
import type { Node } from 'prosemirror-model';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';
import { FRAGMENT } from '../editor/createEditor';

export const fragmentOf = (ydoc: Y.Doc) => ydoc.getXmlFragment(FRAGMENT);

/** The lines of a draft's document (empty if it has none yet). */
export function blocksOfYDoc(ydoc: Y.Doc): ScriptBlock[] {
  const fragment = fragmentOf(ydoc);
  if (!fragment.length) return [];
  return scriptBlocks(yXmlFragmentToProseMirrorRootNode(fragment, schema));
}

/** The lines in a snapshot's bytes. */
export function blocksOfState(state: Uint8Array): ScriptBlock[] {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const blocks = blocksOfYDoc(ydoc);
  ydoc.destroy();
  return blocks;
}

export function docOfBlocks(blocks: readonly ScriptBlock[]): Node {
  return schema.nodes.doc.create(
    null,
    blocks.map((b) =>
      blockType.create(
        blockAttrs(b.type, b.id, b.type === 'scene_heading' ? (b.sceneId ?? null) : null),
        b.text ? schema.text(b.text) : null,
      ),
    ),
  );
}

/** Makes the document's lines `blocks`, as one transaction with `origin` (for its own undo). */
export function writeBlocks(ydoc: Y.Doc, blocks: readonly ScriptBlock[], origin: object) {
  ydoc.transact(() => {
    updateYFragment(ydoc, fragmentOf(ydoc), docOfBlocks(blocks), {
      mapping: new Map(),
      isOMark: new Map(),
    });
  }, origin);
}
