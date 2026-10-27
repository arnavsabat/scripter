import type { ElementType } from '@wr/schema';
import { describe, expect, it } from 'vitest';
import { LINES_PER_PAGE } from '../src/geometry';
import { paginate, type Block, type Item, type Pagination } from '../src/paginate';

// ---- Builders with exact line counts ----

let ids = 0;
const blk = (type: ElementType, text: string): Block => ({ id: `b${++ids}`, type, text });
/** `n` lines of action, one full 60-character sentence per line (so it can split anywhere). */
const sentences = (n: number, width = 60) =>
  Array.from({ length: n }, () => `${'abcd '.repeat(width / 5 - 1)}abcd.`).join(' ');
/** `n` lines of action with no sentence end anywhere (can't split). */
const unbroken = (n: number) => Array.from({ length: n * 12 }, () => 'abcd').join(' ');
const action = (n: number) => blk('action', sentences(n));
const heading = (t = 'INT. KITCHEN - NIGHT') => blk('scene_heading', t);
const cue = (name = 'JOHN') => blk('character', name);
const dialogue = (n: number) => blk('dialogue', sentences(n, 35));
const paren = (t = '(quietly)') => blk('parenthetical', t);

const texts = (p: Pagination, page: number) =>
  p.pages[page - 1]!.items.filter((i): i is Extract<Item, { kind: 'text' }> => i.kind === 'text');
const kinds = (p: Pagination, page: number) => p.pages[page - 1]!.items.map((i) => i.kind);
const lastText = (p: Pagination, page: number) => texts(p, page).at(-1)!;
const firstText = (p: Pagination, page: number) => texts(p, page)[0]!;

/** Lines each page uses, (MORE)/(CONTINUED) included. */
function linesUsed(p: Pagination, page: number) {
  const pg = p.pages[page - 1]!;
  return (
    pg.used +
    pg.items.filter((i) => i.kind === 'more').length +
    pg.items.filter((i) => i.kind === 'continued').length * 2
  );
}

describe('filling a page', () => {
  it('a short script is one page with no breaks', () => {
    const p = paginate([heading(), action(3), cue(), dialogue(2)]);
    expect(p.pages).toHaveLength(1);
    expect(p.breaks).toEqual([]);
    // heading 1 + blank + 3 + blank + cue 1 + 2 (dialogue directly under the cue)
    expect(p.pages[0]!.used).toBe(1 + 1 + 3 + 1 + 1 + 2);
  });

  it('two blank lines before a scene heading, one between other elements, none at a page top', () => {
    const p = paginate([action(1), heading(), action(1)]);
    expect(texts(p, 1).map((t) => t.spaceBefore)).toEqual([0, 2, 1]);
    expect(p.pages[0]!.used).toBe(1 + 2 + 1 + 1 + 1);
  });

  it(`a page holds ${LINES_PER_PAGE} lines; the next line starts page 2 with no space above it`, () => {
    // 27 one-line actions with a blank between = 53 lines; 27 + 1 more makes 55.
    const fits = Array.from({ length: 27 }, () => blk('action', 'One line.'));
    expect(paginate(fits).pages).toHaveLength(1);
    const over = paginate([...fits, blk('action', 'Last.')]);
    expect(over.pages).toHaveLength(2);
    expect(firstText(over, 2).spaceBefore).toBe(0);
    expect(over.breaks[0]).toMatchObject({ page: 2, index: 27, offset: 0, fill: 1 });
  });

  it('page 2 starts where the break says, and no page ever exceeds the line count', () => {
    const p = paginate(Array.from({ length: 60 }, () => action(3)));
    for (const pg of p.pages) expect(linesUsed(p, pg.number)).toBeLessThanOrEqual(LINES_PER_PAGE);
    p.breaks.forEach((b, k) =>
      expect(p.pages[k + 1]!.start).toEqual({ index: b.index, offset: b.offset }),
    );
  });
});

describe('scene headings and shots never end a page', () => {
  it('a heading that would be the last line moves to the next page', () => {
    // 52 lines of action, a blank pair, then the heading would be line 54 with its action after.
    const p = paginate([action(51), heading(), action(4)]);
    expect(lastText(p, 1).type).toBe('action');
    expect(firstText(p, 2).type).toBe('scene_heading');
    expect(kinds(p, 1)).not.toContain('continued'); // the break falls before a new scene
  });

  it('a shot follows the same rule', () => {
    const p = paginate([action(52), blk('shot', 'ANGLE ON THE DOOR'), action(4)]);
    expect(firstText(p, 2).type).toBe('shot');
  });
});

describe('speeches', () => {
  it('a cue is never the last line: it moves with its dialogue', () => {
    const p = paginate([heading(), action(48), cue(), dialogue(4)]);
    expect(lastText(p, 1).type).not.toBe('character');
    expect(firstText(p, 2).type).toBe('character');
  });

  it('dialogue splits at a sentence with (MORE) and NAME (CONT’D), 2+ lines each side', () => {
    const p = paginate([heading(), action(44), cue('Maya'), dialogue(10)]);
    expect(kinds(p, 1).slice(-2)).toEqual(['more', 'continued']);
    expect(kinds(p, 2).slice(0, 2)).toEqual(['continuedTop', 'contd']);
    const contd = p.pages[1]!.items[1] as Extract<Item, { kind: 'contd' }>;
    expect(contd.lines).toEqual(["MAYA (CONT'D)"]);
    const head = lastText(p, 1);
    const tail = firstText(p, 2);
    expect(head.lines.length).toBeGreaterThanOrEqual(2);
    expect(tail.lines.length).toBeGreaterThanOrEqual(2);
    expect(tail.from).toBe(head.to);
    expect(head.lines.at(-1)).toMatch(/\.$/);
    expect(tail.spaceBefore).toBe(0);
    expect(p.breaks[0]).toMatchObject({ more: true, continued: true, continuedTop: true });
  });

  it('keeps an existing (CONT’D) and an extension in the cue', () => {
    const a = paginate([heading(), action(44), cue("John (V.O.) (cont'd)"), dialogue(10)]);
    expect((a.pages[1]!.items[1] as { lines: string[] }).lines).toEqual(["JOHN (V.O.) (CONT'D)"]);
    const b = paginate([heading(), action(44), cue('John (V.O.)'), dialogue(10)]);
    expect((b.pages[1]!.items[1] as { lines: string[] }).lines).toEqual(["JOHN (V.O.) (CONT'D)"]);
  });

  it('a speech that can’t keep 2 lines on each side moves whole', () => {
    // The cue lands on line 52: room for 1 line and (MORE), but 1/2 isn't allowed.
    const p = paginate([action(44), action(5), cue(), dialogue(3)]);
    expect(firstText(p, 2).type).toBe('character');
    expect(kinds(p, 1)).not.toContain('more');
  });

  it('a speech splits between its blocks too, with (MORE)', () => {
    const p = paginate([heading(), action(40), cue(), dialogue(6), paren(), dialogue(6)]);
    expect(kinds(p, 1)).toContain('more');
    expect(firstText(p, 2).type === 'parenthetical' || firstText(p, 2).type === 'dialogue').toBe(
      true,
    );
  });

  it('a parenthetical is never stranded at the bottom of a page', () => {
    // The break would land right after the parenthetical; it must go earlier.
    const p = paginate([heading(), action(43), cue(), dialogue(4), paren(), dialogue(5)]);
    expect(lastText(p, 1).type).not.toBe('parenthetical');
    for (const pg of p.pages) {
      const t = texts(p, pg.number).at(-1)!;
      if (pg.number < p.pages.length) expect(t.type).not.toBe('parenthetical');
    }
  });
});

describe('action', () => {
  it('splits at a sentence end with at least 2 lines each side', () => {
    // The second action starts on line 50: 3 lines fit above (CONTINUED).
    const p = paginate([heading(), action(46), action(10)]);
    const head = lastText(p, 1);
    const tail = firstText(p, 2);
    expect(head.index).toBe(tail.index);
    expect(head.lines.length).toBeGreaterThanOrEqual(2);
    expect(tail.lines.length).toBeGreaterThanOrEqual(2);
    expect(p.breaks[0]!.offset).toBe(tail.from);
  });

  it('splits mid-line at a sentence end (D-071 proposal)', () => {
    // The first sentence ends halfway along its second line.
    const t = `${unbroken(1)} ${unbroken(1).slice(0, 29)}. ${unbroken(6)}.`;
    const p = paginate([heading(), action(46), blk('action', t)]);
    const tail = firstText(p, 2);
    expect(tail.from).toBeGreaterThan(0);
    expect(t.slice(tail.from - 2, tail.from)).toBe('. ');
  });

  it('an action with no sentence end moves whole', () => {
    const p = paginate([heading(), action(48), blk('action', unbroken(8))]);
    expect(firstText(p, 2)).toMatchObject({ from: 0 });
    expect(texts(p, 1).at(-1)!.lines).toHaveLength(48);
  });

  it('a page-long paragraph with no sentence end is filled to the last line rather than looping', () => {
    const p = paginate([blk('action', unbroken(130))]);
    expect(p.pages).toHaveLength(3);
    expect(texts(p, 1)[0]!.lines).toHaveLength(54);
    expect(texts(p, 2)[0]!.lines).toHaveLength(54);
    expect(texts(p, 3)[0]!.lines).toHaveLength(22);
  });
});

describe('transitions stay with the block before them', () => {
  it('a transition that would start a page pulls part of the action before it along', () => {
    const p = paginate([heading(), action(40), action(10), blk('transition', 'CUT TO:')]);
    expect(firstText(p, 2).type).not.toBe('transition');
    expect(texts(p, 2).map((t) => t.type)).toContain('transition');
  });
});

describe('scene continueds (D-071)', () => {
  it('a break inside a scene ends with (CONTINUED) and starts with CONTINUED:', () => {
    const p = paginate([heading(), action(48), action(10)]);
    expect(kinds(p, 1).at(-1)).toBe('continued');
    expect(kinds(p, 2)[0]).toBe('continuedTop');
    expect(linesUsed(p, 1)).toBeLessThanOrEqual(LINES_PER_PAGE);
  });

  it('none before the first scene heading', () => {
    const p = paginate([action(48), action(10)]);
    expect(kinds(p, 1)).not.toContain('continued');
    expect(kinds(p, 2)).not.toContain('continuedTop');
  });
});

describe('capitals', () => {
  it('headings, cues, shots and transitions are counted in capitals (ß becomes SS)', () => {
    // 31 characters as typed, 62 in capitals: two lines.
    const p = paginate([blk('scene_heading', 'ß'.repeat(31))]);
    expect(texts(p, 1)[0]!.lines).toEqual(['S'.repeat(60), 'SS']);
  });
});

// ---- Properties over generated scripts ----

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function script(seed: number, scenes = 40): Block[] {
  const r = rng(seed);
  const words = () =>
    Array.from({ length: 3 + Math.floor(r() * 14) }, () =>
      'word'.slice(0, 1 + Math.floor(r() * 4)),
    ).join(' ');
  const para = (sentences: number) =>
    Array.from({ length: sentences }, () => `${words()}${r() < 0.2 ? '?' : '.'}`).join(' ');
  const out: Block[] = [];
  for (let s = 0; s < scenes; s++) {
    out.push(blk('scene_heading', `INT. ROOM ${s} - DAY`));
    const beats = 2 + Math.floor(r() * 8);
    for (let b = 0; b < beats; b++) {
      if (r() < 0.45) out.push(blk('action', para(1 + Math.floor(r() * 6))));
      else {
        out.push(blk('character', r() < 0.5 ? 'MAYA' : 'JOHN (V.O.)'));
        if (r() < 0.3) out.push(paren());
        out.push(blk('dialogue', para(1 + Math.floor(r() * 5))));
        if (r() < 0.2) out.push(paren('(beat)'), blk('dialogue', para(2)));
      }
    }
    if (r() < 0.3)
      out.push(blk(r() < 0.5 ? 'transition' : 'shot', r() < 0.5 ? 'CUT TO:' : 'ANGLE ON'));
  }
  return out;
}

describe('properties over 30 generated scripts', () => {
  const docs = Array.from({ length: 30 }, (_, i) => script(i + 1));

  it('every page fits, and every character of every block appears exactly once, in order', () => {
    for (const d of docs) {
      const p = paginate(d);
      for (const pg of p.pages) expect(linesUsed(p, pg.number)).toBeLessThanOrEqual(LINES_PER_PAGE);
      const seen = new Map<number, number>();
      for (const pg of p.pages)
        for (const t of texts(p, pg.number)) {
          expect(t.from).toBe(seen.get(t.index) ?? 0);
          seen.set(t.index, t.to);
        }
      d.forEach((b, i) => expect(seen.get(i)).toBe(b.text.length));
    }
  });

  it('no page ends with a heading, shot, cue or parenthetical; none starts with a transition', () => {
    for (const d of docs) {
      const p = paginate(d);
      for (const pg of p.pages.slice(0, -1)) {
        expect(['scene_heading', 'shot', 'character', 'parenthetical']).not.toContain(
          lastText(p, pg.number).type,
        );
        expect(firstText(p, pg.number + 1).type).not.toBe('transition');
      }
    }
  });

  it('incremental recomputation matches a full one after random edits', () => {
    const r = rng(99);
    for (const d of docs.slice(0, 10)) {
      let blocks = d;
      let prev = paginate(blocks);
      for (let e = 0; e < 25; e++) {
        const i = Math.floor(r() * blocks.length);
        const next = [...blocks];
        const op = r();
        if (op < 0.5) next[i] = { ...next[i]!, text: `${next[i]!.text} more words here.` };
        else if (op < 0.75) next.splice(i, 0, blk('action', 'A new line. And another.'));
        else next.splice(i, 1);
        const inc = paginate(next, prev);
        const full = paginate(next);
        expect(inc.breaks).toEqual(full.breaks);
        expect(inc.pages.map((p) => p.items)).toEqual(full.pages.map((p) => p.items));
        blocks = next;
        prev = inc;
      }
    }
  });

  it('a 110-page script paginates fast, and an edit near the end is cheaper still', () => {
    let big = script(7, 400);
    let p = paginate(big);
    while (p.pages.length < 110) {
      big = [...big, ...script(big.length, 40)];
      p = paginate(big);
    }
    const t0 = performance.now();
    paginate(big.map((b) => ({ ...b })));
    const full = performance.now() - t0;
    const edited = [...big];
    const k = big.length - 20;
    edited[k] = { ...edited[k]!, text: `${edited[k]!.text} x.` };
    const t1 = performance.now();
    paginate(edited, p);
    const inc = performance.now() - t1;
    expect(full).toBeLessThan(150);
    expect(inc).toBeLessThan(full);
  });
});
