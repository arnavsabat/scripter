// Test 4: both clients offline, both edit, then reconnect and merge.
import { afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import * as Y from 'yjs';
import { blocksOf, enterCommand, placeCursor, setElementType, type Client } from '../src/editor';
import { generateScript } from '../src/generate';
import { ELEMENT_TYPES } from '../src/schema';
import {
  converged,
  evidence,
  idsUnique,
  keys,
  room,
  SCENE,
  sleep,
  summary,
  texts,
  typeText,
  VARIANTS,
  type Room,
} from './helpers';

let r: Room | undefined;
afterEach(() => r?.destroy());

/** Seeded PRNG so a failing run can be replayed exactly. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** Positions just after a space inside some block: inserting or splitting there never cuts a word. */
function wordBoundaries(c: Client) {
  const out: number[] = [];
  c.view.state.doc.forEach((node, pos) => {
    const t = node.textContent;
    for (let i = 0; i < t.length; i++) if (t[i] === ' ') out.push(pos + 1 + i + 1);
    out.push(pos + 1 + t.length);
  });
  return out;
}

/**
 * `n` random edits on one client: insert a unique token (70%), split a block at a word boundary
 * with the Enter command (15%), or change a block's element type (15%). No deletions, so every
 * token must survive the merge exactly once.
 */
function randomEdits(c: Client, n: number, seed: number, tag: string) {
  const rand = rng(seed);
  const tokens: string[] = [];
  for (let i = 0; i < n; i++) {
    const roll = rand();
    const positions = wordBoundaries(c);
    const pos = positions[Math.floor(rand() * positions.length)]!;
    const { state } = c.view;
    if (roll < 0.7) {
      const token = ` ${tag}${i.toString(36)}q `;
      tokens.push(token.trim());
      c.view.dispatch(state.tr.insertText(token, pos));
    } else if (roll < 0.85) {
      c.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
      enterCommand(c.kit)(c.view.state, c.view.dispatch);
    } else {
      const blockPos = state.doc.resolve(pos).before();
      const to = ELEMENT_TYPES[Math.floor(rand() * ELEMENT_TYPES.length)]!;
      c.view.dispatch(setElementType(c.kit, state, blockPos, to));
    }
  }
  return tokens;
}

describe.each(VARIANTS)('Test 4: both offline, edit, reconnect and merge (%s)', (variant) => {
  it('a realistic session: both writers keep working in the same scene, with real keys', async () => {
    r = room(variant, SCENE);
    r.net.goOffline();
    // A finishes the kitchen scene.
    placeCursor(r.a, 4, 'end');
    await keys(r.a, '{Enter}{Tab}');
    await typeText(r.a, 'DEV');
    await keys(r.a, '{Enter}');
    await typeText(r.a, 'Then fix it.');
    // B rewrites the first action line and adds a beat to the harbor scene.
    placeCursor(r.b, 1, 'end');
    await typeText(r.b, ' The lights flicker.');
    placeCursor(r.b, 6, 'end');
    await keys(r.b, '{Enter}');
    await typeText(r.b, 'A gull circles overhead.');
    const sync = r.net.reconnect();
    await sleep(20);
    await r.net.settle();
    evidence('4-realistic', { variant, sync, result: summary(r.a) });
    expect(converged(r)).toBe(true);
    expect(idsUnique(r.a)).toBe(true);
    const s = summary(r.a);
    expect(s).toContain('character: DEV');
    expect(s).toContain('dialogue: Then fix it.');
    expect(s).toContain(
      'action: Rain hammers the window. MARA grips the counter. The lights flicker.',
    );
    expect(s).toContain('action: A gull circles overhead.');
  });

  it('a long offline session: 1,500 random edits per client on a 20-page script', async () => {
    r = room(variant, (kit) => generateScript(kit, 20), { pageBreaks: 'off' });
    const before = Y.encodeStateAsUpdate(r.a.ydoc).byteLength;
    r.net.goOffline();
    const tokensA = randomEdits(r.a, 1500, 11, 'ka');
    const tokensB = randomEdits(r.b, 1500, 29, 'kb');
    const sync = r.net.reconnect();
    await sleep(20);
    await r.net.settle();
    const all = texts(r.a).join(' ');
    const words = all.split(/\s+/);
    const seen = new Map<string, number>();
    for (const w of words) seen.set(w, (seen.get(w) ?? 0) + 1);
    const lostA = tokensA.filter((t) => seen.get(t) !== 1);
    const lostB = tokensB.filter((t) => seen.get(t) !== 1);
    evidence('4-long-offline', {
      variant,
      blocks: blocksOf(r.a).length,
      docBytesBefore: before,
      docBytesAfter: Y.encodeStateAsUpdate(r.a.ydoc).byteLength,
      reconnect: sync,
      tokensA: tokensA.length,
      tokensB: tokensB.length,
      lostOrDuplicatedA: lostA.length,
      lostOrDuplicatedB: lostB.length,
      exampleLost: [...lostA, ...lostB].slice(0, 5),
      converged: converged(r),
    });
    expect(converged(r)).toBe(true);
    expect(idsUnique(r.a)).toBe(true);
    if (variant === 'typeAttr') {
      expect(lostA).toEqual([]);
      expect(lostB).toEqual([]);
    } else {
      // nodeTypes: the other client's type changes delete elements, taking concurrent tokens with them.
      expect(lostA.length + lostB.length).toBeGreaterThan(0);
    }
  });
});
