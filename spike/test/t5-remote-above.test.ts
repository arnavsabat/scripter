// Test 5: remote edits above your cursor. The cursor and viewport hold still, and the fake
// page-break markers never flicker or vanish.
import { afterEach, describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import {
  blocksOf,
  computeBreaks,
  cursorOf,
  enterCommand,
  pageBreakKey,
  placeCursor,
  posIn,
  setElementType,
  type Client,
} from '../src/editor';
import { generateScript } from '../src/generate';
import type { BlockSpec } from '../src/schema';
import { evidence, nextFrame, room, sleep, VARIANTS, type Room } from './helpers';

let r: Room | undefined;
let stopSampling: (() => void) | undefined;
afterEach(() => {
  stopSampling?.();
  r?.destroy();
});

/** The block A is working in: the first block at least 300 blocks down with 20+ characters. */
function target(c: Client) {
  return blocksOf(c).findIndex((b, i) => i >= 300 && b.text.length >= 20);
}

function caretTop(c: Client) {
  const top = c.view.coordsAtPos(c.view.state.selection.head).top;
  return top - c.scroller.getBoundingClientRect().top;
}

function widgetKeys(c: Client) {
  return [...c.view.dom.querySelectorAll<HTMLElement>('.pb')].map(
    (el) => `${el.dataset.block}:${el.dataset.page}`,
  );
}

function widgetMap(c: Client) {
  return new Map(
    [...c.view.dom.querySelectorAll<HTMLElement>('.pb')].map((el) => [
      `${el.dataset.block}:${el.dataset.page}`,
      el,
    ]),
  );
}

function expectedKeys(c: Client) {
  return computeBreaks(c.kit, c.view.state.doc).map((b) => `${b.blockId}:${b.page}`);
}

/** Samples A's page-break widgets on every animation frame and counts frames that are wrong. */
function sampleFrames(c: Client) {
  const stats = { frames: 0, badFrames: 0, minWidgets: Infinity };
  let running = true;
  const loop = () => {
    if (!running) return;
    const actual = widgetKeys(c);
    stats.frames += 1;
    stats.minWidgets = Math.min(stats.minWidgets, actual.length);
    if (actual.join() !== expectedKeys(c).join()) stats.badFrames += 1;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  stopSampling = () => (running = false);
  return stats;
}

/**
 * SPEC 5.8: anchor the viewport to a block ID. Before each remote update, remember the block the
 * cursor is in (if it's on screen; otherwise the first visible block) and where it sits; after the
 * update, scroll so that block is back in the same place. Anchoring to the cursor's block rather
 * than the top of the viewport also absorbs page breaks that reflow between the two.
 */
function anchorToBlocks(rm: Room, prefer: 'cursor' | 'top') {
  const c = rm.a;
  let anchor: { id: string; top: number } | null = null;
  const topOf = (el: Element) =>
    el.getBoundingClientRect().top - c.scroller.getBoundingClientRect().top;
  rm.net.beforeApply = (doc) => {
    if (doc !== c.ydoc) return;
    if (prefer === 'cursor') {
      const id = cursorOf(c).blockId;
      const el = c.view.dom.querySelector(`p[data-id="${id}"]`);
      if (el && topOf(el) >= 0 && topOf(el) < c.scroller.clientHeight) {
        anchor = { id, top: topOf(el) };
        return;
      }
    }
    const blocks = c.view.dom.querySelectorAll<HTMLElement>('p[data-id]');
    for (const el of blocks) {
      if (topOf(el) + el.offsetHeight > 0) {
        anchor = { id: el.dataset.id!, top: topOf(el) };
        break;
      }
    }
  };
  rm.net.afterApply = (doc) => {
    if (doc !== c.ydoc || !anchor) return;
    const el = c.view.dom.querySelector(`p[data-id="${anchor.id}"]`);
    if (el) c.scroller.scrollTop += topOf(el) - anchor.top;
    anchor = null;
  };
}

/** Watches A's editor DOM and counts block elements that were replaced (re-rendered). */
function watchRerenders(c: Client) {
  const counter = { removedBlocks: 0 };
  const mo = new MutationObserver((records) => {
    for (const rec of records)
      rec.removedNodes.forEach((n) => {
        if (n instanceof HTMLElement && n.tagName === 'P') counter.removedBlocks += 1;
      });
  });
  mo.observe(c.view.dom, { childList: true });
  return { counter, stop: () => mo.disconnect() };
}

/** B makes six kinds of edits, all above A's block. Each is delivered and checked before the next. */
async function remoteEditsAbove(rm: Room, after: (label: string) => void) {
  const b = rm.b;
  const block = (spec: BlockSpec): Node => b.kit.block(spec);
  const step = async (label: string, edit: () => void) => {
    edit();
    await rm.net.settle();
    await sleep(5); // deferred ID repairs, if any
    await rm.net.settle();
    after(label);
  };
  await step('insert 3 blocks at the top', () =>
    b.view.dispatch(
      b.view.state.tr.insert(posIn(b, 1) - 1, [
        block({ type: 'action', text: 'A new opening image, wide and quiet.' }),
        block({ type: 'character', text: 'NARRATOR' }),
        block({ type: 'dialogue', text: 'It started with the rain.' }),
      ]),
    ),
  );
  await step('type 40 characters, one update per keystroke', () => {
    for (const ch of ' She waits for the kettle to scream out.') {
      b.view.dispatch(b.view.state.tr.insertText(ch, posIn(b, 8, 'end')));
    }
  });
  await step('delete a block', () => {
    const from = posIn(b, 20) - 1;
    const node = b.view.state.doc.nodeAt(from)!;
    b.view.dispatch(b.view.state.tr.delete(from, from + node.nodeSize));
  });
  await step('change an element type', () =>
    b.view.dispatch(setElementType(b.kit, b.view.state, posIn(b, 30) - 1, 'shot')),
  );
  await step('split a line with Enter', () => {
    b.view.dispatch(
      b.view.state.tr.setSelection(TextSelection.create(b.view.state.doc, posIn(b, 40, 5))),
    );
    enterCommand(b.kit)(b.view.state, b.view.dispatch);
  });
  await step('paste 30 blocks near the top', () => {
    const specs: BlockSpec[] = Array.from({ length: 30 }, (_, i) => ({
      type: i % 3 === 0 ? 'character' : i % 3 === 1 ? 'dialogue' : 'action',
      text:
        i % 3 === 0
          ? 'DEV'
          : `Pasted line ${i} that is long enough to wrap onto a second line of the page.`,
    }));
    b.view.dispatch(b.view.state.tr.insert(posIn(b, 2) - 1, specs.map(block)));
  });
}

describe.each(VARIANTS)('Test 5: remote edits above your cursor (%s)', (variant) => {
  describe.each(['native', 'none', 'topBlockAnchor', 'cursorBlockAnchor'] as const)(
    'scroll anchoring: %s',
    (anchoring) => {
      it('cursor holds its place in the text, page breaks are right on every frame, and the viewport holds', async () => {
        r = room(variant, (kit) => generateScript(kit, 20));
        const a = r.a;
        a.scroller.style.overflowAnchor = anchoring === 'native' ? 'auto' : 'none';
        if (anchoring === 'topBlockAnchor') anchorToBlocks(r, 'top');
        if (anchoring === 'cursorBlockAnchor') anchorToBlocks(r, 'cursor');

        // A is working in the target block, scrolled so that it sits 250 px down the viewport.
        const t = target(a);
        const targetId = blocksOf(a)[t]!.id;
        const targetEl = a.view.nodeDOM(posIn(a, t) - 1) as HTMLElement;
        a.scroller.scrollTop = targetEl.offsetTop - 250;
        placeCursor(a, t, 10);
        const blockTop = () => {
          const el = a.view.dom.querySelector(`p[data-id="${targetId}"]`)!;
          return el.getBoundingClientRect().top - a.scroller.getBoundingClientRect().top;
        };
        const block0 = blockTop();
        await nextFrame();
        const cursor0 = cursorOf(a);
        const caret0 = caretTop(a);

        const frames = sampleFrames(a);
        const rerenders = watchRerenders(a);
        const steps: Record<string, unknown>[] = [];
        let widgetsBefore = widgetMap(a);
        await remoteEditsAbove(r, (label) => {
          // Widgets whose page didn't move should be the very same DOM nodes (no flicker).
          const now = widgetMap(a);
          let sameNode = 0;
          let recreated = 0;
          for (const [key, el] of now) {
            const prev = widgetsBefore.get(key);
            if (prev === el) sameNode += 1;
            else if (prev) recreated += 1;
          }
          widgetsBefore = now;
          steps.push({
            label,
            cursorSame: JSON.stringify(cursorOf(a)) === JSON.stringify(cursor0),
            caretDriftPx: Math.round(caretTop(a) - caret0),
            blockDriftPx: Math.round(blockTop() - block0),
            widgetsCorrect: widgetKeys(a).join() === expectedKeys(a).join(),
            widgetsSameNode: sameNode,
            widgetsRecreated: recreated,
            rerenderedBlocks: rerenders.counter.removedBlocks,
          });
          rerenders.counter.removedBlocks = 0;
        });
        for (let i = 0; i < 5; i++) await nextFrame();
        rerenders.stop();

        evidence(`5-${anchoring}`, {
          variant,
          blocks: blocksOf(a).length,
          pages: expectedKeys(a).length + 1,
          steps,
          cursor: cursor0,
          frames,
          converged:
            blocksOf(a)
              .map((x) => x.text)
              .join() ===
            blocksOf(r.b)
              .map((x) => x.text)
              .join(),
        });

        for (const s of steps) {
          expect(s.cursorSame, String(s.label)).toBe(true);
          expect(s.widgetsCorrect, String(s.label)).toBe(true);
        }
        expect(frames.badFrames).toBe(0);
        for (const s of steps) expect(s.widgetsRecreated, String(s.label)).toBe(0);
        if (anchoring === 'cursorBlockAnchor') {
          for (const s of steps)
            expect(Math.abs(s.blockDriftPx as number), String(s.label)).toBeLessThanOrEqual(1);
        }
      });
    },
  );

  it('control: page breaks mapped through transactions (the naive approach) vanish on the first remote edit', async () => {
    r = room(variant, (kit) => generateScript(kit, 20), { pageBreaks: 'mapped' });
    r.a.view.dispatch(r.a.view.state.tr.setMeta(pageBreakKey, true)); // compute once, after load
    const before = r.a.view.dom.querySelectorAll('.pb').length;
    r.b.view.dispatch(r.b.view.state.tr.insertText('x', posIn(r.b, 1, 0)));
    await r.net.settle();
    const after = r.a.view.dom.querySelectorAll('.pb').length;
    evidence('5-mapped-control', {
      variant,
      widgetsBefore: before,
      widgetsAfterOneRemoteKeystroke: after,
    });
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(0);
  });

  it('the block holding your cursor is deleted by the other client: the cursor lands next to it', async () => {
    r = room(variant, (kit) => generateScript(kit, 5));
    placeCursor(r.a, 20, 5);
    const neighbours = { before: blocksOf(r.a)[19]!.id, after: blocksOf(r.a)[21]!.id };
    const from = posIn(r.b, 20) - 1;
    r.b.view.dispatch(
      r.b.view.state.tr.delete(from, from + r.b.view.state.doc.nodeAt(from)!.nodeSize),
    );
    await r.net.settle();
    const c = cursorOf(r.a);
    evidence('5-cursor-block-deleted', { variant, neighbours, cursorNow: c });
    expect([neighbours.before, neighbours.after]).toContain(c.blockId);
  });
});
