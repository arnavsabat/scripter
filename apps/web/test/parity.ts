// The visual audit against prototype v2 (beta-readiness step 5, D-088): the prototype runs in an
// iframe beside the real app, both are put in the same state, and the computed styles of every
// element they share (by selector) are compared, property by property.

const PROPS = [
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'color',
  'background-color',
  'height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-bottom',
  'border-top-width',
  'border-bottom-width',
  'border-top-color',
  'border-bottom-color',
  'border-radius',
  'box-shadow',
  'gap',
  'opacity',
] as const;
/** Width matters only for things with a fixed size (icons, avatars, panels, menus, dots). */
const FIXED_WIDTH = /\.(ib|av|dot|left|right|rp|menu|pop|elmenu|page|si|home)\b|aside/;

export type Styles = Record<string, string>;

/** On screen: a size, not hidden, and not inside something faded out (a hidden layer). */
const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const win = el.ownerDocument.defaultView!;
  if (win.getComputedStyle(el).visibility === 'hidden') return false;
  for (let e: Element | null = el; e; e = e.parentElement)
    if (Number(win.getComputedStyle(e).opacity) < 0.05) return false;
  return true;
};

/** The first visible match's computed styles, or null. `named` decides which sizes count. */
export function stylesOf(doc: Document, selector: string, named = selector): Styles | null {
  const el = [...doc.querySelectorAll(selector)].find(visible);
  if (!el) return null;
  const s = doc.defaultView!.getComputedStyle(el);
  const out: Styles = {};
  for (const p of PROPS) out[p] = s.getPropertyValue(p);
  if (FIXED_WIDTH.test(named)) out.width = `${Math.round(el.getBoundingClientRect().width)}px`;
  // Heights of text rows come out fractional in one and whole in the other; compare to the pixel.
  out.height = `${Math.round(el.getBoundingClientRect().height)}px`;
  return out;
}

/** Normalizes values that differ only in spelling (e.g. "normal" vs. "0px" letter-spacing). */
function norm(p: string, v: string) {
  if (p === 'letter-spacing' && v === 'normal') return '0px';
  if (p === 'gap' && v === 'normal') return 'normal';
  return v.replace(/\s+/g, ' ').trim();
}

export interface Difference {
  state: string;
  selector: string;
  prop: string;
  prototype: string;
  app: string;
}

/** A selector both use, or [the prototype's, the app's] where their markup differs. */
export type Pair = string | [string, string];

/** Every property that differs between the prototype's and the app's match for each selector. */
export function compare(
  state: string,
  proto: Document,
  app: Element,
  selectors: Pair[],
): { diffs: Difference[]; missing: string[] } {
  const diffs: Difference[] = [];
  const missing: string[] = [];
  for (const pair of selectors) {
    const [ps, as] = typeof pair === 'string' ? [pair, pair] : pair;
    const a = stylesOf(proto, ps, as);
    const el = [...app.querySelectorAll(as)].find(visible);
    const b = el ? stylesOf(app.ownerDocument, cssPath(el), as) : null;
    if (!a || !b) {
      missing.push(`${state} · ${as} · ${!a ? 'not in prototype' : 'not in app'}`);
      continue;
    }
    for (const p of Object.keys(a))
      if (norm(p, a[p]!) !== norm(p, b[p] ?? ''))
        diffs.push({ state, selector: as, prop: p, prototype: a[p]!, app: b[p] ?? '' });
  }
  return { diffs, missing };
}

let marks = 0;
/** A selector for exactly this element (it gets a data attribute). */
function cssPath(el: Element) {
  const id = el.getAttribute('data-parity') ?? `p${++marks}`;
  el.setAttribute('data-parity', id);
  return `[data-parity="${id}"]`;
}
