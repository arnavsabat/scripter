import { describe, expect, it } from 'vitest';
import { STRUCTURAL } from '../src/commands';
import { detectCombines, sceneAt, sceneName, scenesOf } from '../src/scenes';
import { addCueAbove, findIssues, makeAction } from '../src/warnings';
import { caret, doc, lines, run, state } from './helpers';

describe('formatting warnings (SPEC 4.5, D-014)', () => {
  const broken = () =>
    state([
      { type: 'action', text: 'She waits.' },
      { type: 'dialogue', text: 'We can still fix this.', id: 'orphan' },
      { type: 'parenthetical', text: '(beat)' },
      { type: 'dialogue', text: 'Can we?' },
      { type: 'character', text: 'DEV' },
      { type: 'dialogue', text: 'No.' },
    ]);

  it('flags only the first line of a dialogue run with no character cue', () => {
    expect(findIssues(broken().doc)).toEqual([
      { kind: 'orphan-dialogue', pos: 12, blockId: 'orphan' },
    ]);
  });

  it('flags a document that starts with dialogue', () => {
    expect(findIssues(doc([{ type: 'parenthetical', text: '(quietly)' }]))).toHaveLength(1);
  });

  it('accepts well-formed dialogue', () => {
    const ok = doc([
      { type: 'character', text: 'MARA' },
      { type: 'parenthetical', text: '(quietly)' },
      { type: 'dialogue', text: 'Go.' },
      { type: 'parenthetical', text: '(beat)' },
      { type: 'dialogue', text: 'Now.' },
    ]);
    expect(findIssues(ok)).toEqual([]);
  });

  it('"Add character cue" inserts an empty cue above, puts the cursor in it, and clears the warning', () => {
    const s = broken();
    const [issue] = findIssues(s.doc);
    const { tr, state: after } = run(s, addCueAbove(issue!.pos));
    expect(lines(after).slice(0, 3)).toEqual([
      'action: She waits.',
      'character: ',
      'dialogue: We can still fix this.',
    ]);
    expect(caret(after)).toEqual({ block: 1, offset: 0 });
    expect(findIssues(after.doc)).toEqual([]);
    expect(tr?.getMeta(STRUCTURAL)).toBe(true);
  });

  it('"Make this action" converts the line and keeps its text', () => {
    const s = broken();
    const [issue] = findIssues(s.doc);
    const after = run(s, makeAction(issue!.pos)).state;
    expect(lines(after)[1]).toBe('action: We can still fix this.');
    // The run's next line is now the orphan, and is flagged in turn. No text is ever dropped.
    expect(findIssues(after.doc).map((i) => i.pos)).toHaveLength(1);
    expect(lines(after).join('|')).toContain('Can we?');
  });
});

describe('scene identity (SPEC 4.6)', () => {
  const script = () =>
    state([
      { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT', id: 'h1', sceneId: 's1' },
      { type: 'action', text: 'Rain.', id: 'a1' },
      { type: 'scene_heading', text: 'EXT. HARBOR - DAWN', id: 'h2', sceneId: 's2' },
      { type: 'action', text: 'Fog.', id: 'a2' },
      { type: 'scene_heading', text: 'INT. OFFICE - DAY', id: 'h3', sceneId: 's3' },
      { type: 'action', text: 'Charts.', id: 'a3' },
    ]);

  it('lists scenes with numbers, headings and their blocks', () => {
    const scenes = scenesOf(script().doc);
    expect(scenes.map((s) => [s.number, s.heading, s.blockIds])).toEqual([
      [1, 'INT. KITCHEN - NIGHT', ['h1', 'a1']],
      [2, 'EXT. HARBOR - DAWN', ['h2', 'a2']],
      [3, 'INT. OFFICE - DAY', ['h3', 'a3']],
    ]);
    expect(sceneAt(scenes, scenes[1]!.pos + 3)?.sceneId).toBe('s2');
  });

  it('deleting a heading combines its scene with the previous one', () => {
    const s = script();
    const h2 = scenesOf(s.doc)[1]!;
    const node = s.doc.nodeAt(h2.pos)!;
    const after = s.apply(s.tr.delete(h2.pos, h2.pos + node.nodeSize));
    expect(detectCombines(s.doc, after.doc)).toEqual([{ first: 1, second: 2 }]);
  });

  it('changing a heading into action also combines', () => {
    const s = script();
    const h3 = scenesOf(s.doc)[2]!;
    const after = s.apply(
      s.tr.setNodeMarkup(h3.pos, undefined, { id: 'h3', type: 'action', sceneId: null }),
    );
    expect(detectCombines(s.doc, after.doc)).toEqual([{ first: 2, second: 3 }]);
  });

  it('changing a heading-only scene into action combines too', () => {
    const s = state([
      { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT', id: 'h1', sceneId: 's1' },
      { type: 'scene_heading', text: 'EXT. HARBOR - DAWN', id: 'h2', sceneId: 's2' },
    ]);
    const h2 = scenesOf(s.doc)[1]!;
    const after = s.apply(
      s.tr.setNodeMarkup(h2.pos, undefined, { id: 'h2', type: 'action', sceneId: null }),
    );
    expect(detectCombines(s.doc, after.doc)).toEqual([{ first: 1, second: 2 }]);
  });

  it('deleting a whole scene, or the first heading, is not a combine', () => {
    const s = script();
    const h2 = scenesOf(s.doc)[1]!;
    const h3 = scenesOf(s.doc)[2]!;
    const wholeScene = s.apply(s.tr.delete(h2.pos, h3.pos));
    expect(detectCombines(s.doc, wholeScene.doc)).toEqual([]);
    const first = s.doc.firstChild!;
    const noFirstHeading = s.apply(s.tr.delete(0, first.nodeSize));
    expect(detectCombines(s.doc, noFirstHeading.doc)).toEqual([]);
  });

  it('typing a new heading mid-scene adds a scene without a combine', () => {
    const s = script();
    const a1 = s.doc.child(1);
    const pos = s.doc.child(0).nodeSize;
    const after = s.apply(
      s.tr.insert(
        pos + a1.nodeSize,
        s.schema.nodes.block!.create({ id: 'h9', type: 'scene_heading', sceneId: 's9' }),
      ),
    );
    expect(scenesOf(after.doc)).toHaveLength(4);
    expect(detectCombines(s.doc, after.doc)).toEqual([]);
  });

  it.each([
    ['INT. KITCHEN - MORNING', 'Kitchen – Morning'],
    ['EXT. HARBOR – DAWN', 'Harbor – Dawn'],
    ["INT. HARBORMASTER'S OFFICE - DAY", "Harbormaster's Office – Day"],
    ['INT./EXT. CAR - MOVING', 'Car – Moving'],
    ['int. lighthouse - day', 'Lighthouse – Day'],
    ['', 'Untitled scene'],
    ['INT.', 'Untitled scene'],
  ])('names "%s" as "%s" in the navigator', (heading, name) => {
    expect(sceneName(heading)).toBe(name);
  });
});
