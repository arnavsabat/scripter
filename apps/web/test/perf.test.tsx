// Performance (phase goal): typing stays smooth on a 110-page script in both views. Real key
// presses in Chromium; each is timed from keydown to the frame after it renders, which is what a
// writer feels. Typing near the top is the worst case for re-pagination.
import { paginate } from '@wr/pagination';
import type { ElementType } from '@wr/schema';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import '../src/script.css';
import { clickEndOf, mount, newEpisode, seed, sleep, unmountAll, until } from './helpers';

afterEach(() => unmountAll());

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function script(pagesWanted: number): { type: ElementType; text: string }[] {
  const r = rng(3);
  const words = [
    'the',
    'door',
    'opens',
    'slowly',
    'and',
    'Maya',
    'looks',
    'back',
    'at',
    'him',
    'rain',
    'neon',
  ];
  const para = (n: number) =>
    Array.from(
      { length: n },
      () =>
        `${Array.from({ length: 6 + Math.floor(r() * 10) }, () => words[Math.floor(r() * words.length)]).join(' ')}.`,
    ).join(' ');
  const out: { type: ElementType; text: string }[] = [];
  for (let s = 0; ; s++) {
    out.push({ type: 'scene_heading', text: `int. room ${s} - day` });
    for (let b = 0; b < 6; b++) {
      if (r() < 0.45) out.push({ type: 'action', text: para(1 + Math.floor(r() * 4)) });
      else {
        out.push({ type: 'character', text: r() < 0.5 ? 'Maya' : 'John' });
        out.push({ type: 'dialogue', text: para(1 + Math.floor(r() * 3)) });
      }
    }
    if (
      s % 20 === 0 &&
      paginate(out.map((b, i) => ({ id: String(i), ...b }))).pages.length >= pagesWanted
    )
      return out;
  }
}

/**
 * Types `text` one key at a time, measuring two things per key: the editor's own work (the
 * ProseMirror state update, which includes re-pagination and redrawing the page breaks), and,
 * from the browser's Event Timing API, any key whose input-to-paint time exceeded a frame.
 */
async function timedTyping(text: string) {
  const work: number[] = [];
  const proto = EditorView.prototype as unknown as { updateState: (s: unknown) => void };
  const original = proto.updateState;
  proto.updateState = function (this: unknown, state: unknown) {
    const t0 = performance.now();
    original.call(this, state);
    work.push(performance.now() - t0);
  };
  const slow: number[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      if (e.name === 'keydown' || e.name === 'keypress') slow.push(e.duration);
  });
  observer.observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  try {
    for (const ch of text) {
      await userEvent.keyboard(ch);
      await sleep(20);
    }
    await sleep(100);
  } finally {
    proto.updateState = original;
    observer.disconnect();
  }
  return { work: work.sort((a, b) => a - b), slow: slow.sort((a, b) => a - b) };
}
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;

describe('typing on a 110-page script', () => {
  it('stays within a frame or two in both views, near the top and near the end', async () => {
    const blocks = script(110);
    const ep = newEpisode();
    await seed(ep, blocks);
    const app = await mount('Maya', ep, 'full');
    await until(() => app.host.querySelectorAll('.script > p.el').length === blocks.length, 10_000);
    const results: Record<
      string,
      { work: { p50: number; p95: number; max: number }; slowKeys: number; slowest: number }
    > = {};
    for (const view of ['open', 'page'] as const) {
      if (view === 'page') {
        await commands.clickAt('[data-slot="full"] button[aria-label="Hide sidebar"]', 10, 10);
        await sleep(500);
        expect(app.host.querySelectorAll('.pgb').length).toBeGreaterThanOrEqual(109);
      }
      for (const where of ['top', 'end'] as const) {
        const paras = app.host.querySelectorAll<HTMLElement>('.script > p.el');
        const index = where === 'top' ? 2 : paras.length - 3;
        paras[index]!.scrollIntoView({ block: 'center' });
        await sleep(100);
        await clickEndOf(index, app.host);
        // The session's very first key costs the browser a one-time ~50 ms (its first layout of a
        // 110-page editable document, outside our code; D-078): type one before measuring.
        await userEvent.keyboard(' ');
        await sleep(100);
        const t = await timedTyping('and then the lights go out again');
        results[`${view} view, ${where}`] = {
          work: { p50: pct(t.work, 0.5), p95: pct(t.work, 0.95), max: t.work.at(-1)! },
          slowKeys: t.slow.length,
          slowest: t.slow.at(-1) ?? 0,
        };
      }
    }
    console.log(`PERF ${JSON.stringify(results)}`);
    for (const [k, v] of Object.entries(results)) {
      expect(v.work.p95, `${k}: editor work per key`).toBeLessThan(8);
      expect(v.slowest, `${k}: slowest key, input to paint`).toBeLessThan(50);
    }
  }, 120_000);
});
