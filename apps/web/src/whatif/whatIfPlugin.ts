// What a what-if shows in its own script (SPEC 3.9, D-080): a margin dot on each scene with
// something to send (accent = differs from main, amber = main changed it too), the heading pulse
// after a send, and, with Changes on, what the what-if changed: additions in the ins colors,
// removals struck through in the del colors. Rule 2 (D-012): rebuilt from the document each time.
import {
  diffWords,
  scenesOfBlocks,
  scriptBlocks,
  typeOf,
  type Comparison,
  type ScriptBlock,
} from '@wr/schema';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export interface WhatIfMarks {
  comparison: Comparison | null;
  /** What each scene is compared against (what was sent, or the base). */
  baseFor: (sceneId: string) => ScriptBlock[] | null;
  changes: boolean;
  /** Headings pulsing after a send. */
  pulse: ReadonlySet<string>;
  /** The scene whose dot has its ring (popover open, or Compare on it). */
  active: string | null;
  onDot: (sceneId: string, dot: HTMLElement) => void;
}

const key = new PluginKey<{ marks: WhatIfMarks | null; decorations: DecorationSet }>('whatif');

/** Hands the plugin new marks (a transaction that changes nothing in the document). */
export const setWhatIfMarks = (tr: Transaction, marks: WhatIfMarks | null) =>
  tr.setMeta(key, marks).setMeta('addToHistory', false);

function dot(id: string, status: 'differs' | 'conflict', on: boolean, marks: WhatIfMarks) {
  return () => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `dot ${status === 'conflict' ? 'amber' : 'blue'}${on ? ' on' : ''}`;
    const label = status === 'conflict' ? 'Main changed this scene too' : 'Differs from main';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.contentEditable = 'false';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => marks.onDot(id, b));
    return b;
  };
}

function struck(text: string) {
  const d = document.createElement('del');
  d.className = 'chg-del';
  d.textContent = text;
  d.contentEditable = 'false';
  return d;
}

function build(state: EditorState, marks: WhatIfMarks | null): DecorationSet {
  if (!marks?.comparison) return DecorationSet.empty;
  const { comparison } = marks;
  const decorations: Decoration[] = [];
  const blocks = scriptBlocks(state.doc);
  const positions: number[] = [];
  state.doc.forEach((_n, pos) => positions.push(pos));
  const index = new Map(blocks.map((b, i) => [b.id, i]));

  for (const scene of scenesOfBlocks(blocks)) {
    const s = comparison.byId.get(scene.id);
    if (!s) continue;
    const heading = scene.blocks[0]!;
    const hi = index.get(heading.id)!;
    const hpos = positions[hi]!;
    const pending = s.status === 'differs' || s.status === 'conflict';
    if (pending && heading.type === 'scene_heading')
      decorations.push(
        Decoration.widget(
          hpos + 1,
          dot(scene.id, s.status as 'differs', marks.active === scene.id, marks),
          {
            side: -1,
            key: `dot:${scene.id}:${s.status}:${marks.active === scene.id}`,
            ignoreSelection: true,
            stopEvent: () => true,
          },
        ),
      );
    if (marks.pulse.has(scene.id) && heading.type === 'scene_heading')
      decorations.push(
        Decoration.node(hpos, hpos + state.doc.child(hi).nodeSize, { class: 'pulse' }),
      );

    // Changes: what this scene changed, against what it's compared with.
    if (!marks.changes || !pending) continue;
    const base = marks.baseFor(scene.id) ?? [];
    const baseById = new Map(base.map((b) => [b.id, b]));
    let lastPos = hpos; // where a removed line from the base goes
    for (const b of scene.blocks) {
      const i = index.get(b.id)!;
      const pos = positions[i]!;
      const node = state.doc.child(i);
      const old = baseById.get(b.id);
      if (!old) {
        if (node.content.size)
          decorations.push(
            Decoration.inline(pos + 1, pos + 1 + node.content.size, { class: 'chg-ins' }),
          );
      } else if (old.text !== b.text || old.type !== typeOf(node)) {
        let at = pos + 1;
        for (const part of diffWords(old.text, b.text)) {
          if (part.op === 'same') at += part.text.length;
          else if (part.op === 'ins') {
            decorations.push(Decoration.inline(at, at + part.text.length, { class: 'chg-ins' }));
            at += part.text.length;
          } else
            decorations.push(
              Decoration.widget(at, () => struck(part.text), { side: -1, ignoreSelection: true }),
            );
        }
      }
      lastPos = pos + node.nodeSize;
    }
    // Base lines this scene no longer has: shown struck through after the scene's last line.
    const kept = new Set(scene.blocks.map((b) => b.id));
    for (const old of base)
      if (!kept.has(old.id) && !index.has(old.id) && old.text)
        decorations.push(
          Decoration.widget(
            lastPos,
            () => {
              const p = document.createElement('p');
              p.className = 'el chg-gone';
              p.dataset.type = old.type;
              p.append(struck(old.text));
              return p;
            },
            { side: 1, ignoreSelection: true, key: `gone:${old.id}` },
          ),
        );
  }
  return DecorationSet.create(state.doc, decorations);
}

export function whatIfPlugin() {
  return new Plugin({
    key,
    state: {
      init: () => ({ marks: null as WhatIfMarks | null, decorations: DecorationSet.empty }),
      apply(tr, old, _before, state) {
        const meta = tr.getMeta(key) as WhatIfMarks | null | undefined;
        if (meta === undefined && !tr.docChanged) return old;
        const marks = meta === undefined ? old.marks : meta;
        return { marks, decorations: build(state, marks) };
      },
    },
    props: { decorations: (state) => key.getState(state)?.decorations },
  });
}
