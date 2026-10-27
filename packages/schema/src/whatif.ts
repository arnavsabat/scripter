// What-ifs (SPEC 3.9, 5.2): the scene-level three-way comparison between a what-if, the snapshot
// of main it was forked from, and main as it is now, plus the plan for sending scenes to main
// and the phrase-level diff the Changes highlights and Compare panel show (D-080).
//
// Scenes are compared by scene ID and content hash. A scene the what-if changed is blue, or
// amber if main changed it too; a scene only main changed is ignored. Added, deleted and moved
// scenes count as changes. Scenes that split or combined share lines (block IDs), so they're
// linked into one group and always travel to main together. Each what-if records what it sent
// ("sent"), so a sent scene shows "Sent ✓", and editing it again makes it blue rather than amber.
import type { Node } from 'prosemirror-model';
import type { ElementType } from './elements';
import { typeOf } from './schema';

export interface ScriptBlock {
  id: string;
  type: ElementType;
  text: string;
  /** On scene headings: the scene's ID. */
  sceneId?: string | null;
}

/** Lines before the first scene heading form a scene of their own. */
export const OPENING = '#opening';

export interface Scene {
  id: string;
  /** The heading's text ('' for the opening). */
  heading: string;
  blocks: ScriptBlock[];
  hash: string;
}

/** What a what-if sent for one scene: its lines (none if the send deleted it) and what came before. */
export interface SentScene {
  blocks: ScriptBlock[] | null;
  /** The scene before it in the what-if when it was sent (null at the start). */
  prev: string | null;
}

export type SceneStatus = 'differs' | 'conflict' | 'sent' | 'same';
export type SceneChange = 'edited' | 'added' | 'deleted' | 'moved';

export interface SceneState {
  id: string;
  heading: string;
  /** differs = blue dot, conflict = amber dot, sent = "Sent ✓", same = nothing. */
  status: SceneStatus;
  change: SceneChange | null;
  /** The scenes that must be sent together with this one (split or combined), itself included. */
  group: string[];
  /** It exists in the what-if (a deleted scene doesn't). */
  inWhatIf: boolean;
}

/** A document's lines, as the comparison reads them. */
export function scriptBlocks(doc: Node): ScriptBlock[] {
  const out: ScriptBlock[] = [];
  doc.forEach((node, _pos, i) => {
    out.push({
      id: String(node.attrs.id ?? `#${i}`),
      type: typeOf(node),
      text: node.textContent,
      sceneId: (node.attrs.sceneId as string | null) ?? null,
    });
  });
  return out;
}

// ---- Scenes and hashes ----

/** cyrb53: a fast 53-bit string hash; collisions are vanishingly unlikely for scene text. */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A scene's content, for comparing: its lines' types and text (IDs don't matter). */
export const sceneHash = (blocks: readonly ScriptBlock[]) =>
  hash(blocks.map((b) => `${b.type}\u0001${b.text}`).join('\u0002'));

/** The scenes of a list of lines: each heading starts one; lines before the first are the opening. */
export function scenesOfBlocks(blocks: readonly ScriptBlock[]): Scene[] {
  const scenes: Scene[] = [];
  for (const b of blocks) {
    if (b.type === 'scene_heading')
      scenes.push({ id: b.sceneId ?? b.id, heading: b.text, blocks: [b], hash: '' });
    else if (scenes.length) scenes[scenes.length - 1]!.blocks.push(b);
    else scenes.push({ id: OPENING, heading: '', blocks: [b], hash: '' });
  }
  for (const s of scenes) s.hash = sceneHash(s.blocks);
  return scenes;
}

/** Scene IDs in `a` order that keep their relative order in `b`: a longest common subsequence. */
function stayedInOrder(a: readonly string[], b: readonly string[]): Set<string> {
  const inB = new Set(b);
  const inA = new Set(a);
  const x = a.filter((id) => inB.has(id));
  const y = b.filter((id) => inA.has(id));
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const keep = new Set<string>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (x[i] === y[j]) {
      keep.add(x[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return keep;
}

// ---- The three-way comparison ----

export interface Comparison {
  /** Every scene in the what-if or the base, in the what-if's order (deleted ones where they were). */
  scenes: SceneState[];
  byId: Map<string, SceneState>;
}

export function compareScenes(input: {
  base: readonly ScriptBlock[];
  whatIf: readonly ScriptBlock[];
  main: readonly ScriptBlock[];
  sent?: Readonly<Record<string, SentScene>>;
}): Comparison {
  const sent = input.sent ?? {};
  const base = scenesOfBlocks(input.base);
  const wi = scenesOfBlocks(input.whatIf);
  const main = scenesOfBlocks(input.main);
  const B = new Map(base.map((s) => [s.id, s]));
  const W = new Map(wi.map((s) => [s.id, s]));
  const M = new Map(main.map((s) => [s.id, s]));
  const wiOrder = wi.map((s) => s.id);
  const prevInWi = new Map(wiOrder.map((id, i) => [id, i ? wiOrder[i - 1]! : null]));
  const stayedWi = stayedInOrder(
    base.map((s) => s.id),
    wiOrder,
  );
  const stayedMain = stayedInOrder(
    base.map((s) => s.id),
    main.map((s) => s.id),
  );

  const states = new Map<string, SceneState>();
  const classify = (id: string): SceneState => {
    const w = W.get(id);
    const b = B.get(id);
    const m = M.get(id);
    const wh = w?.hash ?? null;
    const mh = m?.hash ?? null;
    const heading = (w ?? b ?? m)!.heading;
    let status: SceneStatus;
    let change: SceneChange | null = null;
    const record = sent[id];
    if (record) {
      // Sent from this what-if: compare with what was sent, not the fork.
      const sh = record.blocks ? sceneHash(record.blocks) : null;
      const movedSince = !!w && prevInWi.get(id) !== record.prev;
      if (wh === sh && !movedSince) status = 'sent';
      else {
        change = !w ? 'deleted' : !sh ? 'added' : wh !== sh ? 'edited' : 'moved';
        status = mh === sh ? 'differs' : 'conflict';
      }
    } else {
      const bh = b?.hash ?? null;
      const moved = !!w && !!b && !stayedWi.has(id);
      if (wh === bh && !moved) status = 'same';
      else {
        change = !w ? 'deleted' : !b ? 'added' : wh !== bh ? 'edited' : 'moved';
        const mainMoved = !!m && !!b && !stayedMain.has(id);
        if (mh === wh && !(moved || mainMoved)) status = change === 'deleted' ? 'same' : 'sent';
        else if (!w && !m)
          status = 'same'; // deleted on both sides
        else status = mh === bh && !mainMoved ? 'differs' : 'conflict';
        // A scene main already matches (made the same change) needs nothing sent.
        if (status === 'sent' && !record) status = 'same';
      }
    }
    return {
      id,
      heading,
      status,
      change: status === 'same' ? null : change,
      group: [id],
      inWhatIf: !!w,
    };
  };

  // In the what-if's order, with deleted scenes placed after the scene that preceded them in the base.
  const order: string[] = [...wiOrder];
  base.forEach((s, i) => {
    if (W.has(s.id)) return;
    let at = -1;
    for (let k = i - 1; k >= 0 && at < 0; k--) at = order.indexOf(base[k]!.id);
    order.splice(at + 1, 0, s.id);
  });
  for (const id of order) states.set(id, classify(id));

  // Splits and combines: scenes that share a line between the base and the what-if travel together.
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(a, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of order) parent.set(id, id);
  const sceneOfBlock = new Map<string, string>();
  for (const s of base) for (const blk of s.blocks) sceneOfBlock.set(blk.id, s.id);
  for (const s of wi)
    for (const blk of s.blocks) {
      const from = sceneOfBlock.get(blk.id);
      if (from && from !== s.id && states.has(from)) union(from, s.id);
    }
  const groups = new Map<string, string[]>();
  for (const id of order) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  for (const ids of groups.values()) {
    const changed = ids.filter((id) => {
      const st = states.get(id)!.status;
      return st === 'differs' || st === 'conflict';
    });
    if (changed.length < 2) continue;
    // The group is as amber as its most cautious member.
    const conflict = changed.some((id) => states.get(id)!.status === 'conflict');
    for (const id of changed) {
      const s = states.get(id)!;
      s.group = changed;
      if (conflict && s.status === 'differs') s.status = 'conflict';
    }
  }
  const scenes = order.map((id) => states.get(id)!);
  return { scenes, byId: states };
}

/** Scenes that have something to send: blue or amber. */
export const pendingScenes = (c: Comparison) =>
  c.scenes.filter((s) => s.status === 'differs' || s.status === 'conflict');

// ---- Sending ----

/**
 * Main's lines after sending `ids` (and their groups) from the what-if: each sent scene takes
 * the what-if's version, at the place it has in the what-if; deleted ones go; lines that moved
 * into a sent scene from elsewhere are taken out of where main had them.
 */
export function planSend(
  ids: readonly string[],
  whatIf: readonly ScriptBlock[],
  main: readonly ScriptBlock[],
): ScriptBlock[] {
  const send = new Set(ids);
  const wi = scenesOfBlocks(whatIf);
  const wiScenes = wi.filter((s) => send.has(s.id));
  const incoming = new Set(wiScenes.flatMap((s) => s.blocks.map((b) => b.id)));
  // Main without the sent scenes and without any line that's arriving with them.
  let out: Scene[] = scenesOfBlocks(main)
    .filter((s) => !send.has(s.id))
    .map((s) => ({ ...s, blocks: s.blocks.filter((b) => !incoming.has(b.id)) }))
    .filter((s) => s.blocks.length);
  // Each sent scene goes after the nearest scene before it in the what-if that main has.
  for (const s of wiScenes) {
    const i = wi.indexOf(s);
    let at = -1;
    for (let k = i - 1; k >= 0 && at < 0; k--) at = out.findIndex((o) => o.id === wi[k]!.id);
    // The opening (lines before any heading) always stays first.
    if (at < 0 && s.id !== OPENING && out[0]?.id === OPENING) at = 0;
    out = [...out.slice(0, at + 1), s, ...out.slice(at + 1)];
  }
  return out.flatMap((s) => s.blocks);
}

/** What a send records in the what-if, for each scene it sent. */
export function sentRecords(
  ids: readonly string[],
  whatIf: readonly ScriptBlock[],
): Record<string, SentScene> {
  const wi = scenesOfBlocks(whatIf);
  const out: Record<string, SentScene> = {};
  for (const id of ids) {
    const i = wi.findIndex((s) => s.id === id);
    out[id] =
      i < 0
        ? { blocks: null, prev: null }
        : { blocks: wi[i]!.blocks, prev: i ? wi[i - 1]!.id : null };
  }
  return out;
}

// ---- Phrase-level diff ----

export type DiffPart = { op: 'same' | 'ins' | 'del'; text: string };

const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

/**
 * A word diff (Myers' LCS over words and spaces), with neighbouring changes merged into phrases:
 * "It is already too late" over "We can still fix this" reads as one replaced phrase, not five.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const raw: DiffPart[] = [];
  const push = (op: DiffPart['op'], text: string) => {
    const last = raw[raw.length - 1];
    if (last && last.op === op) last.text += text;
    else raw.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) push('ins', b[j++]!);
    else push('del', a[i++]!);
  }
  // A lone space between two changes joins them into one phrase.
  const out: DiffPart[] = [];
  for (let k = 0; k < raw.length; k++) {
    const p = raw[k]!;
    const prev = raw[k - 1];
    const next = raw[k + 1];
    if (
      p.op === 'same' &&
      /^\s+$/.test(p.text) &&
      prev &&
      next &&
      prev.op !== 'same' &&
      next.op !== 'same'
    ) {
      out.push({ op: 'del', text: p.text }, { op: 'ins', text: p.text });
      continue;
    }
    out.push({ ...p });
  }
  // Gather each run of changes into one deletion then one insertion.
  const merged: DiffPart[] = [];
  for (let k = 0; k < out.length;) {
    if (out[k]!.op === 'same') {
      merged.push(out[k++]!);
      continue;
    }
    let del = '';
    let ins = '';
    while (k < out.length && out[k]!.op !== 'same') {
      if (out[k]!.op === 'del') del += out[k]!.text;
      else ins += out[k]!.text;
      k++;
    }
    if (del) merged.push({ op: 'del', text: del });
    if (ins) merged.push({ op: 'ins', text: ins });
  }
  return merged;
}
