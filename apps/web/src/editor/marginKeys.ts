// Keys for the things that live in the script's left margin (SPEC 3.9, 4.3; D-014):
// Esc opens the element menu when nothing is open, and closes the topmost thing otherwise.
// While the menu is open, S A C P D H T pick a type, arrows move, Enter picks, Esc closes,
// Tab leaves the page (to the sidebar; Shift+Tab to the toolbar, D-086), and any other key
// closes the menu and goes on to the script.
import { ELEMENT_MENU, setElementType, typeOf } from '@wr/schema';
import type { EditorView } from 'prosemirror-view';
import type { Overlay } from '../App';

/**
 * Top of a line relative to the page, where margin overlays are positioned. (Not offsetTop:
 * ProseMirror's stylesheet makes the editor itself the lines' offset parent.)
 */
export function topInPage(el: Element) {
  const page = el.closest('.page');
  return page ? el.getBoundingClientRect().top - page.getBoundingClientRect().top : 0;
}

/** Top of the block at `pos`, relative to the page. */
export function lineTop(view: EditorView, pos: number) {
  const el = view.nodeDOM(pos);
  return el instanceof HTMLElement ? topInPage(el) : 0;
}

/**
 * Moves the keyboard out of the script (D-086): to the sidebar's selected tab, or, when the
 * sidebar is collapsed (page view) or Shift is held, to the toolbar's first control.
 */
export function leavePage(view: EditorView, to: 'sidebar' | 'toolbar') {
  const app = view.dom.closest('.app');
  const sidebar =
    to === 'sidebar' && !app?.classList.contains('left-closed')
      ? app?.querySelector<HTMLElement>('.left [role="tab"][aria-selected="true"]')
      : null;
  const target = sidebar ?? app?.querySelector<HTMLElement>('.toolbar button');
  target?.focus();
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

export function handleMarginKey(
  view: EditorView,
  e: KeyboardEvent,
  overlay: Overlay,
  setOverlay: (o: Overlay) => void,
): boolean {
  if (overlay?.kind === 'element') {
    const pick = (index: number) => {
      setElementType(ELEMENT_MENU[index]!.type)(view.state, (tr) => view.dispatch(tr));
      setOverlay(null);
      return true;
    };
    if (e.key === 'Escape') {
      setOverlay(null);
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : ELEMENT_MENU.length - 1;
      setOverlay({ ...overlay, highlighted: (overlay.highlighted + step) % ELEMENT_MENU.length });
      return true;
    }
    if (e.key === 'Enter') return pick(overlay.highlighted);
    // A modifier on its own (Shift on the way to Shift+S or Shift+Tab) leaves the menu open.
    if (MODIFIERS.has(e.key)) return false;
    if (e.key === 'Tab') {
      setOverlay(null);
      leavePage(view, e.shiftKey ? 'toolbar' : 'sidebar');
      return true;
    }
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1;
    const index = plain ? ELEMENT_MENU.findIndex((i) => i.key === e.key.toUpperCase()) : -1;
    if (index >= 0) return pick(index);
    setOverlay(null);
    return false;
  }
  if (e.key !== 'Escape') return false;
  if (overlay) {
    setOverlay(null);
    return true;
  }
  const $from = view.state.selection.$from;
  const current = typeOf($from.parent);
  const index = ELEMENT_MENU.findIndex((i) => i.type === current);
  // Like a native pop-up menu, the current type's row lines up with the line being edited:
  // 4 px menu padding, 30 px rows, and a 16 px line centered in its 30 px row.
  const top = lineTop(view, $from.before(1)) - 4 - index * 30 - (30 - 16) / 2;
  setOverlay({ kind: 'element', top: Math.max(top, -32), highlighted: index });
  return true;
}
