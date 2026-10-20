import type { Node } from 'prosemirror-model';
import { userEvent } from 'vitest/browser';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { blocksOf, createClient, type Client, type ClientOptions } from '../src/editor';
import { Network } from '../src/net';
import { makeKit, type BlockSpec, type SchemaKit, type Variant } from '../src/schema';
import '../src/spike.css';

export const VARIANTS: Variant[] = ['typeAttr', 'nodeTypes'];
export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control';

export interface Room {
  kit: SchemaKit;
  a: Client;
  b: Client;
  net: Network;
  stage: HTMLElement;
  destroy(): void;
}

export function docFrom(kit: SchemaKit, specs: BlockSpec[]): Node {
  return kit.schema.nodes.doc!.create(
    null,
    specs.map((s) => kit.block(s)),
  );
}

/** Two clients ("A" and "B") editing the same Y.Doc content over a fake network. */
export function room(
  variant: Variant,
  content: BlockSpec[] | ((kit: SchemaKit) => Node),
  opts: Partial<Pick<ClientOptions, 'pageBreaks' | 'protect'>> = {},
): Room {
  const kit = makeKit(variant);
  const seed = typeof content === 'function' ? content(kit) : docFrom(kit, content);
  const docA = new Y.Doc();
  prosemirrorToYXmlFragment(seed, docA.getXmlFragment('script'));
  const docB = new Y.Doc();
  Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

  const stage = document.createElement('div');
  stage.className = 'stage';
  document.body.appendChild(stage);
  const a = createClient({ name: 'A', kit, ydoc: docA, mount: stage, ...opts });
  const b = createClient({ name: 'B', kit, ydoc: docB, mount: stage, ...opts });
  const net = new Network([docA, docB]);
  net.name(docA, 'A');
  net.name(docB, 'B');
  return {
    kit,
    a,
    b,
    net,
    stage,
    destroy() {
      a.destroy();
      b.destroy();
      stage.remove();
    },
  };
}

/** Real key presses into the focused editor (Playwright keyboard via Vitest browser mode). */
export async function keys(c: Client, text: string) {
  c.view.focus();
  await userEvent.keyboard(text);
}

export async function typeText(c: Client, text: string) {
  // Escape user-event's special characters so the text is typed literally.
  await keys(
    c,
    text.replace(/[{[]/g, (ch) => ch + ch),
  );
}

export const undoKeys = (c: Client) => keys(c, `{${MOD}>}z{/${MOD}}`);

/** Both clients show the same document, and their Yjs states are identical. */
export function converged(r: Room) {
  const pmA = JSON.stringify(r.a.view.state.doc.toJSON());
  const pmB = JSON.stringify(r.b.view.state.doc.toJSON());
  const yA = r.a.fragment.toJSON();
  const yB = r.b.fragment.toJSON();
  return pmA === pmB && yA === yB;
}

export const texts = (c: Client) => blocksOf(c).map((b) => b.text);
export const summary = (c: Client) => blocksOf(c).map((b) => `${b.type}: ${b.text}`);

export function idsUnique(c: Client) {
  const blocks = blocksOf(c);
  const ids = new Set(blocks.map((b) => b.id));
  const scenes = blocks.filter((b) => b.type === 'scene_heading').map((b) => b.sceneId);
  return ids.size === blocks.length && new Set(scenes).size === scenes.length;
}

export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function stats(xs: number[]) {
  const s = [...xs].sort((p, q) => p - q);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { n: s.length, p50: r(at(0.5)), p95: r(at(0.95)), max: r(s[s.length - 1] ?? 0) };
}

/** Evidence lines are printed with a prefix so the report can quote them from the test log. */
export function evidence(test: string, data: unknown) {
  console.log(`[EVIDENCE ${test}] ${JSON.stringify(data)}`);
}

/** A small scene used by several tests. */
export const SCENE: BlockSpec[] = [
  { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT' },
  { type: 'action', text: 'Rain hammers the window. MARA grips the counter.' },
  { type: 'character', text: 'MARA' },
  { type: 'dialogue', text: 'We can still fix this.' },
  { type: 'action', text: 'She does not believe it either.' },
  { type: 'scene_heading', text: 'EXT. HARBOR - DAWN' },
  { type: 'action', text: 'Fog lifts off the water. DEV waits on the pier.' },
];
