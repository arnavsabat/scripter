import { devIdentity } from '@wr/shared';
import { createRoot, type Root } from 'react-dom/client';
import { commands, userEvent } from 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    clickAt(selector: string, x: number, y: number): Promise<void>;
  }
}
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { App } from '../src/App';
import type { Session } from '../src/session';

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control';
const SYNC = 'ws://127.0.0.1:4787';
const CONTROL = 'http://127.0.0.1:4788';

let counter = 0;
/** A fresh episode per test, so this browser's local copies (IndexedDB) never mix between tests. */
export const newEpisode = () => `t-${Date.now().toString(36)}-${counter++}`;

export function session(name: string, docId: string): Session {
  // The name and color the app shows for this writer; the server learns who they are from the token.
  const identity = devIdentity(name);
  const token = async () =>
    (await fetch(`${CONTROL}/token?name=${encodeURIComponent(name)}`)).text();
  return { serverUrl: SYNC, docId, identity, token };
}

export interface MountedApp {
  host: HTMLElement;
  docId: string;
  lines(): string[];
  unmount(): void;
}

const mounted: { root: Root; host: HTMLElement }[] = [];

/** A line's text without the widgets drawn inside it (co-writers' carets, warning marks). */
function lineText(p: HTMLElement) {
  const copy = p.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.rc, .warn').forEach((w) => w.remove());
  return copy.textContent ?? '';
}

const linesIn = (scope: ParentNode) =>
  [...scope.querySelectorAll<HTMLElement>('.script > p')].map(
    (p) => `${p.dataset.type}: ${lineText(p)}`,
  );

/**
 * Mounts the app for `name` on episode `docId` and waits until it's ready to type in: loaded,
 * synced with the server, and holding a real first line. `slot` 'full' takes the whole window;
 * 'left' and 'right' put two apps side by side.
 */
export async function mount(
  name = 'Maya',
  docId = newEpisode(),
  slot: 'full' | 'left' | 'right' = 'full',
  wait: 'synced' | 'ready' = 'synced',
) {
  const host = document.createElement('div');
  host.dataset.slot = slot;
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: slot === 'right' ? '720px' : '0',
    width: slot === 'full' ? '1440px' : '720px',
    height: '900px',
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<App session={session(name, docId)} />);
  mounted.push({ root, host });
  const firstLineId = () => host.querySelector('.script > p')?.getAttribute('data-id') ?? '';
  await until(() => host.querySelector('.script') !== null && firstLineId() !== '', 5000);
  if (wait === 'synced') await until(() => !host.querySelector('.cue'), 5000);
  await document.fonts.ready;
  const app: MountedApp = {
    host,
    docId,
    lines: () => linesIn(host),
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
  return app;
}

export function unmountAll() {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
}

/** Kill, restart or cut off the test sync server (test/syncServer.ts). */
export async function server(action: 'kill' | 'restart' | 'drop') {
  await fetch(`${CONTROL}/${action}`);
}

/** The episode as stored on the server (snapshot + log), as Yjs XML. */
export async function stored(docId: string) {
  return (await fetch(`${CONTROL}/stored?doc=${docId}`)).text();
}

export async function until(check: () => boolean, ms = 3000) {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > ms) throw new Error('Timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const lines = () => linesIn(document);

/** Real key presses into whichever editor has focus (user-event syntax: {Enter}, {Tab}…). */
export const press = (keys: string) => userEvent.keyboard(keys);
export const type = (text: string) => userEvent.keyboard(text.replace(/[{[]/g, (c) => c + c));
export const undo = () => press(`{${MOD}>}z{/${MOD}}`);
export const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Clicks just past the last character of line `index` (inside `scope`), putting the cursor there. */
export async function clickEndOf(index: number, scope: ParentNode = document) {
  const p = scope.querySelectorAll<HTMLElement>('.script > p')[index]!;
  const range = document.createRange();
  range.selectNodeContents(p);
  const rects = [...range.getClientRects()];
  const box = p.getBoundingClientRect();
  const last = rects.at(-1) ?? box;
  const host = p.closest<HTMLElement>('[data-slot]');
  const selector = `${host ? `[data-slot="${host.dataset.slot}"] ` : ''}.script > p:nth-child(${index + 1})`;
  await commands.clickAt(selector, last.right - box.left + 1, last.top - box.top + 8);
}
