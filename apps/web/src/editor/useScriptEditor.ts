// Owns one open episode: the Y.Doc, its copy on this device (y-indexeddb, D-018 item 4), the
// editor, the connection to apps/sync, and presence. Exposes what the toolbar and sidebar show.
import { SyncClient, type Cue, type SocketLike } from '@wr/shared';
import { sceneAt, sceneName, scenesOf, type Combine } from '@wr/schema';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { undo } from 'y-prosemirror';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { localCopies } from '../localCopies';
import { trackSceneEdits } from '../whatif/sceneEdits';
import type { Session } from '../session';
import {
  FRAGMENT,
  createEditor,
  seedNewScript,
  type EditorHooks,
  type ScriptEditor,
} from './createEditor';
import { othersPresent, presenceUser, type PresenceUser } from './presence';

export interface SceneRow {
  sceneId: string;
  name: string;
}

export interface ScriptEditorHandlers {
  onCombine: (c: Combine, undoIt: () => void) => void;
  onKeyDown: EditorHooks['onKeyDown'];
  onWarning: EditorHooks['onWarning'];
  onChange: EditorHooks['onChange'];
}

const sameRows = (a: SceneRow[], b: SceneRow[]) =>
  a.length === b.length && a.every((r, i) => r.sceneId === b[i]!.sceneId && r.name === b[i]!.name);
const sameUsers = (a: PresenceUser[], b: PresenceUser[]) =>
  a.length === b.length && a.every((u, i) => u.userId === b[i]!.userId && u.name === b[i]!.name);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useScriptEditor(session: Session, handlers: ScriptEditorHandlers) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<ScriptEditor | null>(null);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const [cue, setCue] = useState<Cue>(null);
  /** A viewer on a what-if no writer has opened yet: nothing to show until one does (D-094). */
  const [unseeded, setUnseeded] = useState<Session | null>(null);
  /**
   * Why the server turned this connection away for good (4403, 4410…), for the page to act on.
   * Kept with its session: a new session starts clean, so a second refusal of the same kind
   * still reaches the page (D-066).
   */
  const [refusal, setRefusal] = useState<{ session: Session; fatal: SyncClient['fatal'] } | null>(
    null,
  );
  const fatal = refusal?.session === session ? refusal.fatal : null;

  // Effect Events always see the latest handlers without re-creating the editor.
  const onCombine = useEffectEvent(handlers.onCombine);
  const onKeyDown = useEffectEvent(handlers.onKeyDown);
  const onWarning = useEffectEvent(handlers.onWarning);
  const onChange = useEffectEvent(handlers.onChange);

  useEffect(() => {
    let cancelled = false;
    let created: ScriptEditor | null = null;
    let client: SyncClient | null = null;
    const cleanups: (() => void)[] = [];
    const ydoc = new Y.Doc();
    const awareness = new Awareness(ydoc);
    awareness.setLocalStateField('user', presenceUser(session.identity));
    const local = new IndexeddbPersistence(`wr-${session.docId}`, ydoc);

    const sync = (view: EditorView, docChanged: boolean) => {
      const list = scenesOf(view.state.doc);
      const rows = list.map((s) => ({ sceneId: s.sceneId, name: sceneName(s.heading) }));
      setScenes((prev) => (sameRows(prev, rows) ? prev : rows));
      setCurrentSceneId(sceneAt(list, view.state.selection.from)?.sceneId ?? null);
      onChange(view, docChanged);
    };

    // 1. This device's copy first, so the script (and any unsynced offline work) shows at once.
    void local.whenSynced.then(() => {
      if (cancelled || !mountRef.current) return;
      const mount = mountRef.current;

      // 2. Then the server: the handshake sends what it lacks and brings what we lack.
      client = new SyncClient({
        serverUrl: session.serverUrl,
        docId: session.docId,
        token: session.token,
        doc: ydoc,
        awareness,
        socket: (url) => new WebSocket(url) as unknown as SocketLike,
      });
      const c = client;
      const fragment = ydoc.getXmlFragment(FRAGMENT);
      let seeding = false;
      // On main, who changes each scene (Compare's "changed by", D-080).
      if (session.trackSceneEditsAs && session.canEdit !== false)
        cleanups.push(
          trackSceneEdits(
            ydoc,
            session.trackSceneEditsAs,
            (origin) => origin !== c && origin !== local,
          ),
        );

      // The editor needs a document to show. With no copy on this device yet, it waits for the
      // server's: opened on an empty document, it would write its placeholder line into Yjs,
      // and that line would merge into the script above the server's first line (D-074).
      const open = () => {
        if (created || cancelled) return;
        const ed = createEditor(
          mount,
          ydoc,
          awareness,
          {
            onChange: sync,
            onCombine: (comb) => onCombine(comb, () => undo(ed.view.state)),
            onWarning: (id, anchor) => onWarning(id, anchor),
            onKeyDown: (view, event) => onKeyDown(view, event),
          },
          session.canEdit !== false,
        );
        created = ed;
        sync(ed.view, false);
        // Ready to type, unless something else already has the keyboard (a new script's title,
        // waiting to be named).
        const active = document.activeElement;
        if (!active || active === document.body) ed.view.focus();
        setEditor(ed);
      };

      // Which of this browser's copies hold edits the server hasn't acknowledged (D-050).
      const noteLocalEdit = (_: Uint8Array, origin: unknown) => {
        if (origin !== c && origin !== local) localCopies.markUnsynced(session.docId);
      };
      ydoc.on('update', noteLocalEdit);
      cleanups.push(() => ydoc.off('update', noteLocalEdit));
      // Leaving while some of them aren't on the server yet: the browser's own "Leave site?"
      // prompt, since an incognito window or cleared site data takes the copy with it (D-069).
      const askBeforeLeaving = (e: BeforeUnloadEvent) => {
        if (localCopies.unsynced().includes(session.docId)) e.preventDefault();
      };
      window.addEventListener('beforeunload', askBeforeLeaving);
      cleanups.push(() => window.removeEventListener('beforeunload', askBeforeLeaving));
      cleanups.push(
        c.onChange(() => {
          setCue(c.cue);
          if (c.synced) localCopies.markSynced(session.docId);
          if (c.fatal) setRefusal({ session, fatal: c.fatal });
          if (!created && !seeding && c.caughtUp) {
            // A viewer can't seed it (that would be an edit): wait for a writer to (D-094).
            if (session.canEdit === false && session.seedState && fragment.length === 0) {
              setUnseeded(session);
              return;
            }
            const empty = session.canEdit !== false && fragment.length === 0;
            // A new what-if: its base snapshot of main. Applying it twice (two people opening
            // it at once) changes nothing: it's the same Yjs state either way (D-080).
            if (empty && session.seedState) {
              seeding = true;
              session.seedState().then(
                (state) => {
                  if (cancelled) return;
                  Y.applyUpdate(ydoc, state);
                  open();
                },
                () => {
                  if (!cancelled) open();
                },
              );
              return;
            }
            // A brand-new episode: the server has confirmed it's empty, so start with one action
            // line. Never from a view-only session: that would be an edit.
            if (empty) {
              seedNewScript(ydoc, session.seed);
              session.onSeeded?.();
            }
            open();
          }
        }),
      );
      const people = () =>
        setOthers((prev) => {
          const next = othersPresent(awareness, session.identity);
          return sameUsers(prev, next) ? prev : next;
        });
      awareness.on('change', people);
      cleanups.push(() => awareness.off('change', people));

      // The browser knows about network changes before a WebSocket does.
      const online = () => c.reconnectNow();
      const offline = () => c.dropConnection();
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      cleanups.push(() => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      });

      if (fragment.length > 0) open();
      // The writer seeded it while a viewer waited: show it now.
      const seeded = () => {
        if (!created && fragment.length > 0 && c.caughtUp) {
          setUnseeded(null);
          open();
        }
      };
      ydoc.on('update', seeded);
      cleanups.push(() => ydoc.off('update', seeded));
    });

    return () => {
      cancelled = true;
      for (const f of cleanups) f();
      client?.destroy();
      created?.destroy();
      void local.destroy();
      awareness.destroy();
      ydoc.destroy();
    };
  }, [session]);

  /** Scrolls smoothly to a scene's heading and puts the cursor there (SPEC 3.6). */
  const jumpTo = useCallback(
    (sceneId: string) => {
      if (!editor) return;
      const { view } = editor;
      const scene = scenesOf(view.state.doc).find((s) => s.sceneId === sceneId);
      if (!scene) return;
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, scene.pos + 1)),
      );
      view.focus();
      const el = view.nodeDOM(scene.pos);
      if (el instanceof HTMLElement)
        el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    },
    [editor],
  );

  return {
    mountRef,
    editor,
    scenes,
    currentSceneId,
    others,
    cue,
    fatal,
    jumpTo,
    unseeded: unseeded === session,
  };
}
