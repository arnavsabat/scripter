// Loading, empty, outage and crash states (D-084), in real Chromium against the fake API and the
// test sync server: skeletons while Home and a script load, the "can't reach" notice at the start,
// an outage after signing in that keeps you in, crashed panels and pages, and the empty notes.
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import '../src/app.css';
import { reloadAuthForTests } from '../src/auth';
import { PageBoundary, PanelBoundary } from '../src/components/Boundary';
import { App } from '../src/App';
import { Root } from '../src/Root';
import { navigate } from '../src/router';
import { newEpisode, seed, session } from './helpers';

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
  const t = `t${++tags}`;
  el.setAttribute('data-test-target', t);
  return `[data-test-target="${t}"]`;
};
const clickText = async (sel: string, label: string) => {
  const find = () => $$(sel).find((e) => text(e) === label);
  await until(find, 3000);
  await commands.clickAt(tag(find()!), 4, 4);
};
const fake = (path: string, body: object) =>
  fetch(`/__fake/${path}`, { method: 'POST', body: JSON.stringify(body) });

function render(node: React.ReactNode) {
  const host = document.createElement('div');
  host.style.height = '100vh';
  document.body.append(host);
  const root = createRoot(host);
  root.render(node);
  mounted.push({ root, host });
}

async function signIn(room = true) {
  await fake('login', { name: 'Arnav', room });
  try {
    localStorage.setItem('wr-signed-in', '1'); // signed in on this browser before
  } catch {
    // fine
  }
  navigate('/', { replace: true });
  reloadAuthForTests();
}

beforeEach(async () => {
  await fetch('/__fake/reset', { method: 'POST' });
});
afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
  await fetch('/__fake/reset', { method: 'POST' });
  navigate(testPage, { replace: true });
});

describe('loading (D-084)', () => {
  it('Home shows skeletons until its list arrives, then the list', async () => {
    await signIn();
    await fake('slow', { ms: 700 });
    render(<Root syncUrls="ws://127.0.0.1:4787" />);
    await until(() => $('.home .sk-wrap') && $('.left .sk-rows'));
    expect($('.home .ep .nm')).toBeNull();
    await until(() => $$('.home .ep .nm').length === 3);
    expect($('.home .sk-wrap')).toBeNull();
  });

  it('a script shows its title, skeleton scenes and skeleton lines, then the script', async () => {
    await signIn();
    render(<Root syncUrls="ws://127.0.0.1:4787" />);
    await until(() => $$('.home .ep .nm').length === 3);
    await fake('slow', { ms: 700 });
    await clickText('.home .ep .nm', 'Ep 1 · Pilot');
    await until(() => $('.page .sk-script'));
    expect(text($$('.toolbar .title').at(-1))).toBe('Ep 1 · Pilot'); // known from Home at once
    expect($('.left .sk-rows')).not.toBeNull();
    // The skeleton's lines sit at the real margins: a heading at 1.5 in, dialogue at 2.5 in.
    const page = $('.page')!.getBoundingClientRect().left;
    const at = (type: string) =>
      Math.round($(`.sk-script .el[data-type="${type}"] .sk`)!.getBoundingClientRect().left - page);
    expect([at('scene_heading'), at('dialogue')]).toEqual([144, 240]);
    await until(() => $('.ProseMirror .el'), 8000);
    expect($('.page .sk-script')).toBeNull();
  });
});

describe('can’t reach the server (D-084)', () => {
  it('at the start: the notice, not the sign-in page; back in once it answers', async () => {
    await signIn();
    await fake('down', { down: true });
    render(<Root syncUrls="ws://127.0.0.1:4787" />);
    await until(() => text($('.si h1')) === 'Can’t reach Writers’ Room');
    expect($('input[type="email"]')).toBeNull(); // no sign-in form
    expect(text($('.si-c'))).toBe('Try again');
    await fake('down', { down: false });
    await commands.clickAt('.si-c', 10, 10);
    await until(() => text($('.home-tb .title')) === 'Home');
  });

  it('after signing in, an outage says so and keeps you in', async () => {
    await signIn();
    render(<Root syncUrls="ws://127.0.0.1:4787" />);
    await until(() => $$('.home .ep .nm').length === 3);
    await fake('down', { down: true });
    await clickText('.home-tb .ta', '+ New script');
    await until(
      () => toast() === 'Can’t reach Writers’ Room. Check your connection and try again.',
    );
    expect(text($('.home-tb .title'))).toBe('Home');
  });
});

describe('a link to nowhere', () => {
  it('says the page doesn’t exist and goes Home', async () => {
    await signIn();
    navigate('/nowhere', { replace: true });
    render(<Root syncUrls="ws://127.0.0.1:4787" />);
    await until(() => toast() === 'That page doesn’t exist.');
    expect(location.pathname).toBe('/');
  });
});

describe('crashes (D-084)', () => {
  let explode = true;
  function Fragile() {
    if (explode) throw new Error('test crash');
    return <p className="ok">Panel content</p>;
  }

  it('a panel’s crash replaces only that panel, and Reload draws it again', async () => {
    explode = true;
    render(
      <div>
        <p className="beside">Still writing</p>
        <PanelBoundary>
          <Fragile />
        </PanelBoundary>
      </div>,
    );
    await until(() => text($('[role="alert"] .none')).startsWith('This panel hit a problem.'));
    expect(text($('.beside'))).toBe('Still writing');
    explode = false;
    await clickText('[role="alert"] .ta', 'Reload');
    await until(() => text($('.ok')) === 'Panel content');
  });

  it('a crash outside the panels shows the page notice', async () => {
    explode = true;
    render(
      <PageBoundary>
        <Fragile />
      </PageBoundary>,
    );
    await until(() => text($('.si h1')) === 'Something went wrong');
    expect(text($('.si-sub'))).toBe(
      'Your work is saved on this device. Reload to pick up where you left off.',
    );
    expect(text($('.si-c'))).toBe('Reload');
  });
});

describe('empty states (D-084)', () => {
  it('a new script: no scenes yet, no what-ifs yet, no snapshots yet', async () => {
    await signIn(false);
    render(<Root syncUrls="ws://127.0.0.1:4787" />);
    await clickText('.home-tb .ta', '+ New script');
    await until(() => $('.ProseMirror .el'), 8000);
    await until(
      () => text($('.left .list > .none')) === 'No scenes yet. A scene heading starts one.',
    );
    await clickText('.left .tab', 'Drafts');
    await until(() => $$('.left .list > .none').length === 2);
    expect($$('.left .list > .none').map(text)).toEqual([
      'No what-ifs yet. Try an idea with + New what‑if.',
      'No snapshots yet.',
    ]);
  });
});

describe('Firefox (D-089)', () => {
  it('says once that a few lines may wrap differently, and never again in that browser', async () => {
    const real = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')!;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Macintosh; rv:157.0) Gecko/20100101 Firefox/157.0',
    });
    try {
      localStorage.removeItem('wr-firefox-note');
      await signIn(false);
      render(<Root syncUrls="ws://127.0.0.1:4787" />);
      await clickText('.home-tb .ta', '+ New script');
      await until(
        () => toast().startsWith('Writers’ Room works best in Chrome, Edge or Safari.'),
        8000,
      );
      expect(localStorage.getItem('wr-firefox-note')).toBe('1');
    } finally {
      Object.defineProperty(navigator, 'userAgent', real);
      delete (navigator as unknown as Record<string, unknown>).userAgent;
      localStorage.removeItem('wr-firefox-note');
    }
  });
});

describe('a viewer on a what-if no writer has opened yet (D-094)', () => {
  it('says so, then shows the script as soon as a writer opens it', async () => {
    const doc = newEpisode();
    render(
      <App
        session={{
          ...session('Priya', doc),
          canEdit: false,
          seedState: () => Promise.resolve(new Uint8Array()),
        }}
      />,
    );
    await until(() =>
      text($('.page .offline-note')).startsWith('No one has opened this what-if yet.'),
    );
    expect($('.left .sk-rows')).toBeNull(); // not a loading skeleton: it's waiting for a writer
    // A writer opens it (seeding it from its base, D-080).
    await seed(doc, [
      { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT' },
      { type: 'action', text: 'Mara stares at the sink.' },
    ]);
    await until(() => $$('.ProseMirror.script > p.el').length === 2, 8000);
    await until(() => !$('.page .offline-note'));
  });
});
