// Deterministic synthetic screenplay generator (seeded PRNG), sized by the fake paginator.
import type { Node } from 'prosemirror-model';
import { computeBreaks } from './editor';
import type { BlockSpec, SchemaKit } from './schema';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS =
  'the rain door kitchen light window quiet harbor fog pier gull keeper stair breath counter mug coffee night morning radio chart edge nobody something everything never always maybe tonight back late early again still cold warm dark soft'.split(
    ' ',
  );
const NAMES = ['MARA', 'DEV', 'SAM', 'ELENA', 'JONAH', 'PRIYA'];
const PLACES = ['KITCHEN', 'HARBOR', 'LIGHTHOUSE', 'OFFICE', 'CAR', 'DINER', 'ROOFTOP'];
const TIMES = ['DAY', 'NIGHT', 'MORNING', 'DAWN', 'LATER'];

export function generateScript(kit: SchemaKit, pages: number, seed = 7): Node {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const sentence = (min: number, max: number) => {
    const n = min + Math.floor(rnd() * (max - min));
    const words = Array.from({ length: n }, () => pick(WORDS));
    const s = words.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  };
  const para = (sentences: number) =>
    Array.from({ length: sentences }, () => sentence(4, 14)).join(' ');

  const specs: BlockSpec[] = [];
  let scene = 0;
  const doc = () =>
    kit.schema.nodes.doc!.create(
      null,
      specs.map((s) => kit.block(s)),
    );
  while (true) {
    scene += 1;
    specs.push({
      type: 'scene_heading',
      text: `${pick(['INT.', 'EXT.'])} ${pick(PLACES)} ${scene} - ${pick(TIMES)}`,
    });
    for (let i = 0, n = 1 + Math.floor(rnd() * 2); i < n; i++)
      specs.push({ type: 'action', text: para(1 + Math.floor(rnd() * 3)) });
    for (let i = 0, n = 2 + Math.floor(rnd() * 5); i < n; i++) {
      specs.push({ type: 'character', text: pick(NAMES) });
      if (rnd() < 0.2) specs.push({ type: 'parenthetical', text: '(quietly)' });
      specs.push({ type: 'dialogue', text: para(1 + Math.floor(rnd() * 2)) });
    }
    if (rnd() < 0.15) specs.push({ type: 'transition', text: 'CUT TO:' });
    if (scene % 10 === 0 && computeBreaks(kit, doc()).length + 1 >= pages) break;
  }
  return doc();
}
