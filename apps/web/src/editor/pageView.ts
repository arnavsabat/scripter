// Switching between the continuous column and page view (SPEC 3.7): the page breaks grow or
// shrink over 240 ms, so what you're reading would drift. Hold the cursor's line (or the first
// line on screen) where it is until the motion ends.
import type { EditorView } from 'prosemirror-view';

const MOTION_MS = 240;

export function holdViewDuringToggle(view: EditorView | undefined) {
  const app = view?.dom.closest('.app');
  if (!view || !app) return;
  // The page breaks animate only while this is set (script.css): an edit moves them at once.
  app.classList.add('pv-anim');
  const start = performance.now();
  const scroller = view.dom.closest('.in');
  const top = (el: Element) =>
    el.getBoundingClientRect().top - (scroller as HTMLElement).getBoundingClientRect().top;
  const visible = (el: Element) =>
    scroller instanceof HTMLElement &&
    top(el) + el.clientHeight > 0 &&
    top(el) < scroller.clientHeight;
  const $head = view.state.selection.$head;
  const cursor = $head.depth > 0 ? view.nodeDOM($head.before(1)) : null;
  const anchor =
    cursor instanceof Element && visible(cursor)
      ? cursor
      : [...view.dom.querySelectorAll('.el')].find(visible);
  const before = anchor ? top(anchor) : 0;
  const tick = () => {
    if (anchor && scroller instanceof HTMLElement) scroller.scrollTop += top(anchor) - before;
    if (performance.now() - start < MOTION_MS + 80) requestAnimationFrame(tick);
    else app.classList.remove('pv-anim');
  };
  requestAnimationFrame(tick);
}
