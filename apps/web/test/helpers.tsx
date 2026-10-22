import { createRoot, type Root } from 'react-dom/client';
import { userEvent } from 'vitest/browser';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { App } from '../src/App';
import { memoryStore, type ScriptStore } from '../src/editor/devStore';

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control';

let root: Root | null = null;
let host: HTMLElement | null = null;

/** Mounts the app with an in-memory store and waits until the editor is ready. */
export async function mount(store: ScriptStore = memoryStore()) {
  unmount();
  host = document.createElement('div');
  host.style.height = '900px';
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<App store={store} />);
  await until(() => document.querySelector('.script.ProseMirror-focused') !== null);
  await document.fonts.ready;
  return store;
}

export function unmount() {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
}

export async function until(check: () => boolean, ms = 3000) {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > ms) throw new Error('Timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const lines = () =>
  [...document.querySelectorAll<HTMLElement>('.script > p')].map(
    (p) => `${p.dataset.type}: ${p.textContent}`,
  );

/** Real key presses (user-event syntax: {Enter}, {Tab}, {Escape}…). */
export const press = (keys: string) => userEvent.keyboard(keys);
export const type = (text: string) => userEvent.keyboard(text.replace(/[{[]/g, (c) => c + c));
export const undo = () => press(`{${MOD}>}z{/${MOD}}`);
export const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Puts the cursor at the end of line `index` by clicking just past its last character. */
export async function clickEndOf(index: number) {
  const p = document.querySelectorAll<HTMLElement>('.script > p')[index]!;
  const range = document.createRange();
  range.selectNodeContents(p);
  const rects = range.getClientRects();
  const last = rects[rects.length - 1] ?? p.getBoundingClientRect();
  await userEvent.click(p, {
    position: {
      x: last.right - p.getBoundingClientRect().left + 1,
      y: last.top - p.getBoundingClientRect().top + 8,
    },
  });
}
