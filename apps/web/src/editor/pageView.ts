// Switching between the continuous column and page view (SPEC 3.7): the page breaks grow or
// shrink over 240 ms, so what you're reading would drift. Hold the cursor's line (or the first
// line on screen) where it is until the motion ends.
import type { EditorView } from 'prosemirror-view';

const MOTION_MS = 240;

export function holdViewDuringToggle(view: EditorView | undefined) {
  const scroller = view?.dom.closest('.in');
  const app = view?.dom.closest('.app');
  if (!view || !(scroller instanceof HTMLElement) || !app) return;
  const top = (el: Element) =>
    el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  const visible = (el: Element) => top(el) + el.clientHeight > 0 && top(el) < scroller.clientHeight;
  const $head = view.state.selection.$head;
  const cursor = $head.depth > 0 ? view.nodeDOM($head.before(1)) : null;
  const anchor =
    cursor instanceof Element && visible(cursor)
      ? cursor
      : [...view.dom.querySelectorAll('.el')].find(visible);
  if (!anchor) return;
  const before = top(anchor);
  // Lets split-paragraph breaks animate in too (script.css: @starting-style under .pv-anim).
  app.classList.add('pv-anim');
  const start = performance.now();
  const tick = () => {
    scroller.scrollTop += top(anchor) - before;
    if (performance.now() - start < MOTION_MS + 80) requestAnimationFrame(tick);
    else app.classList.remove('pv-anim');
  };
  requestAnimationFrame(tick);
}
