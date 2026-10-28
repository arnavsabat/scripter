// The script screen: toolbar, sidebar and page (SPEC 3.5-3.7). `App` wraps it with toasts for the tests.
import { pendingScenes, sceneAt, scenesOf } from '@wr/schema';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { undo as yUndo } from 'y-prosemirror';
import * as Y from 'yjs';
import { ApiFailure } from './api';
import { PanelBoundary } from './components/Boundary';
import { Sidebar, type SidebarTab } from './components/Sidebar';
import { ToastProvider, useToast } from './components/Toast';
import type { ShareContext } from './components/CoWriterMenu';
import { Toolbar, type EpisodeTitle } from './components/Toolbar';
import { handleMarginKey, topInPage } from './editor/marginKeys';
import { pagesKey } from './editor/pagesPlugin';
import { holdViewDuringToggle } from './editor/pageView';
import { exportPdf, pdfFileName } from './export/pdf';
import { ScriptPage } from './editor/ScriptPage';
import { useScriptEditor } from './editor/useScriptEditor';
import type { Session } from './session';
import { countUsage } from './usage';
import { blocksOfState, docOfBlocks } from './whatif/docs';
import {
  createSnapshot,
  createWhatIf,
  deleteDraft,
  listSnapshots,
  renameDraft,
  snapshotState,
  type DraftInfo,
  type SnapshotInfo,
} from './whatif/drafts';
import { useWhatIf, type WhatIfInfo } from './whatif/useWhatIf';
import { setWhatIfMarks } from './whatif/whatIfPlugin';
import { ComparePanel, DraftsTab, ReviewMenu, type DraftsContext } from './whatif/WhatIfUI';
import './app.css';
import './script.css';
import './home/home.css';

/** The one menu or popover open at a time; Esc closes it first (SPEC 3.9). */
export type Overlay =
  | null
  | { kind: 'draft' }
  | { kind: 'share' }
  | { kind: 'cowriter' }
  | { kind: 'element'; top: number; highlighted: number }
  | { kind: 'warning'; blockId: string; top: number }
  | { kind: 'review' }
  | { kind: 'dot'; sceneId: string; top: number };

export function App({ session }: { session: Session }) {
  return (
    <ToastProvider>
      <ScriptScreen session={session} />
    </ToastProvider>
  );
}

interface ScriptScreenProps {
  session: Session;
  /** The open episode's title (the tests' bare editor has none). */
  title?: EpisodeTitle;
  /** What Share works on (step 7); the tests' bare editor has none. */
  share?: ShareContext;
  onBack?: () => void;
  /** The server turned this connection away for good (4403 access changed, 4410 deleted…). */
  onFatal?: (reason: NonNullable<ReturnType<typeof useScriptEditor>['fatal']>) => void;
  /** What the exported PDF's title page and file are called (D-076). */
  exportInfo?: ExportInfo;
  /** The episode's drafts: main and its what-ifs (D-080). The tests' bare editor has none. */
  drafts?: DraftsContext;
}

export interface ExportInfo {
  title: string;
  episode?: string;
  fileParts: string[];
  /** The names for "Written by", looked up when someone exports. */
  writers: () => Promise<string[]>;
}

const FIREFOX_NOTE = 'wr-firefox-note';

export function ScriptScreen({
  session,
  title,
  share,
  onBack,
  onFatal,
  exportInfo,
  drafts,
}: ScriptScreenProps) {
  const toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<SidebarTab>('scenes');
  const [overlay, setOverlayState] = useState<Overlay>(null);
  const setOverlay = useCallback((o: Overlay) => setOverlayState(o), []);
  const canEdit = session.canEdit !== false;
  const current = drafts?.current;
  const mainDraftId = drafts?.list.find((d) => d.kind === 'main')?.id;
  // Plain values, so the what-if only changes identity when the draft does.
  const wiId = current?.kind === 'whatif' ? current.id : null;
  const wiName = current?.name ?? '';
  const wiBase = current?.baseSnapshotId ?? null;
  const whatIfInfo = useMemo<WhatIfInfo | null>(
    () =>
      wiId && wiBase && mainDraftId
        ? { id: wiId, name: wiName, baseSnapshotId: wiBase, mainDraftId }
        : null,
    [wiId, wiName, wiBase, mainDraftId],
  );
  const handle = useScriptEditor(session, {
    onCombine: (c, undo) => toast.show(`Scenes ${c.first} and ${c.second} combined`, undo),
    onKeyDown: (view, e) => {
      // ⌘↵ sends the cursor's scene, ⌘⇧↵ compares it (SPEC 3.9); Ctrl on Windows and Linux.
      if (whatIfInfo && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const scene = sceneAt(scenesOf(view.state.doc), view.state.selection.from);
        if (e.shiftKey) openCompare(scene?.sceneId ?? null);
        else trySend(scene?.sceneId ?? null);
        return true;
      }
      // Esc closes the topmost thing: popover or menu, then Review all, then Compare (SPEC 3.9).
      if (e.key === 'Escape' && (overlay?.kind === 'dot' || overlay?.kind === 'review')) {
        setOverlay(null);
        return true;
      }
      if (e.key === 'Escape' && compareOpen && !overlay) {
        closeCompare();
        return true;
      }
      return handleMarginKey(view, e, overlay, setOverlay);
    },
    onWarning: (blockId, anchor) => {
      const line = anchor.closest('.el');
      const top = line ? topInPage(line) : 0;
      setOverlay(overlay?.kind === 'warning' ? null : { kind: 'warning', blockId, top });
    },
    // Editing moves lines around, so a warning popover closes when the document changes.
    onChange: (_view, docChanged) => {
      if (docChanged && overlay?.kind === 'warning') setOverlay(null);
    },
  });

  // ---- What-ifs (SPEC 3.6, 3.9; D-080) ----
  const wi = useWhatIf({
    info: whatIfInfo,
    editor: handle.editor,
    serverUrl: session.serverUrl,
    token: session.token,
    me: drafts?.me.name ?? session.identity.name,
  });
  const [changes, setChanges] = useState(false);
  const [compare, setCompare] = useState(false);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const [pulse, setPulse] = useState<ReadonlySet<string>>(new Set());
  const compareOpen = compare && !!whatIfInfo;
  const comparison = whatIfInfo ? wi.comparison : undefined;

  const openCompare = (sceneId: string | null) => {
    if (!whatIfInfo) return;
    if (sceneId && sceneId !== handle.currentSceneId) handle.jumpTo(sceneId);
    // Room for the page beside the panel: the sidebar steps aside, and comes back on close.
    if (sidebarOpen && window.innerWidth < 1300) {
      holdViewDuringToggle(handle.editor?.view);
      setSidebarOpen(false);
      setAutoCollapsed(true);
    }
    setOverlay(null);
    setCompare(true);
  };
  const closeCompare = () => {
    setCompare(false);
    if (autoCollapsed) {
      holdViewDuringToggle(handle.editor?.view);
      setSidebarOpen(true);
      setAutoCollapsed(false);
    }
  };

  const undoSend = (names: string[]) => {
    const check = wi.undoCheck();
    if (check === 'none') return;
    const undoNow = () => {
      wi.undoSend();
      toast.show('Send undone');
    };
    // Someone changed the sent scenes in main since: say so before undoing (D-080, proposed).
    if (check === 'edited')
      toast.show(
        `${names.length === 1 ? `“${names[0]}” has` : 'Those scenes have'} changed in main since you sent ${names.length === 1 ? 'it' : 'them'}. Undo the send anyway?`,
        [
          { label: 'Undo anyway', run: undoNow },
          { label: 'Keep', run: () => {} },
        ],
      );
    else undoNow();
  };
  const doSend = async (ids: string[]) => {
    if (!canEdit) return toast.show('View only: you can’t send to main');
    setOverlay(null);
    try {
      const r = await wi.send(ids);
      countUsage('scene_sent', drafts?.episodeId, r.sent.length);
      setPulse(new Set(r.sent));
      setTimeout(() => setPulse(new Set()), 1300);
      toast.show(
        r.names.length === 1
          ? `“${r.names[0]}” sent to main`
          : `${r.names.length} scenes sent to main`,
        () => undoSend(r.names),
      );
    } catch {
      toast.show('Couldn’t send to main. Nothing was changed.');
    }
  };
  const trySend = (sceneId: string | null) => {
    const st = sceneId ? wi.comparison?.byId.get(sceneId) : undefined;
    if (!st || (st.status !== 'differs' && st.status !== 'conflict'))
      return toast.show('This scene has nothing to send');
    if (!canEdit) return toast.show('View only: you can’t send to main');
    // Amber scenes are never sent blind.
    if (st.status === 'conflict') {
      openCompare(st.id);
      return toast.show('Main changed this scene too, so compare it first');
    }
    void doSend([st.id]);
  };

  // The dots, pulse and Changes highlights, handed to the what-if's editor.
  const onDot = useCallback((sceneId: string, dot: HTMLElement) => {
    const line = dot.closest('.el');
    const top = line ? topInPage(line) : 0;
    setOverlayState((o) =>
      o?.kind === 'dot' && o.sceneId === sceneId ? null : { kind: 'dot', sceneId, top },
    );
  }, []);
  const activeDot =
    overlay?.kind === 'dot' ? overlay.sceneId : compareOpen ? handle.currentSceneId : null;
  useEffect(() => {
    const view = handle.editor?.view;
    if (!view || view.isDestroyed) return;
    view.dispatch(
      setWhatIfMarks(
        view.state.tr,
        whatIfInfo
          ? {
              comparison: wi.comparison,
              baseFor: wi.baseFor,
              changes,
              pulse,
              active: activeDot,
              onDot,
            }
          : null,
      ),
    );
  }, [handle.editor, whatIfInfo, wi.comparison, wi.baseFor, changes, pulse, activeDot, onDot]);

  // Esc from anywhere (focus may be in the Compare panel): Review all first, then Compare.
  useEffect(() => {
    if (!compareOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (overlay) setOverlay(null);
      else closeCompare();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // SNAPSHOTS for the open draft.
  const [snapshots, setSnapshots] = useState<{ draft: string; list: SnapshotInfo[] } | null>(null);
  const [snapshotsAsked, setSnapshotsAsked] = useState(0);
  useEffect(() => {
    if (!current || tab !== 'drafts') return;
    let live = true;
    listSnapshots(current.id).then(
      (list) => {
        if (live) setSnapshots({ draft: current.id, list });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [current, tab, snapshotsAsked]);
  const stateNow = () => (handle.editor ? Y.encodeStateAsUpdate(handle.editor.ydoc) : null);
  const newWhatIf = async () => {
    if (!drafts || !current) return;
    // Forked from main as it is now: this document if we're on main, the live copy otherwise.
    const state = current.kind === 'main' ? stateNow() : wi.mainState();
    if (!state) return toast.show('Main is still loading. Try again in a moment.');
    try {
      const d = await createWhatIf(drafts.episodeId, state);
      drafts.reload();
      drafts.open(d.id);
    } catch (err) {
      toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t start a what-if.');
    }
  };
  const takeSnapshot = async () => {
    const state = stateNow();
    if (!current || !state) return;
    try {
      await createSnapshot(current.id, state, 'manual');
      setSnapshotsAsked((n) => n + 1);
    } catch (err) {
      toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t take a snapshot.');
    }
  };
  const restore = async (snap: SnapshotInfo) => {
    const ed = handle.editor;
    const state = stateNow();
    if (!current || !ed || !state) return;
    try {
      // The draft as it is now is kept first, then the snapshot comes back as one ordinary edit.
      await createSnapshot(current.id, state, 'restore', { restoringId: snap.id });
      const blocks = blocksOfState(await snapshotState(snap.id));
      if (!blocks.length) return toast.show('That snapshot is empty.');
      const { view, undoManager } = ed;
      undoManager.stopCapturing();
      view.dispatch(
        view.state.tr.replaceWith(0, view.state.doc.content.size, docOfBlocks(blocks).content),
      );
      undoManager.stopCapturing();
      setSnapshotsAsked((n) => n + 1);
      toast.show(`Restored “${snap.label}”`, () => yUndo(view.state));
    } catch (err) {
      toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t restore that snapshot.');
    }
  };

  // Renaming and deleting what-ifs (D-080): whoever started one, or the showrunner.
  const renameWhatIf = (name: string) => {
    if (!current || current.kind !== 'whatif') return;
    renameDraft(current.id, name).then(
      () => drafts?.reload(),
      (err: unknown) => toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t rename it.'),
    );
  };
  const removeWhatIf = async (d: DraftInfo) => {
    if (!drafts) return;
    try {
      await deleteDraft(d.id);
      if (d.id === current?.id) drafts.open(null);
      drafts.reload();
      toast.show(`“${d.name}” deleted`);
    } catch (err) {
      toast.show(err instanceof ApiFailure ? err.message : 'Couldn’t delete it.');
    }
  };

  // Share › Export PDF: the pages exactly as page view shows them (D-076).
  const exportScript = async () => {
    const view = handle.editor?.view;
    const pagination = view && pagesKey.getState(view.state)?.pagination;
    if (!pagination) return;
    const fallback = typeof title === 'string' ? title : (title?.text ?? 'Untitled script');
    try {
      const writers = (await exportInfo?.writers().catch(() => [])) ?? [];
      await exportPdf(pagination, {
        titlePage: {
          title: exportInfo?.title ?? fallback,
          ...(exportInfo?.episode ? { episode: exportInfo.episode } : {}),
          writers,
        },
        fileName: pdfFileName(exportInfo?.fileParts ?? [fallback]),
      });
      countUsage('pdf_exported', drafts?.episodeId);
    } catch {
      toast.show('Couldn’t export the PDF. Please try again.');
    }
  };

  // Firefox wraps a few lines differently from pagination (D-089): say so once per browser.
  const opened = !!handle.editor;
  useEffect(() => {
    if (!opened || !/Firefox\//.test(navigator.userAgent)) return;
    try {
      if (localStorage.getItem(FIREFOX_NOTE)) return;
      localStorage.setItem(FIREFOX_NOTE, '1');
    } catch {
      return; // no storage: better never than every time
    }
    toast.show(
      'Writers’ Room works best in Chrome, Edge or Safari. In Firefox a few lines may wrap differently on screen; your PDF is always exact.',
    );
  }, [opened, toast]);

  const reportFatal = useEffectEvent((reason: NonNullable<typeof handle.fatal>) =>
    onFatal?.(reason),
  );
  useEffect(() => {
    if (handle.fatal) reportFatal(handle.fatal);
  }, [handle.fatal]);

  return (
    <div className={`app${sidebarOpen ? '' : ' left-closed'}${compareOpen ? ' right-open' : ''}`}>
      <Toolbar
        title={title ?? 'Untitled script'}
        {...(onBack ? { onBack } : {})}
        {...(share ? { share } : {})}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          setOverlay(null);
          holdViewDuringToggle(handle.editor?.view);
          setSidebarOpen((open) => !open);
        }}
        overlay={overlay}
        setOverlay={setOverlay}
        others={handle.others}
        cue={handle.cue}
        onExport={() => void exportScript()}
        {...(drafts && current
          ? {
              drafts: {
                label: current.kind === 'main' ? 'Main' : `Main › ${current.name}`,
                ...(current.kind === 'whatif'
                  ? {
                      whatIf: {
                        name: current.name,
                        onRename: drafts.canManage(current) ? renameWhatIf : null,
                      },
                    }
                  : {}),
                items: drafts.list.map((d) => ({
                  label: d.kind === 'main' ? 'Main' : d.name,
                  current: d.id === current.id,
                  onSelect: () => drafts.open(d.kind === 'main' ? null : d.id),
                })),
              },
            }
          : {})}
        {...(whatIfInfo
          ? {
              whatIf: {
                changes,
                onToggleChanges: () => setChanges((c) => !c),
                review: (
                  <PanelBoundary quiet>
                    <ReviewMenu
                      comparison={wi.comparison}
                      onSend={(ids) => void doSend(ids)}
                      onCompare={(id) => openCompare(id)}
                      onClose={() => setOverlay(null)}
                    />
                  </PanelBoundary>
                ),
              },
            }
          : {})}
      />
      <div className="body">
        <Sidebar
          tab={tab}
          onTab={setTab}
          scenes={handle.scenes}
          currentSceneId={handle.currentSceneId}
          onJump={handle.jumpTo}
          loading={!handle.editor}
          {...(comparison !== undefined ? { comparison } : {})}
          drafts={
            drafts && current ? (
              <DraftsTab
                drafts={drafts}
                people={
                  current.kind === 'main'
                    ? ['You', ...handle.others.map((u) => u.name)]
                    : wi.mainPeople
                }
                canEdit={canEdit}
                liveDiffer={wi.comparison ? pendingScenes(wi.comparison).length : null}
                snapshots={snapshots?.draft === current.id ? snapshots.list : null}
                onNewWhatIf={() => void newWhatIf()}
                onSnapshot={() => void takeSnapshot()}
                onRestore={(snap) => void restore(snap)}
                onDelete={(d) => void removeWhatIf(d)}
              />
            ) : (
              // No episode around it (the tests' bare editor): just main, and who's in it.
              <div role="tabpanel" aria-label="Drafts">
                <div className="list">
                  <button type="button" className="row big sel">
                    <span>
                      <span style={{ fontWeight: 600 }}>Main</span>
                      <small>
                        Editing now · {['You', ...handle.others.map((u) => u.name)].join(', ')}
                      </small>
                    </span>
                  </button>
                </div>
              </div>
            )
          }
        />
        <ScriptPage
          mountRef={handle.mountRef}
          view={handle.editor?.view}
          overlay={overlay}
          setOverlay={setOverlay}
          onSendScene={trySend}
          onCompareScene={(id) => openCompare(id)}
          waiting={handle.editor ? null : handle.cue === 'offline' ? 'offline' : 'loading'}
        />
        {whatIfInfo && (
          <aside className="right" aria-label="Compare">
            {compareOpen && (
              <PanelBoundary>
                <ComparePanel
                  scene={
                    (handle.currentSceneId && wi.comparison?.byId.get(handle.currentSceneId)) ||
                    null
                  }
                  mainScene={handle.currentSceneId ? wi.mainScene(handle.currentSceneId) : null}
                  base={handle.currentSceneId ? wi.baseFor(handle.currentSceneId) : null}
                  lastEdit={handle.currentSceneId ? wi.lastEdit(handle.currentSceneId) : null}
                  canSend={canEdit}
                  onSend={(id) => void doSend([id])}
                  onClose={closeCompare}
                  loading={!wi.comparison}
                />
              </PanelBoundary>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
