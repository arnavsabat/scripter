// A what-if session (SPEC 3.9, D-080): beside the what-if being edited, a live copy of main (its
// own sync connection, read for the comparison and written by Send to main) and the base snapshot
// it was forked from. The three-way comparison reruns whenever either document changes.
//
// Send to main is an ordinary edit in main: its new lines are written with y-prosemirror's diff, in
// a transaction with this send's own origin, so a Yjs UndoManager scoped to that origin undoes
// exactly this send and nothing anyone typed after it. A restore point is saved first.
import {
  compareScenes,
  pendingScenes,
  planSend,
  sceneName,
  scenesOfBlocks,
  scriptBlocks,
  sentRecords,
  type Comparison,
  type ScriptBlock,
  type SentScene,
} from '@wr/schema';
import { SyncClient, type SocketLike } from '@wr/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { ScriptEditor } from '../editor/createEditor';
import { blocksOfState, blocksOfYDoc, fragmentOf, writeBlocks } from './docs';
import { createSnapshot, reportScenesDiffer, snapshotState } from './drafts';
import { sceneEditsOf, type SceneEdit } from './sceneEdits';

export interface WhatIfInfo {
  id: string;
  name: string;
  baseSnapshotId: string;
  mainDraftId: string;
}

interface SendRecord {
  undo: Y.UndoManager;
  ids: string[];
  /** The what-if's send records before this send, to put back on Undo. */
  before: Record<string, SentScene | undefined>;
  /** Main's scene hashes right after the send, to notice edits made since. */
  after: Map<string, string>;
}

export const sentOf = (ydoc: Y.Doc) => ydoc.getMap<SentScene>('sent');

export interface WhatIfSession {
  /** Null until main and the base have loaded. */
  comparison: Comparison | null;
  /** What each scene is compared against: what was sent, or the base. */
  baseFor: (sceneId: string) => ScriptBlock[] | null;
  mainScene: (sceneId: string) => ScriptBlock[] | null;
  lastEdit: (sceneId: string) => SceneEdit | null;
  /** Who's in main right now. */
  mainPeople: string[];
  /** Main's whole state, for forking another what-if from it. */
  mainState: () => Uint8Array | null;
  send: (ids: string[]) => Promise<{ sent: string[]; names: string[] }>;
  /** Undoes the latest send; "edited" means main changed those scenes since (ask first). */
  undoCheck: () => 'none' | 'clean' | 'edited';
  undoSend: () => void;
}

export function useWhatIf(opts: {
  info: WhatIfInfo | null;
  editor: ScriptEditor | null;
  serverUrl: string | readonly string[];
  token: string | (() => Promise<string>);
  me: string;
}): WhatIfSession {
  const { info, editor, serverUrl, token, me } = opts;
  // Kept with the what-if it belongs to, so switching drafts never shows the last one's (D-066).
  const [result, setResult] = useState<{ info: WhatIfInfo; c: Comparison } | null>(null);
  const comparison = result && result.info === info ? result.c : null;
  const [mainPeople, setMainPeople] = useState<string[]>([]);
  const mainRef = useRef<Y.Doc | null>(null);
  const baseRef = useRef<ScriptBlock[] | null>(null);
  const mainBlocksRef = useRef<ScriptBlock[]>([]);
  const sends = useRef<SendRecord[]>([]);
  const [, setTick] = useState(0);

  // Main, live, and the base snapshot.
  useEffect(() => {
    if (!info || !editor) return;
    let cancelled = false;
    const main = new Y.Doc();
    const awareness = new Awareness(main);
    awareness.setLocalState(null); // looking at main, not in it
    const client = new SyncClient({
      serverUrl,
      docId: info.mainDraftId,
      token,
      doc: main,
      awareness,
      socket: (url) => new WebSocket(url) as unknown as SocketLike,
    });
    mainRef.current = main;
    let frame = 0;
    let lastCount = -1;
    let report: ReturnType<typeof setTimeout> | undefined;
    const recompute = () => {
      frame = 0;
      if (cancelled || !client.caughtUp || !baseRef.current) return;
      const mainBlocks = blocksOfYDoc(main);
      mainBlocksRef.current = mainBlocks;
      const c = compareScenes({
        base: baseRef.current,
        whatIf: scriptBlocks(editor.view.state.doc),
        main: mainBlocks,
        sent: Object.fromEntries(sentOf(editor.ydoc).entries()),
      });
      setResult({ info, c });
      // The Drafts tab's "N scenes differ", for everyone else.
      const count = pendingScenes(c).length;
      if (count !== lastCount) {
        lastCount = count;
        clearTimeout(report);
        report = setTimeout(() => void reportScenesDiffer(info.id, count).catch(() => {}), 1500);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(recompute);
    };
    main.on('update', schedule);
    editor.ydoc.on('update', schedule);
    const unsubscribe = client.onChange(schedule);
    const people = () =>
      setMainPeople(
        [...awareness.getStates().values()]
          .map((s) => (s as { user?: { name?: string } }).user?.name)
          .filter((n): n is string => !!n),
      );
    awareness.on('change', people);
    void snapshotState(info.baseSnapshotId).then(
      (state) => {
        if (cancelled) return;
        baseRef.current = blocksOfState(state);
        schedule();
      },
      () => {},
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(report);
      main.off('update', schedule);
      editor.ydoc.off('update', schedule);
      unsubscribe();
      awareness.off('change', people);
      client.destroy();
      awareness.destroy();
      main.destroy();
      mainRef.current = null;
      baseRef.current = null;
      sends.current = [];
    };
  }, [info, editor, serverUrl, token]);

  const baseFor = useCallback(
    (sceneId: string) => {
      const record = editor && sentOf(editor.ydoc).get(sceneId);
      if (record) return record.blocks;
      return scenesOfBlocks(baseRef.current ?? []).find((s) => s.id === sceneId)?.blocks ?? null;
    },
    [editor],
  );
  const mainScene = useCallback(
    (sceneId: string) =>
      scenesOfBlocks(mainBlocksRef.current).find((s) => s.id === sceneId)?.blocks ?? null,
    [],
  );
  const lastEdit = useCallback((sceneId: string) => {
    const main = mainRef.current;
    return main ? (sceneEditsOf(main).get(sceneId) ?? null) : null;
  }, []);

  const send = useCallback(
    async (requested: string[]) => {
      const main = mainRef.current;
      if (!info || !editor || !main || !comparison) throw new Error('not ready');
      // Scenes that split or combined go together.
      const ids = [...new Set(requested.flatMap((id) => comparison.byId.get(id)?.group ?? [id]))];
      // 1. A restore point (shared by sends from this what-if within a few minutes).
      await createSnapshot(info.mainDraftId, Y.encodeStateAsUpdate(main), 'send', {
        fromDraftId: info.id,
      });
      // 2. Main takes the what-if's version of those scenes: an ordinary edit, undoable on its own.
      const whatIf = scriptBlocks(editor.view.state.doc);
      const origin = { send: ids };
      const undo = new Y.UndoManager(fragmentOf(main), {
        trackedOrigins: new Set([origin]),
        captureTimeout: 0,
      });
      writeBlocks(main, planSend(ids, whatIf, blocksOfYDoc(main)), origin);
      main.transact(() => {
        for (const id of ids) sceneEditsOf(main).set(id, { by: me, at: Date.now() });
      });
      // 3. The what-if remembers what it sent (so the dot goes, and comes back on a new edit).
      const sent = sentOf(editor.ydoc);
      const before = Object.fromEntries(ids.map((id) => [id, sent.get(id)]));
      editor.ydoc.transact(() => {
        for (const [id, record] of Object.entries(sentRecords(ids, whatIf))) sent.set(id, record);
      });
      const hashes = new Map(scenesOfBlocks(blocksOfYDoc(main)).map((s) => [s.id, s.hash]));
      sends.current.push({ undo, ids, before, after: hashes });
      setTick((t) => t + 1);
      const names = ids.map((id) => sceneName(comparison.byId.get(id)?.heading ?? ''));
      return { sent: ids, names };
    },
    [info, editor, comparison, me],
  );

  const undoCheck = useCallback((): 'none' | 'clean' | 'edited' => {
    const last = sends.current.at(-1);
    const main = mainRef.current;
    if (!last || !main) return 'none';
    const now = new Map(scenesOfBlocks(blocksOfYDoc(main)).map((s) => [s.id, s.hash]));
    return last.ids.some((id) => now.get(id) !== last.after.get(id)) ? 'edited' : 'clean';
  }, []);

  const undoSend = useCallback(() => {
    const last = sends.current.pop();
    if (!last || !editor) return;
    last.undo.undo();
    last.undo.destroy();
    const sent = sentOf(editor.ydoc);
    editor.ydoc.transact(() => {
      for (const [id, record] of Object.entries(last.before))
        if (record) sent.set(id, record);
        else sent.delete(id);
    });
    setTick((t) => t + 1);
  }, [editor]);

  const mainState = useCallback(() => {
    const main = mainRef.current;
    return main ? Y.encodeStateAsUpdate(main) : null;
  }, []);

  return {
    comparison,
    baseFor,
    mainScene,
    lastEdit,
    mainPeople,
    mainState,
    send,
    undoCheck,
    undoSend,
  };
}
