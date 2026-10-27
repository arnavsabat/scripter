// The pure pagination function (SPEC 5.8): blocks in, pages out. Every client computes the same
// pages from the same document, so nothing about pages is synced. The screen's page view and the
// PDF both draw from this output, which is how they match page for page.
//
// How a page is filled: walk forward placing blocks until one doesn't fit, then try the possible
// break points from the latest backwards (a sentence split inside a block, or a break between
// blocks) and take the first one every rule allows. The rules (SPEC 5.8, D-071):
//   - a page never ends with a scene heading, a shot, a character cue or a parenthetical;
//   - a page never starts with a transition (it stays with the block before it);
//   - action splits only at a sentence end, with at least 2 lines on each side;
//   - a speech splits only at a sentence end or between its blocks, with at least 2 lines of it
//     on each side, "(MORE)" under the first part and "NAME (CONT'D)" over the second;
//   - a scene that runs across a break gets "(CONTINUED)" at the bottom and "CONTINUED:" at the
//     top of the next page (scene continueds, D-071).
// If nothing satisfies the rules (a page-long paragraph with no sentence end), the page is filled
// to the last line that fits rather than left empty.
import type { ElementType } from '@wr/schema';
import { COLUMNS, LINES_PER_PAGE, UPPERCASE, spaceBefore } from './geometry';
import { wrap, type WrappedLine } from './wrap';

export interface Block {
  id: string;
  type: ElementType;
  text: string;
}

/** Something drawn on a page, top to bottom. */
export type Item =
  | {
      kind: 'text';
      /** The block's position in the document, and the part of its text on this page. */
      index: number;
      id: string;
      type: ElementType;
      from: number;
      to: number;
      /** Blank lines above it on this page. */
      spaceBefore: number;
      /** The lines as drawn (capitals applied, hanging spaces removed). */
      lines: string[];
    }
  | { kind: 'continuedTop' } // "CONTINUED:" and a blank line
  | { kind: 'contd'; lines: string[] } // "NAME (CONT'D)"
  | { kind: 'more' } // "(MORE)", right under the speech
  | { kind: 'continued' }; // a blank line and "(CONTINUED)", on the page's last line

export interface Page {
  /** 1-based; page 1 shows no number (SPEC 3.8). */
  number: number;
  start: { index: number; offset: number };
  items: Item[];
  /** Lines taken by text and continueds, excluding the empty lines at the bottom. */
  used: number;
  /** The furthest block this page's layout looked at (for incremental recomputation). */
  examined: number;
}

/** What the screen draws between two pages, at the block where the second page starts. */
export interface PageBreak {
  /** The number of the page that starts here. */
  page: number;
  index: number;
  id: string;
  /** Character offset into the block's text: 0 between blocks, otherwise a split. */
  offset: number;
  /** Empty lines left at the bottom of the page above, between the text and the page edge. */
  fill: number;
  more: boolean;
  continued: boolean;
  continuedTop: boolean;
  /** The "NAME (CONT'D)" lines that open the next page, if a speech continues there. */
  contd: string[] | null;
}

export interface Pagination {
  blocks: readonly Block[];
  pages: Page[];
  breaks: PageBreak[];
}

// ---- Line counts, memoized by element type and text ----

const cache = new Map<string, WrappedLine[]>();
const display = (type: ElementType, text: string) =>
  UPPERCASE.has(type) ? text.toUpperCase() : text;

/** The wrapped lines of `text` as an element of `type` (cached: most blocks never change). */
export function linesOf(type: ElementType, text: string): WrappedLine[] {
  const key = `${type}\u0000${text}`;
  let lines = cache.get(key);
  if (!lines) {
    if (cache.size > 50_000) cache.clear();
    lines = wrap(display(type, text), COLUMNS[type].width);
    cache.set(key, lines);
  }
  return lines;
}

const contdCue = (cue: string): string[] => {
  const name = cue.toUpperCase().trim();
  const text = /\(CONT['’]D\)\s*$/.test(name) ? name : `${name} (CONT'D)`;
  return wrap(text, COLUMNS.character.width).map((l) => l.text);
};

/** Offsets where a new sentence starts: after . ? ! or … (and any closing quotes), then spaces. */
function sentenceStarts(text: string, from: number): number[] {
  const out: number[] = [];
  const re = /[.?!…]["'”’)\]]*( +)(?=\S)/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m.index + m[0].length);
  return out;
}

// ---- The document's structure: speeches and scenes ----

interface Structure {
  /** For each block: the character cue index of the speech it belongs to, or -1. */
  speech: Int32Array;
  /** For each block: whether a scene heading comes before it. */
  afterHeading: Uint8Array;
}

function structure(blocks: readonly Block[]): Structure {
  const speech = new Int32Array(blocks.length).fill(-1);
  const afterHeading = new Uint8Array(blocks.length);
  let cue = -1;
  let seenHeading = false;
  blocks.forEach((b, i) => {
    afterHeading[i] = seenHeading ? 1 : 0;
    if (b.type === 'scene_heading') seenHeading = true;
    if (b.type === 'character') cue = i;
    else if (b.type !== 'parenthetical' && b.type !== 'dialogue') cue = -1;
    speech[i] = cue;
  });
  return { speech, afterHeading };
}

// ---- Laying out one page ----

const NEVER_LAST: ReadonlySet<ElementType> = new Set([
  'scene_heading',
  'shot',
  'character',
  'parenthetical',
]);

interface Start {
  index: number;
  offset: number;
  continuedTop: boolean;
  contd: string[] | null;
}

interface Candidate {
  /** The next page starts at block `index`, character `offset`. */
  index: number;
  offset: number;
  /** Lines used on this page, before (MORE) and (CONTINUED). */
  used: number;
  /** For a split: the head's line count. */
  headLines: number;
  more: boolean;
  continued: boolean;
  contd: string[] | null;
  /** It fits on the page, (MORE) and (CONTINUED) included. */
  fits: boolean;
  /** It also satisfies every rule. */
  valid: boolean;
}

class Layout {
  private readonly s: Structure;
  /** The furthest block read while laying out the current page. */
  private reach = 0;
  constructor(private readonly blocks: readonly Block[]) {
    this.s = structure(blocks);
  }

  /** The lines of block `i` from character `from` on. */
  private tail(i: number, from: number): WrappedLine[] {
    const b = this.blocks[i]!;
    return linesOf(b.type, from ? b.text.slice(from) : b.text);
  }

  /** Lines of the speech that `i` belongs to, from block `a` (offset `aFrom`) up to block `z`. */
  private speechLines(a: number, aFrom: number, z: number): number {
    let n = 0;
    for (let i = a; i < z; i++)
      if (this.blocks[i]!.type !== 'character') n += this.tail(i, i === a ? aFrom : 0).length;
    return n;
  }

  /** Where the speech containing block `i` ends (exclusive). */
  private speechEnd(i: number): number {
    const cue = this.s.speech[i]!;
    let z = i;
    while (z < this.blocks.length && this.s.speech[z] === cue) z++;
    this.reach = Math.max(this.reach, z);
    return z;
  }

  page(number: number, start: Start): { page: Page; next: Start | null; brk: Candidate | null } {
    const { blocks } = this;
    const top = (start.continuedTop ? 2 : 0) + (start.contd?.length ?? 0);
    this.reach = start.index;
    // Forward pass: place whole blocks until one doesn't fit.
    const usedBefore: number[] = []; // per block from start.index: lines used before its spacing
    const spacing: number[] = [];
    let used = top;
    let prev: ElementType | null = start.contd ? 'character' : null;
    let overflow = blocks.length;
    for (let i = start.index; i < blocks.length; i++) {
      const b = blocks[i]!;
      const sp = spaceBefore(prev, b.type);
      const lines = this.tail(i, i === start.index ? start.offset : 0).length;
      usedBefore.push(used);
      spacing.push(sp);
      if (used + sp + lines > LINES_PER_PAGE) {
        overflow = i;
        break;
      }
      used += sp + lines;
      prev = b.type;
    }

    if (overflow === blocks.length) {
      const page = this.build(number, start, blocks.length, 0, null);
      page.examined = blocks.length;
      return { page, next: null, brk: null };
    }
    this.reach = Math.max(this.reach, overflow);

    // Break points from the latest back: splits inside block i, then the break before it.
    const at = (i: number) => i - start.index;
    let fallback: Candidate | null = null;
    for (let i = overflow; i >= start.index; i--) {
      const from = i === start.index ? start.offset : 0;
      for (const c of this.splits(i, from, usedBefore[at(i)]! + spacing[at(i)]!, start)) {
        if (c.valid) return this.finish(number, start, c);
        if (c.fits) fallback ??= c;
      }
      if (i > start.index) {
        const c = this.between(i, usedBefore[at(i)]!, start, top);
        if (c.valid) return this.finish(number, start, c);
        if (c.fits && c.used > top) fallback ??= c;
      }
    }
    // Nothing satisfies the rules: fill the page as far as it goes.
    const usedAtOverflow = usedBefore[at(overflow)]! + spacing[at(overflow)]!;
    return this.finish(number, start, fallback ?? this.forced(overflow, start, usedAtOverflow));
  }

  private bottom(more: boolean, continued: boolean) {
    return (more ? 1 : 0) + (continued ? 2 : 0);
  }

  /** The break before block `i`. */
  private between(i: number, used: number, start: Start, top: number): Candidate {
    const b = this.blocks[i]!;
    const last = this.blocks[i - 1]!;
    const cue = this.s.speech[i]!;
    const more = b.type !== 'character' && cue >= 0 && this.s.speech[i - 1] === cue;
    const continued = b.type !== 'scene_heading' && this.s.afterHeading[i] === 1;
    const fits = used + this.bottom(more, continued) <= LINES_PER_PAGE;
    let valid = fits && used > top && !NEVER_LAST.has(last.type) && b.type !== 'transition';
    if (valid && more) {
      const a = Math.max(cue + 1, start.index);
      const before = this.speechLines(a, a === start.index ? start.offset : 0, i);
      const after = this.speechLines(i, 0, this.speechEnd(i));
      valid = before >= 2 && after >= 2;
    }
    return {
      index: i,
      offset: 0,
      used,
      headLines: 0,
      more,
      continued,
      contd: more ? contdCue(this.blocks[cue]!.text) : null,
      fits,
      valid,
    };
  }

  /** Sentence splits inside block `i` (action or dialogue), latest first. */
  private *splits(i: number, from: number, used: number, start: Start): Generator<Candidate> {
    const b = this.blocks[i]!;
    if (b.type !== 'action' && b.type !== 'dialogue') return;
    const cue = this.s.speech[i]!;
    const more = b.type === 'dialogue' && cue >= 0;
    const continued = this.s.afterHeading[i] === 1;
    const room = LINES_PER_PAGE - used - this.bottom(more, continued);
    if (room < 1) return;
    const offsets = sentenceStarts(b.text, from).reverse();
    for (const offset of offsets) {
      const head = linesOf(b.type, b.text.slice(from, offset)).length;
      if (head > room) continue;
      const tail = linesOf(b.type, b.text.slice(offset)).length;
      let valid: boolean;
      if (more) {
        const a = Math.max(cue + 1, start.index);
        const before = this.speechLines(a, a === start.index ? start.offset : 0, i) + head;
        const after = tail + this.speechLines(i + 1, 0, this.speechEnd(i));
        valid = before >= 2 && after >= 2;
      } else valid = head >= 2 && tail >= 2;
      yield {
        index: i,
        offset,
        used: used + head,
        headLines: head,
        more,
        continued,
        contd: more ? contdCue(this.blocks[cue]!.text) : null,
        fits: true,
        valid,
      };
    }
  }

  /** Last resort: split block `i` at the last line that fits. */
  private forced(i: number, start: Start, used: number): Candidate {
    const b = this.blocks[i]!;
    const from = i === start.index ? start.offset : 0;
    const cue = this.s.speech[i]!;
    const more = b.type !== 'character' && cue >= 0;
    const continued = b.type !== 'scene_heading' && this.s.afterHeading[i] === 1;
    const lines = this.tail(i, from);
    const head = Math.max(
      1,
      Math.min(lines.length - 1, LINES_PER_PAGE - used - this.bottom(more, continued)),
    );
    return {
      index: i,
      offset: from + lines[head]!.start,
      used: used + head,
      headLines: head,
      more,
      continued,
      contd: more ? contdCue(this.blocks[cue]!.text) : null,
      fits: true,
      valid: true,
    };
  }

  private finish(number: number, start: Start, c: Candidate) {
    const page = this.build(number, start, c.index, c.offset, c);
    page.examined = this.reach;
    const next: Start = {
      index: c.index,
      offset: c.offset,
      continuedTop: c.continued,
      contd: c.contd,
    };
    return { page, next, brk: c };
  }

  /** The page's items, from `start` up to block `end` (and `headLines` of it, for a split). */
  private build(
    number: number,
    start: Start,
    end: number,
    endOffset: number,
    c: Candidate | null,
  ): Page {
    const items: Item[] = [];
    if (start.continuedTop) items.push({ kind: 'continuedTop' });
    if (start.contd) items.push({ kind: 'contd', lines: start.contd });
    let used = (start.continuedTop ? 2 : 0) + (start.contd?.length ?? 0);
    let prev: ElementType | null = start.contd ? 'character' : null;
    const last = endOffset > 0 ? end : end - 1;
    for (let i = start.index; i <= last && i < this.blocks.length; i++) {
      const b = this.blocks[i]!;
      const from = i === start.index ? start.offset : 0;
      const to = i === end ? endOffset : b.text.length;
      const lines = (
        i === end ? linesOf(b.type, b.text.slice(from, endOffset)) : this.tail(i, from)
      ).map((l) => l.text);
      const sp = spaceBefore(prev, b.type);
      items.push({
        kind: 'text',
        index: i,
        id: b.id,
        type: b.type,
        from,
        to,
        spaceBefore: sp,
        lines,
      });
      used += sp + lines.length;
      prev = b.type;
    }
    if (c?.more) items.push({ kind: 'more' });
    if (c?.continued) items.push({ kind: 'continued' });
    return {
      number,
      start: { index: start.index, offset: start.offset },
      items,
      used,
      examined: end,
    };
  }
}

const sameBlock = (a: Block | undefined, b: Block | undefined) =>
  !!a && !!b && a.id === b.id && a.type === b.type && a.text === b.text;

/**
 * Paginates `blocks`. Given the previous result, pages that end before the first changed block
 * (and didn't look past it) are reused, and layout restarts from there (SPEC 5.8).
 */
export function paginate(blocks: readonly Block[], prev?: Pagination): Pagination {
  const layout = new Layout(blocks);
  const pages: Page[] = [];
  const breaks: PageBreak[] = [];
  let start: Start | null = { index: 0, offset: 0, continuedTop: false, contd: null };

  if (prev) {
    let changed = 0;
    while (changed < blocks.length && sameBlock(blocks[changed], prev.blocks[changed])) changed++;
    if (changed === blocks.length && blocks.length === prev.blocks.length)
      return { ...prev, blocks };
    // Keep every page whose layout only looked at blocks before the change.
    let keep = 0;
    while (keep < prev.pages.length - 1 && prev.pages[keep]!.examined < changed) keep++;
    if (keep > 0) {
      pages.push(...prev.pages.slice(0, keep));
      breaks.push(...prev.breaks.slice(0, keep));
      const b = prev.breaks[keep - 1]!;
      start = { index: b.index, offset: b.offset, continuedTop: b.continuedTop, contd: b.contd };
    }
  }

  while (start) {
    const { page, next, brk } = layout.page(pages.length + 1, start);
    pages.push(page);
    if (next && brk) {
      const b = blocks[next.index]!;
      breaks.push({
        page: pages.length + 1,
        index: next.index,
        id: b.id,
        offset: next.offset,
        fill: LINES_PER_PAGE - page.used - (brk.more ? 1 : 0) - (brk.continued ? 2 : 0),
        more: brk.more,
        continued: brk.continued,
        continuedTop: next.continuedTop,
        contd: next.contd,
      });
    }
    start = next;
  }
  return { blocks, pages, breaks };
}
