// The accessibility pass (SPEC 3.11) in real Chromium, in both themes, across every screen:
// sign-in, Home with Members, a script with its Drafts tab, Share menu and page view, a what-if
// with its dot, Compare, Review all and Changes, and the "can't reach" notice. Each is checked
// for text contrast and for unnamed controls (test/a11y.ts); then the keyboard paths.
import { type ScriptBlock } from '@wr/schema';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { reloadAuthForTests } from '../src/auth';
import { Root } from '../src/Root';
import { navigate } from '../src/router';
import {
  contrastProblems,
  describe as where,
  graphicProblems,
  showsFocus,
  unnamedControls,
} from './a11y';
import { seed } from './helpers';

const SYNC = 'ws://127.0.0.1:4787';
const testPage = location.pathname + location.search;
const mounted: { root: ReactRoot; host: HTMLElement }[] = [];
const until = async (check: () => unknown, ms = 8000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
let tags = 0;
const clickEl = async (el: Element, x = 4, y = 4) => {
  const t = `a${++tags}`;
  el.setAttribute('data-test-target', t);
  await commands.clickAt(`[data-test-target="${t}"]`, x, y);
};
const clickText = async (sel: string, label: string) => {
  await until(() => $$(sel).some((e) => text(e).startsWith(label)), 5000);
  await clickEl($$(sel).find((e) => text(e).startsWith(label))!);
};
const settle = () => new Promise((r) => setTimeout(r, 350)); // let fades and crossfades finish

const SCRIPT: { type: ScriptBlock['type']; text: string }[] = [
  { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT' },
  { type: 'action', text: 'Mara stares at the sink.' },
  { type: 'character', text: 'MARA' },
  { type: 'parenthetical', text: '(quietly)' },
  { type: 'dialogue', text: 'Not again.' },
  { type: 'scene_heading', text: 'EXT. HARBOR - NIGHT' },
  { type: 'action', text: 'Fog rolls in.' },
  { type: 'transition', text: 'CUT TO:' },
];

function render() {
  const host = document.createElement('div');
  host.style.height = '100vh';
  document.body.append(host);
  const root = createRoot(host);
  root.render(<Root syncUrls={SYNC} />);
  mounted.push({ root, host });
}

async function signIn() {
  await fetch('/__fake/login', {
    method: 'POST',
    body: JSON.stringify({ name: 'Arnav', room: true }),
  });
}

/** Signs in, puts SCRIPT in Harbor Lights › Pilot's main, and opens it. */
async function openScript() {
  await signIn();
  const token = (
    (await (await fetch('/api/auth/refresh', { method: 'POST' })).json()) as { accessToken: string }
  ).accessToken;
  const call = async <T,>(path: string) =>
    (await (await fetch(path, { headers: { authorization: `Bearer ${token}` } })).json()) as T;
  const home = await call<{ series: { name: string; episodes: { id: string; name: string }[] }[] }>(
    '/api/home',
  );
  const ep = home.series.find((s) => s.name === 'Harbor Lights')!.episodes[0]!;
  const { draftId } = await call<{ draftId: string }>(`/api/episodes/${ep.id}`);
  await seed(draftId, SCRIPT);
  navigate(`/e/${ep.id}`, { replace: true });
  reloadAuthForTests();
  render();
  await until(() => $$('.layer:not(.off) .script > p.el').length === SCRIPT.length);
  await settle();
}

const found: string[] = [];
function audit(screen: string) {
  const theme = document.documentElement.dataset.theme;
  for (const p of contrastProblems())
    found.push(
      `${theme} · ${screen} · contrast ${p.ratio} < ${p.needed} · “${p.text}” · ${p.where}`,
    );
  for (const c of unnamedControls()) found.push(`${theme} · ${screen} · unnamed control · ${c}`);
  for (const p of graphicProblems('.dot'))
    found.push(`${theme} · ${screen} · dot ${p.ratio} < 3 · ${p.where}`);
}

beforeEach(async () => {
  await fetch('/__fake/reset', { method: 'POST' });
});
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
  delete document.documentElement.dataset.theme;
  navigate(testPage, { replace: true });
});

describe('contrast and names on every screen (SPEC 3.11)', () => {
  for (const theme of ['light', 'dark'] as const)
    it(`${theme}: sign-in, Home, Members, the script, Share, page view, a what-if, the notice`, async () => {
      found.length = 0;
      document.documentElement.dataset.theme = theme;

      // Sign-in.
      navigate('/', { replace: true });
      reloadAuthForTests();
      await fetch('/api/auth/signout', { method: 'POST' });
      render();
      await until(() => $('.si h1'));
      audit('sign-in');
      mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove()));

      // Home, then Members.
      await signIn();
      navigate('/', { replace: true });
      reloadAuthForTests();
      render();
      await until(() => $$('.home .ep .nm').length === 3);
      await settle();
      audit('Home');
      await clickText('.sh .ta', 'Members');
      await until(() => $$('.mrow').length > 0);
      await settle();
      audit('Members');
      mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove()));

      // A script: Scenes, Drafts, the Share menu, page view.
      await openScript();
      audit('script');
      await clickText('.layer:not(.off) .tabs .ta', 'Drafts');
      await settle();
      audit('Drafts tab');
      await clickEl($('.layer:not(.off) .toolbar [aria-label="Share"]')!);
      await until(() => $('.menu[aria-label="Share"]'));
      audit('Share menu');
      await userEvent.keyboard('{Escape}');
      await clickEl($('.layer:not(.off) .toolbar [aria-label="Hide sidebar"]')!);
      await new Promise((r) => setTimeout(r, 500));
      audit('page view');
      await clickEl($('.layer:not(.off) .toolbar [aria-label="Show sidebar"]')!);
      await settle();

      // A what-if: its dot, Compare, Review all, Changes.
      await clickText('.layer:not(.off) .left .ta', '+ New what-if');
      await until(() => /\/w\//.test(location.pathname));
      await until(() => $$('.layer:not(.off) .script > p.el').length === SCRIPT.length);
      const p = $$('.layer:not(.off) .script > p.el')[1]!;
      const r = document.createRange();
      r.selectNodeContents(p);
      const last = [...r.getClientRects()].at(-1)!;
      await commands.clickAt(
        '.layer:not(.off) .script > p:nth-of-type(2)',
        last.right - p.getBoundingClientRect().left + 1,
        last.top - p.getBoundingClientRect().top + 8,
      );
      await userEvent.keyboard(' She smashes a plate.');
      await until(() => $('.layer:not(.off) .dot.blue'));
      await clickText('.layer:not(.off) .tabs .ta', 'Scenes');
      await settle();
      audit('what-if');
      await clickEl($('.layer:not(.off) .dot.blue')!, 5, 5);
      await until(() => $('.layer:not(.off) .menu.pop'));
      audit('dot popover');
      await clickText('.layer:not(.off) .menu.pop .mi', 'Compare');
      await until(() => $('.layer:not(.off) .right .rh'));
      await settle();
      audit('Compare');
      await clickEl($('.layer:not(.off) .toolbar [aria-label="Review all changes"]')!);
      await until(() => $('.layer:not(.off) .rv'));
      audit('Review all');
      await userEvent.keyboard('{Escape}');
      await clickEl($('.layer:not(.off) .toolbar [aria-label="Show changes from main"]')!);
      await settle();
      audit('Changes');
      mounted.splice(0).forEach(({ root, host }) => (root.unmount(), host.remove()));

      // The "can't reach" notice.
      await fetch('/__fake/down', { method: 'POST', body: JSON.stringify({ down: true }) });
      navigate('/', { replace: true });
      reloadAuthForTests();
      render();
      await until(() => $('.si h1'));
      audit('can’t reach');
      await fetch('/__fake/down', { method: 'POST', body: JSON.stringify({ down: false }) });

      expect(found).toEqual([]);
    });
});

describe('the keyboard (SPEC 3.11)', () => {
  it('Tab reaches every Home control, each with a visible focus indicator', async () => {
    await signIn();
    navigate('/', { replace: true });
    reloadAuthForTests();
    render();
    await until(() => $$('.home .ep .nm').length === 3);
    const reached: string[] = [];
    const missing: string[] = [];
    (document.activeElement as HTMLElement | null)?.blur();
    for (let i = 0; i < 40; i++) {
      await userEvent.keyboard('{Tab}');
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) break;
      const name = where(el) + ` “${(el.getAttribute('aria-label') ?? text(el)).slice(0, 24)}”`;
      if (reached.includes(name)) break;
      reached.push(name);
      if (!showsFocus(el)) missing.push(name);
    }
    expect(reached.length).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
  it('Esc’s element menu shows the way out; Tab leaves for the sidebar, Shift+Tab the toolbar', async () => {
    await openScript();
    const before = $$('.layer:not(.off) .script > p.el').map((p) => p.textContent);
    await commands.clickAt('.layer:not(.off) .script > p:nth-of-type(2)', 20, 8);
    await userEvent.keyboard('{Escape}');
    await until(() => $('.layer:not(.off) .elmenu'));
    expect(text($('.layer:not(.off) .elmenu .foot')).replace(/\s+/g, ' ')).toBe(
      'Leave the pageTab',
    );
    await userEvent.keyboard('{Tab}');
    await until(() => document.activeElement?.getAttribute('role') === 'tab');
    expect(text(document.activeElement)).toBe('Scenes');
    expect($('.layer:not(.off) .elmenu')).toBeNull();
    // Tab didn't change any element on the way out.
    expect($$('.layer:not(.off) .script > p.el').map((p) => p.textContent)).toEqual(before);
    expect($$('.layer:not(.off) .script > p.el')[1]!.dataset.type).toBe('action');

    // ← → move between the tabs.
    await userEvent.keyboard('{ArrowRight}');
    await until(() => text(document.activeElement) === 'Drafts');
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowLeft}');
    await until(() => text(document.activeElement) === 'Scenes');

    // Shift+Tab from the menu: the toolbar's first control.
    await commands.clickAt('.layer:not(.off) .script > p:nth-of-type(2)', 20, 8);
    await userEvent.keyboard('{Escape}');
    await until(() => $('.layer:not(.off) .elmenu'));
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    await until(() => document.activeElement?.getAttribute('aria-label') === 'Back to home');
  });

  it('holding Shift doesn’t close the element menu: Shift+S still picks Scene Heading', async () => {
    await openScript();
    await commands.clickAt('.layer:not(.off) .script > p:nth-of-type(2)', 20, 8);
    await userEvent.keyboard('{Escape}');
    await until(() => $('.layer:not(.off) .elmenu'));
    await userEvent.keyboard('{Shift>}S{/Shift}');
    await until(() => $$('.layer:not(.off) .script > p.el')[1]!.dataset.type === 'scene_heading');
    expect($$('.layer:not(.off) .script > p.el')[1]!.textContent).toBe('Mara stares at the sink.');
  });

  it('a menu opened from the keyboard gives focus back to its button on Esc', async () => {
    await openScript();
    $<HTMLButtonElement>('.layer:not(.off) .toolbar [aria-label="Share"]')!.focus();
    await userEvent.keyboard('{Enter}');
    await until(() => document.activeElement?.closest('.menu[aria-label="Share"]'));
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Escape}');
    await until(() => !$('.menu[aria-label="Share"]'));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Share');
  });

  it('Tab walks the script’s toolbar and sidebar, each with a visible focus indicator', async () => {
    await openScript();
    $<HTMLButtonElement>('.layer:not(.off) .toolbar [aria-label="Back to home"]')!.focus();
    const reached: string[] = [];
    const missing: string[] = [];
    for (let i = 0; i < 30; i++) {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.closest('.ProseMirror')) break;
      const name = where(el) + ` “${(el.getAttribute('aria-label') ?? text(el)).slice(0, 24)}”`;
      if (reached.includes(name)) break;
      reached.push(name);
      if (!showsFocus(el)) missing.push(name);
      await userEvent.keyboard('{Tab}');
    }
    expect(reached.length).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });
});
