// Page view (SPEC 3.7, 3.8, 5.8) in real Chromium: the browser wraps exactly as the pagination
// package counts (D-072), and in page view every line sits where the pagination output puts it,
// which is what makes the PDF match the screen. The continuous view is untouched by the breaks.
import { LINES_PER_PAGE, paginate, spaceBefore, wrap, type Block } from '@wr/pagination';
import type { ElementType } from '@wr/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import '../src/script.css';
import { clickEndOf, mount, newEpisode, seed, sleep, unmountAll, until } from './helpers';

afterEach(() => unmountAll());

const PAGE = 1056;
const GAP = 24;

// ---- Generated text ----

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const MARKS = [
  ' ',
  ' ',
  ' ',
  ' ',
  '  ',
  ' - ',
  '-',
  '--',
  '—',
  '–',
  '…',
  '?',
  '!',
  '.',
  ', ',
  '"',
  '“',
  '”',
  '’',
  '(',
  ')',
  '/',
  ':',
  ';',
  '? ',
  '. ',
  '...',
];
function corpus(seed: number, n: number) {
  const r = rng(seed);
  const word = () => {
    const long = r() < 0.04;
    const len = long ? 30 + Math.floor(r() * 50) : 1 + Math.floor(r() * 11);
    let w = '';
    for (let i = 0; i < len; i++) w += String.fromCharCode(97 + Math.floor(r() * 26));
    return r() < 0.1
      ? w.replace(/^./, (c) => c.toUpperCase())
      : r() < 0.05
        ? String(Math.floor(r() * 2000))
        : w;
  };
  return Array.from({ length: n }, () => {
    let t = '';
    const target = Math.floor(r() * 240);
    while (t.length < target) t += word() + MARKS[Math.floor(r() * MARKS.length)];
    return t.slice(0, target);
  });
}

/** Where each line starts in a rendered paragraph, from the caret rectangles of its characters. */
function domLineStarts(p: HTMLElement): number[] {
  const node = p.firstChild;
  if (!node) return [0];
  const text = node.textContent ?? '';
  const starts = [0];
  let lastTop: number | null = null;
  for (let i = 0; i < text.length; i++) {
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + 1);
    const rect = [...r.getClientRects()].filter((x) => x.width > 0).at(-1);
    if (!rect) continue;
    if (lastTop !== null && rect.top > lastTop + 4) starts.push(i);
    lastTop = rect.top;
  }
  return starts;
}

describe('the browser wraps exactly as pagination counts (D-072)', () => {
  it('2,000 generated paragraphs in every column width', async () => {
    await document.fonts.load('16px "Courier Prime"');
    // The real page and column, so the widths (and their half-pixel of slack) are the app's.
    const page = document.createElement('div');
    page.className = 'page';
    const host = document.createElement('div');
    host.className = 'ProseMirror script';
    page.append(host);
    document.body.append(page);
    expect(getComputedStyle(host).whiteSpace).toBe('pre-wrap');
    const types: ElementType[] = ['action', 'dialogue', 'parenthetical', 'character'];
    const mismatches: string[] = [];
    let cases = 0;
    for (const [k, type] of types.entries())
      for (const text of corpus(k + 1, 500)) {
        const p = document.createElement('p');
        p.className = 'el';
        p.dataset.type = type;
        p.textContent = text;
        host.append(p);
        const dom = domLineStarts(p);
        const model = wrap(
          type === 'character' ? text.toUpperCase() : text,
          { action: 60, dialogue: 35, parenthetical: 24, character: 38 }[type as 'action'],
        ).map((l) => {
          // A line starting at a hanging space run: the browser places the run on the line before.
          let s = l.start;
          while (text[s] === ' ' && s > 0) s++;
          return s;
        });
        // Lines that start inside a space run are reported at their first character either way.
        const norm = (xs: number[]) =>
          xs.map((s) => {
            let x = s;
            while (text[x] === ' ' && x < text.length) x++;
            return x;
          });
        if (JSON.stringify(norm(dom)) !== JSON.stringify(norm(model)) && text.trim())
          mismatches.push(
            `${type} ${JSON.stringify(text)}\n  dom   ${JSON.stringify(dom)}\n  model ${JSON.stringify(model)}`,
          );
        p.remove();
        cases++;
      }
    page.remove();
    expect(cases).toBe(2000);
    expect(mismatches.slice(0, 5).join('\n')).toBe('');
  });
});

// ---- A long script, laid out on screen ----

function script(seed: number, scenes: number): { type: ElementType; text: string }[] {
  const r = rng(seed);
  const words = () =>
    Array.from(
      { length: 3 + Math.floor(r() * 14) },
      () =>
        ['the', 'door', 'opens', 'slowly', 'and', 'Maya', 'looks', 'back', 'at', 'him'][
          Math.floor(r() * 10)
        ],
    ).join(' ');
  const para = (n: number) =>
    Array.from({ length: n }, () => `${words()}${r() < 0.2 ? '?' : '.'}`).join(' ');
  const out: { type: ElementType; text: string }[] = [];
  for (let s = 0; s < scenes; s++) {
    out.push({ type: 'scene_heading', text: `int. room ${s} - day` });
    for (let b = 0; b < 2 + Math.floor(r() * 7); b++) {
      if (r() < 0.45) out.push({ type: 'action', text: para(1 + Math.floor(r() * 6)) });
      else {
        out.push({ type: 'character', text: r() < 0.5 ? 'Maya' : 'John (V.O.)' });
        if (r() < 0.3) out.push({ type: 'parenthetical', text: '(quietly)' });
        out.push({ type: 'dialogue', text: para(1 + Math.floor(r() * 5)) });
      }
    }
    if (r() < 0.3) out.push({ type: 'transition', text: 'cut to:' });
  }
  return out;
}

const blocksOf = (host: HTMLElement): Block[] =>
  [...host.querySelectorAll<HTMLElement>('.script > p.el')].map((p, i) => ({
    id: p.dataset.id ?? `#${i}`,
    type: p.dataset.type as ElementType,
    text: [...p.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(''),
  }));

/** The top of the line holding character `offset` of paragraph `p`, relative to the page. */
function topOf(p: HTMLElement, offset: number, page: DOMRect) {
  const lineTop = p.getBoundingClientRect().top - page.top;
  if (offset === 0) return lineTop;
  // A glyph's box sits a little above its 16 px line, so measure the glyph against the
  // paragraph's first line to find where the line itself is.
  return lineTop + glyphTop(p, offset) - glyphTop(p, 0);
}

function glyphTop(p: HTMLElement, offset: number) {
  // The script's own text only: a split's page-break widget has text of its own.
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('.pgb') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let left = offset;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent!.length;
    if (left < len) {
      const r = document.createRange();
      r.setStart(n, left);
      r.setEnd(n, left + 1);
      return r.getClientRects()[0]!.top;
    }
    left -= len;
  }
  throw new Error('offset past the end');
}

describe('page view', () => {
  it('every line sits where the pagination output puts it; the continuous view is untouched', async () => {
    const ep = newEpisode();
    const seeded = script(5, 70);
    await seed(ep, seeded);
    const app = await mount('Maya', ep, 'full');
    await until(() => app.host.querySelectorAll('.script > p.el').length === seeded.length, 5000);
    const blocks = blocksOf(app.host);
    const p = paginate(blocks);
    expect(p.pages.length).toBeGreaterThan(8);
    const paras = [...app.host.querySelectorAll<HTMLElement>('.script > p.el')];
    const pageEl = app.host.querySelector('.page')!;

    // Open: one continuous column, as if there were no breaks at all.
    let y = 96;
    let prev: ElementType | null = null;
    const pageRect = () => pageEl.getBoundingClientRect();
    blocks.forEach((b, i) => {
      y += spaceBefore(prev, b.type) * 16;
      expect(paras[i]!.getBoundingClientRect().top - pageRect().top, `block ${i}`).toBeCloseTo(
        y,
        0,
      );
      y += paras[i]!.getBoundingClientRect().height;
      prev = b.type;
    });

    // Collapse: page view.
    await commands.clickAt('[data-slot="full"] button[aria-label="Hide sidebar"]', 10, 10);
    await sleep(400);
    expect(app.host.querySelectorAll('.pgb')).toHaveLength(p.breaks.length);
    const rect = pageRect();
    const off: string[] = [];
    for (const pg of p.pages) {
      let line = 96 + (pg.items[0]?.kind === 'continuedTop' ? 32 : 0);
      for (const it of pg.items) {
        if (it.kind === 'contd') line += it.lines.length * 16;
        if (it.kind !== 'text') continue;
        line += it.spaceBefore * 16;
        const expected = (pg.number - 1) * (PAGE + GAP) + line;
        const got = topOf(paras[it.index]!, it.from, rect);
        if (Math.abs(got - expected) > 0.5)
          off.push(
            `page ${pg.number}, block ${it.index} ${it.type}@${it.from}: ${got - expected} px (${pg.items.map((x) => (x.kind === 'text' ? `${x.type}:${x.lines.length}` : x.kind)).join(' ')})`,
          );
        line += it.lines.length * 16;
      }
      expect(line - 96).toBeLessThanOrEqual(LINES_PER_PAGE * 16 + 96);
    }
    expect(off.slice(0, 6).join('\n')).toBe('');
    expect(rect.height).toBeCloseTo(p.pages.length * (PAGE + GAP) - GAP, 0);
    // The page numbers, from page 2.
    expect([...app.host.querySelectorAll('.pgnum')].map((n) => n.textContent)).toEqual(
      p.breaks.map((b) => `${b.page}.`),
    );
  }, 60_000);

  it('collapsing keeps the cursor’s line where it was', async () => {
    const ep = newEpisode();
    await seed(ep, script(9, 40));
    const app = await mount('Maya', ep, 'full');
    const paras = [...app.host.querySelectorAll<HTMLElement>('.script > p.el')];
    const target = paras[Math.floor(paras.length * 0.6)]!;
    target.scrollIntoView({ block: 'center' });
    await clickEndOf(paras.indexOf(target), app.host);
    const before = target.getBoundingClientRect().top;
    await commands.clickAt('[data-slot="full"] button[aria-label="Hide sidebar"]', 10, 10);
    await sleep(400);
    expect(Math.abs(target.getBoundingClientRect().top - before)).toBeLessThan(2);
    await commands.clickAt('[data-slot="full"] button[aria-label="Show sidebar"]', 10, 10);
    await sleep(400);
    expect(Math.abs(target.getBoundingClientRect().top - before)).toBeLessThan(2);
  }, 30_000);
});
