// The script screen: toolbar, sidebar and page (SPEC 3.5-3.7). `App` wraps it with toasts for the tests.
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { Sidebar, type SidebarTab } from './components/Sidebar';
import { ToastProvider, useToast } from './components/Toast';
import { Toolbar, type EpisodeTitle } from './components/Toolbar';
import { handleMarginKey, topInPage } from './editor/marginKeys';
import { ScriptPage } from './editor/ScriptPage';
import { useScriptEditor } from './editor/useScriptEditor';
import type { Session } from './session';
import './app.css';
import './script.css';
import './home/home.css';

/** The one menu or popover open at a time; Esc closes it first (SPEC 3.9). */
export type Overlay =
  | null
  | { kind: 'draft' }
  | { kind: 'share' }
  | { kind: 'element'; top: number; highlighted: number }
  | { kind: 'warning'; blockId: string; top: number };

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
  onBack?: () => void;
  /** The server turned this connection away for good (4403 access changed, 4410 deleted…). */
  onFatal?: (reason: NonNullable<ReturnType<typeof useScriptEditor>['fatal']>) => void;
}

export function ScriptScreen({ session, title, onBack, onFatal }: ScriptScreenProps) {
  const toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<SidebarTab>('scenes');
  const [overlay, setOverlayState] = useState<Overlay>(null);
  const setOverlay = useCallback((o: Overlay) => setOverlayState(o), []);
  const handle = useScriptEditor(session, {
    onCombine: (c, undo) => toast.show(`Scenes ${c.first} and ${c.second} combined`, undo),
    onKeyDown: (view, e) => handleMarginKey(view, e, overlay, setOverlay),
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

  const reportFatal = useEffectEvent((reason: NonNullable<typeof handle.fatal>) =>
    onFatal?.(reason),
  );
  useEffect(() => {
    if (handle.fatal) reportFatal(handle.fatal);
  }, [handle.fatal]);

  return (
    <div className={`app${sidebarOpen ? '' : ' left-closed'}`}>
      <Toolbar
        title={title ?? 'Untitled script'}
        {...(onBack ? { onBack } : {})}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          setOverlay(null);
          setSidebarOpen((open) => !open);
        }}
        overlay={overlay}
        setOverlay={setOverlay}
        others={handle.others}
        cue={handle.cue}
      />
      <div className="body">
        <Sidebar
          others={handle.others}
          tab={tab}
          onTab={setTab}
          scenes={handle.scenes}
          currentSceneId={handle.currentSceneId}
          onJump={handle.jumpTo}
        />
        <ScriptPage
          mountRef={handle.mountRef}
          view={handle.editor?.view}
          overlay={overlay}
          setOverlay={setOverlay}
        />
      </div>
    </div>
  );
}
