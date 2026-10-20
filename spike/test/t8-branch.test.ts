// Test 8: fork the doc, edit both copies, render a snapshot diff, then copy one scene's changes
// into main as ordinary edits. The what-if is its own Y.Doc; the two histories are never merged.
import { afterEach, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import * as Y from 'yjs';
import { blocksOf, createClient, posIn, type Client } from '../src/editor';
import { sceneStatus, scenesOf, sendScene, wordDiffHtml } from '../src/scenes';
import type { BlockSpec } from '../src/schema';
import { converged, evidence, room, sleep, texts, undoKeys, VARIANTS, type Room } from './helpers';

const SCRIPT: BlockSpec[] = [
  { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT' },
  { type: 'action', text: 'Rain hammers the window. MARA grips the counter.' },
  { type: 'character', text: 'MARA' },
  { type: 'dialogue', text: 'We can still fix this.' },
  { type: 'scene_heading', text: 'EXT. HARBOR - DAWN' },
  { type: 'action', text: 'Fog lifts off the water. DEV waits on the pier.' },
  { type: 'character', text: 'DEV' },
  { type: 'dialogue', text: 'She is not coming.' },
  { type: 'scene_heading', text: 'INT. OFFICE - DAY' },
  { type: 'action', text: 'Charts pinned edge to edge.' },
];

let r: Room | undefined;
let w: Client | undefined;
afterEach(() => {
  w?.destroy();
  r?.destroy();
});

/** Replaces the whole text of block `index` (a writer retyping a line). */
function retype(c: Client, index: number, text: string) {
  const from = posIn(c, index, 0);
  const to = posIn(c, index, 'end');
  c.view.dispatch(c.view.state.tr.insertText(text, from, to));
}
function append(c: Client, index: number, text: string) {
  c.view.dispatch(c.view.state.tr.insertText(text, posIn(c, index, 'end')));
}

/** Main has two clients (A, B) on the network; the what-if W is a fork with no connection to main. */
function forkWhatIf(rm: Room) {
  const snapshot = Y.encodeStateAsUpdate(rm.a.ydoc); // what S3 would hold
  const base = blocksOf(rm.a); // the snapshot's content, used for three-way comparison
  const wDoc = new Y.Doc();
  Y.applyUpdate(wDoc, snapshot);
  const client = createClient({ name: 'W', kit: rm.kit, ydoc: wDoc, mount: rm.stage });
  return { client, base, snapshotBytes: snapshot.byteLength };
}

describe.each(VARIANTS)('Test 8: what-if branch and Send to main (%s)', (variant) => {
  it('fork, edit both, diff per scene, send one scene, undo the send', async () => {
    r = room(variant, SCRIPT);
    const fork = forkWhatIf(r);
    w = fork.client;

    // What-if edits: rewrite Mara's line (scene 1) and add to the harbor action (scene 2).
    retype(w, 3, 'It is already too late.');
    append(w, 5, ' A gull circles overhead.');
    // Main edits by B: the harbor action (scene 2, so a conflict) and the office (scene 3, main only).
    append(r.b, 5, ' He is soaked.');
    append(r.b, 9, ' A radio crackles.');
    await r.net.settle();

    const status = sceneStatus(fork.base, blocksOf(r.a), blocksOf(w));
    const kitchenMain = scenesOf(blocksOf(r.a))[0]!;
    const kitchenWi = scenesOf(blocksOf(w))[0]!;
    const diff = kitchenWi.blocks.map((blk, i) =>
      wordDiffHtml(kitchenMain.blocks[i]!.text, blk.text),
    );
    const rendered = document.createElement('div');
    rendered.innerHTML = diff.map((d) => `<p>${d}</p>`).join('');
    document.body.appendChild(rendered);

    expect(status).toEqual({
      'INT. KITCHEN - NIGHT': 'differs',
      'EXT. HARBOR - DAWN': 'conflict',
      'INT. OFFICE - DAY': 'same',
    });
    expect(rendered.querySelectorAll('ins').length).toBeGreaterThan(0);
    expect(rendered.querySelector('del')?.textContent).toContain('We');

    // Send the kitchen scene to main from client A, while B is typing in the office scene.
    r.net.goOffline();
    sendScene(r.a, kitchenWi);
    append(r.b, 9, ' Nobody answers.');
    r.net.reconnect();
    await sleep(5);
    await r.net.settle();
    const mainAfterSend = texts(r.b);
    const statusAfter = sceneStatus(fork.base, blocksOf(r.a), blocksOf(w));

    expect(converged(r)).toBe(true);
    expect(mainAfterSend[3]).toBe('It is already too late.');
    expect(mainAfterSend[9]).toBe('Charts pinned edge to edge. A radio crackles. Nobody answers.');
    expect(statusAfter['INT. KITCHEN - NIGHT']).toBe('same'); // the dot would disappear
    expect(statusAfter['EXT. HARBOR - DAWN']).toBe('conflict');

    // One undo on A reverts only the sent scene; B's later edit in the office survives.
    await undoKeys(r.a);
    await r.net.settle();
    const mainAfterUndo = texts(r.b);
    expect(converged(r)).toBe(true);
    expect(mainAfterUndo[3]).toBe('We can still fix this.');
    expect(mainAfterUndo[9]).toBe('Charts pinned edge to edge. A radio crackles. Nobody answers.');

    // The histories never merged: main has no items from W's client, and W has none from main's.
    const svMain = Y.decodeStateVector(Y.encodeStateVector(r.a.ydoc));
    const svW = Y.decodeStateVector(Y.encodeStateVector(w.ydoc));
    const histories = {
      mainHasWhatIfItems: svMain.has(w.ydoc.clientID),
      whatIfHasBsItems: svW.has(r.b.ydoc.clientID),
    };
    expect(histories).toEqual({ mainHasWhatIfItems: false, whatIfHasBsItems: false });

    evidence('8-branch', {
      variant,
      snapshotBytes: fork.snapshotBytes,
      statusBeforeSend: status,
      kitchenDiffHtml: diff,
      mainAfterSend: mainAfterSend.slice(0, 4),
      statusAfterSend: statusAfter,
      mainAfterUndo: mainAfterUndo.slice(0, 4),
      officeLineAfterUndo: mainAfterUndo[9],
      histories,
    });
    rendered.remove();
  });

  it('send lands while a co-writer is typing inside the same scene in main', async () => {
    r = room(variant, SCRIPT);
    const fork = forkWhatIf(r);
    w = fork.client;
    retype(w, 3, 'It is already too late.');
    const wiKitchen = scenesOf(blocksOf(w))[0]!;

    r.net.goOffline();
    // B is typing in the kitchen action line, the same scene that's about to be sent.
    r.b.view.dispatch(
      r.b.view.state.tr.setSelection(
        TextSelection.create(r.b.view.state.doc, posIn(r.b, 1, 'end')),
      ),
    );
    r.b.view.dispatch(r.b.view.state.tr.insertText(' Thunder.'));
    sendScene(r.a, wiKitchen);
    r.net.reconnect();
    await sleep(5);
    await r.net.settle();
    const t = texts(r.a);
    evidence('8-send-during-typing', { variant, kitchen: t.slice(0, 4) });
    expect(converged(r)).toBe(true);
    expect(t[3]).toBe('It is already too late.');
    // The co-writer's concurrent typing in an unchanged line of the sent scene survives.
    expect(t[1]).toBe('Rain hammers the window. MARA grips the counter. Thunder.');
  });
});
