// Test 7: performance on a script of about 110 pages at typing speed.
// Thresholds were fixed before measuring (Claude's proposal, see the spike report):
//   p95 local keystroke dispatch <= 16 ms and p95 remote update apply <= 16 ms (one 60 fps frame),
//   opening the script (binding the editor to the Y.Doc) <= 1,500 ms.
import { TextSelection } from 'prosemirror-state';
import { afterAll, describe, expect, it } from 'vitest';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import {
  blocksOf,
  computeBreaks,
  createClient,
  placeCursor,
  posIn,
  type Client,
} from '../src/editor';
import { generateScript } from '../src/generate';
import { Network } from '../src/net';
import { makeKit } from '../src/schema';
import { evidence, keys, sleep, stats, typeText, VARIANTS } from './helpers';

const PACE_MS = 100; // about 10 characters a second: a fast typist
const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((f) => f()));

function slowEvents() {
  const entries: { name: string; duration: number }[] = [];
  const po = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) entries.push({ name: e.name, duration: e.duration });
  });
  po.observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  const longTasks: number[] = [];
  const lt = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push(Math.round(e.duration));
  });
  lt.observe({ type: 'longtask', buffered: false });
  return {
    stop() {
      po.disconnect();
      lt.disconnect();
      return {
        slowInputEvents: entries.length,
        worstInputEventMs: Math.max(0, ...entries.map((e) => e.duration)),
        longTasks: longTasks.length,
        worstLongTaskMs: Math.max(0, ...longTasks),
      };
    },
  };
}

function middleBlock(c: Client, type: string) {
  const blocks = blocksOf(c);
  return blocks.findIndex((b, i) => i > blocks.length / 2 && b.type === type && b.text.length > 20);
}

describe.each(VARIANTS)('Test 7: performance on a ~110-page script (%s)', (variant) => {
  it('load, local typing, remote typing, and two writers typing at once', async () => {
    const kit = makeKit(variant);
    const script = generateScript(kit, 110);
    const pages = computeBreaks(kit, script).length + 1;

    const docA = new Y.Doc();
    let t = performance.now();
    prosemirrorToYXmlFragment(script, docA.getXmlFragment('script'));
    const seedMs = performance.now() - t;
    const update = Y.encodeStateAsUpdate(docA);
    const docB = new Y.Doc();
    t = performance.now();
    Y.applyUpdate(docB, update);
    const decodeMs = performance.now() - t;

    const stage = document.createElement('div');
    stage.className = 'stage';
    document.body.appendChild(stage);
    t = performance.now();
    const a = createClient({ name: 'A', kit, ydoc: docA, mount: stage });
    const loadA = performance.now() - t;
    t = performance.now();
    const b = createClient({ name: 'B', kit, ydoc: docB, mount: stage });
    const loadB = performance.now() - t;
    const net = new Network([docA, docB]);
    net.name(docA, 'A');
    net.name(docB, 'B');
    cleanups.push(() => {
      a.destroy();
      b.destroy();
      stage.remove();
    });

    const breakTimes: number[] = [];
    for (let i = 0; i < 30; i++) {
      const s = performance.now();
      computeBreaks(kit, a.view.state.doc);
      breakTimes.push(performance.now() - s);
    }

    // Phase 1: A types alone (real key presses), with an Enter every 20 characters. B receives.
    a.timings.length = 0;
    net.deliveries.length = 0;
    const observer1 = slowEvents();
    placeCursor(a, middleBlock(a, 'action'), 'end');
    const sentence = ' The fog rolls in over the harbor wall.';
    for (let i = 0; i < 200; i++) {
      if (i % 20 === 19) await keys(a, '{Enter}');
      else await typeText(a, sentence[i % sentence.length]!);
      await sleep(PACE_MS);
    }
    await net.settle();
    const solo = {
      localDispatch: stats(a.timings.filter((x) => !x.remote).map((x) => x.ms)),
      remoteApplyOnB: stats(net.deliveries.filter((d) => d.to === 'B').map((d) => d.ms)),
      updateBytes: stats(net.deliveries.map((d) => d.bytes)),
      ...observer1.stop(),
    };

    // Phase 2: both type at once in different scenes (A with real keys, B at its own cursor).
    a.timings.length = 0;
    net.deliveries.length = 0;
    const observer2 = slowEvents();
    const bIndex = blocksOf(b).findIndex((x, i) => i > 50 && x.type === 'dialogue');
    b.view.dispatch(
      b.view.state.tr.setSelection(TextSelection.create(b.view.state.doc, posIn(b, bIndex, 'end'))),
    );
    let bTyping = true;
    const bLoop = (async () => {
      while (bTyping) {
        b.view.dispatch(b.view.state.tr.insertText('k'));
        await sleep(PACE_MS);
      }
    })();
    for (let i = 0; i < 150; i++) {
      await typeText(a, 'w');
      await sleep(PACE_MS);
    }
    bTyping = false;
    await bLoop;
    await net.settle();
    const duet = {
      localDispatchOnA: stats(a.timings.filter((x) => !x.remote).map((x) => x.ms)),
      remoteApplyOnA: stats(net.deliveries.filter((d) => d.to === 'A').map((d) => d.ms)),
      remoteApplyOnB: stats(net.deliveries.filter((d) => d.to === 'B').map((d) => d.ms)),
      ...observer2.stop(),
    };

    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const result = {
      variant,
      pages,
      blocks: blocksOf(a).length,
      characters: a.view.state.doc.textContent.length,
      yDocBytes: update.byteLength,
      seedMs: Math.round(seedMs),
      decodeMs: Math.round(decodeMs),
      openEditorMs: { A: Math.round(loadA), B: Math.round(loadB) },
      pageBreakComputeMs: stats(breakTimes),
      solo,
      duet,
      heapMB: heap ? Math.round(heap.usedJSHeapSize / 1e6) : null,
      converged: a.fragment.toJSON() === b.fragment.toJSON(),
    };
    evidence('7-performance', result);

    expect(pages).toBeGreaterThanOrEqual(108);
    expect(result.converged).toBe(true);
    expect(Math.max(loadA, loadB)).toBeLessThanOrEqual(1500);
    expect(solo.localDispatch.p95).toBeLessThanOrEqual(16);
    expect(solo.remoteApplyOnB.p95).toBeLessThanOrEqual(16);
    expect(duet.localDispatchOnA.p95).toBeLessThanOrEqual(16);
    expect(duet.remoteApplyOnA.p95).toBeLessThanOrEqual(16);
  });
});
