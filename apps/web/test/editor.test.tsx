// Integration tests for the editor shell, in real Chromium with real key presses (D-015).
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import {
  clickEndOf,
  frame,
  lines,
  mount,
  press,
  sleep,
  type,
  undo,
  unmountAll,
  until,
} from './helpers';

afterEach(unmountAll);

describe('undo is one step per action', () => {
  it('walks back through a fast-typed scene one action at a time', async () => {
    await mount();
    const snapshots = [lines()];
    const act = async (fn: () => Promise<void>) => {
      await fn();
      snapshots.push(lines());
    };
    // Typed quickly on purpose: Yjs groups changes within 500 ms, but structural actions must
    // still be their own steps (D-014, item 9).
    await act(() => press('{Enter}')); // empty Action → Scene Heading
    await act(() => type('int. kitchen - night'));
    await act(() => press('{Enter}')); // → Action
    await act(() => type('Rain.'));
    await act(() => press('{Enter}'));
    await act(() => press('{Tab}')); // → Character
    await act(() => type('mara'));
    await act(() => press('{Enter}')); // → Dialogue
    await act(() => type('Go.'));
    await act(() => press('{Escape}h')); // element menu: Shot
    expect(snapshots.at(-1)).toEqual([
      'scene_heading: int. kitchen - night',
      'action: Rain.',
      'character: mara',
      'shot: Go.',
    ]);
    for (let i = snapshots.length - 2; i >= 0; i--) {
      await undo();
      expect(lines(), `after undoing step ${i + 1}`).toEqual(snapshots[i]);
    }
  });
});

describe('element menu (SPEC 4.3, D-014)', () => {
  it('Esc opens it beside the line with a ✓ on the current type; a letter switches and closes', async () => {
    await mount();
    await type('Hold on her.');
    await press('{Escape}');
    const menu = document.querySelector<HTMLElement>('.elmenu');
    expect(menu).not.toBeNull();
    expect(menu!.querySelector('[aria-checked="true"]')?.textContent).toContain('Action');
    // Opens in the left margin, entirely left of the text column.
    const page = document.querySelector('.page')!.getBoundingClientRect();
    expect(menu!.getBoundingClientRect().right).toBeLessThanOrEqual(page.left + 144);
    await press('h');
    expect(document.querySelector('.elmenu')).toBeNull();
    expect(lines()).toEqual(['shot: Hold on her.']);
  });

  it('Esc closes it without a change; arrows and Enter pick; other keys close it and type', async () => {
    await mount();
    await press('{Escape}{Escape}');
    expect(document.querySelector('.elmenu')).toBeNull();
    expect(lines()).toEqual(['action: ']);
    await press('{Escape}{ArrowDown}{Enter}'); // Action → the next row, Character
    expect(lines()).toEqual(['character: ']);
    await press('{Escape}');
    await type('1');
    expect(document.querySelector('.elmenu')).toBeNull();
    expect(lines()).toEqual(['character: 1']);
  });

  it('every element type is reachable from the keyboard', async () => {
    await mount();
    const seen = new Set<string>();
    for (const key of ['s', 'a', 'c', 'p', 'd', 'h', 't']) {
      await press(`{Escape}${key}`);
      seen.add(lines()[0]!.split(':')[0]!);
    }
    expect([...seen].sort()).toEqual([
      'action',
      'character',
      'dialogue',
      'parenthetical',
      'scene_heading',
      'shot',
      'transition',
    ]);
  });
});

describe('sidebar collapse and page view (SPEC 3.7)', () => {
  it('never rewraps a line, and the page keeps its true geometry (SPEC 3.8)', async () => {
    await mount();
    await press('{Enter}');
    await type('int. kitchen - night');
    await press('{Enter}');
    await type(
      'Rain hammers the window. MARA grips the counter, knuckles white, and stares at the kettle as it begins to shake on the stove.',
    );
    await press('{Enter}{Tab}');
    await type('mara');
    await press('{Enter}');
    await type('We can still fix this, if you would only stop talking for one second and listen.');
    await sleep(50);

    const measure = () => {
      const page = document.querySelector('.page')!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>('.script > p')].map((p) => {
        const r = p.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(p);
        return {
          left: Math.round(r.left - page.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
          lines: new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size,
        };
      });
    };
    const before = measure();
    expect(before[1]!.lines).toBe(3); // the long action wraps onto 3 lines of 60 characters
    expect(before.map((b) => b.left)).toEqual([144, 144, 355, 240]); // 1.5, 1.5, 3.7, 2.5 in
    const page = document.querySelector('.page')!.getBoundingClientRect();
    expect(page.width).toBe(816);

    await userEvent.click(document.querySelector('button[aria-label="Hide sidebar"]')!);
    const during: ReturnType<typeof measure>[] = [];
    for (let i = 0; i < 12; i++) {
      await frame();
      during.push(measure());
    }
    await sleep(300);
    for (const m of during) expect(m).toEqual(before);
    expect(measure()).toEqual(before);
    expect(document.querySelector('.app')!.classList.contains('left-closed')).toBe(true);
    expect(getComputedStyle(document.querySelector('.center')!).backgroundColor).toBe(
      getComputedStyle(document.querySelector('.left')!).backgroundColor, // the sidebar's gray spreads to the desk
    );

    await userEvent.click(document.querySelector('button[aria-label="Show sidebar"]')!);
    await sleep(300);
    expect(measure()).toEqual(before);
  });

  it('Courier Prime runs at 10 characters per inch', async () => {
    await mount();
    const probe = document.createElement('span');
    probe.style.font = '16px "Courier Prime", "Courier New", monospace';
    probe.style.whiteSpace = 'pre';
    probe.textContent = 'x'.repeat(60);
    document.body.appendChild(probe);
    expect(Math.abs(probe.getBoundingClientRect().width - 576)).toBeLessThan(1);
    probe.remove();
  });
});

describe('scene identity (SPEC 4.6)', () => {
  it('turning a heading into action shows "Scenes 1 and 2 combined · Undo", and Undo restores it', async () => {
    await mount();
    await press('{Enter}');
    await type('int. kitchen - night');
    await press('{Enter}');
    await type('Rain.');
    await press('{Enter}{Enter}'); // Action, then empty Action → Scene Heading
    await type('ext. harbor - dawn');
    await press('{Escape}a'); // the second heading becomes action
    const toast = document.querySelector('.toast')!;
    await until(() => toast.classList.contains('show'));
    expect(toast.textContent).toContain('Scenes 1 and 2 combined');
    await userEvent.click(toast.querySelector('button')!);
    expect(lines()).toContain('scene_heading: ext. harbor - dawn');
    expect(document.querySelectorAll('.left .row')).toHaveLength(2);
  });
});

describe('formatting warnings (SPEC 4.5, D-014)', () => {
  async function orphanDialogue() {
    await type('She waits.');
    await press('{Enter}{Tab}');
    await type('mara');
    await press('{Enter}');
    await type('We can still fix this.');
    // Delete the cue: empty its line, then remove the empty line.
    await clickEndOf(1);
    await press('{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}');
    await until(() => document.querySelector('.warn') !== null);
  }

  it('marks dialogue with no cue in the margin; "Add character cue" fixes it', async () => {
    await mount();
    await orphanDialogue();
    expect(lines()).toEqual(['action: She waits.', 'dialogue: We can still fix this.']);
    const mark = document.querySelector<HTMLElement>('.warn')!;
    const page = document.querySelector('.page')!.getBoundingClientRect();
    expect(mark.getBoundingClientRect().right).toBeLessThan(page.left + 144); // in the margin
    await userEvent.click(mark);
    const items = [...document.querySelectorAll('.pop .mi')].map((b) => b.textContent);
    expect(items).toEqual(['Add character cue', 'Make this action']);
    await userEvent.click(document.querySelector('.pop .mi')!);
    expect(lines()).toEqual([
      'action: She waits.',
      'character: ',
      'dialogue: We can still fix this.',
    ]);
    await type('dev');
    expect(lines()[1]).toBe('character: dev');
    expect(document.querySelector('.warn')).toBeNull();
  });

  it('"Make this action" converts the line, and one undo brings the warning back', async () => {
    await mount();
    await orphanDialogue();
    await userEvent.click(document.querySelector('.warn')!);
    await userEvent.click(document.querySelectorAll('.pop .mi')[1]!);
    expect(lines()).toEqual(['action: She waits.', 'action: We can still fix this.']);
    expect(document.querySelector('.warn')).toBeNull();
    await undo();
    expect(lines()).toEqual(['action: She waits.', 'dialogue: We can still fix this.']);
    expect(document.querySelector('.warn')).not.toBeNull();
  });
});

describe('scene navigator (SPEC 3.6)', () => {
  it('lists scenes by name, follows the cursor, and jumps on click', async () => {
    await mount();
    await press('{Enter}');
    await type('int. kitchen - night');
    await press('{Enter}');
    await type('Rain.');
    await press('{Enter}{Enter}');
    await type('ext. harbor - dawn');
    const rows = () => [...document.querySelectorAll<HTMLElement>('.left .row')];
    expect(rows().map((r) => r.textContent)).toEqual(['Kitchen – Night', 'Harbor – Dawn']);
    expect(rows()[1]!.classList.contains('sel')).toBe(true);
    await userEvent.click(rows()[0]!);
    await until(() => rows()[0]!.classList.contains('sel'));
    expect(rows()[1]!.classList.contains('sel')).toBe(false);
  });
});
