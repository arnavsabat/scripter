import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');

// SPEC 3.1, copied as written. tokens.css must match these exactly (ignoring hex case and number formatting).
const LIGHT = {
  bg: '#FFFFFF',
  side: '#E9E9EC',
  sel: '#D6D7DC',
  text: '#1F1F22',
  muted: '#5F5F64',
  icon: '#6B6B70',
  line: '#DEDEE2',
  line2: '#ECECEF',
  accent: '#2F6DB5',
  'accent-bg': '#E6E7EB',
  desk: '#E9E9EC',
  page: '#FFFFFF',
  ink: '#111111',
  'ins-bg': '#E3F1E6',
  'ins-fg': '#1E5A2E',
  'del-bg': '#F8E3E1',
  'del-fg': '#9A2B23',
  amber: '#C98A1B',
  'amber-ring': '#F6E7CC',
  'blue-ring': '#DCE6F5',
  panel: '#FAFAFB',
  menu: '#FFFFFF',
  hover: 'rgba(0,0,0,.05)',
  toast: '#2B2B2F',
  'toast-fg': '#FFFFFF',
  'toast-link': '#9CC1F0',
  green: '#3B8E4F',
};
const DARK = {
  bg: '#1C1C1E',
  side: '#26262A',
  sel: '#3A3A3F',
  text: '#ECECEE',
  muted: '#A1A1A8',
  icon: '#A1A1A8',
  line: '#38383C',
  line2: '#2F2F33',
  accent: '#6EA2E6',
  'accent-bg': '#34363C',
  desk: '#26262A',
  page: '#1C1C1E',
  ink: '#E8E8EA',
  'ins-bg': '#1F3A27',
  'ins-fg': '#9FD6AE',
  'del-bg': '#3F2322',
  'del-fg': '#F0A49C',
  amber: '#E0A84A',
  'amber-ring': '#4A3A1E',
  'blue-ring': '#22344D',
  panel: '#202023',
  menu: '#2A2A2E',
  hover: 'rgba(255,255,255,.06)',
  toast: '#ECECEE',
  'toast-fg': '#1C1C1E',
  'toast-link': '#2F6DB5',
  green: '#6CC685',
};
const AVATARS = {
  'avatar-1-bg': '#C9D8EE',
  'avatar-1-fg': '#1F3F6B',
  'avatar-2-bg': '#E2D4EC',
  'avatar-2-fg': '#4A2A63',
  'avatar-3-bg': '#D9E6D3',
  'avatar-3-fg': '#2E4A25',
};

/** Lowercase, drop spaces, and write ".05" and "0.05" the same way. */
const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(^|[(,])0\./g, '$1.');

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Returns the custom properties declared directly inside the first rule whose selector matches. */
function block(selector: RegExp): Record<string, string> {
  const source = stripComments(css);
  const match = selector.exec(source);
  if (!match) throw new Error(`No rule matching ${String(selector)}`);
  const open = source.indexOf('{', match.index + match[0].length - 1);
  const close = source.indexOf('}', open);
  const vars: Record<string, string> = {};
  for (const [, name, value] of source
    .slice(open + 1, close)
    .matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) vars[name] = norm(value);
  }
  return vars;
}

const normAll = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, norm(v)]));

const lightBlock = () => block(/(^|\n):root\s*\{/);
const systemDarkBlock = () =>
  block(
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme=['"]light['"]\]\)\s*\{/,
  );
const forcedDarkBlock = () => block(/:root\[data-theme=['"]dark['"]\]\s*\{/);

describe('tokens.css', () => {
  it('defines every light color exactly as in the spec', () => {
    expect(lightBlock()).toMatchObject(normAll(LIGHT));
  });

  it('defines the presence avatar pairs', () => {
    expect(lightBlock()).toMatchObject(normAll(AVATARS));
  });

  it('redefines every color for system dark mode, guarded so a forced light theme wins', () => {
    expect(systemDarkBlock()).toEqual(normAll(DARK));
  });

  it('redefines every color for the forced dark theme', () => {
    expect(forcedDarkBlock()).toEqual(normAll(DARK));
  });

  it('themes exactly the same set of colors in light and dark', () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });
});
