import { describe, expect, it } from 'vitest';
import {
  OPENING,
  compareScenes,
  diffWords,
  pendingScenes,
  planSend,
  scenesOfBlocks,
  sentRecords,
  type ScriptBlock,
} from '../src/whatif';

// ---- A tiny script language: "S:kitchen INT. KITCHEN" is a heading, "A:a1 text" an action ----
function script(...lines: string[]): ScriptBlock[] {
  return lines.map((l) => {
    const [tag, rest] = [l.slice(0, 1), l.slice(2)];
    const [id, ...words] = rest.split(' ');
    const text = words.join(' ');
    if (tag === 'S') return { id: `h-${id}`, type: 'scene_heading', text, sceneId: id };
    return { id: id!, type: tag === 'C' ? 'character' : tag === 'D' ? 'dialogue' : 'action', text };
  });
}
const status = (c: ReturnType<typeof compareScenes>) =>
  Object.fromEntries(c.scenes.map((s) => [s.id, s.change ? `${s.status}:${s.change}` : s.status]));

const BASE = script(
  'S:kitchen INT. KITCHEN - NIGHT',
  'A:k1 Mara stares at the sink.',
  'S:harbor EXT. HARBOR - NIGHT',
  'A:h1 Fog rolls in.',
  'S:office INT. OFFICE - DAY',
  'A:o1 Phones ring.',
);
const edit = (blocks: ScriptBlock[], id: string, text: string) =>
  blocks.map((b) => (b.id === id ? { ...b, text } : b));

describe('scenes', () => {
  it('each heading starts a scene; lines before the first are the opening', () => {
    const s = scenesOfBlocks(
      script(
        'A:t1 FADE IN:',
        ...BASE.map(
          (b) =>
            `${b.type === 'scene_heading' ? 'S' : 'A'}:${b.type === 'scene_heading' ? b.sceneId : b.id} ${b.text}`,
        ),
      ),
    );
    expect(s.map((x) => x.id)).toEqual([OPENING, 'kitchen', 'harbor', 'office']);
    expect(s[1]!.blocks).toHaveLength(2);
  });

  it('hashes content, not IDs', () => {
    const a = scenesOfBlocks(script('S:x INT. A', 'A:1 Hi.'))[0]!;
    const b = scenesOfBlocks(script('S:x INT. A', 'A:2 Hi.'))[0]!;
    expect(a.hash).toBe(b.hash);
  });
});

describe('three-way comparison (SPEC 3.9)', () => {
  it('blue = only the what-if changed it; amber = main too; main-only changes are ignored', () => {
    const whatIf = edit(
      edit(BASE, 'k1', 'Mara smashes the plate.'),
      'h1',
      'Fog swallows the pier.',
    );
    const main = edit(edit(BASE, 'h1', 'Fog rolls in, thick.'), 'o1', 'Phones ring and ring.');
    expect(status(compareScenes({ base: BASE, whatIf, main }))).toEqual({
      kitchen: 'differs:edited',
      harbor: 'conflict:edited',
      office: 'same',
    });
  });

  it('a scene main already matches needs nothing sent', () => {
    const whatIf = edit(BASE, 'k1', 'Same change.');
    expect(status(compareScenes({ base: BASE, whatIf, main: whatIf }))).toMatchObject({
      kitchen: 'same',
    });
  });

  it('added and deleted scenes', () => {
    const whatIf = [
      ...BASE.slice(0, 2),
      ...script('S:pier EXT. PIER - NIGHT', 'A:p1 Waves.'),
      ...BASE.slice(4),
    ];
    const c = compareScenes({ base: BASE, whatIf, main: BASE });
    expect(status(c)).toEqual({
      kitchen: 'same',
      pier: 'differs:added',
      harbor: 'differs:deleted',
      office: 'same',
    });
    expect(c.byId.get('harbor')!.inWhatIf).toBe(false);
    // Main changed the scene the what-if deleted: amber.
    const main = edit(BASE, 'h1', 'Fog, and a boat.');
    expect(status(compareScenes({ base: BASE, whatIf, main })).harbor).toBe('conflict:deleted');
  });

  it('a moved scene is a change; only the scene that moved is flagged, not its neighbours', () => {
    const whatIf = [...BASE.slice(2, 4), ...BASE.slice(0, 2), ...BASE.slice(4)]; // harbor before kitchen
    const c = status(compareScenes({ base: BASE, whatIf, main: BASE }));
    expect(Object.values(c).filter((v) => v !== 'same')).toHaveLength(1);
    expect(c.office).toBe('same');
  });

  it('combined scenes (a heading deleted) travel together', () => {
    // The harbor heading is gone: its lines now belong to the kitchen.
    const whatIf = BASE.filter((b) => b.id !== 'h-harbor');
    const c = compareScenes({ base: BASE, whatIf, main: BASE });
    expect(status(c)).toEqual({
      kitchen: 'differs:edited',
      harbor: 'differs:deleted',
      office: 'same',
    });
    expect(c.byId.get('kitchen')!.group.sort()).toEqual(['harbor', 'kitchen']);
    expect(c.byId.get('harbor')!.group.sort()).toEqual(['harbor', 'kitchen']);
  });

  it('a split scene (a heading added inside it) travels with the new scene', () => {
    // The kitchen has two lines; a new heading moves the second into a new "sink" scene.
    const base = [BASE[0]!, ...script('A:k0 Lights.'), ...BASE.slice(1)];
    const whatIf = [BASE[0]!, ...script('A:k0 Lights.', 'S:sink INT. SINK'), ...BASE.slice(1)];
    const c = compareScenes({ base, whatIf, main: base });
    expect(status(c)).toEqual({
      kitchen: 'differs:edited',
      sink: 'differs:added',
      harbor: 'same',
      office: 'same',
    });
    expect(c.byId.get('sink')!.group.sort()).toEqual(['kitchen', 'sink']);
    // Sent together, main gets both halves with no line lost.
    expect(planSend(c.byId.get('sink')!.group, whatIf, base)).toEqual(whatIf);
  });

  it('a group is amber if any of it is', () => {
    const whatIf = BASE.filter((b) => b.id !== 'h-harbor');
    const main = edit(BASE, 'h1', 'Main changed the harbor.');
    const c = compareScenes({ base: BASE, whatIf, main });
    expect(c.byId.get('kitchen')!.status).toBe('conflict');
  });
});

describe('sending (SPEC 3.9)', () => {
  it('takes the what-if’s version of the scene, leaving the rest of main as it is', () => {
    const whatIf = edit(BASE, 'k1', 'Mara smashes the plate.');
    const main = edit(BASE, 'o1', 'Phones ring and ring.');
    const after = planSend(['kitchen'], whatIf, main);
    expect(after.find((b) => b.id === 'k1')!.text).toBe('Mara smashes the plate.');
    expect(after.find((b) => b.id === 'o1')!.text).toBe('Phones ring and ring.');
    expect(after.map((b) => b.id)).toEqual(main.map((b) => b.id));
  });

  it('an added scene lands after the scene before it in the what-if; a deleted one goes', () => {
    const whatIf = [
      ...BASE.slice(0, 2),
      ...script('S:pier EXT. PIER', 'A:p1 Waves.'),
      ...BASE.slice(4),
    ];
    expect(planSend(['pier'], whatIf, BASE).map((b) => b.id)).toEqual([
      'h-kitchen',
      'k1',
      'h-pier',
      'p1',
      'h-harbor',
      'h1',
      'h-office',
      'o1',
    ]);
    expect(planSend(['harbor'], whatIf, BASE).map((b) => b.id)).toEqual([
      'h-kitchen',
      'k1',
      'h-office',
      'o1',
    ]);
  });

  it('a moved scene moves in main', () => {
    const whatIf = [...BASE.slice(4), ...BASE.slice(0, 4)]; // office first
    const moved = compareScenes({ base: BASE, whatIf, main: BASE }).scenes.find(
      (s) => s.status !== 'same',
    )!;
    expect(moved.id).toBe('office');
    expect(planSend(['office'], whatIf, BASE).map((b) => b.id)).toEqual([
      'h-office',
      'o1',
      ...BASE.slice(0, 4).map((b) => b.id),
    ]);
  });

  it('a combine sent as a group leaves no duplicate lines', () => {
    const whatIf = BASE.filter((b) => b.id !== 'h-harbor');
    const group = compareScenes({ base: BASE, whatIf, main: BASE }).byId.get('kitchen')!.group;
    expect(planSend(group, whatIf, BASE)).toEqual(whatIf);
  });

  it('after a send the scene shows Sent ✓; editing it again makes it blue (not amber)', () => {
    const whatIf = edit(BASE, 'k1', 'Mara smashes the plate.');
    const main = planSend(['kitchen'], whatIf, BASE);
    const sent = sentRecords(['kitchen'], whatIf);
    expect(status(compareScenes({ base: BASE, whatIf, main, sent })).kitchen).toBe('sent');
    const again = edit(whatIf, 'k1', 'Mara smashes every plate.');
    expect(status(compareScenes({ base: BASE, whatIf: again, main, sent })).kitchen).toBe(
      'differs:edited',
    );
    // ...and amber if main changed it after the send.
    const main2 = edit(main, 'k1', 'Main rewrote it.');
    expect(status(compareScenes({ base: BASE, whatIf: again, main: main2, sent })).kitchen).toBe(
      'conflict:edited',
    );
  });

  it('nothing pending once everything is in main', () => {
    const whatIf = edit(edit(BASE, 'k1', 'A.'), 'o1', 'B.');
    const c = compareScenes({ base: BASE, whatIf, main: BASE });
    const ids = pendingScenes(c).flatMap((s) => s.group);
    const main = planSend(ids, whatIf, BASE);
    expect(
      pendingScenes(compareScenes({ base: BASE, whatIf, main, sent: sentRecords(ids, whatIf) })),
    ).toEqual([]);
  });
});

describe('phrase diff', () => {
  it('replaced words read as one phrase', () => {
    expect(diffWords('We can still fix this.', 'It is already too late.')).toEqual([
      { op: 'del', text: 'We can still fix this.' },
      { op: 'ins', text: 'It is already too late.' },
    ]);
  });
  it('keeps what stayed', () => {
    expect(diffWords('Fog rolls in.', 'Fog rolls in, thick and cold.')).toEqual([
      { op: 'same', text: 'Fog rolls ' },
      { op: 'del', text: 'in.' },
      { op: 'ins', text: 'in, thick and cold.' },
    ]);
    expect(diffWords('A', 'A')).toEqual([{ op: 'same', text: 'A' }]);
    expect(diffWords('', 'New line.')).toEqual([{ op: 'ins', text: 'New line.' }]);
  });
});
