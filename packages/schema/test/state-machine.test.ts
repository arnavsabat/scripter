import { describe, expect, it } from 'vitest';
import { STRUCTURAL, enter, setElementType, shiftTab, tab } from '../src/commands';
import { ELEMENT_TYPES, ENTER_EMPTY, ENTER_NEXT, type ElementType } from '../src/elements';
import { caret, cursor, lines, run, select, state, type } from './helpers';

const one = (t: ElementType, text = 'Some text') => state([{ type: t, text }]);

describe('Enter (SPEC 4.2)', () => {
  it.each(ELEMENT_TYPES)('at the end of a %s line opens the next type', (t) => {
    const s = cursor(one(t), 0, 'end');
    const { tr, state: after } = run(s, enter);
    expect(lines(after)).toEqual([`${t}: Some text`, `${ENTER_NEXT[t]}: `]);
    expect(caret(after)).toEqual({ block: 1, offset: 0 });
    expect(tr?.getMeta(STRUCTURAL)).toBe(true);
  });

  it.each(ELEMENT_TYPES)('on an empty %s line changes that line in place (D-014)', (t) => {
    const s = cursor(
      state([
        { type: 'action', text: 'Before.' },
        { type: t, text: '' },
      ]),
      1,
    );
    const { state: after } = run(s, enter);
    expect(lines(after)).toEqual(['action: Before.', `${ENTER_EMPTY[t]}: `]);
  });

  it('in the middle of a line splits it; the second half gets the next type', () => {
    const s = cursor(one('character', 'MARA'), 0, 2);
    expect(lines(run(s, enter).state)).toEqual(['character: MA', 'dialogue: RA']);
  });

  it('at the start of a non-empty line opens a line above; the text keeps its type and cursor', () => {
    const s = cursor(one('dialogue', 'Go home.'), 0, 0);
    const { state: after } = run(s, enter);
    expect(lines(after)).toEqual(['dialogue: ', 'dialogue: Go home.']);
    expect(caret(after)).toEqual({ block: 1, offset: 0 });
  });

  it('at the start of a scene heading opens an action line above it, not an empty heading', () => {
    const s = cursor(one('scene_heading', 'INT. KITCHEN - NIGHT'), 0, 0);
    expect(lines(run(s, enter).state)).toEqual(['action: ', 'scene_heading: INT. KITCHEN - NIGHT']);
  });

  it('inside a parenthetical just before ")" keeps the ")" on the parenthetical', () => {
    const s = cursor(one('parenthetical', '(beat)'), 0, 5);
    expect(lines(run(s, enter).state)).toEqual(['parenthetical: (beat)', 'dialogue: ']);
  });

  it('replaces a selection, then splits', () => {
    const s = select(one('action', 'Rain hammers the window.'), 0, 4, 12);
    expect(lines(run(s, enter).state)).toEqual(['action: Rain', 'action:  the window.']);
  });
});

describe('Tab and Shift+Tab (SPEC 4.2, D-014)', () => {
  const cases: [ElementType, string, ElementType | null][] = [
    ['action', '', 'character'],
    ['action', 'Text', null],
    ['character', '', 'transition'],
    ['character', 'MARA', null],
    ['transition', '', 'scene_heading'],
    ['transition', 'CUT TO:', null],
    ['dialogue', '', 'parenthetical'],
    ['dialogue', 'Words.', 'parenthetical'],
    ['parenthetical', '(beat)', 'dialogue'],
    ['scene_heading', '', null],
    ['shot', '', null],
  ];
  it.each(cases)('Tab on %s "%s" → %s', (from, text, to) => {
    const s = cursor(one(from, text), 0, 'end');
    const { handled, tr, state: after } = run(s, tab);
    expect(handled).toBe(true); // Tab never leaves the script
    if (to === null) expect(tr).toBeUndefined();
    else expect(lines(after)[0]!.split(':')[0]).toBe(to);
  });

  it('Tab on an empty dialogue makes "()" with the cursor inside', () => {
    const s = cursor(one('dialogue', ''), 0);
    const { state: after } = run(s, tab);
    expect(lines(after)).toEqual(['parenthetical: ()']);
    expect(caret(after)).toEqual({ block: 0, offset: 1 });
  });

  it('Tab on an empty "()" parenthetical drops the parentheses', () => {
    const s = cursor(one('parenthetical', '()'), 0, 1);
    expect(lines(run(s, tab).state)).toEqual(['dialogue: ']);
  });

  it.each([
    ['character', 'action'],
    ['parenthetical', 'dialogue'],
    ['transition', 'character'],
  ] as const)('Shift+Tab on %s → %s', (from, to) => {
    const s = cursor(one(from, 'X'), 0, 'end');
    expect(lines(run(s, shiftTab).state)).toEqual([`${to}: X`]);
  });

  it('Shift+Tab elsewhere does nothing but is still handled', () => {
    const { handled, tr } = run(cursor(one('action'), 0), shiftTab);
    expect(handled).toBe(true);
    expect(tr).toBeUndefined();
  });
});

describe('element menu type changes', () => {
  it('change the type in place and keep the ID and text', () => {
    const s = cursor(state([{ type: 'action', text: 'Hold on her.', id: 'keep' }]), 0, 3);
    const { tr, state: after } = run(s, setElementType('shot'));
    expect(lines(after)).toEqual(['shot: Hold on her.']);
    expect(after.doc.firstChild!.attrs.id).toBe('keep');
    expect(tr?.getMeta(STRUCTURAL)).toBe(true);
  });

  it('give a new scene heading a scene ID and take it away again', () => {
    let s = cursor(one('action', 'INT. HALL - DAY'), 0);
    s = run(s, setElementType('scene_heading')).state;
    expect(s.doc.firstChild!.attrs.sceneId).toMatch(/^s/);
    s = run(s, setElementType('action')).state;
    expect(s.doc.firstChild!.attrs.sceneId).toBeNull();
  });
});

describe('writing a whole scene from the keyboard', () => {
  it('reaches every element type (Shot through the element menu)', () => {
    let s = cursor(state([{ type: 'action', text: '' }]), 0);
    s = run(s, enter).state; // empty Action → Scene Heading
    s = type(s, 'int. kitchen - night');
    s = run(s, enter).state; // → Action
    s = type(s, 'Rain hammers the window.');
    s = run(s, enter).state; // → Action
    s = run(s, tab).state; // empty Action → Character
    s = type(s, 'mara');
    s = run(s, enter).state; // → Dialogue
    s = run(s, tab).state; // empty Dialogue → Parenthetical "(|)"
    s = type(s, 'quietly');
    s = run(s, enter).state; // before ")" → Dialogue, ")" stays
    s = type(s, 'We can still fix this.');
    s = run(s, enter).state; // → Action
    s = run(s, setElementType('shot')).state; // element menu: H
    s = type(s, 'close on the kettle');
    s = run(s, enter).state; // → Action
    s = run(s, tab).state; // → Character
    s = run(s, tab).state; // empty Character → Transition
    s = type(s, 'cut to:');
    s = run(s, enter).state; // → Scene Heading
    s = type(s, 'ext. harbor - dawn');
    expect(lines(s)).toEqual([
      'scene_heading: int. kitchen - night',
      'action: Rain hammers the window.',
      'character: mara',
      'parenthetical: (quietly)',
      'dialogue: We can still fix this.',
      'shot: close on the kettle',
      'transition: cut to:',
      'scene_heading: ext. harbor - dawn',
    ]);
  });
});
