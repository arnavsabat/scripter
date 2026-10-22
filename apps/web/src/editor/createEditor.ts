// Builds the script editor: a ProseMirror view bound to a Y.Doc through y-prosemirror, with the
// screenplay keymap, ID repair, formatting warnings and per-user Yjs undo.
import {
  STRUCTURAL,
  blockAttrs,
  blockType,
  detectCombines,
  enter,
  idPlugin,
  newId,
  schema,
  shiftTab,
  tab,
  type Combine,
} from '@wr/schema';
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  prosemirrorToYXmlFragment,
  redo,
  undo,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
} from 'y-prosemirror';
import type * as Y from 'yjs';
import { warningsPlugin } from './warningsPlugin';

export const FRAGMENT = 'script';

/** A transaction applying a change that came from Yjs (a co-writer, or undo/redo). */
export const isRemote = (tr: Transaction) =>
  !!(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin;

/** A brand-new script starts as one empty action line. */
export function seedNewScript(ydoc: Y.Doc) {
  const doc = schema.nodes.doc.create(null, [
    blockType.create(blockAttrs('action', newId(), null)),
  ]);
  prosemirrorToYXmlFragment(doc, ydoc.getXmlFragment(FRAGMENT));
}

export interface EditorHooks {
  /** Every state change, local or remote; `docChanged` is false for cursor moves. */
  onChange: (view: EditorView, docChanged: boolean) => void;
  /** A local edit folded one scene into the previous one (SPEC 4.6). */
  onCombine: (combine: Combine) => void;
  /** The writer clicked a formatting warning. */
  onWarning: (blockId: string, anchor: HTMLElement) => void;
  /** Runs before every other key binding (the element menu uses it while open). */
  onKeyDown: (view: EditorView, event: KeyboardEvent) => boolean;
}

export interface ScriptEditor {
  view: EditorView;
  undoManager: Y.UndoManager;
  destroy(): void;
}

export function createEditor(mount: HTMLElement, ydoc: Y.Doc, hooks: EditorHooks): ScriptEditor {
  const plugins = [
    ySyncPlugin(ydoc.getXmlFragment(FRAGMENT)),
    // Spike finding F4: protect every block from deletion by undo, so undoing your own split
    // never deletes a co-writer's text typed into the new line.
    yUndoPlugin({ protectedNodes: new Set(['block']) }),
    keymap({
      Enter: enter,
      Tab: tab,
      'Shift-Tab': shiftTab,
      'Mod-z': (state) => undo(state),
      'Mod-Shift-z': (state) => redo(state),
      'Mod-y': (state) => redo(state),
    }),
    keymap(baseKeymap),
    idPlugin({ isRemote }),
    warningsPlugin(hooks.onWarning),
  ];

  // Filled in right after the view exists; y-prosemirror dispatches during construction.
  const late: { undoManager?: Y.UndoManager } = {};
  const view = new EditorView(mount, {
    state: EditorState.create({ schema, plugins }),
    attributes: { class: 'script', spellcheck: 'true', 'aria-label': 'Script' },
    handleKeyDown: (v, event) => hooks.onKeyDown(v, event),
    // `this` rather than `view`: y-prosemirror dispatches during the EditorView constructor.
    dispatchTransaction(this: EditorView, tr) {
      const before = this.state;
      // One undo step per structural action (D-014, item 9): close the current undo group
      // before and after, so Yjs's 500 ms grouping can't merge it with the typing around it.
      const structural = tr.getMeta(STRUCTURAL) === true;
      if (structural) late.undoManager?.stopCapturing();
      this.updateState(before.apply(tr));
      if (structural) late.undoManager?.stopCapturing();
      if (tr.docChanged && !isRemote(tr)) {
        const [combine] = detectCombines(before.doc, this.state.doc);
        if (combine) {
          late.undoManager?.stopCapturing();
          hooks.onCombine(combine);
        }
      }
      hooks.onChange(this, tr.docChanged);
    },
  });
  const undoManager = (yUndoPluginKey.getState(view.state) as { undoManager: Y.UndoManager })
    .undoManager;
  late.undoManager = undoManager;

  return { view, undoManager, destroy: () => view.destroy() };
}
