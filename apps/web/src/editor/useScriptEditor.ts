// Owns the editor's lifetime: loads the script, creates the editor, autosaves, and exposes the
// scene list and the cursor's scene to the sidebar.
import { sceneAt, sceneName, scenesOf, type Combine } from '@wr/schema';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { undo } from 'y-prosemirror';
import * as Y from 'yjs';
import { createEditor, seedNewScript, type EditorHooks, type ScriptEditor } from './createEditor';
import { autosave, type ScriptStore } from './devStore';

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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useScriptEditor(store: ScriptStore, handlers: ScriptEditorHandlers) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<ScriptEditor | null>(null);
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);

  // Effect Events always see the latest handlers without re-creating the editor.
  const onCombine = useEffectEvent(handlers.onCombine);
  const onKeyDown = useEffectEvent(handlers.onKeyDown);
  const onWarning = useEffectEvent(handlers.onWarning);
  const onChange = useEffectEvent(handlers.onChange);

  useEffect(() => {
    let cancelled = false;
    let created: ScriptEditor | null = null;
    let stopSaving: (() => void) | undefined;
    const ydoc = new Y.Doc();

    const sync = (view: EditorView, docChanged: boolean) => {
      const list = scenesOf(view.state.doc);
      const rows = list.map((s) => ({ sceneId: s.sceneId, name: sceneName(s.heading) }));
      setScenes((prev) => (sameRows(prev, rows) ? prev : rows));
      setCurrentSceneId(sceneAt(list, view.state.selection.from)?.sceneId ?? null);
      onChange(view, docChanged);
    };

    void store.load().then((saved) => {
      if (cancelled || !mountRef.current) return;
      if (saved) Y.applyUpdate(ydoc, saved);
      else seedNewScript(ydoc);
      const ed = createEditor(mountRef.current, ydoc, {
        onChange: sync,
        onCombine: (c) => onCombine(c, () => undo(ed.view.state)),
        onWarning: (id, anchor) => onWarning(id, anchor),
        onKeyDown: (view, event) => onKeyDown(view, event),
      });
      created = ed;
      stopSaving = autosave(ydoc, store);
      sync(ed.view, false);
      ed.view.focus();
      setEditor(ed);
    });

    return () => {
      cancelled = true;
      stopSaving?.();
      created?.destroy();
      ydoc.destroy();
    };
  }, [store]);

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

  return { mountRef, editor, scenes, currentSceneId, jumpTo };
}
