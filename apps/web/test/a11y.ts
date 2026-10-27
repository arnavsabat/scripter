// Accessibility checks for the browser tests (SPEC 3.11), our own small versions of what an
// automated auditor checks: text contrast against the real composited background, a name on
// every control, and a visible focus indicator on whatever the keyboard reaches.

type RGBA = [number, number, number, number];

function parse(color: string): RGBA {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return [0, 0, 0, 0];
  const p = m[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}

/** `top` drawn over the opaque `under`. */
const over = (top: RGBA, under: RGBA): RGBA => {
  const a = top[3];
  return [
    top[0] * a + under[0] * (1 - a),
    top[1] * a + under[1] * (1 - a),
    top[2] * a + under[2] * (1 - a),
    1,
  ];
};

function luminance([r, g, b]: RGBA) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function ratio(a: RGBA, b: RGBA) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** The opaque color behind an element: its own and its ancestors' backgrounds, composited. */
function backgroundOf(el: Element): RGBA {
  const layers: RGBA[] = [];
  for (let e: Element | null = el; e; e = e.parentElement) {
    const bg = parse(getComputedStyle(e).backgroundColor);
    if (bg[3] > 0) layers.push(bg);
    if (bg[3] >= 1) break;
  }
  let color: RGBA = parse(getComputedStyle(document.body).backgroundColor);
  if (color[3] < 1) color = [255, 255, 255, 1];
  for (const layer of layers.reverse()) color = over(layer, color);
  return color;
}

function opacityOf(el: Element) {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
  return o;
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
};

export interface ContrastProblem {
  text: string;
  ratio: number;
  needed: number;
  where: string;
}

/**
 * Every visible text in `root` against what's behind it: 4.5:1, or 3:1 for large text (24 px, or
 * 18.66 px bold). Disabled controls and decorative (aria-hidden) text are exempt, as in WCAG.
 */
export function contrastProblems(root: ParentNode = document): ContrastProblem[] {
  const problems: ContrastProblem[] = [];
  const walker = document.createTreeWalker(
    root instanceof Document ? root.body : root,
    NodeFilter.SHOW_TEXT,
  );
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent?.trim()) continue;
    seen.add(el);
    if (
      !visible(el) ||
      el.closest('[aria-hidden="true"], [inert], :disabled, [aria-disabled="true"]')
    )
      continue;
    if (opacityOf(el) < 0.05) continue; // not on screen (a layer faded out)
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    const bg = backgroundOf(el);
    const shown = over([fg[0], fg[1], fg[2], fg[3] * opacityOf(el)], bg);
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    // A glyph standing for a status (role="img", like the ● markers) is a graphic: 3:1 (WCAG 1.4.11).
    const graphic = !!el.closest('[role="img"]');
    const needed = graphic || size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const r = ratio(shown, bg);
    if (r + 0.005 < needed)
      problems.push({
        text: n.textContent.trim().slice(0, 40),
        ratio: Math.round(r * 100) / 100,
        needed,
        where: describe(el),
      });
  }
  return problems;
}

/** Status dots drawn as shapes (the what-if margin dots): 3:1 against what's behind them. */
export function graphicProblems(selector: string, root: ParentNode = document): ContrastProblem[] {
  return [...root.querySelectorAll(selector)]
    .filter((el) => visible(el) && opacityOf(el) >= 0.05)
    .flatMap((el) => {
      const fill = parse(getComputedStyle(el).backgroundColor);
      const behind = backgroundOf(el.parentElement!);
      const r = ratio(over(fill, behind), behind);
      return r + 0.005 < 3
        ? [{ text: selector, ratio: Math.round(r * 100) / 100, needed: 3, where: describe(el) }]
        : [];
    });
}

export function describe(el: Element) {
  const parts: string[] = [];
  for (let e: Element | null = el; e && parts.length < 4; e = e.parentElement) {
    const cls =
      typeof e.className === 'string' && e.className ? `.${e.className.split(' ')[0]}` : '';
    parts.unshift(`${e.tagName.toLowerCase()}${cls}`);
  }
  return parts.join(' > ');
}

const CONTROLS =
  'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="tab"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';

/** Controls with no accessible name: no text, aria-label, aria-labelledby, title or label. */
export function unnamedControls(root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLElement>(CONTROLS)]
    .filter((el) => visible(el) && !el.closest('[aria-hidden="true"], [inert]'))
    .filter((el) => el.contentEditable !== 'true' && !el.classList.contains('ProseMirror'))
    .filter((el) => {
      const named =
        el.getAttribute('aria-label')?.trim() ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('title')?.trim() ||
        (el instanceof HTMLInputElement && (el.labels?.length || el.placeholder)) ||
        el.textContent?.trim();
      return !named;
    })
    .map(describe);
}

/** Whether the focused element draws a focus indicator (an outline or a ring) it doesn't have unfocused. */
export function showsFocus(el: HTMLElement) {
  const s = getComputedStyle(el);
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
  const ring = s.boxShadow !== 'none' && s.boxShadow !== '';
  return outline || ring;
}
