// Share (D-032, prototype v2): Copy invite link, and Invite co-writer… with its checklist and the
// showrunner's invite row, in real Chromium against the fake API.
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { reloadAuthForTests } from '../src/auth';
import { Root } from '../src/Root';
import { navigate } from '../src/router';

const testPage = location.pathname + location.search;
const mounted: { root: ReactRoot; host: HTMLElement }[] = [];
const until = async (check: () => unknown, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';
const toast = () => text($('.toast.show'));
let tags = 0;
const tag = (el: Element) => {
  const t = `s${++tags}`;
  el.setAttribute('data-test-target', t);
  return `[data-test-target="${t}"]`;
};
const clickText = async (sel: string, label: string) => {
  const el = $$(sel).find((e) => text(e) === label || text(e).startsWith(label));
  if (!el) throw new Error(`no ${sel} "${label}"`);
  await commands.clickAt(tag(el), 4, 4);
};
const shareItems = () => $$('.layer:not(.off) .menu[aria-label="Share"] .mi').map(text);
const coWriters = () =>
  $$('.menu.cw .mi').map(
    (b) =>
      `${text(b.querySelector('.cwn'))}${b.getAttribute('aria-checked') === 'true' ? ' ✓' : ''}`,
  );

async function openEpisode(series: string, episode: string) {
  await fetch('/__fake/login', {
    method: 'POST',
    body: JSON.stringify({ name: 'Arnav', room: true }),
  });
  navigate('/', { replace: true });
  reloadAuthForTests();
  const host = document.createElement('div');
  host.style.height = '100vh';
  document.body.append(host);
  const root = createRoot(host);
  root.render(<Root syncUrls="ws://127.0.0.1:4787" />);
  mounted.push({ root, host });
  await until(() => $$('.left .row .nm').some((n) => text(n) === series));
  await clickText('.left .row .nm', series);
  await until(() => $$('.home .ep .nm').some((n) => text(n) === episode));
  await clickText('.home .ep .nm', episode);
  await until(() => $('.layer:not(.off) .script'));
}
const openShare = async () => {
  await commands.clickAt('.layer:not(.off) button[aria-label="Share"]', 10, 10);
  await until(() => shareItems().length);
};

beforeEach(async () => {
  localStorage.removeItem('wr-unsynced');
  await fetch('/__fake/reset', { method: 'POST' });
});
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
  navigate(testPage, { replace: true });
});

describe('Copy invite link', () => {
  it('copies a link to this episode and says so', async () => {
    await openEpisode('The Long Night', 'Ep 3 · The Long Night');
    await openShare();
    expect(shareItems()).toEqual(['Copy invite link', 'Invite co-writer…']);
    await clickText('.menu[aria-label="Share"] .mi', 'Copy invite link');
    await until(() => toast() === 'Link to “Ep 3 · The Long Night” copied');
    expect(await navigator.clipboard.readText()).toBe(
      `${location.origin}/e/${location.pathname.split('/').pop()}`,
    );
  });
});

describe('Invite co-writer… (D-032)', () => {
  it('the showrunner toggles co-writers, with Undo, and can invite someone new', async () => {
    await openEpisode('The Long Night', 'Ep 3 · The Long Night');
    await openShare();
    await clickText('.menu[aria-label="Share"] .mi', 'Invite co-writer…');
    await until(() => coWriters().length === 2);
    expect(text($('.menu.cw .lab'))).toBe('CO-WRITERS');
    expect(coWriters()).toEqual(['MAMaya ✓', 'SASam ✓']);
    await clickText('.menu.cw .mi', 'MAMaya');
    await until(() => toast() === 'Maya removed from Ep 3 · The Long Night' + 'Undo');
    await until(() => coWriters()[0] === 'MAMaya');
    // Undo is outside the menu, so clicking it closes the menu like any outside click.
    await clickText('.toast.show button', 'Undo');
    await until(() => !$('.menu.cw'));
    await openShare();
    await clickText('.menu[aria-label="Share"] .mi', 'Invite co-writer…');
    await until(() => coWriters()[0] === 'MAMaya ✓');
    // The showrunner's invite row: someone new, assigned to this episode when they accept.
    await userEvent.fill($('.menu.cw .fld')!, 'lee@example.com');
    await clickText('.menu.cw .fbtn', 'Invite');
    await until(() => toast() === 'Invitation sent to lee@example.com');
  });

  it('a writer adds co-writers to their own episode, without the invite row', async () => {
    await openEpisode('Harbor Lights', 'Ep 1 · Pilot');
    await openShare();
    await clickText('.menu[aria-label="Share"] .mi', 'Invite co-writer…');
    await until(() => coWriters().length === 2);
    expect(coWriters()).toEqual(['ARArnav (you) ✓', 'MAMaya']);
    expect($('.menu.cw .fld')).toBeNull();
    await clickText('.menu.cw .mi', 'MAMaya');
    await until(() => coWriters()[1] === 'MAMaya ✓');
  });

  it('someone who can’t edit the episode only gets Copy invite link', async () => {
    await openEpisode('Harbor Lights', 'Ep 2 · Low Tide');
    await openShare();
    expect(shareItems()).toEqual(['Copy invite link']);
  });
});
