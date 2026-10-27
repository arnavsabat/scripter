// PDF export (SPEC 5.7, D-076) in real Chromium: every string the PDF draws is exactly where page
// view shows it, page for page; and Share › Export PDF downloads a valid file with Courier Prime
// embedded and an unnumbered title page first.
import { paginate, type Block } from '@wr/pagination';
import type { ElementType } from '@wr/schema';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import '../src/script.css';
import { CHAR, layoutPages, layoutTitlePage, type DrawnText } from '../src/export/pdf';
import { mount, newEpisode, seed, sleep, unmountAll, until } from './helpers';

afterEach(() => unmountAll());

const PT = 0.75; // points per CSS px
const PAGE = 1056 + 24;
const CAPS = new Set(['scene_heading', 'character', 'transition', 'shot']);

function script(): { type: ElementType; text: string }[] {
  const out: { type: ElementType; text: string }[] = [];
  for (let s = 0; s < 14; s++) {
    out.push({ type: 'scene_heading', text: `int. diner ${s} - night` });
    out.push({
      type: 'action',
      text: 'Rain hammers the windows. A neon sign buzzes, dies, buzzes again. Nobody moves.',
    });
    out.push({ type: 'character', text: s % 2 ? 'Maya' : 'John (V.O.)' });
    if (s % 3 === 0) out.push({ type: 'parenthetical', text: '(not looking up)' });
    out.push({
      type: 'dialogue',
      text: 'I told you not to come back here. Not tonight. Not after what happened at the pier. You never listen. Sit down. Eat something. We have to talk about the money, and about your brother.',
    });
    out.push({
      type: 'action',
      text: 'He sits. She pours. Neither of them says a word for a long time, and the rain keeps coming.',
    });
    if (s % 4 === 3) out.push({ type: 'transition', text: 'cut to:' });
  }
  return out;
}

/** Every line drawn on screen, page by page, in points from the page's top-left corner. */
function screenLines(host: HTMLElement): DrawnText[][] {
  const page = host.querySelector('.page')!.getBoundingClientRect();
  const pages: DrawnText[][] = [];
  const put = (text: string, xPx: number, yPx: number) => {
    const k = Math.floor(yPx / PAGE);
    (pages[k] ??= []).push({ text, x: xPx * PT, y: (yPx - k * PAGE) * PT });
  };
  // The script's own lines: group each paragraph's characters by the line they sit on.
  for (const p of host.querySelectorAll<HTMLElement>('.script > p.el')) {
    const lineTop = p.getBoundingClientRect().top - page.top;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement?.closest('.pgb') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    let first: number | null = null;
    let cur: { text: string; x: number; top: number } | null = null;
    const flush = () => {
      if (cur && cur.text.trimEnd())
        put(cur.text.trimEnd(), cur.x, lineTop + cur.top - (first ?? cur.top));
    };
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent!;
      for (let i = 0; i < t.length; i++) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const rect = [...r.getClientRects()].at(-1);
        if (!rect) continue;
        first ??= rect.top;
        const ch = CAPS.has(p.dataset.type!) ? t[i]!.toUpperCase() : t[i]!;
        if (!cur || rect.top > cur.top + 4) {
          flush();
          cur = { text: ch, x: rect.left - page.left, top: rect.top };
        } else cur.text += ch;
      }
    }
    flush();
  }
  // What the page-break widgets draw: (MORE), (CONTINUED), page numbers, CONTINUED:, CONT'D.
  for (const el of host.querySelectorAll<HTMLElement>('.pgb > .pgl')) {
    const r = document.createRange();
    r.selectNodeContents(el);
    put(
      el.textContent,
      r.getBoundingClientRect().left - page.left,
      el.getBoundingClientRect().top - page.top,
    );
  }
  return pages.map((ls) => ls.sort((a, b) => a.y - b.y || a.x - b.x));
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

async function openInPageView() {
  const ep = newEpisode();
  const blocks = script();
  await seed(ep, blocks);
  const app = await mount('Maya', ep, 'full');
  await until(() => app.host.querySelectorAll('.script > p.el').length === blocks.length, 5000);
  await commands.clickAt('[data-slot="full"] button[aria-label="Hide sidebar"]', 10, 10);
  await sleep(400);
  return app;
}

describe('the PDF matches the screen (D-076)', () => {
  it('every string the PDF draws is where page view shows it, page for page', async () => {
    const app = await openInPageView();
    const p = paginate(blocksOf(app.host));
    expect(p.pages.length).toBeGreaterThan(4);
    const pdf = layoutPages(p).map((ls) => [...ls].sort((a, b) => a.y - b.y || a.x - b.x));
    const screen = screenLines(app.host);
    expect(screen).toHaveLength(pdf.length);
    pdf.forEach((page, k) => {
      expect(
        screen[k]!.map((l) => l.text),
        `page ${k + 1}`,
      ).toEqual(page.map((l) => l.text));
      page.forEach((l, i) => {
        expect(screen[k]![i]!.x, `page ${k + 1}: ${l.text}`).toBeCloseTo(l.x, 0);
        expect(screen[k]![i]!.y, `page ${k + 1}: ${l.text}`).toBeCloseTo(l.y, 0);
      });
    });
  }, 60_000);

  it('Share › Export PDF downloads it: title page first, then the script pages, font embedded', async () => {
    const app = await openInPageView();
    const pages = paginate(blocksOf(app.host)).pages.length;
    const blobs: Blob[] = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => {
      if (b instanceof Blob) blobs.push(b);
      return original(b);
    };
    try {
      await commands.clickAt('[data-slot="full"] button[aria-label="Share"]', 10, 10);
      const items = [...app.host.querySelectorAll<HTMLElement>('.menu[aria-label="Share"] .mi')];
      expect(items.map((i) => i.textContent?.trim())).toContain('Export PDF');
      items
        .find((i) => i.textContent?.trim() === 'Export PDF')!
        .setAttribute('data-test-target', 'export');
      await commands.clickAt('[data-test-target="export"]', 4, 4);
      await until(() => blobs.length > 0, 10_000);
    } finally {
      URL.createObjectURL = original;
    }
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    expect(blobs[0]!.type).toBe('application/pdf');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(pages + 1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getTitle()).toBe('Untitled script');
    // The embedded font: a FontFile2 stream whose descriptor names Courier Prime.
    const fonts = doc.context
      .enumerateIndirectObjects()
      .map(([, o]) => o)
      .filter(
        (o): o is PDFDict =>
          o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('FontDescriptor'),
      );
    expect(fonts.map((f) => String(f.get(PDFName.of('FontName'))))).toEqual([
      expect.stringMatching(/^\/CourierPrime-Regular/),
    ]);
    expect(fonts[0]!.get(PDFName.of('FontFile2'))).toBeDefined();
  }, 60_000);
});

describe('the title page', () => {
  it('centers the title, the episode in quotes, and "Written by" with a team joined by &', () => {
    const t = layoutTitlePage({
      title: 'The Long Night',
      episode: 'Pilot',
      writers: ['Arnav Sabat', 'Maya Alvarez'],
    });
    expect(t.map((l) => l.text)).toEqual([
      'THE LONG NIGHT',
      '"Pilot"',
      'Written by',
      'Arnav Sabat & Maya Alvarez',
    ]);
    for (const l of t) expect(l.x + (l.text.length * CHAR) / 2).toBeCloseTo(4.5 * 72, 5);
    expect(t[0]!.y).toBe(72 + 21 * 12);
  });
});
