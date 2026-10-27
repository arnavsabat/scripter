// The left sidebar (SPEC 3.6): Scenes | Drafts. Scenes is a live list from the document; the
// selected row follows the cursor; clicking a row scrolls smoothly to that scene's heading. In a
// what-if each row ends with its dot or "Sent ✓", scenes the what-if deleted are listed where
// they were, and a legend sits at the bottom (D-080). Drafts is the panel the screen passes in.
import { sceneName, type Comparison } from '@wr/schema';
import type { ReactNode } from 'react';
import type { SceneRow } from '../editor/useScriptEditor';
import { Legend, SceneMarker } from '../whatif/WhatIfUI';

export type SidebarTab = 'scenes' | 'drafts';

interface Props {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  scenes: SceneRow[];
  currentSceneId: string | null;
  onJump: (sceneId: string) => void;
  /** In a what-if: the comparison with main (null while it loads). */
  comparison?: Comparison | null;
  drafts: ReactNode;
}

const TABS: [SidebarTab, string][] = [
  ['scenes', 'Scenes'],
  ['drafts', 'Drafts'],
];

export function Sidebar({ tab, onTab, scenes, currentSceneId, onJump, comparison, drafts }: Props) {
  // In a what-if, the comparison's order: the script's scenes, with deleted ones where they were.
  const rows: (SceneRow & { gone?: boolean })[] = comparison
    ? comparison.scenes.flatMap((c) => {
        const row = scenes.find((r) => r.sceneId === c.id);
        if (row) return [row];
        return c.inWhatIf || c.status === 'same'
          ? []
          : [{ sceneId: c.id, name: sceneName(c.heading), gone: true }];
      })
    : scenes;
  const listed = new Set(rows.map((r) => r.sceneId));
  for (const r of scenes) if (!listed.has(r.sceneId)) rows.push(r);
  return (
    <aside className="left" aria-label="Script navigator">
      <div className="in slide">
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`ta tab${tab === id ? ' on' : ''}`}
              data-t={label}
              onClick={() => onTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'scenes' ? (
          <>
            <div className="list" role="tabpanel" aria-label="Scenes">
              {rows.map((s) =>
                s.gone ? (
                  <div key={s.sceneId} className="row gone" title="Deleted in this what-if">
                    {s.name}
                    <SceneMarker state={comparison?.byId.get(s.sceneId)} />
                  </div>
                ) : (
                  <button
                    key={s.sceneId}
                    type="button"
                    className={`row${s.sceneId === currentSceneId ? ' sel' : ''}`}
                    aria-current={s.sceneId === currentSceneId ? 'location' : undefined}
                    onClick={() => onJump(s.sceneId)}
                  >
                    {s.name}
                    {comparison && <SceneMarker state={comparison.byId.get(s.sceneId)} />}
                  </button>
                ),
              )}
            </div>
            {comparison !== undefined && scenes.length > 0 && <Legend />}
          </>
        ) : (
          drafts
        )}
      </div>
    </aside>
  );
}
