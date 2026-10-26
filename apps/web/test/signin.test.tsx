// The sign-in page, Terms and Privacy, staying signed in, and invitation links, in real Chromium
// against the fake API (test/fakeApi.ts; D-028, D-029, D-032, D-048).
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import '@wr/shared/tokens.css';
import '../src/base.css';
import '../src/app.css';
import { reloadAuthForTests } from '../src/auth';
import { Root } from '../src/Root';
import { navigate } from '../src/router';

const testPage = location.pathname + location.search;
const mounted: { root: ReactRoot; host: HTMLElement }[] = [];

/** Opens the app at `path`, as a fresh page load would (the refresh cookie survives). */
function open(path = '/') {
  navigate(path, { replace: true });
  reloadAuthForTests();
  const host = document.createElement('div');
  host.style.height = '100vh';
  document.body.append(host);
  const root = createRoot(host);
  root.render(<Root syncUrls="ws://127.0.0.1:4787" />);
  mounted.push({ root, host });
  return host;
}
function closeAll() {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
}
const until = async (check: () => unknown, ms = 5000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const heading = () => $('.si h1')?.textContent ?? '';
const toast = () => $('.toast.show')?.textContent ?? '';
const field = () => $<HTMLInputElement>('.si-f')!;
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
/** Text actions are clicked by selector (Vitest's text locators are ambiguous for them). */
const clickAction = (label: string) => commands.clickAt(`button[data-t="${label}"]`, 4, 4);

/** Home is showing, signed in as someone with these initials. */
const onHomeAs = (initials: string) =>
  $('.home-tb .title')?.textContent === 'Home' &&
  $('[aria-label="Account"] .av')?.textContent === initials;

async function signOutViaMenu() {
  await commands.clickAt('button[aria-label="Account"]', 10, 10);
  await until(() => button('Sign out'));
  await userEvent.click(button('Sign out'));
}

async function enterEmail(email: string) {
  await until(() => heading() === 'Sign in or create an account' || heading().startsWith('Join'));
  await userEvent.fill(field(), email);
  await userEvent.click(button('Continue'));
  await until(() => heading() === 'Check your email');
}

beforeEach(async () => {
  // Earlier test files can leave scripts marked unsynced in this browser (D-050's sign-out check).
  localStorage.removeItem('wr-unsynced');
  await fetch('/__fake/reset', { method: 'POST' });
  await fetch('/api/auth/signout', { method: 'POST' }); // forget the refresh cookie
});
afterEach(() => {
  closeAll();
  navigate(testPage, { replace: true });
});

describe('signing in with an email code', () => {
  it('a new writer gets a code, names themselves, and is in', async () => {
    open();
    await enterEmail('riley@example.com');
    expect($('.si-sub')!.textContent).toBe('We sent a code to riley@example.com.');
    expect(field().placeholder).toBe('Enter the code');
    await userEvent.type(field(), '123456'); // signs in as the last digit lands
    await until(() => heading() === 'What should the room call you?');
    await userEvent.fill(field(), 'Riley Chen');
    await userEvent.click(button('Continue'));
    await until(() => onHomeAs('RC'));
  });

  it('a returning writer’s longer sign-in code works, and they skip the name step', async () => {
    open();
    await enterEmail('sam@example.com');
    await userEvent.type(field(), '123456');
    await until(() => heading() === 'What should the room call you?');
    await userEvent.fill(field(), 'Sam Jones');
    await userEvent.click(button('Continue'));
    await until(() => onHomeAs('SJ'));
    await signOutViaMenu();
    await enterEmail('SAM@example.com');
    // An 8-digit sign-in code: nothing happens at six digits, and it signs in at the eighth.
    await userEvent.type(field(), '123456');
    await new Promise((r) => setTimeout(r, 200));
    expect(heading()).toBe('Check your email');
    await userEvent.type(field(), '78');
    await until(() => onHomeAs('SJ'));
  });

  it('a wrong code is explained in a toast; "Use a different email" goes back with the address kept', async () => {
    open();
    await enterEmail('kai@example.com');
    await userEvent.type(field(), '000000');
    await until(() => toast().includes('That code isn’t right'));
    expect(heading()).toBe('Check your email');
    await clickAction('Use a different email');
    await until(() => heading() === 'Sign in or create an account');
    expect(field().value).toBe('kai@example.com');
  });

  it('"Send a new code" sends another one', async () => {
    open();
    await enterEmail('noor@example.com');
    await clickAction('Send a new code');
    await until(() => toast() === 'We sent a new code to noor@example.com');
  });
});

describe('staying signed in', () => {
  it('reloading the page skips the sign-in page (the refresh cookie)', async () => {
    open();
    await enterEmail('priya@example.com');
    await userEvent.type(field(), '123456');
    await until(() => heading() === 'What should the room call you?');
    await userEvent.fill(field(), 'Priya');
    await userEvent.click(button('Continue'));
    await until(() => onHomeAs('PR'));
    closeAll();
    open(); // a fresh page: nothing in memory, only the cookie
    await until(() => onHomeAs('PR'));
    expect($('.si h1')).toBeNull();
  });
});

describe('the legal line', () => {
  it('opens Terms and Privacy, and Back returns to sign-in', async () => {
    open();
    await until(() => heading() === 'Sign in or create an account');
    await userEvent.click(button('Terms of Service'));
    await until(() => $('.lg h1')?.textContent === 'Terms of Service');
    expect(location.pathname).toBe('/terms');
    navigate('/', { replace: true });
    await until(() => heading() === 'Sign in or create an account');
    await userEvent.click(button('Privacy Policy'));
    await until(() => $('.lg h1')?.textContent === 'Privacy Policy');
    expect(document.body.textContent).toContain('sabat.arnav@gmail.com');
  });
});

describe('Google', () => {
  it('"Continue with Google" goes to the API’s Google sign-in', async () => {
    open();
    await until(() => heading() === 'Sign in or create an account');
    expect($<HTMLAnchorElement>('a.si-g')!.getAttribute('href')).toBe('/api/auth/google/start');
  });
  it('coming back from a Google sign-in that failed says so', async () => {
    open('/?signin=failed');
    await until(() => toast() === 'Google sign-in didn’t work. Please try again.');
    expect(location.search).toBe('');
  });
});

describe('invitation links (D-032)', () => {
  it('shows "Join Fogline", and joins it once you’re signed in', async () => {
    open('/i/fogline-abcdefghijklmnopqrstuvwxyz');
    await until(() => heading() === 'Join Fogline');
    expect($('.si-sub')!.textContent).toBe(
      'Sam Jones invited you to write. Sign in or create an account to join.',
    );
    await userEvent.fill(field(), 'lee@example.com');
    await userEvent.click(button('Continue'));
    await until(() => heading() === 'Check your email');
    await userEvent.type(field(), '123456');
    await until(() => heading() === 'What should the room call you?');
    await userEvent.fill(field(), 'Lee');
    await userEvent.click(button('Continue'));
    await until(() => toast() === 'You joined Fogline');
    expect(location.pathname).toBe('/');
    const accepted = (await (await fetch('/__fake/accepted')).json()) as string[];
    expect(accepted).toEqual(['lee@example.com fogline-abcdefghijklmnopqrstuvwxyz']);
  });
  it('a used link says so and goes to the sign-in page', async () => {
    open('/i/used-abcdefghijklmnopqrstuvwxyz');
    await until(() => toast().includes('expired or was already used'));
    await until(() => heading() === 'Sign in or create an account');
  });
});
