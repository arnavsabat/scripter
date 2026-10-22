// The script screen: toolbar, sidebar and page (SPEC 3.5-3.7). Single writer, local only.
import { useCallback, useState } from 'react';
import { Sidebar, type SidebarTab } from './components/Sidebar';
import { ToastProvider, useToast } from './components/Toast';
import { Toolbar } from './components/Toolbar';
import type { ScriptStore } from './editor/devStore';
import { handleMarginKey, topInPage } from './editor/marginKeys';
import { ScriptPage } from './editor/ScriptPage';
import { useScriptEditor } from './editor/useScriptEditor';
import './app.css';
import './script.css';

/** The one menu or popover open at a time; Esc closes it first (SPEC 3.9). */
export type Overlay =
  | null
  | { kind: 'draft' }
  | { kind: 'share' }
  | { kind: 'element'; top: number; highlighted: number }
  | { kind: 'warning'; blockId: string; top: number };

export function App({ store }: { store: ScriptStore }) {
  return (
    <ToastProvider>
      <ScriptScreen store={store} />
    </ToastProvider>
  );
}

function ScriptScreen({ store }: { store: ScriptStore }) {
  const toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<SidebarTab>('scenes');
  const [overlay, setOverlayState] = useState<Overlay>(null);
  const setOverlay = useCallback((o: Overlay) => setOverlayState(o), []);
  const handle = useScriptEditor(store, {
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

  return (
    <div className={`app${sidebarOpen ? '' : ' left-closed'}`}>
      <Toolbar
        title="Untitled script"
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          setOverlay(null);
          setSidebarOpen((open) => !open);
        }}
        overlay={overlay}
        setOverlay={setOverlay}
      />
      <div className="body">
        <Sidebar
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
