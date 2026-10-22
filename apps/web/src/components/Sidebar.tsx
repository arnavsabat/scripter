// The left sidebar (SPEC 3.6): Scenes | Drafts. Scenes is a live list from the document; the
// selected row follows the cursor; clicking a row scrolls smoothly to that scene's heading.
// Drafts is a placeholder until what-ifs and snapshots arrive.
import type { PresenceUser } from '../editor/presence';
import type { SceneRow } from '../editor/useScriptEditor';
import { TextAction } from './TextAction';
import { useToast } from './Toast';

export type SidebarTab = 'scenes' | 'drafts';

interface Props {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  scenes: SceneRow[];
  currentSceneId: string | null;
  onJump: (sceneId: string) => void;
  others: PresenceUser[];
}

const TABS: [SidebarTab, string][] = [
  ['scenes', 'Scenes'],
  ['drafts', 'Drafts'],
];

export function Sidebar({ tab, onTab, scenes, currentSceneId, onJump, others }: Props) {
  const toast = useToast();
  return (
    <aside className="left" aria-label="Script navigator">
      <div className="in">
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
          <div className="list" role="tabpanel" aria-label="Scenes">
            {scenes.map((s) => (
              <button
                key={s.sceneId}
                type="button"
                className={`row${s.sceneId === currentSceneId ? ' sel' : ''}`}
                aria-current={s.sceneId === currentSceneId ? 'location' : undefined}
                onClick={() => onJump(s.sceneId)}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : (
          <div role="tabpanel" aria-label="Drafts">
            <div className="list">
              <button type="button" className="row big sel">
                <span>
                  <span style={{ fontWeight: 600 }}>Main</span>
                  <small>Editing now · {['You', ...others.map((u) => u.name)].join(', ')}</small>
                </span>
              </button>
              <div className="act">
                <TextAction
                  label="+ New what-if"
                  onClick={() => toast.show('What-ifs arrive in a later phase')}
                />
              </div>
            </div>
            <div className="lab">WHAT-IFS</div>
            <div className="lab r">
              <span>SNAPSHOTS</span>
              <TextAction
                label="+ Snapshot"
                onClick={() => toast.show('Snapshots arrive with what-ifs in a later phase')}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
