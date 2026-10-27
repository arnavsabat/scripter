// Import (SPEC 5.7, D-071, D-077): Final Draft and Fountain into our block types, with what we
// can't represent reported plainly. Both fixtures are the same original screenplay ("Night Shift",
// generated as both formats), so the two parsers must agree block for block.
import { paginate } from '@wr/pagination';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { reloadAuthForTests } from '../src/auth';
import {
  ImportError,
  parseFdx,
  parseFountain,
  parseScript,
  type ImportedBlock,
} from '../src/import/importScript';
import { Root } from '../src/Root';
import { navigate } from '../src/router';

const fixture = async (name: string) =>
  (await fetch(new URL(`./fixtures/${name}`, import.meta.url))).text();
const expected = async () =>
  JSON.parse(await fixture('night-shift.expected.json')) as {
    fdx: ImportedBlock[];
    fountain: ImportedBlock[];
  };

describe('Night Shift, in both formats', () => {
  it('Fountain: every element, the title from the title page, and an exact report', async () => {
    const r = parseFountain(await fixture('night-shift.fountain'), 'night-shift');
    expect(r.blocks).toEqual((await expected()).fountain);
    expect(r.title).toBe('Night Shift');
    expect(r.report.message(r.title, 20)).toBe(
      'Imported “Night Shift” · 20 pages. ' +
        'Kept as action: 3 centered lines, 1 lyric. ' +
        'Not imported: 1 boneyard passage, 1 note, 4 other title page entries, 1 section, ' +
        '1 synopsis, 4 scene numbers, 1 forced page break. ' +
        '1 dual-dialogue pair now runs one speech after the other. ' +
        'Bold, italic and underline were removed.',
    );
  });

  it('Final Draft: the same blocks, from its own paragraph types', async () => {
    const r = parseFdx(await fixture('night-shift.fdx'), 'night-shift');
    expect(r.blocks).toEqual((await expected()).fdx);
    expect(r.title).toBe('Night Shift');
    expect(r.report.message(r.title, 20)).toBe(
      'Imported “Night Shift” · 20 pages. ' +
        'Kept as action: 2 act breaks, 1 general paragraph, 1 lyric. ' +
        'Not imported: 4 scene numbers, 1 note, 3 other title page entries. ' +
        '1 dual-dialogue pair now runs one speech after the other. ' +
        'Bold, italic and underline were removed.',
    );
  });

  it('the two parsers agree, except where Fountain has no element (Shot comes in as action)', async () => {
    const fdx = parseFdx(await fixture('night-shift.fdx'), 'x').blocks;
    const ftn = parseFountain(await fixture('night-shift.fountain'), 'x').blocks;
    expect(ftn.map((b) => b.text)).toEqual(fdx.map((b) => b.text));
    expect(
      ftn
        .filter((b, i) => b.type !== fdx[i]!.type)
        .map((b, i) => [b.type, fdx.filter((f, j) => f.type !== ftn[j]!.type)[i]!.type]),
    ).toEqual([['action', 'shot']]);
  });

  it('paginates as a real script: over a dozen pages, every rule holding', async () => {
    const blocks = (await expected()).fdx.map((b, i) => ({ id: String(i), ...b }));
    const p = paginate(blocks);
    expect(p.pages.length).toBeGreaterThan(12);
    for (const pg of p.pages.slice(0, -1)) {
      const texts = pg.items.filter((i) => i.kind === 'text');
      expect(['scene_heading', 'shot', 'character', 'parenthetical']).not.toContain(
        texts.at(-1)!.type,
      );
    }
  });
});

describe('Fountain details (fountain.io)', () => {
  const blocks = (src: string) => parseFountain(src, 'x').blocks.map((b) => `${b.type}: ${b.text}`);

  it('forced elements: . heading, @ cue, ! action, > transition', () => {
    expect(
      blocks('.SNIPER SCOPE POV\n\n@McCLANE\nYippee ki-yay.\n\n!SCREAMING\n\n>Burn to white.\n'),
    ).toEqual([
      'scene_heading: SNIPER SCOPE POV',
      'character: McCLANE',
      'dialogue: Yippee ki-yay.',
      'action: SCREAMING',
      'transition: Burn to white.',
    ]);
  });

  it('natural headings, cues with lowercase extensions, parentheticals and transitions', () => {
    expect(
      blocks(
        'int. house - day\nThe door opens.\n\nMAYA (cont’d)\n(quietly)\nHello.\nAre you there?\n\nCUT TO:\n\nEXT. YARD - NIGHT',
      ),
    ).toEqual([
      'scene_heading: int. house - day',
      'action: The door opens.',
      'character: MAYA (cont’d)',
      'parenthetical: (quietly)',
      'dialogue: Hello. Are you there?',
      'transition: CUT TO:',
      'scene_heading: EXT. YARD - NIGHT',
    ]);
  });

  it('notes, boneyard and emphasis come out of the text; escapes and CRLF are handled', () => {
    const r = parseFountain(
      '﻿She [[a note]]waits.\r\n\r\n/* gone\r\nentirely */\r\n**Bold** and \\*literal\\* stars.',
      'x',
    );
    expect(r.blocks).toEqual([
      { type: 'action', text: 'She waits.' },
      { type: 'action', text: 'Bold and *literal* stars.' },
    ]);
    expect(r.report.dropped).toEqual(
      new Map([
        ['boneyard', 1],
        ['note', 1],
      ]),
    );
    expect(r.report.formatting).toBe(true);
  });

  it('a title that continues on indented lines', () => {
    expect(parseFountain('Title:\n    THE LONG NIGHT\nAuthor: Me\n\nINT. A - DAY', 'x').title).toBe(
      'THE LONG NIGHT',
    );
  });
});

describe('files that aren’t scripts', () => {
  it('says so plainly', () => {
    expect(() => parseScript('bad.fdx', '<html></html>')).toThrow(ImportError);
    expect(() => parseScript('bad.fdx', '<html></html>')).toThrow(
      'That file isn’t a Final Draft (.fdx) script.',
    );
    expect(() => parseScript('empty.fountain', '\n\n')).toThrow('That file has no script in it.');
    expect(parseScript('My Script.fountain', 'Hello.').title).toBe('My Script');
  });
});

// ---- End to end: Home › Import ----

const mounted: { root: ReactRoot; host: HTMLElement }[] = [];
const testPage = location.pathname + location.search;
const until = async (check: () => unknown, ms = 8000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';

beforeEach(async () => {
  await fetch('/__fake/reset', { method: 'POST' });
  localStorage.removeItem('wr-unsynced');
});
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount();
    host.remove();
  }
  navigate(testPage, { replace: true });
});

describe('Home › Import', () => {
  it('creates a script named from the file, opens it with every block, and reports plainly', async () => {
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
    await until(() => text(document.querySelector('.home-tb .title')) === 'Home');
    expect([...document.querySelectorAll('.home-tb .grp .ta')].map((b) => text(b))).toEqual([
      '+ New series',
      '+ New script',
      'Import',
    ]);

    const src = await fixture('night-shift.fdx');
    const want = (await expected()).fdx;
    await userEvent.upload(
      document.querySelector<HTMLInputElement>('.home-tb input[type="file"]')!,
      new File([src], 'night-shift.fdx', { type: 'application/xml' }),
    );
    const paras = () => [
      ...document.querySelectorAll<HTMLElement>('.layer:not(.off) .script > p.el'),
    ];
    await until(() => paras().length === want.length);
    // The script's text only: a split paragraph also holds its page-break widget's text.
    const own = (p: HTMLElement) =>
      [...p.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('');
    expect(paras().map((p) => ({ type: p.dataset.type, text: own(p) }))).toEqual(want);
    expect(text(document.querySelector('.layer:not(.off) .title'))).toBe('Night Shift');
    const pages = paginate(want.map((b, i) => ({ id: String(i), ...b }))).pages.length;
    expect(text(document.querySelector('.toast.show'))).toBe(
      `Imported “Night Shift” · ${pages} pages. Kept as action: 2 act breaks, 1 general paragraph, 1 lyric. ` +
        'Not imported: 4 scene numbers, 1 note, 3 other title page entries. ' +
        '1 dual-dialogue pair now runs one speech after the other. Bold, italic and underline were removed.',
    );
    // Page view shows the same number of pages.
    await commands.clickAt('.layer:not(.off) button[aria-label="Hide sidebar"]', 10, 10);
    await new Promise((r) => setTimeout(r, 400));
    expect(document.querySelectorAll('.layer:not(.off) .pgb')).toHaveLength(pages - 1);
  }, 60_000);
});
