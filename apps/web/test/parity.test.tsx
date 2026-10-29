// The visual audit against prototype v2 (beta-readiness step 5, D-088), in real Chromium: the
// prototype in an iframe, the app beside it, the same state in both, and every shared element's
// computed styles compared (test/parity.ts). Differences the log explains are listed in KNOWN;
// anything else fails.
import { type ScriptBlock } from '@wr/schema';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { reloadAuthForTests } from '../src/auth';
import { Root } from '../src/Root';
import { navigate } from '../src/router';
import { compare, type Difference, type Pair } from './parity';
import { seed } from './helpers';

const SYNC = 'ws://127.0.0.1:4787';
const PROTOTYPE = new URL('../../../docs/prototype/writers-room-prototype-v2.html', import.meta.url)
  .href;
const testPage = location.pathname + location.search;

const until = async (check: () => unknown, ms = 8000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));
let tags = 0;
const clickEl = async (el: Element, x = 4, y = 4) => {
  const t = `q${++tags}`;
  el.setAttribute('data-test-target', t);
  await commands.clickAt(`[data-test-target="${t}"]`, x, y);
};

// The prototype's sample scenes, so both scripts have the same kinds of lines.
const SCRIPT: { type: ScriptBlock['type']; text: string }[] = [
  { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT' },
  { type: 'action', text: 'Rain needles the window. MARA (40s) stands at the sink.' },
  { type: 'character', text: 'MARA' },
  { type: 'dialogue', text: 'You said you’d be home by nine.' },
  { type: 'scene_heading', text: 'EXT. HARBOR - DAWN' },
  { type: 'action', text: 'Fog lifts off the water. DEV waits on the pier.' },
  { type: 'scene_heading', text: 'INT. LIGHTHOUSE - DAY' },
  { type: 'action', text: 'A beam sweeps the empty keeper’s room.' },
];

let frame: HTMLIFrameElement;
let root: ReactRoot;
let host: HTMLElement;
const proto = () => frame.contentDocument!;
const protoRun = (code: string) =>
  (frame.contentWindow as unknown as { eval: (c: string) => unknown }).eval(code);
const app = () => host.querySelector<HTMLElement>('.layer:not(.off)') ?? host;

const found: Difference[] = [];
const missing: string[] = [];
const SHOTS = (import.meta.env.VITE_PARITY_SHOTS as string | undefined) === '1';
async function check(state: string, selectors: Pair[]) {
  const r = compare(state, proto(), app(), selectors);
  found.push(...r.diffs);
  missing.push(...r.missing);
  // VITE_PARITY_SHOTS=1: a screenshot of each state in the app, then the prototype, for the eye.
  if (!SHOTS) return;
  const name = state.replace(/[^a-z0-9]+/gi, '-');
  await page.screenshot({ path: `.shots/${name}-app.png` });
  frame.style.visibility = 'visible';
  frame.style.zIndex = '1000';
  await settle(150);
  await page.screenshot({ path: `.shots/${name}-proto.png` });
  frame.style.visibility = 'hidden';
}

async function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  proto().documentElement.dataset.theme = theme;
  await settle(100);
}

beforeAll(async () => {
  await page.viewport(1280, 800);
  frame = document.createElement('iframe');
  frame.src = PROTOTYPE;
  Object.assign(frame.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '1280px',
    height: '800px',
    border: '0',
    visibility: 'hidden',
  });
  document.body.append(frame);
  await until(() => proto()?.querySelector('.si'), 10_000);
});
afterAll(() => {
  root?.unmount();
  host?.remove();
  frame.remove();
  delete document.documentElement.dataset.theme;
  navigate(testPage, { replace: true });
});

/**
 * Differences the audit expects, each with its reason (D-088). Anything not listed fails the
 * test, so a new difference is either fixed or added here with a logged reason.
 */
const KNOWN: { selector: RegExp; props: RegExp; why: string }[] = [
  {
    selector: /^\.si$/,
    props: /^height$/,
    why: 'the sign-in column holds the "Try a demo script" line under the legal line (D-108)',
  },
  {
    selector: /^\.page$|^\.desk$/,
    props: /./,
    why: 'true screenplay page geometry (D-003); the desk holds the taller page',
  },
  {
    selector: /^\.toolbar$/,
    props: /^padding-(left|right)$/,
    why: 'the prototype pads the groups inside its header; the title and icons land at the same x',
  },
  {
    selector: /\.av$/,
    props: /color$/,
    why: "an avatar's color comes from the person's ID (D-018); the sample people's IDs differ",
  },
  {
    selector: /\.ib$/,
    props: /^background-color$/,
    why: 'hover left by the click that opened the state',
  },
  {
    selector: /\.menu\.cw \.mi$/,
    props: /^background-color$/,
    why: 'hover left by the click that opened the menu',
  },
  {
    selector: /^\.si-f$/,
    props: /^box-shadow$/,
    why: 'which page had the email field focused when captured',
  },
  {
    selector: /^\.left \.row$/,
    props: /^(height|background-color)$/,
    why: "sample data: the first row is a RECENT button row in one, a script or the cursor's scene in the other",
  },
  {
    selector: /^\.left \.list$|^\.pv$|^\.rv$|^\.menu$|\.row\.big small$|\.cwn$/,
    props: /^(height|width)$/,
    why: 'sample data: a different number or length of rows (the Share menu also has Export PDF, D-076)',
  },
  {
    selector: /^\.legend$/,
    props: /^margin-top$/,
    why: 'pinned to the bottom with margin-top: auto, so it follows the list above it',
  },
  { selector: /^\.dot\.blue$/, props: /^line-height$/, why: 'the dot has no text' },
  {
    selector: /^\.left \.snap$/,
    props: /^border-radius$/,
    why: 'snapshot rows are clickable for restore (D-081), so they round on hover like every row',
  },
  {
    selector: /^\.pv \.b$/,
    props: /^(text-transform|border-radius)$/,
    why: 'text is stored as typed and shown in caps (SPEC 4.6); the radius has no background to show',
  },
  {
    selector: /^\.page \.chg-ins$/,
    props: /./,
    why: 'the same highlight colors in the different page geometry (D-003), on a longer sample line',
  },
  {
    selector: /^\.pb$/,
    props: /color$/,
    why: 'dark text on the dark-mode accent for 4.5:1 contrast (--on-accent, D-080)',
  },
];
const KNOWN_MISSING = [
  '.rp .lab · not in app', // the prototype's sample has a pending invitation (INVITED); the app shows it when there is one
  '.toolbar .av · not in prototype', // presence avatars: the app's test room has co-writers connected
  '.menu .mi span · not in prototype', // Export PDF's row (D-076)
  '.menu .sep · not in prototype', // the line above Export PDF (D-076)
  'aside.left · not in prototype', // page view: the sidebar is closed (0 px) in both, so there's nothing to compare
];
/** The pointer resting on a control after the click that opened the state: the hover token. */
const HOVER = new Set(['rgba(0, 0, 0, 0.05)', 'rgba(255, 255, 255, 0.06)']);
const hovered = (d: Difference) =>
  d.prop === 'background-color' &&
  (HOVER.has(d.app) || HOVER.has(d.prototype)) &&
  [d.app, d.prototype].some((c) => c === 'rgba(0, 0, 0, 0)');
const explained = (d: Difference) =>
  hovered(d) || KNOWN.some((k) => k.selector.test(d.selector) && k.props.test(d.prop));

describe('visual parity with prototype v2 (D-088)', () => {
  it('every shared element matches, in both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      await fetch('/__fake/reset', { method: 'POST' });
      // ---- Sign-in ----
      protoRun(`signOut(); render()`);
      await fetch('/api/auth/signout', { method: 'POST' });
      navigate('/', { replace: true });
      reloadAuthForTests();
      host = document.createElement('div');
      host.style.height = '100vh';
      document.body.append(host);
      root = createRoot(host);
      root.render(<Root syncUrls={SYNC} />);
      await setTheme(theme);
      await until(() => host.querySelector('.si h1'));
      await settle();
      await check(`${theme} sign-in`, [
        '.si',
        '.si-mark',
        '.si h1',
        '.si-sub',
        '.si-g',
        '.si-or',
        '.si-f',
        '.si-c',
        '.si-legal',
      ]);
      root.unmount();
      host.remove();

      // ---- Home ----
      protoRun(`finishSignIn(ARNAV, 'Arnav')`);
      await fetch('/__fake/login', {
        method: 'POST',
        body: JSON.stringify({ name: 'Arnav', room: true }),
      });
      navigate('/', { replace: true });
      reloadAuthForTests();
      host = document.createElement('div');
      host.style.height = '100vh';
      document.body.append(host);
      root = createRoot(host);
      root.render(<Root syncUrls={SYNC} />);
      await until(() => host.querySelectorAll('.home .ep .nm').length === 3);
      await settle();
      await check(`${theme} Home`, [
        ['header', '.toolbar'],
        ['#tbHome .title', '.toolbar .title'],
        ['#tbHome .ta', '.toolbar .ta'],
        ['#tbHome .ib', '.toolbar .ib'],
        ['#tbHome .av', '.toolbar .av'],
        ['#left', 'aside.left'],
        ['#left .lab', '.left .lab'],
        ['#left .row', '.left .row'],
        ['#left .row.sel', '.left .row.sel'],
        ['#left .row small', '.left .row small'],
        ['#left .row .ta', '.left .row .ta'],
        ['#center', 'main.center'],
        '.home',
        '.sh',
        '.sh .title',
        '.sh small',
        '.sh .ta',
        '.eps',
        '.ep',
        '.ep .nm',
        '.ep small',
      ]);

      // ---- The account menu, then an inline delete confirm ----
      protoRun(`st.menu = 'acct'; render()`);
      await clickEl(host.querySelector('.layer:not(.off) .toolbar [aria-label="Account"]')!);
      await until(() => host.querySelector('.layer:not(.off) .toolbar .menu'));
      await check(`${theme} account menu`, [
        ['#tbHome .menu', '.toolbar .menu'],
        ['#tbHome .menu .mh', '.toolbar .menu .mh'],
        ['#tbHome .menu .mh small', '.toolbar .menu .mh small'],
        ['#tbHome .menu .mi', '.toolbar .menu .mi'],
      ]);
      protoRun(`st.menu = null; st.del = { at: 'home', id: 'e2' }; render()`);
      await userEvent.keyboard('{Escape}');
      const row = [...host.querySelectorAll('.home .ep')][1]!;
      await clickEl(row.querySelector('.rx')!, 6, 6);
      await until(() => host.querySelector('.home .ep.cf'));
      await check(`${theme} delete confirm`, ['.ep.cf', '.ep.cf .cfq', '.ep.cf .ta']);
      protoRun(`st.del = null; render()`);
      await clickEl(
        [...host.querySelectorAll('.home .ep.cf .ta')].find((e) => text(e) === 'Cancel')!,
      );

      // ---- Members ----
      protoRun(`st.members = true; render()`);
      await clickEl([...host.querySelectorAll('.sh .ta')].find((e) => text(e) === 'Members')!);
      await until(() => host.querySelector('.mrow'));
      await settle();
      await check(`${theme} Members`, [
        ['#right', 'aside.right'],
        ['#rp', '.rp'],
        '.rh',
        '.rh b',
        '.rh small',
        ['#rp .lab', '.rp .lab'],
        '.mrow',
        '.mrow small',
        '.mrow .role',
        '.rf',
        '.rf .fld',
      ]);
      protoRun(`st.members = false; render()`);
      root.unmount();
      host.remove();

      // ---- A script (The Long Night › Pilot) ----
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
      const ep = home.series.find((x) => x.name === 'The Long Night')!.episodes[0]!.id;
      const { draftId } = await call<{ draftId: string }>(`/api/episodes/${ep}`);
      await seed(draftId, SCRIPT);
      protoRun(`open('e1')`);
      navigate(`/e/${ep}`, { replace: true });
      reloadAuthForTests();
      host = document.createElement('div');
      host.style.height = '100vh';
      document.body.append(host);
      root = createRoot(host);
      root.render(<Root syncUrls={SYNC} />);
      await until(() => app().querySelectorAll('.script > p.el').length === SCRIPT.length);
      await settle();
      await check(`${theme} script`, [
        ['header', '.toolbar'],
        ['#tbScript .title', '.toolbar .title'],
        ['#tbScript .sw', '.toolbar .sw'],
        ['#tbScript .ib', '.toolbar .ib'],
        ['#tbScript .av', '.toolbar .av'],
        ['#left', 'aside.left'],
        '.tabs',
        '.tabs .tab',
        '.tabs .tab.on',
        ['#left .list', '.left .list'],
        ['#left .row', '.left .row'],
        ['#left .row.sel', '.left .row.sel'],
        '.desk',
        '.page',
      ]);

      // ---- Drafts tab ----
      protoRun(`st.tab = 'drafts'; render()`);
      await clickEl([...app().querySelectorAll('.tabs .ta')].find((e) => text(e) === 'Drafts')!);
      await clickEl(
        [...app().querySelectorAll('.left .lab.r .ta')].find((e) => text(e) === '+ Snapshot')!,
      );
      await until(() => app().querySelector('.left .snap'));
      await settle(800); // the "Snapshot saved" toast's bold flash on + Snapshot ends
      await check(`${theme} Drafts`, [
        ['#left .row.big', '.left .row.big'],
        ['#left .row.big small', '.left .row.big small'],
        ['#left .act', '.left .act'],
        ['#left .act .ta', '.left .act .ta'],
        ['#left .lab', '.left .lab'],
        ['#left .lab.r', '.left .lab.r'],
        ['#left .lab.r .ta', '.left .lab.r .ta'],
        ['#left .snap', '.left .snap'],
        ['#left .snap small', '.left .snap small'],
      ]);

      // ---- The Share menu ----
      protoRun(`st.menu = 'share'; render()`);
      await clickEl(app().querySelector('.toolbar [aria-label="Share"]')!);
      await until(() => app().querySelector('.menu[aria-label="Share"]'));
      await check(`${theme} Share menu`, ['.menu', '.menu .mi', '.menu .mi span', '.menu .sep']);
      // Copy invite link: the toast.
      protoRun(`st.menu = null; render(); toast('Link to “Ep 1 · Pilot” copied')`);
      await clickEl(
        [...app().querySelectorAll('.menu .mi')].find((e) => text(e) === 'Copy invite link')!,
      );
      await until(() => document.querySelector('.toast.show'));
      await settle(300);
      {
        const r = compare(`${theme} toast`, proto(), host, ['.toast']);
        found.push(...r.diffs);
        missing.push(...r.missing);
      }
      // Invite co-writer…
      protoRun(`st.menu = 'cowriter'; render()`);
      await clickEl(app().querySelector('.toolbar [aria-label="Share"]')!);
      await until(() => app().querySelector('.menu[aria-label="Share"]'));
      await clickEl(
        [...app().querySelectorAll('.menu .mi')].find((e) => text(e).startsWith('Invite co'))!,
      );
      await until(() => app().querySelector('.menu.cw .cwn'));
      await check(`${theme} co-writers`, [
        '.menu.cw',
        '.menu.cw .lab',
        '.menu.cw .mi',
        '.menu.cw .cwn',
        '.menu.cw .ck',
        '.menu.cw .fld',
        '.menu.cw .fbtn',
      ]);
      protoRun(`st.menu = null; render()`);
      await userEvent.keyboard('{Escape}');

      // ---- Page view ----
      protoRun(`st.left = false; render()`);
      await clickEl(app().querySelector('.toolbar [aria-label="Hide sidebar"]')!);
      await settle(600);
      await check(`${theme} page view`, ['.desk', '.page', ['#left', 'aside.left']]);
      protoRun(`st.left = true; render()`);
      await clickEl(app().querySelector('.toolbar [aria-label="Show sidebar"]')!);
      await settle(600);

      // ---- A what-if: its dot, the popover, Compare, Review all ----
      await clickEl(
        [...app().querySelectorAll('.left .act .ta')].find((e) => text(e) === '+ New what-if')!,
      );
      await until(() => /\/w\//.test(location.pathname));
      await until(() => app().querySelectorAll('.script > p.el').length === SCRIPT.length);
      const line = app().querySelectorAll<HTMLElement>('.script > p.el')[1]!;
      const range = document.createRange();
      range.selectNodeContents(line);
      const end = [...range.getClientRects()].at(-1)!;
      await commands.clickAt(
        '.layer:not(.off) .script > p:nth-of-type(2)',
        end.right - line.getBoundingClientRect().left + 1,
        end.top - line.getBoundingClientRect().top + 8,
      );
      await userEvent.keyboard(' A gull circles.');
      await until(() => app().querySelector('.dot.blue'));
      protoRun(`st.draft = 'wi'; st.tab = 'scenes'; render()`);
      await clickEl([...app().querySelectorAll('.tabs .ta')].find((e) => text(e) === 'Scenes')!);
      await settle();
      await check(`${theme} what-if`, [
        ['#tbScript .sw', '.toolbar .sw'],
        '.dot.blue',
        ['#left .nd.blue', '.left .nd.blue'],
        '.legend',
        '.legend .nd.amber',
      ]);
      protoRun(`st.pop = 'kn'; render()`);
      await clickEl(app().querySelector('.dot.blue')!, 5, 5);
      await until(() => app().querySelector('.menu.pop'));
      await check(`${theme} dot popover`, ['.pop', '.pop .mi', '.pop .mi span']);
      protoRun(`st.pop = null; st.right = true; st.cur = 'kn'; render()`);
      await clickEl(
        [...app().querySelectorAll('.menu.pop .mi')].find((e) => text(e).startsWith('Compare'))!,
      );
      await until(() => app().querySelector('.right .rh'));
      await settle();
      await check(`${theme} Compare`, [
        ['#right', 'aside.right'],
        ['#rp', '.rp'],
        '.rh',
        '.rh b',
        '.rh small',
        '.rb',
        '.pv',
        '.pv .b',
        '.note',
        '.rf',
        '.rf small',
        '.pb',
      ]);
      protoRun(`st.right = false; st.chg = true; render()`);
      await userEvent.keyboard('{Escape}');
      await clickEl(app().querySelector('.toolbar [aria-label="Show changes from main"]')!);
      await until(() => app().querySelector('.page .chg-ins'));
      await check(`${theme} Changes`, [
        ['#tbScript .ib.on', '.toolbar .ib.on'],
        ['.page ins', '.page .chg-ins'],
      ]);
      await clickEl(app().querySelector('.toolbar [aria-label="Show changes from main"]')!);
      protoRun(`st.chg = false; st.review = true; st.rv = new Set(['kn']); render()`);
      await userEvent.keyboard('{Escape}');
      await clickEl(app().querySelector('.toolbar [aria-label="Review all changes"]')!);
      await until(() => app().querySelector('.rv'));
      await check(`${theme} Review all`, [
        ['.menu[aria-label="Send changes to main"]', '.rv'],
        ['.menu[aria-label="Send changes to main"] .lab', '.rv .lab'],
        ['.menu[aria-label="Send changes to main"] .rvr', '.rv .rvr'],
        ['.menu[aria-label="Send changes to main"] .rvn', '.rv .rvn'],
        ['.menu[aria-label="Send changes to main"] .ck', '.rv .ck'],
        ['.menu[aria-label="Send changes to main"] .mi.send', '.rv .mi.send'],
      ]);
      protoRun(`st.review = false; st.draft = 'main'; render()`);
      await userEvent.keyboard('{Escape}');
      root.unmount();
      host.remove();
    }
    const unexplained = found.filter((d) => !explained(d));
    const unexplainedMissing = missing.filter((m) => !KNOWN_MISSING.some((k) => m.endsWith(k)));
    if (unexplained.length || unexplainedMissing.length)
      console.log(
        `PARITY\n${unexplained.map((d) => `${d.state} · ${d.selector} · ${d.prop}: prototype ${d.prototype} · app ${d.app}`).join('\n')}\n${unexplainedMissing.join('\n')}`,
      );
    expect(unexplained).toEqual([]);
    expect(unexplainedMissing).toEqual([]);
  }, 240_000);
});
