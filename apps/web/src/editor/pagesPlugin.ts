// Page view (SPEC 3.7, 3.8, 5.8): page breaks drawn from the pagination output. The script stays
// one editable column; at each break a widget fills the rest of the page, the bottom margin, the
// desk-colored gap and the next page's top margin, and draws (MORE), (CONTINUED), the page number,
// CONTINUED: and NAME (CONT'D). With the sidebar open the widgets have no height (Highland's
// continuous column); collapsing grows them over the same 240 ms, so nothing rewraps (D-074).
//
// Rule 2 for editor code (D-012): decorations are rebuilt from the document on every change,
// never mapped, because y-prosemirror replaces the whole document on each remote update.
import {
  LINES_PER_PAGE,
  paginate,
  spaceBefore,
  type Block,
  type PageBreak,
  type Pagination,
} from '@wr/pagination';
import { typeOf } from '@wr/schema';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const LINE = 16; // px: 12 pt Courier Prime on a 16 px line (SPEC 3.8)
const INCH = 96;
const MARGIN = INCH; // top and bottom
/** The desk-colored gap between pages (D-071). */
export const PAGE_GAP = 24;
export const PAGE_HEIGHT = 11 * INCH;

interface PagesState {
  pagination: Pagination;
  /** Where each block starts in the document. */
  positions: number[];
  decorations: DecorationSet;
}

export const pagesKey = new PluginKey<PagesState>('pages');

/** The document as pagination input, and where each block starts. */
function blocksOf(doc: Node): { blocks: Block[]; positions: number[] } {
  const blocks: Block[] = [];
  const positions: number[] = [];
  doc.forEach((node, pos, i) => {
    blocks.push({
      id: String(node.attrs.id ?? `#${i}`),
      type: typeOf(node),
      text: node.textContent,
    });
    positions.push(pos);
  });
  return { blocks, positions };
}

function el(tag: string, className: string, text?: string) {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The widget at one page break. `used` is the text lines on the page above; `margin` is the CSS
 * space the next block already has above it.
 */
function breakWidget(b: PageBreak, used: number, margin: number) {
  // The rest of the page: (MORE) right under the text, (CONTINUED) on the last line.
  const bottom = (LINES_PER_PAGE - used) * LINE + MARGIN;
  const top = MARGIN + (b.continuedTop ? 2 * LINE : 0) + (b.contd?.length ?? 0) * LINE;
  const height = bottom + PAGE_GAP + top - margin;
  const w = el('div', `pgb${b.offset > 0 ? ' mid' : ''}`);
  w.contentEditable = 'false';
  w.setAttribute('aria-hidden', 'true');
  w.dataset.page = String(b.page);
  w.style.setProperty('--h', `${height}px`);
  const at = (node: HTMLElement, y: number) => {
    node.style.top = `${y}px`;
    w.append(node);
  };
  if (b.more) at(el('div', 'pgl pgcue', '(MORE)'), 0);
  if (b.continued) at(el('div', 'pgl pgr', '(CONTINUED)'), bottom - MARGIN - LINE);
  at(el('div', 'pgband'), bottom);
  const pageTop = bottom + PAGE_GAP;
  at(el('div', 'pgl pgr pgnum', `${b.page}.`), pageTop + INCH / 2);
  let y = pageTop + MARGIN;
  if (b.continuedTop) {
    at(el('div', 'pgl', 'CONTINUED:'), y);
    y += 2 * LINE;
  }
  for (const line of b.contd ?? []) {
    at(el('div', 'pgl pgcue', line), y);
    y += LINE;
  }
  return w;
}

function build(state: EditorState, prev?: Pagination): PagesState {
  const { blocks, positions } = blocksOf(state.doc);
  const pagination = paginate(blocks, prev);
  const decorations = pagination.breaks.map((b, k) => {
    const block = state.doc.child(b.index);
    const used = pagination.pages[k]!.used;
    // A break between blocks sits before the block, whose own spacing still applies (the CSS
    // keeps it as if the widget weren't there); a split sits inside the block's text.
    const margin =
      b.offset > 0 ? 0 : spaceBefore(blocks[b.index - 1]?.type ?? null, typeOf(block)) * LINE;
    const pos = positions[b.index]! + (b.offset > 0 ? 1 + b.offset : 0);
    const key = `${b.page}|${b.id}|${b.offset}|${used}|${b.more}|${b.continued}|${b.continuedTop}|${b.contd?.join('/') ?? ''}|${margin}`;
    return Decoration.widget(pos, () => breakWidget(b, used, margin), {
      key,
      side: -1,
      ignoreSelection: true,
    });
  });
  return { pagination, positions, decorations: DecorationSet.create(state.doc, decorations) };
}

export function pagesPlugin() {
  return new Plugin<PagesState>({
    key: pagesKey,
    state: {
      init: (_, state) => build(state),
      apply: (tr, old, _before, state) => (tr.docChanged ? build(state, old.pagination) : old),
    },
    props: {
      decorations: (state) => pagesKey.getState(state)?.decorations,
    },
    view: (view) => {
      // The page's height in page view: every page full, gaps between (the last page included).
      const update = () => {
        const n = pagesKey.getState(view.state)?.pagination.pages.length ?? 1;
        const page = view.dom.closest<HTMLElement>('.page');
        page?.style.setProperty('--pages', String(n));
      };
      update();
      return { update };
    },
  });
}
