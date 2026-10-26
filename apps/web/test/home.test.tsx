// Home, the handoff, renaming, deleting, Members, the theme, "View only", losing access and
// signing out, in real Chromium against the fake API and the test sync server (prototype v2;
// D-026 to D-051).
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { reloadAuthForTests } from '../src/auth';
import { Root } from '../src/Root';
import { navigate } from '../src/router';

const CONTROL = 'http://127.0.0.1:4788';
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
const homeLayer = () => $('.layers > .layer')!;
const scriptLayer = () => $$('.layers > .layer')[1];
const labels = () => $$('.home-tb ~ .body .left .lab').map(text);
const sidebarRows = (label: string) => {
  const lab = $$('.left .lab').find((l) => text(l) === label);
  return lab
    ? [...lab.nextElementSibling!.children].map((r) => text(r.querySelector('.nm') ?? r))
    : [];
};
const episodeRows = () => $$('.home .ep').map((r) => text(r.querySelector('.nm') ?? r));
const click = (sel: string, x = 4, y = 4) => commands.clickAt(sel, x, y);
let tags = 0;
/** Tags an element for a Playwright click; a fresh tag each time (React reuses DOM nodes). */
const tag = (el: Element) => {
  const t = `t${++tags}`;
  el.setAttribute('data-test-target', t);
  return `[data-test-target="${t}"]`;
};
const clickText = async (sel: string, label: string) => {
  const el = $$(sel).find((e) => text(e) === label);
  if (!el) throw new Error(`no ${sel} "${label}"`);
  await click(tag(el));
};

/** Signed in as Arnav (with the prototype's sample room), on a fresh page. */
async function openAsArnav(path = '/', room = true) {
  await fetch('/__fake/login', { method: 'POST', body: JSON.stringify({ name: 'Arnav', room }) });
  navigate(path, { replace: true });
  reloadAuthForTests();
  const host = document.createElement('div');
  host.style.height = '100vh';
  document.body.append(host);
  const root = createRoot(host);
  root.render(<Root syncUrls="ws://127.0.0.1:4787" />);
  mounted.push({ root, host });
  await until(() => text($('.home-tb .title')) === 'Home');
}

beforeEach(async () => {
  await fetch('/__fake/reset', { method: 'POST' });
  try {
    localStorage.removeItem('wr-theme');
    localStorage.removeItem('wr-unsynced');
  } catch {
    // fine
  }
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
  navigate(testPage, { replace: true });
});

describe('Home (SPEC 3.10, prototype v2)', () => {
  it('shows scripts, series and invitations, and the selected series’ episodes', async () => {
    await openAsArnav();
    await until(() => episodeRows().length === 3);
    expect(labels()).toEqual(['SCRIPTS', 'SERIES', 'INVITATIONS']);
    expect(sidebarRows('SCRIPTS')).toEqual(['Night Shift']);
    expect(sidebarRows('SERIES')).toEqual(['The Long Night', 'Harbor Lights']);
    expect(text($('.sh .title'))).toBe('The Long Night');
    expect(text($('.sh small'))).toBe('3 episodes · you’re the showrunner');
    expect(episodeRows()).toEqual(['Ep 1 · Pilot', 'Ep 2 · Undertow', 'Ep 3 · The Long Night']);
    expect(text($$('.home .ep')[0]!.querySelector('small'))).toBe('Maya · edited just now');
    expect(text($$('.home .ep')[2]!.querySelector('small'))).toBe('● Maya, Sam · editing now');
  });

  it('a writer’s series has no + New episode, and its Members is read-only', async () => {
    await openAsArnav();
    await clickText('.left .row', 'Harbor Lights');
    await until(() => text($('.sh .title')) === 'Harbor Lights');
    expect(text($('.sh small'))).toBe('2 episodes · you’re a writer');
    expect($$('.sh .ta').map(text)).toEqual(['Members']);
    expect($('.home .rx')).toBeNull(); // no delete × for writers
    await clickText('.sh .ta', 'Members');
    await until(() => $$('.mrow').length === 3);
    expect($('.rp button.role')).toBeNull();
    expect($('.rf')).toBeNull();
  });

  it('accepting an invitation joins the series and selects it', async () => {
    await openAsArnav();
    await until(() => sidebarRows('INVITATIONS').length === 1);
    await clickText('.left .ta', 'Accept');
    await until(() => toast() === 'You joined Fogline');
    await until(() => sidebarRows('SERIES').includes('Fogline'));
    expect(text($('.sh .title'))).toBe('Fogline');
    expect(labels()).not.toContain('INVITATIONS');
  });

  it('a brand-new account sees the empty state', async () => {
    await openAsArnav('/', false);
    await until(() => text($('.emptyh')).startsWith('No scripts yet.'));
    expect(labels()).toEqual([]);
  });
});

describe('creating, opening and renaming (D-033, D-037)', () => {
  it('+ New script opens a script with its title ready to type; Home then lists it', async () => {
    await openAsArnav();
    await clickText('.home-tb .ta', '+ New script');
    await until(() => $<HTMLInputElement>('.toolbar input.ren'));
    expect($<HTMLInputElement>('.toolbar input.ren')!.value).toBe('Untitled script');
    // The page finishes loading meanwhile; the title keeps the keyboard.
    await until(() => $('.layer:not(.off) .script'));
    await new Promise((r) => setTimeout(r, 300));
    expect(document.activeElement?.classList.contains('ren')).toBe(true);
    await userEvent.keyboard('Night Bus{Enter}');
    await until(() => text($$('.toolbar .title')[1]) === 'Night Bus');
    expect(homeLayer().className).toContain('off'); // the handoff: Home faded out
    await click('.layer:not(.off) button[aria-label="Back to home"]', 10, 10);
    await until(() => !homeLayer().className.includes('off'));
    await until(() => sidebarRows('SCRIPTS').includes('Night Bus'));
    expect(sidebarRows('RECENT')).toEqual(['Night Bus']);
    await until(() => !scriptLayer()); // the script layer goes once it has faded
  });

  it('+ New episode turns a plain script into a series', async () => {
    await openAsArnav();
    await clickText('.left .row', 'Night Shift');
    await until(() => text($('.sh small')) === 'Script · just you');
    expect(episodeRows()).toEqual(['Night Shift']);
    await clickText('.sh .ta', '+ New episode');
    await until(() => $('.toolbar input.ren'));
    await userEvent.keyboard('Graveyard{Enter}');
    await until(() => text($$('.toolbar .title')[1]) === 'Ep 2 · Graveyard');
    await click('.layer:not(.off) button[aria-label="Back to home"]', 10, 10);
    await until(() => sidebarRows('SERIES').includes('Night Shift'));
    expect(sidebarRows('SCRIPTS')).toEqual([]);
  });

  it('+ New series starts empty, selected, and ready to name', async () => {
    await openAsArnav();
    await clickText('.home-tb .ta', '+ New series');
    await until(() => $('.sh input.ren'));
    await userEvent.keyboard('Saltwater{Enter}');
    await until(() => text($('.sh .title')) === 'Saltwater');
    expect(text($('.sh small'))).toBe('0 episodes · you’re the showrunner');
    expect(text($('.emptyh'))).toBe('No episodes yet.Add one with + New episode.');
    expect(sidebarRows('SERIES')[0]).toBe('Saltwater');
  });

  it('a viewer, or a writer not on the episode, sees "View only" and a read-only page', async () => {
    await openAsArnav();
    await clickText('.left .row', 'Harbor Lights');
    await until(() => episodeRows().includes('Ep 2 · Low Tide'));
    await clickText('.home .ep .nm', 'Ep 2 · Low Tide');
    await until(() => text($('.layer:not(.off) .vo')) === 'View only');
    await until(() => $('.layer:not(.off) .script'));
    expect($('.layer:not(.off) .script')!.getAttribute('contenteditable')).toBe('false');
    expect($('.layer:not(.off) .title.rn')).toBeNull(); // can't rename it either
  });
});

describe('deleting and restoring (D-037)', () => {
  it('an episode: × → inline confirm → Recently deleted → Restore', async () => {
    await openAsArnav();
    await until(() => episodeRows().length === 3);
    await click(`${tag($$('.home .ep')[1]!)} .rx`, 6, 6);
    await until(() => text($('.home .ep.cf .cfq')) === 'Delete “Ep 2 · Undertow” for everyone?');
    await clickText('.home .ep.cf .ta', 'Delete');
    await until(() => episodeRows().length === 2);
    expect(toast()).toBe(
      '“Ep 2 · Undertow” deleted · restore it from Recently deleted for 30 days',
    );
    expect(sidebarRows('RECENTLY DELETED')).toHaveLength(1);
    await clickText('.left .ta', 'Restore');
    await until(() => episodeRows().length === 3);
    expect(episodeRows()[1]).toBe('Ep 2 · Undertow');
  });

  it('a series needs its name typed before Delete works', async () => {
    await openAsArnav();
    await until(() => sidebarRows('SERIES').includes('The Long Night'));
    await click(
      `${tag($$('.left .row').find((r) => text(r.querySelector('.nm')) === 'The Long Night')!)} .rx`,
      6,
      6,
    );
    await until(() => $('.left .cfs input'));
    expect(text($('.left .cfs .cfq'))).toBe(
      'Delete “The Long Night” and its 3 episodes for everyone?',
    );
    // Delete stays disabled until the name is typed.
    expect(
      $$('.left .cfs .ta')
        .find((b) => text(b) === 'Delete')!
        .getAttribute('aria-disabled'),
    ).toBe('true');
    await userEvent.fill($('.left .cfs input')!, 'The Long');
    expect(
      $$('.left .cfs .ta')
        .find((b) => text(b) === 'Delete')!
        .getAttribute('aria-disabled'),
    ).toBe('true');
    await userEvent.fill($('.left .cfs input')!, 'The Long Night');
    await clickText('.left .cfs .ta', 'Delete');
    await until(() => !sidebarRows('SERIES').includes('The Long Night'));
    await until(() => sidebarRows('RECENTLY DELETED')[0]?.includes('The Long Night'));
  });
});

describe('Members (D-030, D-027, D-051)', () => {
  it('opens and closes like Compare, changes a role, and removes after a confirm', async () => {
    await openAsArnav();
    await clickText('.sh .ta', 'Members');
    await until(() => $$('.mrow').length === 4);
    expect($('.app.is-home')!.className).toContain('right-open');
    expect(text($('.rh small'))).toBe('4 people');
    expect($$('.mrow .n').map((n) => n.firstChild?.textContent)).toEqual([
      'Arnav',
      'Maya',
      'Sam',
      'Priya',
    ]);
    // Maya's role menu → Viewer
    await click(`${tag($$('.mrow')[1]!)} button.role`, 6, 6);
    await until(() => $('.rp .menu'));
    await clickText('.rp .menu .mi', 'Viewer');
    await until(() => toast() === 'Maya is now a viewer');
    await until(() => text($$('.mrow')[2]?.querySelector('.role')).startsWith('Viewer'));
    // Remove Sam, after the inline confirm
    const sam = $$('.mrow').find((r) => r.textContent?.includes('Sam'))!;
    await click(`${tag(sam)} button.role`, 6, 6);
    await clickText('.rp .menu .mi', 'Remove from series');
    await until(() => text($('.mrow.cf .cfq')) === 'Remove Sam from The Long Night?');
    await clickText('.mrow.cf .ta', 'Remove');
    await until(() => $$('.mrow').length === 3);
    // Esc closes the panel
    await userEvent.keyboard('{Escape}');
    await until(() => !$('.app.is-home')!.className.includes('right-open'));
  });

  it('invites by email with the field-styled role picker', async () => {
    await openAsArnav();
    await clickText('.sh .ta', 'Members');
    await until(() => $('#invite-email'));
    await userEvent.fill($('#invite-email')!, 'lee@example.com');
    await click('.rf .pick .fbtn', 10, 10);
    await clickText('.rf .menu .mi', 'Viewer');
    await userEvent.keyboard('{Enter}'); // in the field? no: focus moved; use the button
    await clickText('.rf .fbtn', 'Invite');
    await until(() => toast() === 'Invitation sent to lee@example.com');
    await until(() => $$('.mrow').some((r) => r.textContent?.includes('lee@example.com')));
    expect(text($('.rh small'))).toBe('4 people · 1 invited');
  });
});

describe('the theme toggle (SPEC 3.10)', () => {
  it('follows the system until chosen, then remembers the choice on this device', async () => {
    await openAsArnav();
    const before = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const toggle = () => $<HTMLButtonElement>('.home-tb button[aria-label^="Switch to"]')!;
    expect(toggle().getAttribute('aria-label')).toBe(
      before === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    );
    await click('.home-tb button[aria-label^="Switch to"]', 10, 10);
    const after = before === 'dark' ? 'light' : 'dark';
    expect(document.documentElement.dataset.theme).toBe(after);
    expect(localStorage.getItem('wr-theme')).toBe(after);
  });
});

describe('losing access while writing (D-046)', () => {
  it('made view-only: the page turns "View only" and says edits since then weren’t saved', async () => {
    await openAsArnav();
    await clickText('.left .row', 'Harbor Lights');
    await until(() => episodeRows().includes('Ep 1 · Pilot'));
    await clickText('.home .ep .nm', 'Ep 1 · Pilot'); // Arnav writes this one
    await until(() => $('.layer:not(.off) .script[contenteditable="true"]'));
    // The showrunner takes Arnav off it: the API says view only, the sync server re-checks.
    await fetch('/__fake/unassign', {
      method: 'POST',
      body: JSON.stringify({ episode: 'Pilot', name: 'Arnav' }),
    });
    const draft = location.pathname.split('/').pop()!.slice(0, 8);
    await fetch(`${CONTROL}/access?name=Arnav&doc=ep-${draft}&mode=view`);
    await until(() => toast() === 'Your access changed. Edits since then weren’t saved.', 8000);
    await until(() => text($('.layer:not(.off) .vo')) === 'View only');
  });

  it('the episode deleted: back to Home with a toast', async () => {
    await openAsArnav();
    await until(() => episodeRows().length === 3);
    await clickText('.home .ep .nm', 'Ep 1 · Pilot');
    await until(() => $('.layer:not(.off) .script'));
    const draft = location.pathname.split('/').pop()!.slice(0, 8);
    await fetch(`${CONTROL}/access?name=Arnav&doc=ep-${draft}&mode=deleted`);
    await until(() => toast() === 'This episode was deleted by the showrunner.', 8000);
    expect(location.pathname).toBe('/');
  });
});

describe('signing out (D-050)', () => {
  it('warns, with Sign out anyway / Cancel, while edits haven’t reached the server', async () => {
    await openAsArnav();
    localStorage.setItem('wr-unsynced', JSON.stringify(['ep-offline']));
    await click('button[aria-label="Account"]', 10, 10);
    await clickText('.menu .mi', 'Sign out');
    await until(() => toast().startsWith('Some edits haven’t reached the server yet.'));
    expect($$('.toast.show button').map(text)).toEqual(['Sign out anyway', 'Cancel']);
    await clickText('.toast.show button', 'Cancel');
    expect(text($('.home-tb .title'))).toBe('Home'); // still signed in
    await click('button[aria-label="Account"]', 10, 10);
    await clickText('.menu .mi', 'Sign out');
    await until(() => $$('.toast.show button').length === 2);
    await clickText('.toast.show button', 'Sign out anyway');
    await until(() => text($('.si h1')) === 'Sign in or create an account');
    expect(localStorage.getItem('wr-unsynced')).toBe('[]');
  });
});
