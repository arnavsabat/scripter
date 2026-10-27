// Performance (phase goal): typing stays smooth on a 110-page script in both views. Real key
// presses in Chromium; each is timed from keydown to the frame after it renders, which is what a
// writer feels. Typing near the top is the worst case for re-pagination. Then the same with two
// co-writers typing at once (D-087), run from the test sync server so their work isn't counted
// against this tab's frames.
import { paginate } from '@wr/pagination';
import type { ElementType } from '@wr/schema';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import { createRoot } from 'react-dom/client';
import '@wr/shared/tokens.css';
import { reloadAuthForTests } from '../src/auth';
import { Root } from '../src/Root';
import { navigate } from '../src/router';
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

/** Every frame's length while `run` runs, and the long tasks (over 50 ms) the browser saw. */
async function frames<T>(run: () => Promise<T>) {
  const gaps: number[] = [];
  let last = performance.now();
  let on = true;
  const loop = (t: number) => {
    gaps.push(t - last);
    last = t;
    if (on) requestAnimationFrame(loop);
  };
  requestAnimationFrame((t) => {
    last = t;
    requestAnimationFrame(loop);
  });
  const long: number[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) long.push(e.duration);
  });
  observer.observe({ type: 'longtask', buffered: false });
  try {
    const result = await run();
    return { result, gaps, long };
  } finally {
    on = false;
    observer.disconnect();
  }
}

/** The editor's own work per update while only the co-writers type. */
async function remoteWork(ms: number) {
  const work: number[] = [];
  const proto = EditorView.prototype as unknown as { updateState: (s: unknown) => void };
  const original = proto.updateState;
  proto.updateState = function (this: unknown, state: unknown) {
    const t0 = performance.now();
    original.call(this, state);
    work.push(performance.now() - t0);
  };
  try {
    await sleep(ms);
  } finally {
    proto.updateState = original;
  }
  return work.sort((a, b) => a - b);
}

const CONTROL = 'http://127.0.0.1:4788';

describe('a 110-page script with three writers at once (D-087)', () => {
  afterEach(async () => {
    await fetch(`${CONTROL}/writers?stop=1`);
  });

  it('remote edits and local typing stay within a frame in both views', async () => {
    const blocks = script(110);
    const ep = newEpisode();
    await seed(ep, blocks);
    const app = await mount('Maya', ep, 'full');
    await until(() => app.host.querySelectorAll('.script > p.el').length === blocks.length, 10_000);
    // Sam types near the top (above what Maya reads at the end: the worst case for anchoring and
    // re-pagination), Noor in the middle.
    const middle = Math.floor(blocks.length / 2);
    await fetch(`${CONTROL}/writers?doc=${ep}&at=4,${middle}`);
    await until(() => app.host.querySelectorAll('.rc').length === 2, 10_000);
    const results: Record<string, Record<string, number>> = {};
    for (const view of ['open', 'page'] as const) {
      if (view === 'page') {
        await commands.clickAt('[data-slot="full"] button[aria-label="Hide sidebar"]', 10, 10);
        await sleep(500);
      }
      // Reading while the others type.
      const reading = await frames(() => remoteWork(4000));
      const work = reading.result;
      results[`${view} view, reading`] = {
        remoteUpdates: work.length,
        workP50: pct(work, 0.5),
        workP95: pct(work, 0.95),
        workMax: work.at(-1) ?? 0,
        framesOver33ms: reading.gaps.filter((g) => g > 33).length,
        frames: reading.gaps.length,
        longTasks: reading.long.length,
      };
      // Typing near the top and near the end while they type.
      for (const where of ['top', 'end'] as const) {
        const paras = app.host.querySelectorAll<HTMLElement>('.script > p.el');
        const index = where === 'top' ? 10 : paras.length - 3;
        paras[index]!.scrollIntoView({ block: 'center' });
        await sleep(100);
        await clickEndOf(index, app.host);
        await userEvent.keyboard(' ');
        await sleep(100);
        const typing = await frames(() => timedTyping('and then the lights go out again'));
        const t = typing.result;
        results[`${view} view, typing ${where}`] = {
          workP50: pct(t.work, 0.5),
          workP95: pct(t.work, 0.95),
          slowKeys: t.slow.length,
          slowest: t.slow.at(-1) ?? 0,
          keysOver50ms: t.slow.filter((d) => d > 50).length,
          framesOver33ms: typing.gaps.filter((g) => g > 33).length,
          frames: typing.gaps.length,
          longTasks: typing.long.length,
        };
      }
    }
    console.log(`PERF3 ${JSON.stringify(results)}`);
    // The budget (D-012, D-087): every remote update and key within half a frame of editor work,
    // and no frame drops of two or more frames (a couple are allowed for a busy test machine).
    for (const [k, v] of Object.entries(results)) {
      expect(v.workP95, `${k}: editor work per update`).toBeLessThan(8);
      expect(v.framesOver33ms, `${k}: frames over 33 ms`).toBeLessThanOrEqual(2);
      // One hiccup is allowed: a busy test machine (the whole suite in parallel) can stall a key.
      if ('keysOver50ms' in v)
        expect(v.keysOver50ms, `${k}: keys over 50 ms`).toBeLessThanOrEqual(1);
    }
  }, 180_000);
});

describe('a 110-page what-if while two co-writers type in main (D-087)', () => {
  afterEach(async () => {
    await fetch(`${CONTROL}/writers?stop=1`);
    await fetch('/__fake/reset', { method: 'POST' });
  });

  it('the live comparison keeps reading and typing within a frame', async () => {
    const blocks = script(110);
    await fetch('/__fake/login', {
      method: 'POST',
      body: JSON.stringify({ name: 'Arnav', room: true }),
    });
    const token = (
      (await (await fetch('/api/auth/refresh', { method: 'POST' })).json()) as {
        accessToken: string;
      }
    ).accessToken;
    const call = async <T,>(path: string) =>
      (await (await fetch(path, { headers: { authorization: `Bearer ${token}` } })).json()) as T;
    const home = await call<{ series: { name: string; episodes: { id: string }[] }[] }>(
      '/api/home',
    );
    const epId = home.series.find((x) => x.name === 'Harbor Lights')!.episodes[0]!.id;
    const { draftId } = await call<{ draftId: string }>(`/api/episodes/${epId}`);
    await seed(draftId, blocks);
    const testPage = location.pathname + location.search;
    navigate(`/e/${epId}`, { replace: true });
    reloadAuthForTests();
    const host = document.createElement('div');
    host.style.height = '100vh';
    document.body.append(host);
    const root = createRoot(host);
    root.render(<Root syncUrls="ws://127.0.0.1:4787" />);
    const lines = () => host.querySelectorAll<HTMLElement>('.layer:not(.off) .script > p.el');
    try {
      await until(() => lines().length === blocks.length, 15_000);
      // + New what-if from the Drafts tab.
      const drafts = [...host.querySelectorAll<HTMLElement>('.layer:not(.off) .tabs .ta')].find(
        (t) => t.textContent === 'Drafts',
      )!;
      drafts.setAttribute('data-perf', 'drafts');
      await commands.clickAt('[data-perf="drafts"]', 4, 4);
      await until(() => !!host.querySelector('.layer:not(.off) .left .act .ta'));
      host.querySelector('.layer:not(.off) .left .act .ta')!.setAttribute('data-perf', 'fork');
      await commands.clickAt('[data-perf="fork"]', 4, 4);
      await until(() => /\/w\//.test(location.pathname), 10_000);
      await until(() => lines().length === blocks.length, 15_000);
      // Make one scene differ, so the dots and Changes have something to show.
      await clickEndOf(1, host.querySelector('.layer:not(.off)')!);
      await userEvent.keyboard(' A gull circles.');
      await until(() => !!host.querySelector('.layer:not(.off) .dot'), 10_000);
      // Sam and Noor type in main: every keystroke of theirs reruns the comparison here.
      const middle = Math.floor(blocks.length / 2);
      await fetch(`${CONTROL}/writers?doc=${draftId}&at=4,${middle}`);
      await sleep(1500);
      const results: Record<string, Record<string, number>> = {};
      // The comparison is live: Sam's typing in the what-if's changed scene turns its dot amber.
      await until(() => !!host.querySelector('.layer:not(.off) .dot.amber'), 10_000);
      const reading = await frames(() => sleep(4000));
      results['what-if, reading'] = {
        framesOver33ms: reading.gaps.filter((g) => g > 33).length,
        frames: reading.gaps.length,
        longTasks: reading.long.length,
        longestTask: Math.max(0, ...reading.long),
      };
      const typing = await frames(() => timedTyping(' and then the lights go out again'));
      results['what-if, typing'] = {
        workP95: pct(typing.result.work, 0.95),
        slowest: typing.result.slow.at(-1) ?? 0,
        keysOver50ms: typing.result.slow.filter((d) => d > 50).length,
        framesOver33ms: typing.gaps.filter((g) => g > 33).length,
        frames: typing.gaps.length,
        longTasks: typing.long.length,
      };
      console.log(`PERFWI ${JSON.stringify(results)}`);
      for (const [k, v] of Object.entries(results)) {
        expect(v.framesOver33ms, `${k}: frames over 33 ms`).toBeLessThanOrEqual(2);
        if ('workP95' in v) expect(v.workP95, `${k}: editor work per key`).toBeLessThan(8);
        if ('keysOver50ms' in v)
          expect(v.keysOver50ms, `${k}: keys over 50 ms`).toBeLessThanOrEqual(1);
      }
    } finally {
      root.unmount();
      host.remove();
      navigate(testPage, { replace: true });
    }
  }, 180_000);
});
