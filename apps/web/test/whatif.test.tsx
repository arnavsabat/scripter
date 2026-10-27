// What-ifs end to end (SPEC 3.6, 3.9; D-080) in real Chromium, against the fake API and a real
// sync server: concurrency at the document level (two writers sending at once, a co-writer typing
// during a send, undo scope), then the flow in the app as the prototype has it.
import { planSend, type ScriptBlock } from '@wr/schema';
import { SyncClient, type SocketLike } from '@wr/shared';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import * as Y from 'yjs';
import '@wr/shared/tokens.css';
import 'prosemirror-view/style/prosemirror.css';
import '../src/base.css';
import { reloadAuthForTests } from '../src/auth';
import { Root } from '../src/Root';
import { navigate } from '../src/router';
import { blocksOfYDoc, writeBlocks } from '../src/whatif/docs';
import { MOD, newEpisode, seed, session } from './helpers';

const SYNC = 'ws://127.0.0.1:4787';
const until = async (check: () => unknown, ms = 8000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const toast = () => text($('.toast.show'));
let tags = 0;
const clickEl = async (el: Element, x = 4, y = 4) => {
  const t = `w${++tags}`;
  el.setAttribute('data-test-target', t);
  await commands.clickAt(`[data-test-target="${t}"]`, x, y);
};
const clickText = async (sel: string, label: string) => {
  await until(() => $$(sel).some((e) => text(e).startsWith(label)), 5000);
  await clickEl($$(sel).find((e) => text(e).startsWith(label))!);
};

/** A connection to a document on the sync server, as a co-writer would have. */
async function open(docId: string, name = 'Sam') {
  const doc = new Y.Doc();
  const client = new SyncClient({
    serverUrl: SYNC,
    docId,
    token: session(name, docId).token,
    doc,
    socket: (url) => new WebSocket(url) as unknown as SocketLike,
  });
  await client.whenSynced();
  return { doc, client, blocks: () => blocksOfYDoc(doc) };
}

const SCRIPT: { type: ScriptBlock['type']; text: string }[] = [
  { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT' },
  { type: 'action', text: 'Mara stares at the sink.' },
  { type: 'scene_heading', text: 'EXT. HARBOR - NIGHT' },
  { type: 'action', text: 'Fog rolls in.' },
  { type: 'scene_heading', text: 'INT. OFFICE - DAY' },
  { type: 'action', text: 'Phones ring.' },
];
const withText = (blocks: ScriptBlock[], from: string, to: string) =>
  blocks.map((b) => (b.text === from ? { ...b, text: to } : b));

describe('sending, at the document level (real sync server)', () => {
  it('two writers sending different scenes at once: both land in main', async () => {
    const ep = newEpisode();
    await seed(ep, SCRIPT);
    const [maya, sam] = [await open(ep, 'Maya'), await open(ep, 'Sam')];
    const base = maya.blocks();
    // Each has a what-if with one scene rewritten; both send at the same moment.
    const mayaWhatIf = withText(base, 'Mara stares at the sink.', 'Mara smashes the plate.');
    const samWhatIf = withText(base, 'Phones ring.', 'Phones ring and ring.');
    const kitchen = base[0]!.sceneId!;
    const office = base[4]!.sceneId!;
    writeBlocks(maya.doc, planSend([kitchen], mayaWhatIf, maya.blocks()), { send: 1 });
    writeBlocks(sam.doc, planSend([office], samWhatIf, sam.blocks()), { send: 2 });
    await Promise.all([maya.client.whenSynced(), sam.client.whenSynced()]);
    await until(() => JSON.stringify(maya.blocks()) === JSON.stringify(sam.blocks()));
    expect(maya.blocks().map((b) => b.text)).toEqual([
      'INT. KITCHEN - NIGHT',
      'Mara smashes the plate.',
      'EXT. HARBOR - NIGHT',
      'Fog rolls in.',
      'INT. OFFICE - DAY',
      'Phones ring and ring.',
    ]);
    maya.client.destroy();
    sam.client.destroy();
  });

  it('a co-writer typing in main during a send keeps their typing; undo reverts only the send', async () => {
    const ep = newEpisode();
    await seed(ep, [...SCRIPT, { type: 'action', text: 'The kettle whistles.' }]);
    const [sender, cowriter] = [await open(ep, 'Maya'), await open(ep, 'Sam')];
    const base = sender.blocks();
    const kitchen = base[0]!.sceneId!;
    // The co-writer adds to a kitchen line the send doesn't change, and to the harbor scene...
    const kettle = cowriter.doc.getXmlFragment('script').get(6) as Y.XmlElement;
    const fog = cowriter.doc.getXmlFragment('script').get(3) as Y.XmlElement;
    // (the kettle line belongs to the office scene in SCRIPT order; use the kitchen's own line)
    void kettle;
    // ...while the send rewrites the kitchen's first line.
    const whatIf = withText(base, 'Mara stares at the sink.', 'Mara smashes the plate.');
    const origin = { send: kitchen };
    const undo = new Y.UndoManager(sender.doc.getXmlFragment('script'), {
      trackedOrigins: new Set([origin]),
      captureTimeout: 0,
    });
    writeBlocks(sender.doc, planSend([kitchen], whatIf, sender.blocks()), origin);
    (fog.get(0) as Y.XmlText).insert('Fog rolls in.'.length, ' Thick.');
    await Promise.all([sender.client.whenSynced(), cowriter.client.whenSynced()]);
    await until(() => JSON.stringify(sender.blocks()) === JSON.stringify(cowriter.blocks()));
    expect(sender.blocks().map((b) => b.text)).toContain('Mara smashes the plate.');
    expect(sender.blocks().map((b) => b.text)).toContain('Fog rolls in. Thick.');
    // Undo: the kitchen goes back; the co-writer's harbor edit stays.
    undo.undo();
    await sender.client.whenSynced();
    await until(() => JSON.stringify(sender.blocks()) === JSON.stringify(cowriter.blocks()));
    expect(cowriter.blocks().map((b) => b.text)).toEqual([
      'INT. KITCHEN - NIGHT',
      'Mara stares at the sink.',
      'EXT. HARBOR - NIGHT',
      'Fog rolls in. Thick.',
      'INT. OFFICE - DAY',
      'Phones ring.',
      'The kettle whistles.',
    ]);
    sender.client.destroy();
    cowriter.client.destroy();
  });

  it('a co-writer typing in the very scene being sent keeps the lines the send didn’t change', async () => {
    const ep = newEpisode();
    await seed(ep, [
      { type: 'scene_heading', text: 'INT. KITCHEN - NIGHT' },
      { type: 'action', text: 'Mara stares at the sink.' },
      { type: 'action', text: 'Rain on the window.' },
    ]);
    const [sender, cowriter] = [await open(ep, 'Maya'), await open(ep, 'Sam')];
    const base = sender.blocks();
    const rain = cowriter.doc.getXmlFragment('script').get(2) as Y.XmlElement;
    (rain.get(0) as Y.XmlText).insert('Rain on the window.'.length, ' Thunder.');
    const whatIf = withText(base, 'Mara stares at the sink.', 'Mara smashes the plate.');
    writeBlocks(sender.doc, planSend([base[0]!.sceneId!], whatIf, sender.blocks()), {});
    await Promise.all([sender.client.whenSynced(), cowriter.client.whenSynced()]);
    await until(() => JSON.stringify(sender.blocks()) === JSON.stringify(cowriter.blocks()));
    expect(sender.blocks().map((b) => b.text)).toEqual([
      'INT. KITCHEN - NIGHT',
      'Mara smashes the plate.',
      'Rain on the window. Thunder.',
    ]);
    sender.client.destroy();
    cowriter.client.destroy();
  });
});

// ---- The flow in the app ----

const mounted: { root: ReactRoot; host: HTMLElement }[] = [];
const testPage = location.pathname + location.search;

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

/** Signs in as Arnav, puts SCRIPT in an episode's main, and opens it. */
async function openEpisode(series: string, episode: string) {
  await fetch('/__fake/login', {
    method: 'POST',
    body: JSON.stringify({ name: 'Arnav', room: true }),
  });
  const token = (
    (await (await fetch('/api/auth/refresh', { method: 'POST' })).json()) as { accessToken: string }
  ).accessToken;
  const call = async <T,>(path: string) =>
    (await (await fetch(path, { headers: { authorization: `Bearer ${token}` } })).json()) as T;
  const home = await call<{ series: { name: string; episodes: { id: string; name: string }[] }[] }>(
    '/api/home',
  );
  const ep = home.series.find((s) => s.name === series)!.episodes.find((e) => e.name === episode)!;
  const { draftId } = await call<{ draftId: string }>(`/api/episodes/${ep.id}`);
  await seed(draftId, SCRIPT);
  navigate(`/e/${ep.id}`, { replace: true });
  reloadAuthForTests();
  const host = document.createElement('div');
  host.style.height = '100vh';
  document.body.append(host);
  const root = createRoot(host);
  root.render(<Root syncUrls={SYNC} />);
  mounted.push({ root, host });
  await until(() => $$('.layer:not(.off) .script > p.el').length === SCRIPT.length);
  return { episodeId: ep.id, mainDraftId: draftId };
}
const paras = () => $$('.layer:not(.off) .script > p.el');
const switcher = () => text($('.layer:not(.off) .toolbar .sw'));
const sceneRows = () => $$('.layer:not(.off) .left .list .row').map(text);
/** Clicks at the end of a line of the script. */
async function clickEnd(i: number) {
  const p = paras()[i]!;
  const r = document.createRange();
  r.selectNodeContents(p);
  const last = [...r.getClientRects()].at(-1)!;
  const box = p.getBoundingClientRect();
  // A selector, not a tag: ProseMirror removes attributes it didn't put on its own lines.
  await commands.clickAt(
    `.layer:not(.off) .script > p:nth-of-type(${i + 1})`,
    last.right - box.left + 1,
    last.top - box.top + 8,
  );
}

describe('what-ifs in the app (prototype v2)', () => {
  it('fork, edit, the dot, ⌘↵ to send, Sent ✓, Undo; amber opens Compare; Review all; Changes', async () => {
    const { mainDraftId } = await openEpisode('Harbor Lights', 'Pilot');
    expect(switcher()).toBe('Main ▾');

    // + New what-if from the Drafts tab: a copy of main, as "Main › Untitled what-if".
    await clickText('.layer:not(.off) .tabs .ta', 'Drafts');
    await clickText('.layer:not(.off) .left .ta', '+ New what-if');
    await until(() => /\/w\/[0-9a-f-]{36}$/.test(location.pathname));
    await until(() => switcher() === 'Main › Untitled what-if ▾');
    await until(() => paras().length === SCRIPT.length);
    expect(paras().map((p) => p.textContent)).toEqual(SCRIPT.map((b) => b.text));
    await clickText('.layer:not(.off) .tabs .ta', 'Scenes');
    expect($$('.layer:not(.off) .left .list .nd')).toHaveLength(0);
    expect(text($('.layer:not(.off) .legend')).replace(/\s+/g, ' ')).toBe(
      '● differs from main ● main changed too',
    );

    // Rewrite the kitchen: its dot (blue) and the navigator's ● appear.
    await clickEnd(1);
    await userEvent.keyboard(' Then she smashes a plate.');
    await until(() => $('.layer:not(.off) .dot.blue'));
    expect($$('.layer:not(.off) .left .list .nd.blue')).toHaveLength(1);

    // Meanwhile a co-writer changes the harbor in main, and the what-if changes it too: amber.
    const main = await open(mainDraftId, 'Sam');
    writeBlocks(
      main.doc,
      withText(main.blocks(), 'Fog rolls in.', 'Fog rolls in, thick and cold.'),
      {},
    );
    // ...recording who changed it, as main's editor does (whatif/sceneEdits.ts).
    const harbor = main.blocks().find((b) => b.text === 'EXT. HARBOR - NIGHT')!.sceneId!;
    main.doc.getMap('sceneEdits').set(harbor, { by: 'Sam', at: Date.now() });
    await main.client.whenSynced();
    await clickEnd(3);
    await userEvent.keyboard(' A foghorn.');
    await until(() => $('.layer:not(.off) .dot.amber'));

    // ⌘↵ in the kitchen sends it: the heading pulses, "Sent ✓", the toast with Undo, main has it.
    await clickEnd(1);
    await userEvent.keyboard(`{${MOD}>}{Enter}{/${MOD}}`);
    await until(() => toast() === '“Kitchen – Night” sent to mainUndo');
    expect($('.layer:not(.off) .el.pulse')).toBeTruthy();
    await until(() => sceneRows().some((r) => r === 'Kitchen – NightSent ✓'));
    await until(() =>
      main.blocks().some((b) => b.text === 'Mara stares at the sink. Then she smashes a plate.'),
    );
    // The co-writer's harbor change is untouched by the send.
    expect(main.blocks().map((b) => b.text)).toContain('Fog rolls in, thick and cold.');

    // Undo reverts only the kitchen.
    await clickText('.toast.show button', 'Undo');
    await until(() => toast() === 'Send undone');
    await until(() => main.blocks().some((b) => b.text === 'Mara stares at the sink.'));
    expect(main.blocks().map((b) => b.text)).toContain('Fog rolls in, thick and cold.');
    await until(() => $$('.layer:not(.off) .dot.blue').length === 1);

    // The amber harbor: Send to main from its dot opens Compare first.
    await clickEl($('.layer:not(.off) .dot.amber')!, 5, 5);
    await clickText('.layer:not(.off) .menu.pop .mi', 'Send to main');
    await until(() => toast() === 'Main changed this scene too, so compare it first');
    await until(() => $('.layer:not(.off) .app.right-open .rp'));
    expect(text($('.layer:not(.off) .rp .rh b'))).toBe('Main’s version');
    expect(text($('.layer:not(.off) .rp .rh small'))).toMatch(/^Harbor – Night · changed by Sam, /);
    expect(text($('.layer:not(.off) .rp .pv ins'))).toBe('in, thick and cold.');
    expect(text($('.layer:not(.off) .rp .note'))).toBe(
      'Highlights show what Sam added since this what-if began.',
    );
    await clickText('.layer:not(.off) .rp .pb', 'Send mine to main');
    await until(() => main.blocks().some((b) => b.text === 'Fog rolls in. A foghorn.'));
    await until(
      () => text($('.layer:not(.off) .rp .empty')) === 'This scene was sent. It matches main now.',
    );
    await userEvent.keyboard('{Escape}');
    await until(() => !$('.layer:not(.off) .app.right-open'));

    // Changes: what the what-if changed, highlighted in the kitchen.
    await commands.clickAt('.layer:not(.off) button[aria-label="Show changes from main"]', 10, 10);
    await until(() => text($('.layer:not(.off) .chg-ins')) === 'Then she smashes a plate.');

    // Review all: the kitchen checked; send it.
    await commands.clickAt('.layer:not(.off) button[aria-label="Review all changes"]', 10, 10);
    await until(() => $('.layer:not(.off) .menu.rv'));
    expect(text($('.layer:not(.off) .menu.rv .lab'))).toBe('SEND TO MAIN');
    expect($$('.layer:not(.off) .menu.rv .rvr').map(text)).toEqual(['●Kitchen – Night✓']);
    await clickText('.layer:not(.off) .menu.rv .mi.send', 'Send 1 scene');
    await until(() => toast().startsWith('“Kitchen – Night” sent to main'));
    await commands.clickAt('.layer:not(.off) button[aria-label="Review all changes"]', 10, 10);
    await until(() => text($('.layer:not(.off) .menu.rv .mi')) === 'Everything’s in main');

    // The switcher lists both drafts, with ✓ on this one; main is one click away.
    await commands.clickAt('.layer:not(.off) .toolbar .sw', 10, 10);
    await until(() => $$('.layer:not(.off) .menu[aria-label="Drafts"] .mi').length === 2);
    await clickText('.layer:not(.off) .menu[aria-label="Drafts"] .mi', 'Main');
    await until(() => switcher() === 'Main ▾');
    await until(() =>
      paras().some((p) => p.textContent === 'Mara stares at the sink. Then she smashes a plate.'),
    );
    main.client.destroy();
  }, 90_000);

  it('re-editing a sent scene brings its dot back; undoing after main changed it asks first', async () => {
    const { mainDraftId } = await openEpisode('Harbor Lights', 'Pilot');
    await clickText('.layer:not(.off) .tabs .ta', 'Drafts');
    await clickText('.layer:not(.off) .left .ta', '+ New what-if');
    await until(() => switcher() === 'Main › Untitled what-if ▾');
    await until(() => paras().length === SCRIPT.length);
    await clickEnd(1);
    await userEvent.keyboard(' Then she smashes a plate.');
    await until(() => $('.layer:not(.off) .dot.blue'));
    await userEvent.keyboard(`{${MOD}>}{Enter}{/${MOD}}`);
    await until(() => toast().startsWith('“Kitchen – Night” sent to main'));
    await until(() => !$('.layer:not(.off) .dot'));
    // A co-writer changes the sent kitchen in main...
    const main = await open(mainDraftId, 'Sam');
    await until(() => main.blocks().some((b) => b.text.endsWith('Then she smashes a plate.')));
    writeBlocks(
      main.doc,
      withText(
        main.blocks(),
        'Mara stares at the sink. Then she smashes a plate.',
        'Mara stares. Then she smashes a plate.',
      ),
      {},
    );
    await main.client.whenSynced();
    // ...so Undo asks before reverting.
    await clickText('.toast.show button', 'Undo');
    await until(() =>
      toast().startsWith(
        '“Kitchen – Night” has changed in main since you sent it. Undo the send anyway?',
      ),
    );
    await clickText('.toast.show button', 'Keep');
    expect(main.blocks().map((b) => b.text)).toContain('Mara stares. Then she smashes a plate.');
    // Editing the sent scene again in the what-if: the dot comes back (amber: main changed it since).
    await clickEnd(1);
    await userEvent.keyboard(' Twice.');
    await until(() => $('.layer:not(.off) .dot.amber'));
    main.client.destroy();
  }, 90_000);

  it('rename a what-if by clicking its name; delete it with × and an inline confirm', async () => {
    await openEpisode('Harbor Lights', 'Pilot');
    await clickText('.layer:not(.off) .tabs .ta', 'Drafts');
    await clickText('.layer:not(.off) .left .ta', '+ New what-if');
    await until(() => switcher() === 'Main › Untitled what-if ▾');
    // Click the name (not "Main ›" or ▾): an inline field.
    await clickEl($('.layer:not(.off) .toolbar .sw .wn')!, 5, 5);
    await until(() => $('.layer:not(.off) .toolbar input.wn'));
    await userEvent.fill(
      $<HTMLInputElement>('.layer:not(.off) .toolbar input.wn')!,
      'Darker ending',
    );
    await userEvent.keyboard('{Enter}');
    await until(() => switcher() === 'Main › Darker ending ▾');
    await until(() =>
      $$('.layer:not(.off) .left .row.big').some((r) => text(r).startsWith('Darker ending')),
    );
    // Clicking "Main ›" still opens the menu.
    await commands.clickAt('.layer:not(.off) .toolbar .sw', 4, 8);
    await until(
      () =>
        $$('.layer:not(.off) .menu[aria-label="Drafts"] .mi').map(text).join('|') ===
        'Main|Darker ending✓',
    );
    await userEvent.keyboard('{Escape}');
    // Delete it from its row: back on main, and gone from the list.
    await clickEl($('.layer:not(.off) .left .row.big.hasx .rx')!, 6, 6);
    await until(
      () => text($('.layer:not(.off) .left .cfq')) === 'Delete “Darker ending” for everyone?',
    );
    await clickText('.layer:not(.off) .left .cfa .ta', 'Delete');
    await until(() => toast() === '“Darker ending” deleted');
    await until(() => switcher() === 'Main ▾');
    await until(
      () => !$$('.layer:not(.off) .left .row.big').some((r) => text(r).startsWith('Darker ending')),
    );
  }, 60_000);

  it('a viewer can open a what-if’s drafts list but not start one or take a snapshot', async () => {
    await openEpisode('Harbor Lights', 'Low Tide');
    await clickText('.layer:not(.off) .tabs .ta', 'Drafts');
    await until(() => text($('.layer:not(.off) .left .row.big')).startsWith('Main'));
    expect($$('.layer:not(.off) .left .ta').map(text)).not.toContain('+ New what-if');
    expect($$('.layer:not(.off) .left .ta').map(text)).not.toContain('+ Snapshot');
  }, 30_000);

  it('+ Snapshot, then restore it from the Drafts tab: a restore point first, then the old version', async () => {
    await openEpisode('Harbor Lights', 'Pilot');
    await clickText('.layer:not(.off) .tabs .ta', 'Drafts');
    await clickText('.layer:not(.off) .left .ta', '+ Snapshot');
    await until(() => $$('.layer:not(.off) .snap').some((s) => text(s).startsWith('Snapshot')));
    expect(text($$('.layer:not(.off) .snap')[0])).toMatch(/^Snapshotjust now · you$/);
    // Change the script, then restore.
    await clickEnd(1);
    await userEvent.keyboard(' Changed after the snapshot.');
    await clickEl($$('.layer:not(.off) .snap').find((s) => text(s).startsWith('Snapshot'))!);
    await until(() => text($('.layer:not(.off) .snap.cf .cfq')).startsWith('Restore “Snapshot”?'));
    await clickText('.layer:not(.off) .snap.cf .ta', 'Restore');
    await until(() => toast() === 'Restored “Snapshot”Undo');
    await until(() => paras()[1]!.textContent === 'Mara stares at the sink.');
    await until(() =>
      $$('.layer:not(.off) .snap').some((s) => text(s).startsWith('Before restoring “Snapshot”')),
    );
    // Undo brings the change back.
    await clickText('.toast.show button', 'Undo');
    await until(
      () => paras()[1]!.textContent === 'Mara stares at the sink. Changed after the snapshot.',
    );
  }, 60_000);
});
