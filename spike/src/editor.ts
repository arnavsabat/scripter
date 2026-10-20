// Spike editor: the Enter/Tab state machine (SPEC 4.2), the block/scene ID plugin (SPEC 4.6),
// a fake page-break decoration, and a factory that binds an EditorView to a Y.Doc.
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Node } from 'prosemirror-model';
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Command,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import {
  redo,
  undo,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPlugin,
  yUndoPluginKey,
} from 'y-prosemirror';
import type * as Y from 'yjs';
import { newId, type ElementType, type SchemaKit } from './schema';

// ---------------------------------------------------------------------------------------------
// Enter/Tab state machine (SPEC 4.2 defaults)

export const ENTER_NEXT: Record<ElementType, ElementType> = {
  scene_heading: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'action',
  transition: 'scene_heading',
  shot: 'action',
};

/** Enter: split the block at the cursor; the new block gets the next element type. One transaction. */
export const enterCommand =
  (kit: SchemaKit): Command =>
  (state, dispatch) => {
    if (!dispatch) return true;
    const tr = state.tr;
    if (!state.selection.empty) tr.deleteSelection();
    const $pos = tr.selection.$from;
    const current = kit.typeOf($pos.parent);
    const next = ENTER_NEXT[current];
    const { type, attrs } = kit.blockType(next, {
      id: newId(),
      sceneId: next === 'scene_heading' ? newId('s') : null,
    });
    tr.split($pos.pos, 1, [{ type, attrs }]);
    dispatch(tr.scrollIntoView());
    return true;
  };

/** Changes a block's element type in place: one transaction, used by Tab and by the (future) element menu. */
export function setElementType(
  kit: SchemaKit,
  state: EditorState,
  blockPos: number,
  to: ElementType,
) {
  const node = state.doc.nodeAt(blockPos);
  if (!node) throw new Error(`No block at ${blockPos}`);
  const { type, attrs } = kit.blockType(to, {
    id: node.attrs.id as string,
    sceneId: (node.attrs.sceneId as string | null) ?? newId('s'),
  });
  return state.tr.setNodeMarkup(blockPos, type, attrs);
}

/** Tab: empty Action → Character; Dialogue → Parenthetical; empty Character → Transition. */
export const tabCommand =
  (kit: SchemaKit): Command =>
  (state, dispatch) => {
    const $from = state.selection.$from;
    const node = $from.parent;
    const type = kit.typeOf(node);
    const empty = node.content.size === 0;
    let to: ElementType | null = null;
    if (type === 'action' && empty) to = 'character';
    else if (type === 'dialogue') to = 'parenthetical';
    else if (type === 'character' && empty) to = 'transition';
    // Tab never moves focus out of the script, even when it does nothing.
    if (to && dispatch) dispatch(setElementType(kit, state, $from.before(), to));
    return true;
  };

// ---------------------------------------------------------------------------------------------
// ID plugin: every block has a unique id; every scene heading has a unique sceneId.
// Duplicates (from paste, split, or concurrent edits) keep the first occurrence and re-ID the rest.

export const idPluginKey = new PluginKey('ids');

export function fixIds(kit: SchemaKit, state: EditorState) {
  const seenIds = new Set<string>();
  const seenScenes = new Set<string>();
  const tr = state.tr;
  state.doc.forEach((node, pos) => {
    const attrs = { ...node.attrs } as Record<string, unknown>;
    let changed = false;
    const id = attrs.id as string | null;
    if (!id || seenIds.has(id)) {
      attrs.id = newId();
      changed = true;
    }
    seenIds.add(attrs.id as string);
    if (kit.typeOf(node) === 'scene_heading') {
      const sceneId = attrs.sceneId as string | null;
      if (!sceneId || seenScenes.has(sceneId)) {
        attrs.sceneId = newId('s');
        changed = true;
      }
      seenScenes.add(attrs.sceneId as string);
    }
    if (changed) tr.setNodeMarkup(pos, undefined, attrs);
  });
  return tr.docChanged ? tr.setMeta(idPluginKey, true) : null;
}

const isRemote = (tr: Transaction) =>
  !!(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin;

/**
 * Spike finding: y-prosemirror applies remote changes inside a mutex, and any transaction appended
 * to that dispatch is never written to Yjs, so the local editor silently drifts from the shared
 * document. Local edits are fixed in appendTransaction as usual; after a remote change the repair
 * runs as a separate, deferred local transaction, which y-prosemirror does sync.
 */
export const idPlugin = (kit: SchemaKit) => {
  let repairScheduled = false;
  let remoteSeen = false;
  return new Plugin({
    key: idPluginKey,
    appendTransaction: (trs, _old, state) => {
      if (trs.some(isRemote)) {
        remoteSeen = true;
        return null;
      }
      return trs.some((tr) => tr.docChanged) ? fixIds(kit, state) : null;
    },
    view: () => ({
      update(view) {
        if (!remoteSeen || repairScheduled) return;
        remoteSeen = false;
        repairScheduled = true;
        setTimeout(() => {
          repairScheduled = false;
          if (view.isDestroyed) return;
          const tr = fixIds(kit, view.state);
          if (tr) view.dispatch(tr);
        }, 0);
      },
    }),
  });
};

// ---------------------------------------------------------------------------------------------
// Fake pagination: a crude stand-in for packages/pagination, enough to place page-break widgets.

const WIDTH: Record<ElementType, number> = {
  scene_heading: 60,
  action: 60,
  shot: 60,
  character: 38,
  parenthetical: 24,
  dialogue: 35,
  transition: 60,
};
export const LINES_PER_PAGE = 54;

export interface PageBreak {
  pos: number;
  blockId: string;
  page: number;
}

/** Pure function of the document: where each page starts. Character counts only, no DOM. */
export function computeBreaks(kit: SchemaKit, doc: Node): PageBreak[] {
  const breaks: PageBreak[] = [];
  let line = 0;
  let page = 1;
  let prev: ElementType | null = null;
  doc.forEach((node, pos) => {
    const type = kit.typeOf(node);
    const lines = Math.max(1, Math.ceil(node.textContent.length / WIDTH[type]));
    const tight =
      (type === 'dialogue' || type === 'parenthetical') &&
      (prev === 'character' || prev === 'parenthetical' || prev === 'dialogue');
    const gap = line === 0 || tight ? 0 : 1;
    if (line + gap + lines > LINES_PER_PAGE) {
      page += 1;
      breaks.push({ pos, blockId: String(node.attrs.id), page });
      line = lines;
    } else {
      line += gap + lines;
    }
    prev = type;
  });
  return breaks;
}

export const pageBreakKey = new PluginKey<DecorationSet>('pageBreaks');
export type PageBreakMode = 'recompute' | 'mapped' | 'off';

function breakWidget(b: PageBreak) {
  return Decoration.widget(
    b.pos,
    () => {
      const el = document.createElement('div');
      el.className = 'pb';
      el.contentEditable = 'false';
      el.dataset.page = String(b.page);
      el.dataset.block = b.blockId;
      el.textContent = `page ${b.page}`;
      return el;
    },
    // A stable key lets ProseMirror reuse the widget's DOM node when the decoration is unchanged.
    { key: `pb-${b.blockId}-${b.page}`, side: -1 },
  );
}

/**
 * "recompute": decorations are derived from the document on every change (how real pagination
 * will work). "mapped": computed once and then mapped through each transaction, the common naive
 * approach, kept as a control to show what y-prosemirror's full-document replace does to it.
 */
export const pageBreakPlugin = (kit: SchemaKit, mode: Exclude<PageBreakMode, 'off'>) =>
  new Plugin<DecorationSet>({
    key: pageBreakKey,
    state: {
      init: (_, state) =>
        DecorationSet.create(state.doc, computeBreaks(kit, state.doc).map(breakWidget)),
      apply: (tr, set, _old, state) => {
        const recompute = () =>
          DecorationSet.create(state.doc, computeBreaks(kit, state.doc).map(breakWidget));
        if (mode === 'mapped')
          return tr.getMeta(pageBreakKey) ? recompute() : set.map(tr.mapping, tr.doc);
        return tr.docChanged ? recompute() : set;
      },
    },
    props: { decorations: (state) => pageBreakKey.getState(state) },
  });

// ---------------------------------------------------------------------------------------------
// Client: one EditorView bound to one Y.Doc.

export interface Timing {
  ms: number;
  remote: boolean;
}

export interface Client {
  name: string;
  kit: SchemaKit;
  ydoc: Y.Doc;
  fragment: Y.XmlFragment;
  view: EditorView;
  undoManager: Y.UndoManager;
  scroller: HTMLElement;
  /** Duration of every dispatch (state apply + DOM update + sync into Yjs). */
  timings: Timing[];
  destroy(): void;
}

export interface ClientOptions {
  name: string;
  kit: SchemaKit;
  ydoc: Y.Doc;
  mount: HTMLElement;
  pageBreaks?: PageBreakMode;
  /** "blocks": undo never deletes a non-empty block (protects co-writers' text). "default": y-prosemirror's default (only "paragraph"). */
  protect?: 'blocks' | 'default';
}

export function createClient(opts: ClientOptions): Client {
  const { kit, ydoc } = opts;
  const fragment = ydoc.getXmlFragment('script');
  const scroller = document.createElement('div');
  scroller.className = 'scroller';
  scroller.dataset.client = opts.name;
  opts.mount.appendChild(scroller);

  const plugins = [
    ySyncPlugin(fragment),
    yUndoPlugin(opts.protect === 'default' ? {} : { protectedNodes: new Set(kit.blockNodeNames) }),
    keymap({
      Enter: enterCommand(kit),
      Tab: tabCommand(kit),
      'Mod-z': (state) => undo(state),
      'Mod-Shift-z': (state) => redo(state),
      'Mod-y': (state) => redo(state),
    }),
    keymap(baseKeymap),
    idPlugin(kit),
  ];
  const mode = opts.pageBreaks ?? 'recompute';
  if (mode !== 'off') plugins.push(pageBreakPlugin(kit, mode));

  const timings: Timing[] = [];
  const view: EditorView = new EditorView(scroller, {
    state: EditorState.create({ schema: kit.schema, plugins }),
    // `this` rather than `view`: y-prosemirror dispatches during the EditorView constructor.
    dispatchTransaction(this: EditorView, tr) {
      const t0 = performance.now();
      this.updateState(this.state.apply(tr));
      const meta = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined;
      timings.push({ ms: performance.now() - t0, remote: !!meta?.isChangeOrigin });
    },
  });
  const undoManager = (yUndoPluginKey.getState(view.state) as { undoManager: Y.UndoManager })
    .undoManager;

  return {
    name: opts.name,
    kit,
    ydoc,
    fragment,
    view,
    undoManager,
    scroller,
    timings,
    destroy() {
      view.destroy();
      scroller.remove();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Helpers for tests and the demo.

export interface BlockInfo {
  type: ElementType;
  id: string;
  sceneId: string | null;
  text: string;
}

export function blocksOf(c: Client): BlockInfo[] {
  const out: BlockInfo[] = [];
  c.view.state.doc.forEach((node) =>
    out.push({
      type: c.kit.typeOf(node),
      id: String(node.attrs.id),
      sceneId: (node.attrs.sceneId as string | null) ?? null,
      text: node.textContent,
    }),
  );
  return out;
}

/** Document position of the start of block `index`'s text, plus `offset` ("end" = end of block). */
export function posIn(c: Client, index: number, offset: number | 'end' = 0) {
  let pos = -1;
  c.view.state.doc.forEach((node, p, i) => {
    if (i !== index) return;
    if (offset !== 'end' && offset > node.content.size)
      throw new Error(`Offset ${offset} is past the end of block ${index} ("${node.textContent}")`);
    pos = p + 1 + (offset === 'end' ? node.content.size : offset);
  });
  if (pos < 0) throw new Error(`No block ${index}`);
  return pos;
}

export function placeCursor(c: Client, index: number, offset: number | 'end' = 0) {
  c.view.focus();
  const pos = posIn(c, index, offset);
  c.view.dispatch(c.view.state.tr.setSelection(TextSelection.create(c.view.state.doc, pos)));
}

/** Which block the cursor is in, and the offset inside it. */
export function cursorOf(c: Client) {
  const $head = c.view.state.selection.$head;
  return { blockId: String($head.parent.attrs.id), offset: $head.parentOffset };
}
