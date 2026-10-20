// Tests 1-3: concurrent structural edits. Concurrency is made deterministic by taking both
// clients offline, editing both with real key presses, then reconnecting (state-vector sync).
import { afterEach, describe, expect, it } from 'vitest';
import { blocksOf, placeCursor, setElementType, posIn } from '../src/editor';
import {
  converged,
  evidence,
  idsUnique,
  keys,
  room,
  SCENE,
  summary,
  texts,
  typeText,
  VARIANTS,
  type Room,
} from './helpers';

let r: Room | undefined;
afterEach(() => r?.destroy());

const joined = (rm: Room) => texts(rm.a).join('');
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** Character multiset: proves nothing was lost or duplicated even if text moved between lines. */
function sameChars(actual: string, expected: string) {
  const freq = (s: string) => {
    const m = new Map<string, number>();
    for (const ch of s) m.set(ch, (m.get(ch) ?? 0) + 1);
    return [...m.entries()].sort(([x], [y]) => (x < y ? -1 : 1));
  };
  return JSON.stringify(freq(actual)) === JSON.stringify(freq(expected));
}
const ORIGINAL = SCENE.map((b) => b.text).join('');

describe.each(VARIANTS)('Test 1: concurrent Enters at the end of lines (%s)', (variant) => {
  it('same line: both clients press Enter at the end of the same block and type', async () => {
    r = room(variant, SCENE);
    r.net.goOffline();
    placeCursor(r.a, 1, 'end');
    await keys(r.a, '{Enter}');
    await typeText(r.a, 'Alpha line.');
    placeCursor(r.b, 1, 'end');
    await keys(r.b, '{Enter}');
    await typeText(r.b, 'Beta line.');
    const sync = r.net.reconnect();
    evidence('1-same-line', { variant, sync, result: summary(r.a).slice(0, 5) });
    expect(converged(r)).toBe(true);
    expect(idsUnique(r.a)).toBe(true);
    expect(texts(r.a)[1]).toBe(SCENE[1]!.text);
    expect(texts(r.a)).toContain('Alpha line.');
    expect(texts(r.a)).toContain('Beta line.');
    expect(blocksOf(r.a).length).toBe(SCENE.length + 2);
  });

  it('different lines: Enter after a heading on one client, after dialogue on the other', async () => {
    r = room(variant, SCENE);
    r.net.goOffline();
    placeCursor(r.a, 0, 'end');
    await keys(r.a, '{Enter}');
    await typeText(r.a, 'After the heading.');
    placeCursor(r.b, 3, 'end');
    await keys(r.b, '{Enter}');
    await typeText(r.b, 'After the dialogue.');
    r.net.reconnect();
    evidence('1-different-lines', { variant, result: summary(r.a) });
    expect(converged(r)).toBe(true);
    expect(idsUnique(r.a)).toBe(true);
    const s = summary(r.a);
    expect(s).toContain('action: After the heading.');
    expect(s).toContain('action: After the dialogue.');
  });

  it('bursts: five Enter+word pairs on each client at the same spot keep each client’s order', async () => {
    r = room(variant, SCENE);
    r.net.goOffline();
    placeCursor(r.a, 4, 'end');
    for (let i = 1; i <= 5; i++) {
      await keys(r.a, '{Enter}');
      await typeText(r.a, `A${i}`);
    }
    placeCursor(r.b, 4, 'end');
    for (let i = 1; i <= 5; i++) {
      await keys(r.b, '{Enter}');
      await typeText(r.b, `B${i}`);
    }
    r.net.reconnect();
    const t = texts(r.a);
    evidence('1-bursts', { variant, result: t.slice(4, 15) });
    expect(converged(r)).toBe(true);
    expect(idsUnique(r.a)).toBe(true);
    const aOrder = t.filter((x) => /^A\d$/.test(x));
    const bOrder = t.filter((x) => /^B\d$/.test(x));
    expect(aOrder).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
    expect(bOrder).toEqual(['B1', 'B2', 'B3', 'B4', 'B5']);
  });
});

describe.each(VARIANTS)(
  'Test 2: mid-line split while the other client types in the tail (%s)',
  (variant) => {
    const LINE = SCENE[1]!.text; // "Rain hammers the window. MARA grips the counter."
    const SPLIT = LINE.indexOf('MARA');

    async function splitWhileTyping(rm: Room, typeAt: number | 'end', insert: string) {
      rm.net.goOffline();
      placeCursor(rm.a, 1, SPLIT);
      await keys(rm.a, '{Enter}');
      placeCursor(rm.b, 1, typeAt);
      await typeText(rm.b, insert);
      const sync = rm.net.reconnect();
      return sync;
    }

    it('other client types at the end of the line being split', async () => {
      r = room(variant, SCENE);
      const sync = await splitWhileTyping(r, 'end', ' Thunder.');
      const result = summary(r.a).slice(0, 4);
      evidence('2-tail-end', { variant, sync, result });
      expect(converged(r)).toBe(true);
      r.a.view.state.doc.check(); // throws if the document structure is invalid
      expect(idsUnique(r.a)).toBe(true);
      // No text lost or duplicated: every original character and the typed text survive exactly once.
      const all = joined(r);
      expect(count(all, 'Rain hammers the window. ')).toBe(1);
      expect(count(all, 'MARA grips the counter.')).toBe(1);
      expect(count(all, ' Thunder.')).toBe(1);
    });

    it('other client types inside the tail, just after the split point', async () => {
      r = room(variant, SCENE);
      await splitWhileTyping(r, SPLIT + 4, ' (wet)');
      const result = summary(r.a).slice(0, 4);
      evidence('2-tail-middle', { variant, result });
      expect(converged(r)).toBe(true);
      r.a.view.state.doc.check();
      const all = joined(r);
      expect(count(all, ' (wet)')).toBe(1);
      expect(count(all, 'Rain hammers the window. ')).toBe(1);
      expect(all.replace(' (wet)', '')).toContain('MARA grips the counter.');
    });

    it('other client types in the head, before the split point', async () => {
      r = room(variant, SCENE);
      await splitWhileTyping(r, 4, ' (heavy)');
      const result = summary(r.a).slice(0, 4);
      evidence('2-head', { variant, result });
      expect(converged(r)).toBe(true);
      const all = joined(r);
      expect(count(all, ' (heavy)')).toBe(1);
      expect(count(all, 'MARA grips the counter.')).toBe(1);
    });

    it('live: split lands while the other client is typing character by character (network on)', async () => {
      r = room(variant, SCENE);
      // Real keystrokes go to whichever editor has focus, so B "types" by inserting one character
      // at its own cursor every 15 ms (its cursor follows remote changes), while A presses a real
      // Enter mid-line.
      const b = r.b;
      placeCursor(b, 1, 'end');
      const typing = (async () => {
        for (const ch of ' Lightning cracks.') {
          b.view.dispatch(b.view.state.tr.insertText(ch));
          await new Promise((res) => setTimeout(res, 15));
        }
      })();
      await new Promise((res) => setTimeout(res, 60));
      placeCursor(r.a, 1, SPLIT);
      await keys(r.a, '{Enter}');
      await typing;
      await r.net.settle();
      await new Promise((res) => setTimeout(res, 20)); // let deferred ID repairs sync
      await r.net.settle();
      const result = summary(r.a).slice(0, 4);
      const all = joined(r);
      const typedTextIntact = count(all, ' Lightning cracks.') === 1;
      evidence('2-live', { variant, result, typedTextIntact });
      expect(converged(r)).toBe(true);
      r.a.view.state.doc.check();
      expect(idsUnique(r.a)).toBe(true);
      // Pass criterion: nothing lost, nothing duplicated (characters may land on the other line).
      expect(sameChars(all, ORIGINAL + ' Lightning cracks.')).toBe(true);
    });
  },
);

describe.each(VARIANTS)(
  'Test 3: element type change while the other client types in the same block (%s)',
  (variant) => {
    it('Tab turns dialogue into a parenthetical while the other client types in it', async () => {
      r = room(variant, SCENE);
      r.net.goOffline();
      placeCursor(r.a, 3, 5);
      await keys(r.a, '{Tab}'); // Dialogue -> Parenthetical (real key press)
      placeCursor(r.b, 3, 'end');
      await typeText(r.b, ' Please.');
      r.net.reconnect();
      const b3 = blocksOf(r.a)[3]!;
      const lost = !joined(r).includes(' Please.');
      evidence('3-tab', { variant, block: b3, lostOtherClientsTyping: lost });
      expect(converged(r)).toBe(true);
      expect(b3.type).toBe('parenthetical');
      // nodeTypes: a type change deletes and recreates the Yjs element, so concurrent typing is lost.
      expect(lost).toBe(variant === 'nodeTypes');
    });

    it('a type change from the element menu (Action → Character) while the other client types', async () => {
      r = room(variant, SCENE);
      r.net.goOffline();
      const pos = posIn(r.a, 4) - 1;
      r.a.view.dispatch(setElementType(r.a.kit, r.a.view.state, pos, 'character'));
      placeCursor(r.b, 4, 4);
      await typeText(r.b, ' really');
      r.net.reconnect();
      const b4 = blocksOf(r.a)[4]!;
      const lost = !joined(r).includes(' really');
      evidence('3-menu', { variant, block: b4, lostOtherClientsTyping: lost });
      expect(converged(r)).toBe(true);
      expect(b4.type).toBe('character');
      expect(lost).toBe(variant === 'nodeTypes');
    });

    it('both clients change the same block to different types while one also types', async () => {
      r = room(variant, SCENE);
      r.net.goOffline();
      const pos = posIn(r.a, 4) - 1;
      r.a.view.dispatch(setElementType(r.a.kit, r.a.view.state, pos, 'character'));
      r.b.view.dispatch(setElementType(r.b.kit, r.b.view.state, pos, 'shot'));
      placeCursor(r.b, 4, 'end');
      await typeText(r.b, ' Hold on her.');
      r.net.reconnect();
      await new Promise((res) => setTimeout(res, 20)); // let deferred ID repairs sync
      await r.net.settle();
      const b4 = blocksOf(r.a)[4]!;
      const all = joined(r);
      const duplicated = count(all, 'She does not believe it either.') > 1;
      evidence('3-both-change', {
        variant,
        block: b4,
        duplicated,
        result: summary(r.a).slice(3, 7),
      });
      expect(converged(r)).toBe(true);
      expect(idsUnique(r.a)).toBe(true);
      expect(['character', 'shot']).toContain(b4.type);
      expect(count(all, ' Hold on her.')).toBe(1);
      // nodeTypes: each client's type change creates a replacement element, so the line is duplicated.
      expect(duplicated).toBe(variant === 'nodeTypes');
    });
  },
);
